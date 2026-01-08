-- Migration: Upgrade to Monthly Pratica Model
-- Description: Converts from per-booking invoices to monthly praticas
-- Run this if you already have the old invoicing tables
-- Date: 2025-12-16

-- ============================================
-- 1. CREATE MONTHLY PRATICAS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS monthly_praticas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month VARCHAR(7) NOT NULL UNIQUE,
  partner_pratica_id VARCHAR(100),
  partner_pratica_number VARCHAR(50),
  ps_status VARCHAR(10) DEFAULT 'WP',
  total_amount DECIMAL(12,2) DEFAULT 0,
  booking_count INT DEFAULT 0,
  ps_regime VARCHAR(10) DEFAULT '74T',
  ps_sales_type VARCHAR(10) DEFAULT 'ORG',
  raw_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  finalized_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_monthly_praticas_year_month ON monthly_praticas(year_month);
CREATE INDEX IF NOT EXISTS idx_monthly_praticas_ps_status ON monthly_praticas(ps_status);

-- ============================================
-- 2. ADD NEW COLUMNS TO INVOICES TABLE
-- ============================================

-- Add monthly_pratica_id column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'monthly_pratica_id'
  ) THEN
    ALTER TABLE invoices ADD COLUMN monthly_pratica_id UUID REFERENCES monthly_praticas(id);
  END IF;
END $$;

-- Add seller_name column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'seller_name'
  ) THEN
    ALTER TABLE invoices ADD COLUMN seller_name VARCHAR(255);
  END IF;
END $$;

-- Add booking_creation_date column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'booking_creation_date'
  ) THEN
    ALTER TABLE invoices ADD COLUMN booking_creation_date DATE;
  END IF;
END $$;

-- Create index on monthly_pratica_id
CREATE INDEX IF NOT EXISTS idx_invoices_monthly_pratica_id ON invoices(monthly_pratica_id);
CREATE INDEX IF NOT EXISTS idx_invoices_seller_name ON invoices(seller_name);
CREATE INDEX IF NOT EXISTS idx_invoices_booking_creation_date ON invoices(booking_creation_date);

-- ============================================
-- 3. ADD monthly_pratica_id TO AUDIT LOG
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_audit_log' AND column_name = 'monthly_pratica_id'
  ) THEN
    ALTER TABLE invoice_audit_log ADD COLUMN monthly_pratica_id UUID REFERENCES monthly_praticas(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoice_audit_log_monthly_pratica_id ON invoice_audit_log(monthly_pratica_id);

-- ============================================
-- 4. ADD default_customer_id TO CONFIG
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partner_solution_config' AND column_name = 'default_customer_id'
  ) THEN
    ALTER TABLE partner_solution_config ADD COLUMN default_customer_id VARCHAR(100);
  END IF;
END $$;

-- ============================================
-- 5. CREATE TRIGGER FOR monthly_praticas
-- ============================================
CREATE OR REPLACE FUNCTION update_monthly_praticas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_monthly_praticas_updated_at ON monthly_praticas;
CREATE TRIGGER trigger_monthly_praticas_updated_at
  BEFORE UPDATE ON monthly_praticas
  FOR EACH ROW
  EXECUTE FUNCTION update_monthly_praticas_updated_at();

-- ============================================
-- 6. ROW LEVEL SECURITY FOR monthly_praticas
-- ============================================
ALTER TABLE monthly_praticas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role has full access to monthly_praticas" ON monthly_praticas;
CREATE POLICY "Service role has full access to monthly_praticas"
  ON monthly_praticas FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 7. MIGRATE EXISTING INVOICES TO MONTHLY PRATICAS
-- (Optional: Run this if you have existing invoices)
-- ============================================

-- This will create monthly praticas for existing invoices based on their creation date
-- and link them to the appropriate monthly pratica

-- First, create monthly praticas for each month that has invoices
INSERT INTO monthly_praticas (year_month, ps_status, total_amount, booking_count)
SELECT
  TO_CHAR(created_at, 'YYYY-MM') as year_month,
  'WP' as ps_status,
  COALESCE(SUM(total_amount), 0) as total_amount,
  COUNT(*) as booking_count
FROM invoices
WHERE invoice_type = 'INVOICE'
  AND monthly_pratica_id IS NULL
GROUP BY TO_CHAR(created_at, 'YYYY-MM')
ON CONFLICT (year_month) DO UPDATE SET
  total_amount = monthly_praticas.total_amount + EXCLUDED.total_amount,
  booking_count = monthly_praticas.booking_count + EXCLUDED.booking_count;

-- Then, link existing invoices to their monthly praticas
UPDATE invoices i
SET monthly_pratica_id = mp.id,
    booking_creation_date = i.created_at::date
FROM monthly_praticas mp
WHERE mp.year_month = TO_CHAR(i.created_at, 'YYYY-MM')
  AND i.monthly_pratica_id IS NULL;

-- ============================================
-- VERIFICATION
-- ============================================
-- SELECT * FROM monthly_praticas;
-- SELECT COUNT(*) FROM invoices WHERE monthly_pratica_id IS NOT NULL;
