-- Migration: Create affiliate_reset_log table for A/B testing analysis
-- Purpose: Track which transactions had their affiliate data reset to create a control group

CREATE TABLE IF NOT EXISTS affiliate_reset_log (
  id SERIAL PRIMARY KEY,
  transaction_id VARCHAR(255) NOT NULL,
  original_affiliate_id VARCHAR(255),
  original_campaign VARCHAR(255),
  reset_value DECIMAL(10, 8) NOT NULL,  -- The hash-derived value (0-1)
  threshold DECIMAL(5, 4) NOT NULL,      -- The threshold used (e.g., 0.25)
  was_reset BOOLEAN NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for looking up specific transactions
CREATE INDEX IF NOT EXISTS idx_affiliate_reset_log_transaction ON affiliate_reset_log(transaction_id);

-- Index for filtering by reset status (control group vs treatment group)
CREATE INDEX IF NOT EXISTS idx_affiliate_reset_log_was_reset ON affiliate_reset_log(was_reset);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_affiliate_reset_log_created_at ON affiliate_reset_log(created_at);

-- Index for analyzing by original affiliate
CREATE INDEX IF NOT EXISTS idx_affiliate_reset_log_affiliate ON affiliate_reset_log(original_affiliate_id);

COMMENT ON TABLE affiliate_reset_log IS 'Tracks affiliate reset decisions for control group analysis';
COMMENT ON COLUMN affiliate_reset_log.reset_value IS 'MD5 hash-derived value between 0-1 used for deterministic reset decision';
COMMENT ON COLUMN affiliate_reset_log.threshold IS 'The threshold value used (transactions with reset_value < threshold are reset)';
COMMENT ON COLUMN affiliate_reset_log.was_reset IS 'TRUE = affiliate was reset (control group), FALSE = affiliate kept (treatment group)';
