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
  "booking_id": 80404039,
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

### Step 1: Create Account (Always New)

**Endpoint:** `POST /accounts`

**Payload:**
```json
{
  "cognome": "Sanchez",
  "nome": "Laura",
  "flagpersonafisica": 1,
  "codicefiscale": "80404039",
  "codiceagenzia": "7206",
  "stato": "INS",
  "tipocattura": "PS",
  "iscliente": 1,
  "isfornitore": 0
}
```

**Notes:**
- Always create a new account (don't search for existing)
- `codicefiscale` = booking_id
- Account ID is used to link to Pratica

---

### Step 2: Create Pratica (Status WP)

**Endpoint:** `POST /prt_praticas`

**Payload:**
```json
{
  "codicecliente": "80404039",
  "externalid": "80404039",
  "cognomecliente": "Sanchez",
  "nomecliente": "Laura",
  "codiceagenzia": "7206",
  "tipocattura": "PS",
  "datacreazione": "2026-01-23T12:00:00.000Z",
  "datamodifica": "2026-01-23T12:00:00.000Z",
  "stato": "WP",
  "descrizionepratica": "Tour UE ed Extra UE",
  "noteinterne": "Seller: Civitatis",
  "delivering": "commessa:B53D23E5-3DB1-4CC2-8659-EFAED539336D"
}
```

**Key Fields:**
| Field | Value | Description |
|-------|-------|-------------|
| `codicecliente` | booking_id | Cliente reference (same as booking_id) |
| `externalid` | booking_id | Our booking reference |
| `delivering` | `commessa:{UUID}` | Links to Commessa by UUID (auto-created if missing) |
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

### Step 4: Add Servizio

**Endpoint:** `POST /prt_praticaservizios`

**Payload:**
```json
{
  "pratica": "/prt_praticas/<pratica_id>",
  "externalid": "80404039",
  "tiposervizio": "VIS",
  "tipovendita": "ORG",
  "regimevendita": "74T",
  "codicefornitore": "IT09802381005",
  "ragsocfornitore": "EnRoma Tours",
  "codicefilefornitore": "80404039",
  "datacreazione": "2026-01-23T12:00:00.000Z",
  "datainizioservizio": "2026-01-28",
  "datafineservizio": "2026-01-28",
  "duratant": 0,
  "duratagg": 1,
  "nrpaxadulti": 1,
  "nrpaxchild": 0,
  "nrpaxinfant": 0,
  "descrizione": "Tour Vaticano",
  "tipodestinazione": "CEENAZ",
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
| `codicefilefornitore` | booking_id | Our booking reference |
| `tiposervizio` | `VIS` | Visit/Tour |
| `tipovendita` | `ORG` | Organized |
| `regimevendita` | `74T` | Tax regime |
| `tipodestinazione` | `CEENAZ` | Destination type (valid values: CEENAZ, etc.) |
| `stato` | `INS` | Inserted |

**Invalid Values:**
- `tipodestinazione: 'MISTO'` - NOT VALID (API rejects it)

---

### Step 5: Add Quota

**Endpoint:** `POST /prt_praticaservizioquotas`

**Payload:**
```json
{
  "servizio": "/prt_praticaservizios/<servizio_id>",
  "descrizionequota": "Tour Vaticano",
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
| `costovalutaprimaria` | amount | Cost in EUR |
| `ricavovalutaprimaria` | amount | Revenue in EUR |
| `codiceisovalutacosto` | `EUR` | Currency (uppercase) |
| `codiceisovalutaricavo` | `EUR` | Currency (uppercase) |

---

**Repeat Steps 4 and 5 for each activity** in the request payload. Each activity gets its own Servizio + Quota.

### Step 6: Add Movimento Finanziario

**Endpoint:** `POST /mov_finanziarios`

**Payload:**
```json
{
  "externalid": "80404039",
  "tipomovimento": "I",
  "codicefile": "80404039",
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
| `tipomovimento` | `I` | Income (Incasso) |
| `codcausale` | `PAGBOK` | Payment cause code |
| `importo` | amount | Total amount |

---

### Step 7: Update Pratica to INS

**Endpoint:** `PUT /prt_praticas/<pratica_id>`

**Payload:** Same as Step 2 but with `stato: "INS"`

```json
{
  "codicecliente": "80404039",
  "externalid": "80404039",
  "cognomecliente": "Sanchez",
  "nomecliente": "Laura",
  "codiceagenzia": "7206",
  "tipocattura": "PS",
  "datacreazione": "2026-01-23T12:00:00.000Z",
  "datamodifica": "2026-01-23T12:00:00.000Z",
  "stato": "INS",
  "descrizionepratica": "Tour UE ed Extra UE",
  "noteinterne": "Seller: Civitatis",
  "delivering": "commessa:B53D23E5-3DB1-4CC2-8659-EFAED539336D"
}
```

---

## Commessa Auto-Creation

### Overview
Each Pratica must be linked to a Commessa via the `delivering` field. The system automatically creates Commesse for each month if they don't exist.

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
        "codice_commessa": "2026-01",
        "descrizione": "Gennaio 2026"
      },
      {
        "id": "6584B996-08CE-4B45-8A63-B9328EC070F4",
        "codice_commessa": "2026-08",
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
1. Before creating a Pratica, system checks if Commessa exists for the booking's travel month
2. If not found, system creates the Commessa via FacileWS3
3. Pratica's `delivering` field is set to `commessa:{UUID}`

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
| `tiposervizio` | `VIS` | Servizio |
| `tipovendita` | `ORG` | Servizio |
| `regimevendita` | `74T` | Servizio |
| `tipodestinazione` | `CEENAZ` | Servizio |
| `codcausale` | `PAGBOK` | Movimento |
| `tipomovimento` | `I` | Movimento |

---

## Monthly Pratica (Auto-Invoice)

The auto-invoice pipeline uses a monthly pratica model (see `src/services/invoiceService.ts`):
- One Pratica per `year_month`
- Each booking adds one Servizio + Quota per activity to that monthly Pratica
- Accounts are deduplicated by `customer_id` (externalid `CUST-<id>`) when available

---

## API Response Example

```json
{
  "success": true,
  "booking_id": 80404039,
  "confirmation_code": "CIV-80404039",
  "year_month": "2026-01",
  "pratica_id": "/prt_praticas/cad8910d-f859-11f0-bca8-000d3a3c3748",
  "account_id": "/accounts/cac2fa4b-f859-11f0-bca8-000d3a3c3748",
  "passeggero_id": "/prt_praticapasseggeros/caf0b976-f859-11f0-bca8-000d3a3c3748",
  "movimento_id": "/mov_finanziarios/cb46a176-f859-11f0-bca8-000d3a3c3748",
  "services": [
    {
      "activity_booking_id": "60222222",
      "servizio_id": "/prt_praticaservizios/cb0ef4d8-f859-11f0-bca8-000d3a3c3748",
      "quota_id": "/prt_praticaservizioquotas/cb2faed3-f859-11f0-bca8-000d3a3c3748",
      "amount": 95
    }
  ],
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

### Invalid tipodestinazione
```
Error: tipodestinazione: The value you selected is not a valid choice.
```
**Solution:** Use `CEENAZ` (not `MISTO`)

### Consistent IDs across entities
**Important:** `codicecliente` (pratica), `codicefilefornitore` (servizio), and `codicefile` (movimento) should all use the same value: `booking_id`

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
