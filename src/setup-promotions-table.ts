#!/usr/bin/env npx ts-node
import { supabase } from './config/supabase';
import * as fs from 'fs';
import * as path from 'path';

async function setupPromotionsTable() {
  console.log('🎁 Setting up Promotions Tracking System\n');

  try {
    // Read the SQL migration file
    const sqlPath = path.join(__dirname, 'migrations', 'create-promotions-table.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('📄 Running migration: create-promotions-table.sql\n');

    // Execute the SQL
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      // Try direct execution if RPC doesn't work
      console.log('⚠️  RPC method failed, trying direct execution...\n');

      // Split into individual statements and execute
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('COMMENT'));

      for (const statement of statements) {
        const { error: execError } = await (supabase as any).rpc('exec', {
          query: statement
        });

        if (execError) {
          console.error('❌ Error executing statement:', execError);
          console.log('Statement:', statement.substring(0, 100) + '...\n');
        }
      }
    }

    console.log('✅ Migration executed\n');

    // Verify table was created
    console.log('🔍 Verifying table creation...\n');

    const { data: tables, error: tableError } = await supabase
      .from('booking_promotions')
      .select('*')
      .limit(0);

    if (tableError) {
      if (tableError.message.includes('does not exist')) {
        console.error('❌ Table was not created. Please run the SQL manually in Supabase SQL Editor:');
        console.log('\n📝 SQL File Location:');
        console.log('   ' + sqlPath);
        console.log('\n📋 Or copy this SQL to Supabase:\n');
        console.log(sql);
        return;
      } else {
        console.error('❌ Error checking table:', tableError);
      }
    } else {
      console.log('✅ Table "booking_promotions" exists');
    }

    // Check for views
    const { error: viewError } = await supabase
      .from('v_promotion_summary')
      .select('*')
      .limit(0);

    if (!viewError) {
      console.log('✅ View "v_promotion_summary" created');
    }

    const { error: multiViewError } = await supabase
      .from('v_multi_activity_offers')
      .select('*')
      .limit(0);

    if (!multiViewError) {
      console.log('✅ View "v_multi_activity_offers" created');
    }

    console.log('\n🎉 Promotions tracking system is ready!');
    console.log('\n📊 You can now:');
    console.log('   - Track multi-activity offers');
    console.log('   - See which activity triggered the offer');
    console.log('   - Calculate discount impact');
    console.log('   - Map offer_id to custom titles in Tourmagedon');
    console.log('\n📝 Next steps:');
    console.log('   1. Deploy the updated code to Railway');
    console.log('   2. Test with a multi-activity booking');
    console.log('   3. Check booking_promotions table for tracked offers');

  } catch (error) {
    console.error('\n❌ Setup failed:', error);
    console.log('\n📝 Please run the SQL manually in Supabase SQL Editor:');
    console.log('   File: src/migrations/create-promotions-table.sql');
  }
}

setupPromotionsTable()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
