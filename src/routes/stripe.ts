/**
 * Stripe Webhook Routes
 * Handles Stripe events for refunds and sends RIMBOK movimento to Partner Solution
 */

import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import { supabase } from '../config/supabase';
import { invoiceService } from '../services/invoiceService';
import {
  isOffloadEnabled,
  uploadPayload,
  buildPayloadSummary,
  incrementMetric,
} from '../services/payloadStorage';
import { normalizeNameTokens, namesMatch } from '../utils/nameMatching';

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
  invoice_date_type: string;
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
    // stripe_payment rules with empty sellers match ANY seller
    if (rule.invoice_date_type === 'stripe_payment' && (!rule.sellers || rule.sellers.length === 0)) {
      return rule as InvoiceRule;
    }
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
 * Match a Stripe payment to a recent booking by customer name.
 * Searches bookings created within the last windowMinutes that have a matching customer name.
 */
async function matchByCustomerName(
  customerName: string,
  windowMinutes: number = 5
): Promise<{ booking_id: number; matched_name: string } | null> {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

  const { data: recentBookings, error } = await supabase
    .from('bookings')
    .select(`
      booking_id,
      booking_customers(
        customers(first_name, last_name)
      )
    `)
    .gte('creation_date', since)
    .eq('status', 'CONFIRMED');

  if (error || !recentBookings) {
    console.warn('[Stripe] Error querying recent bookings for name match:', error);
    return null;
  }

  for (const booking of recentBookings) {
    const bc = (booking as any).booking_customers;
    if (!bc || bc.length === 0) continue;

    const customer = bc[0].customers;
    if (!customer) continue;

    const dbName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
    if (!dbName) continue;

    if (namesMatch(customerName, dbName)) {
      console.log(`[Stripe] Name match found: "${customerName}" ≈ "${dbName}" → booking ${booking.booking_id}`);
      return { booking_id: booking.booking_id, matched_name: dbName };
    }
  }

  return null;
}

/**
 * Match a Stripe payment to a recent booking by amount.
 * Used as last resort when metadata is empty. Only matches if exactly one booking
 * with the same amount was created within the time window (to avoid ambiguity).
 */
async function matchByAmount(
  amount: number,
  windowMinutes: number = 5
): Promise<{ booking_id: number; matched_name: string } | null> {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

  const { data: recentBookings, error } = await supabase
    .from('bookings')
    .select(`
      booking_id,
      total_price,
      booking_customers(
        customers(first_name, last_name)
      )
    `)
    .gte('creation_date', since)
    .eq('status', 'CONFIRMED')
    .eq('total_price', amount);

  if (error || !recentBookings) {
    console.warn('[Stripe] Error querying recent bookings for amount match:', error);
    return null;
  }

  // Only match if exactly one booking has this amount (avoid ambiguity)
  if (recentBookings.length === 1) {
    const booking = recentBookings[0];
    const bc = (booking as any).booking_customers;
    const customer = bc?.[0]?.customers;
    const name = customer ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim() : 'Unknown';
    console.log(`[Stripe] Amount match found: €${amount} → booking ${booking.booking_id} (${name})`);
    return { booking_id: booking.booking_id, matched_name: name };
  }

  if (recentBookings.length > 1) {
    console.warn(`[Stripe] Amount match ambiguous: ${recentBookings.length} bookings with €${amount} in last ${windowMinutes}min`);
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
 * Process refund and create credit note.
 * Credit notes are ALWAYS created for every refund — no invoice/rule checks.
 * If booking exists in DB, uses booking data. Otherwise uses Stripe metadata.
 */
async function processRefund(
  bookingId: number,
  refundAmount: number | null,
  currency: string,
  eventId: string,
  rawPayload: any,
  stripeCustomerName?: string | null
): Promise<{ success: boolean; message: string; movimentoIri?: string }> {
  // Idempotency: skip if credit note already exists
  if (await hasCreditNote(bookingId)) {
    await logStripeWebhook('charge.refunded', eventId, bookingId, null, 'SUCCESS', 'Credit note already exists', rawPayload);
    return { success: true, message: 'Credit note already exists' };
  }

  // Refund amount is required
  if (!refundAmount) {
    await logStripeWebhook('charge.refunded', eventId, bookingId, null, 'ERROR', 'No refund amount in Stripe event', rawPayload);
    return { success: false, message: 'No refund amount in Stripe event' };
  }

  // Get booking data if available (optional — we proceed regardless)
  const booking = await getBooking(bookingId);
  const confirmationCode = booking?.confirmation_code || `ENRO-${bookingId}`;

  // Get seller if booking exists (for context in the pratica)
  let sellerName: string | null = null;
  if (booking) {
    sellerName = await getSellerForBooking(bookingId);
  }

  console.log(`[Stripe] Processing refund for booking ${bookingId} (amount: €${refundAmount}, booking in DB: ${!!booking})`);

  // Always create credit note pratica — pass fallback data for cases without booking/invoice
  const result = await invoiceService.createCreditNotePratica(bookingId, refundAmount, 'stripe-refund', {
    customerName: stripeCustomerName || null,
    sellerName: sellerName,
    confirmationCode: confirmationCode,
  });

  if (result.success) {
    const message = result.praticaIri
      ? `Credit note pratica created in PS (${result.praticaIri}) with RIMBOK movimento (${result.movimentoIri})`
      : 'Credit note already exists';
    await logStripeWebhook('charge.refunded', eventId, bookingId, confirmationCode, 'SUCCESS', message, rawPayload);
    console.log(`[Stripe] ${message} for booking ${bookingId}`);

    // Update stripe_refunds to PROCESSED
    const { error: updateError } = await supabase
      .from('stripe_refunds')
      .update({
        status: 'PROCESSED',
        ps_pratica_iri: result.praticaIri || null,
        ps_movimento_iri: result.movimentoIri || null,
        processed_at: new Date().toISOString()
      })
      .eq('stripe_event_id', eventId);

    if (updateError) {
      console.error(`[Stripe] Failed to update stripe_refunds status:`, updateError);
    }

    return { success: true, message, movimentoIri: result.movimentoIri };
  } else {
    await logStripeWebhook('charge.refunded', eventId, bookingId, confirmationCode, 'ERROR', result.error || 'Failed to create credit note pratica', rawPayload);
    return { success: false, message: result.error || 'Failed to create credit note pratica' };
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

        // Extract individual refund amount from charge.refunds.data[]
        // charge.amount_refunded is the CUMULATIVE total — we need the individual refund that triggered this event
        const totalRefunded = charge.amount_refunded ? charge.amount_refunded / 100 : null;
        const currency = charge.currency?.toUpperCase() || 'EUR';
        const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : null;

        let refundAmount: number | null = null;
        let stripeRefundId: string | null = null;

        const refundsData = (charge as any).refunds?.data as Array<{ id: string; amount: number; created: number }> | undefined;
        if (refundsData && refundsData.length > 0) {
          // Find the most recent refund (highest 'created' timestamp) — that's the one that triggered this event
          const latestRefund = refundsData.reduce((latest, r) => r.created > latest.created ? r : latest, refundsData[0]);
          refundAmount = latestRefund.amount / 100;
          stripeRefundId = latestRefund.id;
          console.log(`[Stripe] Individual refund: ${stripeRefundId} for €${refundAmount} (total refunded: €${totalRefunded})`);
        } else {
          // Fallback: if refunds.data not available, use amount_refunded
          refundAmount = totalRefunded;
          console.warn(`[Stripe] No refunds.data available, falling back to amount_refunded: €${refundAmount}`);
        }

        let bookingId: number | null = null;

        // Get booking reference from metadata
        // Support multiple formats
        if (metadata.booking_id) {
          bookingId = parseInt(metadata.booking_id);
        } else if (metadata['bokun-booking-id']) {
          bookingId = parseInt(metadata['bokun-booking-id']);
        } else if (metadata['booking-reference']) {
          // Format: ENRO-82342320 -> extract 82342320
          const match = metadata['booking-reference'].match(/(\d+)$/);
          if (match) bookingId = parseInt(match[1]);
        } else if (metadata.confirmation_code) {
          const booking = await getBooking(undefined, metadata.confirmation_code);
          bookingId = booking?.booking_id || null;
        }

        // Validate booking exists in our DB
        if (bookingId) {
          const booking = await getBooking(bookingId);
          if (!booking) {
            console.warn(`[Stripe] WARNING: Booking ${bookingId} from metadata not found in DB. Metadata may be incorrect.`);
            console.warn(`[Stripe] Metadata source: ${JSON.stringify({ booking_id: metadata.booking_id, 'bokun-booking-id': metadata['bokun-booking-id'], 'booking-reference': metadata['booking-reference'] })}`);
          }
        }

        // Always store refund in stripe_refunds table (one row per individual refund)
        const { data: refundRecord, error: refundError } = await supabase
          .from('stripe_refunds')
          .insert({
            stripe_event_id: event.id,
            stripe_charge_id: charge.id,
            stripe_payment_intent_id: paymentIntentId,
            stripe_refund_id: stripeRefundId,
            booking_id: bookingId,
            confirmation_code: metadata.confirmation_code || metadata['bokun-booking-id'] ? `ENRO-${bookingId}` : null,
            refund_amount: refundAmount,
            total_amount_refunded: totalRefunded,
            currency: currency,
            metadata: metadata,
            status: 'RECEIVED'
          })
          .select()
          .single();

        if (refundError) {
          // Duplicate stripe_refund_id or stripe_event_id — skip processing
          if (refundError.code === '23505') {
            console.log(`[Stripe] Duplicate refund detected (${stripeRefundId || event.id}), skipping`);
            return res.json({ received: true, message: 'Duplicate refund, already processed' });
          }
          console.error(`[Stripe] Failed to store refund:`, refundError);
        } else {
          console.log(`[Stripe] Refund stored with id: ${refundRecord.id}`);
        }

        // Log all metadata keys for debugging
        console.log(`[Stripe] All metadata keys:`, Object.keys(metadata));

        if (!bookingId) {
          console.log(`[Stripe] No booking reference found in metadata: ${charge.id}`);
          await logStripeWebhook('charge.refunded', event.id, 0, 'UNKNOWN', 'SKIPPED', `No booking reference in metadata. Keys: ${Object.keys(metadata).join(', ')}`, event);
          return res.json({ received: true, message: 'No booking reference found in metadata', metadata_keys: Object.keys(metadata), refund_stored: !!refundRecord });
        }

        // Extract customer name for fallback (in case booking not in DB)
        const stripeCustomerName = metadata['main-contact-data']
          || (charge.billing_details as any)?.name
          || null;

        const result = await processRefund(bookingId, refundAmount, currency, event.id, event, stripeCustomerName);
        return res.json({ received: true, ...result });
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const piMetadata = paymentIntent.metadata || {};

        console.log(`[Stripe] Processing payment_intent.succeeded: ${paymentIntent.id}`);
        console.log(`[Stripe] Amount: ${paymentIntent.amount / 100} ${paymentIntent.currency}`);
        console.log(`[Stripe] Metadata:`, JSON.stringify(piMetadata, null, 2));

        const paymentAmount = paymentIntent.amount / 100;
        const piCurrency = paymentIntent.currency?.toUpperCase() || 'EUR';

        // Parse Bokun-specific metadata fields
        const bokunBookingId = piMetadata['bokun-booking-id'] || null;
        const bokunPaymentId = piMetadata['bokun-payment-id'] || null;
        const bokunTravelDate = piMetadata['bokun-travel-date'] || null;
        let customerName = piMetadata['main-contact-data'] || null;
        const creationDate = piMetadata['creation-date'] || piMetadata['creation-timestamp'] || null;

        // Collect bokun-product-N fields
        const bokunProducts: string[] = [];
        for (let i = 1; i <= 10; i++) {
          const productId = piMetadata[`bokun-product-${i}`];
          if (productId) bokunProducts.push(productId);
          else break;
        }

        const isBokun = !!bokunBookingId;

        // Extract billing details from the charge (available for all payments)
        let customerEmail: string | null = null;
        let customerCountry: string | null = null;
        const latestCharge = (paymentIntent as any).latest_charge;
        if (latestCharge && typeof latestCharge === 'object') {
          const billing = latestCharge.billing_details;
          if (billing) {
            if (!customerName && billing.name) customerName = billing.name;
            customerEmail = billing.email || null;
            customerCountry = billing.address?.country || null;
          }
        } else if (stripe && paymentIntent.latest_charge && typeof paymentIntent.latest_charge === 'string') {
          // Charge not expanded in event — fetch it
          try {
            const charge = await stripe.charges.retrieve(paymentIntent.latest_charge);
            const billing = charge.billing_details;
            if (billing) {
              if (!customerName && billing.name) customerName = billing.name;
              customerEmail = billing.email || null;
              customerCountry = billing.address?.country || null;
            }
          } catch (chargeErr) {
            console.warn('[Stripe] Failed to fetch charge for billing details:', chargeErr);
          }
        }

        // Resolve booking_id from metadata (same logic as charge.refunded)
        let piBookingId: number | null = null;
        if (piMetadata.booking_id) {
          piBookingId = parseInt(piMetadata.booking_id);
        } else if (piMetadata['bokun-booking-id']) {
          piBookingId = parseInt(piMetadata['bokun-booking-id']);
        } else if (piMetadata['booking-reference']) {
          const match = piMetadata['booking-reference'].match(/(\d+)$/);
          if (match) piBookingId = parseInt(match[1]);
        } else if (piMetadata.confirmation_code) {
          const booking = await getBooking(undefined, piMetadata.confirmation_code);
          piBookingId = booking?.booking_id || null;
        }

        // Check if booking exists in our DB
        let bookingExists = false;
        if (piBookingId) {
          const booking = await getBooking(piBookingId);
          bookingExists = !!booking;
          if (!booking) {
            console.warn(`[Stripe] Booking ${piBookingId} not yet in DB (may arrive later via Bokun webhook)`);
          } else {
            console.log(`[Stripe] Booking ${piBookingId} found in DB`);
          }
        }

        // If booking not found by ID, try fallback matching strategies
        let matchMethod: string | null = null;
        if (isBokun && !bookingExists && customerName) {
          // Strategy 1: match by customer name (Bokun payment with wrong booking_id)
          console.log(`[Stripe] Booking ${piBookingId} not in DB, trying name match for "${customerName}"...`);
          const nameMatch = await matchByCustomerName(customerName);
          if (nameMatch) {
            console.log(`[Stripe] Name match: updating booking_id from ${piBookingId} to ${nameMatch.booking_id}`);
            piBookingId = nameMatch.booking_id;
            bookingExists = true;
            matchMethod = 'name';
          }
        }
        if (!bookingExists && paymentAmount > 0) {
          // Strategy 2: match by exact amount within time window (empty metadata or name match failed)
          console.log(`[Stripe] Trying amount match for €${paymentAmount}...`);
          const amountMatch = await matchByAmount(paymentAmount);
          if (amountMatch) {
            console.log(`[Stripe] Amount match: matched to booking ${amountMatch.booking_id} (${amountMatch.matched_name})`);
            piBookingId = amountMatch.booking_id;
            bookingExists = true;
            matchMethod = 'amount';
            if (!customerName) {
              customerName = amountMatch.matched_name;
            }
          }
        }

        // Determine initial status
        let paymentStatus: string;
        let processingNotes: string | null = null;
        if (bookingExists && matchMethod) {
          paymentStatus = 'MATCHED';
          processingNotes = matchMethod === 'name'
            ? `Matched by customer name "${customerName}" to booking ${piBookingId}`
            : `Matched by amount €${paymentAmount} to booking ${piBookingId}`;
        } else if (bookingExists && piBookingId) {
          paymentStatus = 'MATCHED';
          processingNotes = `Payment matched to booking ${piBookingId} via metadata`;
        } else if (piBookingId) {
          // Have a booking reference from metadata but booking not in DB yet — wait for Bokun
          paymentStatus = 'RECEIVED';
          processingNotes = `Booking ${piBookingId} not yet in DB - waiting for Bokun webhook`;
        } else {
          paymentStatus = 'PENDING_REVIEW';
          processingNotes = 'No booking reference found - requires manual review';
        }

        // Auto-create invoice when payment is matched to a booking
        if (paymentStatus === 'MATCHED' && piBookingId) {
          try {
            const invoiceResult = await invoiceService.createIndividualPratica(
              piBookingId,
              paymentAmount,    // use Stripe amount as override
              true              // skipRuleCheck — Stripe payment IS the authorization
            );
            if (invoiceResult.success && !invoiceResult.alreadyInvoiced && !invoiceResult.skipped) {
              paymentStatus = 'INVOICED';
              processingNotes += ` | Invoice: ${invoiceResult.praticaIri}`;
            } else if (invoiceResult.alreadyInvoiced) {
              paymentStatus = 'INVOICED';
              processingNotes += ' | Already invoiced';
            } else if (invoiceResult.skipped) {
              processingNotes += ' | Invoice skipped (zero amount)';
            } else if (!invoiceResult.success) {
              processingNotes += ` | Invoice failed: ${invoiceResult.error || 'Unknown error'}`;
              console.error(`[Stripe] Auto-invoice returned failure for booking ${piBookingId}: ${invoiceResult.error}`);
            }
          } catch (invoiceError: any) {
            console.error('[Stripe] Auto-invoice failed (non-blocking):', invoiceError.message);
            processingNotes += ` | Invoice failed: ${invoiceError.message}`;
          }
        }

        // Insert into stripe_payments (dedup via UNIQUE stripe_event_id)
        const { data: paymentRecord, error: paymentInsertError } = await supabase
          .from('stripe_payments')
          .insert({
            stripe_event_id: event.id,
            stripe_payment_intent_id: paymentIntent.id,
            booking_id: piBookingId,
            confirmation_code: piBookingId ? `ENRO-${piBookingId}` : null,
            payment_amount: paymentAmount,
            currency: piCurrency,
            metadata: piMetadata,
            bokun_booking_id: bokunBookingId,
            bokun_payment_id: bokunPaymentId,
            bokun_travel_date: bokunTravelDate,
            bokun_products: bokunProducts.length > 0 ? bokunProducts : null,
            customer_name: customerName,
            customer_email: customerEmail,
            customer_country: customerCountry,
            creation_date: creationDate,
            status: paymentStatus,
            is_bokun_payment: isBokun,
            processing_notes: processingNotes,
            processed_at: paymentStatus === 'MATCHED' ? new Date().toISOString() : null,
          })
          .select()
          .single();

        if (paymentInsertError) {
          if ((paymentInsertError as any).code === '23505') {
            console.log(`[Stripe] Duplicate payment_intent.succeeded event: ${event.id}`);
            return res.json({ received: true, message: 'Duplicate event, already processed' });
          }
          console.error(`[Stripe] Failed to store payment:`, paymentInsertError);
        } else {
          console.log(`[Stripe] Payment stored with id: ${paymentRecord.id}, status: ${paymentStatus}`);
        }

        // Log to webhook_logs
        await logStripeWebhook(
          'payment_intent.succeeded',
          event.id,
          piBookingId,
          piBookingId ? `ENRO-${piBookingId}` : null,
          'SUCCESS',
          isBokun
            ? `Bokun payment stored (${bookingExists ? 'matched' : 'pending match'}) - €${paymentAmount}`
            : `Non-Bokun payment stored for review - €${paymentAmount}`,
          event
        );

        return res.json({
          received: true,
          payment_intent_id: paymentIntent.id,
          amount: paymentAmount,
          currency: piCurrency,
          is_bokun: isBokun,
          booking_matched: bookingExists,
          status: paymentStatus,
          payment_stored: !!paymentRecord,
        });
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

  const type = req.query.type as string;

  if (type === 'invoice') {
    // Trigger invoice creation (same as Stripe auto-invoice on MATCHED)
    const amount = refundAmount ? parseFloat(refundAmount) : undefined;
    const result = await invoiceService.createIndividualPratica(finalBookingId, amount, true);
    return res.json(result);
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
 * Retry invoice for a MATCHED payment that failed auto-invoicing
 * POST /webhook/stripe/payments/:paymentId/retry-invoice
 */
router.post('/webhook/stripe/payments/:paymentId/retry-invoice', async (req: Request, res: Response) => {
  try {
    const { paymentId } = req.params;

    // Fetch the payment record
    const { data: payment, error: fetchError } = await supabase
      .from('stripe_payments')
      .select('id, booking_id, payment_amount, status, processing_notes')
      .eq('id', paymentId)
      .single();

    if (fetchError || !payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (!payment.booking_id) {
      return res.status(400).json({ error: 'Payment has no booking_id' });
    }

    if (payment.status === 'INVOICED') {
      return res.json({ success: true, message: 'Already invoiced' });
    }

    // Attempt to create the invoice
    const result = await invoiceService.createIndividualPratica(
      payment.booking_id,
      payment.payment_amount,
      true // skipRuleCheck
    );

    if (result.success && !result.alreadyInvoiced && !result.skipped) {
      await supabase.from('stripe_payments').update({
        status: 'INVOICED',
        processing_notes: `${payment.processing_notes || ''} | Retry invoice: ${result.praticaIri}`,
        error_message: null,
      }).eq('id', paymentId);

      return res.json({ success: true, praticaIri: result.praticaIri });
    } else if (result.alreadyInvoiced) {
      await supabase.from('stripe_payments').update({
        status: 'INVOICED',
        processing_notes: `${payment.processing_notes || ''} | Already invoiced`,
        error_message: null,
      }).eq('id', paymentId);

      return res.json({ success: true, message: 'Already invoiced' });
    } else {
      const errorMsg = result.error || 'Unknown error';
      await supabase.from('stripe_payments').update({
        error_message: errorMsg,
        processing_notes: `${payment.processing_notes || ''} | Retry failed: ${errorMsg}`,
      }).eq('id', paymentId);

      return res.status(500).json({ error: errorMsg });
    }
  } catch (error) {
    const err = error as Error;
    console.error('[Stripe] Retry invoice error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Health check
 * GET /webhook/stripe/health
 */
router.get('/webhook/stripe/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    endpoint: '/webhook/stripe',
    events_handled: ['charge.refunded', 'payment_intent.succeeded'],
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

/**
 * List stored Stripe payments
 * GET /webhook/stripe/payments?status=PENDING_REVIEW&is_bokun=false&limit=50
 */
router.get('/webhook/stripe/payments', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const status = req.query.status as string;
    const isBokun = req.query.is_bokun as string;

    let query = supabase
      .from('stripe_payments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq('status', status);
    }
    if (isBokun === 'true') {
      query = query.eq('is_bokun_payment', true);
    } else if (isBokun === 'false') {
      query = query.eq('is_bokun_payment', false);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Join with invoices table to show pratica data for linked payments
    const payments = data || [];
    const bookingIds = payments
      .map((p: any) => p.booking_id)
      .filter((id: any) => id != null);

    let invoiceMap: Record<string, any> = {};
    if (bookingIds.length > 0) {
      const { data: invoices } = await supabase
        .from('invoices')
        .select('booking_id, id, invoice_type, status, total_amount, currency, ps_pratica_iri, seller_name, created_by, sent_at')
        .in('booking_id', bookingIds)
        .eq('invoice_type', 'INVOICE');

      if (invoices) {
        for (const inv of invoices) {
          invoiceMap[String(inv.booking_id)] = {
            invoice_id: inv.id,
            invoice_status: inv.status,
            invoice_amount: inv.total_amount,
            invoice_currency: inv.currency,
            ps_pratica_iri: inv.ps_pratica_iri,
            invoice_seller: inv.seller_name,
            invoice_created_by: inv.created_by,
            invoice_sent_at: inv.sent_at,
          };
        }
      }
    }

    const enrichedPayments = payments.map((p: any) => ({
      ...p,
      invoice: invoiceMap[String(p.booking_id)] || null,
    }));

    return res.json({
      count: enrichedPayments.length,
      payments: enrichedPayments,
    });
  } catch (error) {
    const err = error as Error;
    return res.status(500).json({ error: err.message });
  }
});

export default router;
