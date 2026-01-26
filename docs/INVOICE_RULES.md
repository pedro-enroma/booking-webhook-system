# Invoice Rules System

## Overview

Invoice Rules allow you to configure automatic invoicing behavior per seller. Each rule defines:
- Which sellers it applies to
- When to send invoices (on booking creation or after travel date)
- Invoice configuration (regime, sales type)
- Whether to auto-create credit notes on cancellation/refund

**Important:** Each seller can only belong to ONE rule.

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           INVOICE RULES FLOW                                 │
└─────────────────────────────────────────────────────────────────────────────┘

1. Configure Rules (UI)
   ┌──────────────────────────────────────────────────────────────────────────┐
   │  Rule: "Civitatis Tours"                                                  │
   │  ├── Sellers: [Civitatis]                                                │
   │  ├── Auto Invoice: ON                                                    │
   │  ├── Invoice Date Type: Travel (+7 days)                                 │
   │  ├── Regime: 74T                                                         │
   │  └── Start Date: 2026-01-01 (only bookings with travel >= this date)    │
   └──────────────────────────────────────────────────────────────────────────┘

2. Apply Rules (Button click or scheduled job)
   ┌────────────────┐     ┌────────────────┐     ┌─────────────────────────┐
   │   Confirmed    │────▶│  Match seller  │────▶│  Create scheduled_      │
   │   Bookings     │     │  to rule       │     │  invoices entry         │
   └────────────────┘     └────────────────┘     └─────────────────────────┘

3. Process Scheduled Invoices (separate job)
   ┌─────────────────────────┐     ┌────────────────────────────────────────┐
   │  scheduled_invoices     │────▶│  When scheduled_send_date <= today:    │
   │  (status: pending)      │     │  Send to Partner Solution              │
   └─────────────────────────┘     └────────────────────────────────────────┘
```

---

## Database Schema

### `invoice_rules` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | TEXT | Rule name (e.g., "Civitatis Tours") |
| `sellers` | TEXT[] | Array of seller names this rule applies to |
| `auto_invoice_enabled` | BOOLEAN | Whether to auto-create invoices |
| `auto_credit_note_enabled` | BOOLEAN | Whether to auto-create credit notes |
| `credit_note_trigger` | TEXT | When to trigger: `cancellation` or `refund` |
| `default_regime` | TEXT | Invoice regime: `74T` or `ORD` |
| `default_sales_type` | TEXT | Sales type: `ORG`, `INT`, etc. |
| `invoice_date_type` | TEXT | When to send: `creation` or `travel` |
| `travel_date_delay_days` | INTEGER | Days after travel date to send (if type=travel) |
| `execution_time` | TIME | Time of day to send (e.g., `08:00`, `14:00`) |
| `invoice_start_date` | DATE | Only process bookings with travel date >= this |
| `created_at` | TIMESTAMP | When rule was created |
| `updated_at` | TIMESTAMP | When rule was last updated |

### `scheduled_invoices` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `booking_id` | INTEGER | References bookings.booking_id |
| `rule_id` | UUID | References invoice_rules.id |
| `scheduled_send_date` | DATE | Date when to send the invoice |
| `scheduled_send_time` | TIME | Time of day to send (e.g., `08:00`) |
| `status` | TEXT | `pending`, `sent`, `failed`, `cancelled` |
| `sent_at` | TIMESTAMP | When invoice was actually sent |
| `error_message` | TEXT | Error details if failed |
| `created_at` | TIMESTAMP | When scheduled entry was created |

---

## Rule Configuration

### Invoice Date Type

| Type | Description |
|------|-------------|
| `creation` | Send invoice immediately when rule is applied |
| `travel` | Send invoice X days after travel date |

**Example:** `invoice_date_type: 'travel'` + `travel_date_delay_days: 7`
- Booking travel date: 2026-01-15
- Scheduled send date: 2026-01-22

### Invoice Start Date

Filter to only process bookings with travel date on or after this date.

**Use case:** Start invoicing for a new seller from a specific date, without retroactively invoicing old bookings.

---

## API Endpoints

### POST /api/invoices/process-rules

Processes all confirmed bookings against configured rules and creates `scheduled_invoices` entries.

**Request:**
```json
{
  "dry_run": false
}
```

**Response:**
```json
{
  "success": true,
  "dry_run": false,
  "total_bookings": 500,
  "processed": 45,
  "results": [
    {
      "booking_id": 80404039,
      "confirmation_code": "CIV-80404039",
      "seller": "Civitatis",
      "action": "scheduled",
      "scheduled_date": "2026-01-22"
    }
  ],
  "message": "Scheduled 45 invoices"
}
```

**Dry Run:** Set `dry_run: true` to see what would be scheduled without creating entries.

---

## UI Location

**Invoicing Page** → **Rules** button (top right)

### Rules List
- View all configured rules
- See which sellers are assigned to each rule
- Edit or delete rules
- Create new rules

### Rule Form
- **Rule Name:** Descriptive name
- **Sellers:** Multi-select (sellers already assigned to other rules are grayed out)
- **Auto Invoice:** Toggle ON/OFF
- **Auto Credit Note:** Toggle ON/OFF
  - **Trigger:** Cancellation or Refund
- **Default Regime:** 74T or ORD
- **Default Sales Type:** ORG, INT
- **Invoice Date Type:** Creation or Travel
  - **Delay Days:** (only if Travel) Number of days after travel
- **Execution Time:** Time of day to send invoices (e.g., `08:00`, `14:00`)
- **Start Date:** (optional) Only process bookings with travel date >= this

### Apply Rules Button
Runs the `process-rules` endpoint to create scheduled invoices for all matching bookings.

---

## Workflow Example

1. **Create Rule:**
   - Name: "Civitatis Partners"
   - Sellers: [Civitatis]
   - Auto Invoice: ON
   - Invoice Date Type: Travel (+7 days)
   - Execution Time: 08:00
   - Regime: 74T
   - Start Date: 2026-01-01

2. **Click "Apply Rules":**
   - System finds all CONFIRMED bookings from Civitatis
   - Filters to only those with travel date >= 2026-01-01
   - Creates `scheduled_invoices` entries with calculated send dates

3. **Scheduled Job (separate process):**
   - Runs periodically (e.g., every hour or at specific times)
   - Finds `scheduled_invoices` where `scheduled_send_date <= today`, `scheduled_send_time <= current_time`, and `status = pending`
   - Sends each to Partner Solution using the 7-step flow (with auto-created Commessa)
   - Updates status to `sent` or `failed`

---

## Important Notes

- **One seller per rule:** A seller can only belong to one rule. The UI prevents assigning a seller to multiple rules.
- **Idempotent:** Running "Apply Rules" multiple times won't create duplicate entries (checks existing scheduled_invoices and invoices).
- **Manual override:** You can still manually invoice bookings from the Pending tab, regardless of rules.
- **Credit notes:** If `auto_credit_note_enabled` is ON, credit notes are created based on the trigger (cancellation or refund webhook).

---

## Files Reference

| File | Purpose |
|------|---------|
| `tourmageddon-saas/src/components/InvoicingPage.tsx` | UI for managing rules |
| `tourmageddon-saas/src/app/api/invoices/process-rules/route.ts` | Apply rules endpoint |
| `booking-webhook-system/src/routes/invoices.ts` | Partner Solution send endpoint |
