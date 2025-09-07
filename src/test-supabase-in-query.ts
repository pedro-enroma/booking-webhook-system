#!/usr/bin/env npx ts-node
import { supabase } from './config/supabase';

async function testSupabaseInQuery() {
  console.log('🔍 Testing Supabase IN Query with Mixed Customer ID Lengths');
  console.log('=' .repeat(70));
  
  const shortId = '169320102';  // 9 digits - from booking 72548315
  const longId = '1757004745682372';  // 16 digits - from booking 65436732
  
  // Test 1: Query each individually
  console.log('\n📊 Test 1: Individual queries');
  
  const { data: c1 } = await supabase
    .from('customers')
    .select('customer_id, first_name, last_name, email')
    .eq('customer_id', shortId)
    .single();
  
  console.log(`\nShort ID (${shortId}):`);
  if (c1) {
    console.log('  ✅ Found:', c1.first_name, c1.last_name);
  } else {
    console.log('  ❌ Not found');
  }
  
  const { data: c2 } = await supabase
    .from('customers')
    .select('customer_id, first_name, last_name, email')
    .eq('customer_id', longId)
    .single();
  
  console.log(`\nLong ID (${longId}):`);
  if (c2) {
    console.log('  ✅ Found:', c2.first_name, c2.last_name);
  } else {
    console.log('  ❌ Not found');
  }
  
  // Test 2: Query with IN clause - as strings
  console.log('\n📊 Test 2: IN query with both IDs as strings');
  
  const { data: inResult1, error: err1 } = await supabase
    .from('customers')
    .select('customer_id, first_name, last_name, email')
    .in('customer_id', [shortId, longId]);
  
  if (err1) {
    console.log('  ❌ Error:', err1.message);
  } else if (inResult1) {
    console.log('  ✅ Found', inResult1.length, 'customers:');
    inResult1.forEach(c => {
      console.log(`    - ${c.customer_id}: ${c.first_name} ${c.last_name}`);
    });
  }
  
  // Test 3: Check data type of customer_id in database
  console.log('\n📊 Test 3: Checking actual data types');
  
  const { data: raw1 } = await supabase
    .from('customers')
    .select('customer_id')
    .eq('customer_id', shortId)
    .single();
  
  const { data: raw2 } = await supabase
    .from('customers')
    .select('customer_id')
    .eq('customer_id', longId)
    .single();
  
  console.log(`\nShort ID from DB: ${raw1?.customer_id} (type: ${typeof raw1?.customer_id})`);
  console.log(`Long ID from DB: ${raw2?.customer_id} (type: ${typeof raw2?.customer_id})`);
  
  // Test 4: Try with numbers
  console.log('\n📊 Test 4: IN query with numeric values');
  
  const numShort = parseInt(shortId);
  const numLong = parseInt(longId);
  
  console.log(`  Short as number: ${numShort}`);
  console.log(`  Long as number: ${numLong} (might overflow?)`);
  
  const { data: inResult2, error: err2 } = await supabase
    .from('customers')
    .select('customer_id, first_name, last_name, email')
    .in('customer_id', [numShort, numLong]);
  
  if (err2) {
    console.log('  ❌ Error:', err2.message);
  } else if (inResult2) {
    console.log('  ✅ Found', inResult2.length, 'customers');
  }
  
  // Test 5: Check column type
  console.log('\n📊 Test 5: Database column info');
  
  const { data: tableInfo } = await supabase
    .rpc('get_table_info', { table_name: 'customers' })
    .single();
  
  if (tableInfo) {
    console.log('  Column info:', tableInfo);
  } else {
    // Try a simpler query to understand the schema
    const { data: sample } = await supabase
      .from('customers')
      .select('*')
      .limit(1)
      .single();
    
    if (sample) {
      console.log('  Sample record types:');
      Object.entries(sample).forEach(([key, value]) => {
        console.log(`    ${key}: ${typeof value}`);
      });
    }
  }
}

testSupabaseInQuery()
  .then(() => {
    console.log('\n✅ Test completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });