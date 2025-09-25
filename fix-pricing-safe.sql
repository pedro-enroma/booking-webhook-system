-- Safe fix for pricing_category_bookings duplicate key error
-- This script handles the issue more safely

-- Step 1: Find the current maximum ID
SELECT MAX(id) as max_id FROM public.pricing_category_bookings;

-- Step 2: Update the problematic record to use the next available ID
-- (Run this after checking the max_id from step 1)
UPDATE public.pricing_category_bookings
SET id = (SELECT COALESCE(MAX(id), 0) + 1 FROM public.pricing_category_bookings WHERE id != 15443)
WHERE id = 15443;

-- Step 3: Fix the auto-increment sequence
-- This ensures new inserts will get proper IDs
ALTER SEQUENCE pricing_category_bookings_id_seq
RESTART WITH (
    SELECT COALESCE(MAX(id), 0) + 1
    FROM public.pricing_category_bookings
);

-- Step 4: Verify the fix
SELECT id, pricing_category_booking_id, activity_booking_id
FROM public.pricing_category_bookings
ORDER BY id DESC
LIMIT 10;