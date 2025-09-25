import { supabase } from './config/supabase';
import dotenv from 'dotenv';

dotenv.config();

// Valid statuses based on what we found in the database
const VALID_STATUSES = ['CONFIRMED', 'CANCELLED', 'ARRIVED', 'NO_SHOW', 'PENDING', 'COMPLETED', 'IMPORTED'];

interface UpdateFilters {
  activityBookingIds?: number[];
  bookingIds?: number[];
  productIds?: number[];
  currentStatus?: string;
  seller?: string;
  dateFrom?: string;
  dateTo?: string;
  affiliateId?: string;
}

class ActivityStatusManager {

  async showCurrentStatus(): Promise<void> {
    console.log('\n📊 Fetching current status distribution...\n');

    try {
      const { data, error } = await supabase
        .from('activity_bookings')
        .select('status');

      if (error) throw error;

      if (!data || data.length === 0) {
        console.log('No records found in activity_bookings table');
        return;
      }

      const statusCounts: Record<string, number> = {};
      let total = 0;

      data.forEach(record => {
        const status = record.status || 'NULL';
        statusCounts[status] = (statusCounts[status] || 0) + 1;
        total++;
      });

      console.log('📈 Status Distribution:');
      console.log('─'.repeat(50));

      Object.entries(statusCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([status, count]) => {
          const percentage = ((count / total) * 100).toFixed(2);
          const bar = '█'.repeat(Math.floor(parseInt(percentage) / 2));
          console.log(`  ${status.padEnd(15)} ${count.toString().padStart(6)} (${percentage.padStart(6)}%) ${bar}`);
        });

      console.log('─'.repeat(50));
      console.log(`  TOTAL:          ${total.toString().padStart(6)} records\n`);

    } catch (error) {
      console.error('❌ Error fetching status distribution:', error);
    }
  }

  async updateStatus(
    newStatus: string,
    filters: UpdateFilters = {},
    options: { dryRun?: boolean; limit?: number } = {}
  ): Promise<void> {

    // Validate status
    if (!VALID_STATUSES.includes(newStatus)) {
      console.error(`\n❌ Invalid status: "${newStatus}"`);
      console.log(`Valid statuses are: ${VALID_STATUSES.join(', ')}`);
      return;
    }

    console.log('\n🔄 Preparing to update activity_bookings status...');
    console.log('─'.repeat(50));
    console.log(`  New Status: ${newStatus}`);
    console.log(`  Dry Run: ${options.dryRun ? 'YES' : 'NO'}`);

    try {
      // Build query with filters
      let query = supabase
        .from('activity_bookings')
        .select('*');

      // Apply filters
      if (filters.activityBookingIds?.length) {
        query = query.in('activity_booking_id', filters.activityBookingIds);
        console.log(`  Filter: activity_booking_id IN (${filters.activityBookingIds.join(', ')})`);
      }

      if (filters.bookingIds?.length) {
        query = query.in('booking_id', filters.bookingIds);
        console.log(`  Filter: booking_id IN (${filters.bookingIds.join(', ')})`);
      }

      if (filters.productIds?.length) {
        query = query.in('product_id', filters.productIds);
        console.log(`  Filter: product_id IN (${filters.productIds.join(', ')})`);
      }

      if (filters.currentStatus) {
        query = query.eq('status', filters.currentStatus);
        console.log(`  Filter: current status = "${filters.currentStatus}"`);
      }

      if (filters.seller) {
        query = query.eq('activity_seller', filters.seller);
        console.log(`  Filter: seller = "${filters.seller}"`);
      }

      if (filters.affiliateId) {
        query = query.eq('affiliate_id', filters.affiliateId);
        console.log(`  Filter: affiliate_id = "${filters.affiliateId}"`);
      }

      if (filters.dateFrom && filters.dateTo) {
        query = query.gte('start_date_time', filters.dateFrom)
                    .lte('start_date_time', filters.dateTo);
        console.log(`  Filter: date between ${filters.dateFrom} and ${filters.dateTo}`);
      }

      if (options.limit) {
        query = query.limit(options.limit);
        console.log(`  Limit: ${options.limit} records`);
      }

      console.log('─'.repeat(50));

      // Execute query
      const { data: records, error } = await query;

      if (error) throw error;

      if (!records || records.length === 0) {
        console.log('\n⚠️  No records found matching the specified criteria');
        return;
      }

      console.log(`\n✅ Found ${records.length} records to update\n`);

      // Show preview of records to be updated
      console.log('📋 Preview of records to update:');
      console.log('─'.repeat(80));

      const preview = records.slice(0, 5);
      preview.forEach((record, idx) => {
        console.log(`  ${idx + 1}. Activity Booking ID: ${record.activity_booking_id}`);
        console.log(`     Product: ${record.product_title}`);
        console.log(`     Current Status: ${record.status} → ${newStatus}`);
        console.log(`     Date: ${record.start_date_time}`);
        console.log(`     Seller: ${record.activity_seller}`);
        if (idx < preview.length - 1) console.log('');
      });

      if (records.length > 5) {
        console.log(`\n  ... and ${records.length - 5} more records`);
      }

      console.log('─'.repeat(80));

      if (options.dryRun) {
        console.log('\n🔍 DRY RUN COMPLETE - No changes were made');
        console.log(`Would have updated ${records.length} records to status: "${newStatus}"`);
        return;
      }

      // Ask for confirmation
      console.log(`\n⚠️  About to update ${records.length} records to status: "${newStatus}"`);
      console.log('Press Ctrl+C within 5 seconds to cancel...');

      await new Promise(resolve => setTimeout(resolve, 5000));

      // Perform the update
      console.log('\n🚀 Performing update...');

      const activityIds = records.map(r => r.activity_booking_id);

      const { data: updatedData, error: updateError } = await supabase
        .from('activity_bookings')
        .update({
          status: newStatus,
          // Note: updated_at field doesn't exist in this table based on our inspection
        })
        .in('activity_booking_id', activityIds)
        .select();

      if (updateError) throw updateError;

      console.log(`\n✅ Successfully updated ${updatedData?.length || 0} records`);

      // Verify a sample of updates
      if (updatedData && updatedData.length > 0) {
        console.log('\n🔍 Verification (sample of updated records):');

        const { data: verifyData } = await supabase
          .from('activity_bookings')
          .select('activity_booking_id, status, product_title')
          .in('activity_booking_id', activityIds.slice(0, 3));

        verifyData?.forEach(record => {
          console.log(`  ✓ ID ${record.activity_booking_id}: status = ${record.status}`);
        });
      }

    } catch (error) {
      console.error('\n❌ Error updating records:', error);
    }
  }

  async findRecordsByDate(date: string): Promise<void> {
    console.log(`\n🔍 Finding records for date: ${date}\n`);

    try {
      const startOfDay = `${date}T00:00:00`;
      const endOfDay = `${date}T23:59:59`;

      const { data, error } = await supabase
        .from('activity_bookings')
        .select('activity_booking_id, booking_id, status, product_title, start_date_time, activity_seller')
        .gte('start_date_time', startOfDay)
        .lte('start_date_time', endOfDay)
        .order('start_date_time');

      if (error) throw error;

      if (!data || data.length === 0) {
        console.log('No records found for this date');
        return;
      }

      console.log(`Found ${data.length} records:\n`);

      data.forEach(record => {
        const time = record.start_date_time.split('T')[1].substring(0, 5);
        console.log(`  ${time} - ID: ${record.activity_booking_id}`);
        console.log(`         Product: ${record.product_title}`);
        console.log(`         Status: ${record.status}, Seller: ${record.activity_seller}`);
        console.log('');
      });

    } catch (error) {
      console.error('❌ Error finding records:', error);
    }
  }
}

// Main execution
async function main() {
  const manager = new ActivityStatusManager();
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'status':
    case 'list':
      await manager.showCurrentStatus();
      break;

    case 'update': {
      const newStatus = args[1]?.toUpperCase();

      if (!newStatus) {
        console.error('❌ Please provide a new status');
        console.log('Usage: npm run update-status update <NEW_STATUS> [options]');
        console.log('Valid statuses:', VALID_STATUSES.join(', '));
        break;
      }

      const filters: UpdateFilters = {};
      const options: { dryRun?: boolean; limit?: number } = {};

      // Parse command line options
      for (let i = 2; i < args.length; i++) {
        switch (args[i]) {
          case '--dry-run':
            options.dryRun = true;
            break;

          case '--limit':
            options.limit = parseInt(args[++i]);
            break;

          case '--activity-ids':
            filters.activityBookingIds = args[++i].split(',').map(id => parseInt(id));
            break;

          case '--booking-ids':
            filters.bookingIds = args[++i].split(',').map(id => parseInt(id));
            break;

          case '--product-ids':
            filters.productIds = args[++i].split(',').map(id => parseInt(id));
            break;

          case '--current-status':
            filters.currentStatus = args[++i].toUpperCase();
            break;

          case '--seller':
            filters.seller = args[++i];
            break;

          case '--affiliate':
            filters.affiliateId = args[++i];
            break;

          case '--date-from':
            filters.dateFrom = args[++i];
            break;

          case '--date-to':
            filters.dateTo = args[++i];
            break;
        }
      }

      await manager.updateStatus(newStatus, filters, options);
      break;
    }

    case 'find-by-date':
      const date = args[1];
      if (!date) {
        console.error('❌ Please provide a date (YYYY-MM-DD)');
        break;
      }
      await manager.findRecordsByDate(date);
      break;

    case 'help':
    default:
      console.log(`
📚 Activity Bookings Status Manager

USAGE:
  npm run update-status <command> [options]

COMMANDS:
  status, list              Show current status distribution
  update <STATUS>           Update records to new status
  find-by-date <DATE>       Find all records for a specific date
  help                      Show this help message

VALID STATUSES:
  ${VALID_STATUSES.join(', ')}

OPTIONS for 'update':
  --dry-run                     Preview changes without updating
  --limit <N>                   Limit number of records to update
  --activity-ids <ID1,ID2,...>  Update specific activity booking IDs
  --booking-ids <ID1,ID2,...>   Update by parent booking IDs
  --product-ids <ID1,ID2,...>   Update by product IDs
  --current-status <STATUS>     Only update records with this status
  --seller <NAME>               Filter by seller name
  --affiliate <ID>              Filter by affiliate ID
  --date-from <YYYY-MM-DD>      Start date for date range
  --date-to <YYYY-MM-DD>        End date for date range

EXAMPLES:
  # Show current status distribution
  npm run update-status status

  # Dry run: preview changing CONFIRMED to COMPLETED
  npm run update-status update COMPLETED --current-status CONFIRMED --dry-run

  # Update specific activity bookings to CANCELLED
  npm run update-status update CANCELLED --activity-ids 100836608,104685768

  # Update all EnRoma.com bookings from a date range to NO_SHOW
  npm run update-status update NO_SHOW --seller "EnRoma.com" --date-from 2025-09-01 --date-to 2025-09-30

  # Find all bookings for a specific date
  npm run update-status find-by-date 2025-09-26

  # Update first 10 CONFIRMED bookings to ARRIVED
  npm run update-status update ARRIVED --current-status CONFIRMED --limit 10
`);
  }
}

// Execute
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}