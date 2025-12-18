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

export default router;
