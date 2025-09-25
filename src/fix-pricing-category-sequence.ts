import { supabase } from './config/supabase';
import dotenv from 'dotenv';

dotenv.config();

async function fixPricingCategorySequence() {
  console.log('\n🔧 Fixing pricing_category_bookings sequence issue...\n');

  try {
    // 1. First, check the current maximum ID in the table
    console.log('📊 Checking current state of pricing_category_bookings table...');

    const { data: maxIdData, error: maxIdError } = await supabase
      .from('pricing_category_bookings')
      .select('id')
      .order('id', { ascending: false })
      .limit(1);

    if (maxIdError) {
      console.error('❌ Error fetching max ID:', maxIdError);
      return;
    }

    const currentMaxId = maxIdData && maxIdData[0] ? maxIdData[0].id : 0;
    console.log(`  Current maximum ID: ${currentMaxId}`);

    // 2. Check if the problematic ID exists
    const { data: existingRecord, error: checkError } = await supabase
      .from('pricing_category_bookings')
      .select('*')
      .eq('id', 15443);

    if (checkError) {
      console.error('❌ Error checking existing record:', checkError);
    } else if (existingRecord && existingRecord.length > 0) {
      console.log(`  ⚠️ Record with ID 15443 exists:`);
      console.log(`     Activity Booking ID: ${existingRecord[0].activity_booking_id}`);
      console.log(`     Created at: ${existingRecord[0].created_at}`);
    }

    // 3. Get the sequence information using raw SQL
    console.log('\n🔍 Checking sequence status...');

    const { data: sequenceInfo, error: seqError } = await supabase.rpc('get_sequence_info', {
      seq_name: 'pricing_category_bookings_id_seq'
    });

    if (seqError) {
      // If the RPC doesn't exist, we'll create a fix query directly
      console.log('  ℹ️ Cannot fetch sequence info directly, will reset based on max ID');
    } else if (sequenceInfo) {
      console.log(`  Current sequence value: ${sequenceInfo}`);
    }

    // 4. Fix the sequence - set it to max ID + 1
    const newSequenceValue = currentMaxId + 1;
    console.log(`\n🚀 Resetting sequence to: ${newSequenceValue}`);

    // Execute raw SQL to fix the sequence
    // Note: Supabase doesn't allow direct sequence manipulation via client
    // So we'll create a workaround or use an admin function

    // Option 1: Try to execute via RPC (if you have admin access)
    const { error: fixError } = await supabase.rpc('fix_pricing_sequence', {
      new_value: newSequenceValue
    });

    if (fixError) {
      console.log('\n⚠️ Cannot directly fix sequence. Alternative solutions:\n');
      console.log('Option 1: Run this SQL command in Supabase SQL editor:');
      console.log(`  ALTER SEQUENCE pricing_category_bookings_id_seq RESTART WITH ${newSequenceValue};`);

      console.log('\nOption 2: Delete the manually created record with ID 15443:');
      console.log('  DELETE FROM pricing_category_bookings WHERE id = 15443;');

      console.log('\nOption 3: Update the manually created record to use a different ID:');
      console.log(`  UPDATE pricing_category_bookings SET id = ${currentMaxId + 1} WHERE id = 15443;`);

      // Let's try Option 3 - update the problematic record
      console.log('\n🔄 Attempting Option 3: Updating the problematic record...');

      if (existingRecord && existingRecord.length > 0) {
        const { error: updateError } = await supabase
          .from('pricing_category_bookings')
          .update({ id: newSequenceValue })
          .eq('id', 15443);

        if (updateError) {
          console.error('  ❌ Could not update record:', updateError.message);
          console.log('\n📝 Manual fix required in Supabase dashboard:');
          console.log('  1. Go to SQL Editor in Supabase');
          console.log(`  2. Run: ALTER SEQUENCE pricing_category_bookings_id_seq RESTART WITH ${newSequenceValue};`);
        } else {
          console.log('  ✅ Successfully updated record ID from 15443 to', newSequenceValue);
        }
      }
    } else {
      console.log('✅ Sequence successfully reset!');
    }

    // 5. Verify the fix
    console.log('\n🔍 Verification:');
    const { count } = await supabase
      .from('pricing_category_bookings')
      .select('*', { count: 'exact', head: true });

    console.log(`  Total records in pricing_category_bookings: ${count}`);
    console.log(`  Maximum ID: ${currentMaxId}`);
    console.log(`  Next ID should be: ${newSequenceValue}`);

  } catch (error) {
    console.error('\n❌ Unexpected error:', error);
  }
}

// Create the RPC function if it doesn't exist
async function createFixSequenceFunction() {
  console.log('\n📝 Creating helper function in database...\n');

  const createFunctionSQL = `
    CREATE OR REPLACE FUNCTION fix_pricing_sequence(new_value INTEGER)
    RETURNS VOID AS $$
    BEGIN
      EXECUTE 'ALTER SEQUENCE pricing_category_bookings_id_seq RESTART WITH ' || new_value;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `;

  const getSequenceInfoSQL = `
    CREATE OR REPLACE FUNCTION get_sequence_info(seq_name TEXT)
    RETURNS BIGINT AS $$
    DECLARE
      seq_value BIGINT;
    BEGIN
      EXECUTE format('SELECT last_value FROM %I', seq_name) INTO seq_value;
      RETURN seq_value;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `;

  console.log('SQL functions to create (run these in Supabase SQL editor):');
  console.log('\n--- Function 1: Get Sequence Info ---');
  console.log(getSequenceInfoSQL);
  console.log('\n--- Function 2: Fix Sequence ---');
  console.log(createFunctionSQL);
}

// Main execution
if (require.main === module) {
  console.log('🔧 Pricing Category Bookings Sequence Fixer');
  console.log('============================================\n');

  fixPricingCategorySequence()
    .then(() => {
      console.log('\n---\n');
      createFixSequenceFunction();
      console.log('\n🏁 Process complete!');
      process.exit(0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}