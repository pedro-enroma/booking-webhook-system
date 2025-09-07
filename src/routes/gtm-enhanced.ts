import { Router, Request, Response } from 'express';
import { GTMService } from '../services/gtmService';
import { GTMWebhookPayload } from '../types/gtm.types';
import * as crypto from 'crypto';

// Extended type for enhanced payload
interface EnhancedGTMPayload extends GTMWebhookPayload {
  consent_mode?: string;
  transaction_id?: string;
  direct_tracking?: boolean;
}

const router = Router();
const gtmService = new GTMService();

/**
 * Enhanced GTM webhook that works with CookieYes consent mode
 * This version handles:
 * - Missing consent scenarios
 * - Fallback data sources
 * - Client-side AND server-side tracking
 */
router.post('/webhook/gtm-enhanced', async (req: Request, res: Response) => {
  const requestId = crypto.randomBytes(8).toString('hex');
  const startTime = Date.now();
  
  console.log('\n' + '='.repeat(70));
  console.log(`🏷️ [GTM-Enhanced-${requestId}] Webhook received at ${new Date().toISOString()}`);
  console.log('='.repeat(70));
  
  try {
    // Parse the payload - handle different structures
    let payload: EnhancedGTMPayload;
    
    // Check if this is a direct client-side call (bypass consent mode)
    if (req.body.direct_tracking) {
      console.log('📱 Direct client-side tracking detected (bypasses consent mode)');
      payload = {
        ecommerce: {
          transaction_id: req.body.transaction_id || req.body.booking_id,
          value: req.body.value,
          currency: req.body.currency || 'EUR'
        },
        variables: {
          'TH - url - affiliate_id': req.body.affiliate_id,
          'TH - url - first_campaign_id': req.body.first_campaign
        },
        event_name: 'purchase',
        client_id: req.body.client_id || 'direct-client',
        consent_mode: req.body.consent_mode || 'unknown',
        debug: req.body.debug || false
      };
    } else {
      // Standard GTM server-side payload
      payload = req.body;
    }
    
    // Log consent status
    console.log('🔐 Consent Mode Status:');
    console.log('- Analytics Storage:', req.body.consent?.analytics_storage || 'unknown');
    console.log('- Ad Storage:', req.body.consent?.ad_storage || 'unknown');
    console.log('- CookieYes Consent:', req.body.cookieyes_consent || 'unknown');
    
    // Extract data with multiple fallbacks
    const transactionId = 
      payload.ecommerce?.transaction_id || 
      payload.transaction_id ||
      req.body.gtm?.transaction_id ||
      req.body.dataLayer?.transaction_id;
    
    // Try to get affiliate_id from multiple sources
    let affiliateId = 
      payload.variables?.['TH - url - affiliate_id'] ||
      req.body.affiliate_id ||
      req.body.url_parameters?.affiliate_id ||
      req.body.query_params?.affiliate_id ||
      req.body.page_location?.match(/affiliate_id=([^&]+)/)?.[1];
    
    // Try to get first_campaign from multiple sources  
    let firstCampaign = 
      payload.variables?.['TH - url - first_campaign_id'] ||
      req.body.first_campaign ||
      req.body.url_parameters?.first_campaign_id ||
      req.body.query_params?.first_campaign_id ||
      req.body.page_location?.match(/first_campaign_id=([^&]+)/)?.[1];
    
    console.log('📊 Extracted Data:');
    console.log('- Transaction ID:', transactionId);
    console.log('- Affiliate ID:', affiliateId || 'not found');
    console.log('- First Campaign:', firstCampaign || 'not found');
    console.log('- Source:', req.body.direct_tracking ? 'Direct Client' : 'GTM Server');
    
    // Validate transaction ID
    if (!transactionId) {
      console.error('❌ Missing transaction_id in all possible locations');
      return res.status(400).json({
        success: false,
        error: 'Missing transaction_id',
        request_id: requestId,
        checked_locations: [
          'ecommerce.transaction_id',
          'transaction_id',
          'gtm.transaction_id', 
          'dataLayer.transaction_id'
        ]
      });
    }
    
    // Check if we have any data to update
    if (!affiliateId && !firstCampaign) {
      console.warn('⚠️ No tracking data found - checking localStorage fallback');
      
      // Send response asking client to retry with localStorage data
      return res.status(200).json({
        success: false,
        needs_client_retry: true,
        message: 'No tracking data found. Client should retry with localStorage data.',
        request_id: requestId,
        transaction_id: transactionId
      });
    }
    
    // RULE: Convert specific affiliate_id to "il-colosseo"
    if (affiliateId === '8463d56e1b524f509d8a3698feebcd0c') {
      console.log('🔄 Converting affiliate_id to il-colosseo');
      affiliateId = 'il-colosseo';
    }
    
    // Process with enhanced payload
    const enhancedPayload: GTMWebhookPayload = {
      ...payload,
      ecommerce: {
        ...payload.ecommerce,
        transaction_id: transactionId
      },
      variables: {
        ...payload.variables,
        'TH - url - affiliate_id': affiliateId,
        'TH - url - first_campaign_id': firstCampaign
      }
    };
    
    console.log(`🔄 Processing webhook for transaction: ${transactionId}`);
    const result = await gtmService.processGTMWebhook(enhancedPayload);
    
    const processingTime = Date.now() - startTime;
    
    // Log result
    console.log('='.repeat(70));
    if (result.success) {
      console.log(`✅ [GTM-Enhanced-${requestId}] Successfully processed`);
      console.log(`- Records Updated: ${result.records_updated}`);
      console.log(`- Processing Time: ${processingTime}ms`);
    } else {
      console.warn(`⚠️ [GTM-Enhanced-${requestId}] Processed with warnings`);
      console.log(`- Warning: ${result.warning}`);
    }
    console.log('='.repeat(70) + '\n');
    
    return res.status(200).json({
      ...result,
      request_id: requestId,
      processing_time_ms: processingTime,
      consent_mode_handled: true
    });
    
  } catch (error: any) {
    console.error(`❌ [GTM-Enhanced-${requestId}] Error:`, error.message);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      request_id: requestId,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Client-side fallback endpoint
 * This can be called directly from JavaScript when GTM fails due to consent
 */
router.post('/webhook/tracking-fallback', async (req: Request, res: Response) => {
  const requestId = crypto.randomBytes(8).toString('hex');
  
  console.log(`🔄 [Fallback-${requestId}] Direct tracking fallback received`);
  
  try {
    // Extract from localStorage/sessionStorage data sent by client
    const bookingId = req.body.booking_id || req.body.transaction_id;
    const affiliateId = req.body.affiliate_id || req.body.localStorage?.affiliate_id;
    const firstCampaign = req.body.first_campaign || req.body.localStorage?.first_campaign_id;
    
    if (!bookingId) {
      return res.status(400).json({
        success: false,
        error: 'Missing booking_id or transaction_id'
      });
    }
    
    // Create a minimal payload for processing
    const fallbackPayload: EnhancedGTMPayload = {
      ecommerce: {
        transaction_id: bookingId.toString(),
        value: 0,
        currency: 'EUR'
      },
      variables: {
        'TH - url - affiliate_id': affiliateId,
        'TH - url - first_campaign_id': firstCampaign
      },
      event_name: 'purchase_fallback',
      client_id: 'fallback-client',
      consent_mode: 'denied',
      debug: false
    };
    
    const result = await gtmService.processGTMWebhook(fallbackPayload);
    
    return res.status(200).json({
      request_id: requestId,
      fallback_mode: true,
      ...result
    });
    
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
      request_id: requestId
    });
  }
});

export default router;