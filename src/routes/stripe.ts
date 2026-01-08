/**
 * Stripe Webhook Routes
 * Handles Stripe events for refunds and creates credit notes
 */

import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import { supabase } from '../config/supabase';
import { invoiceService } from '../services/invoiceService';

const router = express.Router();

// Initialize Stripe (will use STRIPE_SECRET_KEY from env)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

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
    await supabase.from('webhook_logs').insert({
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
    });
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
): Promise<{ success: boolean; message: string }> {
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

  // Create credit note using InvoiceService
  console.log(`[Stripe] Creating credit note for booking ${bookingId} (refund amount: ${refundAmount || booking.total_price})`);

  const result = await invoiceService.createCreditNote(bookingId, undefined, 'stripe-refund');

  if (result.success) {
    await logStripeWebhook('charge.refunded', eventId, bookingId, booking.confirmation_code, 'SUCCESS', 'Credit note created', rawPayload);
    console.log(`[Stripe] Credit note created successfully for booking ${bookingId}`);
    return { success: true, message: 'Credit note created successfully' };
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
  console.log('[Stripe] Webhook received');

  const sig = req.headers['stripe-signature'] as string;
  let event: Stripe.Event;

  try {
    // Verify signature if we have the secret
    if (endpointSecret && sig) {
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
        const metadata = charge.metadata || {};

        console.log(`[Stripe] Processing refund for charge: ${charge.id}`);
        console.log(`[Stripe] Metadata:`, metadata);

        let bookingId: number | null = null;

        // Get booking reference from metadata
        if (metadata.booking_id) {
          bookingId = parseInt(metadata.booking_id);
        } else if (metadata.confirmation_code) {
          const booking = await getBooking(undefined, metadata.confirmation_code);
          bookingId = booking?.booking_id || null;
        }

        if (!bookingId) {
          console.log(`[Stripe] No booking reference found in charge metadata: ${charge.id}`);
          await logStripeWebhook('charge.refunded', event.id, null, null, 'SKIPPED', 'No booking reference in metadata', event);
          return res.json({ received: true, message: 'No booking reference found in charge metadata' });
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
