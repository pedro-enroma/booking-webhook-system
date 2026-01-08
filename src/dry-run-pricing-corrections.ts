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

interface CurrentRecord {
  activity_booking_id: number;
  original_price: number | null;
  total_price: number | null;
  discount_percentage: number | null;
  discount_amount: number | null;
  commission_percentage: number | null;
  commission_amount: number | null;
  net_price: number | null;
  currency: string | null;
}

interface ChangeDetail {
  activityBookingId: number;
  bookingId: string | number;
  seller: string;
  supplier: string;
  current: CurrentRecord;
  new: {
    original_price: number | null;
    total_price: number | null;
    discount_percentage: number | null;
    discount_amount: number | null;
    commission_percentage: number | null;
    commission_amount: number | null;
    net_price: number | null;
    currency: string;
  };
  changes: string[];
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

function formatValue(val: any): string {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'number') return val.toFixed(2);
  return String(val);
}

function valuesEqual(a: number | null, b: number | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return Math.abs(a - b) < 0.01;
}

async function dryRunPricingCorrections() {
  const excelPath = process.argv[2] || '/Users/pedromartinezsaro/Desktop/booking-webhook-system/correction part1.xlsx';

  console.log('='.repeat(80));
  console.log('DRY RUN - PRICING CORRECTIONS');
  console.log('='.repeat(80));
  console.log(`\nFile: ${excelPath}`);
  console.log('\n⚠️  NO DATA WILL BE MODIFIED - This is a simulation only\n');

  // Read Excel file
  const workbook = XLSX.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: PricingRow[] = XLSX.utils.sheet_to_json(sheet);

  console.log(`Found ${rows.length} rows in Excel\n`);
  console.log('-'.repeat(80));

  const changes: ChangeDetail[] = [];
  const notFound: { activityBookingId: number; bookingId: string | number; seller: string }[] = [];
  const noChanges: { activityBookingId: number; bookingId: string | number }[] = [];
  const bySeller: { [key: string]: ChangeDetail[] } = {};

  for (const row of rows) {
    const activityBookingId = getActivityBookingId(row);
    const bookingId = getBookingId(row);

    if (!activityBookingId) continue;

    // Fetch current record from database
    const { data: current, error } = await supabase
      .from('activity_bookings')
      .select('activity_booking_id, original_price, total_price, discount_percentage, discount_amount, commission_percentage, commission_amount, net_price, currency')
      .eq('activity_booking_id', activityBookingId)
      .single();

    if (error || !current) {
      notFound.push({ activityBookingId, bookingId: bookingId || 'N/A', seller: row.Seller });
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

    // Detect changes
    const changeList: string[] = [];

    if (!valuesEqual(current.original_price, newOriginalPrice)) {
      changeList.push(`original_price: ${formatValue(current.original_price)} → ${formatValue(newOriginalPrice)}`);
    }
    if (!valuesEqual(current.total_price, newTotalPrice)) {
      changeList.push(`total_price: ${formatValue(current.total_price)} → ${formatValue(newTotalPrice)}`);
    }
    if (!valuesEqual(current.discount_percentage, newDiscountPercentage)) {
      changeList.push(`discount_percentage: ${formatValue(current.discount_percentage)} → ${formatValue(newDiscountPercentage)}`);
    }
    if (!valuesEqual(current.discount_amount, newDiscountAmount)) {
      changeList.push(`discount_amount: ${formatValue(current.discount_amount)} → ${formatValue(newDiscountAmount)}`);
    }
    if (!valuesEqual(current.commission_percentage, newCommissionPercentage)) {
      changeList.push(`commission_percentage: ${formatValue(current.commission_percentage)} → ${formatValue(newCommissionPercentage)}`);
    }
    if (!valuesEqual(current.commission_amount, newCommissionAmount)) {
      changeList.push(`commission_amount: ${formatValue(current.commission_amount)} → ${formatValue(newCommissionAmount)}`);
    }
    if (!valuesEqual(current.net_price, newNetPrice)) {
      changeList.push(`net_price: ${formatValue(current.net_price)} → ${formatValue(newNetPrice)}`);
    }
    if (current.currency !== newCurrency) {
      changeList.push(`currency: ${current.currency || 'null'} → ${newCurrency}`);
    }

    if (changeList.length === 0) {
      noChanges.push({ activityBookingId, bookingId: bookingId || 'N/A' });
      continue;
    }

    const change: ChangeDetail = {
      activityBookingId,
      bookingId: bookingId || 'N/A',
      seller: row.Seller,
      supplier: row.Supplier,
      current: current as CurrentRecord,
      new: {
        original_price: newOriginalPrice,
        total_price: newTotalPrice,
        discount_percentage: newDiscountPercentage,
        discount_amount: newDiscountAmount,
        commission_percentage: newCommissionPercentage,
        commission_amount: newCommissionAmount,
        net_price: newNetPrice,
        currency: newCurrency
      },
      changes: changeList
    };

    changes.push(change);

    if (!bySeller[row.Seller]) {
      bySeller[row.Seller] = [];
    }
    bySeller[row.Seller].push(change);
  }

  // Display results
  console.log('\n📊 SUMMARY BY SELLER');
  console.log('='.repeat(80));

  Object.entries(bySeller).sort((a, b) => b[1].length - a[1].length).forEach(([seller, sellerChanges]) => {
    console.log(`\n${seller}: ${sellerChanges.length} records to update`);
  });

  console.log('\n\n📋 DETAILED CHANGES (showing first 50)');
  console.log('='.repeat(80));

  const samplesToShow = Math.min(50, changes.length);
  for (let i = 0; i < samplesToShow; i++) {
    const c = changes[i];
    console.log(`\n[${i + 1}] activity_booking_id: ${c.activityBookingId} (booking: ${c.bookingId})`);
    console.log(`    Seller: ${c.seller} | Supplier: ${c.supplier}`);
    c.changes.forEach(ch => {
      console.log(`    • ${ch}`);
    });
  }

  if (changes.length > samplesToShow) {
    console.log(`\n... and ${changes.length - samplesToShow} more records`);
  }

  // Not found
  if (notFound.length > 0) {
    console.log('\n\n⚠️  NOT FOUND IN DATABASE');
    console.log('='.repeat(80));
    notFound.slice(0, 20).forEach(nf => {
      console.log(`  activity_booking_id: ${nf.activityBookingId} (booking: ${nf.bookingId}) - ${nf.seller}`);
    });
    if (notFound.length > 20) {
      console.log(`  ... and ${notFound.length - 20} more`);
    }
  }

  // Final summary
  console.log('\n\n' + '='.repeat(80));
  console.log('FINAL SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total rows in Excel:     ${rows.length}`);
  console.log(`Records to UPDATE:       ${changes.length}`);
  console.log(`Records NOT FOUND:       ${notFound.length}`);
  console.log(`Records with NO CHANGES: ${noChanges.length}`);
  console.log('='.repeat(80));

  console.log('\n⚠️  DRY RUN COMPLETE - NO DATA WAS MODIFIED');
  console.log('\nTo apply these changes, run:');
  console.log('  npx tsx src/apply-pricing-corrections.ts "correction part1.xlsx"\n');

  return { changes, notFound, noChanges };
}

dryRunPricingCorrections()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
