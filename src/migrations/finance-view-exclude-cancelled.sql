-- Drop the existing view if it exists
DROP VIEW IF EXISTS finance_report_data CASCADE;

-- Create the finance report view from scratch
CREATE VIEW finance_report_data AS
SELECT 
    -- Date fields
    DATE(ab.start_date_time) as activity_date,
    DATE(ab.created_at) as booking_date,
    
    -- Seller grouping
    CASE 
        WHEN ab.activity_seller = 'EnRoma.com' THEN 'EnRoma.com'
        ELSE 'Resellers'
    END as seller_group,
    
    -- Original seller name
    ab.activity_seller as original_seller,
    
    -- Affiliate ID (only for EnRoma.com)
    CASE 
        WHEN ab.activity_seller = 'EnRoma.com' THEN ab.affiliate_id
        ELSE NULL
    END as affiliate_id,
    
    -- Seller with affiliate label
    CASE 
        WHEN ab.activity_seller = 'EnRoma.com' AND ab.affiliate_id IS NOT NULL THEN 
            CONCAT('EnRoma.com - ', ab.affiliate_id)
        WHEN ab.activity_seller = 'EnRoma.com' AND ab.affiliate_id IS NULL THEN 
            'EnRoma.com - Direct'
        ELSE ab.activity_seller
    END as seller_with_affiliate,
    
    -- Metrics
    COUNT(DISTINCT ab.activity_booking_id) as reservation_count,
    SUM(CAST(ab.total_price AS DECIMAL(10,2))) as total_revenue,
    COUNT(DISTINCT ab.booking_id) as unique_bookings,
    AVG(CAST(ab.total_price AS DECIMAL(10,2))) as avg_booking_value,
    
    -- Time groupings
    TO_CHAR(ab.start_date_time, 'YYYY-MM') as month_year,
    TO_CHAR(ab.start_date_time, 'YYYY-WW') as week_year,
    EXTRACT(YEAR FROM ab.start_date_time) as year,
    EXTRACT(MONTH FROM ab.start_date_time) as month,
    EXTRACT(WEEK FROM ab.start_date_time) as week
    
FROM activity_bookings ab
WHERE ab.status != 'CANCELLED'
GROUP BY 
    DATE(ab.start_date_time),
    DATE(ab.created_at),
    CASE 
        WHEN ab.activity_seller = 'EnRoma.com' THEN 'EnRoma.com'
        ELSE 'Resellers'
    END,
    ab.activity_seller,
    CASE 
        WHEN ab.activity_seller = 'EnRoma.com' THEN ab.affiliate_id
        ELSE NULL
    END,
    CASE 
        WHEN ab.activity_seller = 'EnRoma.com' AND ab.affiliate_id IS NOT NULL THEN 
            CONCAT('EnRoma.com - ', ab.affiliate_id)
        WHEN ab.activity_seller = 'EnRoma.com' AND ab.affiliate_id IS NULL THEN 
            'EnRoma.com - Direct'
        ELSE ab.activity_seller
    END,
    TO_CHAR(ab.start_date_time, 'YYYY-MM'),
    TO_CHAR(ab.start_date_time, 'YYYY-WW'),
    EXTRACT(YEAR FROM ab.start_date_time),
    EXTRACT(MONTH FROM ab.start_date_time),
    EXTRACT(WEEK FROM ab.start_date_time);

-- Grant permissions
GRANT SELECT ON finance_report_data TO authenticated;
GRANT SELECT ON finance_report_data TO anon;

-- Test the view
SELECT 
    seller_group,
    COUNT(*) as records,
    SUM(reservation_count) as total_reservations,
    SUM(total_revenue) as total_revenue
FROM finance_report_data
WHERE activity_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY seller_group;