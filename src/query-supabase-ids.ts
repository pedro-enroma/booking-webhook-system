import { supabase } from './config/supabase';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

async function querySupabaseForIds() {
  console.log('\n🔍 Checking activity_booking_ids in Supabase...\n');

  try {
    // Read the IDs file
    const idsPath = path.join(__dirname, '..', 'activity_booking_ids.json');
    const detailsPath = path.join(__dirname, '..', 'activity_booking_details.json');

    const activityBookingIds: number[] = JSON.parse(fs.readFileSync(idsPath, 'utf-8'));
    const details: any[] = JSON.parse(fs.readFileSync(detailsPath, 'utf-8'));

    console.log(`📊 Total IDs to check: ${activityBookingIds.length}\n`);

    // Query in smaller batches
    const BATCH_SIZE = 50;
    const foundRecords: any[] = [];

    for (let i = 0; i < activityBookingIds.length; i += BATCH_SIZE) {
      const batch = activityBookingIds.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(activityBookingIds.length / BATCH_SIZE);

      process.stdout.write(`   Batch ${batchNum}/${totalBatches}...`);

      try {
        const { data, error } = await supabase
          .from('activity_bookings')
          .select('activity_booking_id, booking_id, product_title, status')
          .in('activity_booking_id', batch);

        if (error) {
          console.error(`\n   ❌ Error in batch ${batchNum}:`, error.message);
          continue;
        }

        if (data) {
          foundRecords.push(...data);
          process.stdout.write(` found ${data.length}\n`);
        } else {
          process.stdout.write(` found 0\n`);
        }

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (err: any) {
        console.error(`\n   ❌ Exception in batch ${batchNum}:`, err.message);
      }
    }

    console.log(`\n✅ Query complete! Found ${foundRecords.length} records\n`);

    // Analysis
    const foundIds = new Set(foundRecords.map(r => r.activity_booking_id));
    const missingIds = activityBookingIds.filter(id => !foundIds.has(id));

    console.log('='.repeat(80));
    console.log('📊 RESULTS');
    console.log('='.repeat(80));
    console.log(`✅ Found in Supabase: ${foundIds.size} / ${activityBookingIds.length}`);
    console.log(`❌ Missing in Supabase: ${missingIds.length} / ${activityBookingIds.length}`);
    console.log('='.repeat(80));

    // Save results
    const results = {
      timestamp: new Date().toISOString(),
      total_checked: activityBookingIds.length,
      found_count: foundIds.size,
      missing_count: missingIds.length,
      found_ids: Array.from(foundIds),
      missing_ids: missingIds,
      found_records: foundRecords
    };

    const resultsPath = path.join(__dirname, '..', 'check-results.json');
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    console.log(`\n📄 Results saved to: ${resultsPath}`);

    if (missingIds.length > 0) {
      // Get details for missing IDs
      const missingDetails = details.filter(d => missingIds.includes(d.activity_booking_id));

      const missingPath = path.join(__dirname, '..', 'missing-activity-bookings.json');
      fs.writeFileSync(missingPath, JSON.stringify(missingDetails, null, 2));
      console.log(`📄 Missing records details saved to: ${missingPath}`);

      console.log(`\n❌ MISSING ACTIVITY_BOOKING_IDS (first 20):`);
      missingIds.slice(0, 20).forEach((id, idx) => {
        const detail = missingDetails.find(d => d.activity_booking_id === id);
        console.log(`\n${idx + 1}. ID: ${id}`);
        if (detail) {
          console.log(`   Code: ${detail.product_confirmation_code}`);
          console.log(`   Product: ${detail.product_title}`);
          console.log(`   Date: ${detail.start_date}`);
          console.log(`   Customer: ${detail.customer}`);
        }
      });

      if (missingIds.length > 20) {
        console.log(`\n... and ${missingIds.length - 20} more`);
      }
    } else {
      console.log(`\n🎉 All activity_booking_ids are present in Supabase!`);
    }

    console.log('\n✅ Check complete!\n');

  } catch (error) {
    console.error('\n❌ Error:', error);
    throw error;
  }
}

// Run
querySupabaseForIds()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
