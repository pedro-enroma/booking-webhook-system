-- Create GTM logs table for tracking and debugging
-- This table stores all GTM webhook events for monitoring and troubleshooting

CREATE TABLE IF NOT EXISTS gtm_logs (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  event_type VARCHAR(50) NOT NULL, -- received, processing, searching, updating, completed, error
  booking_id VARCHAR(255),
  affiliate_id VARCHAR(255),
  first_campaign VARCHAR(255),
  message TEXT NOT NULL,
  details JSONB,
  duration_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_gtm_logs_timestamp ON gtm_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_gtm_logs_booking_id ON gtm_logs(booking_id);
CREATE INDEX IF NOT EXISTS idx_gtm_logs_event_type ON gtm_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_gtm_logs_affiliate_id ON gtm_logs(affiliate_id);

-- Add comments for documentation
COMMENT ON TABLE gtm_logs IS 'Audit log for GTM webhook processing';
COMMENT ON COLUMN gtm_logs.event_type IS 'Type of event: received, processing, searching, updating, completed, error';
COMMENT ON COLUMN gtm_logs.details IS 'JSON object with additional event details';
COMMENT ON COLUMN gtm_logs.duration_ms IS 'Processing duration in milliseconds';