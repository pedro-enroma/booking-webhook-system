import { supabase } from './config/supabase';
import * as fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

interface BookingUpdate {
  activity_booking_id: number;
  original_status: string;
}

async function restoreOriginalStatuses() {
  console.log('\n🔄 Restoring original statuses from CSV...\n');

  try {
    // Read and parse the CSV
    const csvPath = '/Users/pedromartinezsaro/Desktop/booking-webhook-system/activity_bookings_rows IMPORTED.csv';
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim());

    // Parse CSV (skip header)
    const updates: BookingUpdate[] = [];

    for (let i = 1; i < lines.length; i++) {
      const columns = lines[i].split(';');
      if (columns.length >= 9) {
        const activityBookingId = parseInt(columns[2]); // activity_booking_id column
        const originalStatus = columns[8].trim(); // status column

        if (activityBookingId && originalStatus) {
          updates.push({
            activity_booking_id: activityBookingId,
            original_status: originalStatus
          });
        }
      }
    }

    console.log(`📊 Found ${updates.length} bookings to restore\n`);

    // Group by status for batch updates
    const statusGroups: Record<string, number[]> = {};

    updates.forEach(update => {
      if (!statusGroups[update.original_status]) {
        statusGroups[update.original_status] = [];
      }
      statusGroups[update.original_status].push(update.activity_booking_id);
    });

    console.log('📋 Status distribution to restore:');
    Object.entries(statusGroups).forEach(([status, ids]) => {
      console.log(`  ${status}: ${ids.length} records`);
    });
    console.log('');

    // Perform batch updates for each status group
    let totalUpdated = 0;

    for (const [status, ids] of Object.entries(statusGroups)) {
      console.log(`🔄 Restoring ${ids.length} records to ${status}...`);

      const { data, error } = await supabase
        .from('activity_bookings')
        .update({ status: status })
        .in('activity_booking_id', ids)
        .select();

      if (error) {
        console.error(`❌ Error updating to ${status}:`, error);
      } else {
        console.log(`  ✅ Successfully restored ${data?.length || 0} records to ${status}`);
        totalUpdated += data?.length || 0;
      }
    }

    console.log(`\n✅ Total restored: ${totalUpdated} records`);

    // Verify a sample
    console.log('\n🔍 Verification sample:');
    const sampleIds = updates.slice(0, 5).map(u => u.activity_booking_id);

    const { data: verifyData } = await supabase
      .from('activity_bookings')
      .select('activity_booking_id, status')
      .in('activity_booking_id', sampleIds);

    verifyData?.forEach(record => {
      const original = updates.find(u => u.activity_booking_id === record.activity_booking_id);
      console.log(`  ID ${record.activity_booking_id}: ${record.status} (should be ${original?.original_status})`);
    });

  } catch (error) {
    console.error('❌ Error restoring statuses:', error);
  }
}

// Run the restoration
if (require.main === module) {
  restoreOriginalStatuses()
    .then(() => {
      console.log('\n🏁 Restoration complete!');
      process.exit(0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}