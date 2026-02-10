/**
 * Stripe Webhook Routes
 * Handles Stripe events for refunds and sends RIMBOK movimento to Partner Solution
 */

import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import axios from 'axios';
import { supabase } from '../config/supabase';
import { invoiceService } from '../services/invoiceService';
import {
  isOffloadEnabled,
  uploadPayload,
  buildPayloadSummary,
  incrementMetric,
} from '../services/payloadStorage';

const router = express.Router();

// Initialize Stripe (only if key is configured)
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

// Webhook secret for signature verification
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

interface InvoiceRule {
  id: string;
  name: string;
  sellers: string[];
  auto_credit_note_enabled: boolean;
  credit_note_trigger: 'cancellation' | 'refund';
}

/**
 * Find the rule that applies to a seller
 */
async function findRuleForSeller(seller: string): Promise<InvoiceRule | null> {
  const { data: rules, error } = await supabase
    .from('invoice_rules')
    .select('*');

  if (error || !rules) {
    console.error('[Stripe] Error fetching rules:', error);
    return null;
  }

  for (const rule of rules) {
    if (rule.sellers && rule.sellers.includes(seller)) {
      return rule as InvoiceRule;
    }
  }

  return null;
}

/**
 * Get booking by ID or confirmation code
 */
async function getBooking(bookingId?: number, confirmationCode?: string) {
  if (bookingId) {
    const { data } = await supabase
      .from('bookings')
      .select('booking_id, confirmation_code, total_price, currency')
      .eq('booking_id', bookingId)
      .single();
    return data;
  }

  if (confirmationCode) {
    const { data } = await supabase
      .from('bookings')
      .select('booking_id, confirmation_code, total_price, currency')
      .eq('confirmation_code', confirmationCode)
      .single();
    return data;
  }

  return null;
}

/**
 * Get seller for a booking
 */
async function getSellerForBooking(bookingId: number): Promise<string | null> {
  const { data } = await supabase
    .from('activity_bookings')
    .select('activity_seller')
    .eq('booking_id', bookingId)
    .limit(1);

  return data?.[0]?.activity_seller || null;
}

/**
 * Check if credit note already exists
 */
async function hasCreditNote(bookingId: number): Promise<boolean> {
  const { data } = await supabase
    .from('invoices')
    .select('id')
    .eq('booking_id', bookingId)
    .eq('invoice_type', 'CREDIT_NOTE')
    .limit(1);

  return (data && data.length > 0) || false;
}

/**
 * Check if invoice exists for booking
 */
async function hasInvoice(bookingId: number): Promise<boolean> {
  const { data } = await supabase
    .from('invoices')
    .select('id')
    .eq('booking_id', bookingId)
    .eq('invoice_type', 'INVOICE')
    .limit(1);

  return (data && data.length > 0) || false;
}

/**
 * Get invoice with PS pratica info
 */
async function getInvoiceWithPratica(bookingId: number) {
  const { data } = await supabase
    .from('invoices')
    .select('id, ps_pratica_iri, ps_commessa_code, total_amount')
    .eq('booking_id', bookingId)
    .eq('invoice_type', 'INVOICE')
    .single();

  return data;
}

/**
 * Authenticate to Partner Solution and get client
 */
async function getPSClient() {
  const apiUrl = process.env.PARTNER_SOLUTION_API_URL || 'https://catture.partnersolution.it';
  const username = process.env.PARTNER_SOLUTION_USERNAME;
  const password = process.env.PARTNER_SOLUTION_PASSWORD;

  if (!username || !password) {
    throw new Error('Partner Solution credentials not configured');
  }

  const params = new URLSearchParams();
  params.append('_username', username);
  params.append('_password', password);

  const loginResponse = await axios.post(`${apiUrl}/login_check`, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' }
  });

  const token = loginResponse.data.token;

  return axios.create({
    baseURL: apiUrl,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/ld+json',
      'Accept': 'application/ld+json'
    }
  });
}

/**
 * Send RIMBOK movimento to Partner Solution for refund
 */
async function sendRefundToPS(
  bookingId: number,
  refundAmount: number
): Promise<{ success: boolean; movimentoIri?: string; error?: string }> {
  try {
    const invoice = await getInvoiceWithPratica(bookingId);

    if (!invoice?.ps_pratica_iri) {
      console.log(`[Stripe] No pratica found for booking ${bookingId}, skipping PS refund`);
      return { success: true }; // Not an error, just no pratica to refund
    }

    console.log(`[Stripe] Sending RIMBOK movimento to PS for booking ${bookingId}, amount: €${refundAmount}`);

    const client = await getPSClient();
    const agencyCode = process.env.PARTNER_SOLUTION_AGENCY_CODE || '7206';
    const bookingIdPadded = bookingId.toString().padStart(9, '0');
    const now = new Date().toISOString();
    const dateOnly = now.split('T')[0];

    // Create refund movimento with tipomovimento: 'I' and codcausale: 'RIMBOK'
    const movimentoResponse = await client.post('/mov_finanziarios', {
      externalid: bookingIdPadded,
      tipomovimento: 'I',
      codicefile: bookingIdPadded,
      codiceagenzia: agencyCode,
      tipocattura: 'PS',
      importo: -Math.abs(refundAmount),  // Always negative for refunds
      datacreazione: now,
      datamodifica: now,
      datamovimento: dateOnly,
      stato: 'INS',
      codcausale: 'RIMBOK',
      descrizione: `Rimborso - Booking ${bookingId}`
    });

    const movimentoIri = movimentoResponse.data['@id'];
    console.log(`[Stripe] RIMBOK movimento created: ${movimentoIri}`);

    // Update invoice record with refund movimento IRI
    await supabase
      .from('invoices')
      .update({
        ps_refund_movimento_iri: movimentoIri,
        updated_at: now
      })
      .eq('id', invoice.id);

    return { success: true, movimentoIri };
  } catch (error) {
    const err = error as any;
    const errorMsg = err.response?.data?.['hydra:description'] || err.message;
    console.error(`[Stripe] Failed to send RIMBOK to PS:`, errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Log webhook to database
 */
async function logStripeWebhook(
  eventType: string,
  eventId: string,
  bookingId: number | null,
  confirmationCode: string | null,
  status: 'SUCCESS' | 'ERROR' | 'SKIPPED',
  message: string,
  rawPayload: any
) {
  try {
    const insertData: any = {
      booking_id: bookingId?.toString() || null,
      confirmation_code: confirmationCode || 'N/A',
      action: eventType,
      status: status,
      webhook_type: 'STRIPE',
      received_at: new Date().toISOString(),
      processing_completed_at: new Date().toISOString(),
      processing_result: status,
      raw_payload: rawPayload,
      error_message: status === 'ERROR' ? message : null,
    };

    // Payload offloading (when enabled)
    if (isOffloadEnabled()) {
      try {
        const { storageKey, checksum } = await uploadPayload(
          rawPayload,
          bookingId?.toString() || eventId,
          'STRIPE'
        );
        insertData.raw_payload = buildPayloadSummary(rawPayload);
        insertData.payload_storage_key = storageKey;
        insertData.payload_checksum = checksum;
        await incrementMetric('upload_success');
      } catch (uploadError: any) {
        await incrementMetric('upload_failure', uploadError.message);
        console.warn('[Stripe] Storage upload failed, storing full payload in DB:', uploadError.message);
      }
    }

    await supabase.from('webhook_logs').insert(insertData);
  } catch (error) {
    console.error('[Stripe] Failed to log webhook:', error);
  }
}

/**
 * Process refund and create credit note
 */
async function processRefund(
  bookingId: number,
  refundAmount: number | null,
  currency: string,
  eventId: string,
  rawPayload: any
): Promise<{ success: boolean; message: string; movimentoIri?: string }> {
  const booking = await getBooking(bookingId);

  if (!booking) {
    await logStripeWebhook('charge.refunded', eventId, bookingId, null, 'ERROR', 'Booking not found', rawPayload);
    return { success: false, message: 'Booking not found' };
  }

  // Check if credit note already exists
  if (await hasCreditNote(bookingId)) {
    await logStripeWebhook('charge.refunded', eventId, bookingId, booking.confirmation_code, 'SKIPPED', 'Credit note already exists', rawPayload);
    return { success: true, message: 'Credit note already exists' };
  }

  // Check if there's an invoice for this booking
  if (!(await hasInvoice(bookingId))) {
    await logStripeWebhook('charge.refunded', eventId, bookingId, booking.confirmation_code, 'SKIPPED', 'No invoice exists for this booking', rawPayload);
    return { success: true, message: 'No invoice exists - credit note not needed' };
  }

  // Get seller and find rule
  const seller = await getSellerForBooking(bookingId);
  if (!seller) {
    await logStripeWebhook('charge.refunded', eventId, bookingId, booking.confirmation_code, 'SKIPPED', 'No seller found', rawPayload);
    return { success: true, message: 'No seller found for booking' };
  }

  const rule = await findRuleForSeller(seller);
  if (!rule) {
    await logStripeWebhook('charge.refunded', eventId, bookingId, booking.confirmation_code, 'SKIPPED', `No rule for seller: ${seller}`, rawPayload);
    return { success: true, message: `No rule configured for seller: ${seller}` };
  }

  // Check if auto credit note is enabled and trigger is 'refund'
  if (!rule.auto_credit_note_enabled) {
    await logStripeWebhook('charge.refunded', eventId, bookingId, booking.confirmation_code, 'SKIPPED', 'Auto credit note disabled', rawPayload);
    return { success: true, message: 'Auto credit note is disabled for this rule' };
  }

  if (rule.credit_note_trigger !== 'refund') {
    await logStripeWebhook('charge.refunded', eventId, bookingId, booking.confirmation_code, 'SKIPPED', `Rule trigger is ${rule.credit_note_trigger}, not refund`, rawPayload);
    return { success: true, message: `Rule is configured for ${rule.credit_note_trigger} trigger, not refund` };
  }

  // Determine refund amount
  const finalRefundAmount = refundAmount || booking.total_price;
  console.log(`[Stripe] Processing refund for booking ${bookingId} (amount: €${finalRefundAmount})`);

  // Step 1: Send RIMBOK movimento to Partner Solution (if pratica exists)
  const psResult = await sendRefundToPS(bookingId, finalRefundAmount);

  if (!psResult.success) {
    await logStripeWebhook('charge.refunded', eventId, bookingId, booking.confirmation_code, 'ERROR', psResult.error || 'Failed to send RIMBOK to PS', rawPayload);
    return { success: false, message: psResult.error || 'Failed to send refund to Partner Solution' };
  }

  // Step 2: Create credit note record in our DB
  const result = await invoiceService.createCreditNote(bookingId, undefined, 'stripe-refund');

  if (result.success) {
    const message = psResult.movimentoIri
      ? `Refund sent to PS (${psResult.movimentoIri}) and credit note created`
      : 'Credit note created (no pratica in PS)';
    await logStripeWebhook('charge.refunded', eventId, bookingId, booking.confirmation_code, 'SUCCESS', message, rawPayload);
    console.log(`[Stripe] ${message} for booking ${bookingId}`);
    return { success: true, message, movimentoIri: psResult.movimentoIri };
  } else {
    await logStripeWebhook('charge.refunded', eventId, bookingId, booking.confirmation_code, 'ERROR', result.error || 'Failed to create credit note', rawPayload);
    return { success: false, message: result.error || 'Failed to create credit note' };
  }
}

/**
 * Stripe Webhook Endpoint
 * POST /webhook/stripe
 * Note: Raw body parsing is handled in index.ts before bodyParser.json()
 */
router.post('/webhook/stripe', async (req: Request, res: Response) => {
  console.log('\n' + '='.repeat(80));
  console.log('[Stripe] WEBHOOK RECEIVED - FULL LOG');
  console.log('='.repeat(80));
  console.log('[Stripe] Timestamp:', new Date().toISOString());
  console.log('[Stripe] Headers:', JSON.stringify(req.headers, null, 2));

  // Log raw body
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  console.log('[Stripe] Raw body type:', typeof req.body);
  console.log('[Stripe] Raw body (first 2000 chars):', rawBody.substring(0, 2000));

  // Try to parse and log structured data
  try {
    const parsed = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    console.log('[Stripe] Event type:', parsed?.type);
    console.log('[Stripe] Event ID:', parsed?.id);
    if (parsed?.data?.object) {
      const obj = parsed.data.object;
      console.log('[Stripe] Charge ID:', obj.id);
      console.log('[Stripe] Amount:', obj.amount);
      console.log('[Stripe] Amount Refunded:', obj.amount_refunded);
      console.log('[Stripe] Currency:', obj.currency);
      console.log('[Stripe] Metadata:', JSON.stringify(obj.metadata, null, 2));
      console.log('[Stripe] Description:', obj.description);
      console.log('[Stripe] Receipt Email:', obj.receipt_email);
      console.log('[Stripe] Customer:', obj.customer);
      console.log('[Stripe] Payment Intent:', obj.payment_intent);
      console.log('[Stripe] Invoice:', obj.invoice);
    }
  } catch (e) {
    console.log('[Stripe] Could not parse body for logging');
  }
  console.log('='.repeat(80) + '\n');

  const sig = req.headers['stripe-signature'] as string;
  let event: Stripe.Event;

  try {
    // Verify signature if we have the secret
    if (endpointSecret && sig && stripe) {
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
      } catch (err) {
        const error = err as Error;
        console.error('[Stripe] Signature verification failed:', error.message);
        return res.status(400).json({ error: `Webhook signature verification failed: ${error.message}` });
      }
    } else {
      // Parse body for testing without signature verification
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      // Handle direct API call format (for testing)
      if (body.booking_id || body.confirmation_code) {
        console.log('[Stripe] Processing direct API call (testing mode)');

        let bookingId = body.booking_id;
        if (!bookingId && body.confirmation_code) {
          const booking = await getBooking(undefined, body.confirmation_code);
          bookingId = booking?.booking_id;
        }

        if (!bookingId) {
          return res.status(400).json({ error: 'Could not determine booking ID' });
        }

        const result = await processRefund(
          bookingId,
          body.refund_amount || null,
          body.currency || 'EUR',
          'manual-test',
          body
        );

        return res.json(result);
      }

      // Treat as Stripe event
      event = body as Stripe.Event;
    }

    console.log(`[Stripe] Event type: ${event.type}, ID: ${event.id}`);

    // Handle the event
    switch (event.type) {
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        let metadata = charge.metadata || {};

        console.log(`[Stripe] Processing refund for charge: ${charge.id}`);
        console.log(`[Stripe] Charge metadata:`, metadata);
        console.log(`[Stripe] Payment Intent ID:`, charge.payment_intent);

        // If charge metadata is empty, fetch PaymentIntent to get metadata from there
        if (Object.keys(metadata).length === 0 && charge.payment_intent && stripe) {
          try {
            const paymentIntentId = typeof charge.payment_intent === 'string'
              ? charge.payment_intent
              : charge.payment_intent;

            console.log(`[Stripe] Fetching PaymentIntent: ${paymentIntentId}`);
            const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId as string);
            metadata = paymentIntent.metadata || {};
            console.log(`[Stripe] PaymentIntent metadata:`, JSON.stringify(metadata, null, 2));
          } catch (piError) {
            console.error(`[Stripe] Failed to fetch PaymentIntent:`, piError);
          }
        }

        let bookingId: number | null = null;

        // Get booking reference from metadata
        // Support both our format and Bokun format
        if (metadata.booking_id) {
          bookingId = parseInt(metadata.booking_id);
        } else if (metadata['bokun-booking-id']) {
          bookingId = parseInt(metadata['bokun-booking-id']);
        } else if (metadata.confirmation_code) {
          const booking = await getBooking(undefined, metadata.confirmation_code);
          bookingId = booking?.booking_id || null;
        }

        // Log all metadata keys for debugging
        console.log(`[Stripe] All metadata keys:`, Object.keys(metadata));

        if (!bookingId) {
          console.log(`[Stripe] No booking reference found in metadata: ${charge.id}`);
          // Use event.id as fallback for booking_id to avoid NOT NULL constraint
          await logStripeWebhook('charge.refunded', event.id, 0, 'UNKNOWN', 'SKIPPED', `No booking reference in metadata. Keys: ${Object.keys(metadata).join(', ')}`, event);
          return res.json({ received: true, message: 'No booking reference found in metadata', metadata_keys: Object.keys(metadata) });
        }

        // Get refund amount (Stripe amounts are in cents)
        const refundAmount = charge.amount_refunded ? charge.amount_refunded / 100 : null;
        const currency = charge.currency?.toUpperCase() || 'EUR';

        const result = await processRefund(bookingId, refundAmount, currency, event.id, event);
        return res.json({ received: true, ...result });
      }

      default:
        console.log(`[Stripe] Unhandled event type: ${event.type}`);
        return res.json({ received: true, message: `Ignored event type: ${event.type}` });
    }
  } catch (error) {
    const err = error as Error;
    console.error('[Stripe] Webhook error:', err.message);
    return res.status(500).json({ error: 'Webhook processing failed', details: err.message });
  }
});

/**
 * Test endpoint - manually trigger refund processing
 * GET /webhook/stripe/test?booking_id=123
 */
router.get('/webhook/stripe/test', async (req: Request, res: Response) => {
  const bookingId = req.query.booking_id as string;
  const confirmationCode = req.query.confirmation_code as string;
  const refundAmount = req.query.refund_amount as string;

  if (!bookingId && !confirmationCode) {
    return res.status(400).json({ error: 'booking_id or confirmation_code parameter required' });
  }

  let finalBookingId: number | null = bookingId ? parseInt(bookingId) : null;

  if (!finalBookingId && confirmationCode) {
    const booking = await getBooking(undefined, confirmationCode);
    finalBookingId = booking?.booking_id || null;
  }

  if (!finalBookingId) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  const result = await processRefund(
    finalBookingId,
    refundAmount ? parseFloat(refundAmount) : null,
    'EUR',
    'manual-test',
    { test: true, booking_id: finalBookingId }
  );

  return res.json(result);
});

/**
 * Health check
 * GET /webhook/stripe/health
 */
router.get('/webhook/stripe/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    endpoint: '/webhook/stripe',
    events_handled: ['charge.refunded'],
    stripe_configured: !!process.env.STRIPE_SECRET_KEY,
    webhook_secret_configured: !!process.env.STRIPE_WEBHOOK_SECRET,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get recent Stripe webhook logs
 * GET /webhook/stripe/logs
 */
router.get('/webhook/stripe/logs', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;

    const { data, error } = await supabase
      .from('webhook_logs')
      .select('*')
      .eq('webhook_type', 'STRIPE')
      .order('received_at', { ascending: false })
      .limit(limit);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({
      count: data?.length || 0,
      logs: data || [],
    });
  } catch (error) {
    const err = error as Error;
    return res.status(500).json({ error: err.message });
  }
});

export default router;
