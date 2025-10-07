import { supabase } from './config/supabase';

async function analyzeMissingAgents() {
  console.log('\n📊 Analyzing activity_bookings for missing/incorrect agent data...\n');

  try {
    // 1. Count total bookings
    const { count: totalCount, error: totalError } = await supabase
      .from('activity_bookings')
      .select('*', { count: 'exact', head: true });

    if (totalError) throw totalError;
    console.log(`📈 Total activity bookings: ${totalCount}`);

    // 2. Count bookings with NULL activity_seller
    const { count: nullCount, error: nullError } = await supabase
      .from('activity_bookings')
      .select('*', { count: 'exact', head: true })
      .is('activity_seller', null);

    if (nullError) throw nullError;
    console.log(`❌ Bookings with NULL activity_seller: ${nullCount}`);

    // 3. Count bookings with default 'EnRoma.com'
    const { count: defaultCount, error: defaultError } = await supabase
      .from('activity_bookings')
      .select('*', { count: 'exact', head: true })
      .eq('activity_seller', 'EnRoma.com');

    if (defaultError) throw defaultError;
    console.log(`🏢 Bookings with 'EnRoma.com': ${defaultCount}`);

    // 4. Count bookings with agent names (not NULL and not 'EnRoma.com')
    const { count: agentCount, error: agentError } = await supabase
      .from('activity_bookings')
      .select('*', { count: 'exact', head: true })
      .not('activity_seller', 'is', null)
      .not('activity_seller', 'eq', 'EnRoma.com');

    if (agentError) throw agentError;
    console.log(`👥 Bookings with agent names: ${agentCount}`);

    // 5. Check if we have webhook_logs table to retrieve agent data
    console.log('\n🔍 Checking webhook_logs table...');
    const { data: webhookSample, error: webhookError } = await supabase
      .from('webhook_logs')
      .select('*')
      .limit(1);

    if (webhookError) {
      console.log('⚠️  webhook_logs table not accessible:', webhookError.message);
    } else {
      const { count: webhookCount, error: webhookCountError } = await supabase
        .from('webhook_logs')
        .select('*', { count: 'exact', head: true });

      if (!webhookCountError) {
        console.log(`📝 Total webhook logs available: ${webhookCount}`);
      }
    }

    // 6. Sample some bookings with NULL or default seller
    console.log('\n📋 Sample of bookings needing updates:');
    const { data: sampleBookings, error: sampleError } = await supabase
      .from('activity_bookings')
      .select('activity_booking_id, booking_id, product_title, activity_seller, start_date_time')
      .or('activity_seller.is.null,activity_seller.eq.EnRoma.com')
      .order('start_date_time', { ascending: false })
      .limit(10);

    if (sampleError) throw sampleError;

    if (sampleBookings && sampleBookings.length > 0) {
      console.table(sampleBookings);
    } else {
      console.log('✅ No bookings need updates!');
    }

    // 7. Check if we can find agent info in bookings table
    console.log('\n🔗 Checking if bookings table has related data...');
    const { data: bookingWithWebhook, error: bookingError } = await supabase
      .from('bookings')
      .select('booking_id')
      .limit(1)
      .single();

    if (!bookingError && bookingWithWebhook) {
      console.log('✅ bookings table is accessible');
    }

    console.log('\n' + '='.repeat(60));
    console.log('💡 Summary:');
    console.log(`   - ${nullCount || 0} bookings need agent data (NULL)`);
    console.log(`   - ${defaultCount || 0} bookings have default 'EnRoma.com' (may need updating)`);
    console.log(`   - Potential bookings to update: ${(nullCount || 0) + (defaultCount || 0)}`);
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('❌ Error analyzing data:', error);
    throw error;
  }
}

analyzeMissingAgents()
  .then(() => {
    console.log('✅ Analysis complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Analysis failed:', error);
    process.exit(1);
  });
