import { supabase } from './config/supabase';

async function checkTableRelationships() {
  console.log('🔍 Checking Table Relationships and Data Integrity');
  console.log('=' .repeat(70));
  
  const issues: string[] = [];
  const warnings: string[] = [];
  
  try {
    // ============================================
    // 1. CHECK CUSTOMERS TABLE
    // ============================================
    console.log('\n📊 CHECKING CUSTOMERS TABLE...');
    
    const { data: customers, error: customersError } = await supabase
      .from('customers')
      .select('*')
      .limit(5);
    
    if (customersError) {
      issues.push(`❌ Error accessing customers table: ${customersError.message}`);
    } else {
      console.log(`✅ Customers table accessible - Sample count: ${customers?.length || 0}`);
      
      // Check for duplicates
      const { data: duplicateCustomers } = await supabase
        .from('customers')
        .select('customer_id, email')
        .limit(1000);
      
      if (duplicateCustomers) {
        const emailCounts = duplicateCustomers.reduce((acc: any, c) => {
          acc[c.email] = (acc[c.email] || 0) + 1;
          return acc;
        }, {});
        
        const duplicateEmails = Object.entries(emailCounts)
          .filter(([_, count]: any) => count > 1)
          .map(([email, count]) => `${email} (${count} times)`);
        
        if (duplicateEmails.length > 0) {
          warnings.push(`⚠️ Duplicate emails found: ${duplicateEmails.slice(0, 5).join(', ')}`);
        }
      }
    }
    
    // Get total customers count
    const { count: customerCount } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true });
    
    console.log(`📈 Total customers: ${customerCount || 0}`);
    
    // ============================================
    // 2. CHECK BOOKING_CUSTOMERS TABLE (Junction)
    // ============================================
    console.log('\n📊 CHECKING BOOKING_CUSTOMERS TABLE...');
    
    const { data: bookingCustomers, error: bcError } = await supabase
      .from('booking_customers')
      .select('*')
      .limit(5);
    
    if (bcError) {
      issues.push(`❌ Error accessing booking_customers table: ${bcError.message}`);
    } else {
      console.log(`✅ Booking_customers table accessible - Sample count: ${bookingCustomers?.length || 0}`);
    }
    
    // Check for orphaned records (skip if RPC doesn't exist)
    try {
      const { data: orphanedBC } = await supabase.rpc('check_orphaned_booking_customers', {});
      
      if (orphanedBC && orphanedBC.length > 0) {
        warnings.push(`⚠️ Found ${orphanedBC.length} orphaned booking_customer records`);
      }
    } catch (rpcError) {
      // RPC function might not exist, skip this check
      console.log('   (Skipping orphaned records check - RPC function not available)');
    }
    
    // Get total relationships count
    const { count: bcCount } = await supabase
      .from('booking_customers')
      .select('*', { count: 'exact', head: true });
    
    console.log(`📈 Total booking-customer relationships: ${bcCount || 0}`);
    
    // ============================================
    // 3. CHECK ACTIVITY_BOOKINGS TABLE
    // ============================================
    console.log('\n📊 CHECKING ACTIVITY_BOOKINGS TABLE...');
    
    const { data: activityBookings, error: abError } = await supabase
      .from('activity_bookings')
      .select('*')
      .limit(5);
    
    if (abError) {
      issues.push(`❌ Error accessing activity_bookings table: ${abError.message}`);
    } else {
      console.log(`✅ Activity_bookings table accessible - Sample count: ${activityBookings?.length || 0}`);
    }
    
    // Check affiliate data
    const { data: affiliateData } = await supabase
      .from('activity_bookings')
      .select('affiliate_id, first_campaign')
      .not('affiliate_id', 'is', null)
      .limit(10);
    
    console.log(`📊 Activity bookings with affiliate data: ${affiliateData?.length || 0}`);
    
    // Get total activity bookings count
    const { count: abCount } = await supabase
      .from('activity_bookings')
      .select('*', { count: 'exact', head: true });
    
    console.log(`📈 Total activity bookings: ${abCount || 0}`);
    
    // ============================================
    // 4. CHECK RELATIONSHIPS
    // ============================================
    console.log('\n🔗 CHECKING RELATIONSHIPS...');
    
    // Test 1: Bookings with customers
    const { data: bookingsWithCustomers } = await supabase
      .from('bookings')
      .select(`
        booking_id,
        confirmation_code,
        booking_customers!inner(
          customer_id,
          customers!inner(
            email,
            first_name,
            last_name
          )
        )
      `)
      .limit(5);
    
    if (bookingsWithCustomers && bookingsWithCustomers.length > 0) {
      console.log(`✅ Bookings → Customers relationship working`);
      console.log(`   Sample: Booking ${bookingsWithCustomers[0].booking_id} has customer data`);
    } else {
      warnings.push('⚠️ No bookings found with customer relationships');
    }
    
    // Test 2: Activity bookings with booking data
    const { data: activitiesWithBookings } = await supabase
      .from('activity_bookings')
      .select(`
        activity_booking_id,
        booking_id,
        product_title,
        affiliate_id,
        first_campaign,
        bookings!inner(
          confirmation_code,
          status
        )
      `)
      .not('affiliate_id', 'is', null)
      .limit(5);
    
    if (activitiesWithBookings && activitiesWithBookings.length > 0) {
      console.log(`✅ Activity_bookings → Bookings relationship working`);
      console.log(`   Sample: Activity ${activitiesWithBookings[0].activity_booking_id} linked to booking ${activitiesWithBookings[0].booking_id}`);
    } else {
      warnings.push('⚠️ No activity bookings found with booking relationships');
    }
    
    // Test 3: Full chain - Activity → Booking → Customer
    const { data: fullChain } = await supabase
      .from('activity_bookings')
      .select(`
        activity_booking_id,
        product_title,
        affiliate_id,
        bookings!inner(
          booking_id,
          confirmation_code,
          booking_customers!inner(
            customers!inner(
              email,
              first_name
            )
          )
        )
      `)
      .limit(3);
    
    if (fullChain && fullChain.length > 0) {
      console.log(`✅ Full chain working: Activity → Booking → Customer`);
      const sample: any = fullChain[0];
      console.log(`   Example chain:`);
      console.log(`   - Activity: ${sample.product_title}`);
      console.log(`   - Booking: ${(sample.bookings as any)?.confirmation_code}`);
      console.log(`   - Customer: ${(sample.bookings as any)?.booking_customers?.[0]?.customers?.email}`);
    } else {
      issues.push('❌ Full relationship chain not working properly');
    }
    
    // ============================================
    // 5. CHECK DATA QUALITY
    // ============================================
    console.log('\n📊 CHECKING DATA QUALITY...');
    
    // Check for bookings without customers
    const { count: bookingsWithoutCustomers } = await supabase
      .from('bookings')
      .select('booking_id', { count: 'exact', head: true })
      .not('booking_id', 'in', 
        `(SELECT DISTINCT booking_id FROM booking_customers)`
      );
    
    if (bookingsWithoutCustomers && bookingsWithoutCustomers > 0) {
      warnings.push(`⚠️ ${bookingsWithoutCustomers} bookings without customer data`);
    }
    
    // Check for activity bookings without main bookings
    const { count: orphanedActivities } = await supabase
      .from('activity_bookings')
      .select('activity_booking_id', { count: 'exact', head: true })
      .not('booking_id', 'in',
        `(SELECT DISTINCT booking_id FROM bookings)`
      );
    
    if (orphanedActivities && orphanedActivities > 0) {
      warnings.push(`⚠️ ${orphanedActivities} activity bookings without main booking`);
    }
    
    // Check affiliate data completeness
    const { data: affiliateStats } = await supabase
      .from('activity_bookings')
      .select('affiliate_id')
      .not('affiliate_id', 'is', null);
    
    const { count: totalActivities } = await supabase
      .from('activity_bookings')
      .select('*', { count: 'exact', head: true });
    
    if (affiliateStats && totalActivities) {
      const percentage = ((affiliateStats.length / totalActivities) * 100).toFixed(1);
      console.log(`📊 ${percentage}% of activity bookings have affiliate data`);
    }
    
    // ============================================
    // 6. TEST QUERIES FOR COMMON OPERATIONS
    // ============================================
    console.log('\n🧪 TESTING COMMON QUERIES...');
    
    // Query 1: Get recent bookings with all details
    const { data: recentBookings, error: recentError } = await supabase
      .from('activity_bookings')
      .select(`
        activity_booking_id,
        product_title,
        start_date_time,
        affiliate_id,
        first_campaign,
        total_price
      `)
      .order('start_date_time', { ascending: false })
      .limit(5);
    
    if (recentError) {
      issues.push(`❌ Cannot fetch recent bookings: ${recentError.message}`);
    } else {
      console.log(`✅ Can fetch recent bookings (found ${recentBookings?.length || 0})`);
    }
    
    // Query 2: Affiliate performance
    const { data: affiliatePerf, error: affError } = await supabase
      .from('activity_bookings')
      .select('affiliate_id')
      .not('affiliate_id', 'is', null);
    
    if (affError) {
      issues.push(`❌ Cannot query affiliate data: ${affError.message}`);
    } else {
      // Count by affiliate
      const affiliateCounts = affiliatePerf.reduce((acc: any, row) => {
        acc[row.affiliate_id] = (acc[row.affiliate_id] || 0) + 1;
        return acc;
      }, {});
      
      console.log('✅ Affiliate data accessible:');
      Object.entries(affiliateCounts)
        .sort((a: any, b: any) => b[1] - a[1])
        .slice(0, 5)
        .forEach(([affiliate, count]) => {
          console.log(`   - ${affiliate}: ${count} bookings`);
        });
    }
    
    // ============================================
    // 7. SUMMARY
    // ============================================
    console.log('\n' + '=' .repeat(70));
    console.log('📋 SUMMARY');
    console.log('=' .repeat(70));
    
    console.log('\n📊 Database Statistics:');
    console.log(`  - Total Customers: ${customerCount || 0}`);
    console.log(`  - Total Bookings (via relationships): ${bcCount || 0}`);
    console.log(`  - Total Activity Bookings: ${abCount || 0}`);
    console.log(`  - Activity Bookings with Affiliate Data: ${affiliateStats?.length || 0}`);
    
    if (issues.length === 0 && warnings.length === 0) {
      console.log('\n✅ All tables and relationships are working correctly!');
    } else {
      if (issues.length > 0) {
        console.log('\n❌ CRITICAL ISSUES FOUND:');
        issues.forEach(issue => console.log(`  ${issue}`));
      }
      
      if (warnings.length > 0) {
        console.log('\n⚠️ WARNINGS:');
        warnings.forEach(warning => console.log(`  ${warning}`));
      }
    }
    
    // ============================================
    // 8. RECOMMENDED SQL TO FIX ISSUES
    // ============================================
    if (issues.length > 0 || warnings.length > 0) {
      console.log('\n💡 RECOMMENDED FIXES:');
      console.log('=' .repeat(70));
      
      console.log('\n-- Check for orphaned booking_customers:');
      console.log(`SELECT bc.* FROM booking_customers bc
LEFT JOIN bookings b ON bc.booking_id = b.booking_id
WHERE b.booking_id IS NULL;`);
      
      console.log('\n-- Check for orphaned activity_bookings:');
      console.log(`SELECT ab.* FROM activity_bookings ab
LEFT JOIN bookings b ON ab.booking_id = b.booking_id
WHERE b.booking_id IS NULL;`);
      
      console.log('\n-- Find bookings without customers:');
      console.log(`SELECT b.* FROM bookings b
LEFT JOIN booking_customers bc ON b.booking_id = bc.booking_id
WHERE bc.booking_id IS NULL;`);
    }
    
  } catch (error) {
    console.error('\n❌ CRITICAL ERROR:', error);
  }
}

// Run the check
checkTableRelationships().catch(console.error);