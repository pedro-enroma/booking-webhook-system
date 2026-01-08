-- Add invoice_start_date column to partner_solution_config
-- Bookings before this date will be ignored for invoicing

ALTER TABLE partner_solution_config
ADD COLUMN IF NOT EXISTS invoice_start_date date DEFAULT NULL;

COMMENT ON COLUMN partner_solution_config.invoice_start_date IS 'Bookings before this date are ignored for invoicing';

-- Set initial value to Jan 1, 2025
UPDATE partner_solution_config
SET invoice_start_date = '2025-01-01'
WHERE invoice_start_date IS NULL;
