-- ============================================================================
-- SQL to extract original pricing_category_bookings data from backup/PITR
-- ============================================================================
--
-- Run this query in your DATABASE BACKUP from yesterday (before the update)
-- to get the original values that need to be restored
--

SELECT
    pcb.id,
    pcb.pricing_category_booking_id,
    pcb.activity_booking_id,
    pcb.pricing_category_id,
    pcb.booked_title,
    pcb.age,
    pcb.quantity,
    ab.activity_id,
    ab.product_title
FROM pricing_category_bookings pcb
JOIN activity_bookings ab ON ab.activity_booking_id = pcb.activity_booking_id
WHERE ab.activity_id IN (249770, 265854, 901369, 901938)
  AND pcb.booked_title = '6 a 17 años'
ORDER BY ab.activity_id, pcb.id;

-- Export this data as CSV or JSON
-- We'll use it to restore the original values
