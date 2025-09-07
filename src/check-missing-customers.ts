import { supabase } from './config/supabase';

async function checkMissingCustomers() {
  console.log('🔍 Checking for Bookings Without Customer Data');
  console.log('=' .repeat(70));
  
  try {
    // ============================================
    // 1. Find booking_ids in activity_bookings but NOT in booking_customers
    // ============================================
    console.log('\n📊 FINDING BOOKINGS WITHOUT CUSTOMER RELATIONSHIPS...\n');
    
    // Get all unique booking_ids from activity_bookings
    const { data: activityBookings, error: abError } = await supabase
      .from('activity_bookings')
      .select('booking_id, activity_booking_id, product_title, start_date_time, total_price, status')
      .order('booking_id', { ascending: false });
    
    if (abError) {
      console.error('❌ Error fetching activity_bookings:', abError);
      return;
    }
    
    // Get all booking_ids that have customer relationships
    const { data: bookingCustomers, error: bcError } = await supabase
      .from('booking_customers')
      .select('booking_id');
    
    if (bcError) {
      console.error('❌ Error fetching booking_customers:', bcError);
      return;
    }
    
    // Create a Set of booking_ids that have customers
    const bookingsWithCustomers = new Set(bookingCustomers?.map(bc => bc.booking_id));
    
    // Find unique booking_ids from activity_bookings
    const uniqueActivityBookingIds = [...new Set(activityBookings?.map(ab => ab.booking_id))];
    
    // Find booking_ids that don't have customer relationships
    const bookingsWithoutCustomers = uniqueActivityBookingIds.filter(
      bookingId => !bookingsWithCustomers.has(bookingId)
    );
    
    console.log(`📈 Total unique bookings in activity_bookings: ${uniqueActivityBookingIds.length}`);
    console.log(`📈 Bookings with customer data: ${bookingsWithCustomers.size}`);
    console.log(`⚠️  Bookings WITHOUT customer data: ${bookingsWithoutCustomers.length}`);
    
    if (bookingsWithoutCustomers.length > 0) {
      console.log('\n' + '=' .repeat(70));
      console.log('📋 BOOKINGS WITHOUT CUSTOMER DATA (First 20)');
      console.log('=' .repeat(70));
      
      // Get details for these bookings
      const missingDetails = activityBookings
        ?.filter(ab => bookingsWithoutCustomers.includes(ab.booking_id))
        .slice(0, 20);
      
      missingDetails?.forEach(booking => {
        console.log(`\nBooking ID: ${booking.booking_id}`);
        console.log(`  - Activity: ${booking.product_title}`);
        console.log(`  - Date: ${new Date(booking.start_date_time).toLocaleDateString()}`);
        console.log(`  - Price: €${booking.total_price}`);
        console.log(`  - Status: ${booking.status}`);
      });
    }
    
    // ============================================
    // 2. Check if these bookings exist in bookings table
    // ============================================
    console.log('\n' + '=' .repeat(70));
    console.log('📊 CHECKING IF THESE BOOKINGS EXIST IN MAIN BOOKINGS TABLE...\n');
    
    if (bookingsWithoutCustomers.length > 0) {
      const { data: mainBookings, error: mainError } = await supabase
        .from('bookings')
        .select('booking_id, confirmation_code, status, creation_date')
        .in('booking_id', bookingsWithoutCustomers.slice(0, 10)); // Check first 10
      
      if (mainError) {
        console.error('❌ Error checking main bookings:', mainError);
      } else {
        console.log(`Found ${mainBookings?.length || 0} of these bookings in main bookings table`);
        
        if (mainBookings && mainBookings.length > 0) {
          console.log('\n⚠️  These bookings exist but have no customer data:');
          mainBookings.forEach(booking => {
            console.log(`  - ${booking.booking_id}: ${booking.confirmation_code} (${booking.status})`);
          });
        }
        
        // Find which bookings don't exist at all
        const foundBookingIds = new Set(mainBookings?.map(b => b.booking_id));
        const completelyMissing = bookingsWithoutCustomers.filter(
          id => !foundBookingIds.has(id)
        );
        
        if (completelyMissing.length > 0) {
          console.log(`\n❌ ${completelyMissing.length} bookings don't exist in main bookings table at all!`);
          console.log('First 10:', completelyMissing.slice(0, 10).join(', '));
        }
      }
    }
    
    // ============================================
    // 3. Statistical Analysis
    // ============================================
    console.log('\n' + '=' .repeat(70));
    console.log('📊 STATISTICAL ANALYSIS');
    console.log('=' .repeat(70));
    
    // Group by status
    const statusCounts: Record<string, number> = {};
    activityBookings
      ?.filter(ab => bookingsWithoutCustomers.includes(ab.booking_id))
      .forEach(booking => {
        statusCounts[booking.status] = (statusCounts[booking.status] || 0) + 1;
      });
    
    console.log('\nBookings without customers by status:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  - ${status}: ${count}`);
    });
    
    // Group by date range
    const now = new Date();
    const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    
    let recent = 0, medium = 0, old = 0;
    
    activityBookings
      ?.filter(ab => bookingsWithoutCustomers.includes(ab.booking_id))
      .forEach(booking => {
        const bookingDate = new Date(booking.start_date_time);
        if (bookingDate > oneMonthAgo) recent++;
        else if (bookingDate > threeMonthsAgo) medium++;
        else old++;
      });
    
    console.log('\nBookings without customers by age:');
    console.log(`  - Last month: ${recent}`);
    console.log(`  - 1-3 months ago: ${medium}`);
    console.log(`  - Older than 3 months: ${old}`);
    
    // ============================================
    // 4. SQL Queries to Fix
    // ============================================
    console.log('\n' + '=' .repeat(70));
    console.log('🔧 SQL QUERIES TO INVESTIGATE AND FIX');
    console.log('=' .repeat(70));
    
    console.log('\n-- Find all bookings without customer data:');
    console.log(`SELECT DISTINCT ab.booking_id, ab.product_title, ab.start_date_time, ab.status
FROM activity_bookings ab
LEFT JOIN booking_customers bc ON ab.booking_id = bc.booking_id
WHERE bc.booking_id IS NULL
ORDER BY ab.start_date_time DESC
LIMIT 50;`);
    
    console.log('\n-- Check if these bookings exist in main table:');
    console.log(`SELECT b.*, 
  EXISTS(SELECT 1 FROM booking_customers bc WHERE bc.booking_id = b.booking_id) as has_customer
FROM bookings b
WHERE b.booking_id IN (
  SELECT DISTINCT booking_id 
  FROM activity_bookings 
  WHERE booking_id NOT IN (SELECT booking_id FROM booking_customers)
)
LIMIT 20;`);
    
    console.log('\n-- Find recent bookings without customers (last 7 days):');
    console.log(`SELECT ab.booking_id, ab.product_title, ab.start_date_time, ab.total_price
FROM activity_bookings ab
WHERE ab.booking_id NOT IN (SELECT booking_id FROM booking_customers)
  AND ab.start_date_time > NOW() - INTERVAL '7 days'
ORDER BY ab.start_date_time DESC;`);
    
    console.log('\n-- Count by month:');
    console.log(`SELECT 
  DATE_TRUNC('month', ab.start_date_time) as month,
  COUNT(DISTINCT ab.booking_id) as bookings_without_customers
FROM activity_bookings ab
WHERE ab.booking_id NOT IN (SELECT booking_id FROM booking_customers)
GROUP BY DATE_TRUNC('month', ab.start_date_time)
ORDER BY month DESC;`);
    
    // ============================================
    // 5. Summary
    // ============================================
    console.log('\n' + '=' .repeat(70));
    console.log('📋 SUMMARY');
    console.log('=' .repeat(70));
    
    const percentageWithoutCustomers = ((bookingsWithoutCustomers.length / uniqueActivityBookingIds.length) * 100).toFixed(2);
    
    console.log(`\n📊 ${bookingsWithoutCustomers.length} out of ${uniqueActivityBookingIds.length} bookings (${percentageWithoutCustomers}%) don't have customer data`);
    
    if (bookingsWithoutCustomers.length > 0) {
      console.log('\n⚠️  ACTION REQUIRED:');
      console.log('1. These bookings may be missing customer data from the webhook');
      console.log('2. Check if the Bokun webhook is properly sending customer data');
      console.log('3. You may need to manually import customer data for these bookings');
      console.log('4. Recent bookings without customers might indicate a current issue');
      
      if (recent > 0) {
        console.log('\n🚨 URGENT: Found ' + recent + ' bookings from the last month without customer data!');
        console.log('   This might indicate a current problem with the webhook.');
      }
    } else {
      console.log('\n✅ Great! All bookings have associated customer data.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the check
checkMissingCustomers().catch(console.error);