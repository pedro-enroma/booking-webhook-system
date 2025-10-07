-- ============================================================================
-- Add Affiliate Commission System
-- ============================================================================
-- This creates:
-- 1. affiliate_commissions table to store commission % per affiliate
-- 2. Updates materialized view to calculate affiliate_commission field
-- ============================================================================

-- Step 1: Create affiliate_commissions table
CREATE TABLE IF NOT EXISTS affiliate_commissions (
    id SERIAL PRIMARY KEY,
    affiliate_id VARCHAR(255) UNIQUE NOT NULL,
    commission_percentage NUMERIC(5,2) NOT NULL CHECK (commission_percentage >= 0 AND commission_percentage <= 100),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index for fast lookups
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_affiliate_id
ON affiliate_commissions(affiliate_id);

-- Add comments
COMMENT ON TABLE affiliate_commissions IS 'Stores commission percentage for each affiliate';
COMMENT ON COLUMN affiliate_commissions.affiliate_id IS 'Affiliate identifier (matches affiliate_id in activity_bookings)';
COMMENT ON COLUMN affiliate_commissions.commission_percentage IS 'Commission percentage (0-100). Example: 10.5 means 10.5%';
COMMENT ON COLUMN affiliate_commissions.notes IS 'Optional notes about this affiliate commission';

-- ============================================================================
-- Step 2: Recreate materialized view with affiliate_commission calculation
-- ============================================================================

-- Drop existing view
DROP MATERIALIZED VIEW IF EXISTS activity_bookings_participants_mv CASCADE;

-- Recreate with affiliate_commission calculation
CREATE MATERIALIZED VIEW activity_bookings_participants_mv AS
SELECT
    ab.id,
    ab.booking_id,
    ab.activity_booking_id,
    ab.product_id,
    ab.product_title,
    ab.product_confirmation_code,
    ab.start_date_time,
    ab.end_date_time,

    -- STATUS WITH OVERRIDE LOGIC
    COALESCE(ov.override_status, ab.status) AS status,
    ab.status AS original_status,
    ov.override_reason,
    ov.overridden_by,
    ov.overridden_at,

    ab.total_price,
    ab.rate_id,
    ab.rate_title,
    ab.start_time,
    ab.date_string,
    ab.created_at,
    ab.activity_id,
    ab.activity_seller,
    ab.affiliate_id,
    ab.first_campaign,

    -- NEW: Calculate affiliate commission
    -- Formula: total_price * (commission_percentage / 100)
    -- Returns NULL if no affiliate_id or no commission % configured
    CASE
        WHEN ab.affiliate_id IS NOT NULL AND ac.commission_percentage IS NOT NULL
        THEN ROUND(ab.total_price * (ac.commission_percentage / 100), 2)
        ELSE NULL
    END AS affiliate_commission,

    -- Store the commission percentage for reference
    ac.commission_percentage AS affiliate_commission_percentage,

    -- Aggregated participant data
    COUNT(pcb.id) AS participant_count,
    SUM(pcb.quantity) AS total_participants,
    MIN(pcb.age) AS min_age,
    MAX(pcb.age) AS max_age,
    SUM(CASE WHEN pcb.passenger_first_name IS NOT NULL THEN 1 ELSE 0 END) AS participants_with_names,
    SUM(pcb.quantity) AS item_category3,
    ab.booking_id AS item_category4,
    TO_CHAR(ab.end_date_time, 'YYYY-MM-DD') AS item_category5

FROM activity_bookings ab
LEFT JOIN activity_booking_status_overrides ov ON ab.activity_booking_id = ov.activity_booking_id
LEFT JOIN affiliate_commissions ac ON ab.affiliate_id = ac.affiliate_id
LEFT JOIN pricing_category_bookings pcb ON ab.activity_booking_id = pcb.activity_booking_id
GROUP BY
    ab.id,
    ab.booking_id,
    ab.activity_booking_id,
    ab.product_id,
    ab.product_title,
    ab.product_confirmation_code,
    ab.start_date_time,
    ab.end_date_time,
    ab.status,
    ab.total_price,
    ab.rate_id,
    ab.rate_title,
    ab.start_time,
    ab.date_string,
    ab.created_at,
    ab.activity_id,
    ab.activity_seller,
    ab.affiliate_id,
    ab.first_campaign,
    ov.override_status,
    ov.override_reason,
    ov.overridden_by,
    ov.overridden_at,
    ac.commission_percentage;

-- ============================================================================
-- Step 3: Recreate indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_mv_booking_id ON activity_bookings_participants_mv(booking_id);
CREATE INDEX IF NOT EXISTS idx_mv_activity_booking_id ON activity_bookings_participants_mv(activity_booking_id);
CREATE INDEX IF NOT EXISTS idx_mv_start_date_time ON activity_bookings_participants_mv(start_date_time);
CREATE INDEX IF NOT EXISTS idx_mv_affiliate_id ON activity_bookings_participants_mv(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_mv_first_campaign ON activity_bookings_participants_mv(first_campaign);
CREATE INDEX IF NOT EXISTS idx_mv_status ON activity_bookings_participants_mv(status);
CREATE INDEX IF NOT EXISTS idx_mv_original_status ON activity_bookings_participants_mv(original_status);

-- NEW: Index for affiliate commission queries
CREATE INDEX IF NOT EXISTS idx_mv_affiliate_commission ON activity_bookings_participants_mv(affiliate_commission);

-- Create UNIQUE index for CONCURRENT refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_unique_row
ON activity_bookings_participants_mv(activity_booking_id);

-- ============================================================================
-- Step 4: Update triggers to include affiliate_commissions table
-- ============================================================================

-- Trigger for affiliate_commissions changes (NEW)
DROP TRIGGER IF EXISTS refresh_mv_on_affiliate_commissions ON affiliate_commissions;
CREATE TRIGGER refresh_mv_on_affiliate_commissions
AFTER INSERT OR UPDATE OR DELETE ON affiliate_commissions
FOR EACH STATEMENT
EXECUTE FUNCTION refresh_activity_bookings_participants_mv();

-- ============================================================================
-- Step 5: Grant permissions
-- ============================================================================

GRANT SELECT ON activity_bookings_participants_mv TO authenticated;
GRANT SELECT ON activity_bookings_participants_mv TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON affiliate_commissions TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE affiliate_commissions_id_seq TO authenticated;

-- ============================================================================
-- Step 6: Insert some example affiliate commissions (optional)
-- ============================================================================

-- Example: Set default commission rates for known affiliates
-- You can modify these or add more after running the migration
/*
INSERT INTO affiliate_commissions (affiliate_id, commission_percentage, notes)
VALUES
    ('cometeelmundo', 10.00, 'Standard affiliate rate'),
    ('il-colosseo', 12.50, 'Premium affiliate rate'),
    ('tourmageddon', 15.00, 'Internal affiliate rate')
ON CONFLICT (affiliate_id) DO NOTHING;
*/

-- ============================================================================
-- Step 7: Refresh the view
-- ============================================================================

REFRESH MATERIALIZED VIEW activity_bookings_participants_mv;

-- ============================================================================
-- Step 8: Verify installation
-- ============================================================================

-- Check affiliate_commissions table
SELECT 'Affiliate commissions table created' as status, COUNT(*) as row_count
FROM affiliate_commissions;

-- Check new columns in view
SELECT 'View columns verified' as status, COUNT(*) as column_count
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'activity_bookings_participants_mv'
AND column_name IN ('affiliate_commission', 'affiliate_commission_percentage');

-- ============================================================================
-- USAGE EXAMPLES
-- ============================================================================

-- Example 1: Add commission rate for an affiliate
/*
INSERT INTO affiliate_commissions (affiliate_id, commission_percentage, notes)
VALUES ('cometeelmundo', 10.00, 'Standard 10% commission')
ON CONFLICT (affiliate_id)
DO UPDATE SET
    commission_percentage = EXCLUDED.commission_percentage,
    notes = EXCLUDED.notes,
    updated_at = NOW();
*/

-- Example 2: Update commission rate
/*
UPDATE affiliate_commissions
SET commission_percentage = 12.50, updated_at = NOW()
WHERE affiliate_id = 'cometeelmundo';
*/

-- Example 3: View all commissions by affiliate
/*
SELECT
    mv.affiliate_id,
    COUNT(*) as booking_count,
    SUM(mv.total_price) as total_revenue,
    AVG(ac.commission_percentage) as avg_commission_pct,
    SUM(mv.affiliate_commission) as total_commission
FROM activity_bookings_participants_mv mv
LEFT JOIN affiliate_commissions ac ON mv.affiliate_id = ac.affiliate_id
WHERE mv.affiliate_id IS NOT NULL
GROUP BY mv.affiliate_id
ORDER BY total_commission DESC;
*/

-- Example 4: View bookings with calculated commissions
/*
SELECT
    activity_booking_id,
    booking_id,
    product_title,
    affiliate_id,
    total_price,
    affiliate_commission_percentage,
    affiliate_commission,
    start_date_time
FROM activity_bookings_participants_mv
WHERE affiliate_id IS NOT NULL
ORDER BY start_date_time DESC
LIMIT 10;
*/

-- Example 5: Get all unique affiliates that need commission rates set
/*
SELECT DISTINCT
    ab.affiliate_id,
    COUNT(*) as booking_count,
    SUM(ab.total_price) as total_revenue,
    ac.commission_percentage as current_rate
FROM activity_bookings ab
LEFT JOIN affiliate_commissions ac ON ab.affiliate_id = ac.affiliate_id
WHERE ab.affiliate_id IS NOT NULL
GROUP BY ab.affiliate_id, ac.commission_percentage
ORDER BY booking_count DESC;
*/