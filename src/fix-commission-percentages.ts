import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface PricingRow {
  'Creation date': string;
  booking_id: number;
  activity_booking_id: number;
  original_price: number;
  discount_percentage: string | number | null;
  discount_amount: number | null;
  commission_percentage: string | number | null;
  commission_amount: number | null;
  net_price: number;
  paid_type: string | null;
  currency: string;
  Supplier: string;
  Seller: string;
}

async function fixCommissionPercentages() {
  console.log('='.repeat(60));
  console.log('FIXING COMMISSION PERCENTAGES FROM EXCEL');
  console.log('='.repeat(60));

  // Read Excel file
  const workbook = XLSX.readFile('/Users/pedromartinezsaro/Desktop/booking-webhook-system/pricing corrections.xlsx');
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: PricingRow[] = XLSX.utils.sheet_to_json(sheet);

  console.log(`Found ${rows.length} rows in Excel\n`);

  // Filter rows that have commission_percentage
  const rowsWithCommission = rows.filter(r =>
    r.commission_percentage !== null &&
    r.commission_percentage !== undefined &&
    r.commission_percentage !== ''
  );

  console.log(`Rows with commission_percentage: ${rowsWithCommission.length}\n`);

  let updated = 0;
  let errors = 0;
  let notFound = 0;

  for (const row of rowsWithCommission) {
    const activityBookingId = row.activity_booking_id;

    // Parse commission_percentage - multiply by 100 since Excel stores as decimal
    let commissionPct: number;
    if (typeof row.commission_percentage === 'number') {
      // If it's already a number less than 1, multiply by 100
      commissionPct = row.commission_percentage < 1
        ? Number((row.commission_percentage * 100).toFixed(2))
        : Number(row.commission_percentage.toFixed(2));
    } else if (row.commission_percentage) {
      // It's a string, try to parse
      const cleaned = row.commission_percentage.toString().replace('%', '').trim();
      const parsed = parseFloat(cleaned);
      commissionPct = isNaN(parsed) ? 0 : (parsed < 1 ? parsed * 100 : parsed);
    } else {
      commissionPct = 0;
    }

    if (commissionPct === 0) continue;

    // Update the record
    const { error: updateError, count } = await supabase
      .from('activity_bookings')
      .update({ commission_percentage: commissionPct })
      .eq('activity_booking_id', activityBookingId);

    if (updateError) {
      console.log(`❌ Error updating ${activityBookingId}: ${updateError.message}`);
      errors++;
    } else {
      console.log(`✅ Updated ${activityBookingId}: commission_percentage=${commissionPct}% (${row.Seller})`);
      updated++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Rows with commission: ${rowsWithCommission.length}`);
  console.log(`Updated:              ${updated}`);
  console.log(`Errors:               ${errors}`);
  console.log('='.repeat(60));

  // Verify a sample
  console.log('\n=== VERIFICATION ===');
  const { data: sample } = await supabase
    .from('activity_bookings')
    .select('activity_booking_id, commission_percentage, commission_amount, activity_seller')
    .not('commission_percentage', 'is', null)
    .gt('commission_percentage', 0)
    .limit(5);

  sample?.forEach(r => {
    console.log(`ID: ${r.activity_booking_id}, commission: ${r.commission_percentage}%, amount: ${r.commission_amount} (${r.activity_seller})`);
  });
}

fixCommissionPercentages()
  .then(() => console.log('\nDone!'))
  .catch(console.error);
