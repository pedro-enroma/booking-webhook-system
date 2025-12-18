/**
 * Fix existing hyphenated names in the database
 * Replaces hyphens with spaces in passenger_first_name and passenger_last_name
 */

import { supabase } from './config/supabase';

async function fixHyphenatedNames(dryRun: boolean = true) {
  console.log('\n🔧 Fixing Hyphenated Names in Database');
  console.log('='.repeat(80));
  console.log(`Mode: ${dryRun ? '🔍 DRY RUN (no changes)' : '✅ LIVE MODE (will update records)'}`);
  console.log('='.repeat(80));

  try {
    // Step 1: Find all records with hyphenated first names
    console.log('\n📋 Finding records with hyphenated first names...');
    const { data: firstNameRecords, error: firstNameError } = await supabase
      .from('pricing_category_bookings')
      .select('id, passenger_first_name, passenger_last_name')
      .like('passenger_first_name', '%-%')
      .limit(1000);

    if (firstNameError) {
      console.error('❌ Error querying first names:', firstNameError.message);
      return;
    }

    console.log(`   Found ${firstNameRecords?.length || 0} records with hyphenated first names`);

    // Step 2: Find all records with hyphenated last names
    console.log('\n📋 Finding records with hyphenated last names...');
    const { data: lastNameRecords, error: lastNameError } = await supabase
      .from('pricing_category_bookings')
      .select('id, passenger_first_name, passenger_last_name')
      .like('passenger_last_name', '%-%')
      .limit(1000);

    if (lastNameError) {
      console.error('❌ Error querying last names:', lastNameError.message);
      return;
    }

    console.log(`   Found ${lastNameRecords?.length || 0} records with hyphenated last names`);

    // Combine and deduplicate
    const allRecordsMap = new Map<number, any>();

    firstNameRecords?.forEach(r => allRecordsMap.set(r.id, r));
    lastNameRecords?.forEach(r => {
      if (allRecordsMap.has(r.id)) {
        // Update existing entry to include both
        allRecordsMap.set(r.id, r);
      } else {
        allRecordsMap.set(r.id, r);
      }
    });

    // Filter out records where name is ONLY a hyphen (skip those)
    const allRecords = Array.from(allRecordsMap.values()).filter(r => {
      const firstIsOnlyHyphen = r.passenger_first_name === '-';
      const lastIsOnlyHyphen = r.passenger_last_name === '-';

      // Skip if BOTH are only hyphens, or if the only hyphenated field is just a hyphen
      if (firstIsOnlyHyphen && lastIsOnlyHyphen) {
        return false; // Skip this record entirely
      }

      // Check if there's actually something to fix
      const firstHasRealHyphen = r.passenger_first_name?.includes('-') && r.passenger_first_name !== '-';
      const lastHasRealHyphen = r.passenger_last_name?.includes('-') && r.passenger_last_name !== '-';

      return firstHasRealHyphen || lastHasRealHyphen;
    });
    console.log(`\n📊 Total unique records to fix: ${allRecords.length}`);

    if (allRecords.length === 0) {
      console.log('\n✅ No hyphenated names found in database!');
      return;
    }

    // Show sample records
    console.log('\n📋 Sample records to fix (first 10):');
    console.log('-'.repeat(80));
    allRecords.slice(0, 10).forEach((record, idx) => {
      const newFirst = record.passenger_first_name?.replace(/-/g, ' ') || null;
      const newLast = record.passenger_last_name?.replace(/-/g, ' ') || null;
      console.log(`${idx + 1}. ID: ${record.id}`);
      console.log(`   First: "${record.passenger_first_name}" → "${newFirst}"`);
      console.log(`   Last:  "${record.passenger_last_name}" → "${newLast}"`);
    });

    if (dryRun) {
      console.log('\n🔍 DRY RUN COMPLETE - No changes were made to the database');
      console.log('💡 Run with --live flag to actually update the records');
      console.log(`\nCommand: npx tsx src/fix-hyphenated-names.ts --live\n`);
      return;
    }

    // Step 3: Update records (LIVE MODE)
    console.log('\n🚀 Starting updates (LIVE MODE)...');

    let successCount = 0;
    let errorCount = 0;

    for (const record of allRecords) {
      // Only replace hyphens if the name is not just a hyphen
      const newFirstName = record.passenger_first_name === '-'
        ? record.passenger_first_name
        : (record.passenger_first_name?.replace(/-/g, ' ') || null);
      const newLastName = record.passenger_last_name === '-'
        ? record.passenger_last_name
        : (record.passenger_last_name?.replace(/-/g, ' ') || null);

      const { error: updateError } = await supabase
        .from('pricing_category_bookings')
        .update({
          passenger_first_name: newFirstName,
          passenger_last_name: newLastName
        })
        .eq('id', record.id);

      if (updateError) {
        console.error(`❌ Error updating ID ${record.id}:`, updateError.message);
        errorCount++;
      } else {
        successCount++;
        if (successCount % 50 === 0) {
          console.log(`   Updated ${successCount} records...`);
        }
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('📊 UPDATE COMPLETE');
    console.log('='.repeat(80));
    console.log(`✅ Successfully updated: ${successCount} records`);
    console.log(`❌ Failed: ${errorCount} records`);
    console.log('='.repeat(80));

    // Verification
    console.log('\n🔍 Verifying no hyphenated names remain...');
    const { data: verifyFirst } = await supabase
      .from('pricing_category_bookings')
      .select('id')
      .like('passenger_first_name', '%-%')
      .limit(5);

    const { data: verifyLast } = await supabase
      .from('pricing_category_bookings')
      .select('id')
      .like('passenger_last_name', '%-%')
      .limit(5);

    const remainingFirst = verifyFirst?.length || 0;
    const remainingLast = verifyLast?.length || 0;

    if (remainingFirst === 0 && remainingLast === 0) {
      console.log('✅ All hyphenated names have been fixed!');
    } else {
      console.log(`⚠️  Remaining hyphenated first names: ${remainingFirst}`);
      console.log(`⚠️  Remaining hyphenated last names: ${remainingLast}`);
    }

    console.log('\n✅ Script complete!\n');

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    throw error;
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const isLiveMode = args.includes('--live') || args.includes('-l');

// Run
fixHyphenatedNames(!isLiveMode)
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
