# Partner Solution Integration - Invoice Flow

## Overview

This document describes the complete flow for sending booking data to Partner Solution (https://catture.partnersolution.it).

## API Endpoint

```
POST /api/invoices/send-to-partner
```

## Request Payload

```json
{
  "booking_id": "080404039",
  "confirmation_code": "CIV-80404039",
  "year_month": "2026-01",
  "customer": {
    "first_name": "Laura",
    "last_name": "Sanchez"
  },
  "activities": [{
    "activity_booking_id": "60222222",
    "product_title": "Tour Vaticano",
    "revenue": 95.00,
    "activity_date": "2026-01-28",
    "pax_adults": 1,
    "pax_children": 0,
    "pax_infants": 0
  }],
  "seller_title": "Civitatis"
}
```

## Complete 7-Step Flow

### Booking ID Formatting
- Define `booking_id_padded` = booking_id left-padded with `0` to 9 characters (when booking_id < 100000000)
- Use `booking_id_padded` in all Partner Solution fields that reference the booking ID (`codicefiscale`, `codicecliente`, `externalid`, `codicefilefornitore`, `codicefile`)

### Step 1: Create Account (Always New)

**Endpoint:** `POST /accounts`

**Payload:**
```json
{
  "cognome": "Sanchez",
  "nome": "Laura",
  "flagpersonafisica": 1,
  "codicefiscale": "080404039",
  "codiceagenzia": "7206",
  "stato": "INS",
  "tipocattura": "PS",
  "iscliente": 1,
  "isfornitore": 0,
  "nazione": "Spagna"
}
```

**Notes:**
- Always create a new account (don't search for existing)
- `codicefiscale` must be 9 characters: left-pad booking_id with `0` when booking_id < 100000000
- Account ID is used to link to Pratica
- `nazione` is determined from customer's phone number country code (e.g., +34 → "Spagna", +39 → "Italia")
- Fallback country: "Spagna" (Spain) when no phone number is available

---

### Step 2: Create Pratica (Status WP)

**Endpoint:** `POST /prt_praticas`

**Payload:**
```json
{
  "codicecliente": "080404039",
  "externalid": "080404039",
  "cognomecliente": "Sanchez",
  "nomecliente": "Laura",
  "codiceagenzia": "7206",
  "tipocattura": "PS",
  "datacreazione": "2026-01-23T12:00:00.000Z",
  "datamodifica": "2026-01-23T12:00:00.000Z",
  "stato": "WP",
  "descrizionepratica": "Tour UE ed Extra UE",
  "noteinterne": "Seller: Civitatis",
  "delivering": "commessa: 202601"
}
```

**Key Fields:**
| Field | Value | Description |
|-------|-------|-------------|
| `codicecliente` | booking_id_padded | Cliente reference (9 chars, left-padded) |
| `externalid` | booking_id_padded | Our booking reference (9 chars, left-padded) |
| `delivering` | `commessa: {codice_commessa}` | Links to Commessa by codice_commessa (e.g., `commessa: 202601` for Jan 2026). **Note:** space after colon is required |
| `stato` | `WP` | Work in Progress (updated to INS at end) |
| `tipocattura` | `PS` | Partner Solution |

---

### Step 3: Add Passeggero

**Endpoint:** `POST /prt_praticapasseggeros`

**Payload:**
```json
{
  "pratica": "/prt_praticas/<pratica_id>",
  "cognomepax": "Sanchez",
  "nomepax": "Laura",
  "annullata": 0,
  "iscontraente": 1
}
```

**Notes:**
- `pratica` is the IRI (e.g., `/prt_praticas/abc123...`)
- `iscontraente: 1` = contracting party

---

### Step 4: Add Servizio (ONE per booking)

**Endpoint:** `POST /prt_praticaservizios`

**Payload:**
```json
{
  "pratica": "/prt_praticas/<pratica_id>",
  "externalid": "080404039",
  "tiposervizio": "PKG",
  "tipovendita": "ORG",
  "regimevendita": "74T",
  "codicefornitore": "IT09802381005",
  "ragsocfornitore": "EnRoma Tours",
  "codicefilefornitore": "080404039",
  "datacreazione": "2026-01-23T12:00:00.000Z",
  "datainizioservizio": "2026-01-23",
  "datafineservizio": "2026-01-23",
  "duratant": 0,
  "duratagg": 1,
  "nrpaxadulti": 1,
  "nrpaxchild": 0,
  "nrpaxinfant": 0,
  "descrizione": "Tour UE ed Extra UE",
  "tipodestinazione": "MISTO",
  "annullata": 0,
  "codiceagenzia": "7206",
  "stato": "INS"
}
```

**Key Fields:**
| Field | Value | Description |
|-------|-------|-------------|
| `codicefornitore` | `IT09802381005` | Supplier tax code |
| `ragsocfornitore` | `EnRoma Tours` | Supplier name |
| `externalid` | booking_id_padded | Our booking reference (9 chars, left-padded) |
| `codicefilefornitore` | booking_id_padded | Our booking reference (9 chars, left-padded) |
| `tiposervizio` | `PKG` | Always PKG |
| `tipovendita` | `ORG` | Organized |
| `regimevendita` | `74T` | Tax regime |
| `tipodestinazione` | `MISTO` | Mixed destination type (CEE/Fuori CEE) |
| `datainizioservizio` | pratica creation date | Always pratica creation date (NOT activity date) |
| `datafineservizio` | pratica creation date | Always pratica creation date (NOT activity date) |
| `stato` | `INS` | Inserted |

**Notes:**
- **ONE Servizio per booking** (not per activity)
- `tiposervizio` is always `PKG`
- `nrpaxadulti` = total participants for the booking_id
- `nrpaxchild` and `nrpaxinfant` are always `0`
- `descrizione` is always `"Tour UE ed Extra UE"`
- `datainizioservizio` and `datafineservizio` are always the pratica creation date, never the activity travel date

---

### Step 5: Add Quota (ONE per booking)

**Endpoint:** `POST /prt_praticaservizioquotas`

**Payload:**
```json
{
  "servizio": "/prt_praticaservizios/<servizio_id>",
  "descrizionequota": "Tour UE ed Extra UE",
  "datavendita": "2026-01-23T12:00:00.000Z",
  "codiceisovalutacosto": "EUR",
  "quantitacosto": 1,
  "costovalutaprimaria": 95,
  "quantitaricavo": 1,
  "ricavovalutaprimaria": 95,
  "codiceisovalutaricavo": "EUR",
  "commissioniattivevalutaprimaria": 0,
  "commissionipassivevalutaprimaria": 0,
  "progressivo": 1,
  "annullata": 0,
  "codiceagenzia": "7206",
  "stato": "INS"
}
```

**Key Fields:**
| Field | Value | Description |
|-------|-------|-------------|
| `costovalutaprimaria` | `bookings.total_price` | Cost in EUR (from bookings table) |
| `ricavovalutaprimaria` | `bookings.total_price` | Revenue in EUR (from bookings table) |
| `codiceisovalutacosto` | `EUR` | Currency (uppercase) |
| `codiceisovalutaricavo` | `EUR` | Currency (uppercase) |

**Notes:**
- **ONE Quota per booking** (not per activity)
- `descrizionequota` is always `"Tour UE ed Extra UE"`
- Amount (`costovalutaprimaria`, `ricavovalutaprimaria`) = `bookings.total_price` (NOT sum of activity prices)

### Step 6: Add Movimento Finanziario

**Endpoint:** `POST /mov_finanziarios`

**Payload:**
```json
{
  "externalid": "080404039",
  "tipomovimento": "I",
  "codicefile": "080404039",
  "codiceagenzia": "7206",
  "tipocattura": "PS",
  "importo": 95,
  "datacreazione": "2026-01-23T12:00:00.000Z",
  "datamodifica": "2026-01-23T12:00:00.000Z",
  "datamovimento": "2026-01-23T12:00:00.000Z",
  "stato": "INS",
  "codcausale": "PAGBOK",
  "descrizione": "Tour UE ed Extra UE - CIV-80404039"
}
```

**Key Fields:**
| Field | Value | Description |
|-------|-------|-------------|
| `externalid` | booking_id_padded | Our booking reference (9 chars, left-padded) |
| `codicefile` | booking_id_padded | Our booking reference (9 chars, left-padded) |
| `tipomovimento` | `I` | Income (Incasso) |
| `codcausale` | `PAGBOK` | Payment cause code |
| `importo` | `bookings.total_price` | Total amount (from bookings table) |

**Notes:**
- `importo` = `bookings.total_price` (same value as Quota `costovalutaprimaria` and `ricavovalutaprimaria`)

---

### Step 7: Update Pratica to INS

**Endpoint:** `PUT /prt_praticas/<pratica_id>`

**Payload:** Same as Step 2 but with `stato: "INS"`

```json
{
  "codicecliente": "080404039",
  "externalid": "080404039",
  "cognomecliente": "Sanchez",
  "nomecliente": "Laura",
  "codiceagenzia": "7206",
  "tipocattura": "PS",
  "datacreazione": "2026-01-23T12:00:00.000Z",
  "datamodifica": "2026-01-23T12:00:00.000Z",
  "stato": "INS",
  "descrizionepratica": "Tour UE ed Extra UE",
  "noteinterne": "Seller: Civitatis",
  "delivering": "commessa: 202601"
}
```

---

## Commessa Auto-Creation

### Overview
Each Pratica must be linked to a Commessa via the `delivering` field. The system automatically creates Commesse for each month if they don't exist.

**Commessa Code Source**
- Commessa code format is `YYYY-MM`, but it is **not always the travel month**.
- `YYYY-MM` is the month **assigned to the Pratica** (based on seller rules in Tourmageddon).
- Example: for `EnRoma.com`, Pratica is created immediately on booking confirmation, so `YYYY-MM` uses the **booking creation month**, even if travel is next year.

### FacileWS3 API (Commesse Management)

**Base URL:** `https://facilews3.partnersolution.it/Api/Rest/{agencyCode}/Commesse`

**Authentication:** Requires JWT token from FacileWS login.

#### Login (FacileWS)
```bash
POST https://facilews.partnersolution.it/login.php
Content-Type: application/x-www-form-urlencoded

username=alberto@enroma.com&password=InSpe2026!

# Response: { "jwt": "eyJ..." }
```

#### List Commesse
```bash
GET https://facilews3.partnersolution.it/Api/Rest/7206/Commesse?Token=<jwt_token>

# Response:
{
  "data": {
    "@Pagina": [
      {
        "id": "B53D23E5-3DB1-4CC2-8659-EFAED539336D",
        "codice_commessa": "202601",
        "descrizione": "Gennaio 2026"
      },
      {
        "id": "6584B996-08CE-4B45-8A63-B9328EC070F4",
        "codice_commessa": "202608",
        "descrizione": "Agosto 2026"
      }
    ]
  },
  "code": 200
}
```

#### Create Commessa
```bash
POST https://facilews3.partnersolution.it/Api/Rest/7206/Commesse?Token=<jwt_token>
Content-Type: application/json

{
  "CodiceCommessa": "2026-08",
  "TitoloCommessa": "Agosto 2026",
  "DescrizioneCommessa": "Tour UE ed Extra UE - Agosto 2026",
  "ReferenteCommerciale": "",
  "NoteInterne": ""
}

# Response:
{
  "data": {
    "CommessaID": "6584B996-08CE-4B45-8A63-B9328EC070F4"
  },
  "code": 200
}
```

### Flow
1. Before creating a Pratica, system determines the Pratica month (`YYYY-MM`) based on seller rules
2. System checks if Commessa exists for that `YYYY-MM`
3. If not found, system creates the Commessa via FacileWS3
4. Pratica's `delivering` field is set to `commessa: {codice_commessa}` (e.g., `commessa: 202601`). **Note:** space after colon is required

### Italian Month Names
| Month | Italian |
|-------|---------|
| 01 | Gennaio |
| 02 | Febbraio |
| 03 | Marzo |
| 04 | Aprile |
| 05 | Maggio |
| 06 | Giugno |
| 07 | Luglio |
| 08 | Agosto |
| 09 | Settembre |
| 10 | Ottobre |
| 11 | Novembre |
| 12 | Dicembre |

---

## Configuration

### Environment Variables

```env
# Partner Solution (Catture API)
PARTNER_SOLUTION_USERNAME=enromacom
PARTNER_SOLUTION_PASSWORD={q95j(t,v(N6
PARTNER_SOLUTION_AGENCY_CODE=7206

# FacileWS (Commesse API)
FACILEWS_USERNAME=alberto@enroma.com
FACILEWS_PASSWORD=InSpe2026!
# (Optional legacy aliases: FACILE_WS3_USERNAME / FACILE_WS3_PASSWORD)
```

### Fixed Values

| Field | Value | Used In |
|-------|-------|---------|
| `codiceagenzia` | `7206` | All entities |
| `tipocattura` | `PS` | Account, Pratica, Movimento |
| `codicefornitore` | `IT09802381005` | Servizio |
| `ragsocfornitore` | `EnRoma Tours` | Servizio |
| `tiposervizio` | `PKG` | Servizio |
| `tipovendita` | `ORG` | Servizio |
| `regimevendita` | `74T` | Servizio |
| `tipodestinazione` | `MISTO` | Servizio |
| `codcausale` | `PAGBOK` | Movimento |
| `tipomovimento` | `I` | Movimento |

---

## Summary: One Booking = One Pratica

Each booking creates:
- **1 Account** (per booking)
- **1 Pratica** (per booking)
- **1 Passeggero** (per Pratica)
- **1 Servizio** (per Pratica)
- **1 Quota** (per Servizio)
- **1 Movimento Finanziario** (per Pratica)

**Amount** = `bookings.total_price` everywhere (Quota and Movimento)

---

## API Response Example

```json
{
  "success": true,
  "booking_id": "080404039",
  "confirmation_code": "CIV-80404039",
  "year_month": "2026-01",
  "pratica_id": "/prt_praticas/cad8910d-f859-11f0-bca8-000d3a3c3748",
  "account_id": "/accounts/cac2fa4b-f859-11f0-bca8-000d3a3c3748",
  "passeggero_id": "/prt_praticapasseggeros/caf0b976-f859-11f0-bca8-000d3a3c3748",
  "servizio_id": "/prt_praticaservizios/cb0ef4d8-f859-11f0-bca8-000d3a3c3748",
  "quota_id": "/prt_praticaservizioquotas/cb2faed3-f859-11f0-bca8-000d3a3c3748",
  "movimento_id": "/mov_finanziarios/cb46a176-f859-11f0-bca8-000d3a3c3748",
  "total_amount": 95
}
```

---

## Authentication

Partner Solution uses JWT authentication:

```bash
# Login
curl -X POST 'https://catture.partnersolution.it/login_check' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d '_username=enromacom&_password={q95j(t,v(N6'

# Returns: { "token": "eyJ..." }

# Use token in subsequent requests
curl -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/ld+json" \
  -H "Accept: application/ld+json" \
  'https://catture.partnersolution.it/prt_praticas'
```

---

## Files Reference

| File | Purpose |
|------|---------|
| `src/routes/invoices.ts` | Main endpoint (`/api/invoices/send-to-partner`) |
| `src/services/partnerSolutionService.ts` | Partner Solution API client |
| `src/types/invoice.types.ts` | TypeScript type definitions |
| `src/test-pratica-flow.ts` | Reference implementation (standalone test) |

---

## Troubleshooting

### Consistent IDs across entities
**Important:** `codicecliente` (pratica), `externalid`, `codicefilefornitore` (servizio), and `codicefile` (movimento) should all use the same value: `booking_id_padded` (9 chars, left-padded)

### Missing Movimento Finanziario
**Solution:** Step 6 must create movimento with `codcausale: 'PAGBOK'` and `tipomovimento: 'I'`

---

## Version History

| Date | Change |
|------|--------|
| 2026-01-23 | Initial implementation matching test-pratica-flow.ts |
| 2026-01-23 | Changed codicefornitore to IT09802381005 |
| 2026-01-23 | Changed codcausale to PAGBOK |
| 2026-01-23 | Always create new account, link via codicecliente |
| 2026-01-23 | Added Commessa auto-creation via FacileWS3 API |
| 2026-01-23 | Delivering field now uses Commessa UUID (e.g., `commessa:UUID`) |
| 2026-01-27 | Added `nazione` field to accounts (derived from customer phone country code) |
| 2026-01-27 | Fallback country: Spain when no phone number available |
