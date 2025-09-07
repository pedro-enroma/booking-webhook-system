import { supabase } from './config/supabase';

async function monitorWebhookHealth() {
  console.log('🏥 Webhook System Health Check');
  console.log('=' .repeat(70));
  console.log(`📅 Check Date: ${new Date().toLocaleString()}\n`);
  
  const issues: string[] = [];
  const warnings: string[] = [];
  
  try {
    // 1. Check recent bookings for customer relationships
    console.log('🔍 CHECKING RECENT BOOKINGS...\n');
    
    const { data: recentBookings, error: bookingsError } = await supabase
      .from('activity_bookings')
      .select('booking_id, activity_booking_id, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (bookingsError) {
      issues.push(`Cannot fetch recent bookings: ${bookingsError.message}`);
    } else if (recentBookings) {
      const uniqueBookingIds = [...new Set(recentBookings.map(b => b.booking_id))];
      
      // Check which have customer relationships
      const { data: bookingCustomers } = await supabase
        .from('booking_customers')
        .select('booking_id')
        .in('booking_id', uniqueBookingIds);
      
      const bookingsWithCustomers = new Set(bookingCustomers?.map(bc => bc.booking_id));
      const bookingsWithoutCustomers = uniqueBookingIds.filter(id => !bookingsWithCustomers.has(id));
      
      console.log(`📊 Last 50 activity bookings:`);
      console.log(`   - Unique booking IDs: ${uniqueBookingIds.length}`);
      console.log(`   - With customer data: ${bookingsWithCustomers.size}`);
      console.log(`   - Missing customer data: ${bookingsWithoutCustomers.length}`);
      
      if (bookingsWithoutCustomers.length > 0) {
        // Check how recent these are
        const mostRecentMissing = recentBookings
          .filter(b => bookingsWithoutCustomers.includes(b.booking_id))
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
        
        const hoursSince = (Date.now() - new Date(mostRecentMissing.created_at).getTime()) / (1000 * 60 * 60);
        
        if (hoursSince < 24) {
          issues.push(`🚨 Bookings created in last 24 hours are missing customer data!`);
        } else if (hoursSince < 72) {
          warnings.push(`⚠️ Bookings from ${Math.floor(hoursSince)} hours ago are missing customer data`);
        }
      }
    }
    
    // 2. Check affiliate data integration
    console.log('\n🔍 CHECKING GTM/AFFILIATE INTEGRATION...\n');
    
    const { data: recentWithAffiliates } = await supabase
      .from('activity_bookings')
      .select('booking_id, affiliate_id, first_campaign, created_at')
      .not('affiliate_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (recentWithAffiliates && recentWithAffiliates.length > 0) {
      const mostRecent = recentWithAffiliates[0];
      const daysSince = (Date.now() - new Date(mostRecent.created_at).getTime()) / (1000 * 60 * 60 * 24);
      
      console.log(`📊 Affiliate data status:`);
      console.log(`   - Last affiliate update: ${new Date(mostRecent.created_at).toLocaleString()}`);
      console.log(`   - Days since last update: ${daysSince.toFixed(1)}`);
      console.log(`   - Recent affiliates: ${[...new Set(recentWithAffiliates.map(r => r.affiliate_id))].join(', ')}`);
      
      if (daysSince > 7) {
        warnings.push(`⚠️ No affiliate data received in ${daysSince.toFixed(0)} days`);
      }
    } else {
      warnings.push('⚠️ No affiliate data found in recent bookings');
    }
    
    // 3. Check booking creation rate
    console.log('\n🔍 CHECKING BOOKING CREATION RATE...\n');
    
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    const { count: dailyCount } = await supabase
      .from('activity_bookings')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', oneDayAgo);
    
    const { count: weeklyCount } = await supabase
      .from('activity_bookings')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', oneWeekAgo);
    
    console.log(`📊 Booking creation rate:`);
    console.log(`   - Last 24 hours: ${dailyCount || 0} bookings`);
    console.log(`   - Last 7 days: ${weeklyCount || 0} bookings`);
    console.log(`   - Daily average: ${((weeklyCount || 0) / 7).toFixed(1)} bookings/day`);
    
    if (dailyCount === 0) {
      issues.push('🚨 No bookings created in the last 24 hours!');
    } else if ((dailyCount || 0) < ((weeklyCount || 0) / 7) * 0.5) {
      warnings.push('⚠️ Booking rate is 50% below weekly average');
    }
    
    // 4. Check for duplicate bookings
    console.log('\n🔍 CHECKING FOR DUPLICATES...\n');
    
    const { data: duplicateCheck } = await supabase
      .from('activity_bookings')
      .select('activity_booking_id')
      .limit(1000);
    
    if (duplicateCheck) {
      const bookingIds = duplicateCheck.map(d => d.activity_booking_id);
      const uniqueIds = new Set(bookingIds);
      const duplicates = bookingIds.length - uniqueIds.size;
      
      console.log(`📊 Duplicate check (last 1000):`);
      console.log(`   - Total records: ${bookingIds.length}`);
      console.log(`   - Unique bookings: ${uniqueIds.size}`);
      console.log(`   - Duplicates: ${duplicates}`);
      
      if (duplicates > 0) {
        issues.push(`🚨 Found ${duplicates} duplicate activity bookings!`);
      }
    }
    
    // 5. Check data integrity
    console.log('\n🔍 CHECKING DATA INTEGRITY...\n');
    
    // Bookings without main booking record
    const { count: orphanedActivities } = await supabase
      .from('activity_bookings')
      .select('*', { count: 'exact', head: true })
      .not('booking_id', 'in', 
        `(SELECT DISTINCT booking_id FROM bookings)`
      );
    
    // Customers without any bookings
    const { count: orphanedCustomers } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .not('customer_id', 'in',
        `(SELECT DISTINCT customer_id FROM booking_customers)`
      );
    
    console.log(`📊 Data integrity:`);
    console.log(`   - Activity bookings without main booking: ${orphanedActivities || 0}`);
    console.log(`   - Customers without bookings: ${orphanedCustomers || 0}`);
    
    if ((orphanedActivities || 0) > 10) {
      warnings.push(`⚠️ ${orphanedActivities} activity bookings lack main booking records`);
    }
    
    // SUMMARY
    console.log('\n' + '=' .repeat(70));
    console.log('📋 HEALTH CHECK SUMMARY');
    console.log('=' .repeat(70));
    
    if (issues.length === 0 && warnings.length === 0) {
      console.log('\n✅ SYSTEM HEALTHY: All checks passed!');
      console.log('   Webhook integration is functioning normally.');
    } else {
      if (issues.length > 0) {
        console.log('\n❌ CRITICAL ISSUES:');
        issues.forEach(issue => console.log(`   ${issue}`));
      }
      
      if (warnings.length > 0) {
        console.log('\n⚠️  WARNINGS:');
        warnings.forEach(warning => console.log(`   ${warning}`));
      }
      
      console.log('\n💡 RECOMMENDED ACTIONS:');
      if (issues.some(i => i.includes('24 hours'))) {
        console.log('   1. Check webhook endpoint status in Railway logs');
        console.log('   2. Verify Bokun webhook configuration');
        console.log('   3. Check for any recent deployment issues');
      }
      if (warnings.some(w => w.includes('affiliate'))) {
        console.log('   1. Verify GTM webhook is configured correctly');
        console.log('   2. Check GTM server container is running');
        console.log('   3. Review affiliate tracking implementation');
      }
    }
    
    // Generate status code for monitoring
    const statusCode = issues.length > 0 ? 2 : (warnings.length > 0 ? 1 : 0);
    console.log(`\n📊 Status Code: ${statusCode} (0=Healthy, 1=Warning, 2=Critical)`);
    
    return statusCode;
    
  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error);
    return 3;
  }
}

// Run the health check
monitorWebhookHealth()
  .then(statusCode => {
    console.log(`\n🏁 Health check completed with status: ${statusCode}`);
    process.exit(statusCode);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(3);
  });