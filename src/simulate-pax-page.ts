#!/usr/bin/env npx ts-node
import { supabase } from './config/supabase';

async function simulatePaxPage() {
  console.log('🔍 Simulating PaxNamesPage Query Logic');
  console.log('=' .repeat(70));
  
  // These are our test bookings
  const bookingIds = ['72548315', '65436732'];
  
  console.log('\n📊 Step 1: Query booking_customers');
  console.log('  Booking IDs:', bookingIds);
  
  const { data: bookingCustomers, error: bcError } = await supabase
    .from('booking_customers')
    .select('booking_id, customer_id')
    .in('booking_id', bookingIds);
  
  if (bcError) {
    console.log('  ❌ Error:', bcError);
    return;
  }
  
  console.log('  ✅ Found', bookingCustomers?.length, 'relationships:');
  bookingCustomers?.forEach(bc => {
    console.log(`    - Booking ${bc.booking_id} -> Customer ${bc.customer_id} (type: ${typeof bc.customer_id})`);
  });
  
  if (!bookingCustomers || bookingCustomers.length === 0) {
    console.log('  No booking_customers found');
    return;
  }
  
  console.log('\n📊 Step 2: Map customer_ids to strings');
  const customerIds = bookingCustomers.map(bc => String(bc.customer_id));
  console.log('  Customer IDs as strings:', customerIds);
  
  console.log('\n📊 Step 3: Query customers table');
  const { data: customers, error: custError } = await supabase
    .from('customers')
    .select('customer_id, first_name, last_name, phone_number, email')
    .in('customer_id', customerIds);
  
  if (custError) {
    console.log('  ❌ Error:', custError);
    return;
  }
  
  console.log('  ✅ Found', customers?.length, 'customers:');
  customers?.forEach(c => {
    console.log(`    - ${c.customer_id} (type: ${typeof c.customer_id}): ${c.first_name} ${c.last_name}`);
  });
  
  console.log('\n📊 Step 4: Create customer map');
  const customerMap = new Map();
  customers?.forEach(c => {
    const key = String(c.customer_id);
    console.log(`  Setting map["${key}"] = ${c.first_name} ${c.last_name}`);
    customerMap.set(key, c);
  });
  
  console.log('\n📊 Step 5: Create booking -> customer map');
  const customerDataMap = new Map();
  bookingCustomers.forEach(bc => {
    const customerKey = String(bc.customer_id);
    const customer = customerMap.get(customerKey);
    const bookingKey = String(bc.booking_id);
    
    console.log(`\n  Processing booking ${bc.booking_id}:`);
    console.log(`    Customer ID: ${bc.customer_id} -> String: "${customerKey}"`);
    console.log(`    Looking up in map with key "${customerKey}"`);
    console.log(`    Found customer:`, customer ? `${customer.first_name} ${customer.last_name}` : 'NOT FOUND');
    
    if (customer) {
      customerDataMap.set(bookingKey, customer);
      console.log(`    ✅ Set customerDataMap["${bookingKey}"] = ${customer.first_name}`);
    } else {
      console.log(`    ❌ Customer not found in map!`);
    }
  });
  
  console.log('\n📊 Step 6: Final lookup test');
  bookingIds.forEach(bookingId => {
    const customer = customerDataMap.get(bookingId);
    console.log(`  Booking ${bookingId}: ${customer ? `${customer.first_name} ${customer.last_name}` : 'NO CUSTOMER DATA'}`);
  });
  
  console.log('\n📊 Debugging: Map contents');
  console.log('  customerMap keys:', Array.from(customerMap.keys()));
  console.log('  customerDataMap keys:', Array.from(customerDataMap.keys()));
}

simulatePaxPage()
  .then(() => {
    console.log('\n✅ Simulation completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });