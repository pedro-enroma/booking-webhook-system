/**
 * Seller Commission Types
 *
 * Types for the seller commission system that allows configuring
 * which activities each seller can sell and custom commission rules
 * per seller-activity combination.
 */

/**
 * Represents a seller-activity relationship
 * Used to track which activities a seller is allowed to sell
 */
export interface SellerActivity {
  id: number;
  seller_id: number;
  activity_id: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Rule types for commission calculation
 * - always: Fixed rate that always applies
 * - year: Rate that applies for a specific year
 * - date_range: Rate that applies within a date range
 */
export type CommissionRuleType = 'always' | 'year' | 'date_range';

/**
 * Date basis for rule matching
 * - travel_date: Match against activity's start_date_time
 * - creation_date: Match against booking's created_at
 */
export type DateBasis = 'travel_date' | 'creation_date';

/**
 * Represents a commission rule for a seller-activity combination
 */
export interface SellerCommissionRule {
  id: string;
  seller_id: number;
  activity_ids: number[]; // Empty array means applies to all activities for this seller
  commission_percentage: number;
  rule_type: CommissionRuleType;
  date_basis: DateBasis; // Which date to use for rule matching
  applicable_year: number | null; // for 'year' rule type
  date_range_start: string | null; // for 'date_range' rule type (YYYY-MM-DD)
  date_range_end: string | null; // for 'date_range' rule type (YYYY-MM-DD)
  priority: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Result of commission calculation
 */
export interface CalculatedSellerCommission {
  commission_percentage: number | null;
  commission_amount: number | null;
  net_price: number | null;
  rule_id: string | null;
  rule_type: CommissionRuleType | null;
}

/**
 * Input for commission calculation
 */
export interface CommissionCalculationInput {
  sellerName: string;
  activityId: number;
  totalPrice: number;
  travelDate: Date;
  creationDate: Date;
}

/**
 * Database row type for seller_activities table
 */
export interface SellerActivityRow {
  id: number;
  seller_id: number;
  activity_id: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Database row type for seller_commission_rules table
 */
export interface SellerCommissionRuleRow {
  id: string;
  seller_id: number;
  commission_percentage: number;
  rule_type: string;
  date_basis: string;
  applicable_year: number | null;
  date_range_start: string | null;
  date_range_end: string | null;
  priority: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Database row type for seller_commission_rule_activities junction table
 */
export interface SellerCommissionRuleActivityRow {
  id: number;
  rule_id: string;
  activity_id: number;
  created_at: string;
}

/**
 * Database row type for seller_commission_rules with joined activities
 */
export interface SellerCommissionRuleWithActivitiesRow extends SellerCommissionRuleRow {
  seller_commission_rule_activities: { activity_id: number }[];
}
