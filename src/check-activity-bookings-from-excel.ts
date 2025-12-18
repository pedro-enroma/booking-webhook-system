import { supabase } from './config/supabase';
import * as XLSX from 'xlsx';
import dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

interface ExcelRow {
  [key: string]: any;
}

async function checkActivityBookingsFromExcel() {
  console.log('\n🔍 Checking activity_booking_ids from Excel file...\n');

  try {
    // Read the Excel file
    const excelPath = path.join(__dirname, '..', 'controll offers.xlsx');
    console.log(`📂 Reading file: ${excelPath}`);

    const workbook = XLSX.readFile(excelPath);
    const sheetName = workbook.SheetNames[0]; // Get first sheet
    console.log(`📄 Sheet name: ${sheetName}`);

    const worksheet = workbook.Sheets[sheetName];
    const data: ExcelRow[] = XLSX.utils.sheet_to_json(worksheet);

    console.log(`📊 Total rows in Excel: ${data.length}\n`);

    // Display column names
    if (data.length > 0) {
      console.log('📋 Available columns:');
      Object.keys(data[0]).forEach((col, idx) => {
        console.log(`   ${idx + 1}. ${col}`);
      });
      console.log('');
    }

    // Try to identify the activity_booking_id column
    // Common variations: activity_booking_id, activityBookingId, Activity Booking ID, etc.
    const possibleColumnNames = [
      'activity_booking_id',
      'activityBookingId',
      'Activity Booking ID',
      'activity_id',
      'activityId',
      'booking_id',
      'bookingId',
      'Booking ID',
      'ID',
      'id'
    ];

    let activityBookingIdColumn: string | null = null;

    // Find the column that contains activity booking IDs
    for (const col of Object.keys(data[0])) {
      const normalizedCol = col.toLowerCase().trim();
      if (possibleColumnNames.some(possible => normalizedCol.includes(possible.toLowerCase()))) {
        activityBookingIdColumn = col;
        break;
      }
    }

    if (!activityBookingIdColumn) {
      console.log('⚠️  Could not automatically detect activity_booking_id column.');
      console.log('Please specify which column contains the activity_booking_ids.\n');
      console.log('📋 First row sample:');
      console.log(JSON.stringify(data[0], null, 2));
      return;
    }

    console.log(`✅ Using column: "${activityBookingIdColumn}" for activity_booking_ids\n`);

    // Extract activity_booking_ids
    const activityBookingIds: number[] = data
      .map(row => {
        const value = row[activityBookingIdColumn!];
        // Try to parse as number
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
          const parsed = parseInt(value.trim());
          return isNaN(parsed) ? null : parsed;
        }
        return null;
      })
      .filter((id): id is number => id !== null && id > 0);

    console.log(`📊 Found ${activityBookingIds.length} valid activity_booking_ids in Excel\n`);

    if (activityBookingIds.length === 0) {
      console.log('❌ No valid activity_booking_ids found in the Excel file');
      return;
    }

    // Show first few IDs
    console.log('📋 Sample IDs from Excel:');
    activityBookingIds.slice(0, 10).forEach(id => {
      console.log(`   - ${id}`);
    });
    if (activityBookingIds.length > 10) {
      console.log(`   ... and ${activityBookingIds.length - 10} more\n`);
    } else {
      console.log('');
    }

    // Check which ones exist in Supabase
    console.log('🔍 Checking which activity_booking_ids exist in Supabase...\n');

    // Split into batches to avoid query limits
    const BATCH_SIZE = 100;
    let existingRecords: any[] = [];

    for (let i = 0; i < activityBookingIds.length; i += BATCH_SIZE) {
      const batch = activityBookingIds.slice(i, i + BATCH_SIZE);
      console.log(`   Checking batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(activityBookingIds.length / BATCH_SIZE)} (${batch.length} IDs)...`);

      const { data, error } = await supabase
        .from('activity_bookings')
        .select('activity_booking_id, booking_id, product_title, status, start_date_time')
        .in('activity_booking_id', batch);

      if (error) {
        console.error('❌ Error querying Supabase:', error);
        throw error;
      }

      if (data) {
        existingRecords = existingRecords.concat(data);
      }
    }

    console.log(`✅ Query complete! Found ${existingRecords.length} records\n`);

    const existingIds = new Set(existingRecords?.map(r => r.activity_booking_id) || []);
    const missingIds = activityBookingIds.filter(id => !existingIds.has(id));

    console.log('=' .repeat(80));
    console.log('📊 RESULTS');
    console.log('=' .repeat(80));
    console.log(`✅ Found in Supabase: ${existingIds.size} / ${activityBookingIds.length}`);
    console.log(`❌ Missing in Supabase: ${missingIds.length} / ${activityBookingIds.length}`);
    console.log('=' .repeat(80));

    // Show existing records
    if (existingRecords && existingRecords.length > 0) {
      console.log('\n✅ EXISTING RECORDS IN SUPABASE:');
      console.log('─'.repeat(80));
      existingRecords.forEach((record, idx) => {
        console.log(`${idx + 1}. Activity Booking ID: ${record.activity_booking_id}`);
        console.log(`   Booking ID: ${record.booking_id}`);
        console.log(`   Product: ${record.product_title}`);
        console.log(`   Status: ${record.status}`);
        console.log(`   Date: ${record.start_date_time}`);
        if (idx < existingRecords.length - 1) console.log('');
      });
    }

    // Show missing IDs
    if (missingIds.length > 0) {
      console.log('\n❌ MISSING ACTIVITY_BOOKING_IDS:');
      console.log('─'.repeat(80));
      missingIds.forEach((id, idx) => {
        console.log(`${idx + 1}. ${id}`);
      });
      console.log('─'.repeat(80));

      console.log('\n⚠️  These activity_booking_ids are NOT in Supabase and need to be created.');
      console.log('\n💡 To create these missing records, you will need to provide:');
      console.log('   - booking_id (parent booking)');
      console.log('   - product_id');
      console.log('   - product_title');
      console.log('   - start_date_time');
      console.log('   - end_date_time');
      console.log('   - status');
      console.log('   - total_price');
      console.log('   - And other required fields...\n');
      console.log('💡 TIP: Check if these exist in the Excel file or if you need to fetch them from another source.');
    } else {
      console.log('\n🎉 All activity_booking_ids from Excel are present in Supabase!');
    }

    // Save missing IDs to a file for reference
    if (missingIds.length > 0) {
      const fs = require('fs');
      const outputPath = path.join(__dirname, '..', 'missing-activity-bookings.json');
      fs.writeFileSync(outputPath, JSON.stringify({
        total_checked: activityBookingIds.length,
        found: existingIds.size,
        missing_count: missingIds.length,
        missing_ids: missingIds,
        checked_at: new Date().toISOString()
      }, null, 2));
      console.log(`\n📄 Missing IDs saved to: ${outputPath}`);
    }

  } catch (error) {
    console.error('\n❌ Error:', error);
    throw error;
  }
}

// Run the check
if (require.main === module) {
  checkActivityBookingsFromExcel()
    .then(() => {
      console.log('\n✅ Check complete!\n');
      process.exit(0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { checkActivityBookingsFromExcel };
