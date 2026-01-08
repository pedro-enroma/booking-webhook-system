-- Revert affiliate resets: Restore original_affiliate_id to activity_bookings_participants_mv
-- Run this to undo all previous resets and start fresh with GA4-synced tracking

-- Step 1: Preview what will be updated (run this first to verify)
SELECT
  arl.transaction_id,
  arl.original_affiliate_id,
  arl.was_reset,
  arl.created_at,
  abpm.affiliate_id AS current_affiliate_id
FROM affiliate_reset_log arl
LEFT JOIN activity_bookings_participants_mv abpm
  ON arl.transaction_id::text = abpm.activity_booking_id::text
WHERE arl.was_reset = TRUE
  AND arl.original_affiliate_id IS NOT NULL
ORDER BY arl.created_at DESC;

-- Step 2: Count records to be updated
SELECT COUNT(*) AS records_to_revert
FROM affiliate_reset_log
WHERE was_reset = TRUE
  AND original_affiliate_id IS NOT NULL;

-- Step 3: Perform the update (uncomment to execute)
/*
UPDATE activity_bookings_participants_mv abpm
SET affiliate_id = arl.original_affiliate_id
FROM affiliate_reset_log arl
WHERE arl.transaction_id::text = abpm.activity_booking_id::text
  AND arl.was_reset = TRUE
  AND arl.original_affiliate_id IS NOT NULL;
*/

-- Step 4: Clear the reset log to start fresh (uncomment to execute)
/*
DELETE FROM affiliate_reset_log;
*/

-- Or if you want to keep history but mark as reverted:
/*
ALTER TABLE affiliate_reset_log ADD COLUMN IF NOT EXISTS reverted_at TIMESTAMP;
UPDATE affiliate_reset_log SET reverted_at = NOW() WHERE was_reset = TRUE;
*/
