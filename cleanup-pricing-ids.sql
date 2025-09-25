-- Complete cleanup of pricing_category_bookings ID issues

-- 1. Find manually inserted records with high IDs
SELECT id, activity_booking_id, created_at
FROM public.pricing_category_bookings
WHERE id >= 15000
ORDER BY id;

-- 2. Update these records to use sequential IDs starting from the natural max
WITH numbered_records AS (
    SELECT id as old_id,
           ROW_NUMBER() OVER (ORDER BY created_at) as rn
    FROM public.pricing_category_bookings
    WHERE id >= 15000
),
max_natural_id AS (
    SELECT COALESCE(MAX(id), 0) as max_id
    FROM public.pricing_category_bookings
    WHERE id < 15000
)
UPDATE public.pricing_category_bookings pcb
SET id = mni.max_id + nr.rn
FROM numbered_records nr, max_natural_id mni
WHERE pcb.id = nr.old_id;

-- 3. Now reset the sequence properly
DO $$
DECLARE
    max_id INTEGER;
BEGIN
    SELECT COALESCE(MAX(id), 0) + 1 INTO max_id FROM public.pricing_category_bookings;
    EXECUTE 'ALTER SEQUENCE pricing_category_bookings_id_seq RESTART WITH ' || max_id;
    RAISE NOTICE 'Sequence reset to %', max_id;
END $$;

-- 4. Verify everything is fixed
SELECT
    MAX(id) as max_id,
    nextval('pricing_category_bookings_id_seq') as next_sequence_value
FROM public.pricing_category_bookings;