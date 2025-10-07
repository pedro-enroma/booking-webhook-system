-- Create participant_sync_logs table for tracking participant changes
CREATE TABLE IF NOT EXISTS participant_sync_logs (
  id SERIAL PRIMARY KEY,
  activity_booking_id BIGINT NOT NULL,
  booking_id BIGINT NOT NULL,
  confirmation_code VARCHAR(255) NOT NULL,
  sync_action VARCHAR(50) NOT NULL CHECK (sync_action IN ('ADD', 'REMOVE', 'MATCH', 'UPDATE')),
  pricing_category_booking_id BIGINT,
  pricing_category_id BIGINT,
  pricing_category_title VARCHAR(255),
  passenger_first_name VARCHAR(255),
  passenger_last_name VARCHAR(255),
  quantity INTEGER,
  occupancy INTEGER,
  webhook_participant_count INTEGER NOT NULL,
  db_participant_count_before INTEGER NOT NULL,
  db_participant_count_after INTEGER NOT NULL,
  sync_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  raw_participant_data JSONB,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_participant_sync_activity_booking ON participant_sync_logs(activity_booking_id);
CREATE INDEX idx_participant_sync_confirmation ON participant_sync_logs(confirmation_code);
CREATE INDEX idx_participant_sync_action ON participant_sync_logs(sync_action);
CREATE INDEX idx_participant_sync_timestamp ON participant_sync_logs(sync_timestamp DESC);

-- Create a view for quick analysis of participant changes
CREATE VIEW participant_sync_summary AS
SELECT
  confirmation_code,
  activity_booking_id,
  sync_action,
  COUNT(*) as change_count,
  MAX(sync_timestamp) as last_change,
  jsonb_agg(
    jsonb_build_object(
      'action', sync_action,
      'participant_id', pricing_category_booking_id,
      'category', pricing_category_title,
      'passenger', passenger_first_name || ' ' || passenger_last_name,
      'timestamp', sync_timestamp
    ) ORDER BY sync_timestamp DESC
  ) as changes
FROM participant_sync_logs
GROUP BY confirmation_code, activity_booking_id, sync_action
ORDER BY MAX(sync_timestamp) DESC;

-- Create a view for bookings with participant changes
CREATE VIEW bookings_with_participant_changes AS
SELECT
  psl.confirmation_code,
  psl.activity_booking_id,
  psl.booking_id,
  COUNT(*) FILTER (WHERE psl.sync_action = 'ADD') as participants_added,
  COUNT(*) FILTER (WHERE psl.sync_action = 'REMOVE') as participants_removed,
  COUNT(*) FILTER (WHERE psl.sync_action = 'MATCH') as participants_matched,
  COUNT(*) FILTER (WHERE psl.sync_action = 'UPDATE') as participants_updated,
  MIN(psl.sync_timestamp) as first_change,
  MAX(psl.sync_timestamp) as last_change,
  MAX(psl.db_participant_count_after) as current_participant_count
FROM participant_sync_logs psl
GROUP BY psl.confirmation_code, psl.activity_booking_id, psl.booking_id
HAVING COUNT(*) FILTER (WHERE psl.sync_action IN ('ADD', 'REMOVE')) > 0
ORDER BY MAX(psl.sync_timestamp) DESC;

COMMENT ON TABLE participant_sync_logs IS 'Logs all participant additions, removals, and updates from BOOKING_UPDATED webhooks';
COMMENT ON COLUMN participant_sync_logs.sync_action IS 'ADD: new participant added, REMOVE: participant deleted, MATCH: existing participant kept, UPDATE: participant info updated';
COMMENT ON COLUMN participant_sync_logs.webhook_participant_count IS 'Total participants in webhook payload';
COMMENT ON COLUMN participant_sync_logs.db_participant_count_before IS 'Participant count in DB before sync';
COMMENT ON COLUMN participant_sync_logs.db_participant_count_after IS 'Participant count in DB after sync';
