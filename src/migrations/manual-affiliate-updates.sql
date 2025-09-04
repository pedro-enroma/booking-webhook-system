-- Manual updates for historical bookings with affiliate and campaign data
-- Date: 2025-09-04

-- Update visitasroma bookings with (not set) campaign
UPDATE activity_bookings
SET 
  affiliate_id = 'visitasroma',
  first_campaign = NULL
WHERE booking_id IN (66267020, 67832160, 67978880, 68152343, 69186625, 69929208, 70128174, 71739382);

-- Update mirian-valverde bookings with (not set) campaign
UPDATE activity_bookings
SET 
  affiliate_id = 'mirian-valverde',
  first_campaign = NULL
WHERE booking_id IN (68860076, 72735139, 72920681, 73175471);

-- Update losviajesdeclaudia booking
UPDATE activity_bookings
SET 
  affiliate_id = 'losviajesdeclaudia',
  first_campaign = 'colis'
WHERE booking_id = 67114538;

-- Update viajeroscallejeros bookings with coliseo-romano campaign
UPDATE activity_bookings
SET 
  affiliate_id = 'viajeroscallejeros',
  first_campaign = 'coliseo-romano'
WHERE booking_id IN (67007642, 67857673, 68851134, 68856824, 69319744, 71759863, 73130418, 73197435, 73201768);

-- Update audioguiaroma bookings with enroma campaign
UPDATE activity_bookings
SET 
  affiliate_id = 'audioguiaroma',
  first_campaign = 'enroma'
WHERE booking_id IN (68840518, 71026252, 71362654);

-- Update visitasroma booking with enroma-banners campaign
UPDATE activity_bookings
SET 
  affiliate_id = 'visitasroma',
  first_campaign = 'enroma-banners'
WHERE booking_id = 71466533;

-- Update cometeelmundo bookings with various Google campaigns
UPDATE activity_bookings
SET 
  affiliate_id = 'cometeelmundo',
  first_campaign = 'g-cj0kcqjwndhebhdvarisagh0g3dduawjyg'
WHERE booking_id IN (70959104, 70959657);

UPDATE activity_bookings
SET 
  affiliate_id = 'cometeelmundo',
  first_campaign = 'g-cj0kcqjwqqdfbhdharisaihtlkvs8tyxaj'
WHERE booking_id = 73166464;

UPDATE activity_bookings
SET 
  affiliate_id = 'cometeelmundo',
  first_campaign = 'g-cjwkcajwq9rfbhaieiwagvazp8w14dzuab'
WHERE booking_id = 73123047;

UPDATE activity_bookings
SET 
  affiliate_id = 'cometeelmundo',
  first_campaign = 'g-eaiaiqobchmiyeyo5euojwmvssh5bb2x4r'
WHERE booking_id = 73214048;

UPDATE activity_bookings
SET 
  affiliate_id = 'cometeelmundo',
  first_campaign = 'visitar-el-vaticano-sin-colas-block'
WHERE booking_id = 66652500;

-- Verify the updates
SELECT 
  booking_id,
  affiliate_id,
  first_campaign,
  product_title
FROM activity_bookings
WHERE booking_id IN (
  66267020, 67832160, 67978880, 68152343, 68860076, 69186625, 69929208, 70128174, 71739382,
  72735139, 72920681, 67114538, 67007642, 67857673, 68851134, 68856824, 69319744, 71759863,
  73130418, 73197435, 73201768, 68840518, 71026252, 71362654, 71466533, 70959104, 70959657,
  73166464, 73123047, 73214048, 66652500, 73175471
)
ORDER BY affiliate_id, booking_id;