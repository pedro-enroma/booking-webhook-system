-- Create function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_activity_bookings_participants_mv()
RETURNS trigger AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY activity_bookings_participants_mv;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers on all source tables
-- Trigger for activity_bookings changes
CREATE TRIGGER refresh_mv_on_activity_bookings
AFTER INSERT OR UPDATE OR DELETE ON activity_bookings
FOR EACH STATEMENT
EXECUTE FUNCTION refresh_activity_bookings_participants_mv();

-- Trigger for bookings changes
CREATE TRIGGER refresh_mv_on_bookings
AFTER INSERT OR UPDATE OR DELETE ON bookings
FOR EACH STATEMENT
EXECUTE FUNCTION refresh_activity_bookings_participants_mv();

-- Trigger for customers changes
CREATE TRIGGER refresh_mv_on_customers
AFTER INSERT OR UPDATE OR DELETE ON customers
FOR EACH STATEMENT
EXECUTE FUNCTION refresh_activity_bookings_participants_mv();

-- Trigger for pricing_category_bookings changes
CREATE TRIGGER refresh_mv_on_pricing_category_bookings
AFTER INSERT OR UPDATE OR DELETE ON pricing_category_bookings
FOR EACH STATEMENT
EXECUTE FUNCTION refresh_activity_bookings_participants_mv();

-- Trigger for activities changes
CREATE TRIGGER refresh_mv_on_activities
AFTER INSERT OR UPDATE OR DELETE ON activities
FOR EACH STATEMENT
EXECUTE FUNCTION refresh_activity_bookings_participants_mv();

-- Trigger for sellers changes
CREATE TRIGGER refresh_mv_on_sellers
AFTER INSERT OR UPDATE OR DELETE ON sellers
FOR EACH STATEMENT
EXECUTE FUNCTION refresh_activity_bookings_participants_mv();

-- Note: For CONCURRENTLY to work, you need a UNIQUE index
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_unique_participant 
ON activity_bookings_participants_mv(activity_booking_id, COALESCE(pricing_category_booking_id, -1));