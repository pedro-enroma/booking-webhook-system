#!/usr/bin/env npx ts-node
import { supabase } from './config/supabase';

async function checkCustomerIdTypes() {
  console.log('🔍 Analyzing Customer ID Format Issues');
  console.log('=' .repeat(70));
  
  // Get a sample of customer IDs
  const { data: customers } = await supabase
    .from('customers')
    .select('customer_id, email, created_at')
    .order('created_at', { ascending: false })
    .limit(20);
  
  console.log('\n📊 Recent Customer IDs:');
  customers?.forEach(c => {
    const customerId = String(c.customer_id);
    const idLength = customerId.length;
    const isNumericLooking = /^\d+$/.test(customerId);
    console.log(`  ID: ${customerId.padEnd(20)} Length: ${idLength} Numeric: ${isNumericLooking} Created: ${c.created_at?.substring(0, 10)}`);
  });
  
  // Check the specific problematic customer IDs
  console.log('\n🔍 Checking Specific Customer IDs:');
  
  const { data: customer1 } = await supabase
    .from('customers')
    .select('*')
    .eq('customer_id', '169320102')
    .single();
  
  const { data: customer2 } = await supabase
    .from('customers')
    .select('*')
    .eq('customer_id', '1757004745682372')
    .single();
  
  console.log('\nCustomer 169320102 (booking 72548315):');
  if (customer1) {
    console.log('  ✅ Found');
    console.log('  Created:', customer1.created_at);
    console.log('  UUID:', customer1.uuid);
  } else {
    console.log('  ❌ Not found');
  }
  
  console.log('\nCustomer 1757004745682372 (booking 65436732):');
  if (customer2) {
    console.log('  ✅ Found');
    console.log('  Created:', customer2.created_at);
    console.log('  UUID:', customer2.uuid);
  } else {
    console.log('  ❌ Not found');
  }
  
  // Count customer IDs by length
  console.log('\n📊 Customer ID Length Distribution:');
  
  const { data: allCustomers } = await supabase
    .from('customers')
    .select('customer_id');
  
  const lengthMap = new Map<number, number>();
  allCustomers?.forEach(c => {
    const len = String(c.customer_id).length;
    lengthMap.set(len, (lengthMap.get(len) || 0) + 1);
  });
  
  Array.from(lengthMap.entries())
    .sort((a, b) => a[0] - b[0])
    .forEach(([len, count]) => {
      console.log(`  Length ${len}: ${count} customers`);
    });
  
  // Check if the issue is with customer_id as string vs number in the query
  console.log('\n🔍 Testing Query Variations for booking 72548315:');
  
  // Test 1: Query as string
  const { data: test1 } = await supabase
    .from('booking_customers')
    .select(`
      booking_id,
      customer_id,
      customers (
        customer_id,
        first_name,
        last_name,
        email
      )
    `)
    .eq('booking_id', '72548315');
  
  console.log('\nQuerying with booking_id as STRING "72548315":');
  if (test1 && test1.length > 0) {
    console.log('  ✅ Found', test1.length, 'relationship(s)');
    console.log('  Customer data included:', test1[0].customers ? 'YES' : 'NO');
    if (test1[0].customers) {
      console.log('  Customer:', test1[0].customers);
    }
  } else {
    console.log('  ❌ No results');
  }
  
  // Test 2: Query with number
  const { data: test2 } = await supabase
    .from('booking_customers')
    .select(`
      booking_id,
      customer_id,
      customers (
        customer_id,
        first_name,
        last_name,
        email
      )
    `)
    .eq('booking_id', 72548315);
  
  console.log('\nQuerying with booking_id as NUMBER 72548315:');
  if (test2 && test2.length > 0) {
    console.log('  ✅ Found', test2.length, 'relationship(s)');
    console.log('  Customer data included:', test2[0].customers ? 'YES' : 'NO');
  } else {
    console.log('  ❌ No results');
  }
  
  // Do the same for 65436732
  console.log('\n🔍 Testing Query Variations for booking 65436732:');
  
  const { data: test3 } = await supabase
    .from('booking_customers')
    .select(`
      booking_id,
      customer_id,
      customers (
        customer_id,
        first_name,
        last_name,
        email
      )
    `)
    .eq('booking_id', '65436732');
  
  console.log('\nQuerying with booking_id as STRING "65436732":');
  if (test3 && test3.length > 0) {
    console.log('  ✅ Found', test3.length, 'relationship(s)');
    console.log('  Customer data included:', test3[0].customers ? 'YES' : 'NO');
    if (test3[0].customers) {
      console.log('  Customer:', test3[0].customers);
    }
  } else {
    console.log('  ❌ No results');
  }
}

checkCustomerIdTypes()
  .then(() => {
    console.log('\n✅ Analysis completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });