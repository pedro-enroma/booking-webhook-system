-- Migration: Create Invoicing Tables (Monthly Pratica Model)
-- Description: Creates tables for Partner Solution API integration
-- Model: ONE Pratica per MONTH, bookings add Servizi to monthly Pratica
-- Date: 2025-12-16

-- ============================================
-- 1. MONTHLY PRATICAS TABLE
-- One record per month, links to Partner Solution Pratica
-- ============================================
CREATE TABLE IF NOT EXISTS monthly_praticas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Month identifier (format: 'YYYY-MM')
  year_month VARCHAR(7) NOT NULL UNIQUE,          -- e.g., '2025-01'

  -- Partner Solution references
  partner_pratica_id VARCHAR(100),                -- /prt_praticas IRI from PS API
  partner_pratica_number VARCHAR(50),             -- Human-readable invoice number from PS

  -- Status tracking
  ps_status VARCHAR(10) DEFAULT 'WP',             -- WP (working progress) or INS (finalized)

  -- Aggregated financial data
  total_amount DECIMAL(12,2) DEFAULT 0,           -- Sum of all bookings in month
  booking_count INT DEFAULT 0,                    -- Number of bookings added

  -- Partner Solution defaults used for this pratica
  ps_regime VARCHAR(10) DEFAULT '74T',
  ps_sales_type VARCHAR(10) DEFAULT 'ORG',

  -- Raw API response
  raw_response JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  finalized_at TIMESTAMPTZ                        -- When status changed to INS
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_monthly_praticas_year_month ON monthly_praticas(year_month);
CREATE INDEX IF NOT EXISTS idx_monthly_praticas_ps_status ON monthly_praticas(ps_status);

-- ============================================
-- 2. INVOICES TABLE
-- Tracks individual bookings added to monthly Pratica
-- ============================================
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to monthly pratica
  monthly_pratica_id UUID REFERENCES monthly_praticas(id),

  -- Booking reference
  booking_id BIGINT NOT NULL,
  confirmation_code VARCHAR(50) NOT NULL,

  -- Invoice details
  invoice_type VARCHAR(20) NOT NULL DEFAULT 'INVOICE', -- 'INVOICE' or 'CREDIT_NOTE'
  status VARCHAR(30) NOT NULL DEFAULT 'pending',       -- pending, sent, failed

  -- Financial data (booking's contribution to monthly total)
  total_amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'EUR',

  -- Booking metadata snapshot
  customer_name VARCHAR(255),
  customer_email VARCHAR(255),
  seller_name VARCHAR(255),                       -- Seller/channel for tracking
  booking_creation_date DATE,                     -- Used to determine which month

  -- Status tracking
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INT DEFAULT 0,

  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(100),                        -- 'webhook', 'manual', user email

  -- Ensure one invoice and one credit note per booking
  CONSTRAINT unique_booking_invoice_type UNIQUE (booking_id, invoice_type)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_invoices_booking_id ON invoices(booking_id);
CREATE INDEX IF NOT EXISTS idx_invoices_monthly_pratica_id ON invoices(monthly_pratica_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at);
CREATE INDEX IF NOT EXISTS idx_invoices_confirmation_code ON invoices(confirmation_code);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_type ON invoices(invoice_type);
CREATE INDEX IF NOT EXISTS idx_invoices_seller_name ON invoices(seller_name);
CREATE INDEX IF NOT EXISTS idx_invoices_booking_creation_date ON invoices(booking_creation_date);

-- ============================================
-- 3. INVOICE LINE ITEMS TABLE
-- Individual activity Servizi added to Partner Solution
-- ============================================
CREATE TABLE IF NOT EXISTS invoice_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,

  -- Activity reference
  activity_booking_id BIGINT NOT NULL,

  -- Partner Solution reference
  partner_servizio_id VARCHAR(100),               -- /prt_praticaservizios IRI from PS API

  -- Line item details
  product_title VARCHAR(500) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,

  -- Partner Solution specific
  service_type VARCHAR(10) DEFAULT 'VIS',         -- PKG, STR, VIS, ASS, NOL

  -- Activity details snapshot
  activity_date DATE,
  activity_time TIME,
  participant_count INT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice_id ON invoice_line_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_activity_booking_id ON invoice_line_items(activity_booking_id);

-- ============================================
-- 4. PARTNER SOLUTION CONFIG TABLE
-- Configuration for Partner Solution integration
-- ============================================
CREATE TABLE IF NOT EXISTS partner_solution_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- API Configuration
  api_base_url VARCHAR(255) DEFAULT 'https://catture.partnersolution.it',

  -- Default values for new praticas/servizi
  default_regime VARCHAR(10) DEFAULT '74T',
  default_sales_type VARCHAR(10) DEFAULT 'ORG',
  default_service_type VARCHAR(10) DEFAULT 'VIS',

  -- Auto-invoicing settings (DISABLED by default for safety)
  auto_invoice_enabled BOOLEAN DEFAULT false,
  auto_credit_note_enabled BOOLEAN DEFAULT false,

  -- Which sellers trigger auto-invoicing
  auto_invoice_sellers TEXT[] DEFAULT ARRAY['EnRoma.com'],

  -- Partner Solution account reference
  default_account_id VARCHAR(100),
  default_customer_id VARCHAR(100),               -- Default customer IRI for the monthly Pratica

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default configuration row
INSERT INTO partner_solution_config (id)
VALUES (gen_random_uuid())
ON CONFLICT DO NOTHING;

-- ============================================
-- 5. INVOICE AUDIT LOG TABLE
-- Detailed logging of all invoice operations
-- ============================================
CREATE TABLE IF NOT EXISTS invoice_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Can reference either invoice or monthly_pratica
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  monthly_pratica_id UUID REFERENCES monthly_praticas(id) ON DELETE SET NULL,

  -- Action details
  action VARCHAR(50) NOT NULL,                    -- CREATED, SENT, FAILED, RETRIED, FINALIZED, BOOKING_ADDED
  status_from VARCHAR(30),
  status_to VARCHAR(30),

  -- Additional context
  details JSONB,
  error_message TEXT,

  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(100)                         -- 'webhook', 'system', 'retry_job', or user email
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_invoice_audit_log_invoice_id ON invoice_audit_log(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_audit_log_monthly_pratica_id ON invoice_audit_log(monthly_pratica_id);
CREATE INDEX IF NOT EXISTS idx_invoice_audit_log_created_at ON invoice_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_invoice_audit_log_action ON invoice_audit_log(action);

-- ============================================
-- 6. TRIGGERS: Auto-update updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_monthly_praticas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_monthly_praticas_updated_at
  BEFORE UPDATE ON monthly_praticas
  FOR EACH ROW
  EXECUTE FUNCTION update_monthly_praticas_updated_at();

CREATE OR REPLACE FUNCTION update_invoices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_invoices_updated_at();

CREATE OR REPLACE FUNCTION update_partner_solution_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_partner_solution_config_updated_at
  BEFORE UPDATE ON partner_solution_config
  FOR EACH ROW
  EXECUTE FUNCTION update_partner_solution_config_updated_at();

-- ============================================
-- 7. ROW LEVEL SECURITY (RLS)
-- ============================================
ALTER TABLE monthly_praticas ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_solution_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_audit_log ENABLE ROW LEVEL SECURITY;

-- Policies: Allow service_role full access
CREATE POLICY "Service role has full access to monthly_praticas"
  ON monthly_praticas FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role has full access to invoices"
  ON invoices FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role has full access to invoice_line_items"
  ON invoice_line_items FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role has full access to partner_solution_config"
  ON partner_solution_config FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role has full access to invoice_audit_log"
  ON invoice_audit_log FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================
-- VERIFICATION QUERIES
-- Run these to verify the migration succeeded
-- ============================================
-- SELECT COUNT(*) FROM monthly_praticas;
-- SELECT COUNT(*) FROM invoices;
-- SELECT COUNT(*) FROM invoice_line_items;
-- SELECT COUNT(*) FROM partner_solution_config;
-- SELECT COUNT(*) FROM invoice_audit_log;
-- SELECT * FROM partner_solution_config;
