import { supabase } from './config/supabase';

async function checkLast200Bookings() {
  console.log('🔍 Checking Last 200 Activity Bookings for Customer Relationships');
  console.log('=' .repeat(70));
  
  try {
    // Get last 200 activity_bookings
    console.log('\n📊 FETCHING LAST 200 ACTIVITY BOOKINGS...\n');
    
    const { data: activityBookings, error: abError } = await supabase
      .from('activity_bookings')
      .select('booking_id, activity_booking_id, product_title, start_date_time, total_price, status, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    
    if (abError) {
      console.error('❌ Error fetching activity_bookings:', abError);
      return;
    }
    
    console.log(`✅ Found ${activityBookings?.length || 0} recent activity bookings`);
    
    // Get unique booking_ids
    const uniqueBookingIds = [...new Set(activityBookings?.map(ab => ab.booking_id))];
    console.log(`📊 These represent ${uniqueBookingIds.length} unique booking_ids\n`);
    
    // Check which of these have entries in booking_customers
    console.log('🔍 CHECKING BOOKING_CUSTOMERS TABLE...\n');
    
    const { data: bookingCustomers, error: bcError } = await supabase
      .from('booking_customers')
      .select('booking_id, customer_id')
      .in('booking_id', uniqueBookingIds);
    
    if (bcError) {
      console.error('❌ Error fetching booking_customers:', bcError);
      return;
    }
    
    const bookingsWithCustomers = new Set(bookingCustomers?.map(bc => bc.booking_id));
    console.log(`✅ Found ${bookingsWithCustomers.size} bookings with customer relationships`);
    
    // Find which bookings are missing customer data
    const bookingsWithoutCustomers = uniqueBookingIds.filter(
      bookingId => !bookingsWithCustomers.has(bookingId)
    );
    
    console.log(`⚠️  ${bookingsWithoutCustomers.length} bookings WITHOUT customer relationships\n`);
    
    // Check if these booking_ids exist in main bookings table
    console.log('🔍 CHECKING MAIN BOOKINGS TABLE...\n');
    
    const { data: mainBookings, error: mainError } = await supabase
      .from('bookings')
      .select('booking_id, confirmation_code, status')
      .in('booking_id', uniqueBookingIds);
    
    if (mainError) {
      console.error('❌ Error fetching main bookings:', mainError);
      return;
    }
    
    const bookingsInMainTable = new Set(mainBookings?.map(b => b.booking_id));
    console.log(`✅ Found ${bookingsInMainTable.size} bookings in main bookings table`);
    
    // Analyze the missing relationships
    console.log('\n' + '=' .repeat(70));
    console.log('📊 DETAILED ANALYSIS');
    console.log('=' .repeat(70));
    
    // Show bookings that exist in all three tables
    const completeBookings = uniqueBookingIds.filter(
      id => bookingsWithCustomers.has(id) && bookingsInMainTable.has(id)
    );
    console.log(`\n✅ Complete chain (activity → booking → customer): ${completeBookings.length} bookings`);
    
    // Show bookings missing customer data
    const missingCustomerOnly = uniqueBookingIds.filter(
      id => !bookingsWithCustomers.has(id) && bookingsInMainTable.has(id)
    );
    console.log(`⚠️  Missing customer data only: ${missingCustomerOnly.length} bookings`);
    
    // Show bookings not in main table at all
    const notInMainTable = uniqueBookingIds.filter(
      id => !bookingsInMainTable.has(id)
    );
    console.log(`❌ Not in main bookings table: ${notInMainTable.length} bookings`);
    
    // Show first 10 problematic bookings
    if (bookingsWithoutCustomers.length > 0) {
      console.log('\n' + '=' .repeat(70));
      console.log('📋 SAMPLE BOOKINGS WITHOUT CUSTOMERS (First 10)');
      console.log('=' .repeat(70));
      
      const problemBookings = activityBookings
        ?.filter(ab => bookingsWithoutCustomers.includes(ab.booking_id))
        .slice(0, 10);
      
      for (const booking of problemBookings || []) {
        const inMainTable = bookingsInMainTable.has(booking.booking_id);
        const mainBooking = mainBookings?.find(b => b.booking_id === booking.booking_id);
        
        console.log(`\nBooking ID: ${booking.booking_id}`);
        console.log(`  Activity: ${booking.product_title}`);
        console.log(`  Date: ${new Date(booking.start_date_time).toLocaleDateString()}`);
        console.log(`  Created: ${new Date(booking.created_at).toLocaleString()}`);
        console.log(`  Status: ${booking.status}`);
        console.log(`  In Main Table: ${inMainTable ? `✅ Yes (${mainBooking?.confirmation_code})` : '❌ No'}`);
        console.log(`  Has Customer: ❌ No`);
      }
    }
    
    // Check customers table directly
    console.log('\n' + '=' .repeat(70));
    console.log('📊 CHECKING CUSTOMERS TABLE');
    console.log('=' .repeat(70));
    
    const { count: totalCustomers } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true });
    
    console.log(`\n📈 Total customers in database: ${totalCustomers || 0}`);
    
    // Get recent customers
    const { data: recentCustomers, error: custError } = await supabase
      .from('customers')
      .select('customer_id, email, created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (recentCustomers && recentCustomers.length > 0) {
      console.log('\n📅 Most recent customers:');
      recentCustomers.forEach(c => {
        console.log(`  - ${c.email} (Created: ${new Date(c.created_at).toLocaleString()})`);
      });
    }
    
    // Summary
    console.log('\n' + '=' .repeat(70));
    console.log('📋 SUMMARY');
    console.log('=' .repeat(70));
    
    const percentageComplete = ((completeBookings.length / uniqueBookingIds.length) * 100).toFixed(1);
    const percentageMissingCustomer = ((bookingsWithoutCustomers.length / uniqueBookingIds.length) * 100).toFixed(1);
    
    console.log(`\n📊 Out of ${uniqueBookingIds.length} recent unique bookings:`);
    console.log(`  ✅ ${completeBookings.length} (${percentageComplete}%) have complete data`);
    console.log(`  ⚠️  ${bookingsWithoutCustomers.length} (${percentageMissingCustomer}%) are missing customer data`);
    
    if (notInMainTable.length > 0) {
      console.log(`  ❌ ${notInMainTable.length} don't exist in main bookings table`);
    }
    
    if (bookingsWithoutCustomers.length > uniqueBookingIds.length * 0.5) {
      console.log('\n🚨 CRITICAL: More than 50% of recent bookings lack customer data!');
      console.log('   This indicates a systemic issue with customer data processing.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the check
checkLast200Bookings().catch(console.error);