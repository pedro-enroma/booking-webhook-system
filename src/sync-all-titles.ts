#!/usr/bin/env npx ts-node
import { supabase } from './config/supabase';

async function syncAllTitles(dryRun: boolean = true) {
  console.log('🔄 SYNC ALL ACTIVITY TITLES');
  console.log('=' .repeat(80));
  console.log(`Mode: ${dryRun ? '🔍 DRY RUN' : '✍️  LIVE UPDATE'}`);
  console.log('=' .repeat(80));

  // Get all activities
  const { data: activities } = await supabase
    .from('activities')
    .select('activity_id, title');

  const titleMap = new Map<string, string>();
  activities?.forEach(a => {
    titleMap.set(a.activity_id.toString(), a.title);
  });

  console.log(`\n✅ Loaded ${titleMap.size} activities\n`);

  // Fetch ALL bookings in batches
  let allBookings: any[] = [];
  let offset = 0;
  const batchSize = 1000;
  let hasMore = true;

  console.log('📊 Fetching all activity_bookings...');

  while (hasMore) {
    const { data, error } = await supabase
      .from('activity_bookings')
      .select('activity_booking_id, activity_id, product_title')
      .range(offset, offset + batchSize - 1)
      .order('activity_booking_id', { ascending: true });

    if (error) {
      console.error('❌ Error:', error);
      break;
    }

    if (data && data.length > 0) {
      allBookings = allBookings.concat(data);
      console.log(`  Fetched ${allBookings.length} bookings...`);
      offset += batchSize;
      hasMore = data.length === batchSize;
    } else {
      hasMore = false;
    }
  }

  console.log(`\n✅ Total bookings fetched: ${allBookings.length}\n`);

  // Find mismatches
  const toUpdate: Array<{
    activity_booking_id: number;
    activity_id: string;
    current: string;
    expected: string;
  }> = [];

  allBookings.forEach(booking => {
    const activityId = booking.activity_id?.toString();
    if (!activityId) return;

    const expectedTitle = titleMap.get(activityId);
    if (!expectedTitle) return;

    if (booking.product_title !== expectedTitle) {
      toUpdate.push({
        activity_booking_id: booking.activity_booking_id,
        activity_id: activityId,
        current: booking.product_title || 'NULL',
        expected: expectedTitle
      });
    }
  });

  console.log('📊 RESULTS:');
  console.log(`  Total bookings: ${allBookings.length}`);
  console.log(`  Need update: ${toUpdate.length}`);
  console.log(`  Already correct: ${allBookings.length - toUpdate.length}\n`);

  if (toUpdate.length === 0) {
    console.log('✅ All titles are correct!');
    return;
  }

  // Show sample
  console.log('Sample (first 5):');
  toUpdate.slice(0, 5).forEach((u, i) => {
    console.log(`  ${i + 1}. ${u.activity_booking_id}: "${u.current}" → "${u.expected}"`);
  });

  if (dryRun) {
    console.log('\n🔍 DRY RUN - No changes made');
    console.log('Run with --live to update');
    return;
  }

  // Update
  console.log('\n✍️  Updating...\n');
  let success = 0;
  let errors = 0;

  for (let i = 0; i < toUpdate.length; i++) {
    const update = toUpdate[i];

    const { error } = await supabase
      .from('activity_bookings')
      .update({ product_title: update.expected })
      .eq('activity_booking_id', update.activity_booking_id);

    if (error) {
      errors++;
    } else {
      success++;
    }

    if ((i + 1) % 100 === 0 || i === toUpdate.length - 1) {
      console.log(`  Progress: ${i + 1}/${toUpdate.length} (${success} ✅, ${errors} ❌)`);
    }
  }

  console.log(`\n✅ Completed: ${success} updated, ${errors} errors`);
}

const isLive = process.argv.includes('--live');
syncAllTitles(!isLive)
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
