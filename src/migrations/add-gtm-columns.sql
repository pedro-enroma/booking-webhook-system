-- Migration: Add GTM tracking columns to activity_bookings table
-- Date: 2025-09-04
-- Purpose: Store affiliate_id and first_campaign data from GTM

-- Add affiliate_id column
ALTER TABLE activity_bookings 
ADD COLUMN IF NOT EXISTS affiliate_id VARCHAR(255);

-- Add first_campaign column
ALTER TABLE activity_bookings 
ADD COLUMN IF NOT EXISTS first_campaign VARCHAR(255);

-- Create index on booking_id for faster lookups from GTM webhook
CREATE INDEX IF NOT EXISTS idx_activity_bookings_booking_id 
ON activity_bookings(booking_id);

-- Add comments for documentation
COMMENT ON COLUMN activity_bookings.affiliate_id IS 'Affiliate ID from GTM (TH - url - affiliate_id variable)';
COMMENT ON COLUMN activity_bookings.first_campaign IS 'First campaign ID from GTM (TH - url - first_campaign_id variable)';