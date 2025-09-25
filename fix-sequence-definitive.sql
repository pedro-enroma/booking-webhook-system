-- DEFINITIVE FIX for pricing_category_bookings sequence issue
-- Run these commands in order in Supabase SQL Editor

-- 1. First, check the current maximum ID
SELECT MAX(id) as current_max_id FROM public.pricing_category_bookings;
-- Note this number!

-- 2. Check current sequence value
SELECT last_value FROM pricing_category_bookings_id_seq;
-- This shows what the sequence thinks is the last value

-- 3. Find all problematic IDs that might cause conflicts
SELECT id FROM public.pricing_category_bookings
WHERE id >= 15443
ORDER BY id DESC;

-- 4. FIX: Set the sequence to a much higher value to avoid all conflicts
-- This sets it to 20000, which should be safe
ALTER SEQUENCE pricing_category_bookings_id_seq RESTART WITH 20000;

-- 5. Verify the fix
SELECT nextval('pricing_category_bookings_id_seq') as next_id;
-- This should show 20000

-- 6. Reset it back by one since we just consumed a value
ALTER SEQUENCE pricing_category_bookings_id_seq RESTART WITH 20000;

-- Alternative if you want to be more precise:
-- Get the actual max and add a buffer
DO $$
DECLARE
    max_id INTEGER;
    new_sequence_value INTEGER;
BEGIN
    -- Get current max ID
    SELECT COALESCE(MAX(id), 0) INTO max_id FROM public.pricing_category_bookings;

    -- Add buffer of 100 to be safe
    new_sequence_value := max_id + 100;

    -- Reset sequence
    EXECUTE 'ALTER SEQUENCE pricing_category_bookings_id_seq RESTART WITH ' || new_sequence_value;

    -- Show what we did
    RAISE NOTICE 'Sequence reset to %', new_sequence_value;
END $$;