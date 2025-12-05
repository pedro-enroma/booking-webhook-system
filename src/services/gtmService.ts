import { supabase } from '../config/supabase';
import { GTMWebhookPayload, GTMProcessingResult, GTMLogEntry } from '../types/gtm.types';
import * as crypto from 'crypto';

export class GTMService {
  private readonly PROCESSING_DELAY_MS = 5000; // 5 seconds delay for Bokun to create records first
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 2000;

  constructor() {
    console.log('🏷️ GTM Service initialized with 5-second safety delay');
  }

  /**
   * Process GTM webhook with built-in delay and comprehensive logging
   */
  async processGTMWebhook(payload: GTMWebhookPayload): Promise<GTMProcessingResult> {
    const startTime = Date.now();
    const transactionId = payload.ecommerce?.transaction_id;
    let affiliateId: string | undefined = payload.variables?.['TH - url - affiliate_id'];
    let firstCampaign: string | undefined = payload.variables?.['TH - url - first_campaign_id'];

    // RULE: Convert specific affiliate_id to "il-colosseo"
    if (affiliateId === '8463d56e1b524f509d8a3698feebcd0c') {
      console.log('🔄 Converting affiliate_id from 8463d56e1b524f509d8a3698feebcd0c to il-colosseo');
      affiliateId = 'il-colosseo';
    }

    // ===== AFFILIATE RESET LOGIC FOR CONTROL GROUP ANALYSIS =====
    const resetEnabled = process.env.AFFILIATE_RESET_ENABLED === 'true';
    const resetRate = parseFloat(process.env.AFFILIATE_RESET_RATE || '0.25');

    const originalAffiliateId = affiliateId;
    const originalCampaign = firstCampaign;
    let wasReset = false;

    if (resetEnabled && affiliateId && affiliateId !== '' && transactionId) {
      const resetResult = this.shouldResetAffiliate(transactionId, affiliateId, resetRate);

      if (resetResult.shouldReset) {
        console.log(`[AFFILIATE RESET] Transaction: ${transactionId}, Original: ${affiliateId} -> null (${(resetResult.hashValue * 100).toFixed(2)}%)`);
        affiliateId = undefined;
        firstCampaign = undefined;
        wasReset = true;
      } else {
        console.log(`[AFFILIATE KEPT] Transaction: ${transactionId}, Affiliate: ${affiliateId} (${(resetResult.hashValue * 100).toFixed(2)}%)`);
      }

      // Log to database for analysis (fire and forget)
      this.logAffiliateReset({
        transactionId,
        originalAffiliateId,
        originalCampaign,
        hashValue: resetResult.hashValue,
        threshold: resetRate,
        wasReset
      }).catch(err => {
        console.warn('Could not log affiliate reset:', err.message);
      });
    }
    
    // Initial validation
    if (!transactionId) {
      this.logEvent({
        timestamp: new Date().toISOString(),
        event_type: 'error',
        message: 'Missing transaction_id in ecommerce data',
        details: payload
      });
      
      throw new Error('transaction_id is required in ecommerce object');
    }

    // Log webhook received
    this.logEvent({
      timestamp: new Date().toISOString(),
      event_type: 'received',
      booking_id: transactionId,
      affiliate_id: affiliateId,
      first_campaign: firstCampaign,
      message: `GTM webhook received for transaction ${transactionId}`,
      details: {
        has_affiliate: !!affiliateId,
        has_campaign: !!firstCampaign,
        debug_mode: payload.debug,
        test_mode: payload.test_mode
      }
    });

    try {
      // Parse booking_id from transaction_id (it should be a number)
      const bookingId = this.parseBookingId(transactionId);
      
      console.log(`⏱️ Applying ${this.PROCESSING_DELAY_MS}ms delay to ensure Bokun webhook processes first...`);
      
      // Apply the 5-second delay
      await this.delay(this.PROCESSING_DELAY_MS);
      
      this.logEvent({
        timestamp: new Date().toISOString(),
        event_type: 'processing',
        booking_id: transactionId,
        message: `Starting search for booking_id ${bookingId} after delay`,
        details: { delay_ms: this.PROCESSING_DELAY_MS }
      });

      // Try to find and update the activity booking with retries
      let recordsUpdated = 0;
      let retryCount = 0;
      let found = false;
      
      while (retryCount < this.MAX_RETRIES && !found) {
        const result = await this.findAndUpdateActivityBooking(
          bookingId,
          affiliateId,
          firstCampaign,
          retryCount
        );
        
        if (result.found) {
          found = true;
          recordsUpdated = result.updated;
        } else {
          retryCount++;
          if (retryCount < this.MAX_RETRIES) {
            console.log(`🔄 Retry ${retryCount}/${this.MAX_RETRIES} - waiting ${this.RETRY_DELAY_MS}ms...`);
            await this.delay(this.RETRY_DELAY_MS);
          }
        }
      }

      const processingTime = Date.now() - startTime;
      
      // Log completion
      this.logEvent({
        timestamp: new Date().toISOString(),
        event_type: found ? 'completed' : 'error',
        booking_id: transactionId,
        affiliate_id: affiliateId,
        first_campaign: firstCampaign,
        message: found 
          ? `Successfully updated ${recordsUpdated} activity booking(s) for booking ${bookingId}`
          : `No activity bookings found for booking ${bookingId} after ${retryCount} retries`,
        duration_ms: processingTime,
        details: {
          records_updated: recordsUpdated,
          retries_used: retryCount,
          total_delay: this.PROCESSING_DELAY_MS + (retryCount * this.RETRY_DELAY_MS)
        }
      });

      return {
        success: found,
        booking_id: bookingId,
        activity_booking_updated: found,
        // Return ORIGINAL values in response to hide the reset from external observers
        affiliate_id: originalAffiliateId,
        first_campaign: originalCampaign,
        records_updated: recordsUpdated,
        processing_time_ms: processingTime,
        delay_applied_ms: this.PROCESSING_DELAY_MS,
        warning: !found ? `No activity bookings found for booking_id ${bookingId} after ${retryCount} retries` : undefined
      };
      
    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      
      this.logEvent({
        timestamp: new Date().toISOString(),
        event_type: 'error',
        booking_id: transactionId,
        message: `Error processing GTM webhook: ${error.message}`,
        duration_ms: processingTime,
        details: {
          error: error.message,
          stack: error.stack
        }
      });

      throw error;
    }
  }

  /**
   * Find and update activity bookings with affiliate and campaign data
   */
  private async findAndUpdateActivityBooking(
    bookingId: number,
    affiliateId?: string,
    firstCampaign?: string,
    retryNumber: number = 0
  ): Promise<{ found: boolean; updated: number }> {
    
    try {
      // First, search for activity bookings with this booking_id
      this.logEvent({
        timestamp: new Date().toISOString(),
        event_type: 'searching',
        booking_id: bookingId.toString(),
        message: `Searching for activity_bookings with booking_id=${bookingId} (attempt ${retryNumber + 1})`,
        details: { retry_number: retryNumber }
      });

      const { data: activities, error: searchError } = await supabase
        .from('activity_bookings')
        .select('activity_booking_id, booking_id, product_title, status')
        .eq('booking_id', bookingId);

      if (searchError) {
        console.error('❌ Error searching activity_bookings:', searchError);
        throw searchError;
      }

      if (!activities || activities.length === 0) {
        console.log(`⚠️ No activity bookings found for booking_id ${bookingId}`);
        return { found: false, updated: 0 };
      }

      console.log(`✅ Found ${activities.length} activity booking(s) for booking_id ${bookingId}`);
      
      // Update all found activity bookings with affiliate and campaign data
      for (const activity of activities) {
        this.logEvent({
          timestamp: new Date().toISOString(),
          event_type: 'updating',
          booking_id: bookingId.toString(),
          affiliate_id: affiliateId,
          first_campaign: firstCampaign,
          message: `Updating activity_booking_id ${activity.activity_booking_id}`,
          details: {
            product_title: activity.product_title,
            status: activity.status,
            has_affiliate: !!affiliateId,
            has_campaign: !!firstCampaign
          }
        });

        const updateData: any = {};
        if (affiliateId) updateData.affiliate_id = affiliateId;
        if (firstCampaign) updateData.first_campaign = firstCampaign;
        
        // Only update if we have data to update
        if (Object.keys(updateData).length > 0) {
          const { error: updateError } = await supabase
            .from('activity_bookings')
            .update(updateData)
            .eq('activity_booking_id', activity.activity_booking_id);

          if (updateError) {
            console.error(`❌ Error updating activity_booking ${activity.activity_booking_id}:`, updateError);
            throw updateError;
          }
          
          console.log(`✅ Updated activity_booking ${activity.activity_booking_id} with:`, updateData);
        }
      }

      return { found: true, updated: activities.length };
      
    } catch (error) {
      console.error('❌ Error in findAndUpdateActivityBooking:', error);
      throw error;
    }
  }

  /**
   * Parse booking ID from transaction ID
   */
  private parseBookingId(transactionId: string): number {
    // Remove any prefixes or suffixes if present
    // Transaction ID might be like "BOOKING-123456" or just "123456"
    const numericPart = transactionId.replace(/[^0-9]/g, '');
    
    if (!numericPart) {
      throw new Error(`Invalid transaction_id format: ${transactionId}`);
    }
    
    const bookingId = parseInt(numericPart, 10);
    
    if (isNaN(bookingId)) {
      throw new Error(`Could not parse booking_id from transaction_id: ${transactionId}`);
    }
    
    return bookingId;
  }

  /**
   * Delay helper function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Log events for tracking (visible in Railway logs)
   */
  private logEvent(entry: GTMLogEntry): void {
    const logPrefix = '🏷️ [GTM]';
    const formattedLog = {
      ...entry,
      service: 'GTMService',
      environment: process.env.NODE_ENV || 'development'
    };
    
    // Log to console for Railway
    switch (entry.event_type) {
      case 'error':
        console.error(logPrefix, JSON.stringify(formattedLog, null, 2));
        break;
      case 'completed':
        console.log(`${logPrefix} ✅`, JSON.stringify(formattedLog, null, 2));
        break;
      default:
        console.log(logPrefix, JSON.stringify(formattedLog, null, 2));
    }
    
    // Optionally, also save to database for persistence
    this.saveLogToDatabase(formattedLog).catch(err => {
      console.warn('Could not save log to database:', err.message);
    });
  }

  /**
   * Save logs to database for persistence and debugging
   */
  private async saveLogToDatabase(logEntry: any): Promise<void> {
    try {
      // Check if gtm_logs table exists first
      const { error } = await supabase
        .from('gtm_logs')
        .insert({
          timestamp: logEntry.timestamp,
          event_type: logEntry.event_type,
          booking_id: logEntry.booking_id,
          affiliate_id: logEntry.affiliate_id,
          first_campaign: logEntry.first_campaign,
          message: logEntry.message,
          details: logEntry.details,
          duration_ms: logEntry.duration_ms
        });

      // Silently fail if table doesn't exist
      if (error && !error.message.includes('relation "gtm_logs" does not exist')) {
        console.warn('GTM log save error:', error.message);
      }
    } catch {
      // Silently fail - logging should not break the main flow
    }
  }

  /**
   * Determine if affiliate should be reset for control group analysis
   * Uses deterministic MD5 hash so same transaction always gets same result
   */
  private shouldResetAffiliate(
    transactionId: string,
    affiliateId: string,
    threshold: number
  ): { shouldReset: boolean; hashValue: number } {
    const secretSalt = 'pedro_salt_2024_dicembre';

    const hash = crypto
      .createHash('md5')
      .update(transactionId + affiliateId + secretSalt)
      .digest('hex');

    // Convert first 8 hex chars to number between 0 and 1
    const hashValue = parseInt(hash.substring(0, 8), 16) / 0xffffffff;

    return {
      shouldReset: hashValue < threshold,
      hashValue
    };
  }

  /**
   * Log affiliate reset decision to database for analysis
   */
  private async logAffiliateReset(data: {
    transactionId: string;
    originalAffiliateId?: string;
    originalCampaign?: string;
    hashValue: number;
    threshold: number;
    wasReset: boolean;
  }): Promise<void> {
    try {
      const { error } = await supabase
        .from('affiliate_reset_log')
        .insert({
          transaction_id: data.transactionId,
          original_affiliate_id: data.originalAffiliateId,
          original_campaign: data.originalCampaign,
          reset_value: data.hashValue,
          threshold: data.threshold,
          was_reset: data.wasReset
        });

      if (error && !error.message.includes('relation "affiliate_reset_log" does not exist')) {
        console.warn('Affiliate reset log save error:', error.message);
      }
    } catch {
      // Silently fail - logging should not break the main flow
    }
  }
}