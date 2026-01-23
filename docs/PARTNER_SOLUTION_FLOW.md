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
  "delivering": "commessa:2026-01"
}
```

**Key Fields:**
| Field | Value | Description |
|-------|-------|-------------|
| `codicecliente` | booking_id | Cliente reference (same as booking_id) |
| `externalid` | booking_id | Our booking reference |
| `delivering` | `commessa:{UUID}` | Links to Commessa by UUID |
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
  "delivering": "commessa:2026-01"
}
```

---

## Configuration

### Environment Variables

```env
PARTNER_SOLUTION_USERNAME=enromacom
PARTNER_SOLUTION_PASSWORD={q95j(t,v(N6
PARTNER_SOLUTION_AGENCY_CODE=7206
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
