import { supabase } from '../config/supabase';
import * as fs from 'fs';
import * as path from 'path';

async function runGTMMigration() {
  console.log('🚀 Starting GTM columns migration...');
  
  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, 'add-gtm-columns.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Split by semicolon and execute each statement
    const statements = sql
      .split(';')
      .filter(stmt => stmt.trim())
      .map(stmt => stmt.trim() + ';');
    
    for (const statement of statements) {
      if (statement.includes('ALTER TABLE') || statement.includes('CREATE INDEX') || statement.includes('COMMENT ON')) {
        console.log('📝 Executing:', statement.substring(0, 50) + '...');
        
        // Execute raw SQL using Supabase RPC
        const { error } = await supabase.rpc('exec_sql', {
          query: statement
        }).single();
        
        if (error) {
          console.error('❌ Error executing statement:', error);
          // Continue with next statement even if one fails
        } else {
          console.log('✅ Statement executed successfully');
        }
      }
    }
    
    // Verify the columns were added
    const { data, error } = await supabase
      .from('activity_bookings')
      .select('affiliate_id, first_campaign')
      .limit(1);
    
    if (!error) {
      console.log('✅ Migration completed successfully!');
      console.log('📊 New columns are now available: affiliate_id, first_campaign');
    } else {
      console.log('⚠️ Migration may have partially succeeded. Check manually.');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
runGTMMigration();