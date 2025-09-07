import { supabase } from '../config/supabase';

async function updateMaterializedView() {
  console.log('🚀 Updating activity_bookings_participants_mv with affiliate columns...');
  console.log('=' .repeat(70));
  
  try {
    // Step 1: Check if the materialized view exists
    console.log('📊 Checking current materialized view structure...');
    
    const { data: currentColumns, error: checkError } = await supabase
      .rpc('get_mv_columns', { mv_name: 'activity_bookings_participants_mv' })
      .single();
    
    if (checkError && !checkError.message.includes('function')) {
      console.log('ℹ️ Could not check current structure, proceeding with update...');
    }
    
    // Step 2: Drop the existing materialized view
    console.log('🗑️ Dropping existing materialized view...');
    
    const dropQuery = `DROP MATERIALIZED VIEW IF EXISTS activity_bookings_participants_mv CASCADE;`;
    
    // Note: Direct SQL execution might not work with Supabase client
    // You may need to run this directly in Supabase SQL Editor
    
    console.log('\n⚠️ IMPORTANT: Run the following SQL directly in Supabase SQL Editor:\n');
    console.log('=' .repeat(70));
    console.log(dropQuery);
    console.log('=' .repeat(70));
    
    // Step 3: Show the CREATE statement
    const createQuery = `
CREATE MATERIALIZED VIEW activity_bookings_participants_mv AS
SELECT 
    ab.booking_id,
    ab.activity_booking_id,
    ab.product_id,
    ab.activity_id,
    ab.product_title,
    ab.product_confirmation_code,
    ab.start_date_time,
    ab.end_date_time,
    ab.status,
    ab.total_price,
    ab.rate_id,
    ab.rate_title,
    ab.start_time,
    ab.date_string,
    ab.activity_seller,
    ab.affiliate_id,        -- NEW COLUMN
    ab.first_campaign,       -- NEW COLUMN
    ab.created_at AS activity_created_at,
    
    -- Booking information
    b.confirmation_code AS booking_confirmation_code,
    b.external_booking_reference,
    b.status AS booking_status,
    b.currency,
    b.total_price AS booking_total_price,
    b.total_paid,
    b.total_due,
    b.payment_type,
    b.language,
    b.creation_date AS booking_creation_date,
    
    -- Customer information
    c.customer_id,
    c.uuid AS customer_uuid,
    c.email AS customer_email,
    c.first_name AS customer_first_name,
    c.last_name AS customer_last_name,
    c.phone_number AS customer_phone,
    
    -- Participant information
    pcb.pricing_category_booking_id,
    pcb.pricing_category_id,
    pcb.booked_title,
    pcb.age AS participant_age,
    pcb.quantity AS participant_quantity,
    pcb.occupancy AS participant_occupancy,
    pcb.passenger_first_name,
    pcb.passenger_last_name,
    pcb.passenger_date_of_birth,
    
    -- Activity/Product information
    a.title AS activity_title,
    a.description AS activity_description,
    a.duration_amount,
    a.duration_unit,
    a.price_currency AS activity_currency,
    a.price_amount AS activity_price,
    a.instant_confirmation,
    a.instant_delivery,
    a.requires_date,
    a.requires_time,
    
    -- Seller information
    s.seller_id,
    s.title AS seller_title,
    s.email AS seller_email,
    s.phone_number AS seller_phone,
    s.currency_code AS seller_currency,
    s.country_code AS seller_country,
    s.website AS seller_website
    
FROM activity_bookings ab
LEFT JOIN bookings b ON ab.booking_id = b.booking_id
LEFT JOIN booking_customers bc ON b.booking_id = bc.booking_id
LEFT JOIN customers c ON bc.customer_id = c.customer_id
LEFT JOIN pricing_category_bookings pcb ON ab.activity_booking_id = pcb.activity_booking_id
LEFT JOIN activities a ON ab.activity_id = a.activity_id
LEFT JOIN sellers s ON b.seller_id = s.seller_id
ORDER BY ab.start_date_time DESC, ab.activity_booking_id, pcb.pricing_category_booking_id;`;
    
    console.log('\n📝 Then create the new materialized view:\n');
    console.log('=' .repeat(70));
    console.log(createQuery);
    console.log('=' .repeat(70));
    
    // Step 4: Show index creation
    const indexQueries = `
-- Create indexes for better performance
CREATE INDEX idx_mv_booking_id ON activity_bookings_participants_mv(booking_id);
CREATE INDEX idx_mv_activity_booking_id ON activity_bookings_participants_mv(activity_booking_id);
CREATE INDEX idx_mv_start_date_time ON activity_bookings_participants_mv(start_date_time);
CREATE INDEX idx_mv_customer_email ON activity_bookings_participants_mv(customer_email);
CREATE INDEX idx_mv_affiliate_id ON activity_bookings_participants_mv(affiliate_id);
CREATE INDEX idx_mv_first_campaign ON activity_bookings_participants_mv(first_campaign);
CREATE INDEX idx_mv_status ON activity_bookings_participants_mv(status);

-- Grant permissions
GRANT SELECT ON activity_bookings_participants_mv TO authenticated;
GRANT SELECT ON activity_bookings_participants_mv TO anon;

-- Refresh the view
REFRESH MATERIALIZED VIEW activity_bookings_participants_mv;`;
    
    console.log('\n🔧 Then create indexes and refresh:\n');
    console.log('=' .repeat(70));
    console.log(indexQueries);
    console.log('=' .repeat(70));
    
    // Step 5: Test query
    console.log('\n🧪 After running the SQL, test with this query:\n');
    console.log('=' .repeat(70));
    console.log(`
SELECT 
    booking_id,
    activity_booking_id,
    product_title,
    affiliate_id,
    first_campaign,
    customer_email
FROM activity_bookings_participants_mv
WHERE affiliate_id IS NOT NULL
LIMIT 10;`);
    console.log('=' .repeat(70));
    
    // Step 6: Verification
    console.log('\n✅ To verify the columns were added:\n');
    console.log('=' .repeat(70));
    console.log(`
SELECT 
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'activity_bookings_participants_mv'
AND column_name IN ('affiliate_id', 'first_campaign')
ORDER BY ordinal_position;`);
    console.log('=' .repeat(70));
    
    // Try to verify if we can query the view (this will fail if view doesn't exist yet)
    console.log('\n🔍 Checking if we can query existing data with affiliate info...');
    
    const { data: sampleData, error: sampleError } = await supabase
      .from('activity_bookings')
      .select('booking_id, affiliate_id, first_campaign')
      .not('affiliate_id', 'is', null)
      .limit(5);
    
    if (sampleData && sampleData.length > 0) {
      console.log('\n📊 Sample bookings with affiliate data:');
      sampleData.forEach(row => {
        console.log(`  - Booking ${row.booking_id}: ${row.affiliate_id} / ${row.first_campaign || '(no campaign)'}`);
      });
    }
    
    console.log('\n' + '=' .repeat(70));
    console.log('📌 NEXT STEPS:');
    console.log('1. Copy the SQL statements above');
    console.log('2. Go to Supabase SQL Editor');
    console.log('3. Run each section in order');
    console.log('4. Verify the view is working with the test query');
    console.log('=' .repeat(70));
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the update
updateMaterializedView().catch(console.error);