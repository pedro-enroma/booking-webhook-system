import { supabase } from './config/supabase';

async function findLastMissingCustomer() {
  console.log('🔍 Finding Last Activity Booking Without Customer Relationship');
  console.log('=' .repeat(70));
  
  try {
    // Get all activity_bookings ordered by created_at descending
    console.log('\n📊 SCANNING ACTIVITY BOOKINGS FOR MISSING CUSTOMERS...\n');
    
    const { data: activityBookings, error: abError } = await supabase
      .from('activity_bookings')
      .select('booking_id, activity_booking_id, product_title, start_date_time, created_at, status, affiliate_id')
      .order('created_at', { ascending: false });
    
    if (abError) {
      console.error('❌ Error fetching activity_bookings:', abError);
      return;
    }
    
    console.log(`✅ Found ${activityBookings?.length || 0} total activity bookings`);
    
    // Get all booking_customers
    const { data: bookingCustomers, error: bcError } = await supabase
      .from('booking_customers')
      .select('booking_id');
    
    if (bcError) {
      console.error('❌ Error fetching booking_customers:', bcError);
      return;
    }
    
    const bookingsWithCustomers = new Set(bookingCustomers?.map(bc => bc.booking_id));
    console.log(`✅ Found ${bookingsWithCustomers.size} bookings with customer relationships\n`);
    
    // Find activity_bookings without customer relationships
    const bookingsWithoutCustomers = activityBookings?.filter(
      ab => !bookingsWithCustomers.has(ab.booking_id)
    );
    
    console.log(`⚠️  Found ${bookingsWithoutCustomers?.length || 0} activity bookings without customer data\n`);
    
    if (bookingsWithoutCustomers && bookingsWithoutCustomers.length > 0) {
      // Get the most recent one (first in the list since we ordered by created_at desc)
      const mostRecent = bookingsWithoutCustomers[0];
      const oldestMissing = bookingsWithoutCustomers[bookingsWithoutCustomers.length - 1];
      
      console.log('=' .repeat(70));
      console.log('📅 MOST RECENT BOOKING WITHOUT CUSTOMER DATA');
      console.log('=' .repeat(70));
      console.log(`\nBooking ID: ${mostRecent.booking_id}`);
      console.log(`Activity Booking ID: ${mostRecent.activity_booking_id}`);
      console.log(`Product: ${mostRecent.product_title}`);
      console.log(`Status: ${mostRecent.status}`);
      console.log(`Start Date: ${new Date(mostRecent.start_date_time).toLocaleString()}`);
      console.log(`Created At: ${new Date(mostRecent.created_at).toLocaleString()}`);
      console.log(`Affiliate ID: ${mostRecent.affiliate_id || 'none'}`);
      
      // Calculate how old this booking is
      const daysSinceCreated = Math.floor(
        (Date.now() - new Date(mostRecent.created_at).getTime()) / (1000 * 60 * 60 * 24)
      );
      console.log(`\n📊 This booking was created ${daysSinceCreated} days ago`);
      
      // Find the first booking WITH customer data after this date
      const bookingsWithCustomersAfter = activityBookings?.filter(
        ab => bookingsWithCustomers.has(ab.booking_id) && 
              new Date(ab.created_at) > new Date(mostRecent.created_at)
      );
      
      if (bookingsWithCustomersAfter && bookingsWithCustomersAfter.length > 0) {
        const firstFixed = bookingsWithCustomersAfter[bookingsWithCustomersAfter.length - 1];
        console.log('\n✅ ISSUE WAS FIXED!');
        console.log(`First booking WITH customer data after the issue:`);
        console.log(`  Booking ID: ${firstFixed.booking_id}`);
        console.log(`  Created: ${new Date(firstFixed.created_at).toLocaleString()}`);
        console.log(`  Product: ${firstFixed.product_title}`);
        
        console.log(`\n📅 Timeline:`);
        console.log(`  Last problematic booking: ${new Date(mostRecent.created_at).toLocaleString()}`);
        console.log(`  First working booking: ${new Date(firstFixed.created_at).toLocaleString()}`);
        console.log(`  Issue was fixed around: ${new Date(firstFixed.created_at).toLocaleDateString()}`);
      }
      
      // Show statistics
      console.log('\n' + '=' .repeat(70));
      console.log('📊 STATISTICS');
      console.log('=' .repeat(70));
      
      // Group by date
      const byDate: Record<string, number> = {};
      bookingsWithoutCustomers.forEach(b => {
        const date = new Date(b.created_at).toLocaleDateString();
        byDate[date] = (byDate[date] || 0) + 1;
      });
      
      console.log('\nBookings without customers by date:');
      Object.entries(byDate)
        .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
        .slice(0, 10)
        .forEach(([date, count]) => {
          console.log(`  ${date}: ${count} bookings`);
        });
      
      // Show oldest missing
      console.log('\n' + '=' .repeat(70));
      console.log('📅 OLDEST BOOKING WITHOUT CUSTOMER DATA');
      console.log('=' .repeat(70));
      console.log(`\nBooking ID: ${oldestMissing.booking_id}`);
      console.log(`Product: ${oldestMissing.product_title}`);
      console.log(`Created At: ${new Date(oldestMissing.created_at).toLocaleString()}`);
      
      // Check if these bookings exist in main bookings table
      console.log('\n' + '=' .repeat(70));
      console.log('🔍 CHECKING IF THESE BOOKINGS EXIST IN MAIN TABLE');
      console.log('=' .repeat(70));
      
      const missingBookingIds = bookingsWithoutCustomers.map(b => b.booking_id);
      const { data: mainBookings } = await supabase
        .from('bookings')
        .select('booking_id, confirmation_code, status')
        .in('booking_id', missingBookingIds.slice(0, 20)); // Check first 20
      
      if (mainBookings && mainBookings.length > 0) {
        console.log(`\n✅ Found ${mainBookings.length} of these bookings in main bookings table`);
        console.log('These bookings exist but lack customer relationships - they can be fixed!');
      } else {
        console.log('\n❌ None of these bookings exist in the main bookings table');
        console.log('These might be orphaned activity_bookings records');
      }
      
    } else {
      console.log('✅ EXCELLENT! All activity bookings have customer relationships!');
      console.log('No missing customer data found.');
    }
    
    // Summary
    console.log('\n' + '=' .repeat(70));
    console.log('📋 SUMMARY');
    console.log('=' .repeat(70));
    
    if (bookingsWithoutCustomers && bookingsWithoutCustomers.length > 0) {
      console.log(`\n⚠️  Total activity bookings without customers: ${bookingsWithoutCustomers.length}`);
      console.log('📅 Date range of problematic bookings:');
      console.log(`  Oldest: ${new Date(bookingsWithoutCustomers[bookingsWithoutCustomers.length - 1].created_at).toLocaleString()}`);
      console.log(`  Newest: ${new Date(bookingsWithoutCustomers[0].created_at).toLocaleString()}`);
      
      // Provide SQL to identify and potentially fix
      console.log('\n💡 SQL TO IDENTIFY THESE BOOKINGS:');
      console.log('=' .repeat(70));
      console.log(`
SELECT ab.booking_id, ab.activity_booking_id, ab.product_title, ab.created_at
FROM activity_bookings ab
LEFT JOIN booking_customers bc ON ab.booking_id = bc.booking_id
WHERE bc.booking_id IS NULL
ORDER BY ab.created_at DESC
LIMIT 10;
      `);
      
      console.log('\n💡 SQL TO CHECK IF FIXABLE (exist in bookings table):');
      console.log('=' .repeat(70));
      console.log(`
SELECT ab.booking_id, b.confirmation_code, ab.product_title, ab.created_at
FROM activity_bookings ab
INNER JOIN bookings b ON ab.booking_id = b.booking_id
LEFT JOIN booking_customers bc ON ab.booking_id = bc.booking_id
WHERE bc.booking_id IS NULL
ORDER BY ab.created_at DESC;
      `);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the check
findLastMissingCustomer().catch(console.error);