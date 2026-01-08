-- Add activity_supplier column to store vendor/supplier title
ALTER TABLE activity_bookings
ADD COLUMN IF NOT EXISTS activity_supplier TEXT;

-- Create index for filtering by supplier
CREATE INDEX IF NOT EXISTS idx_activity_bookings_supplier
ON activity_bookings(activity_supplier);
