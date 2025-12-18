import { supabase } from './config/supabase';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

interface OfferData {
  'Creation date': string;
  'Cart confirmation code': string;
  'Product confirmation code': string;
  'Customer': string;
  'Email': string;
  'Phone number': string;
  'Product ID': string;
  'Product title': string;
  'Start date': string;
  'Status': string;
  'Total price with discount': number;
  [key: string]: any;
}

async function checkActivityBookingsFromExcel() {
  console.log('\n🔍 Checking activity_booking_ids from Excel in Supabase...\n');

  try {
    // Read the JSON file created by Python
    const jsonPath = path.join(__dirname, '..', 'All_Offers_data.json');
    console.log(`📂 Reading file: ${jsonPath}`);

    const fileContent = fs.readFileSync(jsonPath, 'utf-8');
    const offers: OfferData[] = JSON.parse(fileContent);

    console.log(`📊 Total offers in Excel: ${offers.length}\n`);

    // Extract activity_booking_ids from Product confirmation codes
    // Format: "ENRO-T110942834" → activity_booking_id = 110942834
    const activityBookingIds: number[] = [];
    const codeToIdMap: Map<string, number> = new Map();

    offers.forEach(offer => {
      const code = offer['Product confirmation code'];
      if (code && typeof code === 'string' && code.startsWith('ENRO-T')) {
        const idStr = code.replace('ENRO-T', '');
        const id = parseInt(idStr);
        if (!isNaN(id)) {
          activityBookingIds.push(id);
          codeToIdMap.set(code, id);
        }
      }
    });

    console.log(`📋 Extracted ${activityBookingIds.length} activity_booking_ids from confirmation codes\n`);
    console.log('Sample activity_booking_ids:');
    activityBookingIds.slice(0, 10).forEach(id => console.log(`   - ${id}`));
    console.log('');

    // Check which ones exist in Supabase
    console.log('🔍 Querying Supabase for matching activity_booking_ids...\n');

    const BATCH_SIZE = 100;
    let foundRecords: any[] = [];

    for (let i = 0; i < activityBookingIds.length; i += BATCH_SIZE) {
      const batch = activityBookingIds.slice(i, i + BATCH_SIZE);
      console.log(`   Checking batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(activityBookingIds.length / BATCH_SIZE)}...`);

      const { data, error } = await supabase
        .from('activity_bookings')
        .select('activity_booking_id, booking_id, product_confirmation_code, product_title, status, start_date_time, activity_seller, total_price')
        .in('activity_booking_id', batch);

      if (error) {
        console.error('❌ Error querying Supabase:', error);
        throw error;
      }

      if (data) {
        foundRecords = foundRecords.concat(data);
      }
    }

    console.log(`✅ Query complete!\n`);

    // Analysis
    const foundIds = new Set(foundRecords.map(r => r.activity_booking_id));
    const missingIds = activityBookingIds.filter(id => !foundIds.has(id));

    console.log('=' .repeat(80));
    console.log('📊 RESULTS');
    console.log('=' .repeat(80));
    console.log(`✅ Found in Supabase: ${foundIds.size} / ${activityBookingIds.length}`);
    console.log(`❌ Missing in Supabase: ${missingIds.length} / ${activityBookingIds.length}`);
    console.log('=' .repeat(80));

    // Show sample of existing records
    if (foundRecords.length > 0) {
      console.log('\n✅ SAMPLE OF EXISTING RECORDS IN SUPABASE:');
      console.log('─'.repeat(80));
      foundRecords.slice(0, 5).forEach((record, idx) => {
        console.log(`${idx + 1}. activity_booking_id: ${record.activity_booking_id}`);
        console.log(`   booking_id: ${record.booking_id}`);
        console.log(`   Product Confirmation Code: ${record.product_confirmation_code}`);
        console.log(`   Product: ${record.product_title}`);
        console.log(`   Status: ${record.status}`);
        console.log(`   Seller: ${record.activity_seller}`);
        console.log(`   Price: ${record.total_price}`);
        console.log(`   Date: ${record.start_date_time}`);
        if (idx < 4) console.log('');
      });
    }

    // Show missing records with their Excel data
    if (missingIds.length > 0) {
      console.log('\n❌ MISSING ACTIVITY_BOOKING_IDS:');
      console.log('─'.repeat(80));
      console.log(`Total missing: ${missingIds.length}\n`);

      // Find the Excel data for missing records
      const missingOffers = offers.filter(offer => {
        const code = offer['Product confirmation code'];
        const id = codeToIdMap.get(code);
        return id && missingIds.includes(id);
      });

      console.log('Details of missing records (first 15):');
      missingOffers.slice(0, 15).forEach((offer, idx) => {
        const code = offer['Product confirmation code'];
        const id = codeToIdMap.get(code);
        console.log(`\n${idx + 1}. activity_booking_id: ${id}`);
        console.log(`   Product Confirmation Code: ${code}`);
        console.log(`   Cart Code: ${offer['Cart confirmation code']}`);
        console.log(`   Customer: ${offer.Customer}`);
        console.log(`   Email: ${offer.Email}`);
        console.log(`   Product ID: ${offer['Product ID']}`);
        console.log(`   Product: ${offer['Product title']}`);
        console.log(`   Start Date: ${offer['Start date']}`);
        console.log(`   Status: ${offer.Status}`);
        console.log(`   Total Price: ${offer['Total price with discount']} ${offer['Sale currency']}`);
        console.log(`   Seller: ${offer.Seller}`);
      });

      if (missingOffers.length > 15) {
        console.log(`\n   ... and ${missingOffers.length - 15} more missing records`);
      }

      // Save missing offers to a file
      const missingOffersFile = path.join(__dirname, '..', 'missing-offers.json');
      fs.writeFileSync(missingOffersFile, JSON.stringify(missingOffers, null, 2));
      console.log(`\n📄 Missing offers saved to: ${missingOffersFile}`);

      // Save just the IDs for easy reference
      const missingIdsFile = path.join(__dirname, '..', 'missing-activity-booking-ids.txt');
      fs.writeFileSync(missingIdsFile, missingIds.join('\n'));
      console.log(`📄 Missing activity_booking_ids saved to: ${missingIdsFile}`);

      // Save detailed report
      const report = {
        timestamp: new Date().toISOString(),
        total_in_excel: activityBookingIds.length,
        found_in_supabase: foundIds.size,
        missing_in_supabase: missingIds.length,
        missing_ids: missingIds,
        missing_offers: missingOffers
      };
      const reportFile = path.join(__dirname, '..', 'missing-records-report.json');
      fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
      console.log(`📄 Full report saved to: ${reportFile}`);
    } else {
      console.log('\n🎉 All activity_booking_ids from Excel are present in Supabase!');
    }

    // Summary by status of found records
    if (foundRecords.length > 0) {
      console.log('\n📊 STATUS DISTRIBUTION OF FOUND RECORDS:');
      console.log('─'.repeat(80));
      const statusCounts: Record<string, number> = {};
      foundRecords.forEach(record => {
        const status = record.status || 'NULL';
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      });
      Object.entries(statusCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([status, count]) => {
          const percentage = ((count / foundRecords.length) * 100).toFixed(1);
          console.log(`   - ${status}: ${count} (${percentage}%)`);
        });
    }

    console.log('\n✅ Check complete!\n');

  } catch (error) {
    console.error('\n❌ Error:', error);
    throw error;
  }
}

// Run the check
if (require.main === module) {
  checkActivityBookingsFromExcel()
    .then(() => {
      process.exit(0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { checkActivityBookingsFromExcel };
