/**
 * Seller Commission Service
 *
 * Handles calculation of Tourmageddon seller commissions based on
 * configured rules per seller-activity combination.
 *
 * Commission rules can be:
 * - always: Fixed rate that always applies
 * - year: Rate for a specific year
 * - date_range: Rate for a date range
 *
 * Date basis for rule matching:
 * - travel_date: Match against activity's start_date_time
 * - creation_date: Match against booking's created_at
 *
 * Activity selection:
 * - Rules can apply to ALL activities (no entries in junction table)
 * - Or specific activities (entries in seller_commission_rule_activities)
 *
 * Priority order (highest to lowest):
 * 1. Higher priority number
 * 2. Activity-specific rules over seller-wide defaults
 * 3. date_range > year > always
 */

import { supabase } from '../config/supabase';
import {
  SellerCommissionRule,
  SellerCommissionRuleWithActivitiesRow,
  CalculatedSellerCommission,
  CommissionRuleType,
  DateBasis
} from '../types/sellerCommission.types';

export class SellerCommissionService {

  /**
   * Calculate seller commission for an activity booking
   *
   * @param sellerName - The activity_seller string (matches sellers.title)
   * @param activityId - The activity_id
   * @param totalPrice - The booking total_price (base for commission calculation)
   * @param travelDate - The start_date_time of the activity (for travel_date rules)
   * @param creationDate - The booking created_at (for creation_date rules)
   * @returns Calculated commission values or nulls if no rule applies
   */
  async calculateCommission(
    sellerName: string,
    activityId: number,
    totalPrice: number,
    travelDate: Date,
    creationDate: Date
  ): Promise<CalculatedSellerCommission> {
    // Default result - no commission
    const noCommission: CalculatedSellerCommission = {
      commission_percentage: null,
      commission_amount: null,
      net_price: null,
      rule_id: null,
      rule_type: null
    };

    // Validate inputs
    if (!sellerName || !activityId) {
      return noCommission;
    }

    try {
      // Step 1: Get seller_id from seller name
      const sellerId = await this.getSellerIdByName(sellerName);
      if (!sellerId) {
        console.log(`[SellerCommission] Seller not found in DB: ${sellerName}`);
        return noCommission;
      }

      // Step 2: Find matching commission rule
      const rule = await this.findMatchingRule(sellerId, activityId, travelDate, creationDate);
      if (!rule) {
        console.log(`[SellerCommission] No commission rule found for seller ${sellerName}, activity ${activityId}`);
        return noCommission;
      }

      // Step 3: Calculate commission
      const commissionPercentage = rule.commission_percentage;
      const commissionAmount = this.roundToTwoDecimals(totalPrice * (commissionPercentage / 100));
      const netPrice = this.roundToTwoDecimals(totalPrice - commissionAmount);

      console.log(`[SellerCommission] Applied rule: ${rule.rule_type} (${commissionPercentage}%)`);
      console.log(`   Rule ID: ${rule.id}`);
      console.log(`   Total: €${totalPrice} → Commission: €${commissionAmount}, Net: €${netPrice}`);

      return {
        commission_percentage: commissionPercentage,
        commission_amount: commissionAmount,
        net_price: netPrice,
        rule_id: rule.id,
        rule_type: rule.rule_type as CommissionRuleType
      };

    } catch (error) {
      console.error('[SellerCommission] Error calculating commission:', error);
      return noCommission;
    }
  }

  /**
   * Get seller_id from seller name (title)
   */
  private async getSellerIdByName(sellerName: string): Promise<number | null> {
    const { data, error } = await supabase
      .from('sellers')
      .select('seller_id')
      .eq('title', sellerName)
      .single();

    if (error || !data) {
      return null;
    }

    return data.seller_id;
  }

  /**
   * Find the best matching commission rule for a seller-activity-date combination
   *
   * Priority order:
   * 1. Higher priority number wins
   * 2. Activity-specific (has entries in junction table) over seller-wide (no junction entries)
   * 3. Rule type specificity: date_range > year > always
   */
  private async findMatchingRule(
    sellerId: number,
    activityId: number,
    travelDate: Date,
    creationDate: Date
  ): Promise<SellerCommissionRule | null> {
    // Query all active rules for this seller with their linked activities
    const { data: rules, error } = await supabase
      .from('seller_commission_rules')
      .select(`
        *,
        seller_commission_rule_activities(activity_id)
      `)
      .eq('seller_id', sellerId)
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (error || !rules || rules.length === 0) {
      return null;
    }

    // Filter rules that apply to this activity
    // Rule applies if: no activities in junction table OR activity is in junction table
    const activityApplicableRules = (rules as SellerCommissionRuleWithActivitiesRow[]).filter(rule => {
      const linkedActivityIds = rule.seller_commission_rule_activities.map(a => a.activity_id);
      // Rule applies to ALL activities if no specific activities linked
      if (linkedActivityIds.length === 0) {
        return true;
      }
      // Otherwise, check if this activity is in the linked list
      return linkedActivityIds.includes(activityId);
    });

    if (activityApplicableRules.length === 0) {
      return null;
    }

    // Filter rules based on time criteria using the appropriate date_basis
    const matchingRules = activityApplicableRules.filter(rule => {
      // Determine which date to use based on date_basis
      const matchDate = rule.date_basis === 'creation_date' ? creationDate : travelDate;
      const matchYear = matchDate.getFullYear();
      const matchDateStr = this.formatDateToYYYYMMDD(matchDate);

      switch (rule.rule_type) {
        case 'always':
          return true;

        case 'year':
          return rule.applicable_year === matchYear;

        case 'date_range':
          if (!rule.date_range_start || !rule.date_range_end) return false;
          return matchDateStr >= rule.date_range_start && matchDateStr <= rule.date_range_end;

        default:
          return false;
      }
    });

    if (matchingRules.length === 0) {
      return null;
    }

    // Sort by:
    // 1. priority DESC (already sorted from query)
    // 2. Activity-specific (has junction entries) over seller-wide (no junction entries)
    // 3. rule_type specificity: date_range > year > always
    const ruleTypeOrder: Record<string, number> = {
      'date_range': 3,
      'year': 2,
      'always': 1
    };

    matchingRules.sort((a, b) => {
      // First by priority (desc)
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }

      // Then by specificity (has linked activities first)
      const aHasActivities = a.seller_commission_rule_activities.length > 0 ? 1 : 0;
      const bHasActivities = b.seller_commission_rule_activities.length > 0 ? 1 : 0;
      if (aHasActivities !== bHasActivities) {
        return bHasActivities - aHasActivities;
      }

      // Then by rule_type specificity
      const aTypeOrder = ruleTypeOrder[a.rule_type] || 0;
      const bTypeOrder = ruleTypeOrder[b.rule_type] || 0;
      return bTypeOrder - aTypeOrder;
    });

    // Return the best match
    const bestMatch = matchingRules[0];
    return this.rowToRule(bestMatch);
  }

  /**
   * Convert database row with joined activities to SellerCommissionRule
   */
  private rowToRule(row: SellerCommissionRuleWithActivitiesRow): SellerCommissionRule {
    return {
      id: row.id,
      seller_id: row.seller_id,
      activity_ids: row.seller_commission_rule_activities.map(a => a.activity_id),
      commission_percentage: row.commission_percentage,
      rule_type: row.rule_type as CommissionRuleType,
      date_basis: row.date_basis as DateBasis,
      applicable_year: row.applicable_year,
      date_range_start: row.date_range_start,
      date_range_end: row.date_range_end,
      priority: row.priority,
      is_active: row.is_active,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  /**
   * Format date to YYYY-MM-DD string for comparison
   */
  private formatDateToYYYYMMDD(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Round number to 2 decimal places
   */
  private roundToTwoDecimals(num: number): number {
    return Math.round(num * 100) / 100;
  }

  /**
   * Check if a seller has any commission rules configured
   * Useful for determining if we should even attempt calculation
   */
  async hasCommissionRules(sellerName: string): Promise<boolean> {
    const sellerId = await this.getSellerIdByName(sellerName);
    if (!sellerId) return false;

    const { count, error } = await supabase
      .from('seller_commission_rules')
      .select('*', { count: 'exact', head: true })
      .eq('seller_id', sellerId)
      .eq('is_active', true);

    return !error && (count ?? 0) > 0;
  }
}

// Export singleton instance
export const sellerCommissionService = new SellerCommissionService();
