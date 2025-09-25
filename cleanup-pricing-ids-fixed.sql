-- Complete cleanup of pricing_category_bookings ID issues

-- 1. IMMEDIATE FIX - Run this first to stop errors
ALTER SEQUENCE pricing_category_bookings_id_seq RESTART WITH 20000;

-- 2. Check what records have high IDs
SELECT id, activity_booking_id, created_at
FROM public.pricing_category_bookings
WHERE id >= 15000
ORDER BY id;

-- 3. Optional: Renumber the high ID records to sequential IDs
-- First, find the highest ID below 15000
SELECT MAX(id) as max_normal_id
FROM public.pricing_category_bookings
WHERE id < 15000;

-- 4. Update problematic records to use lower, sequential IDs
-- Replace XXXX with the max_normal_id from step 3 plus 1
UPDATE public.pricing_category_bookings
SET id = (
    SELECT MAX(id) + 1
    FROM public.pricing_category_bookings
    WHERE id < 15000
) + ROW_NUMBER() OVER (ORDER BY created_at) - 1
WHERE id >= 15000;

-- 5. Alternative simpler approach - just reassign the high IDs one by one
-- Get the max ID that's below 15000
DO $$
DECLARE
    max_normal_id INTEGER;
    new_id INTEGER;
    rec RECORD;
BEGIN
    -- Get max ID below 15000
    SELECT COALESCE(MAX(id), 0) INTO max_normal_id
    FROM public.pricing_category_bookings
    WHERE id < 15000;

    new_id := max_normal_id + 1;

    -- Update each high ID record
    FOR rec IN
        SELECT id
        FROM public.pricing_category_bookings
        WHERE id >= 15000
        ORDER BY id
    LOOP
        UPDATE public.pricing_category_bookings
        SET id = new_id
        WHERE id = rec.id;

        new_id := new_id + 1;
    END LOOP;

    -- Reset sequence to continue from the new max
    SELECT MAX(id) + 1 INTO new_id FROM public.pricing_category_bookings;
    EXECUTE 'ALTER SEQUENCE pricing_category_bookings_id_seq RESTART WITH ' || new_id;

    RAISE NOTICE 'Fixed records and reset sequence to %', new_id;
END $$;