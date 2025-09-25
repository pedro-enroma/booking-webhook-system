import { supabase } from './config/supabase';
import dotenv from 'dotenv';

dotenv.config();

async function inspectActivityBookingsTable() {
  console.log('\n🔍 Inspecting activity_bookings table in Supabase...\n');

  try {
    // 1. Get sample records to understand structure
    console.log('📊 Fetching sample records...');
    const { data: sampleRecords, error: sampleError } = await supabase
      .from('activity_bookings')
      .select('*')
      .limit(3);

    if (sampleError) {
      console.error('❌ Error fetching sample records:', sampleError);
      return;
    }

    if (sampleRecords && sampleRecords.length > 0) {
      console.log('\n📋 Table columns found:');
      const columns = Object.keys(sampleRecords[0]);
      columns.forEach(col => {
        const sampleValue = sampleRecords[0][col];
        const valueType = sampleValue === null ? 'null' : typeof sampleValue;
        console.log(`   - ${col}: ${valueType}${sampleValue !== null ? ` (example: ${JSON.stringify(sampleValue).substring(0, 50)}...)` : ''}`);
      });

      console.log('\n📄 Sample records:');
      sampleRecords.forEach((record, idx) => {
        console.log(`\n   Record ${idx + 1}:`);
        console.log(`   - activity_booking_id: ${record.activity_booking_id}`);
        console.log(`   - booking_id: ${record.booking_id}`);
        console.log(`   - status: ${record.status}`);
        console.log(`   - product_title: ${record.product_title}`);
        console.log(`   - start_date_time: ${record.start_date_time}`);
        console.log(`   - total_price: ${record.total_price}`);
        console.log(`   - activity_seller: ${record.activity_seller}`);
      });
    }

    // 2. Get status distribution
    console.log('\n\n📈 Status distribution in activity_bookings:');
    const { data: statusData, error: statusError } = await supabase
      .from('activity_bookings')
      .select('status');

    if (!statusError && statusData) {
      const statusCounts: Record<string, number> = {};
      statusData.forEach(record => {
        const status = record.status || 'NULL';
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      });

      Object.entries(statusCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([status, count]) => {
          const percentage = ((count / statusData.length) * 100).toFixed(2);
          console.log(`   - ${status}: ${count} records (${percentage}%)`);
        });

      console.log(`\n   Total records: ${statusData.length}`);
    }

    // 3. Check for related tables
    console.log('\n\n🔗 Checking related tables...');

    // Check bookings table
    const { data: bookingsSample, error: bookingsError } = await supabase
      .from('bookings')
      .select('*')
      .limit(1);

    if (!bookingsError && bookingsSample) {
      console.log('   ✓ bookings table exists');
      console.log(`     Columns: ${Object.keys(bookingsSample[0] || {}).join(', ')}`);
    }

    // Check customers table
    const { data: customersSample, error: customersError } = await supabase
      .from('customers')
      .select('*')
      .limit(1);

    if (!customersError && customersSample) {
      console.log('   ✓ customers table exists');
      console.log(`     Columns: ${Object.keys(customersSample[0] || {}).join(', ')}`);
    }

    // Check booking_customers relationship table
    const { data: bookingCustomersSample, error: bcError } = await supabase
      .from('booking_customers')
      .select('*')
      .limit(1);

    if (!bcError && bookingCustomersSample) {
      console.log('   ✓ booking_customers table exists (relationship table)');
      console.log(`     Columns: ${Object.keys(bookingCustomersSample[0] || {}).join(', ')}`);
    }

    // 4. Check recent activity
    console.log('\n\n📅 Recent activity in activity_bookings:');
    const { data: recentRecords, error: recentError } = await supabase
      .from('activity_bookings')
      .select('activity_booking_id, status, created_at, updated_at, start_date_time, product_title')
      .order('created_at', { ascending: false })
      .limit(5);

    if (!recentError && recentRecords) {
      console.log('   Latest bookings:');
      recentRecords.forEach(record => {
        console.log(`   - ID ${record.activity_booking_id}: ${record.product_title}`);
        console.log(`     Status: ${record.status}, Created: ${record.created_at}, Activity Date: ${record.start_date_time}`);
      });
    }

    // 5. Check for any constraints or special fields
    console.log('\n\n🔒 Checking data integrity...');

    // Check for null statuses
    const { data: nullStatusData, error: nullStatusError, count: nullCount } = await supabase
      .from('activity_bookings')
      .select('*', { count: 'exact', head: true })
      .is('status', null);

    console.log(`   - Records with NULL status: ${nullCount || 0}`);

    // Check for unique activity_booking_id
    const { data: duplicateCheck, error: dupError } = await supabase
      .rpc('check_duplicate_activity_booking_ids', {});

    if (dupError) {
      // If the RPC doesn't exist, do a manual check
      const { data: allIds } = await supabase
        .from('activity_bookings')
        .select('activity_booking_id');

      if (allIds) {
        const idCounts: Record<string, number> = {};
        allIds.forEach(record => {
          const id = String(record.activity_booking_id);
          idCounts[id] = (idCounts[id] || 0) + 1;
        });
        const duplicates = Object.entries(idCounts).filter(([_, count]) => count > 1);
        console.log(`   - Duplicate activity_booking_ids: ${duplicates.length > 0 ? duplicates.map(d => d[0]).join(', ') : 'None'}`);
      }
    }

    console.log('\n✅ Inspection complete!\n');

  } catch (error) {
    console.error('\n❌ Error during inspection:', error);
  }
}

// Run the inspection
inspectActivityBookingsTable()
  .then(() => {
    console.log('🏁 Script finished');
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });