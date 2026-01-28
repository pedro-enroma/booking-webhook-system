-- Add column to store refund movimento IRI from Partner Solution
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS ps_refund_movimento_iri TEXT;

-- Add index for lookups
CREATE INDEX IF NOT EXISTS idx_invoices_ps_refund_movimento ON invoices(ps_refund_movimento_iri) WHERE ps_refund_movimento_iri IS NOT NULL;

COMMENT ON COLUMN invoices.ps_refund_movimento_iri IS 'Partner Solution movimento IRI for RIMBOK refund';
