-- ============================================================================
-- Manual Status Override System for Materialized View
-- ============================================================================
-- This allows you to manually set status to CANCELLED in the materialized view
-- without affecting the actual status in activity_bookings table
--
-- Use case: When you need to hide/mark bookings as cancelled in reports/exports
-- while preserving the real booking status in the system
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

-- Recreate with override logic
CREATE MATERIALIZED VIEW activity_bookings_participants_mv AS
SELECT
    ab.booking_id,
    ab.activity_booking_id,
    ab.product_id,
    ab.activity_id,
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
    ab.activity_seller,
    ab.affiliate_id,
    ab.first_campaign,
    ab.created_at AS activity_created_at,

    -- Booking information
    b.confirmation_code AS booking_confirmation_code,
    b.external_booking_reference,
    b.status AS booking_status,
    b.currency,
    b.total_price AS booking_total_price,
    b.total_paid,
    b.total_due,
    b.payment_type,
    b.language,
    b.creation_date AS booking_creation_date,

    -- Customer information
    c.customer_id,
    c.uuid AS customer_uuid,
    c.email AS customer_email,
    c.first_name AS customer_first_name,
    c.last_name AS customer_last_name,
    c.phone_number AS customer_phone,

    -- Participant information
    pcb.pricing_category_booking_id,
    pcb.pricing_category_id,
    pcb.booked_title,
    pcb.age AS participant_age,
    pcb.quantity AS participant_quantity,
    pcb.occupancy AS participant_occupancy,
    pcb.passenger_first_name,
    pcb.passenger_last_name,
    pcb.passenger_date_of_birth,

    -- Activity/Product information
    a.title AS activity_title,
    a.description AS activity_description,
    a.duration_amount,
    a.duration_unit,
    a.price_currency AS activity_currency,
    a.price_amount AS activity_price,
    a.instant_confirmation,
    a.instant_delivery,
    a.requires_date,
    a.requires_time,

    -- Seller information
    s.seller_id,
    s.title AS seller_title,
    s.email AS seller_email,
    s.phone_number AS seller_phone,
    s.currency_code AS seller_currency,
    s.country_code AS seller_country,
    s.website AS seller_website

FROM activity_bookings ab
LEFT JOIN activity_booking_status_overrides ov ON ab.activity_booking_id = ov.activity_booking_id
LEFT JOIN bookings b ON ab.booking_id = b.booking_id
LEFT JOIN booking_customers bc ON b.booking_id = bc.booking_id
LEFT JOIN customers c ON bc.customer_id = c.customer_id
LEFT JOIN pricing_category_bookings pcb ON ab.activity_booking_id = pcb.activity_booking_id
LEFT JOIN activities a ON ab.activity_id = a.activity_id
LEFT JOIN sellers s ON b.seller_id = s.seller_id
ORDER BY ab.start_date_time DESC, ab.activity_booking_id, pcb.pricing_category_booking_id;

-- ============================================================================
-- Step 3: Recreate indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_mv_booking_id ON activity_bookings_participants_mv(booking_id);
CREATE INDEX IF NOT EXISTS idx_mv_activity_booking_id ON activity_bookings_participants_mv(activity_booking_id);
CREATE INDEX IF NOT EXISTS idx_mv_start_date_time ON activity_bookings_participants_mv(start_date_time);
CREATE INDEX IF NOT EXISTS idx_mv_customer_email ON activity_bookings_participants_mv(customer_email);
CREATE INDEX IF NOT EXISTS idx_mv_affiliate_id ON activity_bookings_participants_mv(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_mv_first_campaign ON activity_bookings_participants_mv(first_campaign);
CREATE INDEX IF NOT EXISTS idx_mv_status ON activity_bookings_participants_mv(status);
CREATE INDEX IF NOT EXISTS idx_mv_original_status ON activity_bookings_participants_mv(original_status);

-- Create UNIQUE index for CONCURRENT refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_unique_row
ON activity_bookings_participants_mv(
    activity_booking_id,
    COALESCE(pricing_category_booking_id, -1),
    COALESCE(customer_id, -1)
);

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

-- Add trigger for the override table
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

-- Example 5: Update an override
/*
UPDATE activity_booking_status_overrides
SET
    override_status = 'CONFIRMED',
    override_reason = 'Changed mind - show as confirmed',
    overridden_at = NOW()
WHERE activity_booking_id = 12345678;
*/

-- Example 6: Compare view status vs actual status
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

-- ============================================================================
-- HELPER QUERIES
-- ============================================================================

-- Count how many bookings have overrides
/*
SELECT
    COUNT(*) as total_overrides,
    override_status,
    COUNT(*) FILTER (WHERE override_status = 'CANCELLED') as cancelled_overrides
FROM activity_booking_status_overrides
GROUP BY override_status;
*/

-- Find bookings in view that show different status than actual
/*
SELECT
    activity_booking_id,
    status as displayed_status,
    original_status as actual_status,
    override_reason,
    overridden_by
FROM activity_bookings_participants_mv
WHERE status != original_status
ORDER BY start_date_time DESC
LIMIT 100;
*/