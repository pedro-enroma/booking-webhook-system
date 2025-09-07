#!/usr/bin/env npx ts-node
import { supabase } from './config/supabase';

async function checkBooking59346865() {
  console.log('🔍 Checking Booking 59346865');
  console.log('=' .repeat(70));
  
  const bookingId = '59346865';
  
  // Check if booking exists
  console.log('\n📊 Checking bookings table:');
  const { data: booking } = await supabase
    .from('bookings')
    .select('*')
    .eq('booking_id', bookingId)
    .single();
  
  if (booking) {
    console.log('  ✅ Booking exists');
    console.log('  Created:', booking.created_at);
  } else {
    console.log('  ❌ Booking NOT found');
  }
  
  // Check booking_customers
  console.log('\n📊 Checking booking_customers relationship:');
  const { data: bookingCustomer } = await supabase
    .from('booking_customers')
    .select('*')
    .eq('booking_id', bookingId);
  
  if (bookingCustomer && bookingCustomer.length > 0) {
    console.log('  ✅ Has customer relationship');
    console.log('  Customer ID:', bookingCustomer[0].customer_id);
    
    // Get customer details
    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('customer_id', bookingCustomer[0].customer_id)
      .single();
    
    if (customer) {
      console.log('\n👤 Customer details:');
      console.log('  Name:', customer.first_name, customer.last_name);
      console.log('  Email:', customer.email);
      console.log('  Phone:', customer.phone_number || 'N/A');
      console.log('  Customer ID:', customer.customer_id);
    }
  } else {
    console.log('  ❌ NO customer relationship found');
  }
  
  // Check activity_bookings
  console.log('\n📊 Checking activity_bookings:');
  const { data: activityBookings } = await supabase
    .from('activity_bookings')
    .select('*')
    .eq('booking_id', bookingId);
  
  if (activityBookings && activityBookings.length > 0) {
    console.log('  ✅ Has', activityBookings.length, 'activity booking(s)');
  } else {
    console.log('  ❌ NO activity bookings');
  }
}

checkBooking59346865()
  .then(() => {
    console.log('\n✅ Check completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });