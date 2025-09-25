-- Create webhook_logs table for detailed tracking
CREATE TABLE IF NOT EXISTS webhook_logs (
  id SERIAL PRIMARY KEY,
  booking_id VARCHAR(255) NOT NULL,
  parent_booking_id VARCHAR(255),
  confirmation_code VARCHAR(255) NOT NULL,
  action VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL,
  webhook_type VARCHAR(20) NOT NULL CHECK (webhook_type IN ('BOOKING', 'AVAILABILITY')),
  received_at TIMESTAMP WITH TIME ZONE NOT NULL,
  processing_started_at TIMESTAMP WITH TIME ZONE,
  processing_completed_at TIMESTAMP WITH TIME ZONE,
  processing_duration_ms INTEGER,
  raw_payload JSONB NOT NULL,
  processing_result VARCHAR(20) CHECK (processing_result IN ('SUCCESS', 'ERROR', 'SKIPPED')),
  error_message TEXT,
  sequence_number INTEGER,
  is_duplicate BOOLEAN DEFAULT FALSE,
  previous_status VARCHAR(50),
  new_status VARCHAR(50),
  webhook_source_timestamp TIMESTAMP WITH TIME ZONE,
  out_of_order BOOLEAN DEFAULT FALSE,
  related_webhooks TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_webhook_logs_booking_id ON webhook_logs(booking_id);
CREATE INDEX idx_webhook_logs_parent_booking_id ON webhook_logs(parent_booking_id);
CREATE INDEX idx_webhook_logs_confirmation_code ON webhook_logs(confirmation_code);
CREATE INDEX idx_webhook_logs_received_at ON webhook_logs(received_at DESC);
CREATE INDEX idx_webhook_logs_webhook_type ON webhook_logs(webhook_type);
CREATE INDEX idx_webhook_logs_processing_result ON webhook_logs(processing_result);
CREATE INDEX idx_webhook_logs_out_of_order ON webhook_logs(out_of_order) WHERE out_of_order = TRUE;
CREATE INDEX idx_webhook_logs_is_duplicate ON webhook_logs(is_duplicate) WHERE is_duplicate = TRUE;

-- Create a view for quick analysis of problematic webhooks
CREATE VIEW webhook_issues AS
SELECT
  confirmation_code,
  booking_id,
  action,
  status,
  received_at,
  processing_result,
  error_message,
  out_of_order,
  is_duplicate,
  processing_duration_ms
FROM webhook_logs
WHERE out_of_order = TRUE
   OR is_duplicate = TRUE
   OR processing_result = 'ERROR'
ORDER BY received_at DESC;

-- Create a view for webhook sequence analysis
CREATE VIEW webhook_sequences AS
SELECT
  confirmation_code,
  array_agg(
    json_build_object(
      'action', action,
      'status', status,
      'received_at', received_at,
      'out_of_order', out_of_order
    ) ORDER BY received_at ASC
  ) as sequence,
  COUNT(*) as webhook_count,
  MIN(received_at) as first_webhook_at,
  MAX(received_at) as last_webhook_at
FROM webhook_logs
GROUP BY confirmation_code
HAVING COUNT(*) > 1
ORDER BY MAX(received_at) DESC;