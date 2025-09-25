-- Fix for pricing_category_bookings duplicate key error
-- This updates the manually inserted record from ID 15443 to ID 1

-- First check if ID 1 already exists
-- If it does, you'll need to use a different ID

-- Update the record
UPDATE public.pricing_category_bookings
SET id = 1
WHERE id = 15443;

-- Alternatively, if ID 1 already exists, find the next available ID:
-- First run this to find the maximum ID:
-- SELECT MAX(id) FROM public.pricing_category_bookings;

-- Then use that max ID + 1:
-- UPDATE public.pricing_category_bookings
-- SET id = (SELECT MAX(id) + 1 FROM public.pricing_category_bookings)
-- WHERE id = 15443;

-- After fixing the record, reset the sequence to continue from the highest ID
-- Find the new maximum ID
-- SELECT MAX(id) FROM public.pricing_category_bookings;

-- Then reset the sequence (replace XXXX with the max ID + 1):
-- ALTER SEQUENCE pricing_category_bookings_id_seq RESTART WITH XXXX;