/**
 * Invoice Rules Service
 * Handles automatic invoicing based on configured rules
 *
 * Three rule types:
 * 1. travel_date: Cron job sends to Partner Solution on travel date
 *    - Uses latest activity date if multiple activities
 *    - invoice_start_date filters by travel_date
 *
 * 2. creation_date: Instant send when booking is confirmed
 *    - invoice_start_date filters by creation_date
 *
 * 3. stripe_payment: Triggered by Stripe payment_intent.succeeded webhook
 *    - Applies to ALL sellers (empty sellers array)
 *    - Uses booking creation_date for year-month resolution
 */

import { supabase } from '../config/supabase';

export interface InvoiceRule {
  id: string;
  name: string;
  invoice_date_type: 'travel_date' | 'creation_date' | 'stripe_payment';
  sellers: string[];
  invoice_start_date: string; // YYYY-MM-DD
  execution_time: string; // HH:MM:SS (only for travel_date)
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BookingForInvoicing {
  booking_id: number;
  confirmation_code: string;
  creation_date: string;
  status: string;
  total_price: number;
  currency: string;
  customer: {
    first_name: string;
    last_name: string;
    phone_number?: string | null;
  } | null;
  activities: Array<{
    activity_booking_id: number;
    product_title: string;
    start_date_time: string;
    total_price: number;
    pax_adults: number;
    pax_children: number;
    pax_infants: number;
    activity_seller: string;
  }>;
  seller_name: string | null;
}

export class InvoiceRulesService {
  // ============================================
  // RULE CRUD OPERATIONS
  // ============================================

  /**
   * Get all invoice rules
   */
  async getAllRules(): Promise<InvoiceRule[]> {
    const { data, error } = await supabase
      .from('invoice_rules')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[InvoiceRules] Error fetching rules:', error);
      throw new Error(`Failed to fetch invoice rules: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get active rules only
   */
  async getActiveRules(): Promise<InvoiceRule[]> {
    const { data, error } = await supabase
      .from('invoice_rules')
      .select('*')
      .eq('is_active', true);

    if (error) {
      console.error('[InvoiceRules] Error fetching active rules:', error);
      throw new Error(`Failed to fetch active rules: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get rule by ID
   */
  async getRuleById(ruleId: string): Promise<InvoiceRule | null> {
    const { data, error } = await supabase
      .from('invoice_rules')
      .select('*')
      .eq('id', ruleId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Failed to fetch rule: ${error.message}`);
    }

    return data;
  }

  /**
   * Create a new rule
   */
  async createRule(rule: {
    name: string;
    invoice_date_type: 'travel_date' | 'creation_date' | 'stripe_payment';
    sellers: string[];
    invoice_start_date: string;
    execution_time?: string;
  }): Promise<InvoiceRule> {
    const { data, error } = await supabase
      .from('invoice_rules')
      .insert({
        name: rule.name,
        invoice_date_type: rule.invoice_date_type,
        sellers: rule.sellers,
        invoice_start_date: rule.invoice_start_date,
        execution_time: rule.execution_time || '08:00:00',
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create rule: ${error.message}`);
    }

    console.log(`[InvoiceRules] Created rule: ${rule.name} (${rule.invoice_date_type})`);
    return data;
  }

  /**
   * Update an existing rule
   */
  async updateRule(
    ruleId: string,
    updates: Partial<{
      name: string;
      sellers: string[];
      invoice_start_date: string;
      execution_time: string;
      is_active: boolean;
    }>
  ): Promise<InvoiceRule> {
    const { data, error } = await supabase
      .from('invoice_rules')
      .update(updates)
      .eq('id', ruleId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update rule: ${error.message}`);
    }

    console.log(`[InvoiceRules] Updated rule: ${ruleId}`);
    return data;
  }

  /**
   * Delete a rule
   */
  async deleteRule(ruleId: string): Promise<void> {
    const { error } = await supabase
      .from('invoice_rules')
      .delete()
      .eq('id', ruleId);

    if (error) {
      throw new Error(`Failed to delete rule: ${error.message}`);
    }

    console.log(`[InvoiceRules] Deleted rule: ${ruleId}`);
  }

  // ============================================
  // RULE MATCHING
  // ============================================

  /**
   * Find the rule that applies to a seller
   * Returns null if no rule matches
   */
  async findRuleForSeller(sellerName: string): Promise<InvoiceRule | null> {
    if (!sellerName) return null;

    const rules = await this.getActiveRules();

    for (const rule of rules) {
      // stripe_payment rules with empty sellers match ANY seller
      if (rule.invoice_date_type === 'stripe_payment' && (!rule.sellers || rule.sellers.length === 0)) {
        return rule;
      }
      if (rule.sellers?.includes(sellerName)) {
        return rule;
      }
    }

    return null;
  }

  /**
   * Check if a booking should be auto-invoiced based on creation_date rules
   * Called when a booking is confirmed
   */
  async shouldAutoInvoiceOnCreation(booking: BookingForInvoicing): Promise<{
    shouldInvoice: boolean;
    rule: InvoiceRule | null;
    reason: string;
  }> {
    const sellerName = booking.seller_name ||
      booking.activities.find(a => a.activity_seller)?.activity_seller;

    if (!sellerName) {
      return { shouldInvoice: false, rule: null, reason: 'No seller found on booking' };
    }

    const rule = await this.findRuleForSeller(sellerName);

    if (!rule) {
      return { shouldInvoice: false, rule: null, reason: `No rule found for seller: ${sellerName}` };
    }

    if (rule.invoice_date_type !== 'creation_date') {
      return { shouldInvoice: false, rule, reason: `Rule is travel_date type, not creation_date` };
    }

    // Check invoice_start_date against booking creation_date
    const creationDate = booking.creation_date.split('T')[0];
    if (creationDate < rule.invoice_start_date) {
      return {
        shouldInvoice: false,
        rule,
        reason: `Booking creation date ${creationDate} is before rule start date ${rule.invoice_start_date}`
      };
    }

    return { shouldInvoice: true, rule, reason: 'Matches creation_date rule' };
  }

  // ============================================
  // TRAVEL DATE RULE PROCESSING (CRON)
  // ============================================

  /**
   * Get bookings that should be invoiced today based on travel_date rules
   * This is called by the cron job
   */
  async getBookingsForTravelDateInvoicing(
    targetDate?: string
  ): Promise<{
    bookings: BookingForInvoicing[];
    rule: InvoiceRule;
  }[]> {
    const today = targetDate || new Date().toISOString().split('T')[0];
    console.log(`[InvoiceRules] Finding bookings for travel date invoicing on ${today}`);

    // Get all active travel_date rules
    const { data: rules, error: rulesError } = await supabase
      .from('invoice_rules')
      .select('*')
      .eq('invoice_date_type', 'travel_date')
      .eq('is_active', true);

    if (rulesError || !rules || rules.length === 0) {
      console.log('[InvoiceRules] No active travel_date rules found');
      return [];
    }

    const results: { bookings: BookingForInvoicing[]; rule: InvoiceRule }[] = [];

    for (const rule of rules as InvoiceRule[]) {
      console.log(`[InvoiceRules] Processing rule: ${rule.name}`);
      console.log(`  Sellers: ${rule.sellers.join(', ')}`);
      console.log(`  Start date: ${rule.invoice_start_date}`);

      // Get bookings for this rule's sellers that:
      // 1. Have travel date = today
      // 2. Have travel date >= invoice_start_date
      // 3. Are CONFIRMED
      // 4. Haven't been invoiced yet

      const bookings = await this.getBookingsWithTravelDateToday(
        rule.sellers,
        today,
        rule.invoice_start_date
      );

      if (bookings.length > 0) {
        console.log(`  Found ${bookings.length} bookings to invoice`);
        results.push({ bookings, rule });
      } else {
        console.log('  No bookings found');
      }
    }

    return results;
  }

  /**
   * Get bookings where the latest activity travel date is today
   */
  private async getBookingsWithTravelDateToday(
    sellers: string[],
    targetDate: string,
    invoiceStartDate: string
  ): Promise<BookingForInvoicing[]> {
    // First, get activity bookings with travel date = today for the specified sellers
    const { data: activityBookings, error: actError } = await supabase
      .from('activity_bookings')
      .select(`
        booking_id,
        activity_booking_id,
        product_title,
        start_date_time,
        total_price,
        activity_seller
      `)
      .in('activity_seller', sellers)
      .gte('start_date_time', `${targetDate}T00:00:00`)
      .lt('start_date_time', `${targetDate}T23:59:59`)
      .gte('start_date_time', `${invoiceStartDate}T00:00:00`);

    if (actError || !activityBookings || activityBookings.length === 0) {
      return [];
    }

    // Get unique booking IDs
    const bookingIds = [...new Set(activityBookings.map(ab => ab.booking_id))];

    // Get the full booking data for each
    const { data: bookings, error: bookError } = await supabase
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
          activity_seller
        )
      `)
      .in('booking_id', bookingIds)
      .eq('status', 'CONFIRMED');

    if (bookError || !bookings) {
      console.error('[InvoiceRules] Error fetching bookings:', bookError);
      return [];
    }

    // Filter out already invoiced bookings
    const { data: existingInvoices } = await supabase
      .from('invoices')
      .select('booking_id')
      .in('booking_id', bookingIds)
      .eq('invoice_type', 'INVOICE');

    const invoicedBookingIds = new Set(existingInvoices?.map(i => i.booking_id) || []);

    // Transform and filter
    const result: BookingForInvoicing[] = [];

    for (const booking of bookings) {
      if (invoicedBookingIds.has(booking.booking_id)) {
        continue; // Already invoiced
      }

      // Get the latest travel date from all activities
      const activities = booking.activity_bookings || [];
      const latestTravelDate = this.getLatestTravelDate(activities);

      // Only include if the latest travel date is today
      if (latestTravelDate !== targetDate) {
        continue; // Not ready yet - has activities with later dates
      }

      const customer = booking.booking_customers?.[0]?.customers;
      const sellerName = activities.find((a: any) => a.activity_seller)?.activity_seller || null;

      result.push({
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
          pax_adults: 1,  // Default to 1 (pax columns don't exist in activity_bookings)
          pax_children: 0,
          pax_infants: 0,
          activity_seller: a.activity_seller,
        })),
        seller_name: sellerName,
      });
    }

    return result;
  }

  /**
   * Get the latest (newest) travel date from activities
   * Returns YYYY-MM-DD format
   */
  private getLatestTravelDate(activities: Array<{ start_date_time: string }>): string | null {
    if (!activities || activities.length === 0) return null;

    let latestDate: string | null = null;

    for (const activity of activities) {
      if (!activity.start_date_time) continue;
      const date = activity.start_date_time.split('T')[0];

      if (!latestDate || date > latestDate) {
        latestDate = date;
      }
    }

    return latestDate;
  }

  // ============================================
  // YEAR-MONTH RESOLUTION FOR PRATICA/COMMESSA
  // ============================================

  /**
   * Resolve the year-month for a booking's pratica based on rules
   * Used for determining which monthly commessa to use
   */
  async resolveYearMonthForBooking(booking: BookingForInvoicing): Promise<{
    yearMonth: string;
    ruleType: 'travel_date' | 'creation_date' | 'stripe_payment' | 'none';
    sourceDate: string;
    ruleName?: string;
  }> {
    const sellerName = booking.seller_name ||
      booking.activities.find(a => a.activity_seller)?.activity_seller;

    const fallbackDate = booking.creation_date || new Date().toISOString();

    if (!sellerName) {
      return {
        yearMonth: this.formatYearMonth(fallbackDate),
        ruleType: 'none',
        sourceDate: fallbackDate,
      };
    }

    const rule = await this.findRuleForSeller(sellerName);

    if (!rule) {
      return {
        yearMonth: this.formatYearMonth(fallbackDate),
        ruleType: 'none',
        sourceDate: fallbackDate,
      };
    }

    if (rule.invoice_date_type === 'travel_date') {
      // Use latest travel date
      const travelDate = this.getLatestTravelDate(booking.activities) || fallbackDate.split('T')[0];
      return {
        yearMonth: this.formatYearMonth(travelDate),
        ruleType: 'travel_date',
        sourceDate: travelDate,
        ruleName: rule.name,
      };
    }

    // creation_date or stripe_payment rule - use booking creation date
    return {
      yearMonth: this.formatYearMonth(fallbackDate),
      ruleType: rule.invoice_date_type === 'stripe_payment' ? 'stripe_payment' : 'creation_date',
      sourceDate: fallbackDate,
      ruleName: rule.name,
    };
  }

  private formatYearMonth(dateValue: string): string {
    const datePart = dateValue.split('T')[0];
    const [year, month] = datePart.split('-');
    return `${year}-${month}`;
  }
}

// Export singleton
export const invoiceRulesService = new InvoiceRulesService();
