-- Migration: Create Invoice Rules Table
-- Description: Simple invoice rules system for auto-invoicing
-- Two rule types:
--   1. travel_date: Invoice on travel date (cron job)
--   2. creation_date: Invoice immediately on booking confirmation
-- Date: 2026-01-26

-- ============================================
-- 1. DROP EXISTING TABLE IF EXISTS (clean slate)
-- ============================================
DROP TABLE IF EXISTS invoice_rules CASCADE;

-- ============================================
-- 2. CREATE INVOICE_RULES TABLE
-- ============================================
CREATE TABLE invoice_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Rule identification
  name VARCHAR(100) NOT NULL,                      -- e.g., "Civitatis Travel Date Rule"

  -- Rule type: 'travel_date' or 'creation_date'
  invoice_date_type VARCHAR(20) NOT NULL CHECK (invoice_date_type IN ('travel_date', 'creation_date')),

  -- Sellers this rule applies to (array of seller names)
  sellers TEXT[] NOT NULL DEFAULT '{}',

  -- Start date filter:
  --   For travel_date: only invoice bookings with travel_date >= this date
  --   For creation_date: only invoice bookings with creation_date >= this date
  invoice_start_date DATE NOT NULL,

  -- Execution time (only for travel_date rules - cron job time)
  -- For creation_date rules, this is ignored (instant)
  execution_time TIME DEFAULT '08:00:00',

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. INDEXES
-- ============================================
CREATE INDEX idx_invoice_rules_type ON invoice_rules(invoice_date_type);
CREATE INDEX idx_invoice_rules_active ON invoice_rules(is_active);
CREATE INDEX idx_invoice_rules_sellers ON invoice_rules USING GIN(sellers);

-- ============================================
-- 4. TRIGGER: Auto-update updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_invoice_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_invoice_rules_updated_at
  BEFORE UPDATE ON invoice_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_invoice_rules_updated_at();

-- ============================================
-- 5. ROW LEVEL SECURITY
-- ============================================
ALTER TABLE invoice_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to invoice_rules"
  ON invoice_rules FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 6. COMMENTS
-- ============================================
COMMENT ON TABLE invoice_rules IS 'Invoice rules for automatic invoicing based on seller';
COMMENT ON COLUMN invoice_rules.invoice_date_type IS 'travel_date: cron sends on travel date | creation_date: instant send on booking confirmation';
COMMENT ON COLUMN invoice_rules.sellers IS 'Array of seller names this rule applies to';
COMMENT ON COLUMN invoice_rules.invoice_start_date IS 'For travel_date: travel >= date | For creation_date: created >= date';
COMMENT ON COLUMN invoice_rules.execution_time IS 'Time of day for cron job (only for travel_date rules)';
