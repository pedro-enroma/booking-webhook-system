import { supabase } from '../config/supabase';
import * as fs from 'fs';
import * as path from 'path';

export interface WebhookLogEntry {
  id?: number;
  booking_id: string;
  parent_booking_id?: string;
  confirmation_code: string;
  action: string;
  status: string;
  webhook_type: 'BOOKING' | 'AVAILABILITY';
  received_at: string;
  processing_started_at?: string;
  processing_completed_at?: string;
  processing_duration_ms?: number;
  raw_payload: any;
  processing_result?: 'SUCCESS' | 'ERROR' | 'SKIPPED';
  error_message?: string;
  sequence_number?: number;
  is_duplicate?: boolean;
  previous_status?: string;
  new_status?: string;
  webhook_source_timestamp?: string;
  out_of_order?: boolean;
  related_webhooks?: string[];
}

export class WebhookLogger {
  private logDir: string;
  private detailedLogFile: string;
  private webhookSequence: Map<string, WebhookLogEntry[]> = new Map();

  constructor() {
    // Create logs directory
    this.logDir = path.join(process.cwd(), 'webhook-logs');
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    // Create detailed log file with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.detailedLogFile = path.join(this.logDir, `webhook-detailed-${timestamp}.log`);

    // Initialize log file
    this.writeToFile('='.repeat(80));
    this.writeToFile('WEBHOOK LOGGING SYSTEM INITIALIZED');
    this.writeToFile(`Start Time: ${new Date().toISOString()}`);
    this.writeToFile('='.repeat(80));
  }

  private writeToFile(message: string): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(this.detailedLogFile, logEntry);
  }

  async logWebhookReceived(data: any, webhookType: 'BOOKING' | 'AVAILABILITY'): Promise<WebhookLogEntry> {
    const receivedAt = new Date().toISOString();

    // Extract key identifiers
    const bookingId = data.bookingId || data.experienceId || 'UNKNOWN';
    const parentBookingId = data.parentBookingId || data.parentBooking?.bookingId;
    const confirmationCode = data.confirmationCode || data.parentBooking?.confirmationCode || 'N/A';
    const action = data.action || this.inferAction(data);
    const status = data.status || data.parentBooking?.status || 'UNKNOWN';

    // Create log entry
    const logEntry: WebhookLogEntry = {
      booking_id: bookingId.toString(),
      parent_booking_id: parentBookingId?.toString(),
      confirmation_code: confirmationCode,
      action: action,
      status: status,
      webhook_type: webhookType,
      received_at: receivedAt,
      raw_payload: data,
      webhook_source_timestamp: data.creationDate || data.timestamp
    };

    // Check for duplicates or out-of-order
    await this.analyzeWebhookSequence(logEntry);

    // Log to file with detailed formatting
    this.writeToFile('\n' + '='.repeat(80));
    this.writeToFile(`WEBHOOK RECEIVED: ${webhookType}`);
    this.writeToFile('-'.repeat(80));
    this.writeToFile(`Booking ID: ${bookingId}`);
    this.writeToFile(`Parent Booking ID: ${parentBookingId || 'N/A'}`);
    this.writeToFile(`Confirmation Code: ${confirmationCode}`);
    this.writeToFile(`Action: ${action}`);
    this.writeToFile(`Status: ${status}`);
    this.writeToFile(`Received At: ${receivedAt}`);

    if (logEntry.out_of_order) {
      this.writeToFile('⚠️ WARNING: WEBHOOK OUT OF ORDER!');
    }

    if (logEntry.is_duplicate) {
      this.writeToFile('⚠️ WARNING: DUPLICATE WEBHOOK DETECTED!');
    }

    // Log raw payload summary
    this.writeToFile('-'.repeat(40));
    this.writeToFile('RAW PAYLOAD SUMMARY:');
    this.writeToFile(JSON.stringify({
      action: data.action,
      status: data.status,
      bookingId: data.bookingId,
      parentBookingId: data.parentBookingId,
      productId: data.productId,
      startDateTime: data.startDateTime,
      title: data.title
    }, null, 2));

    // Store in database
    try {
      const { data: savedLog, error } = await supabase
        .from('webhook_logs')
        .insert({
          booking_id: logEntry.booking_id,
          parent_booking_id: logEntry.parent_booking_id,
          confirmation_code: logEntry.confirmation_code,
          action: logEntry.action,
          status: logEntry.status,
          webhook_type: logEntry.webhook_type,
          received_at: logEntry.received_at,
          raw_payload: logEntry.raw_payload,
          webhook_source_timestamp: logEntry.webhook_source_timestamp,
          out_of_order: logEntry.out_of_order,
          is_duplicate: logEntry.is_duplicate
        })
        .select()
        .single();

      if (error) {
        this.writeToFile(`ERROR saving to database: ${error.message}`);
      } else {
        logEntry.id = savedLog.id;
        this.writeToFile(`Saved to database with ID: ${savedLog.id}`);
      }
    } catch (error: any) {
      this.writeToFile(`ERROR: ${error.message}`);
    }

    return logEntry;
  }

  async logProcessingStart(logEntry: WebhookLogEntry): Promise<void> {
    const processingStartedAt = new Date().toISOString();
    logEntry.processing_started_at = processingStartedAt;

    this.writeToFile('-'.repeat(40));
    this.writeToFile(`PROCESSING STARTED for Booking ${logEntry.booking_id}`);
    this.writeToFile(`Start Time: ${processingStartedAt}`);

    // Update database
    if (logEntry.id) {
      await supabase
        .from('webhook_logs')
        .update({ processing_started_at: processingStartedAt })
        .eq('id', logEntry.id);
    }
  }

  async logProcessingComplete(
    logEntry: WebhookLogEntry,
    result: 'SUCCESS' | 'ERROR' | 'SKIPPED',
    errorMessage?: string,
    statusChange?: { from: string, to: string }
  ): Promise<void> {
    const processingCompletedAt = new Date().toISOString();
    logEntry.processing_completed_at = processingCompletedAt;
    logEntry.processing_result = result;

    if (logEntry.processing_started_at) {
      const duration = new Date(processingCompletedAt).getTime() -
                      new Date(logEntry.processing_started_at).getTime();
      logEntry.processing_duration_ms = duration;
    }

    if (errorMessage) {
      logEntry.error_message = errorMessage;
    }

    if (statusChange) {
      logEntry.previous_status = statusChange.from;
      logEntry.new_status = statusChange.to;
    }

    this.writeToFile('-'.repeat(40));
    this.writeToFile(`PROCESSING COMPLETED for Booking ${logEntry.booking_id}`);
    this.writeToFile(`Result: ${result}`);
    this.writeToFile(`End Time: ${processingCompletedAt}`);

    if (logEntry.processing_duration_ms) {
      this.writeToFile(`Duration: ${logEntry.processing_duration_ms}ms`);
    }

    if (statusChange) {
      this.writeToFile(`Status Change: ${statusChange.from} → ${statusChange.to}`);
    }

    if (errorMessage) {
      this.writeToFile(`ERROR: ${errorMessage}`);
    }

    this.writeToFile('='.repeat(80));

    // Update database
    if (logEntry.id) {
      await supabase
        .from('webhook_logs')
        .update({
          processing_completed_at: processingCompletedAt,
          processing_duration_ms: logEntry.processing_duration_ms,
          processing_result: result,
          error_message: errorMessage,
          previous_status: logEntry.previous_status,
          new_status: logEntry.new_status
        })
        .eq('id', logEntry.id);
    }
  }

  private async analyzeWebhookSequence(logEntry: WebhookLogEntry): Promise<void> {
    const bookingKey = `${logEntry.booking_id}-${logEntry.confirmation_code}`;

    // Get existing webhooks for this booking
    if (!this.webhookSequence.has(bookingKey)) {
      this.webhookSequence.set(bookingKey, []);
    }

    const sequence = this.webhookSequence.get(bookingKey)!;

    // Check for duplicates
    const duplicate = sequence.find(entry =>
      entry.action === logEntry.action &&
      entry.status === logEntry.status &&
      Math.abs(new Date(entry.received_at).getTime() - new Date(logEntry.received_at).getTime()) < 5000 // Within 5 seconds
    );

    if (duplicate) {
      logEntry.is_duplicate = true;
    }

    // Check for out-of-order webhooks
    // CANCELLATION should come after CONFIRMATION or UPDATE
    if (logEntry.action === 'BOOKING_ITEM_CANCELLED' || logEntry.status === 'CANCELLED') {
      const lastNonCancelled = sequence.findLast(entry =>
        entry.action !== 'BOOKING_ITEM_CANCELLED' && entry.status !== 'CANCELLED'
      );

      if (!lastNonCancelled) {
        // Cancellation came first - this is out of order!
        logEntry.out_of_order = true;
      }
    }

    // Check if UPDATE comes after CANCELLATION
    if (logEntry.action === 'BOOKING_UPDATED' && logEntry.status !== 'CANCELLED') {
      const hasCancellation = sequence.some(entry =>
        entry.action === 'BOOKING_ITEM_CANCELLED' || entry.status === 'CANCELLED'
      );

      if (hasCancellation) {
        // UPDATE after CANCELLATION - this might restore incorrect status!
        logEntry.out_of_order = true;
        this.writeToFile('⚠️ CRITICAL: UPDATE webhook received after CANCELLATION!');
      }
    }

    // Add to sequence
    sequence.push(logEntry);

    // Keep only last 10 webhooks per booking
    if (sequence.length > 10) {
      sequence.shift();
    }

    // Set sequence number
    logEntry.sequence_number = sequence.length;

    // Set related webhooks
    logEntry.related_webhooks = sequence.map(e => `${e.action}:${e.status}:${e.received_at}`);
  }

  private inferAction(data: any): string {
    if (!data.action) {
      if (data.status === 'CANCELLED') {
        return 'BOOKING_ITEM_CANCELLED';
      } else if (data.status === 'CONFIRMED') {
        return 'BOOKING_CONFIRMED';
      }
    }
    return data.action || 'UNKNOWN';
  }

  async getWebhookHistory(bookingId: string, limit: number = 10): Promise<any[]> {
    const { data, error } = await supabase
      .from('webhook_logs')
      .select('*')
      .or(`booking_id.eq.${bookingId},parent_booking_id.eq.${bookingId}`)
      .order('received_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching webhook history:', error);
      return [];
    }

    return data || [];
  }

  async detectOutOfOrderIssues(confirmationCode: string): Promise<any> {
    const { data, error } = await supabase
      .from('webhook_logs')
      .select('*')
      .eq('confirmation_code', confirmationCode)
      .order('received_at', { ascending: true });

    if (error || !data) {
      return null;
    }

    const issues = [];
    let lastStatus = null;
    let lastAction = null;

    for (const log of data) {
      // Check if CANCELLATION came before CONFIRMATION
      if (log.action === 'BOOKING_ITEM_CANCELLED' && !lastAction) {
        issues.push({
          type: 'CANCELLATION_FIRST',
          message: 'Cancellation webhook received before any confirmation',
          timestamp: log.received_at
        });
      }

      // Check if UPDATE came after CANCELLATION
      if (lastAction === 'BOOKING_ITEM_CANCELLED' && log.action === 'BOOKING_UPDATED') {
        issues.push({
          type: 'UPDATE_AFTER_CANCELLATION',
          message: 'Update webhook received after cancellation - status may be incorrect!',
          timestamp: log.received_at,
          previous_status: lastStatus,
          new_status: log.status
        });
      }

      lastStatus = log.status;
      lastAction = log.action;
    }

    return {
      confirmation_code: confirmationCode,
      total_webhooks: data.length,
      issues: issues,
      webhook_sequence: data.map(d => ({
        action: d.action,
        status: d.status,
        received_at: d.received_at
      }))
    };
  }

  getLogFilePath(): string {
    return this.detailedLogFile;
  }

  async generateReport(startDate?: Date, endDate?: Date): Promise<string> {
    const start = startDate || new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours
    const end = endDate || new Date();

    const { data, error } = await supabase
      .from('webhook_logs')
      .select('*')
      .gte('received_at', start.toISOString())
      .lte('received_at', end.toISOString())
      .order('received_at', { ascending: false });

    if (error || !data) {
      return 'Error generating report';
    }

    const report = [];
    report.push('WEBHOOK PROCESSING REPORT');
    report.push('=' .repeat(80));
    report.push(`Period: ${start.toISOString()} to ${end.toISOString()}`);
    report.push(`Total Webhooks: ${data.length}`);
    report.push('');

    // Count by type
    const byType = data.reduce((acc: any, log) => {
      acc[log.webhook_type] = (acc[log.webhook_type] || 0) + 1;
      return acc;
    }, {});

    report.push('By Type:');
    Object.entries(byType).forEach(([type, count]) => {
      report.push(`  ${type}: ${count}`);
    });
    report.push('');

    // Count by action
    const byAction = data.reduce((acc: any, log) => {
      acc[log.action] = (acc[log.action] || 0) + 1;
      return acc;
    }, {});

    report.push('By Action:');
    Object.entries(byAction).forEach(([action, count]) => {
      report.push(`  ${action}: ${count}`);
    });
    report.push('');

    // Find out-of-order webhooks
    const outOfOrder = data.filter(log => log.out_of_order);
    report.push(`Out of Order Webhooks: ${outOfOrder.length}`);

    if (outOfOrder.length > 0) {
      report.push('Out of Order Details:');
      outOfOrder.forEach(log => {
        report.push(`  - ${log.confirmation_code} (${log.action}) at ${log.received_at}`);
      });
    }
    report.push('');

    // Find duplicates
    const duplicates = data.filter(log => log.is_duplicate);
    report.push(`Duplicate Webhooks: ${duplicates.length}`);
    report.push('');

    // Processing errors
    const errors = data.filter(log => log.processing_result === 'ERROR');
    report.push(`Processing Errors: ${errors.length}`);

    if (errors.length > 0) {
      report.push('Error Details:');
      errors.forEach(log => {
        report.push(`  - ${log.confirmation_code}: ${log.error_message}`);
      });
    }

    return report.join('\n');
  }
}