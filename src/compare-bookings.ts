#!/usr/bin/env npx ts-node
import { supabase } from './config/supabase';

async function compareBookings() {
  console.log('🔍 Comparing Bookings 72548315 vs 65436732');
  console.log('=' .repeat(70));
  
  const booking1 = '72548315';
  const booking2 = '65436732';
  
  // Check booking_customers for both
  console.log('\n📊 Checking booking_customers table:');
  
  const { data: bc1 } = await supabase
    .from('booking_customers')
    .select('*')
    .eq('booking_id', booking1);
  
  const { data: bc2 } = await supabase
    .from('booking_customers')
    .select('*')
    .eq('booking_id', booking2);
  
  console.log(`\nBooking ${booking1}:`);
  if (bc1 && bc1.length > 0) {
    console.log('  ✅ Has booking_customer relationship');
    console.log('  Customer IDs:', bc1.map(r => r.customer_id).join(', '));
  } else {
    console.log('  ❌ NO booking_customer relationship found');
  }
  
  console.log(`\nBooking ${booking2}:`);
  if (bc2 && bc2.length > 0) {
    console.log('  ✅ Has booking_customer relationship');
    console.log('  Customer IDs:', bc2.map(r => r.customer_id).join(', '));
  } else {
    console.log('  ❌ NO booking_customer relationship found');
  }
  
  // Check bookings table
  console.log('\n📊 Checking bookings table:');
  
  const { data: b1 } = await supabase
    .from('bookings')
    .select('*')
    .eq('booking_id', booking1)
    .single();
  
  const { data: b2 } = await supabase
    .from('bookings')
    .select('*')
    .eq('booking_id', booking2)
    .single();
  
  console.log(`\nBooking ${booking1}:`);
  if (b1) {
    console.log('  ✅ Exists in bookings table');
    console.log('  Created at:', b1.created_at);
    console.log('  Tour name:', b1.tour_name);
  } else {
    console.log('  ❌ NOT found in bookings table');
  }
  
  console.log(`\nBooking ${booking2}:`);
  if (b2) {
    console.log('  ✅ Exists in bookings table');
    console.log('  Created at:', b2.created_at);
    console.log('  Tour name:', b2.tour_name);
  } else {
    console.log('  ❌ NOT found in bookings table');
  }
  
  // Check activity_bookings
  console.log('\n📊 Checking activity_bookings table:');
  
  const { data: ab1 } = await supabase
    .from('activity_bookings')
    .select('*')
    .eq('booking_id', booking1);
  
  const { data: ab2 } = await supabase
    .from('activity_bookings')
    .select('*')
    .eq('booking_id', booking2);
  
  console.log(`\nBooking ${booking1}:`);
  if (ab1 && ab1.length > 0) {
    console.log('  ✅ Has', ab1.length, 'activity_booking(s)');
  } else {
    console.log('  ❌ NO activity_bookings found');
  }
  
  console.log(`\nBooking ${booking2}:`);
  if (ab2 && ab2.length > 0) {
    console.log('  ✅ Has', ab2.length, 'activity_booking(s)');
  } else {
    console.log('  ❌ NO activity_bookings found');
  }
  
  // Get customer details if relationships exist
  if (bc1 && bc1.length > 0) {
    console.log(`\n👤 Customer details for booking ${booking1}:`);
    for (const rel of bc1) {
      const { data: customer } = await supabase
        .from('customers')
        .select('*')
        .eq('customer_id', rel.customer_id)
        .single();
      
      if (customer) {
        console.log(`  Customer ${customer.customer_id}:`);
        console.log(`    Name: ${customer.first_name} ${customer.last_name}`);
        console.log(`    Email: ${customer.email}`);
        console.log(`    Phone: ${customer.phone_number || 'N/A'}`);
      }
    }
  }
  
  if (bc2 && bc2.length > 0) {
    console.log(`\n👤 Customer details for booking ${booking2}:`);
    for (const rel of bc2) {
      const { data: customer } = await supabase
        .from('customers')
        .select('*')
        .eq('customer_id', rel.customer_id)
        .single();
      
      if (customer) {
        console.log(`  Customer ${customer.customer_id}:`);
        console.log(`    Name: ${customer.first_name} ${customer.last_name}`);
        console.log(`    Email: ${customer.email}`);
        console.log(`    Phone: ${customer.phone_number || 'N/A'}`);
      }
    }
  }
  
  // Summary
  console.log('\n' + '=' .repeat(70));
  console.log('📊 SUMMARY');
  console.log('=' .repeat(70));
  
  const has1 = bc1 && bc1.length > 0;
  const has2 = bc2 && bc2.length > 0;
  
  if (has1 && !has2) {
    console.log(`✅ ${booking1} HAS customer data`);
    console.log(`❌ ${booking2} MISSING customer data`);
  } else if (!has1 && has2) {
    console.log(`❌ ${booking1} MISSING customer data`);
    console.log(`✅ ${booking2} HAS customer data`);
  } else if (has1 && has2) {
    console.log(`✅ Both bookings have customer data`);
  } else {
    console.log(`❌ Both bookings are MISSING customer data`);
  }
}

compareBookings()
  .then(() => {
    console.log('\n✅ Comparison completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });