-- ============================================================================
-- Update Seller Commission Rules Schema
-- ============================================================================
-- This migration:
-- 1. Adds date_basis column for matching against travel_date OR creation_date
-- 2. Creates junction table for multi-activity support
-- 3. Migrates existing activity_id values to junction table
-- 4. Drops activity_id column from main table
-- ============================================================================

-- ============================================================================
-- Step 1: Add date_basis column
-- ============================================================================
-- Determines which date to use for rule matching:
-- - travel_date: Match against activity's start_date_time (current behavior)
-- - creation_date: Match against booking's created_at

ALTER TABLE seller_commission_rules
ADD COLUMN IF NOT EXISTS date_basis VARCHAR(20) NOT NULL DEFAULT 'travel_date'
    CHECK (date_basis IN ('travel_date', 'creation_date'));

COMMENT ON COLUMN seller_commission_rules.date_basis IS 'Which date to use for rule matching: travel_date (activity start) or creation_date (booking created_at)';

-- ============================================================================
-- Step 2: Create junction table for multi-activity support
-- ============================================================================
-- Replaces single activity_id with many-to-many relationship
-- Empty junction = rule applies to ALL activities for that seller

CREATE TABLE IF NOT EXISTS seller_commission_rule_activities (
    id SERIAL PRIMARY KEY,
    rule_id UUID NOT NULL REFERENCES seller_commission_rules(id) ON DELETE CASCADE,
    activity_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(rule_id, activity_id)
);

COMMENT ON TABLE seller_commission_rule_activities IS 'Junction table linking commission rules to specific activities. Empty = rule applies to all activities.';
COMMENT ON COLUMN seller_commission_rule_activities.rule_id IS 'FK to seller_commission_rules';
COMMENT ON COLUMN seller_commission_rule_activities.activity_id IS 'Activity ID this rule applies to';

-- ============================================================================
-- Step 3: Migrate existing activity_id values to junction table
-- ============================================================================
-- Move any existing single-activity rules to the junction table

INSERT INTO seller_commission_rule_activities (rule_id, activity_id)
SELECT id, activity_id FROM seller_commission_rules
WHERE activity_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Step 4: Drop activity_id column from main table
-- ============================================================================
-- Now that data is migrated, remove the old column

-- First drop indexes that reference activity_id
DROP INDEX IF EXISTS idx_seller_commission_rules_activity_id;
DROP INDEX IF EXISTS idx_seller_commission_rules_lookup;
DROP INDEX IF EXISTS idx_seller_commission_rules_year;
DROP INDEX IF EXISTS idx_seller_commission_rules_date_range;

-- Drop the column
ALTER TABLE seller_commission_rules DROP COLUMN IF EXISTS activity_id;

-- ============================================================================
-- Step 5: Create indexes on junction table
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_scra_rule_id
ON seller_commission_rule_activities(rule_id);

CREATE INDEX IF NOT EXISTS idx_scra_activity_id
ON seller_commission_rule_activities(activity_id);

-- Composite index for lookups
CREATE INDEX IF NOT EXISTS idx_scra_activity_rule
ON seller_commission_rule_activities(activity_id, rule_id);

-- ============================================================================
-- Step 6: Recreate necessary indexes on main table (without activity_id)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_seller_commission_rules_lookup_v2
ON seller_commission_rules(seller_id, is_active, priority DESC)
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_seller_commission_rules_year_v2
ON seller_commission_rules(seller_id, applicable_year)
WHERE rule_type = 'year';

CREATE INDEX IF NOT EXISTS idx_seller_commission_rules_date_range_v2
ON seller_commission_rules(seller_id, date_range_start, date_range_end)
WHERE rule_type = 'date_range';

-- Index for date_basis filtering
CREATE INDEX IF NOT EXISTS idx_seller_commission_rules_date_basis
ON seller_commission_rules(seller_id, date_basis)
WHERE is_active = true;

-- ============================================================================
-- Step 7: Grant permissions
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON seller_commission_rule_activities TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE seller_commission_rule_activities_id_seq TO authenticated;

GRANT SELECT ON seller_commission_rule_activities TO anon;

-- ============================================================================
-- Step 8: Verification
-- ============================================================================

-- Check date_basis column was added
SELECT 'date_basis column added' as status,
       column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'seller_commission_rules'
AND column_name = 'date_basis';

-- Check junction table was created
SELECT 'seller_commission_rule_activities table created' as status,
       COUNT(*) as row_count
FROM seller_commission_rule_activities;

-- Check activity_id column was dropped
SELECT 'activity_id column dropped' as status,
       CASE WHEN COUNT(*) = 0 THEN 'SUCCESS' ELSE 'FAILED' END as result
FROM information_schema.columns
WHERE table_name = 'seller_commission_rules'
AND column_name = 'activity_id';

-- ============================================================================
-- USAGE EXAMPLES
-- ============================================================================

-- Example 1: Create rule for multiple specific activities
/*
-- First create the rule
INSERT INTO seller_commission_rules (
    seller_id, commission_percentage, rule_type, date_basis, priority, notes
)
SELECT seller_id, 15.00, 'always', 'travel_date', 10, 'Commission for select Rome tours'
FROM sellers WHERE title = 'Civitatis'
RETURNING id;

-- Then link to multiple activities
INSERT INTO seller_commission_rule_activities (rule_id, activity_id)
VALUES
  ('rule-uuid-here', 222980),
  ('rule-uuid-here', 223456),
  ('rule-uuid-here', 224789);
*/

-- Example 2: Create rule that applies to ALL activities (no junction entries)
/*
INSERT INTO seller_commission_rules (
    seller_id, commission_percentage, rule_type, date_basis, priority, notes
)
SELECT seller_id, 12.00, 'always', 'travel_date', 0, 'Default commission for all activities'
FROM sellers WHERE title = 'GetYourGuide';
-- No entries needed in seller_commission_rule_activities - rule applies to all
*/

-- Example 3: Create rule based on booking creation date (not travel date)
/*
INSERT INTO seller_commission_rules (
    seller_id, commission_percentage, rule_type, date_basis, applicable_year, priority, notes
)
SELECT seller_id, 18.00, 'year', 'creation_date', 2026, 20, 'Higher commission for bookings created in 2026'
FROM sellers WHERE title = 'Viator';
*/

-- Example 4: Query rules that apply to a specific activity
/*
SELECT scr.*,
       COALESCE(
           (SELECT array_agg(activity_id) FROM seller_commission_rule_activities WHERE rule_id = scr.id),
           ARRAY[]::bigint[]
       ) as activity_ids
FROM seller_commission_rules scr
WHERE scr.seller_id = 123
  AND scr.is_active = true
  AND (
    -- Rule has no activities (applies to all)
    NOT EXISTS (SELECT 1 FROM seller_commission_rule_activities WHERE rule_id = scr.id)
    -- OR rule includes this specific activity
    OR scr.id IN (SELECT rule_id FROM seller_commission_rule_activities WHERE activity_id = 222980)
  )
ORDER BY scr.priority DESC;
*/
