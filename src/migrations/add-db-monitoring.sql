-- Migration: Add database monitoring infrastructure
-- Phase 2a: Size-check RPC function
-- Phase 2b: Storage health tracking table

-- RPC function to check database size
CREATE OR REPLACE FUNCTION check_database_size()
RETURNS jsonb AS $$
BEGIN
  RETURN jsonb_build_object(
    'total_mb', (pg_database_size(current_database()) / 1048576),
    'webhook_logs_mb', (pg_total_relation_size('webhook_logs') / 1048576),
    'activity_availability_mb', (pg_total_relation_size('activity_availability') / 1048576),
    'participant_sync_logs_mb', (pg_total_relation_size('participant_sync_logs') / 1048576),
    'checked_at', now()
  );
END;
$$ LANGUAGE plpgsql;

-- Storage health tracking table (DB-persisted counters)
CREATE TABLE IF NOT EXISTS payload_storage_health (
  id SERIAL PRIMARY KEY,
  metric TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_occurred_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed rows
INSERT INTO payload_storage_health (metric, count) VALUES
  ('upload_failure', 0),
  ('checksum_mismatch', 0),
  ('upload_success', 0)
ON CONFLICT (metric) DO NOTHING;
