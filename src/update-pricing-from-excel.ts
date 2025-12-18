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

function parsePercentage(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  // Remove % symbol and parse
  const cleaned = value.toString().replace('%', '').trim();
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

function parseNumber(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? null : parsed;
}

async function updatePricingFromExcel() {
  console.log('='.repeat(60));
  console.log('PRICING UPDATE FROM EXCEL');
  console.log('='.repeat(60));

  // Read Excel file
  const workbook = XLSX.readFile('/Users/pedromartinezsaro/Desktop/booking-webhook-system/pricing corrections.xlsx');
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: PricingRow[] = XLSX.utils.sheet_to_json(sheet);

  console.log(`Found ${rows.length} rows in Excel\n`);

  let updated = 0;
  let skipped = 0;
  let notFound = 0;
  let errors = 0;

  for (const row of rows) {
    const activityBookingId = row.activity_booking_id;

    if (!activityBookingId) {
      console.log(`⚠️ Skipping row with no activity_booking_id`);
      skipped++;
      continue;
    }

    // Check if record exists
    const { data: existing, error: checkError } = await supabase
      .from('activity_bookings')
      .select('activity_booking_id')
      .eq('activity_booking_id', activityBookingId)
      .single();

    if (checkError || !existing) {
      console.log(`❌ Not found: activity_booking_id=${activityBookingId} (Seller: ${row.Seller})`);
      notFound++;
      continue;
    }

    // Parse values from Excel
    const originalPrice = parseNumber(row.original_price);
    const discountPercentage = parsePercentage(row.discount_percentage);
    const discountAmount = parseNumber(row.discount_amount);
    const commissionPercentage = parsePercentage(row.commission_percentage);
    const commissionAmount = parseNumber(row.commission_amount);
    const netPrice = parseNumber(row.net_price);
    const currency = row.currency || 'EUR';

    // Calculate total_price = original_price - discount_amount (or just original_price if no discount)
    let totalPrice = originalPrice;
    if (originalPrice !== null && discountAmount !== null && discountAmount > 0) {
      totalPrice = Number((originalPrice - discountAmount).toFixed(2));
    }

    // Update the record
    const { error: updateError } = await supabase
      .from('activity_bookings')
      .update({
        original_price: originalPrice,
        total_price: totalPrice,
        discount_percentage: discountPercentage,
        discount_amount: discountAmount,
        commission_percentage: commissionPercentage,
        commission_amount: commissionAmount,
        net_price: netPrice,
        currency: currency
      })
      .eq('activity_booking_id', activityBookingId);

    if (updateError) {
      console.log(`❌ Error updating ${activityBookingId}: ${updateError.message}`);
      errors++;
    } else {
      console.log(`✅ Updated ${activityBookingId}: original=${originalPrice}, total=${totalPrice}, discount=${discountPercentage}%, commission=${commissionPercentage}%, net=${netPrice} (${row.Seller})`);
      updated++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total rows:    ${rows.length}`);
  console.log(`Updated:       ${updated}`);
  console.log(`Not found:     ${notFound}`);
  console.log(`Skipped:       ${skipped}`);
  console.log(`Errors:        ${errors}`);
  console.log('='.repeat(60));
}

// Run
updatePricingFromExcel()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
