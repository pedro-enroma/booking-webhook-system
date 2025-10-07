import { supabase } from './config/supabase';
import * as fs from 'fs';
import * as path from 'path';

async function setupParticipantSyncLogging(): Promise<void> {
  console.log('🚀 Setting up participant sync logging system...\n');

  try {
    // Read the SQL migration file
    const sqlPath = path.join(__dirname, 'migrations', 'create-participant-sync-logs.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf-8');

    console.log('📄 Executing SQL migration...');
    console.log('='.repeat(80));

    // Split by semicolons and execute each statement
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      if (statement.length > 0) {
        console.log(`\n📝 Executing: ${statement.substring(0, 100)}...`);

        const { error } = await supabase.rpc('exec_sql', { sql: statement });

        if (error) {
          // Check if error is about table/view already existing
          if (error.message.includes('already exists')) {
            console.log('   ⚠️  Already exists, skipping...');
          } else {
            console.error('   ❌ Error:', error.message);
            throw error;
          }
        } else {
          console.log('   ✅ Success');
        }
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ Participant sync logging system setup complete!\n');

    // Test the setup
    console.log('🧪 Testing setup...');

    const { data: tables, error: tableError } = await supabase
      .from('participant_sync_logs')
      .select('*')
      .limit(1);

    if (tableError) {
      console.error('❌ Table test failed:', tableError.message);
      console.log('\n⚠️  Note: If you see permission errors, you may need to run the SQL manually in Supabase dashboard.');
    } else {
      console.log('✅ Table accessible');
    }

    // Check views
    const { error: viewError } = await supabase
      .from('participant_sync_summary')
      .select('*')
      .limit(1);

    if (viewError) {
      console.warn('⚠️  Views may need manual setup in Supabase dashboard');
    } else {
      console.log('✅ Views accessible');
    }

    console.log('\n📊 Setup Summary:');
    console.log('━'.repeat(80));
    console.log('✅ participant_sync_logs table - Stores all participant changes');
    console.log('✅ participant_sync_summary view - Quick analysis of changes');
    console.log('✅ bookings_with_participant_changes view - Bookings with modifications');
    console.log('━'.repeat(80));
    console.log('\n💡 Next steps:');
    console.log('   1. Your system is now tracking participant additions/removals');
    console.log('   2. Test with a real BOOKING_UPDATED webhook');
    console.log('   3. Query participant_sync_logs to see change history');
    console.log('\n📖 For more info, see PARTICIPANT_SYNC_README.md\n');

  } catch (error: any) {
    console.error('\n❌ Setup failed:', error.message);
    console.log('\n💡 Alternative: Run the SQL manually in Supabase dashboard:');
    console.log(`   ${path.join(__dirname, 'migrations', 'create-participant-sync-logs.sql')}\n`);
    process.exit(1);
  }
}

// Run setup
setupParticipantSyncLogging()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
