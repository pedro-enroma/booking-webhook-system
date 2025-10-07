import { supabase } from './config/supabase';

/**
 * This script updates activity_bookings with agent information from webhook_logs
 * It looks for bookings where activity_seller is NULL or 'EnRoma.com'
 * and tries to find the correct agent from the original webhook data
 */

async function updateMissingAgents() {
  console.log('\n🔄 Starting update of missing agent data...\n');

  try {
    // Step 1: Get bookings that need updating
    console.log('📋 Fetching bookings with missing agent data...');
    const { data: bookingsToUpdate, error: fetchError } = await supabase
      .from('activity_bookings')
      .select('activity_booking_id, booking_id, product_title, activity_seller')
      .or('activity_seller.is.null,activity_seller.eq.EnRoma.com')
      .limit(1000); // Process in batches

    if (fetchError) throw fetchError;

    if (!bookingsToUpdate || bookingsToUpdate.length === 0) {
      console.log('✅ No bookings need updates!');
      return;
    }

    console.log(`📊 Found ${bookingsToUpdate.length} bookings to check\n`);

    let updatedCount = 0;
    let notFoundCount = 0;

    // Step 2: For each booking, try to find agent data from webhook_logs
    for (const booking of bookingsToUpdate) {
      try {
        // Look for webhook log with this activity_booking_id
        const { data: webhookLogs, error: webhookError } = await supabase
          .from('webhook_logs')
          .select('payload')
          .or(`payload->bookingId.eq.${booking.activity_booking_id}`)
          .order('received_at', { ascending: false })
          .limit(1);

        if (webhookError) {
          console.log(`⚠️  Could not fetch webhook for booking ${booking.activity_booking_id}`);
          continue;
        }

        if (webhookLogs && webhookLogs.length > 0) {
          const payload = webhookLogs[0].payload as any;

          // Check for agent in payload
          const agentTitle = payload.agent?.title || payload.parentBooking?.agent?.title;

          if (agentTitle && agentTitle !== 'EnRoma.com') {
            // Update the booking with the agent title
            const { error: updateError } = await supabase
              .from('activity_bookings')
              .update({ activity_seller: agentTitle })
              .eq('activity_booking_id', booking.activity_booking_id);

            if (updateError) {
              console.log(`❌ Failed to update booking ${booking.activity_booking_id}:`, updateError.message);
            } else {
              console.log(`✅ Updated booking ${booking.activity_booking_id}: ${booking.product_title} → ${agentTitle}`);
              updatedCount++;
            }
          } else {
            notFoundCount++;
          }
        } else {
          notFoundCount++;
        }

        // Small delay to avoid overwhelming the database
        await new Promise(resolve => setTimeout(resolve, 50));

      } catch (error: any) {
        console.log(`❌ Error processing booking ${booking.activity_booking_id}:`, error.message);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Update Summary:');
    console.log(`   ✅ Successfully updated: ${updatedCount} bookings`);
    console.log(`   ⚠️  No agent data found: ${notFoundCount} bookings`);
    console.log(`   📝 Total processed: ${bookingsToUpdate.length} bookings`);
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('❌ Error updating bookings:', error);
    throw error;
  }
}

// Run the update
updateMissingAgents()
  .then(() => {
    console.log('✅ Update complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Update failed:', error);
    process.exit(1);
  });
