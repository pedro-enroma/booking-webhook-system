-- Update activity_bookings_participants_mv to include affiliate_id and first_campaign columns
-- Date: 2025-09-04

-- Step 1: Drop the existing materialized view
DROP MATERIALIZED VIEW IF EXISTS activity_bookings_participants_mv CASCADE;

-- Step 2: Recreate the materialized view with the new columns
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
    ab.status,
    ab.total_price,
    ab.rate_id,
    ab.rate_title,
    ab.start_time,
    ab.date_string,
    ab.activity_seller,
    ab.affiliate_id,        -- NEW COLUMN
    ab.first_campaign,       -- NEW COLUMN
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
    
    -- Customer information (from the first customer linked to the booking)
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
LEFT JOIN bookings b ON ab.booking_id = b.booking_id
LEFT JOIN booking_customers bc ON b.booking_id = bc.booking_id
LEFT JOIN customers c ON bc.customer_id = c.customer_id
LEFT JOIN pricing_category_bookings pcb ON ab.activity_booking_id = pcb.activity_booking_id
LEFT JOIN activities a ON ab.activity_id = a.activity_id
LEFT JOIN sellers s ON b.seller_id = s.seller_id
ORDER BY ab.start_date_time DESC, ab.activity_booking_id, pcb.pricing_category_booking_id;

-- Step 3: Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_mv_booking_id ON activity_bookings_participants_mv(booking_id);
CREATE INDEX IF NOT EXISTS idx_mv_activity_booking_id ON activity_bookings_participants_mv(activity_booking_id);
CREATE INDEX IF NOT EXISTS idx_mv_start_date_time ON activity_bookings_participants_mv(start_date_time);
CREATE INDEX IF NOT EXISTS idx_mv_customer_email ON activity_bookings_participants_mv(customer_email);
CREATE INDEX IF NOT EXISTS idx_mv_affiliate_id ON activity_bookings_participants_mv(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_mv_first_campaign ON activity_bookings_participants_mv(first_campaign);
CREATE INDEX IF NOT EXISTS idx_mv_status ON activity_bookings_participants_mv(status);

-- Step 4: Grant permissions (adjust based on your roles)
GRANT SELECT ON activity_bookings_participants_mv TO authenticated;
GRANT SELECT ON activity_bookings_participants_mv TO anon;

-- Step 5: Add comments for documentation
COMMENT ON MATERIALIZED VIEW activity_bookings_participants_mv IS 'Materialized view combining activity bookings with participants, customers, and affiliate tracking data';
COMMENT ON COLUMN activity_bookings_participants_mv.affiliate_id IS 'Affiliate ID from GTM tracking';
COMMENT ON COLUMN activity_bookings_participants_mv.first_campaign IS 'First campaign ID from GTM tracking';

-- Step 6: Refresh the materialized view with current data
REFRESH MATERIALIZED VIEW activity_bookings_participants_mv;

-- Step 7: Verify the update
SELECT 
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'activity_bookings_participants_mv'
AND column_name IN ('affiliate_id', 'first_campaign')
ORDER BY ordinal_position;