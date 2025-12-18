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

async function checkOffersInSupabase() {
  console.log('\n🔍 Checking offers from Excel in Supabase...\n');

  try {
    // Read the JSON file created by Python
    const jsonPath = path.join(__dirname, '..', 'All_Offers_data.json');
    console.log(`📂 Reading file: ${jsonPath}`);

    const fileContent = fs.readFileSync(jsonPath, 'utf-8');
    const offers: OfferData[] = JSON.parse(fileContent);

    console.log(`📊 Total offers in Excel: ${offers.length}\n`);

    // Extract product confirmation codes
    const confirmationCodes = offers
      .map(offer => offer['Product confirmation code'])
      .filter(code => code && code.trim());

    console.log(`📋 Found ${confirmationCodes.length} product confirmation codes\n`);
    console.log('Sample codes:');
    confirmationCodes.slice(0, 10).forEach(code => console.log(`   - ${code}`));
    console.log('');

    // Check which ones exist in Supabase
    console.log('🔍 Querying Supabase for matching records...\n');

    const BATCH_SIZE = 100;
    let foundRecords: any[] = [];

    for (let i = 0; i < confirmationCodes.length; i += BATCH_SIZE) {
      const batch = confirmationCodes.slice(i, i + BATCH_SIZE);
      console.log(`   Checking batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(confirmationCodes.length / BATCH_SIZE)}...`);

      const { data, error } = await supabase
        .from('activity_bookings')
        .select('activity_booking_id, booking_id, product_confirmation_code, product_title, status, start_date_time, activity_seller')
        .in('product_confirmation_code', batch);

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
    const foundCodes = new Set(foundRecords.map(r => r.product_confirmation_code));
    const missingCodes = confirmationCodes.filter(code => !foundCodes.has(code));

    console.log('=' .repeat(80));
    console.log('📊 RESULTS');
    console.log('=' .repeat(80));
    console.log(`✅ Found in Supabase: ${foundCodes.size} / ${confirmationCodes.length}`);
    console.log(`❌ Missing in Supabase: ${missingCodes.length} / ${confirmationCodes.length}`);
    console.log('=' .repeat(80));

    // Show sample of existing records
    if (foundRecords.length > 0) {
      console.log('\n✅ SAMPLE OF EXISTING RECORDS:');
      console.log('─'.repeat(80));
      foundRecords.slice(0, 5).forEach((record, idx) => {
        console.log(`${idx + 1}. Activity Booking ID: ${record.activity_booking_id}`);
        console.log(`   Booking ID: ${record.booking_id}`);
        console.log(`   Product Confirmation Code: ${record.product_confirmation_code}`);
        console.log(`   Product: ${record.product_title}`);
        console.log(`   Status: ${record.status}`);
        console.log(`   Seller: ${record.activity_seller}`);
        console.log(`   Date: ${record.start_date_time}`);
        if (idx < 4) console.log('');
      });
    }

    // Show missing records with their Excel data
    if (missingCodes.length > 0) {
      console.log('\n❌ MISSING RECORDS:');
      console.log('─'.repeat(80));
      console.log(`Total missing: ${missingCodes.length}\n`);

      // Find the Excel data for missing records
      const missingOffers = offers.filter(offer =>
        missingCodes.includes(offer['Product confirmation code'])
      );

      console.log('Details of first 10 missing offers:');
      missingOffers.slice(0, 10).forEach((offer, idx) => {
        console.log(`\n${idx + 1}. Product Confirmation Code: ${offer['Product confirmation code']}`);
        console.log(`   Cart Code: ${offer['Cart confirmation code']}`);
        console.log(`   Customer: ${offer.Customer}`);
        console.log(`   Email: ${offer.Email}`);
        console.log(`   Product: ${offer['Product title']}`);
        console.log(`   Start Date: ${offer['Start date']}`);
        console.log(`   Status: ${offer.Status}`);
        console.log(`   Total Price: ${offer['Total price with discount']} ${offer['Sale currency']}`);
      });

      if (missingOffers.length > 10) {
        console.log(`\n   ... and ${missingOffers.length - 10} more missing records`);
      }

      // Save missing offers to a file
      const missingOffersFile = path.join(__dirname, '..', 'missing-offers.json');
      fs.writeFileSync(missingOffersFile, JSON.stringify(missingOffers, null, 2));
      console.log(`\n📄 Missing offers saved to: ${missingOffersFile}`);

      // Save just the confirmation codes for easy reference
      const missingCodesFile = path.join(__dirname, '..', 'missing-confirmation-codes.txt');
      fs.writeFileSync(missingCodesFile, missingCodes.join('\n'));
      console.log(`📄 Missing confirmation codes saved to: ${missingCodesFile}`);
    } else {
      console.log('\n🎉 All offers from Excel are present in Supabase!');
    }

    // Summary by status
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
  checkOffersInSupabase()
    .then(() => {
      process.exit(0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { checkOffersInSupabase };
