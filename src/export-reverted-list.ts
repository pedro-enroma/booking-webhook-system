import { supabase } from './config/supabase';
import * as fs from 'fs';

async function exportRevertedRecords() {
  console.log('Fetching all CONFIRMED records with sellers...');
  console.log('(These are the records that were reverted from CANCELLED)');
  console.log('');

  let allRecords: any[] = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('activity_bookings')
      .select('activity_booking_id, booking_id, product_title, start_date_time, activity_seller, status')
      .eq('status', 'CONFIRMED')
      .not('activity_seller', 'is', null)
      .range(page * pageSize, (page + 1) * pageSize - 1)
      .order('activity_booking_id', { ascending: true });

    if (error) {
      console.error('Error on page ' + page + ':', error);
      break;
    }
    if (!data || data.length === 0) break;

    allRecords = allRecords.concat(data);
    console.log('  Fetched page ' + (page + 1) + ': ' + data.length + ' records');
    page++;

    if (page > 20) {
      console.log('  Safety limit reached');
      break;
    }
  }

  console.log('');
  console.log('Total CONFIRMED with seller: ' + allRecords.length);

  // Export to JSON
  fs.writeFileSync('reverted-bookings-list.json', JSON.stringify(allRecords, null, 2));
  console.log('Exported to: reverted-bookings-list.json');

  // Export to CSV
  const csvHeader = 'activity_booking_id,booking_id,product_title,start_date_time,activity_seller';
  const csvRows = allRecords.map(r => {
    const title = (r.product_title || '').replace(/"/g, '""').replace(/,/g, ' ');
    const seller = (r.activity_seller || '').replace(/"/g, '""');
    return [
      r.activity_booking_id,
      r.booking_id,
      '"' + title + '"',
      r.start_date_time,
      '"' + seller + '"'
    ].join(',');
  });

  fs.writeFileSync('reverted-bookings-list.csv', csvHeader + '\n' + csvRows.join('\n'));
  console.log('Exported to: reverted-bookings-list.csv');

  // Show first 100 IDs
  console.log('');
  console.log('First 100 activity_booking_ids:');
  console.log('─'.repeat(60));

  const first100 = allRecords.slice(0, 100);
  for (let i = 0; i < first100.length; i += 5) {
    const row = first100.slice(i, i + 5).map(r => r.activity_booking_id.toString().padStart(10));
    console.log(row.join('  '));
  }

  console.log('');
  console.log('Last 100 activity_booking_ids:');
  console.log('─'.repeat(60));

  const last100 = allRecords.slice(-100);
  for (let i = 0; i < last100.length; i += 5) {
    const row = last100.slice(i, i + 5).map(r => r.activity_booking_id.toString().padStart(10));
    console.log(row.join('  '));
  }
}

exportRevertedRecords()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
