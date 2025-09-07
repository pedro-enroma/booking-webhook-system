#!/usr/bin/env npx ts-node
import { supabase } from './config/supabase';

async function checkRecentBookingsCustomers() {
  console.log('🔍 Checking Customer Data for Recent Bookings');
  console.log('=' .repeat(70));
  
  // Get recent bookings
  const { data: recentBookings, error: bookingError } = await supabase
    .from('bookings')
    .select('booking_id, created_at')
    .order('created_at', { ascending: false })
    .limit(20);
  
  if (bookingError) {
    console.log('Error fetching bookings:', bookingError);
    return;
  }
  
  if (!recentBookings) {
    console.log('No bookings found');
    return;
  }
  
  const bookingIds = recentBookings.map(b => b.booking_id);
  
  console.log('\n📊 Fetching customer relationships for 20 recent bookings...');
  
  // Get booking_customers
  const { data: bookingCustomers } = await supabase
    .from('booking_customers')
    .select('booking_id, customer_id')
    .in('booking_id', bookingIds);
  
  // Get unique customer IDs
  const customerIds = [...new Set(bookingCustomers?.map(bc => String(bc.customer_id)) || [])];
  
  // Get customer data
  const { data: customers } = await supabase
    .from('customers')
    .select('customer_id, first_name, last_name, email')
    .in('customer_id', customerIds);
  
  // Create maps
  const customerMap = new Map();
  customers?.forEach(c => {
    customerMap.set(String(c.customer_id), c);
  });
  
  const bookingCustomerMap = new Map();
  bookingCustomers?.forEach(bc => {
    const customer = customerMap.get(String(bc.customer_id));
    if (customer) {
      bookingCustomerMap.set(String(bc.booking_id), customer);
    }
  });
  
  console.log('\n📊 Results:');
  console.log(`  Total bookings checked: ${recentBookings.length}`);
  console.log(`  Bookings with customers: ${bookingCustomerMap.size}`);
  console.log(`  Bookings without customers: ${recentBookings.length - bookingCustomerMap.size}`);
  
  console.log('\n📊 Detailed breakdown:');
  recentBookings.forEach(booking => {
    const customer = bookingCustomerMap.get(String(booking.booking_id));
    const status = customer ? '✅' : '❌';
    const name = customer ? `${customer.first_name} ${customer.last_name}` : 'NO CUSTOMER';
    console.log(`  ${status} ${booking.booking_id}: ${name} (${booking.created_at?.substring(0, 10)})`);
  });
  
  // Specifically check our two test bookings
  console.log('\n📊 Specific bookings check:');
  const testIds = ['72548315', '65436732'];
  
  for (const id of testIds) {
    const customer = bookingCustomerMap.get(id);
    if (customer) {
      console.log(`  ✅ ${id}: ${customer.first_name} ${customer.last_name} (${customer.email})`);
    } else {
      // Check if it's in the booking_customers table
      const { data: bc } = await supabase
        .from('booking_customers')
        .select('customer_id')
        .eq('booking_id', id)
        .single();
      
      if (bc) {
        console.log(`  ⚠️  ${id}: Has relationship (customer_id: ${bc.customer_id}) but customer not found in batch query`);
      } else {
        console.log(`  ❌ ${id}: No customer relationship`);
      }
    }
  }
}

checkRecentBookingsCustomers()
  .then(() => {
    console.log('\n✅ Check completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });