-- ============================================================================
-- Manual Status Override System for Materialized View (FIXED VERSION)
-- ============================================================================
-- This allows you to manually set status to CANCELLED in the materialized view
-- without affecting the actual status in activity_bookings table
--
-- FIXED to match your actual database schema
-- ============================================================================

-- Step 1: Create the override table
CREATE TABLE IF NOT EXISTS activity_booking_status_overrides (
    activity_booking_id BIGINT PRIMARY KEY,
    override_status VARCHAR(50) NOT NULL,
    override_reason TEXT,
    overridden_by VARCHAR(100),
    overridden_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    original_status VARCHAR(50),

    -- Foreign key to ensure we only override existing bookings
    CONSTRAINT fk_activity_booking
        FOREIGN KEY (activity_booking_id)
        REFERENCES activity_bookings(activity_booking_id)
        ON DELETE CASCADE
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_override_status ON activity_booking_status_overrides(override_status);
CREATE INDEX IF NOT EXISTS idx_override_created ON activity_booking_status_overrides(overridden_at);

-- Add comments
COMMENT ON TABLE activity_booking_status_overrides IS 'Allows manual status overrides in materialized view without changing actual booking status';
COMMENT ON COLUMN activity_booking_status_overrides.override_status IS 'The status to show in the materialized view (e.g., CANCELLED)';
COMMENT ON COLUMN activity_booking_status_overrides.override_reason IS 'Why this override was applied (for audit trail)';
COMMENT ON COLUMN activity_booking_status_overrides.original_status IS 'The original status from activity_bookings at time of override';

-- ============================================================================
-- Step 2: Recreate the materialized view with status override logic
-- ============================================================================

-- Drop existing view
DROP MATERIALIZED VIEW IF EXISTS activity_bookings_participants_mv CASCADE;

-- Recreate with override logic - MATCHING YOUR ACTUAL SCHEMA
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

    -- STATUS WITH OVERRIDE LOGIC: Use override if exists, otherwise use actual status
    COALESCE(ov.override_status, ab.status) AS status,

    -- Store original status for reference
    ab.status AS original_status,

    -- Override metadata (NULL if no override)
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

    -- Aggregated participant data (from your existing view)
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
    ov.overridden_at;

-- ============================================================================
-- Step 3: Recreate indexes (matching your existing ones)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_mv_booking_id ON activity_bookings_participants_mv(booking_id);
CREATE INDEX IF NOT EXISTS idx_mv_activity_booking_id ON activity_bookings_participants_mv(activity_booking_id);
CREATE INDEX IF NOT EXISTS idx_mv_start_date_time ON activity_bookings_participants_mv(start_date_time);
CREATE INDEX IF NOT EXISTS idx_mv_affiliate_id ON activity_bookings_participants_mv(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_mv_first_campaign ON activity_bookings_participants_mv(first_campaign);
CREATE INDEX IF NOT EXISTS idx_mv_status ON activity_bookings_participants_mv(status);
CREATE INDEX IF NOT EXISTS idx_mv_original_status ON activity_bookings_participants_mv(original_status);

-- Create UNIQUE index for CONCURRENT refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_unique_row
ON activity_bookings_participants_mv(activity_booking_id);

-- ============================================================================
-- Step 4: Update refresh function to include override table
-- ============================================================================

CREATE OR REPLACE FUNCTION refresh_activity_bookings_participants_mv()
RETURNS trigger AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY activity_bookings_participants_mv;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for activity_bookings changes
DROP TRIGGER IF EXISTS refresh_mv_on_activity_bookings ON activity_bookings;
CREATE TRIGGER refresh_mv_on_activity_bookings
AFTER INSERT OR UPDATE OR DELETE ON activity_bookings
FOR EACH STATEMENT
EXECUTE FUNCTION refresh_activity_bookings_participants_mv();

-- Add trigger for pricing_category_bookings changes
DROP TRIGGER IF EXISTS refresh_mv_on_pricing_category_bookings ON pricing_category_bookings;
CREATE TRIGGER refresh_mv_on_pricing_category_bookings
AFTER INSERT OR UPDATE OR DELETE ON pricing_category_bookings
FOR EACH STATEMENT
EXECUTE FUNCTION refresh_activity_bookings_participants_mv();

-- Add trigger for the override table (NEW)
DROP TRIGGER IF EXISTS refresh_mv_on_status_override ON activity_booking_status_overrides;
CREATE TRIGGER refresh_mv_on_status_override
AFTER INSERT OR UPDATE OR DELETE ON activity_booking_status_overrides
FOR EACH STATEMENT
EXECUTE FUNCTION refresh_activity_bookings_participants_mv();

-- ============================================================================
-- Step 5: Grant permissions
-- ============================================================================

GRANT SELECT ON activity_bookings_participants_mv TO authenticated;
GRANT SELECT ON activity_bookings_participants_mv TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON activity_booking_status_overrides TO authenticated;

-- ============================================================================
-- Step 6: Refresh the view
-- ============================================================================

REFRESH MATERIALIZED VIEW activity_bookings_participants_mv;

-- ============================================================================
-- Step 7: Verify installation
-- ============================================================================

-- Check that override table exists
SELECT 'Override table created' as status, COUNT(*) as row_count
FROM activity_booking_status_overrides;

-- Check that view has new columns
SELECT 'View columns verified' as status, COUNT(*) as column_count
FROM information_schema.columns
WHERE table_name = 'activity_bookings_participants_mv'
AND column_name IN ('status', 'original_status', 'override_reason', 'overridden_by', 'overridden_at');

-- ============================================================================
-- USAGE EXAMPLES
-- ============================================================================

-- Example 1: Add a manual override to mark booking as CANCELLED in the view only
/*
INSERT INTO activity_booking_status_overrides (
    activity_booking_id,
    override_status,
    override_reason,
    overridden_by,
    original_status
) VALUES (
    12345678,  -- Replace with actual activity_booking_id
    'CANCELLED',
    'Customer requested removal from reports',
    'admin@example.com',
    (SELECT status FROM activity_bookings WHERE activity_booking_id = 12345678)
);
*/

-- Example 2: Override multiple bookings at once
/*
INSERT INTO activity_booking_status_overrides (
    activity_booking_id,
    override_status,
    override_reason,
    overridden_by,
    original_status
)
SELECT
    activity_booking_id,
    'CANCELLED',
    'Bulk override for specific date range',
    'admin@example.com',
    status
FROM activity_bookings
WHERE activity_booking_id IN (12345, 67890, 11111);
*/

-- Example 3: View all overrides
/*
SELECT
    o.activity_booking_id,
    o.override_status,
    o.original_status,
    o.override_reason,
    o.overridden_by,
    o.overridden_at,
    ab.product_title,
    ab.start_date_time
FROM activity_booking_status_overrides o
JOIN activity_bookings ab ON o.activity_booking_id = ab.activity_booking_id
ORDER BY o.overridden_at DESC;
*/

-- Example 4: Remove an override (booking will show real status again)
/*
DELETE FROM activity_booking_status_overrides
WHERE activity_booking_id = 12345678;
*/

-- Example 5: Compare view status vs actual status
/*
SELECT
    activity_booking_id,
    status AS view_status,
    original_status AS actual_status,
    CASE
        WHEN status != original_status THEN '⚠️ OVERRIDDEN'
        ELSE '✓ Normal'
    END AS override_flag,
    override_reason
FROM activity_bookings_participants_mv
WHERE activity_booking_id = 12345678;
*/