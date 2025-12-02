/**
 * Try to determine original pricing_category_id values
 * by checking patterns in other records
 */

import { supabase } from './config/supabase';

async function findOriginalPricingValues() {
  console.log('🔍 Determining Original Pricing Category Values\n');
  console.log('='.repeat(100));

  const incorrectActivityIds = [249770, 265854, 901369, 901938];

  try {
    // Check all records for these activities to see their current state
    console.log('\n📋 Checking all pricing_category_bookings for incorrect activities...');
    console.log('-'.repeat(100));

    for (const activityId of incorrectActivityIds) {
      console.log(`\n🔍 Activity ${activityId}:`);

      const { data: allRecords, error } = await supabase
        .from('pricing_category_bookings')
        .select(`
          id,
          pricing_category_id,
          booked_title,
          age,
          activity_bookings!inner(
            activity_id,
            product_title
          )
        `)
        .eq('activity_bookings.activity_id', activityId)
        .order('pricing_category_id');

      if (error) {
        console.error(`❌ Error for activity ${activityId}:`, error.message);
        continue;
      }

      const productTitle = (allRecords as any)?.[0]?.activity_bookings?.product_title || 'N/A';
      console.log(`   Product: ${productTitle}`);
      console.log(`   Total records: ${allRecords?.length || 0}`);

      // Group by pricing_category_id
      const byPricingId: { [key: number]: any[] } = {};
      allRecords?.forEach(record => {
        if (!byPricingId[record.pricing_category_id]) {
          byPricingId[record.pricing_category_id] = [];
        }
        byPricingId[record.pricing_category_id].push(record);
      });

      console.log('\n   Distribution by pricing_category_id:');
      Object.entries(byPricingId)
        .sort(([a], [b]) => Number(a) - Number(b))
        .forEach(([pricingId, records]) => {
          const sampleTitle = records[0]?.booked_title || 'N/A';
          const ages = [...new Set(records.map(r => r.age))].sort((a, b) => a - b).join(', ');
          console.log(`      ${pricingId}: ${records.length} records - "${sampleTitle}" - Ages: ${ages}`);
        });

      // Show sample records with pricing_category_id 166592
      const incorrectRecords = byPricingId[166592] || [];
      if (incorrectRecords.length > 0) {
        console.log(`\n   📊 Sample of ${Math.min(3, incorrectRecords.length)} incorrect records (pricing_category_id = 166592):`);
        incorrectRecords.slice(0, 3).forEach(rec => {
          console.log(`      ID: ${rec.id} | booked_title: "${rec.booked_title}" | age: ${rec.age}`);
        });
      }
    }

    // Now check if we can find similar booked_title patterns for other activities
    console.log('\n\n📋 Checking booked_title "6 a 17 años" in OTHER activities to find pattern...');
    console.log('-'.repeat(100));

    // Look for records with booked_title "6 a 17 años" and pricing_category_id NOT 166592
    const { data: similarRecords, error: similarError } = await supabase
      .from('pricing_category_bookings')
      .select(`
        pricing_category_id,
        booked_title,
        age,
        activity_bookings!inner(
          activity_id,
          product_title
        )
      `)
      .eq('booked_title', '6 a 17 años')
      .not('pricing_category_id', 'eq', 166592)
      .limit(20);

    if (similarError) {
      console.error('❌ Error:', similarError.message);
    } else if (similarRecords && similarRecords.length > 0) {
      console.log(`\n✅ Found ${similarRecords.length} records with booked_title "6 a 17 años" and pricing_category_id != 166592`);

      // Group by pricing_category_id
      const grouped: { [key: number]: number } = {};
      similarRecords.forEach(rec => {
        grouped[rec.pricing_category_id] = (grouped[rec.pricing_category_id] || 0) + 1;
      });

      console.log('\n   Distribution:');
      Object.entries(grouped).forEach(([pricingId, count]) => {
        console.log(`      pricing_category_id ${pricingId}: ${count} records`);
      });

      console.log('\n   Sample records:');
      similarRecords.slice(0, 5).forEach((rec: any) => {
        console.log(`      Activity ${rec.activity_bookings?.activity_id} | pricing_cat: ${rec.pricing_category_id} | age: ${rec.age}`);
      });
    } else {
      console.log('\n⚠️  No other records found with booked_title "6 a 17 años" and pricing_category_id != 166592');
      console.log('   This suggests that "6 a 17 años" was specifically meant for pricing_category_id 166592');
    }

    // Check what the original booked_title might have been
    console.log('\n\n📋 Checking what booked_titles exist for pricing_category_id 161603 and 161602...');
    console.log('-'.repeat(100));

    const { data: oldPricingRecords, error: oldError } = await supabase
      .from('pricing_category_bookings')
      .select(`
        pricing_category_id,
        booked_title,
        age,
        activity_bookings!inner(
          activity_id
        )
      `)
      .in('pricing_category_id', [161603, 161602])
      .limit(100);

    if (oldError) {
      console.error('❌ Error:', oldError.message);
    } else if (oldPricingRecords && oldPricingRecords.length > 0) {
      // Group by pricing_category_id and booked_title
      console.log(`\n✅ Found ${oldPricingRecords.length} records with pricing_category_id 161603 or 161602`);

      const grouped161603: { [title: string]: number } = {};
      const grouped161602: { [title: string]: number } = {};

      oldPricingRecords.forEach(rec => {
        if (rec.pricing_category_id === 161603) {
          grouped161603[rec.booked_title] = (grouped161603[rec.booked_title] || 0) + 1;
        } else if (rec.pricing_category_id === 161602) {
          grouped161602[rec.booked_title] = (grouped161602[rec.booked_title] || 0) + 1;
        }
      });

      console.log('\n   pricing_category_id 161603:');
      Object.entries(grouped161603).forEach(([title, count]) => {
        console.log(`      "${title}": ${count} records`);
      });

      console.log('\n   pricing_category_id 161602:');
      Object.entries(grouped161602).forEach(([title, count]) => {
        console.log(`      "${title}": ${count} records`);
      });
    }

    console.log('\n' + '='.repeat(100));
    console.log('💡 RECOMMENDATION:');
    console.log('='.repeat(100));
    console.log('\nBased on the investigation, you have two options:');
    console.log('\n1. If you have a database backup from before the update:');
    console.log('   - Restore the specific records for activities 249770, 265854, 901369, 901938');
    console.log('\n2. If you know the business logic:');
    console.log('   - Determine which pricing_category_id (161603 or 161602) should be used');
    console.log('   - And determine the correct booked_title for each age group');
    console.log('\n3. Most likely scenario:');
    console.log('   - The booked_title "6 a 17 años" might be wrong for these activities');
    console.log('   - They probably should have a different title based on their age');
    console.log('   - Check what booked_titles are used for similar age groups in other activities');

    console.log('\n' + '='.repeat(100));

  } catch (error: any) {
    console.error('\n❌ CRITICAL ERROR:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run investigation
findOriginalPricingValues()
  .then(() => {
    console.log('\n✅ Investigation complete');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
