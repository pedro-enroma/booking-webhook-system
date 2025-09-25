import { supabase } from './config/supabase';
import dotenv from 'dotenv';

dotenv.config();

async function diagnoseAndFix() {
  console.log('\n🔍 Diagnosing pricing_category_bookings sequence issue...\n');

  try {
    // 1. Check current max ID
    const { data: records, error } = await supabase
      .from('pricing_category_bookings')
      .select('id')
      .order('id', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error:', error);
      return;
    }

    const maxId = records && records.length > 0 ? records[0].id : 0;
    console.log(`📊 Current maximum ID in table: ${maxId}`);

    // 2. Check if 15443 exists
    const { data: existing, error: checkErr } = await supabase
      .from('pricing_category_bookings')
      .select('*')
      .eq('id', 15443);

    if (!checkErr && existing && existing.length > 0) {
      console.log(`\n⚠️  Record with ID 15443 already exists!`);
      console.log(`  Activity Booking ID: ${existing[0].activity_booking_id}`);
      console.log(`  Pricing Category ID: ${existing[0].pricing_category_id}`);
      console.log(`  Created at: ${existing[0].created_at}`);
    }

    // 3. Show the last few IDs
    console.log('\n📋 Last 10 IDs in the table:');
    records?.forEach(r => console.log(`  - ${r.id}`));

    // 4. Provide SQL fix
    const nextId = maxId + 1;
    console.log('\n✅ SOLUTION: Run this SQL in Supabase Dashboard:\n');
    console.log('----------------------------------------');
    console.log(`ALTER SEQUENCE pricing_category_bookings_id_seq RESTART WITH ${nextId};`);
    console.log('----------------------------------------');

    console.log('\n📝 Steps to fix:');
    console.log('1. Go to your Supabase Dashboard');
    console.log('2. Navigate to SQL Editor');
    console.log('3. Paste and run the SQL command above');
    console.log('4. The sequence will be reset and new inserts will work');

    console.log('\n💡 Alternative: If you want to remove the manually created record:');
    console.log('----------------------------------------');
    console.log('DELETE FROM pricing_category_bookings WHERE id = 15443;');
    console.log('----------------------------------------');

  } catch (error) {
    console.error('Error:', error);
  }
}

diagnoseAndFix()
  .then(() => process.exit(0))
  .catch(console.error);