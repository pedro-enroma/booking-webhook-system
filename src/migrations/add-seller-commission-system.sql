-- ============================================================================
-- Add Seller Commission System
-- ============================================================================
-- This creates:
-- 1. seller_activities table - which activities each seller can sell
-- 2. seller_commission_rules table - commission rules with time-based flexibility
-- 3. New columns in activity_bookings for Tourmageddon-calculated commissions
-- ============================================================================

-- ============================================================================
-- Step 1: Create seller_activities table
-- ============================================================================
-- Links sellers to activities they're allowed to sell
-- This is informational for frontend filtering, not enforced in backend

CREATE TABLE IF NOT EXISTS seller_activities (
    id SERIAL PRIMARY KEY,
    seller_id INTEGER NOT NULL REFERENCES sellers(seller_id) ON DELETE CASCADE,
    activity_id BIGINT NOT NULL,  -- matches activities.activity_id
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(seller_id, activity_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_seller_activities_seller_id
ON seller_activities(seller_id);

CREATE INDEX IF NOT EXISTS idx_seller_activities_activity_id
ON seller_activities(activity_id);

CREATE INDEX IF NOT EXISTS idx_seller_activities_active
ON seller_activities(seller_id, activity_id) WHERE is_active = true;

-- Comments
COMMENT ON TABLE seller_activities IS 'Links sellers to activities they can sell. Informational for frontend filtering.';
COMMENT ON COLUMN seller_activities.seller_id IS 'FK to sellers table';
COMMENT ON COLUMN seller_activities.activity_id IS 'Activity ID (matches activities.activity_id)';
COMMENT ON COLUMN seller_activities.is_active IS 'Whether this seller-activity relationship is active';

-- ============================================================================
-- Step 2: Create seller_commission_rules table
-- ============================================================================
-- Stores commission rules per seller-activity combination with time flexibility
-- Rule types: always (fixed), year (per year), date_range (seasonal)

CREATE TABLE IF NOT EXISTS seller_commission_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Seller reference (required)
    seller_id INTEGER NOT NULL REFERENCES sellers(seller_id) ON DELETE CASCADE,

    -- Activity reference (NULL = applies to all activities for this seller)
    activity_id BIGINT,

    -- Commission rate (0-100%)
    commission_percentage NUMERIC(5,2) NOT NULL
        CHECK (commission_percentage >= 0 AND commission_percentage <= 100),

    -- Rule type determines which time-based fields are used
    rule_type VARCHAR(20) NOT NULL DEFAULT 'always'
        CHECK (rule_type IN ('always', 'year', 'date_range')),

    -- For 'year' type: which year this applies to
    applicable_year INTEGER,

    -- For 'date_range' type: start and end dates (inclusive)
    date_range_start DATE,
    date_range_end DATE,

    -- Priority for rule matching (higher number = checked first)
    -- Use this to handle overlapping rules
    priority INTEGER DEFAULT 0,

    -- Status
    is_active BOOLEAN DEFAULT true,
    notes TEXT,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Validation constraints
    CONSTRAINT valid_year_rule CHECK (
        rule_type != 'year' OR applicable_year IS NOT NULL
    ),
    CONSTRAINT valid_date_range_rule CHECK (
        rule_type != 'date_range' OR
        (date_range_start IS NOT NULL AND date_range_end IS NOT NULL)
    ),
    CONSTRAINT valid_date_range_order CHECK (
        date_range_start IS NULL OR date_range_end IS NULL OR
        date_range_start <= date_range_end
    )
);

-- Indexes for fast rule lookups
CREATE INDEX IF NOT EXISTS idx_seller_commission_rules_seller_id
ON seller_commission_rules(seller_id);

CREATE INDEX IF NOT EXISTS idx_seller_commission_rules_activity_id
ON seller_commission_rules(activity_id);

CREATE INDEX IF NOT EXISTS idx_seller_commission_rules_active
ON seller_commission_rules(seller_id, is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_seller_commission_rules_lookup
ON seller_commission_rules(seller_id, activity_id, is_active, priority DESC);

CREATE INDEX IF NOT EXISTS idx_seller_commission_rules_year
ON seller_commission_rules(seller_id, activity_id, applicable_year) WHERE rule_type = 'year';

CREATE INDEX IF NOT EXISTS idx_seller_commission_rules_date_range
ON seller_commission_rules(seller_id, activity_id, date_range_start, date_range_end) WHERE rule_type = 'date_range';

-- Comments
COMMENT ON TABLE seller_commission_rules IS 'Commission rules per seller-activity with time-based flexibility (always, year, date_range)';
COMMENT ON COLUMN seller_commission_rules.seller_id IS 'FK to sellers table';
COMMENT ON COLUMN seller_commission_rules.activity_id IS 'Activity ID. NULL means rule applies to all activities for this seller';
COMMENT ON COLUMN seller_commission_rules.commission_percentage IS 'Commission percentage (0-100). Example: 15.5 means 15.5%';
COMMENT ON COLUMN seller_commission_rules.rule_type IS 'Type of rule: always (fixed), year (per year), date_range (seasonal)';
COMMENT ON COLUMN seller_commission_rules.applicable_year IS 'For year rules: which year this applies to (e.g., 2026)';
COMMENT ON COLUMN seller_commission_rules.date_range_start IS 'For date_range rules: start date (inclusive)';
COMMENT ON COLUMN seller_commission_rules.date_range_end IS 'For date_range rules: end date (inclusive)';
COMMENT ON COLUMN seller_commission_rules.priority IS 'Higher priority rules are evaluated first. Use to handle overlapping rules';

-- ============================================================================
-- Step 3: Add new columns to activity_bookings
-- ============================================================================
-- These store Tourmageddon-calculated commissions (separate from Bokun's commission fields)

ALTER TABLE activity_bookings
ADD COLUMN IF NOT EXISTS tourmageddon_seller_commission_percentage NUMERIC(5,2);

ALTER TABLE activity_bookings
ADD COLUMN IF NOT EXISTS tourmageddon_seller_commission_amount DECIMAL(10,2);

ALTER TABLE activity_bookings
ADD COLUMN IF NOT EXISTS tourmageddon_net_price DECIMAL(10,2);

-- Index for reporting queries
CREATE INDEX IF NOT EXISTS idx_activity_bookings_tourmageddon_commission
ON activity_bookings(activity_seller, tourmageddon_seller_commission_percentage)
WHERE tourmageddon_seller_commission_percentage IS NOT NULL;

-- Comments
COMMENT ON COLUMN activity_bookings.tourmageddon_seller_commission_percentage IS 'Tourmageddon-calculated commission % based on seller_commission_rules';
COMMENT ON COLUMN activity_bookings.tourmageddon_seller_commission_amount IS 'Tourmageddon-calculated commission amount: total_price * (commission_percentage / 100)';
COMMENT ON COLUMN activity_bookings.tourmageddon_net_price IS 'Tourmageddon-calculated net price: total_price - commission_amount';

-- ============================================================================
-- Step 4: Grant permissions
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON seller_activities TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE seller_activities_id_seq TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON seller_commission_rules TO authenticated;

GRANT SELECT ON seller_activities TO anon;
GRANT SELECT ON seller_commission_rules TO anon;

-- ============================================================================
-- Step 5: Create helper view for commission reporting
-- ============================================================================

CREATE OR REPLACE VIEW v_seller_commission_summary AS
SELECT
    s.seller_id,
    s.title AS seller_name,
    COUNT(DISTINCT ab.activity_booking_id) AS total_bookings,
    COUNT(DISTINCT ab.activity_booking_id) FILTER (WHERE ab.tourmageddon_seller_commission_percentage IS NOT NULL) AS bookings_with_commission,
    SUM(ab.total_price) AS total_revenue,
    SUM(ab.tourmageddon_seller_commission_amount) AS total_commission,
    SUM(ab.tourmageddon_net_price) AS total_net_revenue,
    AVG(ab.tourmageddon_seller_commission_percentage) FILTER (WHERE ab.tourmageddon_seller_commission_percentage IS NOT NULL) AS avg_commission_pct
FROM sellers s
LEFT JOIN activity_bookings ab ON s.title = ab.activity_seller
WHERE ab.status = 'CONFIRMED'
GROUP BY s.seller_id, s.title
ORDER BY total_revenue DESC NULLS LAST;

COMMENT ON VIEW v_seller_commission_summary IS 'Summary of Tourmageddon seller commissions by seller';

-- ============================================================================
-- Step 6: Verification
-- ============================================================================

-- Check seller_activities table
SELECT 'seller_activities table created' as status, COUNT(*) as row_count
FROM seller_activities;

-- Check seller_commission_rules table
SELECT 'seller_commission_rules table created' as status, COUNT(*) as row_count
FROM seller_commission_rules;

-- Check new columns in activity_bookings
SELECT 'activity_bookings columns added' as status, COUNT(*) as column_count
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'activity_bookings'
AND column_name IN ('tourmageddon_seller_commission_percentage', 'tourmageddon_seller_commission_amount', 'tourmageddon_net_price');

-- ============================================================================
-- USAGE EXAMPLES
-- ============================================================================

-- Example 1: Add a seller-activity relationship
/*
INSERT INTO seller_activities (seller_id, activity_id, notes)
SELECT s.seller_id, 222980, 'Civitatis can sell Vatican Tour'
FROM sellers s WHERE s.title = 'Civitatis';
*/

-- Example 2: Add an "always" commission rule (fixed rate)
/*
INSERT INTO seller_commission_rules (seller_id, activity_id, commission_percentage, rule_type, notes)
SELECT s.seller_id, 222980, 15.00, 'always', 'Standard 15% commission for Vatican Tour'
FROM sellers s WHERE s.title = 'Civitatis';
*/

-- Example 3: Add a seller-wide default commission (activity_id = NULL)
/*
INSERT INTO seller_commission_rules (seller_id, activity_id, commission_percentage, rule_type, notes)
SELECT s.seller_id, NULL, 12.00, 'always', 'Default 12% for all Civitatis activities'
FROM sellers s WHERE s.title = 'Civitatis';
*/

-- Example 4: Add a year-based commission rule
/*
INSERT INTO seller_commission_rules (seller_id, activity_id, commission_percentage, rule_type, applicable_year, priority, notes)
SELECT s.seller_id, 222980, 18.00, 'year', 2026, 10, '2026 rate: 18% commission'
FROM sellers s WHERE s.title = 'Civitatis';
*/

-- Example 5: Add a date range commission rule (e.g., holiday season)
/*
INSERT INTO seller_commission_rules (seller_id, activity_id, commission_percentage, rule_type, date_range_start, date_range_end, priority, notes)
SELECT s.seller_id, 222980, 20.00, 'date_range', '2026-12-15', '2027-01-15', 20, 'Holiday season premium rate'
FROM sellers s WHERE s.title = 'Civitatis';
*/

-- Example 6: Query to find matching rule for a booking
/*
SELECT *
FROM seller_commission_rules scr
JOIN sellers s ON scr.seller_id = s.seller_id
WHERE s.title = 'Civitatis'
  AND (scr.activity_id = 222980 OR scr.activity_id IS NULL)
  AND scr.is_active = true
  AND (
    scr.rule_type = 'always'
    OR (scr.rule_type = 'year' AND scr.applicable_year = 2026)
    OR (scr.rule_type = 'date_range' AND '2026-03-15' BETWEEN scr.date_range_start AND scr.date_range_end)
  )
ORDER BY scr.priority DESC, scr.activity_id NULLS LAST
LIMIT 1;
*/
