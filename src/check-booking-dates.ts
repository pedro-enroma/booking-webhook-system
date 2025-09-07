#!/usr/bin/env npx ts-node
import { supabase } from './config/supabase';

async function checkBookingDates() {
  console.log('🔍 Checking Booking Dates and Positions');
  console.log('=' .repeat(70));
  
  const testBookings = ['72548315', '65436732'];
  
  console.log('\n📊 Test bookings details:');
  for (const id of testBookings) {
    const { data: booking } = await supabase
      .from('bookings')
      .select('booking_id, created_at')
      .eq('booking_id', id)
      .single();
    
    if (booking) {
      console.log(`  ${id}: Created ${booking.created_at}`);
    } else {
      console.log(`  ${id}: NOT FOUND`);
    }
  }
  
  // Count how many bookings are newer
  console.log('\n📊 Position in booking list:');
  
  for (const id of testBookings) {
    const { data: booking } = await supabase
      .from('bookings')
      .select('created_at')
      .eq('booking_id', id)
      .single();
    
    if (booking) {
      const { count } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .gt('created_at', booking.created_at);
      
      console.log(`  ${id}: Position ${(count || 0) + 1} (${count || 0} bookings are newer)`);
    }
  }
  
  // Get total bookings count
  const { count: total } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true });
  
  console.log(`\n📊 Total bookings in database: ${total}`);
  
  // Check what page size would need to include these bookings
  console.log('\n📊 Page size needed to include test bookings:');
  
  const { data: allBookings } = await supabase
    .from('bookings')
    .select('booking_id')
    .order('created_at', { ascending: false })
    .limit(500);
  
  const positions = testBookings.map(id => {
    const pos = allBookings?.findIndex(b => b.booking_id === id);
    return { id, position: pos !== undefined && pos >= 0 ? pos + 1 : 'NOT IN TOP 500' };
  });
  
  positions.forEach(({ id, position }) => {
    console.log(`  ${id}: ${position}`);
  });
}

checkBookingDates()
  .then(() => {
    console.log('\n✅ Check completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });