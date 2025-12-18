/**
 * Investigate which activities were affected by the pricing_category_id update
 */

import { supabase } from './config/supabase';

async function investigatePricingUpdate() {
  console.log('🔍 Investigating Pricing Category Update Impact\n');
  console.log('='.repeat(100));

  try {
    // Find all records with pricing_category_id = 166592
    console.log('\n📋 STEP 1: Finding all activities with pricing_category_id = 166592...');
    console.log('-'.repeat(100));

    const { data: currentRecords, error: findError } = await supabase
      .from('pricing_category_bookings')
      .select(`
        id,
        pricing_category_booking_id,
        activity_booking_id,
        pricing_category_id,
        booked_title,
        age,
        activity_bookings!inner(
          activity_id,
          product_title
        )
      `)
      .eq('pricing_category_id', 166592)
      .order('id', { ascending: false });

    if (findError) {
      console.error('❌ Error:', findError.message);
      process.exit(1);
    }

    console.log(`✅ Found ${currentRecords?.length || 0} records with pricing_category_id = 166592\n`);

    // Group by activity_id
    const byActivity: { [key: number]: any[] } = {};
    currentRecords?.forEach((record: any) => {
      const activityId = record.activity_bookings.activity_id;
      if (!byActivity[activityId]) {
        byActivity[activityId] = [];
      }
      byActivity[activityId].push(record);
    });

    console.log('📊 Distribution by Activity ID:');
    console.log('-'.repeat(100));

    const intentedActivityIds = [217949, 216954, 220107];
    let totalCorrect = 0;
    let totalIncorrect = 0;

    Object.entries(byActivity)
      .sort(([a], [b]) => Number(a) - Number(b))
      .forEach(([activityId, records]) => {
        const isIntended = intentedActivityIds.includes(Number(activityId));
        const icon = isIntended ? '✅' : '❌';
        const status = isIntended ? '(CORRECT - intended)' : '(INCORRECT - should be reverted)';

        if (isIntended) {
          totalCorrect += records.length;
        } else {
          totalIncorrect += records.length;
        }

        console.log(`${icon} Activity ${activityId}: ${records.length} records ${status}`);
        if (records[0]) {
          console.log(`   Product: ${records[0].activity_bookings.product_title}`);
        }
      });

    console.log('\n' + '='.repeat(100));
    console.log('📊 SUMMARY:');
    console.log('='.repeat(100));
    console.log(`✅ Correct records (intended activities): ${totalCorrect}`);
    console.log(`❌ Incorrect records (should be reverted): ${totalIncorrect}`);
    console.log(`📈 Total records with pricing_category_id = 166592: ${currentRecords?.length || 0}`);

    // List the activities that need to be reverted
    const activitiesToRevert = Object.keys(byActivity)
      .map(Number)
      .filter(id => !intentedActivityIds.includes(id))
      .sort((a, b) => a - b);

    if (activitiesToRevert.length > 0) {
      console.log('\n⚠️  Activities that need to be REVERTED:');
      activitiesToRevert.forEach(activityId => {
        const count = byActivity[activityId].length;
        console.log(`   - Activity ${activityId}: ${count} records`);
      });
    }

    // Check if there's a backup table
    console.log('\n\n📋 STEP 2: Checking for backup tables...');
    console.log('-'.repeat(100));

    const { data: tables, error: tablesError } = await supabase
      .rpc('exec_sql', {
        sql: `SELECT table_name FROM information_schema.tables
              WHERE table_schema = 'public'
              AND table_name LIKE '%backup%'
              ORDER BY table_name;`
      });

    if (tablesError) {
      console.log('⚠️  Cannot check for backup tables (this is normal if RPC is not available)');
      console.log('   You may need to check manually in Supabase dashboard');
    } else {
      console.log('Backup tables found:', tables);
    }

    // Try to find records that might tell us original values
    console.log('\n\n📋 STEP 3: Checking if we can determine original pricing_category_id values...');
    console.log('-'.repeat(100));

    // Check if there are any records with the old pricing_category_ids for comparison
    const { data: oldRecords, error: oldError } = await supabase
      .from('pricing_category_bookings')
      .select(`
        activity_booking_id,
        pricing_category_id,
        booked_title,
        age,
        activity_bookings!inner(
          activity_id,
          product_title
        )
      `)
      .in('pricing_category_id', [161603, 161602])
      .in('activity_bookings.activity_id', activitiesToRevert)
      .limit(10);

    if (oldError) {
      console.error('❌ Error checking old records:', oldError.message);
    } else if (oldRecords && oldRecords.length > 0) {
      console.log(`✅ Found ${oldRecords.length} records with old pricing_category_id (161603/161602)`);
      console.log('   This might help us determine the pattern for reverting');

      console.log('\nSample records with old IDs:');
      oldRecords.slice(0, 5).forEach((rec: any) => {
        console.log(`   - Activity ${rec.activity_bookings.activity_id}: pricing_cat=${rec.pricing_category_id}, title="${rec.booked_title}", age=${rec.age}`);
      });
    } else {
      console.log('⚠️  No records found with old pricing_category_id (161603/161602) for these activities');
      console.log('   This means ALL records for these activities were updated to 166592');
    }

    console.log('\n' + '='.repeat(100));

    // Output JSON for further processing
    console.log('\n📄 Activities to revert (JSON):');
    console.log(JSON.stringify(activitiesToRevert, null, 2));

    return {
      totalRecords: currentRecords?.length || 0,
      correctRecords: totalCorrect,
      incorrectRecords: totalIncorrect,
      activitiesToRevert,
      byActivity
    };

  } catch (error: any) {
    console.error('\n❌ CRITICAL ERROR:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run investigation
investigatePricingUpdate()
  .then(result => {
    console.log('\n✅ Investigation complete');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
