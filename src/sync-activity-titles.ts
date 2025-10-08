#!/usr/bin/env npx ts-node
import { supabase } from './config/supabase';

async function syncActivityTitles(dryRun: boolean = true) {
  console.log('🔄 SYNC ACTIVITY TITLES FROM ACTIVITIES TABLE');
  console.log('=' .repeat(80));
  console.log(`Mode: ${dryRun ? '🔍 DRY RUN (no changes will be made)' : '✍️  LIVE UPDATE'}`);
  console.log('=' .repeat(80));

  try {
    // Step 1: Get all activities with their canonical titles
    console.log('\n📊 Step 1: Fetching activities table...');
    const { data: activities, error: activitiesError } = await supabase
      .from('activities')
      .select('activity_id, title')
      .order('activity_id', { ascending: true });

    if (activitiesError) {
      console.error('❌ Error fetching activities:', activitiesError);
      return;
    }

    console.log(`✅ Found ${activities?.length || 0} activities`);

    // Create a map for quick lookup
    const titleMap = new Map<string, string>();
    activities?.forEach(activity => {
      titleMap.set(activity.activity_id.toString(), activity.title);
    });

    // Step 2: Get all activity_bookings
    console.log('\n📊 Step 2: Fetching activity_bookings...');
    const { data: bookings, error: bookingsError } = await supabase
      .from('activity_bookings')
      .select('activity_booking_id, activity_id, product_title')
      .order('activity_booking_id', { ascending: true });

    if (bookingsError) {
      console.error('❌ Error fetching activity_bookings:', bookingsError);
      return;
    }

    console.log(`✅ Found ${bookings?.length || 0} activity_bookings`);

    // Step 3: Analyze differences
    console.log('\n📊 Step 3: Analyzing differences...');

    const toUpdate: Array<{
      activity_booking_id: number;
      activity_id: string;
      current_title: string;
      new_title: string;
    }> = [];

    const noActivityFound: Array<{
      activity_booking_id: number;
      activity_id: string;
      current_title: string;
    }> = [];

    bookings?.forEach(booking => {
      const activityId = booking.activity_id?.toString();
      if (!activityId) {
        console.warn(`⚠️ Booking ${booking.activity_booking_id} has no activity_id`);
        return;
      }

      const canonicalTitle = titleMap.get(activityId);

      if (!canonicalTitle) {
        noActivityFound.push({
          activity_booking_id: booking.activity_booking_id,
          activity_id: activityId,
          current_title: booking.product_title || 'NULL'
        });
        return;
      }

      // Check if title needs updating
      if (booking.product_title !== canonicalTitle) {
        toUpdate.push({
          activity_booking_id: booking.activity_booking_id,
          activity_id: activityId,
          current_title: booking.product_title || 'NULL',
          new_title: canonicalTitle
        });
      }
    });

    console.log('\n📊 ANALYSIS RESULTS:');
    console.log(`  Total bookings: ${bookings?.length || 0}`);
    console.log(`  Need update: ${toUpdate.length}`);
    console.log(`  Already correct: ${(bookings?.length || 0) - toUpdate.length - noActivityFound.length}`);
    console.log(`  No activity found: ${noActivityFound.length}`);

    // Show sample of updates needed
    if (toUpdate.length > 0) {
      console.log('\n📋 Sample of updates needed (first 10):');
      toUpdate.slice(0, 10).forEach((update, index) => {
        console.log(`\n  ${index + 1}. activity_booking_id: ${update.activity_booking_id}`);
        console.log(`     activity_id: ${update.activity_id}`);
        console.log(`     Current: "${update.current_title}"`);
        console.log(`     New: "${update.new_title}"`);
      });

      if (toUpdate.length > 10) {
        console.log(`\n  ... and ${toUpdate.length - 10} more`);
      }
    }

    // Show activities not found
    if (noActivityFound.length > 0) {
      console.log('\n⚠️  Bookings with no matching activity (first 5):');
      noActivityFound.slice(0, 5).forEach((item, index) => {
        console.log(`  ${index + 1}. activity_booking_id: ${item.activity_booking_id}, activity_id: ${item.activity_id}`);
      });

      if (noActivityFound.length > 5) {
        console.log(`  ... and ${noActivityFound.length - 5} more`);
      }
    }

    // Step 4: Perform updates
    if (toUpdate.length === 0) {
      console.log('\n✅ No updates needed! All titles are already correct.');
      return;
    }

    if (dryRun) {
      console.log('\n🔍 DRY RUN MODE - No changes made');
      console.log(`\nTo perform actual updates, run:`);
      console.log(`  npx ts-node src/sync-activity-titles.ts --live`);
      return;
    }

    // LIVE UPDATE MODE
    console.log('\n✍️  Step 4: Performing updates...');
    console.log('=' .repeat(80));

    let successCount = 0;
    let errorCount = 0;

    // Update in batches to avoid overwhelming the database
    const batchSize = 100;
    for (let i = 0; i < toUpdate.length; i += batchSize) {
      const batch = toUpdate.slice(i, i + batchSize);

      console.log(`\nBatch ${Math.floor(i / batchSize) + 1}/${Math.ceil(toUpdate.length / batchSize)}: Updating ${batch.length} records...`);

      for (const update of batch) {
        const { error } = await supabase
          .from('activity_bookings')
          .update({ product_title: update.new_title })
          .eq('activity_booking_id', update.activity_booking_id);

        if (error) {
          console.error(`  ❌ Failed to update ${update.activity_booking_id}:`, error.message);
          errorCount++;
        } else {
          successCount++;
        }
      }

      // Progress indicator
      console.log(`  Progress: ${successCount + errorCount}/${toUpdate.length} (${successCount} success, ${errorCount} errors)`);

      // Small delay between batches
      if (i + batchSize < toUpdate.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    console.log('\n=' .repeat(80));
    console.log('🎯 UPDATE COMPLETED');
    console.log('=' .repeat(80));
    console.log(`✅ Successfully updated: ${successCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📊 Total processed: ${successCount + errorCount}`);

    // Step 5: Verify updates
    if (successCount > 0) {
      console.log('\n📊 Verifying updates...');

      // Check a sample of updated records
      const sampleIds = toUpdate.slice(0, 5).map(u => u.activity_booking_id);
      const { data: verified } = await supabase
        .from('activity_bookings')
        .select('activity_booking_id, activity_id, product_title')
        .in('activity_booking_id', sampleIds);

      console.log('\n✅ Sample verification (first 5):');
      verified?.forEach((v, index) => {
        const original = toUpdate.find(u => u.activity_booking_id === v.activity_booking_id);
        const match = v.product_title === original?.new_title ? '✅' : '❌';
        console.log(`  ${match} ${v.activity_booking_id}: "${v.product_title}"`);
      });
    }

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    throw error;
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const isLive = args.includes('--live') || args.includes('-l');

syncActivityTitles(!isLive)
  .then(() => {
    console.log('\n✅ Script completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
