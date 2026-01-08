-- Migration: Add EUR Pricing Fields
-- Description: Store EUR prices from sellerInvoice for non-EUR bookings
-- Date: 2025-12-17

-- ============================================
-- ADD EUR PRICING FIELDS TO ACTIVITY_BOOKINGS
-- ============================================

-- EUR unit price (retail price per person, before commission)
ALTER TABLE activity_bookings
ADD COLUMN IF NOT EXISTS eur_unit_price DECIMAL(10,2);

-- EUR total price (retail total, before commission) = unit_price * quantity
ALTER TABLE activity_bookings
ADD COLUMN IF NOT EXISTS eur_total_price DECIMAL(10,2);

-- EUR net price (after commission, what EnRoma receives)
ALTER TABLE activity_bookings
ADD COLUMN IF NOT EXISTS eur_net_price DECIMAL(10,2);

-- Commission percentage charged by reseller
ALTER TABLE activity_bookings
ADD COLUMN IF NOT EXISTS commission_percentage DECIMAL(5,2);

-- ============================================
-- ADD EUR PRICING FIELDS TO BOOKINGS
-- ============================================

-- EUR total price (sum of all activities, before commission)
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS eur_total_price DECIMAL(10,2);

-- EUR net price (sum of all activities, after commission)
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS eur_net_price DECIMAL(10,2);

-- ============================================
-- CREATE INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_activity_bookings_eur_total_price ON activity_bookings(eur_total_price);
CREATE INDEX IF NOT EXISTS idx_bookings_eur_total_price ON bookings(eur_total_price);

-- ============================================
-- VERIFICATION
-- ============================================
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'activity_bookings' AND column_name LIKE 'eur%';
