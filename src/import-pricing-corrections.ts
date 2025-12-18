import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface CorrectionRow {
  booking_id: number;
  activity_booking_id: number;
  Status: string;
  original_price: number | null;
  discount_percentage: string | number | null;
  discount_amount: number | null;
  commission_percentage: string | number | null;
  commission_amount: number | null;
  net_price: number | null;
  paid_type: string | null;
  currency: string;
  Supplier: string;
  Seller: string;
}

function parsePercentage(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    // If it's less than 1, it's a decimal (e.g., 0.15 = 15%)
    return value < 1 ? Number((value * 100).toFixed(2)) : value;
  }
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

async function importPricingCorrections(filePath: string) {
  console.log('='.repeat(60));
  console.log('IMPORT PRICING CORRECTIONS FROM EXCEL');
  console.log('='.repeat(60));
  console.log(`File: ${filePath}\n`);

  // Read Excel file
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: CorrectionRow[] = XLSX.utils.sheet_to_json(sheet);

  console.log(`Found ${rows.length} rows in Excel\n`);

  let updated = 0;
  let notFound = 0;
  let errors = 0;
  let skipped = 0;

  for (const row of rows) {
    const activityBookingId = row.activity_booking_id;

    if (!activityBookingId) {
      console.log(`⚠️ Skipping row with no activity_booking_id`);
      skipped++;
      continue;
    }

    // Parse values from Excel
    const originalPrice = parseNumber(row.original_price);
    const discountPercentage = parsePercentage(row.discount_percentage);
    const discountAmount = parseNumber(row.discount_amount);
    const commissionPercentage = parsePercentage(row.commission_percentage);
    const commissionAmount = parseNumber(row.commission_amount);
    const netPrice = parseNumber(row.net_price);
    const paidType = row.paid_type || null;
    const currency = row.currency || 'EUR';
    const supplier = row.Supplier || null;
    const seller = row.Seller || null;

    // Calculate total_price = original_price - discount_amount
    let totalPrice = originalPrice;
    if (originalPrice !== null && discountAmount !== null && discountAmount > 0) {
      totalPrice = Number((originalPrice - discountAmount).toFixed(2));
    }

    // Build update object
    const updateData: Record<string, any> = {
      original_price: originalPrice,
      total_price: totalPrice,
      discount_percentage: discountPercentage,
      discount_amount: discountAmount,
      commission_percentage: commissionPercentage,
      commission_amount: commissionAmount,
      net_price: netPrice,
      paid_type: paidType,
      currency: currency
    };

    // Only update supplier if provided
    if (supplier) {
      updateData.activity_supplier = supplier;
    }

    // Only update seller if provided
    if (seller) {
      updateData.activity_seller = seller;
    }

    // Update the record
    const { error: updateError, count } = await supabase
      .from('activity_bookings')
      .update(updateData)
      .eq('activity_booking_id', activityBookingId);

    if (updateError) {
      console.log(`❌ Error updating ${activityBookingId}: ${updateError.message}`);
      errors++;
    } else {
      console.log(`✅ ${activityBookingId}: orig=${originalPrice}, disc=${discountPercentage}%, comm=${commissionPercentage}%, net=${netPrice} (${seller})`);
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

// Get file path from command line or use default
const filePath = process.argv[2] || '/Users/pedromartinezsaro/Desktop/booking-webhook-system/correction part1.xlsx';

importPricingCorrections(filePath)
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
