/**
 * Invoice Routes
 * API endpoints for invoice management and Partner Solution integration
 */

import { Router, Request, Response, NextFunction } from 'express';
import { invoiceService } from '../services/invoiceService';
import { partnerSolutionService } from '../services/partnerSolutionService';
import { supabase } from '../config/supabase';
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
      year_month,
      customer,          // { first_name, last_name }
      activities,        // [{ activity_booking_id, product_title, revenue, activity_date, pax_adults, pax_children, pax_infants }]
      seller_title,      // Optional seller name for notes
    } = req.body;

    if (!booking_id || !confirmation_code || !year_month || !activities || activities.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: booking_id, confirmation_code, year_month, activities',
      });
      return;
    }

    const agencyCode = process.env.PARTNER_SOLUTION_AGENCY_CODE || '7206';
    const now = new Date().toISOString();
    const customerName = {
      firstName: customer?.first_name || 'N/A',
      lastName: customer?.last_name || 'N/A',
    };

    console.log('\n=== Sending to Partner Solution ===');
    console.log(`Booking: ${confirmation_code}`);
    console.log(`Customer: ${customerName.firstName} ${customerName.lastName}`);
    console.log(`Agency: ${agencyCode}`);
    console.log(`Commessa: ${year_month}\n`);

    // Get axios client for direct API calls
    const client = await (partnerSolutionService as any).getClient();

    // Step 1: Always create new Account
    console.log('Step 1: Creating new account...');
    const accountPayload = {
      cognome: customerName.lastName,
      nome: customerName.firstName,
      flagpersonafisica: 1,
      codicefiscale: String(booking_id),
      codiceagenzia: agencyCode,
      stato: 'INS',
      tipocattura: 'PS',
      iscliente: 1,
      isfornitore: 0
    };

    const accountResponse = await client.post('/accounts', accountPayload);
    const accountIri = accountResponse.data['@id'];
    const accountId = accountResponse.data.id;
    console.log('  ✅ Account created:', accountIri, '(id:', accountId, ')');

    // Step 2: Create Pratica (status WP) - codicecliente is booking_id
    console.log('\nStep 2: Creating Pratica...');
    const praticaPayload = {
      codicecliente: String(booking_id),
      externalid: String(booking_id),
      cognomecliente: customerName.lastName,
      nomecliente: customerName.firstName,
      codiceagenzia: agencyCode,
      tipocattura: 'PS',
      datacreazione: now,
      datamodifica: now,
      stato: 'WP',
      descrizionepratica: 'Tour UE ed Extra UE',
      noteinterne: seller_title ? `Seller: ${seller_title}` : null,
      delivering: `commessa:${year_month}`
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
    console.log('  ✅ Passeggero added:', passeggeroResponse.data['@id']);

    // Process each activity
    const createdServices = [];
    let totalAmount = 0;

    for (const activity of activities) {
      const activityDate = activity.activity_date || now.split('T')[0];
      const amount = activity.revenue || activity.total_price || 0;
      totalAmount += amount;

      // Step 4: Add Servizio
      console.log(`\nStep 4: Adding Servizio for ${activity.activity_booking_id}...`);
      const servizioPayload = {
        pratica: praticaIri,
        externalid: String(booking_id),
        tiposervizio: 'VIS',
        tipovendita: 'ORG',
        regimevendita: '74T',
        codicefornitore: 'IT09802381005',
        ragsocfornitore: 'EnRoma Tours',
        codicefilefornitore: String(booking_id),
        datacreazione: now,
        datainizioservizio: activityDate,
        datafineservizio: activityDate,
        duratant: 0,
        duratagg: 1,
        nrpaxadulti: activity.pax_adults || 1,
        nrpaxchild: activity.pax_children || 0,
        nrpaxinfant: activity.pax_infants || 0,
        descrizione: activity.product_title || 'Tour UE ed Extra UE',
        tipodestinazione: 'CEENAZ',
        annullata: 0,
        codiceagenzia: agencyCode,
        stato: 'INS'
      };

      const servizioResponse = await client.post('/prt_praticaservizios', servizioPayload);
      const servizioIri = servizioResponse.data['@id'];
      console.log('  ✅ Servizio added:', servizioIri);

      // Step 5: Add Quota
      console.log('Step 5: Adding Quota...');
      const quotaPayload = {
        servizio: servizioIri,
        descrizionequota: activity.product_title || 'Tour UE ed Extra UE',
        datavendita: now,
        codiceisovalutacosto: 'EUR',
        quantitacosto: 1,
        costovalutaprimaria: amount,
        quantitaricavo: 1,
        ricavovalutaprimaria: amount,
        codiceisovalutaricavo: 'EUR',
        commissioniattivevalutaprimaria: 0,
        commissionipassivevalutaprimaria: 0,
        progressivo: 1,
        annullata: 0,
        codiceagenzia: agencyCode,
        stato: 'INS'
      };

      const quotaResponse = await client.post('/prt_praticaservizioquotas', quotaPayload);
      console.log('  ✅ Quota added:', quotaResponse.data['@id']);

      createdServices.push({
        activity_booking_id: activity.activity_booking_id,
        servizio_id: servizioIri,
        quota_id: quotaResponse.data['@id'],
        amount,
      });
    }

    // Step 6: Add Movimento Finanziario
    console.log('\nStep 6: Adding Movimento Finanziario...');
    const movimentoPayload = {
      externalid: String(booking_id),
      tipomovimento: 'I',
      codicefile: String(booking_id),
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
    console.log('Commessa:', year_month);
    console.log('Agency:', agencyCode);

    res.json({
      success: true,
      booking_id,
      confirmation_code,
      year_month,
      pratica_id: praticaIri,
      account_id: accountIri,
      passeggero_id: passeggeroResponse.data['@id'],
      movimento_id: movimentoResponse.data['@id'],
      services: createdServices,
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
 * Get list of all unique suppliers for multi-select configuration
 */
router.get('/api/invoices/sellers', validateApiKey, async (req: Request, res: Response) => {
  try {
    // Get unique activity_supplier values
    const { data: suppliers } = await supabase
      .from('activity_bookings')
      .select('activity_supplier')
      .not('activity_supplier', 'is', null);

    const uniqueSuppliers = [...new Set(suppliers?.map(d => d.activity_supplier).filter(Boolean))].sort();

    // Get current config
    const { data: config } = await supabase
      .from('partner_solution_config')
      .select('auto_invoice_sellers, excluded_sellers')
      .single();

    res.json({
      success: true,
      sellers: uniqueSuppliers,
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

    // Build query for bookings
    let query = supabase
      .from('bookings')
      .select(`
        booking_id,
        confirmation_code,
        total_price,
        currency,
        creation_date,
        status,
        booking_customers(
          customers(first_name, last_name, email)
        ),
        activity_bookings(activity_seller)
      `)
      .eq('status', 'CONFIRMED')
      .order('creation_date', { ascending: false });

    if (startDate) {
      query = query.gte('creation_date', startDate);
    }
    if (endDate) {
      query = query.lte('creation_date', endDate + 'T23:59:59');
    }

    const { data: bookings, error } = await query;

    if (error) {
      throw error;
    }

    // Filter to only uninvoiced bookings
    const uninvoicedBookings = (bookings || [])
      .filter(b => !invoicedBookingIds.has(b.booking_id))
      .filter(b => !seller || b.activity_bookings?.some((a: { activity_seller: string }) => a.activity_seller === seller))
      .map(b => ({
        booking_id: b.booking_id,
        confirmation_code: b.confirmation_code,
        total_price: b.total_price,
        currency: b.currency,
        creation_date: b.creation_date,
        customer_name: b.booking_customers?.[0]?.customers
          ? `${(b.booking_customers[0].customers as any).first_name} ${(b.booking_customers[0].customers as any).last_name}`
          : null,
        customer_email: (b.booking_customers?.[0]?.customers as any)?.email || null,
        activity_seller: b.activity_bookings?.[0]?.activity_seller || null,
      }));

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

export default router;
