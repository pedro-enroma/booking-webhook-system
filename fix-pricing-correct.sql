-- Fix for pricing_category_bookings duplicate key error

-- Step 1: Update the problematic record to the next available ID
UPDATE public.pricing_category_bookings
SET id = (SELECT COALESCE(MAX(id), 0) + 1 FROM public.pricing_category_bookings WHERE id != 15443)
WHERE id = 15443;

-- Step 2: Get the new maximum ID (you'll see this in the output)
SELECT MAX(id) as max_id FROM public.pricing_category_bookings;

-- Step 3: Reset the sequence
-- You need to manually replace XXXXX with the max_id from step 2 plus 1
-- For example, if max_id is 15444, use 15445
DO $$
DECLARE
    max_id INTEGER;
BEGIN
    SELECT MAX(id) INTO max_id FROM public.pricing_category_bookings;
    EXECUTE 'ALTER SEQUENCE pricing_category_bookings_id_seq RESTART WITH ' || (max_id + 1);
END $$;