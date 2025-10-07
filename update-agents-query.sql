-- SQL Script to Update Missing Agent Data in activity_bookings
-- This script updates activity_bookings with agent information from webhook_logs

-- Step 1: Check current state
SELECT
    'Total Bookings' as metric,
    COUNT(*) as count
FROM activity_bookings
UNION ALL
SELECT
    'NULL activity_seller',
    COUNT(*)
FROM activity_bookings
WHERE activity_seller IS NULL
UNION ALL
SELECT
    'EnRoma.com seller',
    COUNT(*)
FROM activity_bookings
WHERE activity_seller = 'EnRoma.com'
UNION ALL
SELECT
    'Other agents',
    COUNT(*)
FROM activity_bookings
WHERE activity_seller IS NOT NULL AND activity_seller != 'EnRoma.com';

-- Step 2: Preview bookings that will be updated
-- (Uncomment to see what will be updated)
/*
SELECT
    ab.activity_booking_id,
    ab.product_title,
    ab.activity_seller as current_seller,
    wl.raw_payload->'agent'->>'title' as agent_from_webhook,
    wl.raw_payload->'parentBooking'->'agent'->>'title' as agent_from_parent
FROM activity_bookings ab
LEFT JOIN webhook_logs wl ON wl.booking_id = ab.activity_booking_id::text
WHERE (ab.activity_seller IS NULL OR ab.activity_seller = 'EnRoma.com')
  AND (wl.raw_payload->'agent'->>'title' IS NOT NULL
       OR wl.raw_payload->'parentBooking'->'agent'->>'title' IS NOT NULL)
ORDER BY ab.start_date_time DESC
LIMIT 20;
*/

-- Step 3: UPDATE bookings with agent data from webhook_logs
-- This uses agent.title from the webhook payload
UPDATE activity_bookings ab
SET activity_seller = COALESCE(
    wl.raw_payload->'agent'->>'title',
    wl.raw_payload->'parentBooking'->'agent'->>'title'
)
FROM (
    SELECT DISTINCT ON (booking_id)
        booking_id,
        raw_payload
    FROM webhook_logs
    WHERE raw_payload->'agent'->>'title' IS NOT NULL
       OR raw_payload->'parentBooking'->'agent'->>'title' IS NOT NULL
    ORDER BY booking_id, received_at DESC
) wl
WHERE ab.activity_booking_id::text = wl.booking_id
  AND (ab.activity_seller IS NULL OR ab.activity_seller = 'EnRoma.com')
  AND COALESCE(
      wl.raw_payload->'agent'->>'title',
      wl.raw_payload->'parentBooking'->'agent'->>'title'
  ) IS NOT NULL
  AND COALESCE(
      wl.raw_payload->'agent'->>'title',
      wl.raw_payload->'parentBooking'->'agent'->>'title'
  ) != 'EnRoma.com';

-- Step 4: Verify the results
SELECT
    'After Update - Total' as metric,
    COUNT(*) as count
FROM activity_bookings
UNION ALL
SELECT
    'After Update - NULL seller',
    COUNT(*)
FROM activity_bookings
WHERE activity_seller IS NULL
UNION ALL
SELECT
    'After Update - EnRoma.com',
    COUNT(*)
FROM activity_bookings
WHERE activity_seller = 'EnRoma.com'
UNION ALL
SELECT
    'After Update - Other agents',
    COUNT(*)
FROM activity_bookings
WHERE activity_seller IS NOT NULL AND activity_seller != 'EnRoma.com';

-- Step 5: Show sample of updated bookings
SELECT
    activity_seller,
    COUNT(*) as booking_count
FROM activity_bookings
WHERE activity_seller IS NOT NULL
GROUP BY activity_seller
ORDER BY booking_count DESC;
