import { supabase } from './config/supabase';
import * as fs from 'fs';
import * as path from 'path';

async function setupWebhookLogging() {
  console.log('🔧 Setting up webhook logging tables...');

  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, 'database', 'create-webhook-logs-table.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf-8');

    // Split SQL statements (simple split by semicolon - may need refinement for complex SQLs)
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    // Execute each statement
    for (const statement of statements) {
      console.log(`Executing: ${statement.substring(0, 50)}...`);

      const { error } = await supabase.rpc('execute_sql', {
        sql: statement + ';'
      });

      if (error) {
        // Try direct execution if RPC fails
        console.log('RPC failed, trying alternative method...');
        // Note: Supabase client doesn't support direct SQL execution
        // You'll need to run this SQL directly in the Supabase dashboard
        console.warn(`Please execute this SQL manually in Supabase dashboard:
${statement};
`);
      }
    }

    console.log('✅ Webhook logging setup completed!');
    console.log('');
    console.log('📝 Note: If any statements failed, please run the following SQL file manually in your Supabase dashboard:');
    console.log(`   ${sqlPath}`);
    console.log('');
    console.log('🔍 Available debug endpoints:');
    console.log('   GET /webhook/debug/history/:confirmationCode - Check webhook order issues');
    console.log('   GET /webhook/debug/logs/:bookingId - Get webhook logs for a booking');
    console.log('   GET /webhook/debug/report - Generate webhook report');
    console.log('   GET /webhook/debug/log-file - Get path to detailed log file');
    console.log('');

  } catch (error) {
    console.error('❌ Error setting up webhook logging:', error);
    process.exit(1);
  }
}

// Run setup
setupWebhookLogging();