import { supabase } from './config/supabase';
import * as fs from 'fs';
import * as readline from 'readline';
import dotenv from 'dotenv';

dotenv.config();

async function updateFromCorrectCSV() {
  console.log('\n📂 Processing correct CSV file for IMPORTED status update...\n');

  try {
    const csvPath = '/Users/pedromartinezsaro/Desktop/booking-webhook-system/activity_bookings_rows IMPORTED RIGHT.csv';

    // Use Set to store unique activity_booking_ids
    const activityBookingIds = new Set<number>();

    // Create read stream for large file
    const fileStream = fs.createReadStream(csvPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let lineCount = 0;
    let isFirstLine = true;

    console.log('📖 Reading CSV file...');

    // Process line by line
    for await (const line of rl) {
      if (isFirstLine) {
        isFirstLine = false;
        continue; // Skip header
      }

      const columns = line.split(';');
      if (columns.length >= 3) {
        const activityBookingId = parseInt(columns[2]);
        if (activityBookingId && !isNaN(activityBookingId)) {
          activityBookingIds.add(activityBookingId);
        }
      }

      lineCount++;
      if (lineCount % 10000 === 0) {
        process.stdout.write(`\r  Processed ${lineCount} rows...`);
      }
    }

    console.log(`\n✅ Finished reading CSV: ${lineCount} total rows`);
    console.log(`📊 Found ${activityBookingIds.size} unique activity_booking_ids\n`);

    // Convert Set to Array
    const idsArray = Array.from(activityBookingIds);

    // Process in batches (Supabase has limits on IN clause)
    const batchSize = 500;
    const totalBatches = Math.ceil(idsArray.length / batchSize);
    let totalUpdated = 0;

    console.log(`🔄 Updating in ${totalBatches} batches of ${batchSize} records each...\n`);

    for (let i = 0; i < totalBatches; i++) {
      const start = i * batchSize;
      const end = Math.min(start + batchSize, idsArray.length);
      const batchIds = idsArray.slice(start, end);

      console.log(`  Batch ${i + 1}/${totalBatches}: Updating ${batchIds.length} records...`);

      const { data, error } = await supabase
        .from('activity_bookings')
        .update({ status: 'IMPORTED' })
        .in('activity_booking_id', batchIds)
        .select();

      if (error) {
        console.error(`    ❌ Error in batch ${i + 1}:`, error.message);
      } else {
        const updated = data?.length || 0;
        totalUpdated += updated;
        console.log(`    ✅ Updated ${updated} records`);
      }
    }

    console.log(`\n✅ Successfully updated ${totalUpdated} records to IMPORTED status`);

    // Verify the update
    console.log('\n🔍 Verification check...');

    const { count: importedCount } = await supabase
      .from('activity_bookings')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'IMPORTED');

    console.log(`  Total records with IMPORTED status: ${importedCount || 0}`);

    // Sample verification
    const sampleIds = idsArray.slice(0, 5);
    const { data: sampleData } = await supabase
      .from('activity_bookings')
      .select('activity_booking_id, status, product_title')
      .in('activity_booking_id', sampleIds);

    if (sampleData && sampleData.length > 0) {
      console.log('\n  Sample of updated records:');
      sampleData.forEach(record => {
        console.log(`    ID ${record.activity_booking_id}: ${record.status} - ${record.product_title}`);
      });
    }

  } catch (error) {
    console.error('\n❌ Error processing CSV:', error);
  }
}

// Run the update
if (require.main === module) {
  updateFromCorrectCSV()
    .then(() => {
      console.log('\n🏁 CSV import complete!');
      process.exit(0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}