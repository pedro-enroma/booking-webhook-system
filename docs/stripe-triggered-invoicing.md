# Stripe-Triggered Invoicing for EnRoma

## Why This Exists

Previously, invoicing was triggered by the Bokun `BOOKING_CONFIRMED` webhook. The system checked `shouldAutoInvoice(sellerName)` against a list of sellers in an `invoice_rules` row. This had two problems:

1. **Reseller bookings were skipped** — sellers like "Mailen - Dia Libre" aren't in the EnRoma rule's `sellers` array, so their bookings were never invoiced, even though the payment went through the EnRoma Stripe account.
2. **`createIndividualPratica()` also rejected them** — its internal call to `getInvoiceRuleForSeller(sellerName)` returned null for unknown sellers, blocking invoice creation at a second level.

**Key insight**: Every payment through this Stripe account IS an EnRoma payment. The Stripe payment itself is the authorization to invoice — not the seller name.

## How It Works Now

Invoicing is triggered by `payment_intent.succeeded` from Stripe, not by the Bokun webhook. The two systems (Stripe + Bokun) cooperate, and whichever arrives second triggers the invoice.

### The Two Entry Points

```
Stripe payment_intent.succeeded  ──→  src/routes/stripe.ts
Bokun BOOKING_CONFIRMED          ──→  src/services/bookingService.ts
```

Both paths call the same method: `invoiceService.createIndividualPratica(bookingId, amount, true)` with `skipRuleCheck=true`, which bypasses the seller name validation entirely.

---

## Complete Flow

### Path A: Stripe Arrives First, Booking Already in DB

This is the most common case — Bokun webhook fires first (or near-simultaneously), then Stripe.

```
1. Stripe receives payment_intent.succeeded
2. Extracts booking_id from metadata (bokun-booking-id field)
3. Checks if booking exists in DB → YES
4. Status = MATCHED
5. Calls createIndividualPratica(bookingId, stripeAmount, skipRuleCheck=true)
6. Invoice created in Partner Solution
7. Status upgraded to INVOICED
8. Saved to stripe_payments with status=INVOICED
```

**File**: `src/routes/stripe.ts` lines 650-668

### Path B: Stripe Arrives First, Booking NOT in DB Yet

Stripe fires before Bokun has delivered the booking data.

```
1. Stripe receives payment_intent.succeeded
2. Extracts booking_id from metadata
3. Checks if booking exists in DB → NO
4. Tries fallback: name match within 5min window → NO (booking not saved yet)
5. Tries fallback: amount match within 5min window → NO
6. Status = RECEIVED (waiting for Bokun)
7. Saved to stripe_payments with status=RECEIVED

...later...

8. Bokun BOOKING_CONFIRMED arrives
9. Saves booking, customer, activities (steps 1-9 as before)
10. Step 10: Calls findPendingStripePayment(bookingId, customerName)
11. Finds the RECEIVED payment (matched by booking_id)
12. Updates stripe_payment to MATCHED
13. Calls createIndividualPratica(bookingId, stripeAmount, skipRuleCheck=true)
14. Invoice created → updates stripe_payment to INVOICED
```

**File**: `src/services/bookingService.ts` lines 144-187

### Path C: Stripe Arrives with Wrong booking_id

Bokun sometimes sends a different ID in Stripe metadata vs the actual webhook. The system handles this with fallback matching.

```
1. Stripe receives payment_intent.succeeded
2. Extracts booking_id from metadata → e.g. 12345
3. Checks if booking 12345 exists → NO
4. Tries name match: "John Smith" from metadata vs recent bookings → MATCH to booking 67890
5. Updates piBookingId to 67890
6. Status = MATCHED (with note about name match)
7. Auto-invoice fires → INVOICED
```

If name match also fails, tries exact amount match (only if unambiguous — exactly 1 booking with that amount in the last 5 minutes).

### Path D: Non-Bokun Payment (No Metadata) → Manual Pratica

```
1. Stripe receives payment_intent.succeeded
2. No bokun-booking-id in metadata → isBokun = false
3. Extracts billing_details from charge (name, email, country)
4. Status = PENDING_REVIEW
5. Stored with customer_name, customer_email, customer_country from billing
6. No auto-invoice — requires manual action from dashboard

...operator clicks "Send to PS" in dashboard...

7. Frontend pre-fills form with payment_amount, customer_name, customer_country
8. Operator reviews, fills any gaps (firstName, lastName required)
9. POST /api/invoices/manual with stripePaymentId
10. Backend generates 900M+ reference ID, creates pratica in PS
11. stripe_payment status → INVOICED
```

### Path E: Bokun Arrives, No Stripe Payment Exists

```
1. Bokun BOOKING_CONFIRMED arrives
2. Saves booking normally (steps 1-9)
3. Step 10: findPendingStripePayment() → null (no RECEIVED payment)
4. No invoice created — waits for Stripe
5. When Stripe arrives later → Path A fires (booking now in DB)
```

### Path F: Booking Already Invoiced

```
1. Stripe MATCHED + calls createIndividualPratica()
2. Method checks invoices table → finds existing invoice
3. Returns { success: true, alreadyInvoiced: true }
4. Status set to INVOICED with note "Already invoiced"
5. No duplicate invoice created
```

---

## Status Lifecycle

```
                    ┌─────────────────────────────────────────┐
                    │           stripe_payments.status         │
                    └─────────────────────────────────────────┘

  payment_intent.succeeded arrives
           │
           ├── Booking in DB? ──YES──→ MATCHED ──→ invoice ──→ INVOICED
           │                                         │
           │                                         └── fails? stays MATCHED
           │
           ├── Bokun metadata + no booking ──→ RECEIVED (waiting)
           │                                      │
           │                          Bokun arrives later
           │                                      │
           │                                      └──→ MATCHED ──→ INVOICED
           │
           └── No Bokun metadata ──→ PENDING_REVIEW (manual)
```

| Status | Meaning | Auto-invoice? |
|--------|---------|---------------|
| `RECEIVED` | Stripe payment stored, booking not yet in DB | No — waiting |
| `MATCHED` | Payment linked to a booking (invoice failed or zero amount) | Attempted |
| `INVOICED` | Payment linked AND invoice sent to Partner Solution | Done |
| `PENDING_REVIEW` | Non-Bokun payment, no metadata to match | No — manual via dashboard |

---

## Matching Strategies

When Stripe arrives, the system tries to find the booking in this order:

| Priority | Strategy | Where | Condition |
|----------|----------|-------|-----------|
| 1 | `booking_id` from metadata | stripe.ts | `bokun-booking-id` or `booking-reference` field |
| 2 | Customer name match | stripe.ts | Bokun payment + booking not found by ID. Compares `main-contact-data` against `bookings.booking_customers` from last 5 min |
| 3 | Amount match | stripe.ts | Last resort. Only if exactly 1 booking with same amount in last 5 min |

When Bokun arrives and checks for pending Stripe payments:

| Priority | Strategy | Where | Condition |
|----------|----------|-------|-----------|
| 1 | `booking_id` match | bookingService.ts | `stripe_payments.booking_id = parentBooking.bookingId` where status=RECEIVED |
| 2 | Customer name match | bookingService.ts | Compares webhook customer name against `stripe_payments.customer_name` where status=RECEIVED |

Name matching uses `namesMatch()` from `src/utils/nameMatching.ts`: tokenizes both names (lowercase, strip accents), and checks that all tokens from the shorter name appear in the longer name. Handles reordering, middle names, and accented characters.

---

## The `skipRuleCheck` Parameter

`invoiceService.createIndividualPratica(bookingId, amount, skipRuleCheck)`:

- **`skipRuleCheck = false`** (default): Looks up the seller in `invoice_rules` table. Only creates invoice if seller matches a `creation_date` rule. This is the old behavior, still used if someone calls the method directly.
- **`skipRuleCheck = true`**: Skips the seller lookup entirely. Used by both Stripe and Bokun reverse-match paths because the Stripe payment itself is the authorization.

---

## Billing Details Extraction

For ALL payments (Bokun and non-Bokun), the webhook now extracts billing details from the Stripe charge:

| `stripe_payments` column | Source | Notes |
|---|---|---|
| `customer_name` | Bokun `main-contact-data` metadata, then `charge.billing_details.name` as fallback | Bokun metadata takes priority |
| `customer_email` | `charge.billing_details.email` | New column |
| `customer_country` | `charge.billing_details.address.country` | New column, ISO 3166-1 alpha-2 (e.g. "ES", "US") |

For Bokun payments, `customer_name` comes from metadata. For non-Bokun payments, all three fields come from the Stripe charge billing details (populated when the customer enters billing info at checkout).

---

## Manual Pratica Creation (PENDING_REVIEW Payments)

### Endpoint

```
POST /api/invoices/manual
Header: x-api-key: <API_KEY>
```

### How It Works

1. Operator sees a PENDING_REVIEW payment in the Stripe Payments dashboard
2. Clicks "Send to PS" — form pre-fills with `payment_amount`, `customer_name`, `customer_country`
3. Operator reviews, adjusts, and submits
4. Backend generates a 900M+ auto-increment reference ID from `manual_pratica_ref_seq`
5. Creates full pratica in Partner Solution (account → pratica → passeggero → servizio → quota → movimento)
6. Updates `stripe_payments` row to INVOICED via `stripePaymentId`

### Reference ID Convention

- **Bokun bookings**: Use real Bokun booking IDs (naturally < 900M), padded to 9 digits
- **Manual pratiche**: Start at `900000000` and auto-increment — never conflicts with Bokun IDs
- The 9-digit padded ID is used for all PS identifier fields: `codicefiscale` (when no real CF provided), `externalid`, `codicefilefornitore`, `codicefile`

### Invoice vs Credit Note

The form supports both via `isCreditNote` boolean:

| | Invoice | Credit Note |
|---|---|---|
| `isCreditNote` | `false` (default) | `true` |
| Amount in quota | Positive | **Negative** (negated server-side) |
| Amount in movimento | Positive | **Negative** (negated server-side) |
| `codcausale` | `PAGBOK` | `RIMBOK` |
| Pratica description | productTitle or "Tour UE ed Extra UE" | "Nota di credito - Rimborso" |
| Servizio description | productTitle or "Tour UE ed Extra UE" | "Nota di credito - Tour UE ed Extra UE" |

The `totalAmount` from the form is **always positive** — the backend negates it for credit notes.

### Codice Fiscale Handling

| Customer type | codiceFiscale sent? | What's used for `codicefiscale` in PS |
|---|---|---|
| Persona fisica | No | 900M+ reference ID (auto-generated) |
| Persona fisica | Yes | The provided codice fiscale |
| Persona giuridica | N/A | `partitaIva` (required) |

### Country Resolution

Priority: `country` field (ISO code) → phone prefix → defaults to "Spagna"

The ISO code is converted server-side to PS country names (e.g. "ES" → "Spagna", "US" → "Stati Uniti", "FR" → "Francia"). Italy ("IT") maps to "Spagna" to avoid Italian invoicing rules.

### Form Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `isCreditNote` | boolean | No (default false) | Invoice or credit note |
| `isPersonaFisica` | boolean | No (default true) | Controls which fields appear |
| `firstName` | string | **Yes** | |
| `lastName` | string | **Yes** | |
| `phone` | string | No | Used for country detection if `country` not provided |
| `country` | string | No | ISO 2-letter code (e.g. "ES", "US") |
| `codiceFiscale` | string | No | Only for persona fisica. If empty, 900M+ ID used |
| `partitaIva` | string | **Yes** (giuridica) | Required for persona giuridica |
| `ragioneSociale` | string | **Yes** (giuridica) | Required for persona giuridica |
| `totalAmount` | number | **Yes** | Always positive |
| `productTitle` | string | No | Defaults to "Tour UE ed Extra UE" |
| `travelDate` | string | No | YYYY-MM-DD format. Defaults to today |
| `sellerName` | string | No | Stored in PS pratica notes |
| `confirmationCode` | string | No | If provided, used as reference instead of 900M+ |
| `stripePaymentId` | string | No | UUID of stripe_payments row — marks it INVOICED on success |

---

## Files Involved

| File | Role |
|------|------|
| `src/routes/stripe.ts` | Handles `payment_intent.succeeded`. Extracts billing details, matches payment to booking, auto-invoices on MATCHED. |
| `src/services/bookingService.ts` | Handles `BOOKING_CONFIRMED`. Checks for pending RECEIVED Stripe payments, reverse-matches + invoices. |
| `src/services/invoiceService.ts` | `createIndividualPratica()` with `skipRuleCheck` param. `createManualPratica()` for PENDING_REVIEW payments. |
| `src/routes/invoices.ts` | `POST /api/invoices/manual` endpoint for manual pratica creation from dashboard. |
| `src/utils/nameMatching.ts` | Shared `normalizeNameTokens()` + `namesMatch()` used by both entry points. |

---

## What Was Removed

The old auto-invoice trigger in `bookingService.ts` (`handleBookingConfirmed`, step 10):

```typescript
// OLD — removed
const shouldInvoice = await this.invoiceService.shouldAutoInvoice(sellerName);
if (shouldInvoice) {
  await this.invoiceService.createIndividualPratica(bookingId, totalPrice);
}
```

This checked the seller name against `invoice_rules.sellers[]`. It no longer exists — invoicing is now purely Stripe-driven.

`shouldAutoInvoice()` still exists in InvoiceService but is no longer called by the booking flow. It could be cleaned up later if no other code references it.

---

## Edge Cases

| Scenario | Outcome |
|----------|---------|
| Duplicate `payment_intent.succeeded` (same event ID) | Rejected by unique index on `stripe_event_id` (23505 catch) |
| Zero-amount Stripe payment | MATCHED but invoice skipped (zero amount check in `createIndividualPratica`) |
| Invoice creation fails (PS API error) | Stays MATCHED, error logged in `processing_notes`, non-blocking |
| Reseller booking (e.g. "Mailen - Dia Libre") | Invoiced normally — `skipRuleCheck=true` bypasses seller validation |
| Booking cancelled after invoice | Handled by existing credit note flow (separate `charge.refunded` path) |
| Multiple Stripe payments for same booking | Each creates its own `stripe_payments` row; only first invoice succeeds, rest get "Already invoiced" |
| Multiple partial refunds for same booking | Each refund gets its own credit note with incrementing prefix (5, 6, 7, 8). Individual refund amount extracted from `charge.refunds.data[]`, not cumulative `amount_refunded`. |
| Duplicate `charge.refunded` (same refund ID) | Rejected by unique index on `stripe_refund_id` (23505 catch) |
