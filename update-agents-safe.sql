-- SQL Script to Update Missing Agent Data in activity_bookings (SAFE VERSION)
-- This script first ensures agents exist in sellers table, then updates activity_bookings

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

-- Step 2: First, insert agents from webhook_logs into sellers table if they don't exist
INSERT INTO sellers (seller_id, title, email, phone_number, currency_code)
SELECT DISTINCT
    (wl.raw_payload->'agent'->>'id')::integer as seller_id,
    COALESCE(
        wl.raw_payload->'agent'->>'title',
        wl.raw_payload->'parentBooking'->'agent'->>'title'
    ) as title,
    NULL as email,
    NULL as phone_number,
    'EUR' as currency_code
FROM webhook_logs wl
WHERE (wl.raw_payload->'agent'->>'title' IS NOT NULL
       OR wl.raw_payload->'parentBooking'->'agent'->>'title' IS NOT NULL)
  AND COALESCE(
      wl.raw_payload->'agent'->>'title',
      wl.raw_payload->'parentBooking'->'agent'->>'title'
  ) != 'EnRoma.com'
  AND (wl.raw_payload->'agent'->>'id')::integer IS NOT NULL
ON CONFLICT (seller_id) DO NOTHING;

-- Step 2b: Show what agents were found/added
SELECT
    title,
    COUNT(*) as occurrences_in_webhooks
FROM (
    SELECT DISTINCT
        COALESCE(
            raw_payload->'agent'->>'title',
            raw_payload->'parentBooking'->'agent'->>'title'
        ) as title
    FROM webhook_logs
    WHERE (raw_payload->'agent'->>'title' IS NOT NULL
           OR raw_payload->'parentBooking'->'agent'->>'title' IS NOT NULL)
      AND COALESCE(
          raw_payload->'agent'->>'title',
          raw_payload->'parentBooking'->'agent'->>'title'
      ) != 'EnRoma.com'
) agents
GROUP BY title
ORDER BY occurrences_in_webhooks DESC;

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

-- Step 5: Show sample of updated bookings grouped by agent
SELECT
    activity_seller,
    COUNT(*) as booking_count
FROM activity_bookings
WHERE activity_seller IS NOT NULL
GROUP BY activity_seller
ORDER BY booking_count DESC;
