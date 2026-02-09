-- Migration: Add payload storage columns for offloading raw_payload to Supabase Storage
-- Phase 1b: New columns + webhook_type constraint fix

-- Add columns for payload offloading
ALTER TABLE webhook_logs ADD COLUMN IF NOT EXISTS payload_storage_key TEXT;
ALTER TABLE webhook_logs ADD COLUMN IF NOT EXISTS payload_checksum TEXT;
ALTER TABLE webhook_logs ADD COLUMN IF NOT EXISTS payload_verified_at TIMESTAMPTZ;

-- Fix webhook_type CHECK constraint to allow STRIPE
-- Robust: drop ANY check constraint on webhook_type, not just a hardcoded name
DO $$
DECLARE
  constraint_rec RECORD;
BEGIN
  FOR constraint_rec IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.webhook_logs'::regclass
      AND con.contype = 'c'  -- check constraint
      AND pg_get_constraintdef(con.oid) ILIKE '%webhook_type%'
  LOOP
    EXECUTE format('ALTER TABLE webhook_logs DROP CONSTRAINT %I', constraint_rec.conname);
    RAISE NOTICE 'Dropped constraint: %', constraint_rec.conname;
  END LOOP;

  ALTER TABLE webhook_logs ADD CONSTRAINT webhook_logs_webhook_type_check
    CHECK (webhook_type IN ('BOOKING', 'AVAILABILITY', 'STRIPE'));
END $$;

-- Index for finding un-verified uploads (used by hourly verification cron)
CREATE INDEX IF NOT EXISTS idx_webhook_logs_unverified_uploads
  ON webhook_logs (received_at DESC)
  WHERE payload_storage_key IS NOT NULL AND payload_verified_at IS NULL;
