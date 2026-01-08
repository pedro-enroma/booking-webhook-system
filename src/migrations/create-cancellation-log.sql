-- ============================================================================
-- Cancellation Log Table
-- ============================================================================
-- Tracks all cancellations: when, how, and by whom
-- ============================================================================

CREATE TABLE IF NOT EXISTS cancellation_log (
    id SERIAL PRIMARY KEY,
    activity_booking_id BIGINT NOT NULL,
    booking_id BIGINT,

    -- Cancellation details
    cancelled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    cancellation_source VARCHAR(50) NOT NULL, -- 'webhook', 'manual', 'bulk_update', 'api', 'admin'
    cancellation_reason TEXT,

    -- Who/what triggered the cancellation
    triggered_by VARCHAR(255), -- user email, system name, script name

    -- Previous state
    previous_status VARCHAR(50),

    -- Additional context
    metadata JSONB DEFAULT '{}',

    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_cancellation_log_activity_booking_id
    ON cancellation_log(activity_booking_id);

CREATE INDEX IF NOT EXISTS idx_cancellation_log_booking_id
    ON cancellation_log(booking_id);

CREATE INDEX IF NOT EXISTS idx_cancellation_log_cancelled_at
    ON cancellation_log(cancelled_at);

CREATE INDEX IF NOT EXISTS idx_cancellation_log_source
    ON cancellation_log(cancellation_source);

-- Comments
COMMENT ON TABLE cancellation_log IS 'Tracks all booking cancellations with full audit trail';
COMMENT ON COLUMN cancellation_log.cancellation_source IS 'How the cancellation happened: webhook, manual, bulk_update, api, admin';
COMMENT ON COLUMN cancellation_log.triggered_by IS 'Who or what triggered the cancellation (user email, script name, etc)';
COMMENT ON COLUMN cancellation_log.previous_status IS 'The status before cancellation (usually CONFIRMED)';
COMMENT ON COLUMN cancellation_log.metadata IS 'Additional context in JSON format';

-- ============================================================================
-- Helper function to log cancellations
-- ============================================================================

CREATE OR REPLACE FUNCTION log_cancellation(
    p_activity_booking_id BIGINT,
    p_booking_id BIGINT,
    p_source VARCHAR(50),
    p_reason TEXT DEFAULT NULL,
    p_triggered_by VARCHAR(255) DEFAULT NULL,
    p_previous_status VARCHAR(50) DEFAULT 'CONFIRMED',
    p_metadata JSONB DEFAULT '{}'
) RETURNS BIGINT AS $$
DECLARE
    v_id BIGINT;
BEGIN
    INSERT INTO cancellation_log (
        activity_booking_id,
        booking_id,
        cancellation_source,
        cancellation_reason,
        triggered_by,
        previous_status,
        metadata
    ) VALUES (
        p_activity_booking_id,
        p_booking_id,
        p_source,
        p_reason,
        p_triggered_by,
        p_previous_status,
        p_metadata
    ) RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- View to see recent cancellations
-- ============================================================================

CREATE OR REPLACE VIEW recent_cancellations AS
SELECT
    cl.id,
    cl.activity_booking_id,
    cl.booking_id,
    cl.cancelled_at,
    cl.cancellation_source,
    cl.cancellation_reason,
    cl.triggered_by,
    cl.previous_status,
    ab.product_title,
    ab.activity_seller,
    ab.start_date_time
FROM cancellation_log cl
LEFT JOIN activity_bookings ab ON cl.activity_booking_id = ab.activity_booking_id
ORDER BY cl.cancelled_at DESC;

-- ============================================================================
-- Usage Examples
-- ============================================================================
/*
-- Log a webhook cancellation
SELECT log_cancellation(
    123456789,                    -- activity_booking_id
    987654321,                    -- booking_id
    'webhook',                    -- source
    'Customer requested',         -- reason
    'bokun_webhook',              -- triggered_by
    'CONFIRMED',                  -- previous_status
    '{"webhook_id": "abc123"}'   -- metadata
);

-- Log a manual/admin cancellation
SELECT log_cancellation(
    123456789,
    987654321,
    'manual',
    'Duplicate booking',
    'admin@enroma.com',
    'CONFIRMED',
    '{}'
);

-- Log a bulk update cancellation
SELECT log_cancellation(
    123456789,
    987654321,
    'bulk_update',
    'Batch cancellation for affiliate cleanup',
    'npm run update-status',
    'CONFIRMED',
    '{"batch_id": "2024-12-16-001"}'
);

-- View recent cancellations
SELECT * FROM recent_cancellations LIMIT 20;

-- Find all cancellations for a specific booking
SELECT * FROM cancellation_log WHERE activity_booking_id = 123456789;

-- Find cancellations by source
SELECT * FROM cancellation_log WHERE cancellation_source = 'webhook' ORDER BY cancelled_at DESC;
*/
