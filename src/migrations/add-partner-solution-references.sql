-- Migration: Add Partner Solution References to Invoices
-- Description: Adds columns to store all Partner Solution API responses for refunds/linking
-- Date: 2026-01-13

-- ============================================
-- 1. ADD PS REFERENCE COLUMNS TO INVOICES TABLE
-- ============================================

-- Partner Solution Account IRI
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'ps_account_iri'
  ) THEN
    ALTER TABLE invoices ADD COLUMN ps_account_iri VARCHAR(200);
    COMMENT ON COLUMN invoices.ps_account_iri IS 'Partner Solution Account IRI (e.g., /accounts/uuid)';
  END IF;
END $$;

-- Partner Solution Pratica IRI
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'ps_pratica_iri'
  ) THEN
    ALTER TABLE invoices ADD COLUMN ps_pratica_iri VARCHAR(200);
    COMMENT ON COLUMN invoices.ps_pratica_iri IS 'Partner Solution Pratica IRI (e.g., /prt_praticas/uuid)';
  END IF;
END $$;

-- Partner Solution Passeggero IRI
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'ps_passeggero_iri'
  ) THEN
    ALTER TABLE invoices ADD COLUMN ps_passeggero_iri VARCHAR(200);
    COMMENT ON COLUMN invoices.ps_passeggero_iri IS 'Partner Solution Passeggero IRI (e.g., /prt_praticapasseggeros/uuid)';
  END IF;
END $$;

-- Partner Solution Servizio IRI
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'ps_servizio_iri'
  ) THEN
    ALTER TABLE invoices ADD COLUMN ps_servizio_iri VARCHAR(200);
    COMMENT ON COLUMN invoices.ps_servizio_iri IS 'Partner Solution Servizio IRI (e.g., /prt_praticaservizios/uuid)';
  END IF;
END $$;

-- Partner Solution Quota IRI
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'ps_quota_iri'
  ) THEN
    ALTER TABLE invoices ADD COLUMN ps_quota_iri VARCHAR(200);
    COMMENT ON COLUMN invoices.ps_quota_iri IS 'Partner Solution Quota IRI (e.g., /prt_praticaservizioquotas/uuid)';
  END IF;
END $$;

-- Partner Solution Movimento Finanziario IRI
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'ps_movimento_iri'
  ) THEN
    ALTER TABLE invoices ADD COLUMN ps_movimento_iri VARCHAR(200);
    COMMENT ON COLUMN invoices.ps_movimento_iri IS 'Partner Solution Movimento Finanziario IRI (e.g., /mov_finanziarios/uuid)';
  END IF;
END $$;

-- Commessa Code
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'ps_commessa_code'
  ) THEN
    ALTER TABLE invoices ADD COLUMN ps_commessa_code VARCHAR(20);
    COMMENT ON COLUMN invoices.ps_commessa_code IS 'Partner Solution Commessa code (e.g., 2026-01)';
  END IF;
END $$;

-- Full API Response (for debugging/audit)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'ps_raw_response'
  ) THEN
    ALTER TABLE invoices ADD COLUMN ps_raw_response JSONB;
    COMMENT ON COLUMN invoices.ps_raw_response IS 'Full Partner Solution API response for audit/debugging';
  END IF;
END $$;

-- ============================================
-- 2. CREATE INDEXES FOR PS REFERENCES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_invoices_ps_pratica_iri ON invoices(ps_pratica_iri);
CREATE INDEX IF NOT EXISTS idx_invoices_ps_commessa_code ON invoices(ps_commessa_code);

-- ============================================
-- 3. ADD CREDIT NOTE REFERENCE COLUMNS
-- For linking credit notes to original invoices
-- ============================================

-- Original Invoice ID (for credit notes)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'original_invoice_id'
  ) THEN
    ALTER TABLE invoices ADD COLUMN original_invoice_id UUID REFERENCES invoices(id);
    COMMENT ON COLUMN invoices.original_invoice_id IS 'Reference to original invoice (for credit notes)';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoices_original_invoice_id ON invoices(original_invoice_id);

-- ============================================
-- VERIFICATION
-- ============================================
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'invoices'
-- AND column_name LIKE 'ps_%'
-- ORDER BY ordinal_position;
