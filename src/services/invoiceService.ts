/**
 * Invoice Service
 * Orchestrates invoice creation with MONTHLY PRATICA model
 *
 * Model: One Pratica per month in Partner Solution
 * - Bookings are added as Servizi to the monthly Pratica
 * - Multiple bookings share the same monthly Pratica
 * - Pratica stays in WP (working progress) until finalized at month end
 */

import { supabase } from '../config/supabase';
import { PartnerSolutionService } from './partnerSolutionService';
import {
  Invoice,
  InvoiceLineItem,
  InvoiceResult,
  BatchInvoiceResult,
  BookingDataForInvoice,
  ActivityDataForInvoice,
  InvoiceQueryFilters,
  InvoiceStats,
  InvoiceStatus,
  MonthlyPratica,
  MonthlyPraticaWithInvoices,
  PartnerSolutionConfig,
  PSStatus,
} from '../types/invoice.types';

export class InvoiceService {
  private partnerSolution: PartnerSolutionService;

  constructor() {
    this.partnerSolution = new PartnerSolutionService();
  }

  // ============================================
  // AUTO-INVOICE CONFIGURATION
  // ============================================

  /**
   * Check if auto-invoicing is enabled for a given seller
   */
  async shouldAutoInvoice(sellerName: string): Promise<boolean> {
    try {
      const { data } = await supabase
        .from('partner_solution_config')
        .select('auto_invoice_enabled, auto_invoice_sellers')
        .single();

      if (!data || !data.auto_invoice_enabled) {
        return false;
      }

      return data.auto_invoice_sellers?.includes(sellerName) || false;
    } catch (error) {
      console.error('Error checking auto-invoice config:', error);
      return false;
    }
  }

  /**
   * Check if auto credit note is enabled
   */
  async shouldAutoCreditNote(): Promise<boolean> {
    try {
      const { data } = await supabase
        .from('partner_solution_config')
        .select('auto_credit_note_enabled')
        .single();

      return data?.auto_credit_note_enabled || false;
    } catch (error) {
      console.error('Error checking auto credit note config:', error);
      return false;
    }
  }

  // ============================================
  // MONTHLY PRATICA MANAGEMENT
  // ============================================

  /**
   * Get or create monthly pratica for a given year-month
   * Creates in both local DB and Partner Solution if needed
   */
  async getOrCreateMonthlyPratica(yearMonth: string): Promise<MonthlyPratica> {
    console.log(`[InvoiceService] Getting/creating monthly pratica for ${yearMonth}...`);

    // 1. Check if monthly pratica exists in DB
    const { data: existing } = await supabase
      .from('monthly_praticas')
      .select('*')
      .eq('year_month', yearMonth)
      .single();

    if (existing) {
      // Check if it's finalized
      if (existing.ps_status === 'INS') {
        throw new Error(`Monthly pratica for ${yearMonth} is already finalized (INS). Cannot add more bookings.`);
      }
      console.log(`[InvoiceService] Found existing monthly pratica for ${yearMonth}: ${existing.id}`);
      return existing as MonthlyPratica;
    }

    // 2. Create new monthly pratica in DB first
    const config = await this.partnerSolution.getConfig();

    const { data: newPratica, error: insertError } = await supabase
      .from('monthly_praticas')
      .insert({
        year_month: yearMonth,
        ps_status: 'WP',
        total_amount: 0,
        booking_count: 0,
        ps_regime: config.default_regime,
        ps_sales_type: config.default_sales_type,
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to create monthly pratica record: ${insertError.message}`);
    }

    console.log(`[InvoiceService] Created new monthly pratica for ${yearMonth}: ${newPratica.id}`);

    // 3. Create Pratica in Partner Solution
    try {
      const now = new Date().toISOString();
      const psPratica = await this.partnerSolution.createPratica({
        codiceagenzia: process.env.PARTNER_SOLUTION_AGENCY_CODE || '7206',
        tipocattura: 'PS',
        stato: 'WP',
        datacreazione: now,
        datamodifica: now,
        cognomecliente: 'Monthly',
        nomecliente: 'Invoice',
        descrizionepratica: `Monthly Invoice: ${yearMonth}`,
        externalid: `MONTHLY-${yearMonth}`,
        delivering: `commessa:${yearMonth}`,
      } as any);

      // 4. Update DB record with Partner Solution IDs
      const { data: updated } = await supabase
        .from('monthly_praticas')
        .update({
          partner_pratica_id: psPratica['@id'],
          partner_pratica_number: psPratica.id?.toString() || null,
          raw_response: psPratica,
        })
        .eq('id', newPratica.id)
        .select()
        .single();

      console.log(`[InvoiceService] Linked monthly pratica to PS: ${psPratica['@id']}`);

      // 5. Log audit
      await this.logMonthlyPraticaAudit(newPratica.id, 'CREATED', null, 'WP', {
        yearMonth,
        partnerPraticaId: psPratica['@id'],
      });

      return updated as MonthlyPratica;
    } catch (psError) {
      // If PS creation fails, keep the DB record but mark as needing sync
      console.error('[InvoiceService] Failed to create Pratica in Partner Solution:', psError);

      await this.logMonthlyPraticaAudit(newPratica.id, 'FAILED', null, 'WP', {
        error: psError instanceof Error ? psError.message : 'Unknown error',
      });

      return newPratica as MonthlyPratica;
    }
  }

  /**
   * Get monthly praticas with optional filters
   */
  async getMonthlyPraticas(filters?: {
    startMonth?: string;
    endMonth?: string;
    psStatus?: PSStatus;
  }): Promise<MonthlyPratica[]> {
    let query = supabase
      .from('monthly_praticas')
      .select('*')
      .order('year_month', { ascending: false });

    if (filters?.startMonth) {
      query = query.gte('year_month', filters.startMonth);
    }
    if (filters?.endMonth) {
      query = query.lte('year_month', filters.endMonth);
    }
    if (filters?.psStatus) {
      query = query.eq('ps_status', filters.psStatus);
    }

    const { data } = await query;
    return (data || []) as MonthlyPratica[];
  }

  /**
   * Get monthly pratica with all its invoices
   */
  async getMonthlyPraticaWithInvoices(yearMonth: string): Promise<MonthlyPraticaWithInvoices | null> {
    const { data } = await supabase
      .from('monthly_praticas')
      .select('*, invoices(*)')
      .eq('year_month', yearMonth)
      .single();

    return data as MonthlyPraticaWithInvoices | null;
  }

  /**
   * Finalize a monthly pratica (WP -> INS)
   */
  async finalizePratica(yearMonth: string): Promise<InvoiceResult> {
    console.log(`[InvoiceService] Finalizing pratica for ${yearMonth}...`);

    const { data: pratica } = await supabase
      .from('monthly_praticas')
      .select('*')
      .eq('year_month', yearMonth)
      .single();

    if (!pratica) {
      return { success: false, error: `Monthly pratica not found for ${yearMonth}` };
    }

    if (pratica.ps_status === 'INS') {
      return { success: false, error: `Monthly pratica for ${yearMonth} is already finalized` };
    }

    if (!pratica.partner_pratica_id) {
      return { success: false, error: `Monthly pratica for ${yearMonth} has no Partner Solution ID` };
    }

    try {
      // Update status in Partner Solution
      await this.partnerSolution.updatePraticaStatus(pratica.partner_pratica_id, 'INS');

      // Update local DB
      await supabase
        .from('monthly_praticas')
        .update({
          ps_status: 'INS',
          finalized_at: new Date().toISOString(),
        })
        .eq('id', pratica.id);

      await this.logMonthlyPraticaAudit(pratica.id, 'FINALIZED', 'WP', 'INS', {
        yearMonth,
        finalBookingCount: pratica.booking_count,
        finalTotalAmount: pratica.total_amount,
      });

      console.log(`[InvoiceService] Successfully finalized pratica for ${yearMonth}`);

      return {
        success: true,
        monthlyPraticaId: pratica.id,
        partnerPraticaId: pratica.partner_pratica_id,
        partnerPraticaNumber: pratica.partner_pratica_number,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[InvoiceService] Failed to finalize pratica:`, error);

      await this.logMonthlyPraticaAudit(pratica.id, 'FAILED', 'WP', 'WP', {
        error: errorMsg,
        action: 'finalize',
      });

      return { success: false, error: errorMsg };
    }
  }

  // ============================================
  // INVOICE CREATION (ADD BOOKING TO MONTHLY PRATICA)
  // ============================================

  /**
   * Main method: Add booking to monthly pratica
   */
  async createInvoiceFromBooking(
    bookingId: number,
    triggeredBy: string = 'webhook'
  ): Promise<InvoiceResult> {
    console.log(`[InvoiceService] Adding booking ${bookingId} to monthly pratica...`);

    try {
      // 1. Check if invoice already exists for this booking
      const { data: existing } = await supabase
        .from('invoices')
        .select('id, status, monthly_pratica_id')
        .eq('booking_id', bookingId)
        .eq('invoice_type', 'INVOICE')
        .single();

      if (existing) {
        console.log(`[InvoiceService] Invoice already exists for booking ${bookingId} (status: ${existing.status})`);
        return { success: true, invoiceId: existing.id, monthlyPraticaId: existing.monthly_pratica_id };
      }

      // 2. Fetch booking data with activities
      const bookingData = await this.fetchBookingData(bookingId);
      if (!bookingData) {
        throw new Error(`Booking ${bookingId} not found`);
      }

      // 3. Determine year-month based on invoice rules
      // Check if there's a rule for this seller
      let yearMonth: string;
      const sellerName = bookingData.activities?.[0]?.activity_seller || bookingData.seller_name;

      if (sellerName) {
        const { data: rules } = await supabase
          .from('invoice_rules')
          .select('invoice_date_type')
          .contains('sellers', [sellerName])
          .single();

        if (rules?.invoice_date_type === 'travel' && bookingData.activities?.[0]?.start_date_time) {
          // Use travel date for this seller
          const travelDate = bookingData.activities[0].start_date_time.split('T')[0];
          yearMonth = travelDate.substring(0, 7);
          console.log(`[InvoiceService] Using travel date for ${sellerName}: ${travelDate} -> ${yearMonth}`);
        } else {
          // Use creation date
          yearMonth = bookingData.creation_date.substring(0, 7);
          console.log(`[InvoiceService] Using creation date: ${bookingData.creation_date} -> ${yearMonth}`);
        }
      } else {
        // Fallback to creation date
        yearMonth = bookingData.creation_date.substring(0, 7);
        console.log(`[InvoiceService] No seller, using creation date: ${yearMonth}`);
      }

      // 4. Get or create monthly pratica
      const monthlyPratica = await this.getOrCreateMonthlyPratica(yearMonth);

      // 5. Create invoice record
      const { data: invoice, error: insertError } = await supabase
        .from('invoices')
        .insert({
          monthly_pratica_id: monthlyPratica.id,
          booking_id: bookingId,
          confirmation_code: bookingData.confirmation_code,
          invoice_type: 'INVOICE',
          status: 'pending' as InvoiceStatus,
          total_amount: bookingData.total_price,
          currency: bookingData.currency || 'EUR',
          customer_name: bookingData.customer
            ? `${bookingData.customer.first_name} ${bookingData.customer.last_name}`
            : null,
          customer_email: bookingData.customer?.email || null,
          seller_name: bookingData.seller_name || null,
          booking_creation_date: bookingData.creation_date.split('T')[0],
          created_by: triggeredBy,
        })
        .select()
        .single();

      if (insertError) {
        throw new Error(`Failed to create invoice record: ${insertError.message}`);
      }

      // 6. Create line items and servizi
      const result = await this.addServiziToMonthlyPratica(
        invoice.id,
        monthlyPratica,
        bookingData
      );

      if (!result.success) {
        // Update invoice as failed
        await supabase
          .from('invoices')
          .update({
            status: 'failed' as InvoiceStatus,
            error_message: result.error,
          })
          .eq('id', invoice.id);

        return result;
      }

      // 7. Update invoice status to sent
      await supabase
        .from('invoices')
        .update({
          status: 'sent' as InvoiceStatus,
          sent_at: new Date().toISOString(),
        })
        .eq('id', invoice.id);

      // 8. Update monthly pratica totals
      await this.updateMonthlyPraticaTotals(monthlyPratica.id);

      // 9. Log audit
      await this.logInvoiceAudit(invoice.id, 'SENT', 'pending', 'sent', {
        triggeredBy,
        monthlyPraticaId: monthlyPratica.id,
        yearMonth,
        bookingAmount: bookingData.total_price,
      });

      console.log(`[InvoiceService] Successfully added booking ${bookingId} to monthly pratica ${yearMonth}`);

      return {
        success: true,
        invoiceId: invoice.id,
        monthlyPraticaId: monthlyPratica.id,
        partnerPraticaId: monthlyPratica.partner_pratica_id || undefined,
        partnerPraticaNumber: monthlyPratica.partner_pratica_number || undefined,
      };
    } catch (error) {
      console.error(`[InvoiceService] Error adding booking ${bookingId} to monthly pratica:`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Add Servizi for a booking's activities to the monthly Pratica
   */
  private async addServiziToMonthlyPratica(
    invoiceId: string,
    monthlyPratica: MonthlyPratica,
    bookingData: BookingDataForInvoice
  ): Promise<InvoiceResult> {
    const config = await this.partnerSolution.getConfig();

    // Check if monthly pratica has Partner Solution ID
    if (!monthlyPratica.partner_pratica_id) {
      // Try to create it now
      try {
        const now = new Date().toISOString();
        const psPratica = await this.partnerSolution.createPratica({
          codiceagenzia: process.env.PARTNER_SOLUTION_AGENCY_CODE || '7206',
          tipocattura: 'PS',
          stato: 'WP',
          datacreazione: now,
          datamodifica: now,
          cognomecliente: 'Monthly',
          nomecliente: 'Invoice',
          descrizionepratica: `Monthly Invoice: ${monthlyPratica.year_month}`,
          externalid: `MONTHLY-${monthlyPratica.year_month}`,
          delivering: `commessa:${monthlyPratica.year_month}`,
        } as any);

        await supabase
          .from('monthly_praticas')
          .update({
            partner_pratica_id: psPratica['@id'],
            partner_pratica_number: psPratica.id?.toString() || null,
            raw_response: psPratica,
          })
          .eq('id', monthlyPratica.id);

        monthlyPratica.partner_pratica_id = psPratica['@id'];
        monthlyPratica.partner_pratica_number = psPratica.id?.toString() || null;
      } catch (error) {
        return {
          success: false,
          error: `Failed to create Partner Solution Pratica: ${error instanceof Error ? error.message : 'Unknown'}`,
        };
      }
    }

    const agencyCode = process.env.PARTNER_SOLUTION_AGENCY_CODE || '7206';
    const now = new Date().toISOString();

    // Step 1: Create/Get Account (Cliente) with codicefiscale = bookingId
    console.log(`[InvoiceService] Step 1: Creating Account for booking ${bookingData.booking_id}...`);
    let accountIri: string | null = null;
    try {
      const account = await this.partnerSolution.getOrCreateAccount({
        customer_id: String(bookingData.booking_id),
        first_name: bookingData.customer?.first_name || 'N/A',
        last_name: bookingData.customer?.last_name || 'N/A',
        email: bookingData.customer?.email,
        phone_number: bookingData.customer?.phone_number,
      });
      accountIri = account['@id'];
      console.log(`[InvoiceService] Account created/found: ${accountIri}`);
    } catch (error) {
      console.warn(`[InvoiceService] Failed to create account, continuing without:`, error);
    }

    // Step 2: Create Passeggero (linked to pratica)
    console.log(`[InvoiceService] Step 2: Creating Passeggero...`);
    try {
      await this.partnerSolution.createPasseggero({
        pratica: monthlyPratica.partner_pratica_id!,
        cognomepax: bookingData.customer?.last_name || 'N/A',
        nomepax: bookingData.customer?.first_name || 'N/A',
        annullata: 0,
        iscontraente: 1,
      });
      console.log(`[InvoiceService] Passeggero created`);
    } catch (error) {
      console.warn(`[InvoiceService] Failed to create passeggero, continuing:`, error);
    }

    // Step 3-5: Create Servizi, Quote, Movimenti for each activity
    for (const activity of bookingData.activities) {
      const activityDate = activity.start_date_time?.split('T')[0] || new Date().toISOString().split('T')[0];

      try {
        // Create Servizio in Partner Solution
        console.log(`[InvoiceService] Step 3: Creating Servizio for activity ${activity.activity_booking_id}...`);
        const servizio = await this.partnerSolution.createServizio({
          pratica: monthlyPratica.partner_pratica_id!,
          tiposervizio: 'VIS', // Always VIS for tours
          tipovendita: 'ORG',
          regimevendita: '74T',
          datainizioservizio: activityDate,
          datafineservizio: activityDate,
          datacreazione: now,
          nrpaxadulti: activity.participant_count || 1,
          nrpaxchild: 0,
          nrpaxinfant: 0,
          codicefornitore: 'IT09802381005',
          codicefilefornitore: String(bookingData.booking_id),
          ragsocfornitore: 'AGENZIA VIAGGI PROPRI',
          tipodestinazione: 'CEENAZ',
          duratagg: 1,
          duratant: 0,
          annullata: 0,
          descrizione: 'Tour Italia e Vaticano',
          codiceagenzia: agencyCode,
          stato: 'INS',
        } as any);

        // Create Quota for the servizio
        await this.partnerSolution.createQuota({
          servizio: servizio['@id'],
          descrizionequota: `${bookingData.confirmation_code} - ${activity.activity_booking_id}`,
          datavendita: activityDate,
          codiceisovalutacosto: 'EUR',
          codiceisovalutaricavo: 'EUR',
          quantitacosto: 1,
          quantitaricavo: 1,
          costovalutaprimaria: activity.total_price,
          ricavovalutaprimaria: activity.total_price,
          progressivo: 1,
          annullata: 0,
          commissioniattivevalutaprimaria: 0,
          commissionipassivevalutaprimaria: 0,
          codiceagenzia: agencyCode,
          stato: 'INS',
        } as any);

        // Create Movimento Finanziario (payment record)
        await this.partnerSolution.createMovimentoFinanziario({
          externalid: String(bookingData.booking_id),
          tipomovimento: 'I',
          codicefile: String(bookingData.booking_id),
          codiceagenzia: agencyCode,
          tipocattura: 'PS',
          importo: activity.total_price,
          datacreazione: now,
          datamodifica: now,
          datamovimento: activityDate,
          stato: 'INS',
          codcausale: 'PAGCC',
          descrizione: `${bookingData.confirmation_code} - ${activity.product_title}`,
        });

        // Create line item in DB
        await supabase.from('invoice_line_items').insert({
          invoice_id: invoiceId,
          activity_booking_id: activity.activity_booking_id,
          partner_servizio_id: servizio['@id'],
          product_title: activity.product_title,
          quantity: activity.participant_count || 1,
          unit_price: activity.total_price,
          total_price: activity.total_price,
          activity_date: activityDate,
          participant_count: activity.participant_count || 1,
        });
      } catch (error) {
        console.error(`[InvoiceService] Failed to create servizio for activity ${activity.activity_booking_id}:`, error);
        return {
          success: false,
          error: `Failed to create servizio: ${error instanceof Error ? error.message : 'Unknown'}`,
        };
      }
    }

    // Note: Pratica totals are calculated automatically by Partner Solution from quotas

    return { success: true, invoiceId };
  }

  /**
   * Update monthly pratica totals from invoices
   */
  private async updateMonthlyPraticaTotals(monthlyPraticaId: string): Promise<void> {
    // Sum up all sent invoices for this monthly pratica
    const { data: invoices } = await supabase
      .from('invoices')
      .select('total_amount')
      .eq('monthly_pratica_id', monthlyPraticaId)
      .eq('status', 'sent');

    const totalAmount = invoices?.reduce((sum, inv) => sum + (inv.total_amount || 0), 0) || 0;
    const bookingCount = invoices?.length || 0;

    await supabase
      .from('monthly_praticas')
      .update({
        total_amount: totalAmount,
        booking_count: bookingCount,
      })
      .eq('id', monthlyPraticaId);
  }

  // ============================================
  // SDI (DOCFISCALE) INVOICE CREATION
  // ============================================

  /**
   * Create an SDI electronic invoice (Docfiscale) from booking data
   * This creates:
   * 1. Docfiscale (invoice header) with customer Anagrafica
   * 2. DocfiscaleDettaglio with "Tour Italia e Vaticano"
   * 3. DocfiscaleXML to send to SDI
   *
   * Can optionally link to an existing Pratica
   */
  async createSdiInvoiceFromBooking(
    bookingId: number,
    options?: {
      praticaIri?: string;
      sendToSdi?: boolean;
      triggeredBy?: string;
    }
  ): Promise<{
    success: boolean;
    docfiscaleId?: number;
    docfiscaleIri?: string;
    invoiceNumber?: string;
    docfiscalexmlId?: number;
    error?: string;
  }> {
    console.log(`[InvoiceService] Creating SDI invoice for booking ${bookingId}...`);

    try {
      // Fetch booking data
      const bookingData = await this.fetchBookingData(bookingId);
      if (!bookingData) {
        return { success: false, error: `Booking ${bookingId} not found` };
      }

      if (!bookingData.customer) {
        return { success: false, error: `No customer data found for booking ${bookingId}` };
      }

      // Determine invoice date (booking creation date)
      const invoiceDate = bookingData.creation_date.split('T')[0];

      // Create SDI invoice using PartnerSolutionService
      const result = await this.partnerSolution.createSdiInvoice({
        customer: {
          firstName: bookingData.customer.first_name || 'N/A',
          lastName: bookingData.customer.last_name || 'N/A',
          email: bookingData.customer.email,
          // Note: codiceFiscale/partitaIva would need to be stored in customer table
          // For now, SDI will use default codes for foreign customers
        },
        booking: {
          confirmationCode: bookingData.confirmation_code,
          totalAmount: bookingData.total_price,
          invoiceDate: invoiceDate,
          description: `Tour - Booking ${bookingData.confirmation_code}`,
        },
        praticaIri: options?.praticaIri,
        sendToSdi: options?.sendToSdi ?? true,
      });

      console.log(`[InvoiceService] SDI invoice created successfully for booking ${bookingId}`);
      console.log(`  - Docfiscale IRI: ${result.docfiscale['@id']}`);
      console.log(`  - Invoice Number: ${result.docfiscale.numerodocfiscale}`);

      // Update the invoices table with docfiscale info (if invoice record exists)
      await supabase
        .from('invoices')
        .update({
          docfiscale_id: result.docfiscale.id,
          docfiscale_iri: result.docfiscale['@id'],
          docfiscale_number: result.docfiscale.numerodocfiscale,
          docfiscalexml_id: result.docfiscalexml?.id,
        })
        .eq('booking_id', bookingId)
        .eq('invoice_type', 'INVOICE');

      return {
        success: true,
        docfiscaleId: result.docfiscale.id,
        docfiscaleIri: result.docfiscale['@id'],
        invoiceNumber: result.docfiscale.numerodocfiscale,
        docfiscalexmlId: result.docfiscalexml?.id,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[InvoiceService] Error creating SDI invoice for booking ${bookingId}:`, error);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Create SDI credit note (Nota di Credito) for a refunded/cancelled booking
   */
  async createSdiCreditNote(
    bookingId: number,
    options?: {
      creditAmount?: number;
      triggeredBy?: string;
      sendToSdi?: boolean;
    }
  ): Promise<{
    success: boolean;
    docfiscaleId?: number;
    docfiscaleIri?: string;
    creditNoteNumber?: string;
    error?: string;
  }> {
    console.log(`[InvoiceService] Creating SDI credit note for booking ${bookingId}...`);

    try {
      // Find the original invoice to get docfiscale info
      const { data: originalInvoice } = await supabase
        .from('invoices')
        .select('*')
        .eq('booking_id', bookingId)
        .eq('invoice_type', 'INVOICE')
        .single();

      if (!originalInvoice) {
        return { success: false, error: `No invoice found for booking ${bookingId}` };
      }

      // Fetch booking/customer data
      const bookingData = await this.fetchBookingData(bookingId);
      if (!bookingData || !bookingData.customer) {
        return { success: false, error: `No customer data found for booking ${bookingId}` };
      }

      const creditAmount = options?.creditAmount ?? originalInvoice.total_amount;
      const originalInvoiceNumber = originalInvoice.docfiscale_number ||
        originalInvoice.confirmation_code;

      // Create SDI credit note
      const result = await this.partnerSolution.createSdiCreditNote({
        customer: {
          firstName: bookingData.customer.first_name || 'N/A',
          lastName: bookingData.customer.last_name || 'N/A',
          email: bookingData.customer.email,
        },
        booking: {
          confirmationCode: bookingData.confirmation_code,
          originalInvoiceNumber: originalInvoiceNumber,
          creditAmount: Math.abs(creditAmount),
          creditDate: new Date().toISOString().split('T')[0],
          description: `Nota di credito per Booking ${bookingData.confirmation_code}`,
        },
        sendToSdi: options?.sendToSdi ?? true,
      });

      console.log(`[InvoiceService] SDI credit note created for booking ${bookingId}`);

      // Update the credit note record with docfiscale info
      await supabase
        .from('invoices')
        .update({
          docfiscale_id: result.docfiscale.id,
          docfiscale_iri: result.docfiscale['@id'],
          docfiscale_number: result.docfiscale.numerodocfiscale,
          docfiscalexml_id: result.docfiscalexml?.id,
        })
        .eq('booking_id', bookingId)
        .eq('invoice_type', 'CREDIT_NOTE');

      return {
        success: true,
        docfiscaleId: result.docfiscale.id,
        docfiscaleIri: result.docfiscale['@id'],
        creditNoteNumber: result.docfiscale.numerodocfiscale,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[InvoiceService] Error creating SDI credit note for booking ${bookingId}:`, error);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Check SDI status for an invoice (get notifications)
   */
  async checkSdiStatus(bookingId: number): Promise<{
    success: boolean;
    status?: string;
    notifications?: any[];
    error?: string;
  }> {
    try {
      // Get invoice with docfiscalexml_id
      const { data: invoice } = await supabase
        .from('invoices')
        .select('docfiscalexml_id')
        .eq('booking_id', bookingId)
        .eq('invoice_type', 'INVOICE')
        .single();

      if (!invoice?.docfiscalexml_id) {
        return { success: false, error: 'No SDI submission found for this booking' };
      }

      // Get notifications from Partner Solution
      const notifications = await this.partnerSolution.getDocfiscaleXMLNotifiche(
        invoice.docfiscalexml_id
      );

      // Determine status based on notifications
      let status = 'SUBMITTED';
      if (notifications.length > 0) {
        const latestNotifica = notifications[notifications.length - 1];
        // RC = Ricevuta di Consegna (delivered), NS = Notifica di Scarto (rejected)
        // MC = Mancata Consegna (delivery failed), AT = Attestazione
        status = latestNotifica.tiponotifica;
      }

      return {
        success: true,
        status,
        notifications,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMsg };
    }
  }

  // ============================================
  // CREDIT NOTES
  // ============================================

  /**
   * Create credit note for cancelled booking/activity
   */
  async createCreditNote(
    bookingId: number,
    activityBookingId?: number,
    triggeredBy: string = 'webhook'
  ): Promise<InvoiceResult> {
    console.log(`[InvoiceService] Creating credit note for booking ${bookingId}...`);

    try {
      // Find the original invoice
      const { data: originalInvoice } = await supabase
        .from('invoices')
        .select('*, invoice_line_items(*), monthly_pratica:monthly_praticas(*)')
        .eq('booking_id', bookingId)
        .eq('invoice_type', 'INVOICE')
        .single();

      if (!originalInvoice) {
        console.log(`[InvoiceService] No invoice found for booking ${bookingId}, skipping credit note`);
        return { success: true };
      }

      // Check if credit note already exists
      const { data: existingCreditNote } = await supabase
        .from('invoices')
        .select('id')
        .eq('booking_id', bookingId)
        .eq('invoice_type', 'CREDIT_NOTE')
        .single();

      if (existingCreditNote) {
        console.log(`[InvoiceService] Credit note already exists for booking ${bookingId}`);
        return { success: true, invoiceId: existingCreditNote.id };
      }

      // Calculate credit amount
      let creditAmount = originalInvoice.total_amount;
      if (activityBookingId && originalInvoice.invoice_line_items) {
        const lineItem = originalInvoice.invoice_line_items.find(
          (item: InvoiceLineItem) => item.activity_booking_id === activityBookingId
        );
        if (lineItem) {
          creditAmount = lineItem.total_price;
        }
      }

      // Create credit note record
      const { data: creditNote, error } = await supabase
        .from('invoices')
        .insert({
          monthly_pratica_id: originalInvoice.monthly_pratica_id,
          booking_id: bookingId,
          confirmation_code: originalInvoice.confirmation_code,
          invoice_type: 'CREDIT_NOTE',
          status: 'pending' as InvoiceStatus,
          total_amount: -Math.abs(creditAmount),
          currency: originalInvoice.currency,
          customer_name: originalInvoice.customer_name,
          customer_email: originalInvoice.customer_email,
          seller_name: originalInvoice.seller_name,
          booking_creation_date: originalInvoice.booking_creation_date,
          created_by: triggeredBy,
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create credit note record: ${error.message}`);
      }

      await this.logInvoiceAudit(creditNote.id, 'CREATED', null, 'pending', {
        triggeredBy,
        originalInvoiceId: originalInvoice.id,
        activityBookingId,
        creditAmount: -Math.abs(creditAmount),
      });

      // TODO: Create negative Servizio in Partner Solution for credit
      // For now, mark as sent (manual processing in PS)
      await supabase
        .from('invoices')
        .update({
          status: 'sent' as InvoiceStatus,
          sent_at: new Date().toISOString(),
        })
        .eq('id', creditNote.id);

      // Update monthly pratica totals
      if (originalInvoice.monthly_pratica_id) {
        await this.updateMonthlyPraticaTotals(originalInvoice.monthly_pratica_id);
      }

      console.log(`[InvoiceService] Credit note created: ${creditNote.id}`);

      return {
        success: true,
        invoiceId: creditNote.id,
        monthlyPraticaId: originalInvoice.monthly_pratica_id,
      };
    } catch (error) {
      console.error('[InvoiceService] Error creating credit note:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ============================================
  // RETRY LOGIC
  // ============================================

  /**
   * Retry failed invoices
   */
  async retryFailedInvoices(maxRetries: number = 3): Promise<BatchInvoiceResult> {
    console.log(`[InvoiceService] Retrying failed invoices (max retries: ${maxRetries})...`);

    const { data: failedInvoices } = await supabase
      .from('invoices')
      .select('id, booking_id, monthly_pratica_id')
      .eq('status', 'failed')
      .lt('retry_count', maxRetries);

    const results: BatchInvoiceResult = {
      success: [],
      failed: [],
    };

    for (const invoice of failedInvoices || []) {
      console.log(`[InvoiceService] Retrying invoice ${invoice.id} for booking ${invoice.booking_id}...`);

      // Delete existing invoice and retry fresh
      await supabase
        .from('invoices')
        .delete()
        .eq('id', invoice.id);

      const result = await this.createInvoiceFromBooking(invoice.booking_id, 'retry');

      if (result.success) {
        results.success.push(invoice.booking_id);
      } else {
        results.failed.push({
          bookingId: invoice.booking_id,
          error: result.error || 'Unknown error',
        });
      }
    }

    console.log(`[InvoiceService] Retry complete: ${results.success.length} success, ${results.failed.length} failed`);
    return results;
  }

  // ============================================
  // BOOKING DATA FETCHING
  // ============================================

  /**
   * Fetch booking data with all related information for invoicing
   */
  async fetchBookingData(bookingId: number): Promise<BookingDataForInvoice | null> {
    // Get booking
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('booking_id', bookingId)
      .single();

    if (bookingError || !booking) {
      console.error(`[InvoiceService] Booking ${bookingId} not found`);
      return null;
    }

    // Get seller name if seller_id exists
    let sellerName: string | undefined;
    if (booking.seller_id) {
      const { data: seller } = await supabase
        .from('sellers')
        .select('title')
        .eq('seller_id', booking.seller_id)
        .single();
      sellerName = seller?.title;
    }

    // Get customer via booking_customers junction table
    let customer = null;
    const { data: customerLink } = await supabase
      .from('booking_customers')
      .select('customer_id')
      .eq('booking_id', bookingId)
      .single();

    if (customerLink) {
      const { data: customerData } = await supabase
        .from('customers')
        .select('*')
        .eq('customer_id', customerLink.customer_id)
        .single();
      customer = customerData;
    }

    // Get activities (only confirmed ones)
    const { data: activities } = await supabase
      .from('activity_bookings')
      .select('*')
      .eq('booking_id', bookingId)
      .neq('status', 'CANCELLED');

    // Get participant counts for each activity
    const activitiesWithCounts: ActivityDataForInvoice[] = [];
    for (const activity of activities || []) {
      const { data: participants } = await supabase
        .from('pricing_category_bookings')
        .select('quantity')
        .eq('activity_booking_id', activity.activity_booking_id);

      const participantCount = participants?.reduce(
        (sum, p) => sum + (p.quantity || 1),
        0
      ) || 1;

      activitiesWithCounts.push({
        activity_booking_id: activity.activity_booking_id,
        product_id: activity.product_id,
        product_title: activity.product_title,
        total_price: activity.total_price,
        start_date_time: activity.start_date_time,
        end_date_time: activity.end_date_time,
        status: activity.status,
        participant_count: participantCount,
        rate_title: activity.rate_title,
        activity_seller: activity.activity_seller,
      });
    }

    return {
      booking_id: bookingId,
      confirmation_code: booking.confirmation_code,
      total_price: booking.total_price,
      currency: booking.currency,
      creation_date: booking.creation_date,
      status: booking.status,
      seller_name: sellerName,
      customer: customer
        ? {
            customer_id: customer.customer_id,
            email: customer.email,
            first_name: customer.first_name,
            last_name: customer.last_name,
            phone_number: customer.phone_number,
          }
        : undefined,
      activities: activitiesWithCounts,
    };
  }

  // ============================================
  // QUERY METHODS
  // ============================================

  /**
   * Get invoices for a specific booking
   */
  async getInvoicesForBooking(bookingId: number): Promise<Invoice[]> {
    const { data } = await supabase
      .from('invoices')
      .select('*, invoice_line_items(*), monthly_pratica:monthly_praticas(*)')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false });

    return data || [];
  }

  /**
   * Query invoices with filters
   */
  async queryInvoices(filters: InvoiceQueryFilters): Promise<Invoice[]> {
    let query = supabase
      .from('invoices')
      .select('*, invoice_line_items(*), monthly_pratica:monthly_praticas(*)')
      .order('created_at', { ascending: false });

    if (filters.startDate) {
      query = query.gte('created_at', filters.startDate);
    }
    if (filters.endDate) {
      query = query.lte('created_at', filters.endDate + 'T23:59:59');
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.invoiceType) {
      query = query.eq('invoice_type', filters.invoiceType);
    }
    if (filters.customerEmail) {
      query = query.ilike('customer_email', `%${filters.customerEmail}%`);
    }
    if (filters.confirmationCode) {
      query = query.ilike('confirmation_code', `%${filters.confirmationCode}%`);
    }
    if (filters.seller) {
      query = query.ilike('seller_name', `%${filters.seller}%`);
    }

    const { data } = await query;
    return data || [];
  }

  /**
   * Get invoice statistics
   */
  async getStats(): Promise<InvoiceStats> {
    // Get invoice stats
    const { data: invoices } = await supabase
      .from('invoices')
      .select('status, invoice_type, total_amount');

    // Get monthly pratica stats
    const { data: praticas } = await supabase
      .from('monthly_praticas')
      .select('ps_status');

    const stats: InvoiceStats = {
      totalInvoices: 0,
      pending: 0,
      sent: 0,
      failed: 0,
      totalAmount: 0,
      monthlyPraticas: {
        total: praticas?.length || 0,
        open: praticas?.filter(p => p.ps_status === 'WP').length || 0,
        finalized: praticas?.filter(p => p.ps_status === 'INS').length || 0,
      },
    };

    for (const inv of invoices || []) {
      if (inv.invoice_type === 'INVOICE') {
        stats.totalInvoices++;
        stats.totalAmount += inv.total_amount || 0;

        if (inv.status === 'pending') stats.pending++;
        else if (inv.status === 'sent') stats.sent++;
        else if (inv.status === 'failed') stats.failed++;
      }
    }

    return stats;
  }

  /**
   * Get configuration
   */
  async getConfig(): Promise<PartnerSolutionConfig> {
    return this.partnerSolution.getConfig();
  }

  /**
   * Update configuration
   */
  async updateConfig(updates: Partial<PartnerSolutionConfig>): Promise<PartnerSolutionConfig> {
    const { data, error } = await supabase
      .from('partner_solution_config')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update config: ${error.message}`);
    }

    // Clear cache
    this.partnerSolution.clearConfigCache();

    return data as PartnerSolutionConfig;
  }

  // ============================================
  // AUDIT LOGGING
  // ============================================

  /**
   * Log invoice audit event
   */
  private async logInvoiceAudit(
    invoiceId: string,
    action: string,
    statusFrom: InvoiceStatus | null,
    statusTo: InvoiceStatus,
    details?: Record<string, unknown>
  ): Promise<void> {
    await supabase.from('invoice_audit_log').insert({
      invoice_id: invoiceId,
      action,
      status_from: statusFrom,
      status_to: statusTo,
      details,
      created_by: (details?.triggeredBy as string) || 'system',
    });
  }

  /**
   * Log monthly pratica audit event
   */
  private async logMonthlyPraticaAudit(
    monthlyPraticaId: string,
    action: string,
    statusFrom: PSStatus | null,
    statusTo: PSStatus,
    details?: Record<string, unknown>
  ): Promise<void> {
    await supabase.from('invoice_audit_log').insert({
      monthly_pratica_id: monthlyPraticaId,
      action,
      status_from: statusFrom,
      status_to: statusTo,
      details,
      created_by: (details?.triggeredBy as string) || 'system',
    });
  }
}

// Export singleton instance
export const invoiceService = new InvoiceService();
