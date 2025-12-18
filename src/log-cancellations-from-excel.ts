import { supabase } from './config/supabase';
import * as XLSX from 'xlsx';

async function logCancellationsFromExcel() {
  console.log('Logging cancellations from Excel to cancellation_log table...');
  console.log('');

  // Read Excel file
  const workbook = XLSX.readFile('/Users/pedromartinezsaro/Desktop/booking-webhook-system/cancellations.xlsx');
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(sheet);

  // Get all CANCELLED records from Excel
  const cancelledRecords = rawData
    .map((row: any) => {
      let cancellationDate = row['Cancellation date'];
      let cancelledAt: string | null = null;

      // Handle different date formats from Excel
      if (cancellationDate) {
        if (typeof cancellationDate === 'number') {
          // Excel serial date number
          const excelEpoch = new Date(1899, 11, 30);
          const date = new Date(excelEpoch.getTime() + cancellationDate * 86400000);
          cancelledAt = date.toISOString();
        } else if (typeof cancellationDate === 'string') {
          // DD.MM.YYYY format
          const parts = cancellationDate.split('.');
          if (parts.length === 3) {
            cancelledAt = new Date(
              parseInt(parts[2]),
              parseInt(parts[1]) - 1,
              parseInt(parts[0])
            ).toISOString();
          }
        } else if (cancellationDate instanceof Date) {
          cancelledAt = cancellationDate.toISOString();
        }
      }

      return {
        booking_id: parseInt(row['booking_id']) || 0,
        activity_booking_id: parseInt(row['activity_booking_id']) || 0,
        status: (row['status'] || '').toString().toUpperCase().trim(),
        cancelled_at: cancelledAt
      };
    })
    .filter(r => r.activity_booking_id > 0 && r.status === 'CANCELLED');

  console.log('CANCELLED records in Excel: ' + cancelledRecords.length);

  // Check which ones exist in Supabase
  const ids = cancelledRecords.map(r => r.activity_booking_id);
  let existingIds = new Set<number>();

  for (let i = 0; i < ids.length; i += 1000) {
    const batch = ids.slice(i, i + 1000);
    const { data } = await supabase
      .from('activity_bookings')
      .select('activity_booking_id')
      .in('activity_booking_id', batch);

    (data || []).forEach(r => existingIds.add(r.activity_booking_id));
  }

  console.log('Found in Supabase: ' + existingIds.size);

  // Check what's already logged
  const { data: alreadyLogged } = await supabase
    .from('cancellation_log')
    .select('activity_booking_id');

  const loggedIds = new Set((alreadyLogged || []).map(r => r.activity_booking_id));
  console.log('Already logged: ' + loggedIds.size);

  // Filter to only those that exist in Supabase and not yet logged
  const toLog = cancelledRecords.filter(r =>
    existingIds.has(r.activity_booking_id) && !loggedIds.has(r.activity_booking_id)
  );

  console.log('To log: ' + toLog.length);
  console.log('');

  if (toLog.length === 0) {
    console.log('Nothing to log.');
    return;
  }

  // Insert in batches
  let logged = 0;
  const batchSize = 100;

  for (let i = 0; i < toLog.length; i += batchSize) {
    const batch = toLog.slice(i, i + batchSize).map(r => ({
      activity_booking_id: r.activity_booking_id,
      booking_id: r.booking_id,
      cancelled_at: r.cancelled_at || new Date().toISOString(),
      cancellation_source: 'excel_sync',
      cancellation_reason: 'Synced from cancellations.xlsx',
      triggered_by: 'log-cancellations-from-excel.ts',
      previous_status: 'CONFIRMED',
      metadata: {}
    }));

    const { error, data } = await supabase
      .from('cancellation_log')
      .insert(batch)
      .select('id');

    if (error) {
      console.error('Error inserting batch at ' + i + ':', error.message);
    } else {
      logged += data?.length || 0;
    }

    process.stdout.write('  Logged: ' + logged + ' / ' + toLog.length + '\r');
  }

  console.log('');
  console.log('');
  console.log('Done. Total logged: ' + logged);

  // Verify
  const { count } = await supabase
    .from('cancellation_log')
    .select('*', { count: 'exact', head: true });

  console.log('Total in cancellation_log table: ' + count);
}

logCancellationsFromExcel()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
