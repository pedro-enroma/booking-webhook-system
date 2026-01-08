-- Migration: Comprehensive Pricing Fields
-- Description: Add all pricing fields needed for direct sales and reseller scenarios
-- Date: 2025-12-17
--
-- PRICING MODEL:
--
-- DIRECT SALES (EnRoma.com seller):
--   original_price    = totalPrice from webhook (pre-discount)
--   total_price       = priceWithDiscount (what customer should pay)
--   discount_pct      = discountPercentage
--   discount_amount   = discountAmount
--   net_price         = same as total_price (no commission for direct sales)
--
-- RESELLER SALES (e.g., GL-Tours, Denomades):
--   original_price    = sum of unitPrice from sellerInvoice.lineItems
--   total_price       = sum of totalWithoutCommission (what customer paid to reseller)
--   commission_pct    = commission from sellerInvoice.lineItems
--   commission_amount = total_price - net_price
--   net_price         = sellerInvoice.totalAsMoney.amount (what EnRoma receives)

-- ============================================
-- 1. ADD COLUMNS TO activity_bookings
-- ============================================

-- Original price before any discounts
ALTER TABLE activity_bookings
ADD COLUMN IF NOT EXISTS original_price DECIMAL(10,2);

-- Price with discount (what customer should pay) - this becomes the main total_price
-- Note: total_price column already exists, we'll update its meaning

-- Discount percentage (for direct sales with offers)
ALTER TABLE activity_bookings
ADD COLUMN IF NOT EXISTS discount_percentage DECIMAL(5,2);

-- Discount amount (for direct sales with offers)
ALTER TABLE activity_bookings
ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2);

-- Commission percentage (for reseller sales)
-- Note: commission_percentage may already exist from previous migration
ALTER TABLE activity_bookings
ADD COLUMN IF NOT EXISTS commission_percentage DECIMAL(5,2);

-- Commission amount (for reseller sales)
ALTER TABLE activity_bookings
ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(10,2);

-- Net price - what EnRoma actually receives
-- For direct sales: same as total_price
-- For reseller sales: after commission deduction
ALTER TABLE activity_bookings
ADD COLUMN IF NOT EXISTS net_price DECIMAL(10,2);

-- Payment type (PAID_IN_FULL, DEPOSIT, etc.)
ALTER TABLE activity_bookings
ADD COLUMN IF NOT EXISTS paid_type VARCHAR(30);

-- Currency for the transaction
ALTER TABLE activity_bookings
ADD COLUMN IF NOT EXISTS currency VARCHAR(10);

-- Total paid for this activity (proportional from booking)
ALTER TABLE activity_bookings
ADD COLUMN IF NOT EXISTS total_paid DECIMAL(10,2);

-- Total due for this activity (proportional from booking)
ALTER TABLE activity_bookings
ADD COLUMN IF NOT EXISTS total_due DECIMAL(10,2);

-- ============================================
-- 2. ADD COLUMNS TO bookings
-- ============================================

-- Net price total (sum of activity net_prices)
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS net_price DECIMAL(12,2);

-- Original price total (sum of activity original_prices)
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS original_price DECIMAL(12,2);

-- Discount amount total
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2);

-- Commission amount total
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(10,2);

-- ============================================
-- 3. CREATE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_activity_bookings_net_price ON activity_bookings(net_price);
CREATE INDEX IF NOT EXISTS idx_activity_bookings_paid_type ON activity_bookings(paid_type);
CREATE INDEX IF NOT EXISTS idx_bookings_net_price ON bookings(net_price);

-- ============================================
-- 4. DROP OLD EUR COLUMNS (if they exist from previous migration)
-- These are being replaced by the comprehensive pricing model
-- ============================================

-- We'll keep eur_unit_price, eur_total_price, eur_net_price for now
-- as they might be useful for foreign currency bookings
-- But the main pricing will use the new columns

-- ============================================
-- 5. UPDATE MATERIALIZED VIEW
-- ============================================

DROP MATERIALIZED VIEW IF EXISTS activity_bookings_participants_mv CASCADE;

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
    -- IMPORTANT: Show net_price (what EnRoma receives) as the main price
    ab.net_price AS total_price,
    ab.original_price,
    ab.discount_percentage,
    ab.discount_amount,
    ab.commission_percentage,
    ab.commission_amount,
    ab.paid_type,
    ab.currency AS activity_currency_code,
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
    b.net_price AS booking_net_price,
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

    -- Seller information (from sellers table via activity_seller name match)
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
LEFT JOIN sellers s ON ab.activity_seller = s.title
ORDER BY ab.start_date_time DESC, ab.activity_booking_id, pcb.pricing_category_booking_id;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_mv_booking_id ON activity_bookings_participants_mv(booking_id);
CREATE INDEX IF NOT EXISTS idx_mv_activity_booking_id ON activity_bookings_participants_mv(activity_booking_id);
CREATE INDEX IF NOT EXISTS idx_mv_start_date_time ON activity_bookings_participants_mv(start_date_time);
CREATE INDEX IF NOT EXISTS idx_mv_customer_email ON activity_bookings_participants_mv(customer_email);
CREATE INDEX IF NOT EXISTS idx_mv_affiliate_id ON activity_bookings_participants_mv(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_mv_first_campaign ON activity_bookings_participants_mv(first_campaign);
CREATE INDEX IF NOT EXISTS idx_mv_status ON activity_bookings_participants_mv(status);
CREATE INDEX IF NOT EXISTS idx_mv_total_price ON activity_bookings_participants_mv(total_price);

-- Grant permissions
GRANT SELECT ON activity_bookings_participants_mv TO authenticated;
GRANT SELECT ON activity_bookings_participants_mv TO anon;

-- Add comments
COMMENT ON MATERIALIZED VIEW activity_bookings_participants_mv IS 'Materialized view combining activity bookings with participants, customers, and pricing data. total_price shows net_price (what EnRoma receives)';
COMMENT ON COLUMN activity_bookings_participants_mv.total_price IS 'Net price - what EnRoma receives after any commissions';

-- Refresh the materialized view
REFRESH MATERIALIZED VIEW activity_bookings_participants_mv;

-- ============================================
-- VERIFICATION
-- ============================================
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'activity_bookings'
-- AND column_name IN ('original_price', 'discount_percentage', 'discount_amount', 'commission_percentage', 'commission_amount', 'net_price', 'paid_type', 'currency');
