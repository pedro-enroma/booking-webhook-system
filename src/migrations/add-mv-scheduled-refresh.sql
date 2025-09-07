-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- First, create a unique index for CONCURRENTLY refresh to work
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_unique_row 
ON activity_bookings_participants_mv(
    activity_booking_id, 
    COALESCE(pricing_category_booking_id, -1),
    COALESCE(customer_id, -1)
);

-- Schedule refresh every 15 minutes
SELECT cron.schedule(
    'refresh-activity-bookings-participants-mv',  -- job name
    '*/15 * * * *',                               -- every 15 minutes
    $$REFRESH MATERIALIZED VIEW CONCURRENTLY activity_bookings_participants_mv;$$
);

-- To view scheduled jobs:
-- SELECT * FROM cron.job;

-- To remove the job if needed:
-- SELECT cron.unschedule('refresh-activity-bookings-participants-mv');