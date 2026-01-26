# Invoice Rules System

## Overview

Simple invoice rules that determine when bookings are automatically sent to Partner Solution.

## Two Rule Types

### 1. Travel Date Rule (`travel_date`)

Sends booking data to Partner Solution **on the travel date** via a cron job.

**Behavior:**
- If a booking has multiple activities, uses the **latest (newest) activity date**
- `invoice_start_date` filters by **travel date**: only bookings with travel date >= this date are processed
- Example: A booking created in July 2025 with travel date in May 2026 will be invoiced on the May 2026 travel date (if >= invoice_start_date)

**Fields:**
| Field | Description |
|-------|-------------|
| `name` | Rule name |
| `sellers` | Array of seller names |
| `invoice_start_date` | Only invoice bookings with travel_date >= this date |
| `execution_time` | Time of day when cron runs (e.g., `08:00:00`) |

---

### 2. Creation Date Rule (`creation_date`)

Sends booking data to Partner Solution **immediately** when the booking is confirmed.

**Behavior:**
- Triggered instantly on `BOOKING_CONFIRMED` webhook
- `invoice_start_date` filters by **creation date**: only bookings created >= this date are processed
- Example: If invoice_start_date=2026-01-01, bookings created before that date are not auto-invoiced

**Fields:**
| Field | Description |
|-------|-------------|
| `name` | Rule name |
| `sellers` | Array of seller names |
| `invoice_start_date` | Only invoice bookings created >= this date |

---

## Database Schema

```sql
CREATE TABLE invoice_rules (
  id UUID PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  invoice_date_type VARCHAR(20) NOT NULL,  -- 'travel_date' or 'creation_date'
  sellers TEXT[] NOT NULL,
  invoice_start_date DATE NOT NULL,
  execution_time TIME DEFAULT '08:00:00',  -- Only for travel_date rules
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

---

## API Endpoints

### CRUD Operations

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/invoices/rules` | GET | List all rules |
| `/api/invoices/rules/:id` | GET | Get single rule |
| `/api/invoices/rules` | POST | Create rule |
| `/api/invoices/rules/:id` | PUT | Update rule |
| `/api/invoices/rules/:id` | DELETE | Delete rule |

### Processing

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/invoices/rules/process-travel-date` | POST | Cron: Process travel_date rules for today |
| `/api/invoices/rules/process-booking/:bookingId` | POST | Process single booking for creation_date rules |

---

## Examples

### Create Travel Date Rule

```bash
POST /api/invoices/rules
{
  "name": "Civitatis Travel Rule",
  "invoice_date_type": "travel_date",
  "sellers": ["Civitatis", "GetYourGuide"],
  "invoice_start_date": "2026-01-01",
  "execution_time": "08:00:00"
}
```

### Create Creation Date Rule

```bash
POST /api/invoices/rules
{
  "name": "EnRoma Instant Rule",
  "invoice_date_type": "creation_date",
  "sellers": ["EnRoma.com"],
  "invoice_start_date": "2026-01-01"
}
```

### Run Travel Date Cron (manually or via scheduler)

```bash
POST /api/invoices/rules/process-travel-date?date=2026-01-26

# Dry run (see what would be processed)
POST /api/invoices/rules/process-travel-date?date=2026-01-26&dry_run=true
```

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        INVOICE RULES FLOW                            │
└─────────────────────────────────────────────────────────────────────┘

CREATION_DATE RULE:
  Booking Confirmed → Check seller → Match creation_date rule?
       │                                    │
       │                              NO ───┘ (skip)
       │                              YES
       ▼
  Check invoice_start_date vs creation_date
       │
       │ creation_date >= invoice_start_date
       ▼
  INSTANT: Send to Partner Solution (7-step flow)


TRAVEL_DATE RULE:
  Cron Job (daily at execution_time)
       │
       ▼
  Find bookings where latest_activity_date = TODAY
       │
       ▼
  Filter by seller (match travel_date rules)
       │
       ▼
  Filter by travel_date >= invoice_start_date
       │
       ▼
  Send each booking to Partner Solution (7-step flow)
```

---

## Files Reference

| File | Purpose |
|------|---------|
| `src/services/invoiceRulesService.ts` | Core rules logic |
| `src/routes/invoices.ts` | API endpoints |
| `src/migrations/create-invoice-rules.sql` | Database schema |
