import { supabase } from './config/supabase';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

interface MissingRecord {
  activity_booking_id: number;
  product_confirmation_code: string;
  cart_confirmation_code: string;
  customer: string;
  email: string;
  product_id: string;
  product_title: string;
  start_date: string;
  status: string;
  total_price: number;
  currency: string;
  seller: string;
}

interface BookingLookup {
  cart_confirmation_code: string;
  booking_id: number | null;
}

async function createMissingActivityBookings(dryRun: boolean = true) {
  console.log('\n🔧 Creating Missing Activity Bookings in Supabase');
  console.log('='.repeat(80));
  console.log(`Mode: ${dryRun ? '🔍 DRY RUN (no changes)' : '✅ LIVE MODE (will insert records)'}`);
  console.log('='.repeat(80));

  try {
    // Read missing records
    const missingPath = path.join(__dirname, '..', 'missing-details.json');
    const missingRecords: MissingRecord[] = JSON.parse(fs.readFileSync(missingPath, 'utf-8'));

    console.log(`\n📊 Total missing records to process: ${missingRecords.length}\n`);

    // Step 1: Get unique cart confirmation codes
    const uniqueCartCodes = [...new Set(missingRecords.map(r => r.cart_confirmation_code))];
    console.log(`📋 Unique parent bookings (cart codes): ${uniqueCartCodes.length}\n`);

    // Step 2: Lookup booking_ids for all cart confirmation codes
    console.log('🔍 Looking up booking_ids from Supabase...');
    const bookingLookup = new Map<string, number>();

    const BATCH_SIZE = 50;
    for (let i = 0; i < uniqueCartCodes.length; i += BATCH_SIZE) {
      const batch = uniqueCartCodes.slice(i, i + BATCH_SIZE);

      const { data: bookings, error } = await supabase
        .from('bookings')
        .select('booking_id, confirmation_code')
        .in('confirmation_code', batch);

      if (error) {
        console.error(`❌ Error querying bookings: ${error.message}`);
        continue;
      }

      if (bookings) {
        bookings.forEach(b => {
          bookingLookup.set(b.confirmation_code, b.booking_id);
        });
      }

      process.stdout.write(`   Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(uniqueCartCodes.length / BATCH_SIZE)}...\r`);
    }

    console.log(`\n✅ Found ${bookingLookup.size} existing parent bookings in database\n`);

    // Step 3: Check which cart codes are missing
    const missingCartCodes = uniqueCartCodes.filter(code => !bookingLookup.has(code));
    if (missingCartCodes.length > 0) {
      console.log(`⚠️  WARNING: ${missingCartCodes.length} parent bookings not found in database:`);
      missingCartCodes.slice(0, 10).forEach(code => console.log(`   - ${code}`));
      if (missingCartCodes.length > 10) {
        console.log(`   ... and ${missingCartCodes.length - 10} more`);
      }
      console.log('\n💡 These activity_bookings cannot be created without parent bookings.');
      console.log('   You may need to create the parent bookings first.\n');
    }

    // Step 4: Prepare records for insertion
    const recordsToInsert: any[] = [];
    const skippedRecords: MissingRecord[] = [];

    for (const record of missingRecords) {
      const bookingId = bookingLookup.get(record.cart_confirmation_code);

      if (!bookingId) {
        skippedRecords.push(record);
        continue;
      }

      // Parse dates
      let startDateTime: Date | null = null;
      let endDateTime: Date | null = null;

      try {
        if (record.start_date) {
          startDateTime = new Date(record.start_date);
          // Estimate end time (assume 3 hours duration if not provided)
          endDateTime = new Date(startDateTime);
          endDateTime.setHours(endDateTime.getHours() + 3);
        }
      } catch (e) {
        console.warn(`⚠️  Invalid date for activity ${record.activity_booking_id}: ${record.start_date}`);
        skippedRecords.push(record);
        continue;
      }

      if (!startDateTime || isNaN(startDateTime.getTime()) || !endDateTime) {
        console.warn(`⚠️  Missing/invalid start date for activity ${record.activity_booking_id}`);
        skippedRecords.push(record);
        continue;
      }

      // Build record for insertion
      const activityBooking = {
        activity_booking_id: record.activity_booking_id,
        booking_id: bookingId,
        product_id: record.product_id,
        activity_id: record.product_id, // Same as product_id typically
        product_title: record.product_title,
        product_confirmation_code: record.product_confirmation_code,
        start_date_time: startDateTime.toISOString(),
        end_date_time: endDateTime.toISOString(),
        status: record.status || 'CONFIRMED',
        total_price: record.total_price || 0,
        activity_seller: record.seller || 'EnRoma.com',
        // Optional fields - set to null if not available
        rate_id: null,
        rate_title: null,
        start_time: startDateTime.toTimeString().slice(0, 5), // HH:MM format
        date_string: record.start_date
      };

      recordsToInsert.push(activityBooking);
    }

    console.log('📊 SUMMARY:');
    console.log('─'.repeat(80));
    console.log(`✅ Records ready for insertion: ${recordsToInsert.length}`);
    console.log(`⚠️  Records skipped (no parent booking): ${skippedRecords.length}`);
    console.log('─'.repeat(80));

    if (skippedRecords.length > 0) {
      // Save skipped records
      const skippedPath = path.join(__dirname, '..', 'skipped-records.json');
      fs.writeFileSync(skippedPath, JSON.stringify(skippedRecords, null, 2));
      console.log(`\n📄 Skipped records saved to: ${skippedPath}`);
    }

    if (recordsToInsert.length === 0) {
      console.log('\n❌ No records to insert. Exiting.\n');
      return;
    }

    // Show sample records
    console.log('\n📋 Sample records to insert (first 5):');
    recordsToInsert.slice(0, 5).forEach((record, idx) => {
      console.log(`\n${idx + 1}. activity_booking_id: ${record.activity_booking_id}`);
      console.log(`   booking_id: ${record.booking_id}`);
      console.log(`   product: ${record.product_title}`);
      console.log(`   date: ${record.start_date_time}`);
      console.log(`   status: ${record.status}`);
      console.log(`   price: ${record.total_price}`);
    });

    if (dryRun) {
      console.log('\n🔍 DRY RUN COMPLETE - No changes were made to the database');
      console.log('💡 Run with --live flag to actually insert the records');
      console.log(`\nCommand: npx tsx src/create-missing-activity-bookings.ts --live\n`);
      return;
    }

    // Step 5: Insert records (LIVE MODE)
    console.log('\n🚀 Starting insertion (LIVE MODE)...');
    console.log('⚠️  Inserting in batches of 50...\n');

    let successCount = 0;
    let errorCount = 0;
    const errors: any[] = [];

    const INSERT_BATCH_SIZE = 50;
    for (let i = 0; i < recordsToInsert.length; i += INSERT_BATCH_SIZE) {
      const batch = recordsToInsert.slice(i, i + INSERT_BATCH_SIZE);
      const batchNum = Math.floor(i / INSERT_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(recordsToInsert.length / INSERT_BATCH_SIZE);

      console.log(`📦 Inserting batch ${batchNum}/${totalBatches} (${batch.length} records)...`);

      try {
        const { data, error } = await supabase
          .from('activity_bookings')
          .insert(batch)
          .select('activity_booking_id');

        if (error) {
          console.error(`   ❌ Batch ${batchNum} failed: ${error.message}`);
          errorCount += batch.length;
          errors.push({
            batch: batchNum,
            error: error.message,
            records: batch.map(r => r.activity_booking_id)
          });
        } else {
          successCount += data?.length || batch.length;
          console.log(`   ✅ Batch ${batchNum} inserted: ${data?.length || batch.length} records`);
        }
      } catch (err: any) {
        console.error(`   ❌ Exception in batch ${batchNum}: ${err.message}`);
        errorCount += batch.length;
        errors.push({
          batch: batchNum,
          error: err.message,
          records: batch.map(r => r.activity_booking_id)
        });
      }

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('\n' + '='.repeat(80));
    console.log('📊 INSERTION COMPLETE');
    console.log('='.repeat(80));
    console.log(`✅ Successfully inserted: ${successCount} records`);
    console.log(`❌ Failed: ${errorCount} records`);
    console.log('='.repeat(80));

    if (errors.length > 0) {
      const errorsPath = path.join(__dirname, '..', 'insertion-errors.json');
      fs.writeFileSync(errorsPath, JSON.stringify(errors, null, 2));
      console.log(`\n📄 Errors saved to: ${errorsPath}`);
    }

    // Verification
    console.log('\n🔍 Verifying insertions...');
    const insertedIds = recordsToInsert.slice(0, 10).map(r => r.activity_booking_id);
    const { data: verifyData } = await supabase
      .from('activity_bookings')
      .select('activity_booking_id, product_title, status')
      .in('activity_booking_id', insertedIds);

    if (verifyData && verifyData.length > 0) {
      console.log('✅ Sample verification (first 10):');
      verifyData.forEach(record => {
        console.log(`   ✓ ID ${record.activity_booking_id}: ${record.product_title} (${record.status})`);
      });
    }

    console.log('\n✅ Script complete!\n');

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    throw error;
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const isLiveMode = args.includes('--live') || args.includes('-l');

// Run
createMissingActivityBookings(!isLiveMode)
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
