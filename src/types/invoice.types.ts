/**
 * Invoice Types
 * TypeScript interfaces for the invoicing system and Partner Solution API integration
 * Model: ONE Pratica per MONTH, bookings add Servizi to monthly Pratica
 */

// ============================================
// ENUMS / UNION TYPES
// ============================================

export type InvoiceStatus = 'pending' | 'sent' | 'failed';
export type InvoiceType = 'INVOICE' | 'CREDIT_NOTE';
export type PSStatus = 'WP' | 'WS' | 'WPRELOAD' | 'INS' | 'MOD' | 'CANC';
export type PSRegime = '74T' | 'ORD';
export type PSSalesType = 'ORG' | 'INT';
export type PSServiceType = 'PKG' | 'STR' | 'VIS' | 'ASS' | 'NOL' | 'RIST' | 'EVE' | 'ESC' | 'GEN' | 'COSTI';
export type PSDestinationType = 'CEENAZ' | 'CEEINT' | 'FUORICEE' | 'ND'; // Italy, Europe, Rest of World, Not Defined
export type AuditAction = 'CREATED' | 'SENT' | 'FAILED' | 'RETRIED' | 'FINALIZED' | 'BOOKING_ADDED';

// ============================================
// DATABASE MODELS
// ============================================

/**
 * Monthly Pratica - One per month in Partner Solution
 */
export interface MonthlyPratica {
  id: string;
  year_month: string;                    // Format: 'YYYY-MM'
  partner_pratica_id: string | null;     // IRI from Partner Solution
  partner_pratica_number: string | null; // Human-readable number
  ps_status: PSStatus;
  total_amount: number;
  booking_count: number;
  ps_regime: PSRegime;
  ps_sales_type: PSSalesType;
  raw_response: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  finalized_at: string | null;
}

/**
 * Invoice - Tracks individual booking added to monthly Pratica
 */
export interface Invoice {
  id: string;
  monthly_pratica_id: string | null;
  booking_id: number;
  confirmation_code: string;
  invoice_type: InvoiceType;
  status: InvoiceStatus;
  total_amount: number;
  currency: string;
  customer_name: string | null;
  customer_email: string | null;
  seller_name: string | null;
  booking_creation_date: string | null;
  sent_at: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  activity_booking_id: number;
  partner_servizio_id: string | null;
  product_title: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  service_type: PSServiceType;
  activity_date: string | null;
  activity_time: string | null;
  participant_count: number;
  created_at: string;
}

export interface PartnerSolutionConfig {
  id: string;
  api_base_url: string;
  default_regime: PSRegime;
  default_sales_type: PSSalesType;
  default_service_type: PSServiceType;
  auto_invoice_enabled: boolean;
  auto_credit_note_enabled: boolean;
  auto_invoice_sellers: string[];
  default_account_id: string | null;
  default_customer_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceAuditLog {
  id: string;
  invoice_id: string | null;
  monthly_pratica_id: string | null;
  action: AuditAction;
  status_from: InvoiceStatus | PSStatus | null;
  status_to: InvoiceStatus | PSStatus;
  details: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  created_by: string | null;
}

// ============================================
// INVOICE WITH RELATIONS
// ============================================

export interface InvoiceWithLineItems extends Invoice {
  invoice_line_items?: InvoiceLineItem[];
  monthly_pratica?: MonthlyPratica;
}

export interface MonthlyPraticaWithInvoices extends MonthlyPratica {
  invoices?: Invoice[];
}

// ============================================
// BOOKING DATA FOR INVOICING
// ============================================

export interface BookingDataForInvoice {
  booking_id: number;
  confirmation_code: string;
  total_price: number;
  currency: string;
  creation_date: string;
  status: string;
  seller_name?: string;
  customer?: {
    customer_id: number;
    email: string;
    first_name: string;
    last_name: string;
    phone_number?: string;
  };
  activities: ActivityDataForInvoice[];
}

export interface ActivityDataForInvoice {
  activity_booking_id: number;
  product_id: number;
  product_title: string;
  total_price: number;
  start_date_time: string;
  end_date_time?: string;
  status: string;
  participant_count: number;
  rate_title?: string;
  activity_seller?: string;
}

// ============================================
// PARTNER SOLUTION API PAYLOADS
// ============================================

export interface PSLoginRequest {
  username: string;
  password: string;
}

export interface PSLoginResponse {
  token: string;
}

export interface PSPraticaPayload {
  // Required fields
  codiceagenzia: string;          // Agency code
  tipocattura: string;            // Capture type
  stato: PSStatus;                // Status: WP, WS, WPRELOAD, INS, MOD, CANC
  datacreazione: string;          // Creation date (ISO format)
  datamodifica: string;           // Modification date (ISO format)

  // Customer - either code OR name fields
  codicecliente?: string;         // Customer code (if existing)
  cognomecliente?: string;        // Customer last name
  nomecliente?: string;           // Customer first name

  // Optional fields
  descrizionepratica?: string;    // Practice description
  noteinterne?: string;           // Internal notes
  noteesterne?: string;           // External notes
  externalid?: string;            // External ID (e.g., booking confirmation code)
}

export interface PSPraticaResponse {
  '@context': string;
  '@id': string;                  // IRI of created pratica
  '@type': string;
  id: number;
  stato: PSStatus;
  datacreazione: string;
  datamodifica: string;
  codiceagenzia: string;
  externalid?: string;
  // ... other fields from API
}

export interface PSPraticaUpdatePayload {
  stato?: PSStatus;
  datamodifica?: string;
  noteinterne?: string;
  noteesterne?: string;
}

export interface PSServizioPayload {
  pratica: string;                // IRI of the parent pratica (e.g., "/prt_praticas/123")
  tiposervizio: PSServiceType;    // PKG, STR, VIS, ASS, NOL, RIST, EVE, ESC, GEN, COSTI
  tipovendita: PSSalesType;       // ORG, INT
  regimevendita: PSRegime;        // 74T, ORD
  datainizioservizio: string;     // Service start date (ISO format)
  datafineservizio: string;       // Service end date (ISO format)
  datacreazione: string;          // Creation date (ISO format) - REQUIRED
  nrpaxadulti: number;            // Number of adult passengers
  nrpaxchild: number;             // Number of child passengers
  nrpaxinfant: number;            // Number of infant passengers

  // Required supplier info
  codicefilefornitore: string;    // Supplier file code - REQUIRED
  ragsocfornitore: string;        // Supplier company name - REQUIRED

  // Required destination and duration
  tipodestinazione: string;       // Destination type (e.g., "CIT") - REQUIRED
  duratagg: number;               // Duration in days - REQUIRED
  duratant: number;               // Duration in nights - REQUIRED
  annullata: number;              // Cancelled flag (0 or 1) - REQUIRED

  // Optional fields
  codicefornitore?: string;       // Supplier code
  codiceisodestinazione?: string; // ISO destination code
  descrizione?: string;           // Service description
  sistemazione?: string;          // Accommodation
  trattamento?: string;           // Treatment/board type
  noteinterne?: string;           // Internal notes
  noteesterne?: string;           // External notes
}

export interface PSServizioResponse {
  '@context': string;
  '@id': string;                  // IRI of created servizio
  '@type': string;
  id: number;
  descrizione?: string;
  tiposervizio: string;
  // ... other fields from API
}

// Quota (pricing) payload for services
export interface PSQuotaPayload {
  servizio: string;               // IRI of the parent service (e.g., "/prt_praticaservizios/123")
  descrizionequota: string;       // Quota description
  datavendita: string;            // Sale date (ISO format)
  codiceisovalutacosto: string;   // Cost currency ISO code (e.g., "eur")
  codiceisovalutaricavo: string;  // Revenue currency ISO code (e.g., "eur")
  quantitacosto: number;          // Cost quantity
  quantitaricavo: number;         // Revenue quantity
  costovalutaprimaria: number;    // Cost in primary currency
  ricavovalutaprimaria: number;   // Revenue in primary currency
  progressivo: number;            // Progressive number
  annullata: number;              // Cancelled flag (0 or 1)
  commissioniattivevalutaprimaria: number;   // Active commissions - REQUIRED
  commissionipassivevalutaprimaria: number;  // Passive commissions - REQUIRED
}

export interface PSQuotaResponse {
  '@context': string;
  '@id': string;                  // IRI of created quota
  '@type': string;
  id: number;
  // ... other fields from API
}

// Passenger payload
export interface PSPasseggeroPayload {
  pratica: string;                // IRI of the parent pratica
  cognomepax: string;             // Passenger last name
  nomepax: string;                // Passenger first name
  datadinascita?: string;         // Date of birth (ISO format) - optional
  sesso?: 'm' | 'f';              // Gender - optional
  iscontraente: number;           // Is contracting party (0 or 1)
  cellulare?: string;             // Mobile phone
  annullata?: number;             // Cancelled flag (0 or 1)
}

export interface PSPasseggeroResponse {
  '@context': string;
  '@id': string;
  '@type': string;
  id: number;
}

export interface PSClientePayload {
  email: string;
  nome: string;
  cognome: string;
  telefono?: string | null;
  codiceFiscale?: string;
  partitaIva?: string;
}

export interface PSClienteResponse {
  '@context': string;
  '@id': string;                  // IRI of customer
  '@type': string;
  id: number;
  email: string;
  nome: string;
  cognome: string;
}

export interface PSHydraCollection<T> {
  '@context': string;
  '@id': string;
  '@type': string;
  'hydra:totalItems': number;
  'hydra:member': T[];
}

// Account (Anagrafica) payload for Partner Solution
export type PSAccountStatus = 'INS' | 'MOD' | 'CANC';

export interface PSAccountPayload {
  // Required fields
  cognome: string;                  // Last name or company name
  flagpersonafisica: number;        // 1 = natural person, 0 = company
  codicefiscale: string;            // Tax code (required, max 20 chars) - for foreigners use {COUNTRY}-{ID}
  iscliente: number;                // 1 = is customer
  isfornitore: number;              // 1 = is supplier
  ispromotore: number;              // 1 = is promoter
  codiceagenzia: string;            // Agency code
  stato: PSAccountStatus;           // INS/MOD/CANC
  tipocattura: string;              // Capture type (e.g., 'API')

  // Optional fields
  nome?: string;                    // First name
  partitaiva?: string;              // VAT number
  externalid?: string;              // External ID (our customer_id)
  datanascita?: string;             // Birth date (ISO format)
  sesso?: 'm' | 'f';                // Gender
  nazione?: string;                 // Country of residence (ISO 3-letter)
  nazionenascita?: string;          // Birth country (ISO 3-letter)
  cap?: string;                     // Postal code
  localitaresidenzacitta?: string;  // City
  indirizzo1?: string;              // Address line 1
  numerocivico?: string;            // Street number
  telefono?: string;                // Phone
  cellulare?: string;               // Mobile
  emailcomunicazioni?: string;      // Email
  provincia?: string;               // Province
}

export interface PSAccountResponse {
  '@context': string;
  '@id': string;                    // IRI of account (e.g., "/accounts/abc-123")
  '@type': string;
  id: string;                       // UUID
  cognome: string;
  nome: string | null;
  codicefiscale: string;
  partitaiva: string | null;
  externalid: string | null;
  flagpersonafisica: number;
  iscliente: number;
  isfornitore: number;
  ispromotore: string;              // Note: API returns string "0" or "1"
  nazione: string | null;
  emailcomunicazioni: string | null;
  cellulare: string | null;
  telefono: string | null;
  stato: PSAccountStatus;
  codiceagenzia: string;
  tipocattura: string;
  creazione: string;
  user: string;                     // User IRI
}

// ============================================
// SERVICE RESPONSES
// ============================================

export interface InvoiceResult {
  success: boolean;
  invoiceId?: string;
  monthlyPraticaId?: string;
  partnerPraticaId?: string;
  partnerPraticaNumber?: string;
  error?: string;
}

export interface BatchInvoiceResult {
  success: number[];
  failed: Array<{
    bookingId: number;
    error: string;
  }>;
}

// ============================================
// API REQUEST/RESPONSE TYPES
// ============================================

export interface InvoiceQueryFilters {
  startDate?: string;
  endDate?: string;
  status?: InvoiceStatus;
  invoiceType?: InvoiceType;
  seller?: string;
  customerEmail?: string;
  confirmationCode?: string;
  yearMonth?: string;              // Filter by monthly pratica
}

export interface MonthlyPraticaQueryFilters {
  yearMonth?: string;
  psStatus?: PSStatus;
  startMonth?: string;            // e.g., '2025-01'
  endMonth?: string;              // e.g., '2025-12'
}

export interface InvoiceStats {
  totalInvoices: number;
  pending: number;
  sent: number;
  failed: number;
  totalAmount: number;
  monthlyPraticas: {
    total: number;
    open: number;                  // WP status
    finalized: number;             // INS status
  };
}

export interface MonthlyPraticaStats {
  year_month: string;
  booking_count: number;
  total_amount: number;
  ps_status: PSStatus;
  partner_pratica_number: string | null;
}

export interface CreateInvoiceRequest {
  bookingId: number;
  triggeredBy?: string;
}

export interface CreateBatchInvoiceRequest {
  bookingIds: number[];
  triggeredBy?: string;
}

export interface FinalizePraticaRequest {
  yearMonth: string;
}

export interface UpdateConfigRequest {
  auto_invoice_enabled?: boolean;
  auto_credit_note_enabled?: boolean;
  auto_invoice_sellers?: string[];
  default_regime?: PSRegime;
  default_sales_type?: PSSalesType;
  default_service_type?: PSServiceType;
  default_account_id?: string;
  default_customer_id?: string;
}

// ============================================
// DOCFISCALE (SDI ELECTRONIC INVOICE) TYPES
// ============================================

export type DocfiscaleStatus = 'WP' | 'INS' | 'MOD' | 'CANC';
export type TipoOperazione = 'A' | 'P';  // A = Active (outgoing), P = Passive (incoming)
export type TipoDocumento = 'TD01' | 'TD04' | 'TD05' | 'TD24' | 'TD25';
// TD01 = Fattura, TD04 = Nota di credito, TD05 = Nota di debito
// TD24 = Fattura differita, TD25 = Fattura differita beni/servizi

/**
 * Docfiscale - SDI Electronic Invoice Header
 * Used for creating electronic invoices to be sent to SDI (Sistema di Interscambio)
 */
export interface PSDocfiscalePayload {
  // Required fields
  codiceagenzia: string;              // Agency code (e.g., 'demo2')
  stato: DocfiscaleStatus;            // Status: WP (draft), INS (inserted/final)
  tipooperazione: TipoOperazione;     // A = Active (outgoing invoice)
  tipodocumento: TipoDocumento;       // TD01 = Invoice, TD04 = Credit Note

  // Customer identification - use one of these
  partitaiva?: string;                // Customer VAT number (for companies)
  codicefiscale?: string;             // Customer fiscal code (for individuals)
  denominazione?: string;             // Company name (for companies)
  cognome?: string;                   // Last name (for individuals)
  nome?: string;                      // First name (for individuals)

  // Invoice metadata
  numerodocfiscale?: string;          // Invoice number (auto-generated if not provided)
  datadocfiscale: string;             // Invoice date (ISO format)
  oggetto?: string;                   // Subject
  causale?: string;                   // Description/reason for the invoice

  // Amounts (calculated from line items or provided directly)
  importototaledocumento: number;     // Total document amount
  arrotondamento?: number;            // Rounding adjustment

  // Optional fields
  externalid?: string;                // External ID (e.g., booking confirmation code)
  pratica?: string;                   // IRI of linked Pratica (if any)
  pec?: string;                       // Customer PEC email
  codicesdi?: string;                 // Customer SDI code
  nazione?: string;                   // Customer country (ISO 3-letter)
  cap?: string;                       // Postal code
  comune?: string;                    // City
  indirizzo?: string;                 // Address
  provincia?: string;                 // Province
}

export interface PSDocfiscaleResponse {
  '@context': string;
  '@id': string;                      // IRI of created docfiscale
  '@type': string;
  id: number;
  numerodocfiscale: string;
  datadocfiscale: string;
  stato: DocfiscaleStatus;
  tipooperazione: TipoOperazione;
  tipodocumento: TipoDocumento;
  denominazione?: string;
  cognome?: string;
  nome?: string;
  partitaiva?: string;
  codicefiscale?: string;
  importototaledocumento: number;
  externalid?: string;
  pratica?: string;
}

/**
 * DocfiscaleDettaglio - SDI Invoice Line Item
 */
export interface PSDocfiscaleDettaglioPayload {
  docfiscale: string;                 // IRI of parent docfiscale (e.g., "/docfiscales/123")
  numerolinea: number;                // Line number (1, 2, 3...)
  descrizione: string;                // Line item description
  quantita: number;                   // Quantity
  prezzounitario: string | number;    // Unit price (API accepts both)
  aliquotaiva?: number;               // VAT rate (22 for 22%)
  annullata?: number;                 // Cancelled flag (0 or 1)
  issoggettoritenuta?: number;        // Subject to withholding (0 or 1)
}

export interface PSDocfiscaleDettaglioResponse {
  '@context': string;
  '@id': string;                      // IRI of created line item
  '@type': string;
  id: number;
  descrizione: string;
  quantita: number;
  prezzounitario: number;
  aliquotaiva: number;
}

/**
 * DocfiscaleXML - SDI Transmission Record
 * Used to generate and send the FatturaPA XML to SDI
 */
export interface PSDocfiscaleXMLPayload {
  codiceagenzia: string;              // Agency code
  stato: 'INS';                       // Status (always INS for sending)
  docfiscaleid: string;               // UUID of the docfiscale to send
  tipomovimento: 'E' | 'R';           // E = Emission (send), R = Reception
  formatotrasmissione: 'FPR12' | 'FPA12';  // FPR12 = private, FPA12 = public admin
  codicedestinatario?: string;        // SDI destination code (0000000 for private)
}

export interface PSDocfiscaleXMLResponse {
  '@context': string;
  '@id': string;
  '@type': string;
  id: number;
  docfiscaleid: number;
  stato: string;
  tipomovimento: string;
  formatotrasmissione: string;
  nomefileinviato?: string;           // Generated XML filename
  datainvio?: string;                 // Submission date
  esitotrasmissione?: string;         // Transmission result
}

/**
 * DocfiscaleXMLNotifica - SDI Response Notification
 * Received from SDI with the result of the transmission
 */
export interface PSDocfiscaleXMLNotificaResponse {
  '@context': string;
  '@id': string;
  '@type': string;
  id: number;
  docfiscalexml: string;              // IRI of the docfiscalexml
  tiponotifica: string;               // Notification type (RC, NS, MC, etc.)
  datanotifica: string;               // Notification date
  descrizionenotifica?: string;       // Notification description
  nomefilenotifica?: string;          // Notification file name
}
