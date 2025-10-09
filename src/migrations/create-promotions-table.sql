-- Create promotions table to track Bokun offers and discounts
-- This tracks which bookings used promotional offers, especially for multi-activity packages

CREATE TABLE IF NOT EXISTS booking_promotions (
  id SERIAL PRIMARY KEY,

  -- Bokun offer identification
  offer_id INTEGER NOT NULL,
  offer_owner_id INTEGER,
  discount_percentage DECIMAL(5,2) NOT NULL,

  -- Booking relationship
  booking_id BIGINT NOT NULL,
  confirmation_code VARCHAR(255) NOT NULL,

  -- Activity tracking
  activity_booking_id BIGINT NOT NULL,
  product_id INTEGER,
  product_title VARCHAR(500),

  -- Multi-activity offer tracking
  is_multi_activity_offer BOOLEAN DEFAULT FALSE,
  total_activities_in_offer INTEGER DEFAULT 1,

  -- First activity tracking (for multi-activity offers)
  -- This identifies which activity was booked first that triggered the offer
  first_activity_booking_id BIGINT,
  first_activity_product_id INTEGER,
  first_activity_title VARCHAR(500),

  -- Order tracking (1st, 2nd, 3rd activity in the offer)
  activity_sequence_in_offer INTEGER DEFAULT 1,

  -- Discount amounts (optional, for reporting)
  original_price DECIMAL(10,2),
  discounted_price DECIMAL(10,2),
  discount_amount DECIMAL(10,2),
  currency VARCHAR(3) DEFAULT 'EUR',

  -- Metadata
  webhook_type VARCHAR(50), -- 'BOOKING_CONFIRMED' or 'BOOKING_UPDATED'
  raw_offer_data JSONB, -- Store full offer object for reference

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Foreign keys
  FOREIGN KEY (booking_id) REFERENCES bookings(booking_id),
  FOREIGN KEY (activity_booking_id) REFERENCES activity_bookings(activity_booking_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_booking_promotions_offer_id ON booking_promotions(offer_id);
CREATE INDEX IF NOT EXISTS idx_booking_promotions_booking_id ON booking_promotions(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_promotions_activity_booking_id ON booking_promotions(activity_booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_promotions_confirmation_code ON booking_promotions(confirmation_code);
CREATE INDEX IF NOT EXISTS idx_booking_promotions_first_activity ON booking_promotions(first_activity_booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_promotions_created_at ON booking_promotions(created_at);

-- Create a view for easy reporting
CREATE OR REPLACE VIEW v_multi_activity_offers AS
SELECT
  bp.offer_id,
  bp.discount_percentage,
  bp.booking_id,
  bp.confirmation_code,
  bp.total_activities_in_offer,
  bp.first_activity_title as trigger_activity,
  COUNT(*) as activities_booked,
  SUM(bp.discount_amount) as total_discount,
  bp.currency,
  MIN(bp.created_at) as first_booking_time,
  MAX(bp.created_at) as last_booking_time,
  ARRAY_AGG(bp.product_title ORDER BY bp.activity_sequence_in_offer) as all_activities
FROM booking_promotions bp
WHERE bp.is_multi_activity_offer = TRUE
GROUP BY
  bp.offer_id,
  bp.discount_percentage,
  bp.booking_id,
  bp.confirmation_code,
  bp.total_activities_in_offer,
  bp.first_activity_title,
  bp.currency;

-- Create a view for promotion summary by offer_id
CREATE OR REPLACE VIEW v_promotion_summary AS
SELECT
  offer_id,
  discount_percentage,
  COUNT(DISTINCT booking_id) as total_bookings,
  COUNT(DISTINCT activity_booking_id) as total_activities,
  SUM(CASE WHEN is_multi_activity_offer THEN 1 ELSE 0 END) as multi_activity_bookings,
  SUM(discount_amount) as total_discount_given,
  currency,
  MIN(created_at) as first_used,
  MAX(created_at) as last_used
FROM booking_promotions
GROUP BY offer_id, discount_percentage, currency;

COMMENT ON TABLE booking_promotions IS 'Tracks Bokun promotional offers applied to bookings, especially multi-activity packages';
COMMENT ON COLUMN booking_promotions.offer_id IS 'Bokun offer ID from webhook offers array';
COMMENT ON COLUMN booking_promotions.discount_percentage IS 'Percentage discount (e.g., 3 means 3% off)';
COMMENT ON COLUMN booking_promotions.first_activity_booking_id IS 'The first activity booked that triggered this multi-activity offer';
COMMENT ON COLUMN booking_promotions.activity_sequence_in_offer IS 'Order of this activity in the multi-activity offer (1st, 2nd, 3rd, etc.)';

-- ============================================================================
-- COUPON TRACKING TABLE (Separate from Offers)
-- ============================================================================

CREATE TABLE IF NOT EXISTS booking_coupons (
  id SERIAL PRIMARY KEY,

  -- Coupon/Promo Code identification
  promo_code_id INTEGER NOT NULL,
  promo_code VARCHAR(100) NOT NULL,
  promo_code_description TEXT,

  -- Booking relationship
  booking_id BIGINT NOT NULL,
  confirmation_code VARCHAR(255) NOT NULL,

  -- GTM Campaign Attribution (THIS IS KEY!)
  first_campaign VARCHAR(255), -- From activity_bookings.first_campaign
  affiliate_id VARCHAR(100),   -- From activity_bookings.affiliate_id

  -- Activity association
  activity_booking_id BIGINT,
  product_id INTEGER,
  product_title VARCHAR(500),

  -- Discount details
  discount_type VARCHAR(50), -- 'PERCENTAGE', 'FIXED_AMOUNT', or from Bokun
  discount_value DECIMAL(10,2),
  discount_amount DECIMAL(10,2),
  currency VARCHAR(3) DEFAULT 'EUR',

  -- Original pricing (if available)
  original_price DECIMAL(10,2),
  discounted_price DECIMAL(10,2),

  -- Metadata
  webhook_type VARCHAR(50),
  raw_promo_data JSONB, -- Store full promoCode object
  applied_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Foreign keys
  FOREIGN KEY (booking_id) REFERENCES bookings(booking_id),
  FOREIGN KEY (activity_booking_id) REFERENCES activity_bookings(activity_booking_id)
);

-- Indexes for coupon tracking
CREATE INDEX IF NOT EXISTS idx_booking_coupons_promo_code_id ON booking_coupons(promo_code_id);
CREATE INDEX IF NOT EXISTS idx_booking_coupons_promo_code ON booking_coupons(promo_code);
CREATE INDEX IF NOT EXISTS idx_booking_coupons_booking_id ON booking_coupons(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_coupons_first_campaign ON booking_coupons(first_campaign);
CREATE INDEX IF NOT EXISTS idx_booking_coupons_affiliate_id ON booking_coupons(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_booking_coupons_created_at ON booking_coupons(created_at);

-- View: Coupon usage by campaign
CREATE OR REPLACE VIEW v_coupon_campaign_attribution AS
SELECT
  bc.promo_code,
  bc.promo_code_id,
  bc.first_campaign,
  bc.affiliate_id,
  COUNT(DISTINCT bc.booking_id) as total_bookings,
  COUNT(*) as total_uses,
  SUM(bc.discount_amount) as total_discount_given,
  bc.currency,
  MIN(bc.created_at) as first_used,
  MAX(bc.created_at) as last_used
FROM booking_coupons bc
WHERE bc.first_campaign IS NOT NULL
GROUP BY bc.promo_code, bc.promo_code_id, bc.first_campaign, bc.affiliate_id, bc.currency;

-- View: Combined promotions (offers + coupons)
CREATE OR REPLACE VIEW v_all_promotions AS
SELECT
  'OFFER' as promotion_type,
  offer_id::text as promotion_id,
  NULL as promo_code,
  booking_id,
  confirmation_code,
  activity_booking_id,
  discount_percentage as discount_value,
  discount_amount,
  first_activity_booking_id,
  NULL as first_campaign,
  NULL as affiliate_id,
  currency,
  created_at
FROM booking_promotions
UNION ALL
SELECT
  'COUPON' as promotion_type,
  promo_code_id::text as promotion_id,
  promo_code,
  booking_id,
  confirmation_code,
  activity_booking_id,
  discount_value,
  discount_amount,
  NULL as first_activity_booking_id,
  first_campaign,
  affiliate_id,
  currency,
  created_at
FROM booking_coupons;

COMMENT ON TABLE booking_coupons IS 'Tracks promotional coupon codes (promoCode) used in bookings with GTM campaign attribution';
COMMENT ON COLUMN booking_coupons.promo_code_id IS 'Bokun promoCode.id from invoice.promoCode';
COMMENT ON COLUMN booking_coupons.promo_code IS 'The actual coupon code entered by customer (e.g., SUPERPEDRO)';
COMMENT ON COLUMN booking_coupons.first_campaign IS 'GTM campaign that led to this booking - links to activity_bookings.first_campaign';
COMMENT ON COLUMN booking_coupons.affiliate_id IS 'Affiliate that brought this customer - links to activity_bookings.affiliate_id';
