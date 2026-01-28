/**
 * Invoice Routes
 * API endpoints for invoice management and Partner Solution integration
 */

import { Router, Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { invoiceService } from '../services/invoiceService';
import { partnerSolutionService } from '../services/partnerSolutionService';
import { invoiceRulesService } from '../services/invoiceRulesService';
import { supabase } from '../config/supabase';
import { getCountryNameForPS } from '../utils/countryFromPhone';
import {
  CreateInvoiceRequest,
  CreateBatchInvoiceRequest,
  InvoiceQueryFilters,
  UpdateConfigRequest,
  InvoiceStatus,
  PSStatus,
} from '../types/invoice.types';

const router = Router();

// ============================================
// MIDDLEWARE
// ============================================

/**
 * API Key validation middleware
 */
const validateApiKey = (req: Request, res: Response, next: NextFunction): void => {
  const apiKey = req.headers['x-api-key'] as string;
  const validApiKey = process.env.INVOICE_API_KEY;

  if (!validApiKey) {
    console.warn('[Invoices] INVOICE_API_KEY not configured, allowing request');
    next();
    return;
  }

  if (apiKey !== validApiKey) {
    res.status(401).json({
      success: false,
      error: 'Invalid or missing API key',
    });
    return;
  }

  next();
};

// ============================================
// INVOICE LIST & QUERY
// ============================================

/**
 * GET /api/invoices
 * List invoices with optional filters
 */
router.get('/api/invoices', validateApiKey, async (req: Request, res: Response) => {
  try {
    const filters: InvoiceQueryFilters = {
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      status: req.query.status as InvoiceStatus,
      customerEmail: req.query.customerEmail as string,
      confirmationCode: req.query.confirmationCode as string,
    };

    const invoices = await invoiceService.queryInvoices(filters);

    res.json({
      success: true,
      data: invoices,
      count: invoices.length,
    });
  } catch (error) {
    console.error('[Invoices] Error fetching invoices:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/invoices/stats
 * Get invoice statistics
 */
router.get('/api/invoices/stats', validateApiKey, async (req: Request, res: Response) => {
  try {
    const stats = await invoiceService.getStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('[Invoices] Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// MONTHLY PRATICAS
// ============================================

/**
 * GET /api/invoices/monthly-praticas
 * List monthly praticas with optional filters
 */
router.get('/api/invoices/monthly-praticas', validateApiKey, async (req: Request, res: Response) => {
  try {
    const filters = {
      startMonth: req.query.startMonth as string,
      endMonth: req.query.endMonth as string,
      psStatus: req.query.psStatus as PSStatus,
    };

    const praticas = await invoiceService.getMonthlyPraticas(filters);

    res.json({
      success: true,
      data: praticas,
      count: praticas.length,
    });
  } catch (error) {
    console.error('[Invoices] Error fetching monthly praticas:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/invoices/monthly-praticas/:yearMonth
 * Get a specific monthly pratica with all its invoices
 */
router.get('/api/invoices/monthly-praticas/:yearMonth', validateApiKey, async (req: Request, res: Response) => {
  try {
    const yearMonth = req.params.yearMonth;

    // Validate format YYYY-MM
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      res.status(400).json({
        success: false,
        error: 'Invalid yearMonth format. Use YYYY-MM',
      });
      return;
    }

    const pratica = await invoiceService.getMonthlyPraticaWithInvoices(yearMonth);

    if (!pratica) {
      res.status(404).json({
        success: false,
        error: `Monthly pratica not found for ${yearMonth}`,
      });
      return;
    }

    res.json({
      success: true,
      data: pratica,
    });
  } catch (error) {
    console.error('[Invoices] Error fetching monthly pratica:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/invoices/monthly-praticas/:yearMonth/finalize
 * Finalize a monthly pratica (change status from WP to INS)
 */
router.post('/api/invoices/monthly-praticas/:yearMonth/finalize', validateApiKey, async (req: Request, res: Response) => {
  try {
    const yearMonth = req.params.yearMonth;

    // Validate format YYYY-MM
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      res.status(400).json({
        success: false,
        error: 'Invalid yearMonth format. Use YYYY-MM',
      });
      return;
    }

    const result = await invoiceService.finalizePratica(yearMonth);

    if (result.success) {
      res.json({
        success: true,
        monthlyPraticaId: result.monthlyPraticaId,
        partnerPraticaId: result.partnerPraticaId,
        partnerPraticaNumber: result.partnerPraticaNumber,
        message: `Monthly pratica for ${yearMonth} has been finalized`,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('[Invoices] Error finalizing monthly pratica:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/invoices/booking/:bookingId
 * Get invoices for a specific booking
 */
router.get('/api/invoices/booking/:bookingId', validateApiKey, async (req: Request, res: Response) => {
  try {
    const bookingId = parseInt(req.params.bookingId);

    if (isNaN(bookingId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid booking ID',
      });
      return;
    }

    const invoices = await invoiceService.getInvoicesForBooking(bookingId);

    res.json({
      success: true,
      data: invoices,
    });
  } catch (error) {
    console.error('[Invoices] Error fetching invoice:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// NOTE: /api/invoices/:id route moved to end of file to avoid matching specific routes

// ============================================
// INVOICE CREATION
// ============================================

/**
 * POST /api/invoices/create
 * Create invoice for a single booking
 */
router.post('/api/invoices/create', validateApiKey, async (req: Request, res: Response) => {
  try {
    const { bookingId, triggeredBy } = req.body as CreateInvoiceRequest;

    if (!bookingId) {
      res.status(400).json({
        success: false,
        error: 'bookingId is required',
      });
      return;
    }

    const result = await invoiceService.createInvoiceFromBooking(
      bookingId,
      triggeredBy || 'manual'
    );

    if (result.success) {
      res.json({
        success: true,
        invoiceId: result.invoiceId,
        partnerPraticaId: result.partnerPraticaId,
        partnerPraticaNumber: result.partnerPraticaNumber,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('[Invoices] Error creating invoice:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/invoices/create-batch
 * Create invoices for multiple bookings
 */
router.post('/api/invoices/create-batch', validateApiKey, async (req: Request, res: Response) => {
  try {
    const { bookingIds, triggeredBy } = req.body as CreateBatchInvoiceRequest;

    if (!bookingIds || !Array.isArray(bookingIds) || bookingIds.length === 0) {
      res.status(400).json({
        success: false,
        error: 'bookingIds array is required and must not be empty',
      });
      return;
    }

    const results = {
      success: [] as number[],
      failed: [] as Array<{ bookingId: number; error: string }>,
    };

    for (const bookingId of bookingIds) {
      const result = await invoiceService.createInvoiceFromBooking(
        bookingId,
        triggeredBy || 'batch'
      );

      if (result.success) {
        results.success.push(bookingId);
      } else {
        results.failed.push({
          bookingId,
          error: result.error || 'Unknown error',
        });
      }
    }

    res.json({
      success: true,
      results,
      summary: {
        total: bookingIds.length,
        succeeded: results.success.length,
        failed: results.failed.length,
      },
    });
  } catch (error) {
    console.error('[Invoices] Error creating batch invoices:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get Commessa UUID for a given year_month
 * Commesse are created in Partner Solution's FacileWS3 API
 * The delivering field should use format: commessa:{UUID} (CommessaID)
 */

// Cache for commessa UUIDs (in-memory)
const COMMESSA_CACHE: Record<string, string> = {
  '2026-01': 'B53D23E5-3DB1-4CC2-8659-EFAED539336D',
};

// Cache for FacileWS JWT token
let facileWsToken: string | null = null;
let facileWsTokenExpiry: number = 0;

async function getFacileWsToken(): Promise<string> {
  // Check if token is still valid (refresh 5 mins before expiry)
  if (facileWsToken && Date.now() < facileWsTokenExpiry - 300000) {
    return facileWsToken;
  }

  const loginUrl = 'https://facilews.partnersolution.it/login.php';
  const username =
    process.env.FACILEWS_USERNAME ||
    process.env.FACILE_WS3_USERNAME ||
    'alberto@enroma.com';
  const password =
    process.env.FACILEWS_PASSWORD ||
    process.env.FACILE_WS3_PASSWORD ||
    'InSpe2026!';

  console.log('  Authenticating with FacileWS...');
  const params = new URLSearchParams();
  params.append('username', username);
  params.append('password', password);

  const response = await axios.post(loginUrl, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  facileWsToken = response.data.jwt;
  // Token typically valid for 24 hours
  facileWsTokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
  console.log('  ✅ FacileWS authenticated');

  return facileWsToken!;
}

async function listCommesse(): Promise<any[]> {
  const token = await getFacileWsToken();
  const agencyCode = process.env.PARTNER_SOLUTION_AGENCY_CODE || '7206';
  const facileUrl = 'https://facilews3.partnersolution.it';

  const response = await axios.get(
    `${facileUrl}/Api/Rest/${agencyCode}/Commesse`,
    { params: { Token: token } }
  );

  // Response structure: { data: { '@Pagina': [...] }, code: 200 }
  return response.data?.data?.['@Pagina'] || [];
}

async function createCommessa(yearMonth: string): Promise<string> {
  const token = await getFacileWsToken();
  const agencyCode = process.env.PARTNER_SOLUTION_AGENCY_CODE || '7206';
  const facileUrl = 'https://facilews3.partnersolution.it';

  // Parse year and month for title
  const [year, month] = yearMonth.split('-');
  const monthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
                      'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  const monthName = monthNames[parseInt(month) - 1] || month;

  console.log(`  Creating new Commessa for ${yearMonth}...`);
  const response = await axios.post(
    `${facileUrl}/Api/Rest/${agencyCode}/Commesse`,
    {
      CodiceCommessa: yearMonth,
      TitoloCommessa: `${monthName} ${year}`,
      DescrizioneCommessa: `Tour UE ed Extra UE - ${monthName} ${year}`,
      ReferenteCommerciale: '',
      NoteInterne: ''
    },
    {
      params: { Token: token },
      headers: { 'Content-Type': 'application/json' }
    }
  );

  // Response structure: { data: { CommessaID: '...' }, code: 200 }
  const commessaId = response.data?.data?.CommessaID;
  console.log(`  ✅ Commessa created: ${commessaId}`);

  return commessaId;
}

async function getCommessaId(yearMonth: string): Promise<string> {
  // First check cache
  if (COMMESSA_CACHE[yearMonth]) {
    console.log(`  Using cached Commessa for ${yearMonth}: ${COMMESSA_CACHE[yearMonth]}`);
    return COMMESSA_CACHE[yearMonth];
  }

  // List all commesse and find the one matching yearMonth
  const commesse = await listCommesse();
  console.log(`  Found ${commesse.length} commesse in FacileWS3`);

  // Log all commesse for debugging
  commesse.forEach((c: any, i: number) => {
    console.log(`    [${i}] codice: ${c.codice_commessa || c.CodiceCommessa}, id: ${c.id || c.Id}`);
  });

  // Fields in list: codice_commessa (lowercase with underscore), id
  const existing = commesse.find((c: any) =>
    c.codice_commessa === yearMonth || c.CodiceCommessa === yearMonth
  );

  if (existing) {
    const id = existing.id || existing.Id;
    console.log(`  ✅ Found existing Commessa for ${yearMonth}: ${id}`);
    COMMESSA_CACHE[yearMonth] = id;
    return id;
  }

  // Not found - create new commessa
  console.log(`  Commessa ${yearMonth} not found, creating...`);
  const newId = await createCommessa(yearMonth);
  if (!newId) {
    throw new Error(`Failed to create Commessa for ${yearMonth}`);
  }
  console.log(`  ✅ Created new Commessa for ${yearMonth}: ${newId}`);
  COMMESSA_CACHE[yearMonth] = newId;
  return newId;
}

/**
 * POST /api/invoices/send-to-partner
 * Send booking to Partner Solution following the exact flow from test-pratica-flow.ts:
 * 1. Check/Create Account
 * 2. Create Pratica (status WP)
 * 3. Add Passeggero
 * 4. Add Servizio
 * 5. Add Quota
 * 6. Add Movimento Finanziario
 * 7. Update Pratica to INS
 */
router.post('/api/invoices/send-to-partner', validateApiKey, async (req: Request, res: Response) => {
  try {
    const {
      booking_id,
      confirmation_code,
      year_month: providedYearMonth,
      customer,          // { first_name, last_name }
      activities,        // [{ activity_booking_id, product_title, revenue, activity_date, pax_adults, pax_children, pax_infants }]
      seller_title,      // Optional seller name for notes
    } = req.body;

    if (!booking_id || !confirmation_code) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: booking_id, confirmation_code',
      });
      return;
    }

    // Fetch booking and customer data from database
    const { data: bookingData, error: bookingError } = await supabase
      .from('bookings')
      .select('total_price')
      .eq('booking_id', booking_id)
      .single();

    if (bookingError || !bookingData) {
      res.status(404).json({
        success: false,
        error: `Booking ${booking_id} not found in database`,
      });
      return;
    }

    // Fetch customer phone for country detection
    const { data: customerData } = await supabase
      .from('booking_customers')
      .select('customers(phone_number)')
      .eq('booking_id', booking_id)
      .single();

    const customerPhone = (customerData as any)?.customers?.phone_number || null;
    const customerCountry = getCountryNameForPS(customerPhone);

    const totalAmount = bookingData.total_price || 0;
    const agencyCode = process.env.PARTNER_SOLUTION_AGENCY_CODE || '7206';
    const now = new Date().toISOString();
    const customerName = {
      firstName: customer?.first_name || 'N/A',
      lastName: customer?.last_name || 'N/A',
    };

    // Pad booking_id to 9 characters with leading zeros (per spec)
    const bookingIdPadded = String(booking_id).padStart(9, '0');

    let resolvedYearMonth = providedYearMonth as string | undefined;

    try {
      const praticaMonth = await invoiceService.getPraticaYearMonthForBooking(Number(booking_id));
      resolvedYearMonth = praticaMonth.yearMonth;
      if (providedYearMonth && providedYearMonth !== resolvedYearMonth) {
        console.log(`[Invoices] Overriding provided year_month ${providedYearMonth} with ${resolvedYearMonth} based on rules`);
      }
    } catch (error) {
      console.warn('[Invoices] Failed to resolve pratica month, falling back to provided year_month:', error);
    }

    if (!resolvedYearMonth) {
      const fallbackDate = new Date();
      resolvedYearMonth = `${fallbackDate.getUTCFullYear()}-${String(fallbackDate.getUTCMonth() + 1).padStart(2, '0')}`;
    }

    // Get axios client for direct API calls
    const client = await (partnerSolutionService as any).getClient();

    // Ensure Commessa exists for this year_month (creates if not exists)
    console.log(`\n  Ensuring Commessa exists for ${resolvedYearMonth}...`);
    const commessaId = await getCommessaId(resolvedYearMonth); // Creates the Commessa if it doesn't exist
    const nrCommessa = resolvedYearMonth.replace('-', ''); // Convert 2026-01 to 202601
    const deliveringValue = `commessa: ${nrCommessa}`; // Format: "commessa: {codice}" with space after colon

    console.log('\n=== Sending to Partner Solution ===');
    console.log(`Booking: ${confirmation_code}`);
    console.log(`Customer: ${customerName.firstName} ${customerName.lastName}`);
    console.log(`Agency: ${agencyCode}`);
    console.log(`Commessa: ${resolvedYearMonth} (nrcommessa: ${nrCommessa})`);
    console.log(`Delivering field: ${deliveringValue}\n`);

    // Step 1: Always create new Account
    console.log('Step 1: Creating new account...');
    console.log(`  Country from phone: ${customerCountry} (phone: ${customerPhone || 'none'})`);
    const accountPayload = {
      cognome: customerName.lastName,
      nome: customerName.firstName,
      flagpersonafisica: 1,
      codicefiscale: bookingIdPadded,  // Must be 9 chars, left-padded with 0
      codiceagenzia: agencyCode,
      stato: 'INS',
      tipocattura: 'PS',
      iscliente: 1,
      isfornitore: 0,
      nazione: customerCountry,  // Country from phone number, fallback: Spain
    };

    const accountResponse = await client.post('/accounts', accountPayload);
    const accountIri = accountResponse.data['@id'];
    const accountId = accountResponse.data.id;
    console.log('  ✅ Account created:', accountIri, '(id:', accountId, ')');

    // Step 2: Create Pratica (status WP) - codicecliente links to Account
    console.log('\nStep 2: Creating Pratica...');
    const praticaPayload = {
      codicecliente: accountIri,  // Link to Account IRI
      externalid: bookingIdPadded,     // Must be 9 chars, left-padded with 0
      cognomecliente: customerName.lastName,
      nomecliente: customerName.firstName,
      codiceagenzia: agencyCode,
      tipocattura: 'PS',
      datacreazione: now,
      datamodifica: now,
      stato: 'WP',
      descrizionepratica: 'Tour UE ed Extra UE',
      noteinterne: seller_title ? `Seller: ${seller_title}` : null,
      delivering: deliveringValue
    };

    const praticaResponse = await client.post('/prt_praticas', praticaPayload);
    const praticaIri = praticaResponse.data['@id'];
    console.log('  ✅ Pratica created:', praticaIri);

    // Step 3: Add Passeggero
    console.log('\nStep 3: Adding Passeggero...');
    const passeggeroPayload = {
      pratica: praticaIri,
      cognomepax: customerName.lastName,
      nomepax: customerName.firstName,
      annullata: 0,
      iscontraente: 1
    };

    const passeggeroResponse = await client.post('/prt_praticapasseggeros', passeggeroPayload);
    const passeggeroIri = passeggeroResponse.data['@id'];
    console.log('  ✅ Passeggero added:', passeggeroIri);

    // Step 4: Add ONE Servizio per booking (amount = bookings.total_price)
    console.log('\nStep 4: Adding Servizio...');
    const praticaCreationDate = now.split('T')[0];

    const servizioPayload = {
      pratica: praticaIri,
      externalid: bookingIdPadded,
      tiposervizio: 'PKG',
      tipovendita: 'ORG',
      regimevendita: '74T',
      codicefornitore: 'IT09802381005',
      ragsocfornitore: 'EnRoma Tours',
      codicefilefornitore: bookingIdPadded,
      datacreazione: now,
      datainizioservizio: praticaCreationDate,
      datafineservizio: praticaCreationDate,
      duratant: 0,
      duratagg: 1,
      nrpaxadulti: 1,
      nrpaxchild: 0,
      nrpaxinfant: 0,
      descrizione: 'Tour UE ed Extra UE',
      tipodestinazione: 'MISTO',
      annullata: 0,
      codiceagenzia: agencyCode,
      stato: 'INS'
    };

    const servizioResponse = await client.post('/prt_praticaservizios', servizioPayload);
    const servizioIri = servizioResponse.data['@id'];
    console.log('  ✅ Servizio added:', servizioIri);

    // Step 5: Add ONE Quota per booking (amount = bookings.total_price)
    console.log('\nStep 5: Adding Quota...');
    const quotaPayload = {
      servizio: servizioIri,
      descrizionequota: 'Tour UE ed Extra UE',
      datavendita: now,
      codiceisovalutacosto: 'EUR',
      quantitacosto: 1,
      costovalutaprimaria: totalAmount,
      quantitaricavo: 1,
      ricavovalutaprimaria: totalAmount,
      codiceisovalutaricavo: 'EUR',
      commissioniattivevalutaprimaria: 0,
      commissionipassivevalutaprimaria: 0,
      progressivo: 1,
      annullata: 0,
      codiceagenzia: agencyCode,
      stato: 'INS'
    };

    const quotaResponse = await client.post('/prt_praticaservizioquotas', quotaPayload);
    const quotaIri = quotaResponse.data['@id'];
    console.log('  ✅ Quota added:', quotaIri);

    // Step 6: Add Movimento Finanziario
    console.log('\nStep 6: Adding Movimento Finanziario...');
    const movimentoPayload = {
      externalid: bookingIdPadded,    // Must be 9 chars, left-padded with 0
      tipomovimento: 'I',
      codicefile: bookingIdPadded,    // Must be 9 chars, left-padded with 0
      codiceagenzia: agencyCode,
      tipocattura: 'PS',
      importo: totalAmount,
      datacreazione: now,
      datamodifica: now,
      datamovimento: now,
      stato: 'INS',
      codcausale: 'PAGBOK',
      descrizione: `Tour UE ed Extra UE - ${confirmation_code}`
    };

    const movimentoResponse = await client.post('/mov_finanziarios', movimentoPayload);
    console.log('  ✅ Movimento added:', movimentoResponse.data['@id']);

    // Step 7: Update Pratica to INS
    console.log('\nStep 7: Updating Pratica status to INS...');
    await client.put(praticaIri, {
      ...praticaPayload,
      stato: 'INS'
    });
    console.log('  ✅ Pratica status updated to INS');

    console.log('\n========================================');
    console.log('=== SUCCESS - DATA SENT TO PARTNER ===');
    console.log('========================================');
    console.log('Pratica IRI:', praticaIri);
    console.log('Booking:', confirmation_code);
    console.log('Customer:', `${customerName.firstName} ${customerName.lastName}`);
    console.log('Amount: €', totalAmount);
    console.log('Commessa:', `${resolvedYearMonth} (${commessaId})`);
    console.log('Agency:', agencyCode);

    res.json({
      success: true,
      booking_id,
      confirmation_code,
      year_month: resolvedYearMonth,
      pratica_id: praticaIri,
      account_id: accountIri,
      passeggero_id: passeggeroIri,
      servizio_id: servizioIri,
      quota_id: quotaIri,
      movimento_id: movimentoResponse.data['@id'],
      total_amount: totalAmount,
    });
  } catch (error: any) {
    console.error('\n=== ERROR ===');
    console.error('Message:', error.message);
    if (error.response?.data) {
      console.error('API Response:', JSON.stringify(error.response.data, null, 2));
    }
    res.status(500).json({
      success: false,
      error: 'Failed to send to Partner Solution',
      details: error.message,
      api_response: error.response?.data,
    });
  }
});

/**
 * GET /api/invoices/debug-pratica/:praticaId
 * Debug endpoint to fetch Pratica from Partner Solution and check delivering field
 */
router.get('/api/invoices/debug-pratica/:praticaId', async (req: Request, res: Response) => {
  try {
    const praticaId = req.params.praticaId;
    const client = await (partnerSolutionService as any).getClient();

    const response = await client.get(`/prt_praticas/${praticaId}`);

    res.json({
      success: true,
      pratica: {
        id: response.data.id,
        '@id': response.data['@id'],
        externalid: response.data.externalid,
        cognomecliente: response.data.cognomecliente,
        nomecliente: response.data.nomecliente,
        stato: response.data.stato,
        delivering: response.data.delivering,
        descrizionepratica: response.data.descrizionepratica,
        datacreazione: response.data.datacreazione
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      response: error.response?.data
    });
  }
});

/**
 * GET /api/invoices/debug-commessa/:yearMonth
 * Debug endpoint to check Commessa lookup
 */
router.get('/api/invoices/debug-commessa/:yearMonth', async (req: Request, res: Response) => {
  try {
    const yearMonth = req.params.yearMonth;
    console.log(`\n=== Debug Commessa for ${yearMonth} ===`);

    // List all commesse
    const commesse = await listCommesse();
    console.log(`Found ${commesse.length} commesse`);

    // Find matching commessa
    const existing = commesse.find((c: any) =>
      c.codice_commessa === yearMonth || c.CodiceCommessa === yearMonth
    );

    const commessaId = existing ? (existing.id || existing.Id) : null;

    res.json({
      success: true,
      yearMonth,
      commesse_count: commesse.length,
      commesse: commesse.map((c: any) => ({
        codice: c.codice_commessa || c.CodiceCommessa,
        id: c.id || c.Id
      })),
      found_commessa: existing ? {
        codice: existing.codice_commessa || existing.CodiceCommessa,
        id: commessaId
      } : null,
      delivering_value: commessaId ? `commessa:${commessaId}` : null
    });
  } catch (error: any) {
    console.error('Debug commessa error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      response: error.response?.data
    });
  }
});

/**
 * POST /api/invoices/credit-note
 * Create credit note for a cancelled booking
 */
router.post('/api/invoices/credit-note', validateApiKey, async (req: Request, res: Response) => {
  try {
    const { bookingId, activityBookingId, triggeredBy } = req.body;

    if (!bookingId) {
      res.status(400).json({
        success: false,
        error: 'bookingId is required',
      });
      return;
    }

    const result = await invoiceService.createCreditNote(
      bookingId,
      activityBookingId,
      triggeredBy || 'manual'
    );

    if (result.success) {
      res.json({
        success: true,
        invoiceId: result.invoiceId,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('[Invoices] Error creating credit note:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// RETRY OPERATIONS
// ============================================

/**
 * POST /api/invoices/retry-failed
 * Retry all failed invoices
 */
router.post('/api/invoices/retry-failed', validateApiKey, async (req: Request, res: Response) => {
  try {
    const maxRetries = parseInt(req.query.maxRetries as string) || 3;

    const results = await invoiceService.retryFailedInvoices(maxRetries);

    res.json({
      success: true,
      results,
      summary: {
        succeeded: results.success.length,
        failed: results.failed.length,
      },
    });
  } catch (error) {
    console.error('[Invoices] Error retrying invoices:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/invoices/:id/retry
 * Retry a specific failed invoice
 */
router.post('/api/invoices/:id/retry', validateApiKey, async (req: Request, res: Response) => {
  try {
    const { data: invoice } = await supabase
      .from('invoices')
      .select('booking_id, status')
      .eq('id', req.params.id)
      .single();

    if (!invoice) {
      res.status(404).json({
        success: false,
        error: 'Invoice not found',
      });
      return;
    }

    if (invoice.status !== 'failed') {
      res.status(400).json({
        success: false,
        error: `Cannot retry invoice with status: ${invoice.status}`,
      });
      return;
    }

    const result = await invoiceService.createInvoiceFromBooking(
      invoice.booking_id,
      'manual-retry'
    );

    if (result.success) {
      res.json({
        success: true,
        invoiceId: result.invoiceId,
        partnerPraticaId: result.partnerPraticaId,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('[Invoices] Error retrying invoice:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// CONFIGURATION
// ============================================

/**
 * GET /api/invoices/config
 * Get current configuration
 */
router.get('/api/invoices/config', validateApiKey, async (req: Request, res: Response) => {
  try {
    const config = await invoiceService.getConfig();

    res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    console.error('[Invoices] Error fetching config:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/invoices/sellers
 * Get list of all unique sellers for invoice rules configuration
 */
router.get('/api/invoices/sellers', validateApiKey, async (req: Request, res: Response) => {
  try {
    // Get unique activity_seller values (not activity_supplier)
    // Need to paginate to get all values
    let allSellers: string[] = [];
    let offset = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: batch } = await supabase
        .from('activity_bookings')
        .select('activity_seller')
        .not('activity_seller', 'is', null)
        .range(offset, offset + batchSize - 1);

      if (batch && batch.length > 0) {
        allSellers = allSellers.concat(batch.map(d => d.activity_seller).filter(Boolean));
        offset += batchSize;
        hasMore = batch.length === batchSize;
      } else {
        hasMore = false;
      }
    }

    const uniqueSellers = [...new Set(allSellers)].sort();

    // Get current config
    const { data: config } = await supabase
      .from('partner_solution_config')
      .select('auto_invoice_sellers, excluded_sellers')
      .single();

    res.json({
      success: true,
      sellers: uniqueSellers,
      auto_invoice_sellers: config?.auto_invoice_sellers || [],
      excluded_sellers: (config as any)?.excluded_sellers || [],
    });
  } catch (error) {
    console.error('[Invoices] Error fetching sellers:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PUT /api/invoices/config
 * Update configuration
 */
router.put('/api/invoices/config', validateApiKey, async (req: Request, res: Response) => {
  try {
    const updates = req.body as UpdateConfigRequest;

    const config = await invoiceService.updateConfig(updates);

    res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    console.error('[Invoices] Error updating config:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// SDI (DOCFISCALE) ENDPOINTS
// ============================================

/**
 * POST /api/invoices/sdi/create
 * Create SDI electronic invoice (Docfiscale) for a booking
 * This creates: Docfiscale -> Dettaglio -> XML (send to SDI)
 */
router.post('/api/invoices/sdi/create', validateApiKey, async (req: Request, res: Response) => {
  try {
    const { bookingId, praticaIri, sendToSdi, triggeredBy } = req.body;

    if (!bookingId) {
      res.status(400).json({
        success: false,
        error: 'bookingId is required',
      });
      return;
    }

    const result = await invoiceService.createSdiInvoiceFromBooking(bookingId, {
      praticaIri,
      sendToSdi: sendToSdi !== false,
      triggeredBy: triggeredBy || 'manual',
    });

    if (result.success) {
      res.json({
        success: true,
        docfiscaleId: result.docfiscaleId,
        docfiscaleIri: result.docfiscaleIri,
        invoiceNumber: result.invoiceNumber,
        docfiscalexmlId: result.docfiscalexmlId,
        message: `SDI invoice created for booking ${bookingId}`,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('[Invoices] Error creating SDI invoice:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/invoices/sdi/create-batch
 * Create SDI invoices for multiple bookings
 */
router.post('/api/invoices/sdi/create-batch', validateApiKey, async (req: Request, res: Response) => {
  try {
    const { bookingIds, sendToSdi, triggeredBy } = req.body;

    if (!bookingIds || !Array.isArray(bookingIds) || bookingIds.length === 0) {
      res.status(400).json({
        success: false,
        error: 'bookingIds array is required and must not be empty',
      });
      return;
    }

    const results = {
      success: [] as Array<{ bookingId: number; invoiceNumber: string }>,
      failed: [] as Array<{ bookingId: number; error: string }>,
    };

    for (const bookingId of bookingIds) {
      const result = await invoiceService.createSdiInvoiceFromBooking(bookingId, {
        sendToSdi: sendToSdi !== false,
        triggeredBy: triggeredBy || 'batch',
      });

      if (result.success) {
        results.success.push({
          bookingId,
          invoiceNumber: result.invoiceNumber || 'N/A',
        });
      } else {
        results.failed.push({
          bookingId,
          error: result.error || 'Unknown error',
        });
      }
    }

    res.json({
      success: true,
      results,
      summary: {
        total: bookingIds.length,
        succeeded: results.success.length,
        failed: results.failed.length,
      },
    });
  } catch (error) {
    console.error('[Invoices] Error creating batch SDI invoices:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/invoices/sdi/credit-note
 * Create SDI credit note (Nota di Credito) for a booking
 */
router.post('/api/invoices/sdi/credit-note', validateApiKey, async (req: Request, res: Response) => {
  try {
    const { bookingId, creditAmount, sendToSdi, triggeredBy } = req.body;

    if (!bookingId) {
      res.status(400).json({
        success: false,
        error: 'bookingId is required',
      });
      return;
    }

    const result = await invoiceService.createSdiCreditNote(bookingId, {
      creditAmount,
      sendToSdi: sendToSdi !== false,
      triggeredBy: triggeredBy || 'manual',
    });

    if (result.success) {
      res.json({
        success: true,
        docfiscaleId: result.docfiscaleId,
        docfiscaleIri: result.docfiscaleIri,
        creditNoteNumber: result.creditNoteNumber,
        message: `SDI credit note created for booking ${bookingId}`,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('[Invoices] Error creating SDI credit note:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/invoices/sdi/status/:bookingId
 * Check SDI status for a booking (get notifications)
 */
router.get('/api/invoices/sdi/status/:bookingId', validateApiKey, async (req: Request, res: Response) => {
  try {
    const bookingId = parseInt(req.params.bookingId);

    if (isNaN(bookingId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid booking ID',
      });
      return;
    }

    const result = await invoiceService.checkSdiStatus(bookingId);

    if (result.success) {
      res.json({
        success: true,
        bookingId,
        sdiStatus: result.status,
        notifications: result.notifications,
      });
    } else {
      res.status(404).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('[Invoices] Error checking SDI status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/invoices/sdi/docfiscale/:confirmationCode
 * Get Docfiscale by confirmation code (external ID)
 */
router.get('/api/invoices/sdi/docfiscale/:confirmationCode', validateApiKey, async (req: Request, res: Response) => {
  try {
    const confirmationCode = req.params.confirmationCode;

    const docfiscale = await partnerSolutionService.findDocfiscaleByExternalId(confirmationCode);

    if (docfiscale) {
      res.json({
        success: true,
        data: docfiscale,
      });
    } else {
      res.status(404).json({
        success: false,
        error: `No Docfiscale found for confirmation code: ${confirmationCode}`,
      });
    }
  } catch (error) {
    console.error('[Invoices] Error finding Docfiscale:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// HEALTH CHECK
// ============================================

/**
 * GET /api/invoices/health
 * Check Partner Solution API connection
 */
router.get('/api/invoices/health', validateApiKey, async (req: Request, res: Response) => {
  try {
    const health = await partnerSolutionService.healthCheck();

    res.json({
      success: true,
      partnerSolution: health,
    });
  } catch (error) {
    console.error('[Invoices] Error checking health:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// BOOKINGS WITHOUT INVOICES
// ============================================

/**
 * GET /api/invoices/pending-bookings
 * Get bookings that don't have invoices yet
 *
 * For travel_date rules: shows bookings with travel_date >= rule.invoice_start_date
 * For creation_date rules: shows bookings with creation_date >= rule.invoice_start_date
 *
 * Query params:
 * - seller: filter by seller name
 * - startDate: optional start date filter
 * - endDate: optional end date filter
 */
router.get('/api/invoices/pending-bookings', validateApiKey, async (req: Request, res: Response) => {
  try {
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const seller = req.query.seller as string;

    // Get all booking IDs that have invoices
    const { data: invoicedBookings } = await supabase
      .from('invoices')
      .select('booking_id')
      .eq('invoice_type', 'INVOICE');

    const invoicedBookingIds = new Set(invoicedBookings?.map(i => i.booking_id) || []);

    // Get ALL invoice rules (including paused) so we can show all sellers in the dropdown
    const { data: rules } = await supabase
      .from('invoice_rules')
      .select('*');

    // Build a map of seller -> rule (including is_active status)
    const sellerRuleMap: Record<string, { rule_name: string; rule_type: 'travel_date' | 'creation_date'; start_date: string; is_active: boolean }> = {};
    for (const rule of (rules || [])) {
      for (const s of (rule.sellers || [])) {
        sellerRuleMap[s] = {
          rule_name: rule.name,
          rule_type: rule.invoice_date_type,
          start_date: rule.invoice_start_date,
          is_active: rule.is_active,
        };
      }
    }

    // Get all sellers with rules
    const sellersWithRules = Object.keys(sellerRuleMap);

    // Query activity_bookings directly - this is more efficient
    // Get all activity bookings for sellers with rules that match the date criteria
    // We need to paginate to get all results since Supabase limits to 1000
    let allActivityBookings: any[] = [];
    let offset = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore) {
      let activityQuery = supabase
        .from('activity_bookings')
        .select(`
          activity_booking_id,
          booking_id,
          activity_seller,
          start_date_time,
          total_price,
          bookings!inner(
            booking_id,
            confirmation_code,
            total_price,
            currency,
            creation_date,
            status,
            booking_customers(
              customers(first_name, last_name, email)
            )
          )
        `)
        .eq('bookings.status', 'CONFIRMED')
        .eq('status', 'CONFIRMED')  // Also filter activity_bookings by status
        .range(offset, offset + batchSize - 1);

      // Filter by seller if specified
      if (seller) {
        activityQuery = activityQuery.eq('activity_seller', seller);
      } else if (sellersWithRules.length > 0) {
        activityQuery = activityQuery.in('activity_seller', sellersWithRules);
      }

      const { data: batch, error: batchError } = await activityQuery;

      if (batchError) {
        throw batchError;
      }

      if (batch && batch.length > 0) {
        allActivityBookings = allActivityBookings.concat(batch);
        offset += batchSize;
        hasMore = batch.length === batchSize;
      } else {
        hasMore = false;
      }
    }

    const activityBookings = allActivityBookings;
    const error = null;

    if (error) {
      throw error;
    }

    // Group by booking_id and compute travel dates
    const bookingMap = new Map<number, {
      booking_id: number;
      confirmation_code: string;
      total_price: number;
      currency: string;
      creation_date: string;
      travel_date: string | null;
      customer_name: string | null;
      customer_email: string | null;
      activity_seller: string | null;
      rule_name: string | null;
      rule_type: 'travel_date' | 'creation_date' | null;
      rule_start_date: string | null;
      rule_is_active: boolean | null;
    }>();

    for (const ab of (activityBookings || [])) {
      const bookingId = ab.booking_id;
      const booking = ab.bookings as any;

      if (!booking || invoicedBookingIds.has(bookingId)) {
        continue; // Skip invoiced bookings
      }

      const travelDate = ab.start_date_time?.split('T')[0] || null;
      const activitySeller = ab.activity_seller || null;
      const ruleInfo = activitySeller ? sellerRuleMap[activitySeller] : null;

      // Check if booking already in map
      const existing = bookingMap.get(bookingId);

      if (existing) {
        // Update travel_date to latest
        if (travelDate && (!existing.travel_date || travelDate > existing.travel_date)) {
          existing.travel_date = travelDate;
        }
      } else {
        const customer = booking.booking_customers?.[0]?.customers;

        bookingMap.set(bookingId, {
          booking_id: bookingId,
          confirmation_code: booking.confirmation_code,
          total_price: booking.total_price,
          currency: booking.currency,
          creation_date: booking.creation_date,
          travel_date: travelDate,
          customer_name: customer
            ? `${customer.first_name} ${customer.last_name}`
            : null,
          customer_email: customer?.email || null,
          activity_seller: activitySeller,
          rule_name: ruleInfo?.rule_name || null,
          rule_type: ruleInfo?.rule_type || null,
          rule_start_date: ruleInfo?.start_date || null,
          rule_is_active: ruleInfo?.is_active ?? null,
        });
      }
    }

    // Filter based on rule logic and date filters
    const uninvoicedBookings = Array.from(bookingMap.values())
      .filter(b => {
        if (!b.rule_type || !b.rule_start_date) {
          return true; // No rule - include all
        }

        if (b.rule_type === 'travel_date') {
          if (!b.travel_date) return false;
          return b.travel_date >= b.rule_start_date;
        } else {
          const creationDateOnly = b.creation_date?.split('T')[0];
          if (!creationDateOnly) return false;
          return creationDateOnly >= b.rule_start_date;
        }
      })
      .filter(b => {
        if (startDate) {
          const dateToCheck = b.rule_type === 'travel_date' ? b.travel_date : b.creation_date?.split('T')[0];
          if (!dateToCheck || dateToCheck < startDate) return false;
        }
        if (endDate) {
          const dateToCheck = b.rule_type === 'travel_date' ? b.travel_date : b.creation_date?.split('T')[0];
          if (!dateToCheck || dateToCheck > endDate) return false;
        }
        return true;
      })
      .sort((a, b) => (b.travel_date || '').localeCompare(a.travel_date || ''));

    res.json({
      success: true,
      data: uninvoicedBookings,
      count: uninvoicedBookings.length,
    });
  } catch (error) {
    console.error('[Invoices] Error fetching pending bookings:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// AUDIT LOG
// ============================================

/**
 * GET /api/invoices/:id/audit
 * Get audit log for an invoice
 */
router.get('/api/invoices/:id/audit', validateApiKey, async (req: Request, res: Response) => {
  try {
    const { data: auditLog, error } = await supabase
      .from('invoice_audit_log')
      .select('*')
      .eq('invoice_id', req.params.id)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      data: auditLog,
    });
  } catch (error) {
    console.error('[Invoices] Error fetching audit log:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// INVOICE RULES
// ============================================

/**
 * GET /api/invoices/rules
 * Get all invoice rules
 */
router.get('/api/invoices/rules', validateApiKey, async (req: Request, res: Response) => {
  try {
    const rules = await invoiceRulesService.getAllRules();

    res.json({
      success: true,
      data: rules,
      count: rules.length,
    });
  } catch (error) {
    console.error('[Invoices] Error fetching rules:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/invoices/rules/:id
 * Get a single rule by ID
 */
router.get('/api/invoices/rules/:id', validateApiKey, async (req: Request, res: Response) => {
  try {
    const rule = await invoiceRulesService.getRuleById(req.params.id);

    if (!rule) {
      res.status(404).json({
        success: false,
        error: 'Rule not found',
      });
      return;
    }

    res.json({
      success: true,
      data: rule,
    });
  } catch (error) {
    console.error('[Invoices] Error fetching rule:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/invoices/rules
 * Create a new invoice rule
 *
 * Body:
 * {
 *   "name": "Civitatis Travel Rule",
 *   "invoice_date_type": "travel_date" | "creation_date",
 *   "sellers": ["Civitatis", "GetYourGuide"],
 *   "invoice_start_date": "2026-01-01",
 *   "execution_time": "08:00:00"  // optional, only for travel_date
 * }
 */
router.post('/api/invoices/rules', validateApiKey, async (req: Request, res: Response) => {
  try {
    const { name, invoice_date_type, sellers, invoice_start_date, execution_time } = req.body;

    if (!name || !invoice_date_type || !sellers || !invoice_start_date) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: name, invoice_date_type, sellers, invoice_start_date',
      });
      return;
    }

    if (!['travel_date', 'creation_date'].includes(invoice_date_type)) {
      res.status(400).json({
        success: false,
        error: 'invoice_date_type must be "travel_date" or "creation_date"',
      });
      return;
    }

    const rule = await invoiceRulesService.createRule({
      name,
      invoice_date_type,
      sellers,
      invoice_start_date,
      execution_time,
    });

    res.status(201).json({
      success: true,
      data: rule,
    });
  } catch (error) {
    console.error('[Invoices] Error creating rule:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PUT /api/invoices/rules/:id
 * Update an invoice rule
 */
router.put('/api/invoices/rules/:id', validateApiKey, async (req: Request, res: Response) => {
  try {
    const { name, sellers, invoice_start_date, execution_time, is_active } = req.body;

    const rule = await invoiceRulesService.updateRule(req.params.id, {
      name,
      sellers,
      invoice_start_date,
      execution_time,
      is_active,
    });

    res.json({
      success: true,
      data: rule,
    });
  } catch (error) {
    console.error('[Invoices] Error updating rule:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/invoices/rules/:id
 * Delete an invoice rule
 */
router.delete('/api/invoices/rules/:id', validateApiKey, async (req: Request, res: Response) => {
  try {
    await invoiceRulesService.deleteRule(req.params.id);

    res.json({
      success: true,
      message: 'Rule deleted',
    });
  } catch (error) {
    console.error('[Invoices] Error deleting rule:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/invoices/rules/process-travel-date
 * Cron endpoint: Process all travel_date rules for today
 * This finds bookings where the latest activity date = today and sends to Partner Solution
 *
 * Query params:
 * - date: Optional date override (YYYY-MM-DD), defaults to today
 * - dry_run: If true, only returns what would be processed without sending
 */
router.post('/api/invoices/rules/process-travel-date', validateApiKey, async (req: Request, res: Response) => {
  try {
    const targetDate = req.query.date as string || new Date().toISOString().split('T')[0];
    const dryRun = req.query.dry_run === 'true';

    console.log(`\n[InvoiceRules] Processing travel_date rules for ${targetDate}${dryRun ? ' (DRY RUN)' : ''}`);

    const results = await invoiceRulesService.getBookingsForTravelDateInvoicing(targetDate);

    const processedBookings: Array<{
      booking_id: number;
      confirmation_code: string;
      seller: string;
      travel_date: string;
      total_amount: number;
      status: 'sent' | 'skipped' | 'failed';
      error?: string;
      pratica_id?: string;
    }> = [];

    for (const { bookings, rule } of results) {
      console.log(`\n[InvoiceRules] Processing ${bookings.length} bookings for rule: ${rule.name}`);

      for (const booking of bookings) {
        const latestTravelDate = booking.activities
          .map(a => a.start_date_time?.split('T')[0])
          .filter(Boolean)
          .sort()
          .pop() || targetDate;

        if (dryRun) {
          processedBookings.push({
            booking_id: booking.booking_id,
            confirmation_code: booking.confirmation_code,
            seller: booking.seller_name || 'unknown',
            travel_date: latestTravelDate,
            total_amount: booking.total_price,
            status: 'skipped',
          });
          continue;
        }

        try {
          // Determine year_month for this booking
          const yearMonthInfo = await invoiceRulesService.resolveYearMonthForBooking(booking);

          // Send to Partner Solution
          const client = await (partnerSolutionService as any).getClient();
          const agencyCode = process.env.PARTNER_SOLUTION_AGENCY_CODE || '7206';
          const now = new Date().toISOString();
          const bookingIdPadded = String(booking.booking_id).padStart(9, '0');

          // Ensure Commessa exists
          const commessaId = await getCommessaId(yearMonthInfo.yearMonth);
          const nrCommessa = yearMonthInfo.yearMonth.replace('-', ''); // Convert 2026-01 to 202601
          const deliveringValue = `commessa: ${nrCommessa}`; // Format: "commessa: {codice}" with space after colon

          const customerName = {
            firstName: booking.customer?.first_name || 'N/A',
            lastName: booking.customer?.last_name || 'N/A',
          };
          const customerPhone = booking.customer?.phone_number || null;
          const customerCountry = getCountryNameForPS(customerPhone);

          // Step 1: Create Account
          const accountPayload = {
            cognome: customerName.lastName,
            nome: customerName.firstName,
            flagpersonafisica: 1,
            codicefiscale: bookingIdPadded,
            codiceagenzia: agencyCode,
            stato: 'INS',
            tipocattura: 'PS',
            iscliente: 1,
            isfornitore: 0,
            nazione: customerCountry,
          };
          const accountResponse = await client.post('/accounts', accountPayload);
          const accountIri = accountResponse.data['@id'];

          // Step 2: Create Pratica (WP)
          const praticaPayload = {
            codicecliente: accountIri,
            externalid: bookingIdPadded,
            cognomecliente: customerName.lastName,
            nomecliente: customerName.firstName,
            codiceagenzia: agencyCode,
            tipocattura: 'PS',
            datacreazione: now,
            datamodifica: now,
            stato: 'WP',
            descrizionepratica: 'Tour UE ed Extra UE',
            noteinterne: booking.seller_name ? `Seller: ${booking.seller_name}` : null,
            delivering: deliveringValue
          };
          const praticaResponse = await client.post('/prt_praticas', praticaPayload);
          const praticaIri = praticaResponse.data['@id'];

          // Step 3: Add Passeggero
          await client.post('/prt_praticapasseggeros', {
            pratica: praticaIri,
            cognomepax: customerName.lastName,
            nomepax: customerName.firstName,
            annullata: 0,
            iscontraente: 1
          });

          // Step 4: Add ONE Servizio per booking (amount = bookings.total_price)
          const totalAmount = booking.total_price || 0;
          const praticaCreationDate = now.split('T')[0];

          const servizioResponse = await client.post('/prt_praticaservizios', {
            pratica: praticaIri,
            externalid: bookingIdPadded,
            tiposervizio: 'PKG',
            tipovendita: 'ORG',
            regimevendita: '74T',
            codicefornitore: 'IT09802381005',
            ragsocfornitore: 'EnRoma Tours',
            codicefilefornitore: bookingIdPadded,
            datacreazione: now,
            datainizioservizio: praticaCreationDate,
            datafineservizio: praticaCreationDate,
            duratant: 0,
            duratagg: 1,
            nrpaxadulti: 1,
            nrpaxchild: 0,
            nrpaxinfant: 0,
            descrizione: 'Tour UE ed Extra UE',
            tipodestinazione: 'MISTO',
            annullata: 0,
            codiceagenzia: agencyCode,
            stato: 'INS'
          });

          // Step 5: Add ONE Quota per booking (amount = bookings.total_price)
          await client.post('/prt_praticaservizioquotas', {
            servizio: servizioResponse.data['@id'],
            descrizionequota: 'Tour UE ed Extra UE',
            datavendita: now,
            codiceisovalutacosto: 'EUR',
            quantitacosto: 1,
            costovalutaprimaria: totalAmount,
            quantitaricavo: 1,
            ricavovalutaprimaria: totalAmount,
            codiceisovalutaricavo: 'EUR',
            commissioniattivevalutaprimaria: 0,
            commissionipassivevalutaprimaria: 0,
            progressivo: 1,
            annullata: 0,
            codiceagenzia: agencyCode,
            stato: 'INS'
          });

          // Step 6: Add Movimento Finanziario
          await client.post('/mov_finanziarios', {
            externalid: bookingIdPadded,
            tipomovimento: 'I',
            codicefile: bookingIdPadded,
            codiceagenzia: agencyCode,
            tipocattura: 'PS',
            importo: totalAmount,
            datacreazione: now,
            datamodifica: now,
            datamovimento: now,
            stato: 'INS',
            codcausale: 'PAGBOK',
            descrizione: `Tour UE ed Extra UE - ${booking.confirmation_code}`
          });

          // Step 7: Update Pratica to INS
          await client.put(praticaIri, { ...praticaPayload, stato: 'INS' });

          // Record in invoices table
          await supabase.from('invoices').upsert({
            booking_id: booking.booking_id,
            confirmation_code: booking.confirmation_code,
            invoice_type: 'INVOICE',
            status: 'sent',
            total_amount: totalAmount,
            currency: 'EUR',
            customer_name: `${customerName.firstName} ${customerName.lastName}`,
            seller_name: booking.seller_name,
            booking_creation_date: booking.creation_date?.split('T')[0],
            sent_at: now,
            ps_pratica_iri: praticaIri,
            ps_commessa_code: yearMonthInfo.yearMonth,
            created_by: 'travel_date_cron',
          }, { onConflict: 'booking_id,invoice_type' });

          processedBookings.push({
            booking_id: booking.booking_id,
            confirmation_code: booking.confirmation_code,
            seller: booking.seller_name || 'unknown',
            travel_date: latestTravelDate,
            total_amount: totalAmount,
            status: 'sent',
            pratica_id: praticaIri,
          });

          console.log(`  [OK] Sent ${booking.confirmation_code} to Partner Solution`);
        } catch (error: any) {
          console.error(`  [ERROR] Failed to send ${booking.confirmation_code}:`, error.message);
          processedBookings.push({
            booking_id: booking.booking_id,
            confirmation_code: booking.confirmation_code,
            seller: booking.seller_name || 'unknown',
            travel_date: latestTravelDate,
            total_amount: booking.total_price,
            status: 'failed',
            error: error.message,
          });
        }
      }
    }

    const sent = processedBookings.filter(b => b.status === 'sent').length;
    const failed = processedBookings.filter(b => b.status === 'failed').length;
    const skipped = processedBookings.filter(b => b.status === 'skipped').length;

    res.json({
      success: true,
      date: targetDate,
      dry_run: dryRun,
      summary: {
        total: processedBookings.length,
        sent,
        failed,
        skipped,
      },
      bookings: processedBookings,
    });
  } catch (error) {
    console.error('[Invoices] Error processing travel_date rules:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/invoices/rules/process-booking/:bookingId
 * Process a single booking against creation_date rules (called from webhook)
 * Returns immediately - used for instant invoicing on booking confirmation
 */
router.post('/api/invoices/rules/process-booking/:bookingId', validateApiKey, async (req: Request, res: Response) => {
  try {
    const bookingId = parseInt(req.params.bookingId);

    if (isNaN(bookingId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid booking ID',
      });
      return;
    }

    console.log(`\n[InvoiceRules] Processing booking ${bookingId} for creation_date rule`);

    // Fetch booking data
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        booking_id,
        confirmation_code,
        creation_date,
        status,
        total_price,
        currency,
        booking_customers(
          customers(first_name, last_name, phone_number)
        ),
        activity_bookings(
          activity_booking_id,
          product_title,
          start_date_time,
          total_price,
          activity_seller,
          status
        )
      `)
      .eq('booking_id', bookingId)
      .single();

    if (bookingError || !booking) {
      res.status(404).json({
        success: false,
        error: `Booking ${bookingId} not found`,
      });
      return;
    }

    // Check if already invoiced
    const { data: existingInvoice } = await supabase
      .from('invoices')
      .select('id')
      .eq('booking_id', bookingId)
      .eq('invoice_type', 'INVOICE')
      .single();

    if (existingInvoice) {
      res.json({
        success: true,
        message: 'Booking already invoiced',
        already_invoiced: true,
      });
      return;
    }

    // Transform to BookingForInvoicing format
    const customer = booking.booking_customers?.[0]?.customers;
    // Filter out cancelled activities
    const activities = (booking.activity_bookings || []).filter((a: any) => a.status === 'CONFIRMED');
    const sellerName = activities.find((a: any) => a.activity_seller)?.activity_seller || null;

    const bookingData = {
      booking_id: booking.booking_id,
      confirmation_code: booking.confirmation_code,
      creation_date: booking.creation_date,
      status: booking.status,
      total_price: booking.total_price,
      currency: booking.currency,
      customer: customer ? {
        first_name: (customer as any).first_name,
        last_name: (customer as any).last_name,
        phone_number: (customer as any).phone_number,
      } : null,
      activities: activities.map((a: any) => ({
        activity_booking_id: a.activity_booking_id,
        product_title: a.product_title,
        start_date_time: a.start_date_time,
        total_price: a.total_price,
        pax_adults: 1,  // Default to 1 passenger (pax columns don't exist in activity_bookings)
        pax_children: 0,
        pax_infants: 0,
        activity_seller: a.activity_seller,
      })),
      seller_name: sellerName,
    };

    // Check if booking matches a creation_date rule
    const { shouldInvoice, rule, reason } = await invoiceRulesService.shouldAutoInvoiceOnCreation(bookingData);

    if (!shouldInvoice) {
      console.log(`[InvoiceRules] Not invoicing: ${reason}`);
      res.json({
        success: true,
        message: reason,
        should_invoice: false,
        rule: rule?.name || null,
      });
      return;
    }

    console.log(`[InvoiceRules] Auto-invoicing: ${reason} (Rule: ${rule!.name})`);

    // Send to Partner Solution
    const yearMonthInfo = await invoiceRulesService.resolveYearMonthForBooking(bookingData);
    const client = await (partnerSolutionService as any).getClient();
    const agencyCode = process.env.PARTNER_SOLUTION_AGENCY_CODE || '7206';
    const now = new Date().toISOString();
    const bookingIdPadded = String(booking.booking_id).padStart(9, '0');

    // Ensure Commessa exists
    const commessaId = await getCommessaId(yearMonthInfo.yearMonth);
    const nrCommessa = yearMonthInfo.yearMonth.replace('-', ''); // Convert 2026-01 to 202601
    const deliveringValue = `commessa: ${nrCommessa}`; // Format: "commessa: {codice}" with space after colon

    const customerName = {
      firstName: bookingData.customer?.first_name || 'N/A',
      lastName: bookingData.customer?.last_name || 'N/A',
    };
    const customerPhone = bookingData.customer?.phone_number || null;
    const customerCountry = getCountryNameForPS(customerPhone);

    // Execute 7-step flow
    // Step 1: Create Account
    const accountResponse = await client.post('/accounts', {
      cognome: customerName.lastName,
      nome: customerName.firstName,
      flagpersonafisica: 1,
      codicefiscale: bookingIdPadded,
      codiceagenzia: agencyCode,
      stato: 'INS',
      tipocattura: 'PS',
      iscliente: 1,
      isfornitore: 0,
      nazione: customerCountry,
    });
    const accountIri = accountResponse.data['@id'];

    // Step 2: Create Pratica (WP)
    const praticaPayload = {
      codicecliente: accountIri,
      externalid: bookingIdPadded,
      cognomecliente: customerName.lastName,
      nomecliente: customerName.firstName,
      codiceagenzia: agencyCode,
      tipocattura: 'PS',
      datacreazione: now,
      datamodifica: now,
      stato: 'WP',
      descrizionepratica: 'Tour UE ed Extra UE',
      noteinterne: bookingData.seller_name ? `Seller: ${bookingData.seller_name}` : null,
      delivering: deliveringValue
    };
    const praticaResponse = await client.post('/prt_praticas', praticaPayload);
    const praticaIri = praticaResponse.data['@id'];

    // Step 3: Add Passeggero
    const passeggeroResponse = await client.post('/prt_praticapasseggeros', {
      pratica: praticaIri,
      cognomepax: customerName.lastName,
      nomepax: customerName.firstName,
      annullata: 0,
      iscontraente: 1
    });

    // Step 4: Add ONE Servizio per booking (amount = bookings.total_price)
    const totalAmount = booking.total_price || 0;
    const praticaCreationDate = now.split('T')[0];

    const servizioResponse = await client.post('/prt_praticaservizios', {
      pratica: praticaIri,
      externalid: bookingIdPadded,
      tiposervizio: 'PKG',
      tipovendita: 'ORG',
      regimevendita: '74T',
      codicefornitore: 'IT09802381005',
      ragsocfornitore: 'EnRoma Tours',
      codicefilefornitore: bookingIdPadded,
      datacreazione: now,
      datainizioservizio: praticaCreationDate,
      datafineservizio: praticaCreationDate,
      duratant: 0,
      duratagg: 1,
      nrpaxadulti: 1,
      nrpaxchild: 0,
      nrpaxinfant: 0,
      descrizione: 'Tour UE ed Extra UE',
      tipodestinazione: 'MISTO',
      annullata: 0,
      codiceagenzia: agencyCode,
      stato: 'INS'
    });

    // Step 5: Add ONE Quota per booking (amount = bookings.total_price)
    const quotaResponse = await client.post('/prt_praticaservizioquotas', {
      servizio: servizioResponse.data['@id'],
      descrizionequota: 'Tour UE ed Extra UE',
      datavendita: now,
      codiceisovalutacosto: 'EUR',
      quantitacosto: 1,
      costovalutaprimaria: totalAmount,
      quantitaricavo: 1,
      ricavovalutaprimaria: totalAmount,
      codiceisovalutaricavo: 'EUR',
      commissioniattivevalutaprimaria: 0,
      commissionipassivevalutaprimaria: 0,
      progressivo: 1,
      annullata: 0,
      codiceagenzia: agencyCode,
      stato: 'INS'
    });

    // Step 6: Add Movimento Finanziario
    const movimentoResponse = await client.post('/mov_finanziarios', {
      externalid: bookingIdPadded,
      tipomovimento: 'I',
      codicefile: bookingIdPadded,
      codiceagenzia: agencyCode,
      tipocattura: 'PS',
      importo: totalAmount,
      datacreazione: now,
      datamodifica: now,
      datamovimento: now,
      stato: 'INS',
      codcausale: 'PAGBOK',
      descrizione: `Tour UE ed Extra UE - ${booking.confirmation_code}`
    });

    // Step 7: Update Pratica to INS
    await client.put(praticaIri, { ...praticaPayload, stato: 'INS' });

    // Record in invoices table
    await supabase.from('invoices').upsert({
      booking_id: booking.booking_id,
      confirmation_code: booking.confirmation_code,
      invoice_type: 'INVOICE',
      status: 'sent',
      total_amount: totalAmount,
      currency: 'EUR',
      customer_name: `${customerName.firstName} ${customerName.lastName}`,
      seller_name: bookingData.seller_name,
      booking_creation_date: booking.creation_date?.split('T')[0],
      sent_at: now,
      ps_pratica_iri: praticaIri,
      ps_account_iri: accountResponse.data['@id'],
      ps_passeggero_iri: passeggeroResponse.data['@id'],
      ps_movimento_iri: movimentoResponse.data['@id'],
      ps_commessa_code: yearMonthInfo.yearMonth,
      created_by: 'creation_date_auto',
    }, { onConflict: 'booking_id,invoice_type' });

    console.log(`[InvoiceRules] Successfully invoiced ${booking.confirmation_code}`);

    res.json({
      success: true,
      message: 'Invoice sent to Partner Solution',
      booking_id: booking.booking_id,
      confirmation_code: booking.confirmation_code,
      pratica_id: praticaIri,
      servizio_id: servizioResponse.data['@id'],
      quota_id: quotaResponse.data['@id'],
      movimento_id: movimentoResponse.data['@id'],
      year_month: yearMonthInfo.yearMonth,
      total_amount: totalAmount,
      rule_name: rule!.name,
    });
  } catch (error: any) {
    console.error('[Invoices] Error processing booking for auto-invoice:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      api_response: error.response?.data,
    });
  }
});

// ============================================
// SINGLE INVOICE BY ID (must be last to avoid matching other routes)
// ============================================

/**
 * GET /api/invoices/:id
 * Get a single invoice by ID
 */
router.get('/api/invoices/:id', validateApiKey, async (req: Request, res: Response) => {
  try {
    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('*, invoice_line_items(*)')
      .eq('id', req.params.id)
      .single();

    if (error || !invoice) {
      res.status(404).json({
        success: false,
        error: 'Invoice not found',
      });
      return;
    }

    res.json({
      success: true,
      data: invoice,
    });
  } catch (error) {
    console.error('[Invoices] Error fetching invoice:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/invoices/send-booking/:bookingId
 * Manually send a booking to Partner Solution (bypasses rule checks)
 * Used for manual invoice triggering from the UI
 */
router.post('/api/invoices/send-booking/:bookingId', validateApiKey, async (req: Request, res: Response) => {
  try {
    const bookingId = parseInt(req.params.bookingId);

    if (isNaN(bookingId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid booking ID',
      });
      return;
    }

    console.log(`\n[Invoices] Manual send requested for booking ${bookingId}`);

    // Check if already invoiced
    const { data: existingInvoice } = await supabase
      .from('invoices')
      .select('id')
      .eq('booking_id', bookingId)
      .eq('invoice_type', 'INVOICE')
      .single();

    if (existingInvoice) {
      res.json({
        success: true,
        message: 'Booking already invoiced',
        already_invoiced: true,
      });
      return;
    }

    // Fetch booking data
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        booking_id,
        confirmation_code,
        creation_date,
        status,
        total_price,
        currency,
        booking_customers(
          customers(first_name, last_name, phone_number)
        ),
        activity_bookings(
          activity_booking_id,
          product_title,
          start_date_time,
          total_price,
          activity_seller,
          status
        )
      `)
      .eq('booking_id', bookingId)
      .single();

    if (bookingError || !booking) {
      res.status(404).json({
        success: false,
        error: `Booking ${bookingId} not found`,
      });
      return;
    }

    // Transform to format needed for send-to-partner
    const customer = booking.booking_customers?.[0]?.customers;
    // Filter out cancelled activities
    const activities = (booking.activity_bookings || []).filter((a: any) => a.status === 'CONFIRMED');
    const sellerName = activities.find((a: any) => a.activity_seller)?.activity_seller || null;

    const bookingData = {
      booking_id: booking.booking_id,
      confirmation_code: booking.confirmation_code,
      creation_date: booking.creation_date,
      status: booking.status,
      total_price: booking.total_price,
      currency: booking.currency,
      customer: customer ? {
        first_name: (customer as any).first_name,
        last_name: (customer as any).last_name,
        phone_number: (customer as any).phone_number,
      } : null,
      activities: activities.map((a: any) => ({
        activity_booking_id: a.activity_booking_id,
        product_title: a.product_title,
        start_date_time: a.start_date_time,
        total_price: a.total_price,
        pax_adults: 1,  // Default to 1 passenger (pax columns don't exist in activity_bookings)
        pax_children: 0,
        pax_infants: 0,
        activity_seller: a.activity_seller,
      })),
      seller_name: sellerName,
    };

    // Resolve year/month for commessa
    const yearMonthInfo = await invoiceRulesService.resolveYearMonthForBooking(bookingData);
    const client = await (partnerSolutionService as any).getClient();
    const agencyCode = process.env.PARTNER_SOLUTION_AGENCY_CODE || '7206';
    const now = new Date().toISOString();
    const bookingIdPadded = String(booking.booking_id).padStart(9, '0');

    // Ensure Commessa exists
    const commessaId = await getCommessaId(yearMonthInfo.yearMonth);
    const nrCommessa = yearMonthInfo.yearMonth.replace('-', ''); // Convert 2026-01 to 202601
    const deliveringValue = `commessa: ${nrCommessa}`; // Format: "commessa: {codice}" with space after colon

    const customerName = {
      firstName: bookingData.customer?.first_name || 'N/A',
      lastName: bookingData.customer?.last_name || 'N/A',
    };
    const customerPhone = bookingData.customer?.phone_number || null;
    const customerCountry = getCountryNameForPS(customerPhone);

    console.log(`[Invoices] Sending ${booking.confirmation_code} to Partner Solution...`);
    console.log(`  Customer: ${customerName.firstName} ${customerName.lastName}`);
    console.log(`  Country: ${customerCountry} (phone: ${customerPhone || 'none'})`);
    console.log(`  Commessa: ${yearMonthInfo.yearMonth}`);

    // Execute 7-step flow
    // Step 1: Create Account
    const accountResponse = await client.post('/accounts', {
      cognome: customerName.lastName,
      nome: customerName.firstName,
      flagpersonafisica: 1,
      codicefiscale: bookingIdPadded,
      codiceagenzia: agencyCode,
      stato: 'INS',
      tipocattura: 'PS',
      iscliente: 1,
      isfornitore: 0,
      nazione: customerCountry,
    });
    const accountIri = accountResponse.data['@id'];

    /// Step 2: Create Pratica (WP)
    const praticaCreationDate = now.split('T')[0];
    const praticaPayload = {
      codicecliente: accountIri,
      externalid: bookingIdPadded,
      cognomecliente: customerName.lastName,
      nomecliente: customerName.firstName,
      datacreazione: now,
      datamodifica: now,
      datapratica: praticaCreationDate,
      tipopratica: 'TURP',
      codiceagenzia: agencyCode,
      stato: 'WP',
      tipocattura: 'PS',
      delivering: deliveringValue,
      descrizionepratica: 'Tour UE ed Extra UE',
      noteinterne: bookingData.seller_name ? `Seller: ${bookingData.seller_name} - ${booking.confirmation_code}` : booking.confirmation_code,
    };
    const praticaResponse = await client.post('/prt_praticas', praticaPayload);
    const praticaIri = praticaResponse.data['@id'];

    // Step 3: Add Passeggero
    const passeggeroResponse = await client.post('/prt_praticapasseggeros', {
      pratica: praticaIri,
      cognomepax: customerName.lastName,
      nomepax: customerName.firstName,
      annullata: 0,
      iscontraente: 1,
    });

    // Step 4: Add ONE Servizio per booking (amount = bookings.total_price)
    const totalAmount = booking.total_price || 0;

    const servizioResponse = await client.post('/prt_praticaservizios', {
      pratica: praticaIri,
      externalid: bookingIdPadded,
      tiposervizio: 'PKG',
      tipovendita: 'ORG',
      regimevendita: '74T',
      codicefornitore: 'IT09802381005',
      ragsocfornitore: 'EnRoma Tours',
      codicefilefornitore: bookingIdPadded,
      datacreazione: now,
      datainizioservizio: praticaCreationDate,
      datafineservizio: praticaCreationDate,
      duratant: 0,
      duratagg: 1,
      nrpaxadulti: 1,
      nrpaxchild: 0,
      nrpaxinfant: 0,
      descrizione: 'Tour UE ed Extra UE',
      tipodestinazione: 'MISTO',
      annullata: 0,
      codiceagenzia: agencyCode,
      stato: 'INS'
    });

    // Step 5: Add ONE Quota per booking (amount = bookings.total_price)
    const quotaResponse = await client.post('/prt_praticaservizioquotas', {
      servizio: servizioResponse.data['@id'],
      descrizionequota: 'Tour UE ed Extra UE',
      datavendita: now,
      codiceisovalutacosto: 'EUR',
      codiceisovalutaricavo: 'EUR',
      quantitacosto: 1,
      quantitaricavo: 1,
      costovalutaprimaria: totalAmount,
      ricavovalutaprimaria: totalAmount,
      progressivo: 1,
      annullata: 0,
      commissioniattivevalutaprimaria: 0,
      commissionipassivevalutaprimaria: 0,
      codiceagenzia: agencyCode,
      stato: 'INS',
    });

    // Step 6: Add Movimento Finanziario
    const movimentoResponse = await client.post('/mov_finanziarios', {
      externalid: bookingIdPadded,
      tipomovimento: 'I',
      codicefile: bookingIdPadded,
      codiceagenzia: agencyCode,
      tipocattura: 'PS',
      importo: totalAmount,
      datacreazione: now,
      datamodifica: now,
      datamovimento: praticaCreationDate,
      stato: 'INS',
      codcausale: 'PAGBOK',
      descrizione: `Tour UE ed Extra UE - ${booking.confirmation_code}`
    });

    // Step 7: Update Pratica to INS
    await client.put(praticaIri, { ...praticaPayload, stato: 'INS' });

    // Record in invoices table
    await supabase.from('invoices').upsert({
      booking_id: booking.booking_id,
      confirmation_code: booking.confirmation_code,
      invoice_type: 'INVOICE',
      status: 'sent',
      total_amount: totalAmount,
      currency: 'EUR',
      customer_name: `${customerName.firstName} ${customerName.lastName}`,
      seller_name: bookingData.seller_name,
      booking_creation_date: booking.creation_date?.split('T')[0],
      sent_at: now,
      ps_pratica_iri: praticaIri,
      ps_account_iri: accountResponse.data['@id'],
      ps_passeggero_iri: passeggeroResponse.data['@id'],
      ps_movimento_iri: movimentoResponse.data['@id'],
      ps_commessa_code: yearMonthInfo.yearMonth,
      created_by: 'manual',
    }, { onConflict: 'booking_id,invoice_type' });

    console.log(`[Invoices] Successfully sent ${booking.confirmation_code} to Partner Solution`);

    res.json({
      success: true,
      message: 'Booking sent to Partner Solution',
      data: {
        booking_id: booking.booking_id,
        confirmation_code: booking.confirmation_code,
        pratica_iri: praticaIri,
        account_iri: accountResponse.data['@id'],
        servizio_iri: servizioResponse.data['@id'],
        quota_iri: quotaResponse.data['@id'],
        movimento_iri: movimentoResponse.data['@id'],
        commessa: yearMonthInfo.yearMonth,
        total_amount: totalAmount,
      },
    });
  } catch (error) {
    console.error('[Invoices] Error sending booking to Partner Solution:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
