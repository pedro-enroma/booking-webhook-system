import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface PricingRow {
  // Format 1: correction part1.xlsx
  booking_id?: number;
  activity_booking_id?: number;
  // Format 2: correction part2.xlsx
  'Cart confirmation code'?: string;
  'Product confirmation code'?: number;
  // Common fields
  Status: string;
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

function getActivityBookingId(row: PricingRow): number | null {
  if (row.activity_booking_id) return row.activity_booking_id;
  if (row['Product confirmation code']) return row['Product confirmation code'];
  return null;
}

function getBookingId(row: PricingRow): string | number | null {
  if (row.booking_id) return row.booking_id;
  if (row['Cart confirmation code']) return row['Cart confirmation code'];
  return null;
}

function parsePercentage(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    // Excel may store 3% as 0.03 or as 3 - normalize to whole number (e.g., 15 for 15%)
    if (value < 1 && value > 0) {
      return Number((value * 100).toFixed(2));
    }
    return value;
  }
  const cleaned = value.toString().replace('%', '').trim();
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

function parseNumber(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? null : parsed;
}

function valuesEqual(a: number | null, b: number | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return Math.abs(a - b) < 0.01;
}

async function applyPricingCorrections() {
  const excelPath = process.argv[2] || '/Users/pedromartinezsaro/Desktop/booking-webhook-system/correction part1.xlsx';

  console.log('='.repeat(80));
  console.log('APPLYING PRICING CORRECTIONS');
  console.log('='.repeat(80));
  console.log(`\nFile: ${excelPath}\n`);

  // Read Excel file
  const workbook = XLSX.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: PricingRow[] = XLSX.utils.sheet_to_json(sheet);

  console.log(`Found ${rows.length} rows in Excel\n`);
  console.log('-'.repeat(80));

  let updated = 0;
  let skipped = 0;
  let notFound = 0;
  let errors = 0;

  for (const row of rows) {
    const activityBookingId = getActivityBookingId(row);
    const bookingId = getBookingId(row);

    if (!activityBookingId) {
      skipped++;
      continue;
    }

    // Fetch current record from database
    const { data: current, error: fetchError } = await supabase
      .from('activity_bookings')
      .select('activity_booking_id, original_price, total_price, discount_percentage, discount_amount, commission_percentage, commission_amount, net_price, currency')
      .eq('activity_booking_id', activityBookingId)
      .single();

    if (fetchError || !current) {
      notFound++;
      continue;
    }

    // Parse new values from Excel
    const newOriginalPrice = parseNumber(row.original_price);
    const newDiscountPercentage = parsePercentage(row.discount_percentage);
    const newDiscountAmount = parseNumber(row.discount_amount);
    const newCommissionPercentage = parsePercentage(row.commission_percentage);
    const newCommissionAmount = parseNumber(row.commission_amount);
    const newNetPrice = parseNumber(row.net_price);
    const newCurrency = row.currency || 'EUR';

    // Calculate total_price
    let newTotalPrice = newOriginalPrice;
    if (newOriginalPrice !== null && newDiscountAmount !== null && newDiscountAmount > 0) {
      newTotalPrice = Number((newOriginalPrice - newDiscountAmount).toFixed(2));
    }

    // Check if any changes needed
    const hasChanges =
      !valuesEqual(current.original_price, newOriginalPrice) ||
      !valuesEqual(current.total_price, newTotalPrice) ||
      !valuesEqual(current.discount_percentage, newDiscountPercentage) ||
      !valuesEqual(current.discount_amount, newDiscountAmount) ||
      !valuesEqual(current.commission_percentage, newCommissionPercentage) ||
      !valuesEqual(current.commission_amount, newCommissionAmount) ||
      !valuesEqual(current.net_price, newNetPrice) ||
      current.currency !== newCurrency;

    if (!hasChanges) {
      skipped++;
      continue;
    }

    // Apply update
    const { error: updateError } = await supabase
      .from('activity_bookings')
      .update({
        original_price: newOriginalPrice,
        total_price: newTotalPrice,
        discount_percentage: newDiscountPercentage,
        discount_amount: newDiscountAmount,
        commission_percentage: newCommissionPercentage,
        commission_amount: newCommissionAmount,
        net_price: newNetPrice,
        currency: newCurrency
      })
      .eq('activity_booking_id', activityBookingId);

    if (updateError) {
      console.log(`❌ Error updating ${activityBookingId}: ${updateError.message}`);
      errors++;
    } else {
      console.log(`✅ Updated activity_booking_id: ${activityBookingId} (booking: ${bookingId}) - ${row.Seller}`);
      updated++;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total rows in Excel: ${rows.length}`);
  console.log(`Updated:             ${updated}`);
  console.log(`Skipped (no change): ${skipped}`);
  console.log(`Not found:           ${notFound}`);
  console.log(`Errors:              ${errors}`);
  console.log('='.repeat(80));

  return { updated, skipped, notFound, errors };
}

applyPricingCorrections()
  .then(({ updated }) => {
    console.log(`\n✅ Done! ${updated} records updated.`);
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
