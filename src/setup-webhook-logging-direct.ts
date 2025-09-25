import { supabase } from './config/supabase';

async function setupWebhookLogging() {
  console.log('🔧 Setting up webhook logging tables...');

  try {
    // Create the main table
    console.log('Creating webhook_logs table...');
    const { error: tableError } = await supabase.from('webhook_logs').select('id').limit(1);

    if (tableError && tableError.code === 'PGRST204') {
      console.log('Table does not exist yet.');
      console.log('\n⚠️  IMPORTANT: Please run the following SQL in your Supabase dashboard:\n');
      console.log('1. Go to: https://app.supabase.com/project/YOUR_PROJECT/sql');
      console.log('2. Copy and paste the contents of: src/database/create-webhook-logs-table.sql');
      console.log('3. Click "Run"\n');

      console.log('The SQL creates:');
      console.log('  - webhook_logs table for storing all webhook data');
      console.log('  - Indexes for optimal query performance');
      console.log('  - webhook_issues view for finding problematic webhooks');
      console.log('  - webhook_sequences view for analyzing webhook order');

    } else if (tableError) {
      console.log('Error checking table:', tableError.message);
    } else {
      console.log('✅ webhook_logs table already exists!');
    }

    console.log('\n📋 Quick test - attempting to insert a test log entry...');

    const testEntry = {
      booking_id: 'TEST-001',
      parent_booking_id: 'TEST-PARENT-001',
      confirmation_code: 'TEST-CONFIRM',
      action: 'TEST_ACTION',
      status: 'TEST',
      webhook_type: 'BOOKING' as const,
      received_at: new Date().toISOString(),
      raw_payload: { test: true },
      out_of_order: false,
      is_duplicate: false
    };

    const { data, error: insertError } = await supabase
      .from('webhook_logs')
      .insert(testEntry)
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '42P01') {
        console.log('❌ Table does not exist. Please create it using the SQL file.');
      } else {
        console.log('❌ Error inserting test entry:', insertError.message);
      }
    } else {
      console.log('✅ Test entry inserted successfully!');

      // Clean up test entry
      if (data && data.id) {
        await supabase.from('webhook_logs').delete().eq('id', data.id);
        console.log('✅ Test entry cleaned up.');
      }
    }

    console.log('\n🔍 Available debug endpoints:');
    console.log('   GET /webhook/debug/history/:confirmationCode - Check webhook order issues');
    console.log('   GET /webhook/debug/logs/:bookingId - Get webhook logs for a booking');
    console.log('   GET /webhook/debug/report - Generate webhook report');
    console.log('   GET /webhook/debug/log-file - Get path to detailed log file');
    console.log('\n✅ Setup check complete!');

  } catch (error) {
    console.error('❌ Error during setup:', error);
  }

  process.exit(0);
}

// Run setup
setupWebhookLogging();