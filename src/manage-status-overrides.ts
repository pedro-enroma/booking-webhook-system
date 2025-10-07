import { supabase } from './config/supabase';

/**
 * Helper functions to manage status overrides in the materialized view
 * without affecting the actual status in activity_bookings table
 */

interface StatusOverride {
  activity_booking_id: number;
  override_status: string;
  override_reason?: string;
  overridden_by: string;
  original_status?: string;
}

interface OverrideResult {
  success: boolean;
  message: string;
  affected_bookings?: number;
  details?: any;
}

/**
 * Add a status override for a single booking
 */
export async function addStatusOverride(
  activityBookingId: number,
  newStatus: string,
  reason: string,
  overriddenBy: string = 'system'
): Promise<OverrideResult> {
  try {
    // First, get the current status from activity_bookings
    const { data: booking, error: bookingError } = await supabase
      .from('activity_bookings')
      .select('status, product_title, start_date_time')
      .eq('activity_booking_id', activityBookingId)
      .single();

    if (bookingError || !booking) {
      return {
        success: false,
        message: `Booking ${activityBookingId} not found`,
        details: bookingError
      };
    }

    // Insert or update the override
    const { data, error } = await supabase
      .from('activity_booking_status_overrides')
      .upsert({
        activity_booking_id: activityBookingId,
        override_status: newStatus,
        override_reason: reason,
        overridden_by: overriddenBy,
        original_status: booking.status,
        overridden_at: new Date().toISOString()
      }, {
        onConflict: 'activity_booking_id'
      })
      .select()
      .single();

    if (error) {
      return {
        success: false,
        message: `Error adding override: ${error.message}`,
        details: error
      };
    }

    console.log(`✅ Override added for booking ${activityBookingId}`);
    console.log(`   Original status: ${booking.status} → Override: ${newStatus}`);
    console.log(`   Booking: ${booking.product_title} (${booking.start_date_time})`);
    console.log(`   Reason: ${reason}`);

    // Trigger MV refresh happens automatically via trigger

    return {
      success: true,
      message: `Successfully overridden status for booking ${activityBookingId}`,
      affected_bookings: 1,
      details: {
        activity_booking_id: activityBookingId,
        original_status: booking.status,
        new_status: newStatus,
        booking_title: booking.product_title
      }
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Exception: ${error.message}`,
      details: error
    };
  }
}

/**
 * Add status overrides for multiple bookings
 */
export async function addBulkStatusOverrides(
  activityBookingIds: number[],
  newStatus: string,
  reason: string,
  overriddenBy: string = 'system'
): Promise<OverrideResult> {
  try {
    console.log(`🔄 Processing bulk override for ${activityBookingIds.length} bookings...`);

    // Get current statuses
    const { data: bookings, error: bookingsError } = await supabase
      .from('activity_bookings')
      .select('activity_booking_id, status')
      .in('activity_booking_id', activityBookingIds);

    if (bookingsError) {
      return {
        success: false,
        message: `Error fetching bookings: ${bookingsError.message}`,
        details: bookingsError
      };
    }

    if (!bookings || bookings.length === 0) {
      return {
        success: false,
        message: 'No bookings found with provided IDs',
        affected_bookings: 0
      };
    }

    // Create override records
    const overrides = bookings.map(booking => ({
      activity_booking_id: booking.activity_booking_id,
      override_status: newStatus,
      override_reason: reason,
      overridden_by: overriddenBy,
      original_status: booking.status,
      overridden_at: new Date().toISOString()
    }));

    // Bulk insert
    const { data, error } = await supabase
      .from('activity_booking_status_overrides')
      .upsert(overrides, {
        onConflict: 'activity_booking_id'
      });

    if (error) {
      return {
        success: false,
        message: `Error adding bulk overrides: ${error.message}`,
        details: error
      };
    }

    console.log(`✅ Successfully overridden ${bookings.length} bookings`);
    console.log(`   New status in view: ${newStatus}`);
    console.log(`   Reason: ${reason}`);

    return {
      success: true,
      message: `Successfully overridden status for ${bookings.length} bookings`,
      affected_bookings: bookings.length,
      details: {
        booking_ids: activityBookingIds,
        new_status: newStatus
      }
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Exception: ${error.message}`,
      details: error
    };
  }
}

/**
 * Remove status override (booking will show real status in view)
 */
export async function removeStatusOverride(
  activityBookingId: number
): Promise<OverrideResult> {
  try {
    const { error } = await supabase
      .from('activity_booking_status_overrides')
      .delete()
      .eq('activity_booking_id', activityBookingId);

    if (error) {
      return {
        success: false,
        message: `Error removing override: ${error.message}`,
        details: error
      };
    }

    console.log(`✅ Override removed for booking ${activityBookingId}`);
    console.log(`   The booking will now show its actual status in the view`);

    return {
      success: true,
      message: `Override removed for booking ${activityBookingId}`,
      affected_bookings: 1
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Exception: ${error.message}`,
      details: error
    };
  }
}

/**
 * Remove multiple overrides
 */
export async function removeBulkStatusOverrides(
  activityBookingIds: number[]
): Promise<OverrideResult> {
  try {
    const { error } = await supabase
      .from('activity_booking_status_overrides')
      .delete()
      .in('activity_booking_id', activityBookingIds);

    if (error) {
      return {
        success: false,
        message: `Error removing overrides: ${error.message}`,
        details: error
      };
    }

    console.log(`✅ Removed overrides for ${activityBookingIds.length} bookings`);

    return {
      success: true,
      message: `Removed overrides for ${activityBookingIds.length} bookings`,
      affected_bookings: activityBookingIds.length
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Exception: ${error.message}`,
      details: error
    };
  }
}

/**
 * List all active overrides
 */
export async function listAllOverrides(): Promise<void> {
  try {
    const { data: overrides, error } = await supabase
      .from('activity_booking_status_overrides')
      .select(`
        activity_booking_id,
        override_status,
        original_status,
        override_reason,
        overridden_by,
        overridden_at
      `)
      .order('overridden_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching overrides:', error.message);
      return;
    }

    if (!overrides || overrides.length === 0) {
      console.log('ℹ️  No active status overrides found');
      return;
    }

    console.log('\n' + '='.repeat(80));
    console.log(`📋 ACTIVE STATUS OVERRIDES (${overrides.length} total)`);
    console.log('='.repeat(80));

    for (const override of overrides) {
      console.log(`\nBooking ID: ${override.activity_booking_id}`);
      console.log(`  Original Status: ${override.original_status}`);
      console.log(`  Override Status: ${override.override_status}`);
      console.log(`  Reason: ${override.override_reason}`);
      console.log(`  By: ${override.overridden_by}`);
      console.log(`  When: ${new Date(override.overridden_at).toLocaleString()}`);
      console.log('-'.repeat(80));
    }

    console.log('\n✅ Total overrides: ' + overrides.length);
  } catch (error: any) {
    console.error('❌ Exception:', error.message);
  }
}

/**
 * View override details for a specific booking
 */
export async function viewOverrideDetails(activityBookingId: number): Promise<void> {
  try {
    const { data: mvData, error: mvError } = await supabase
      .from('activity_bookings_participants_mv')
      .select('status, original_status, override_reason, overridden_by, overridden_at, product_title, start_date_time')
      .eq('activity_booking_id', activityBookingId)
      .limit(1)
      .single();

    if (mvError || !mvData) {
      console.error('❌ Booking not found in materialized view');
      return;
    }

    console.log('\n' + '='.repeat(80));
    console.log(`📊 BOOKING STATUS DETAILS - ID: ${activityBookingId}`);
    console.log('='.repeat(80));
    console.log(`Product: ${mvData.product_title}`);
    console.log(`Date: ${mvData.start_date_time}`);
    console.log(`\nStatus in View: ${mvData.status}`);
    console.log(`Actual Status (activity_bookings): ${mvData.original_status}`);

    if (mvData.status !== mvData.original_status) {
      console.log(`\n⚠️  STATUS OVERRIDE ACTIVE`);
      console.log(`Override Reason: ${mvData.override_reason}`);
      console.log(`Overridden By: ${mvData.overridden_by}`);
      console.log(`Overridden At: ${new Date(mvData.overridden_at).toLocaleString()}`);
    } else {
      console.log(`\n✓ No override - showing actual status`);
    }
    console.log('='.repeat(80) + '\n');
  } catch (error: any) {
    console.error('❌ Exception:', error.message);
  }
}

// ============================================================================
// CLI Interface
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  console.log('\n🔧 Status Override Manager\n');

  if (!command) {
    console.log('Usage:');
    console.log('  npm run manage-overrides -- add <booking_id> <status> <reason>');
    console.log('  npm run manage-overrides -- add-bulk <id1,id2,id3> <status> <reason>');
    console.log('  npm run manage-overrides -- remove <booking_id>');
    console.log('  npm run manage-overrides -- remove-bulk <id1,id2,id3>');
    console.log('  npm run manage-overrides -- list');
    console.log('  npm run manage-overrides -- view <booking_id>');
    console.log('\nExamples:');
    console.log('  npm run manage-overrides -- add 12345678 CANCELLED "Customer request"');
    console.log('  npm run manage-overrides -- add-bulk 111,222,333 CANCELLED "Bulk cancel"');
    console.log('  npm run manage-overrides -- remove 12345678');
    console.log('  npm run manage-overrides -- list');
    process.exit(0);
  }

  switch (command) {
    case 'add': {
      const bookingId = parseInt(args[1]);
      const status = args[2];
      const reason = args.slice(3).join(' ');

      if (!bookingId || !status || !reason) {
        console.error('❌ Usage: add <booking_id> <status> <reason>');
        process.exit(1);
      }

      const result = await addStatusOverride(bookingId, status, reason, 'manual-cli');
      console.log('\n' + (result.success ? '✅' : '❌'), result.message);
      if (result.details) {
        console.log('Details:', JSON.stringify(result.details, null, 2));
      }
      break;
    }

    case 'add-bulk': {
      const idsStr = args[1];
      const status = args[2];
      const reason = args.slice(3).join(' ');

      if (!idsStr || !status || !reason) {
        console.error('❌ Usage: add-bulk <id1,id2,id3> <status> <reason>');
        process.exit(1);
      }

      const ids = idsStr.split(',').map(id => parseInt(id.trim()));
      const result = await addBulkStatusOverrides(ids, status, reason, 'manual-cli');
      console.log('\n' + (result.success ? '✅' : '❌'), result.message);
      break;
    }

    case 'remove': {
      const bookingId = parseInt(args[1]);

      if (!bookingId) {
        console.error('❌ Usage: remove <booking_id>');
        process.exit(1);
      }

      const result = await removeStatusOverride(bookingId);
      console.log('\n' + (result.success ? '✅' : '❌'), result.message);
      break;
    }

    case 'remove-bulk': {
      const idsStr = args[1];

      if (!idsStr) {
        console.error('❌ Usage: remove-bulk <id1,id2,id3>');
        process.exit(1);
      }

      const ids = idsStr.split(',').map(id => parseInt(id.trim()));
      const result = await removeBulkStatusOverrides(ids);
      console.log('\n' + (result.success ? '✅' : '❌'), result.message);
      break;
    }

    case 'list': {
      await listAllOverrides();
      break;
    }

    case 'view': {
      const bookingId = parseInt(args[1]);

      if (!bookingId) {
        console.error('❌ Usage: view <booking_id>');
        process.exit(1);
      }

      await viewOverrideDetails(bookingId);
      break;
    }

    default:
      console.error('❌ Unknown command:', command);
      console.log('Run without arguments to see usage');
      process.exit(1);
  }

  process.exit(0);
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}