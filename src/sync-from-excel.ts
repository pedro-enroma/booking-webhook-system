import { supabase } from './config/supabase';
import * as XLSX from 'xlsx';
import * as fs from 'fs';

interface ExcelRecord {
  booking_id: number;
  activity_booking_id: number;
  status: string;
  cancellation_date: string | null;
}

interface ChangeLog {
  activity_booking_id: number;
  booking_id: number;
  old_status: string;
  new_status: string;
  cancellation_date: string | null;
}

async function syncFromExcel() {
  console.log('='.repeat(70));
  console.log('SYNC FROM EXCEL - Source of Truth');
  console.log('='.repeat(70));
  console.log('');

  // Step 1: Read Excel file
  console.log('[1/5] Reading Excel file...');
  const workbook = XLSX.readFile('/Users/pedromartinezsaro/Desktop/booking-webhook-system/cancellations.xlsx');
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(sheet);

  const excelRecords: ExcelRecord[] = rawData.map((row: any) => ({
    booking_id: parseInt(row['booking_id']) || 0,
    activity_booking_id: parseInt(row['activity_booking_id']) || 0,
    status: (row['status'] || '').toString().toUpperCase().trim(),
    cancellation_date: row['Cancellation date'] || null
  })).filter(r => r.activity_booking_id > 0);

  console.log('  Total records in Excel: ' + excelRecords.length);

  const excelCancelled = excelRecords.filter(r => r.status === 'CANCELLED');
  const excelConfirmed = excelRecords.filter(r => r.status === 'CONFIRMED');
  console.log('  CANCELLED in Excel: ' + excelCancelled.length);
  console.log('  CONFIRMED in Excel: ' + excelConfirmed.length);

  // Step 2: Get all activity_booking_ids from Excel
  console.log('');
  console.log('[2/5] Fetching matching records from Supabase...');

  const excelIds = excelRecords.map(r => r.activity_booking_id);

  // Fetch in batches of 1000
  let supabaseRecords: any[] = [];
  const batchSize = 1000;

  for (let i = 0; i < excelIds.length; i += batchSize) {
    const batchIds = excelIds.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from('activity_bookings')
      .select('activity_booking_id, booking_id, status')
      .in('activity_booking_id', batchIds);

    if (error) {
      console.error('  Error fetching batch:', error);
      continue;
    }

    supabaseRecords = supabaseRecords.concat(data || []);
    process.stdout.write('  Fetched: ' + supabaseRecords.length + ' records\r');
  }

  console.log('  Found in Supabase: ' + supabaseRecords.length + ' records');

  // Create lookup map
  const supabaseMap = new Map<number, any>();
  supabaseRecords.forEach(r => supabaseMap.set(r.activity_booking_id, r));

  // Step 3: Compare and identify changes
  console.log('');
  console.log('[3/5] Comparing records...');

  const toUpdate: ChangeLog[] = [];
  const skipped: number[] = [];
  const alreadyCorrect: number[] = [];

  for (const excelRecord of excelRecords) {
    const supabaseRecord = supabaseMap.get(excelRecord.activity_booking_id);

    if (!supabaseRecord) {
      // Not in Supabase - skip
      skipped.push(excelRecord.activity_booking_id);
      continue;
    }

    if (supabaseRecord.status === excelRecord.status) {
      // Already correct
      alreadyCorrect.push(excelRecord.activity_booking_id);
      continue;
    }

    // Needs update
    toUpdate.push({
      activity_booking_id: excelRecord.activity_booking_id,
      booking_id: excelRecord.booking_id,
      old_status: supabaseRecord.status,
      new_status: excelRecord.status,
      cancellation_date: excelRecord.cancellation_date
    });
  }

  console.log('  Skipped (not in Supabase): ' + skipped.length);
  console.log('  Already correct: ' + alreadyCorrect.length);
  console.log('  Need update: ' + toUpdate.length);

  const toCancel = toUpdate.filter(r => r.new_status === 'CANCELLED');
  const toConfirm = toUpdate.filter(r => r.new_status === 'CONFIRMED');
  console.log('    - To CANCELLED: ' + toCancel.length);
  console.log('    - To CONFIRMED: ' + toConfirm.length);

  if (toUpdate.length === 0) {
    console.log('');
    console.log('Nothing to update. Database is in sync with Excel.');
    return;
  }

  // Save change log before making changes
  console.log('');
  console.log('[4/5] Saving change log...');

  const changeLogFile = 'sync-changes-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
  fs.writeFileSync(changeLogFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      total_in_excel: excelRecords.length,
      found_in_supabase: supabaseRecords.length,
      skipped: skipped.length,
      already_correct: alreadyCorrect.length,
      to_update: toUpdate.length,
      to_cancel: toCancel.length,
      to_confirm: toConfirm.length
    },
    changes: toUpdate,
    skipped_ids: skipped
  }, null, 2));
  console.log('  Saved to: ' + changeLogFile);

  // Step 5: Perform updates
  console.log('');
  console.log('[5/5] Updating Supabase...');

  let updatedCount = 0;
  let cancelLogCount = 0;
  let errors: any[] = [];

  // Update to CONFIRMED
  if (toConfirm.length > 0) {
    console.log('  Updating ' + toConfirm.length + ' records to CONFIRMED...');
    const confirmIds = toConfirm.map(r => r.activity_booking_id);

    for (let i = 0; i < confirmIds.length; i += 500) {
      const batch = confirmIds.slice(i, i + 500);
      const { error, data } = await supabase
        .from('activity_bookings')
        .update({ status: 'CONFIRMED' })
        .in('activity_booking_id', batch)
        .select('activity_booking_id');

      if (error) {
        errors.push({ type: 'confirm', batch: i, error });
      } else {
        updatedCount += data?.length || 0;
      }
      process.stdout.write('    Updated: ' + updatedCount + '\r');
    }
    console.log('    Updated to CONFIRMED: ' + toConfirm.length);
  }

  // Update to CANCELLED and log
  if (toCancel.length > 0) {
    console.log('  Updating ' + toCancel.length + ' records to CANCELLED...');
    const cancelIds = toCancel.map(r => r.activity_booking_id);

    for (let i = 0; i < cancelIds.length; i += 500) {
      const batch = cancelIds.slice(i, i + 500);
      const { error, data } = await supabase
        .from('activity_bookings')
        .update({ status: 'CANCELLED' })
        .in('activity_booking_id', batch)
        .select('activity_booking_id');

      if (error) {
        errors.push({ type: 'cancel', batch: i, error });
      } else {
        updatedCount += data?.length || 0;
      }
      process.stdout.write('    Updated: ' + updatedCount + '\r');
    }
    console.log('    Updated to CANCELLED: ' + toCancel.length);

    // Log cancellations
    console.log('  Logging cancellations...');

    for (const record of toCancel) {
      // Parse date from DD.MM.YYYY to ISO
      let cancelledAt = new Date().toISOString();
      if (record.cancellation_date) {
        const parts = record.cancellation_date.split('.');
        if (parts.length === 3) {
          cancelledAt = new Date(
            parseInt(parts[2]),
            parseInt(parts[1]) - 1,
            parseInt(parts[0])
          ).toISOString();
        }
      }

      const { error } = await supabase
        .from('cancellation_log')
        .insert({
          activity_booking_id: record.activity_booking_id,
          booking_id: record.booking_id,
          cancelled_at: cancelledAt,
          cancellation_source: 'excel_sync',
          cancellation_reason: 'Synced from cancellations.xlsx',
          triggered_by: 'sync-from-excel.ts',
          previous_status: record.old_status,
          metadata: { excel_date: record.cancellation_date }
        });

      if (!error) {
        cancelLogCount++;
      }

      if (cancelLogCount % 100 === 0) {
        process.stdout.write('    Logged: ' + cancelLogCount + '\r');
      }
    }
    console.log('    Logged cancellations: ' + cancelLogCount);
  }

  // Final summary
  console.log('');
  console.log('='.repeat(70));
  console.log('SYNC COMPLETE');
  console.log('='.repeat(70));
  console.log('  Records updated: ' + updatedCount);
  console.log('  Cancellations logged: ' + cancelLogCount);
  console.log('  Errors: ' + errors.length);
  console.log('  Change log: ' + changeLogFile);

  if (errors.length > 0) {
    console.log('');
    console.log('ERRORS:');
    errors.forEach(e => console.log('  ' + JSON.stringify(e)));
  }

  // Verify final state
  console.log('');
  console.log('Verifying final state...');

  const { count: finalCancelled } = await supabase
    .from('activity_bookings')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'CANCELLED');

  const { count: finalConfirmed } = await supabase
    .from('activity_bookings')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'CONFIRMED');

  console.log('  CANCELLED in Supabase: ' + finalCancelled);
  console.log('  CONFIRMED in Supabase: ' + finalConfirmed);
}

syncFromExcel()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
