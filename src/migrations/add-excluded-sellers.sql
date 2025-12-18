-- Add excluded_sellers column to partner_solution_config
-- This stores sellers that should NEVER be auto-invoiced

ALTER TABLE partner_solution_config
ADD COLUMN IF NOT EXISTS excluded_sellers text[] DEFAULT '{}';

-- Add comment
COMMENT ON COLUMN partner_solution_config.excluded_sellers IS 'Sellers that should never be auto-invoiced';
