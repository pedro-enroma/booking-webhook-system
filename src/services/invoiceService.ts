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
import { InvoiceRulesService } from './invoiceRulesService';
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

interface InvoiceRule {
  invoice_date_type: 'creation' | 'travel' | 'creation_date' | 'travel_date';
  sellers: string[];
  invoice_start_date?: string | null;
  name?: string;
  is_active?: boolean;
}

export class InvoiceService {
  private partnerSolution: PartnerSolutionService;
  private invoiceRulesService: InvoiceRulesService;

  constructor() {
    this.partnerSolution = new PartnerSolutionService();
    this.invoiceRulesService = new InvoiceRulesService();
  }

  // ============================================
  // AUTO-INVOICE CONFIGURATION
  // ============================================

  /**
   * Check if auto-invoicing is enabled for a given seller
   * Uses the new invoice_rules table with creation_date rules
   */
  async shouldAutoInvoice(sellerName: string): Promise<boolean> {
    try {
      // Check new invoice_rules table for creation_date rules
      const { data: rules, error } = await supabase
        .from('invoice_rules')
        .select('id, invoice_date_type, sellers, invoice_start_date, is_active')
        .eq('is_active', true)
        .eq('invoice_date_type', 'creation_date');

      if (error || !rules || rules.length === 0) {
        // Fallback to old config table for backwards compatibility
        const { data } = await supabase
          .from('partner_solution_config')
          .select('auto_invoice_enabled, auto_invoice_sellers')
          .single();

        if (!data || !data.auto_invoice_enabled) {
          return false;
        }

        return data.auto_invoice_sellers?.includes(sellerName) || false;
      }

      // Check if seller is in any creation_date rule
      for (const rule of rules) {
        if (rule.sellers?.includes(sellerName)) {
          console.log(`[InvoiceService] Seller ${sellerName} matches creation_date rule`);
          return true;
        }
      }

      return false;
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
  // INDIVIDUAL PRATICA CREATION (for creation_date rules)
  // ============================================

  /**
   * Create an individual pratica for a booking (instant invoicing)
   * Used by creation_date rules - one pratica per booking
   */
  async createIndividualPratica(bookingId: number, overrideTotalPrice?: number): Promise<{
    success: boolean;
    praticaIri?: string;
    error?: string;
    skipped?: boolean;
    alreadyInvoiced?: boolean;
  }> {
    try {
      console.log(`[InvoiceService] Creating individual pratica for booking ${bookingId}...`);
      if (overrideTotalPrice !== undefined) {
        console.log(`[InvoiceService] Using webhook total price: ${overrideTotalPrice}`);
      }

      // Check if already invoiced
      const { data: existingInvoice } = await supabase
        .from('invoices')
        .select('id')
        .eq('booking_id', bookingId)
        .eq('invoice_type', 'INVOICE')
        .single();

      if (existingInvoice) {
        console.log(`[InvoiceService] Booking ${bookingId} already invoiced`);
        return { success: true, alreadyInvoiced: true };
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
        return { success: false, error: `Booking ${bookingId} not found` };
      }

      // Skip zero-amount bookings (use override if provided)
      const effectiveTotal = overrideTotalPrice ?? booking.total_price ?? 0;
      if (effectiveTotal <= 0) {
        console.log(`[InvoiceService] Skipping booking ${bookingId} - zero amount`);
        return { success: true, skipped: true };
      }

      // Get customer and seller info
      const customer = (booking as any).booking_customers?.[0]?.customers;
      const activities = ((booking as any).activity_bookings || []).filter((a: any) => a.status === 'CONFIRMED');
      const sellerName = activities.find((a: any) => a.activity_seller)?.activity_seller || null;

      // Check if seller matches a creation_date rule
      const rule = await this.getInvoiceRuleForSeller(sellerName);
      if (!rule || (rule.invoice_date_type !== 'creation_date' && rule.invoice_date_type !== 'creation')) {
        console.log(`[InvoiceService] No creation_date rule for seller ${sellerName}`);
        return { success: false, error: 'No creation_date rule for this seller' };
      }

      // Get PS client
      const client = await (this.partnerSolution as any).getClient();
      const agencyCode = process.env.PARTNER_SOLUTION_AGENCY_CODE || '7206';
      const now = new Date().toISOString();
      const bookingIdPadded = String(bookingId).padStart(9, '0');

      // Get year-month for commessa
      const yearMonth = this.formatYearMonth(booking.creation_date || now);
      const nrCommessa = yearMonth.replace('-', '');
      const deliveringValue = `commessa: ${nrCommessa}`;

      const customerName = {
        firstName: customer?.first_name || 'N/A',
        lastName: customer?.last_name || 'N/A',
      };
      const customerPhone = customer?.phone_number || null;
      const customerCountry = this.getCountryFromPhone(customerPhone);

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
      const accountId = accountIri.split('/').pop();

      // Step 2: Create Pratica (WP)
      const praticaPayload = {
        codicecliente: accountId,
        externalid: bookingIdPadded,
        cognomecliente: customerName.lastName,
        nomecliente: customerName.firstName,
        codiceagenzia: agencyCode,
        tipocattura: 'PS',
        datacreazione: now,
        datamodifica: now,
        stato: 'WP',
        descrizionepratica: 'Tour UE ed Extra UE',
        noteinterne: sellerName ? `Seller: ${sellerName}` : null,
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

      // Step 4: Add Servizio
      // Use override from webhook if provided (fixes multi-activity race condition)
      const totalAmount = overrideTotalPrice ?? booking.total_price ?? 0;
      const todayDate = now.split('T')[0];  // datacreazione, datainizioservizio, datafineservizio always now

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
        datainizioservizio: todayDate,
        datafineservizio: todayDate,
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

      // Step 5: Add Quota
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
        seller_name: sellerName,
        booking_creation_date: booking.creation_date?.split('T')[0],
        sent_at: now,
        ps_pratica_iri: praticaIri,
        ps_account_iri: accountIri,
        ps_passeggero_iri: passeggeroResponse.data['@id'],
        ps_movimento_iri: movimentoResponse.data['@id'],
        ps_commessa_code: yearMonth,
        created_by: 'creation_date_auto',
      }, { onConflict: 'booking_id,invoice_type' });

      console.log(`[InvoiceService] Successfully created individual pratica for booking ${bookingId}: ${praticaIri}`);

      return { success: true, praticaIri };
    } catch (error: any) {
      const errorMsg = error.response?.data?.['hydra:description'] || error.message;
      console.error(`[InvoiceService] Error creating individual pratica for ${bookingId}:`, errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Process travel_date invoicing for a given date (called by cron)
   * Finds bookings where the latest activity date = targetDate and sends to Partner Solution
   */
  async processTravelDateInvoicing(targetDate: string): Promise<{
    success: boolean;
    summary: { total: number; sent: number; failed: number };
    bookings: Array<{
      booking_id: number;
      confirmation_code: string;
      status: 'sent' | 'failed';
      error?: string;
    }>;
  }> {
    console.log(`[InvoiceService] Processing travel_date invoicing for ${targetDate}`);

    const processedBookings: Array<{
      booking_id: number;
      confirmation_code: string;
      status: 'sent' | 'failed';
      error?: string;
    }> = [];

    try {
      const results = await this.invoiceRulesService.getBookingsForTravelDateInvoicing(targetDate);

      for (const { bookings, rule } of results) {
        console.log(`[InvoiceService] Processing ${bookings.length} bookings for rule: ${rule.name}`);

        for (const booking of bookings) {
          try {
            // Use createIndividualPratica which already has the full 7-step flow
            const result = await this.createIndividualPraticaForTravelDate(booking);

            if (result.success) {
              processedBookings.push({
                booking_id: booking.booking_id,
                confirmation_code: booking.confirmation_code,
                status: 'sent',
              });
              console.log(`  [OK] Sent ${booking.confirmation_code} to Partner Solution`);
            } else {
              processedBookings.push({
                booking_id: booking.booking_id,
                confirmation_code: booking.confirmation_code,
                status: 'failed',
                error: result.error,
              });
              console.error(`  [ERROR] Failed to send ${booking.confirmation_code}: ${result.error}`);
            }
          } catch (error: any) {
            processedBookings.push({
              booking_id: booking.booking_id,
              confirmation_code: booking.confirmation_code,
              status: 'failed',
              error: error.message,
            });
            console.error(`  [ERROR] Failed to send ${booking.confirmation_code}:`, error.message);
          }
        }
      }

      const sent = processedBookings.filter(b => b.status === 'sent').length;
      const failed = processedBookings.filter(b => b.status === 'failed').length;

      console.log(`[InvoiceService] Travel date invoicing complete: ${sent} sent, ${failed} failed`);

      return {
        success: true,
        summary: { total: processedBookings.length, sent, failed },
        bookings: processedBookings,
      };
    } catch (error: any) {
      console.error('[InvoiceService] Error processing travel_date invoicing:', error);
      return {
        success: false,
        summary: { total: 0, sent: 0, failed: 0 },
        bookings: [],
      };
    }
  }

  /**
   * Create individual pratica for a travel_date booking
   */
  private async createIndividualPraticaForTravelDate(booking: any): Promise<{
    success: boolean;
    praticaIri?: string;
    error?: string;
  }> {
    try {
      const bookingId = booking.booking_id;

      // Check if already invoiced
      const { data: existingInvoice } = await supabase
        .from('invoices')
        .select('id')
        .eq('booking_id', bookingId)
        .eq('invoice_type', 'INVOICE')
        .single();

      if (existingInvoice) {
        console.log(`[InvoiceService] Booking ${bookingId} already invoiced`);
        return { success: true };
      }

      // Skip zero-amount bookings
      if (!booking.total_price || booking.total_price <= 0) {
        console.log(`[InvoiceService] Skipping booking ${bookingId} - zero amount`);
        return { success: true };
      }

      // Get PS client
      const client = await (this.partnerSolution as any).getClient();
      const agencyCode = process.env.PARTNER_SOLUTION_AGENCY_CODE || '7206';
      const now = new Date().toISOString();
      const bookingIdPadded = String(bookingId).padStart(9, '0');

      // Get year-month for commessa
      const yearMonthInfo = await this.invoiceRulesService.resolveYearMonthForBooking(booking);
      const nrCommessa = yearMonthInfo.yearMonth.replace('-', '');
      const deliveringValue = `commessa: ${nrCommessa}`;

      const customerName = {
        firstName: booking.customer?.first_name || 'N/A',
        lastName: booking.customer?.last_name || 'N/A',
      };
      const customerPhone = booking.customer?.phone_number || null;
      const customerCountry = this.getCountryFromPhone(customerPhone);

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
      const accountId = accountIri.split('/').pop();

      // Step 2: Create Pratica (WP)
      const praticaPayload = {
        codicecliente: accountId,
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
      const passeggeroResponse = await client.post('/prt_praticapasseggeros', {
        pratica: praticaIri,
        cognomepax: customerName.lastName,
        nomepax: customerName.firstName,
        annullata: 0,
        iscontraente: 1
      });

      // Step 4: Add Servizio
      const totalAmount = booking.total_price || 0;
      const todayDate = now.split('T')[0];  // datacreazione, datainizioservizio, datafineservizio always now

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
        datainizioservizio: todayDate,
        datafineservizio: todayDate,
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

      // Step 5: Add Quota
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
        booking_id: bookingId,
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
        ps_account_iri: accountIri,
        ps_passeggero_iri: passeggeroResponse.data['@id'],
        ps_movimento_iri: movimentoResponse.data['@id'],
        ps_commessa_code: yearMonthInfo.yearMonth,
        created_by: 'travel_date_cron',
      }, { onConflict: 'booking_id,invoice_type' });

      return { success: true, praticaIri };
    } catch (error: any) {
      const errorMsg = error.response?.data?.['hydra:description'] || error.message;
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Get country name from phone number for Partner Solution
   */
  private getCountryFromPhone(phone: string | null): string {
    if (!phone) return 'Spagna';

    const phoneClean = phone.replace(/\D/g, '');
    const prefixMap: Record<string, string> = {
      '34': 'Spagna',
      '39': 'Spagna',  // Italy maps to Spain (avoid Italian invoicing rules)
      '33': 'Francia',
      '44': 'Regno Unito',
      '49': 'Germania',
      '1': 'Stati Uniti',
      '351': 'Portogallo',
      '31': 'Paesi Bassi',
      '32': 'Belgio',
      '41': 'Svizzera',
      '43': 'Austria',
    };

    for (const [prefix, country] of Object.entries(prefixMap)) {
      if (phoneClean.startsWith(prefix)) {
        return country;
      }
    }
    return 'Spagna';
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
      const commessaInfo = await this.partnerSolution.getOrCreateCommessaByCode(yearMonth);
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
        delivering: `commessa:${commessaInfo.id}`,
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
      const praticaMonth = await this.resolvePraticaYearMonth(bookingData);
      const yearMonth = praticaMonth.yearMonth;
      if (praticaMonth.ruleType === 'travel') {
        console.log(`[InvoiceService] Using travel date for ${praticaMonth.sellerName || 'unknown seller'}: ${praticaMonth.sourceDate} -> ${yearMonth}`);
      } else if (praticaMonth.ruleType === 'creation') {
        console.log(`[InvoiceService] Using creation date for ${praticaMonth.sellerName || 'unknown seller'}: ${praticaMonth.sourceDate} -> ${yearMonth}`);
      } else {
        console.log(`[InvoiceService] No seller rule, using creation date: ${yearMonth}`);
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

  async getPraticaYearMonthForBooking(bookingId: number): Promise<{
    yearMonth: string;
    ruleType: 'creation' | 'travel' | 'none';
    sellerName?: string;
    sourceDate: string;
  }> {
    const bookingData = await this.fetchBookingData(bookingId);
    if (!bookingData) {
      throw new Error(`Booking ${bookingId} not found`);
    }
    return this.resolvePraticaYearMonth(bookingData);
  }

  private async resolvePraticaYearMonth(bookingData: BookingDataForInvoice): Promise<{
    yearMonth: string;
    ruleType: 'creation' | 'travel' | 'none';
    sellerName?: string;
    sourceDate: string;
  }> {
    const fallbackDate = bookingData.creation_date || new Date().toISOString();
    const sellerName =
      bookingData.seller_name ||
      bookingData.activities.find((activity) => activity.activity_seller)?.activity_seller;

    if (!sellerName) {
      return {
        yearMonth: this.formatYearMonth(fallbackDate),
        ruleType: 'none',
        sourceDate: fallbackDate,
      };
    }

    const rule = await this.getInvoiceRuleForSeller(sellerName);
    if (!rule) {
      return {
        yearMonth: this.formatYearMonth(fallbackDate),
        ruleType: 'none',
        sellerName,
        sourceDate: fallbackDate,
      };
    }

    // Handle both old format ('travel'/'creation') and new format ('travel_date'/'creation_date')
    const ruleType = rule.invoice_date_type;
    const isTravel = ruleType === 'travel' || ruleType === 'travel_date';

    if (isTravel) {
      // Use latest travel date (newest activity date)
      const travelDate = this.getLatestTravelDate(bookingData) || fallbackDate;
      return {
        yearMonth: this.formatYearMonth(travelDate),
        ruleType: 'travel',
        sellerName,
        sourceDate: travelDate,
      };
    }

    return {
      yearMonth: this.formatYearMonth(fallbackDate),
      ruleType: 'creation',
      sellerName,
      sourceDate: fallbackDate,
    };
  }

  private async getInvoiceRuleForSeller(sellerName: string): Promise<InvoiceRule | null> {
    const { data: rules, error } = await supabase
      .from('invoice_rules')
      .select('name, sellers, invoice_date_type, invoice_start_date, is_active')
      .eq('is_active', true);

    if (error || !rules) {
      console.error('[InvoiceService] Error fetching invoice rules:', error);
      return null;
    }

    for (const rule of rules as InvoiceRule[]) {
      if (rule.sellers?.includes(sellerName)) {
        return rule;
      }
    }

    return null;
  }

  /**
   * Get the latest (newest) travel date from all activities
   * If booking has multiple activities, use the latest one
   */
  private getLatestTravelDate(bookingData: BookingDataForInvoice): string | null {
    if (!bookingData.activities || bookingData.activities.length === 0) return null;

    let latestDate: string | null = null;

    for (const activity of bookingData.activities) {
      if (!activity.start_date_time) continue;
      const dateStr = activity.start_date_time;

      if (!latestDate || dateStr > latestDate) {
        latestDate = dateStr;
      }
    }

    return latestDate;
  }

  private formatYearMonth(dateValue: string): string {
    const datePart = dateValue?.split('T')[0];
    if (datePart) {
      const [year, month] = datePart.split('-');
      if (year && month) {
        return `${year}-${month}`;
      }
    }

    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) {
      const now = new Date();
      return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    }

    return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}`;
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
        const commessaInfo = await this.partnerSolution.getOrCreateCommessaByCode(
          monthlyPratica.year_month
        );
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
          delivering: `commessa:${commessaInfo.id}`,
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

    // Step 1: Create/Get Account (Cliente) with customer_id
    console.log(`[InvoiceService] Step 1: Creating Account for booking ${bookingData.booking_id}...`);
    let accountIri: string | null = null;
    if (bookingData.customer?.customer_id) {
      try {
        const account = await this.partnerSolution.getOrCreateAccount({
          customer_id: bookingData.customer.customer_id,
          first_name: bookingData.customer?.first_name || 'N/A',
          last_name: bookingData.customer?.last_name || 'N/A',
          email: bookingData.customer?.email,
          phone_number: bookingData.customer?.phone_number,
        });
        accountIri = account['@id'];
        console.log(`[InvoiceService] Account created/found: ${accountIri}`);
      } catch (error) {
        console.error(`[InvoiceService] Failed to create account:`, error);
      }
    } else {
      console.log(`[InvoiceService] No customer_id, skipping account creation`);
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
      console.error(`[InvoiceService] Failed to create passeggero:`, error);
    }

    // Pad booking_id to 9 characters with leading zeros (per spec)
    const bookingIdPadded = String(bookingData.booking_id).padStart(9, '0');

    // Step 3-5: Create Servizi, Quote, Movimenti for each activity
    const todayDate = now.split('T')[0];  // datacreazione, datainizioservizio, datafineservizio always now

    for (const activity of bookingData.activities) {
      try {
        const productTitle = activity.product_title || 'Tour UE ed Extra UE';

        // Create Servizio in Partner Solution
        console.log(`[InvoiceService] Step 3: Creating Servizio for activity ${activity.activity_booking_id}...`);
        const servizio = await this.partnerSolution.createServizio({
          pratica: monthlyPratica.partner_pratica_id!,
          tiposervizio: 'PKG',                    // Always PKQ per spec
          tipovendita: 'ORG',
          regimevendita: '74T',
          datainizioservizio: todayDate,  // Always now
          datafineservizio: todayDate,    // Always now
          datacreazione: now,
          nrpaxadulti: activity.participant_count || 1,  // Total participants
          nrpaxchild: 0,                          // Always 0 per spec
          nrpaxinfant: 0,                         // Always 0 per spec
          codicefornitore: 'IT09802381005',
          codicefilefornitore: bookingIdPadded,   // Must be 9 chars, left-padded with 0
          ragsocfornitore: 'EnRoma Tours',
          tipodestinazione: 'CEENAZ',
          duratagg: 1,
          duratant: 0,
          annullata: 0,
          descrizione: productTitle,
          codiceagenzia: agencyCode,
          stato: 'INS',
        } as any);

        // Create Quota for the servizio
        await this.partnerSolution.createQuota({
          servizio: servizio['@id'],
          descrizionequota: productTitle,
          datavendita: now,  // Use pratica creation date
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
          externalid: bookingIdPadded,            // Must be 9 chars, left-padded with 0
          tipomovimento: 'I',
          codicefile: bookingIdPadded,            // Must be 9 chars, left-padded with 0
          codiceagenzia: agencyCode,
          tipocattura: 'PS',
          importo: activity.total_price,
          datacreazione: now,
          datamodifica: now,
          datamovimento: now,  // Always now
          stato: 'INS',
          codcausale: 'PAGBOK',
          descrizione: `Tour UE ed Extra UE - ${bookingData.confirmation_code}`,
        });

        // Create line item in DB (store actual activity date for records)
        const activityDateForDb = activity.start_date_time?.split('T')[0] || todayDate;
        await supabase.from('invoice_line_items').insert({
          invoice_id: invoiceId,
          activity_booking_id: activity.activity_booking_id,
          partner_servizio_id: servizio['@id'],
          product_title: activity.product_title,
          quantity: activity.participant_count || 1,
          unit_price: activity.total_price,
          total_price: activity.total_price,
          activity_date: activityDateForDb,
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
    triggeredBy: string = 'webhook',
    refundAmount?: number
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
          refund_amount: refundAmount ? -Math.abs(refundAmount) : null,
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
