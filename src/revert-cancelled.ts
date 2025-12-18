import { supabase } from './config/supabase';

async function revertRemainingRecords() {
  console.log('='.repeat(60));
  console.log('REVERTING REMAINING AFFECTED RECORDS');
  console.log('='.repeat(60));

  // Preview IDs from the accident - these were shown as being changed
  const previewIds = [100836608, 104685768, 104777648, 104950447, 115207891];

  // Check their current status
  const { data: previewData } = await supabase
    .from('activity_bookings')
    .select('activity_booking_id, status, activity_seller')
    .in('activity_booking_id', previewIds);

  console.log('Preview IDs current status:');
  previewData?.forEach(r => {
    console.log('  ' + r.activity_booking_id + ': ' + r.status + ' | seller: ' + (r.activity_seller || 'NULL'));
  });

  // Get ALL cancelled records by paginating
  console.log('');
  console.log('Fetching all CANCELLED records...');

  let allCancelled: any[] = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('activity_bookings')
      .select('activity_booking_id, activity_seller')
      .eq('status', 'CANCELLED')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('Error fetching page ' + page + ':', error);
      break;
    }
    if (!data || data.length === 0) break;

    allCancelled = allCancelled.concat(data);
    console.log('  Fetched page ' + (page + 1) + ': ' + data.length + ' records');
    page++;
  }

  console.log('Total CANCELLED records:', allCancelled.length);

  // ALL CANCELLED records with NULL seller are legitimate old cancellations
  // Records with sellers were CONFIRMED before the accident
  const withoutSeller = allCancelled.filter(r => r.activity_seller === null);
  const withSeller = allCancelled.filter(r => r.activity_seller !== null);

  console.log('');
  console.log('WITHOUT seller (legitimate old cancellations):', withoutSeller.length);
  console.log('WITH seller (affected by accident):', withSeller.length);

  // Revert ALL remaining CANCELLED records that have a seller
  if (withSeller.length > 0) {
    console.log('');
    console.log('Reverting ' + withSeller.length + ' records to CONFIRMED...');

    const idsToRevert = withSeller.map(r => r.activity_booking_id);
    const batchSize = 500;
    let reverted = 0;

    for (let i = 0; i < idsToRevert.length; i += batchSize) {
      const batch = idsToRevert.slice(i, i + batchSize);

      const { error: updateError, data: updated } = await supabase
        .from('activity_bookings')
        .update({ status: 'CONFIRMED' })
        .in('activity_booking_id', batch)
        .select('activity_booking_id');

      if (updateError) {
        console.error('Error updating batch:', updateError);
        continue;
      }

      reverted += updated?.length || 0;
      console.log('  Batch ' + Math.floor(i / batchSize + 1) + ': reverted ' + (updated?.length || 0) + ' records');
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('REVERT COMPLETE: ' + reverted + ' records changed to CONFIRMED');
    console.log('='.repeat(60));
  } else {
    console.log('');
    console.log('No more records to revert.');
  }

  // Final verification
  const { count: finalCancelled } = await supabase
    .from('activity_bookings')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'CANCELLED');

  const { count: finalConfirmed } = await supabase
    .from('activity_bookings')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'CONFIRMED');

  console.log('');
  console.log('FINAL STATE:');
  console.log('  CANCELLED:', finalCancelled);
  console.log('  CONFIRMED:', finalConfirmed);

  // Verify preview IDs are now CONFIRMED
  const { data: verifyPreview } = await supabase
    .from('activity_bookings')
    .select('activity_booking_id, status')
    .in('activity_booking_id', previewIds);

  console.log('');
  console.log('Preview IDs after revert:');
  verifyPreview?.forEach(r => {
    console.log('  ' + r.activity_booking_id + ': ' + r.status);
  });
}

revertRemainingRecords()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
