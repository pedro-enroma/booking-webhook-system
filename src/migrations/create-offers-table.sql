-- Create offers reference table
-- Maps Bokun offer IDs to human-readable names

CREATE TABLE IF NOT EXISTS offers (
  offer_id INTEGER PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  discount_percentage DECIMAL(5,2) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert known offers from Bokun
INSERT INTO offers (offer_id, title, discount_percentage) VALUES
  (306, 'Numa - Vat + Col', 10),
  (360, 'COMBO MV + COL', 3),
  (695, 'oferta privato', 8),
  (721, 'COMBO MV + ARE', 6),
  (722, 'Sconto Excursions', 10),
  (723, 'Niños', 12),
  (1220, 'Offerta 10% Portoghese', 10)
ON CONFLICT (offer_id) DO UPDATE SET
  title = EXCLUDED.title,
  discount_percentage = EXCLUDED.discount_percentage,
  updated_at = NOW();

-- Create view joining promotions with offer names
CREATE OR REPLACE VIEW v_booking_promotions_with_names AS
SELECT
  bp.*,
  o.title as offer_title
FROM booking_promotions bp
LEFT JOIN offers o ON bp.offer_id = o.offer_id;

-- Summary view by offer
CREATE OR REPLACE VIEW v_offer_usage_summary AS
SELECT
  o.offer_id,
  o.title as offer_title,
  o.discount_percentage,
  COUNT(DISTINCT bp.booking_id) as total_bookings,
  COUNT(bp.id) as total_activities,
  SUM(bp.discount_amount) as total_discount_given,
  MIN(bp.created_at) as first_used,
  MAX(bp.created_at) as last_used
FROM offers o
LEFT JOIN booking_promotions bp ON o.offer_id = bp.offer_id
GROUP BY o.offer_id, o.title, o.discount_percentage
ORDER BY total_bookings DESC;

COMMENT ON TABLE offers IS 'Reference table mapping Bokun offer IDs to names';
