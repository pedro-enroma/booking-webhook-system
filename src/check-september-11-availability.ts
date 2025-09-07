#!/usr/bin/env npx ts-node
import { supabase } from './config/supabase';

async function checkSeptember11Availability() {
  console.log('🔍 Checking Availability for Product 220107 on September 11th');
  console.log('=' .repeat(70));
  
  const productId = '220107';
  const date = '2025-09-11';
  
  // Check availability in Supabase
  console.log('\n📊 Availability in Supabase:');
  const { data: availability, error } = await supabase
    .from('activity_availability')
    .select('*')
    .eq('activity_id', productId)
    .eq('local_date', date)
    .order('local_time', { ascending: true });
  
  if (error) {
    console.error('Error fetching availability:', error);
    return;
  }
  
  if (!availability || availability.length === 0) {
    console.log('  ❌ No availability found for this date');
    return;
  }
  
  console.log(`  Found ${availability.length} slots:\n`);
  
  availability.forEach((slot, index) => {
    console.log(`  Slot ${index + 1}:`);
    console.log(`    ID: ${slot.availability_id}`);
    console.log(`    Time: ${slot.local_time}`);
    console.log(`    Available: ${slot.vacancy_available} / ${slot.vacancy_opening}`);
    console.log(`    Sold: ${slot.vacancy_sold}`);
    console.log(`    Status: ${slot.status}`);
    console.log(`    Option ID: ${slot.option_id || 'N/A'}`);
    console.log(`    Price: €${slot.price_amount || 0}`);
    console.log(`    Created: ${slot.created_at}`);
    console.log(`    Updated: ${slot.updated_at}`);
    console.log('');
  });
  
  // Check for any duplicates or issues
  console.log('📊 Analysis:');
  
  // Group by local_time to check for duplicates
  const timeGroups = new Map<string, any[]>();
  availability.forEach(slot => {
    const time = slot.local_time;
    if (!timeGroups.has(time)) {
      timeGroups.set(time, []);
    }
    timeGroups.get(time)!.push(slot);
  });
  
  // Check for duplicate times
  let hasDuplicates = false;
  timeGroups.forEach((slots, time) => {
    if (slots.length > 1) {
      hasDuplicates = true;
      console.log(`  ⚠️  Duplicate slots at ${time}: ${slots.length} entries`);
      slots.forEach(s => {
        console.log(`      - ID: ${s.availability_id}, Option: ${s.option_id}, Created: ${s.created_at}`);
      });
    }
  });
  
  if (!hasDuplicates) {
    console.log('  ✅ No duplicate time slots found');
  }
  
  // List unique start times
  console.log(`\n  Unique start times: ${timeGroups.size}`);
  Array.from(timeGroups.keys()).sort().forEach(time => {
    console.log(`    - ${time}`);
  });
  
  // Check recent updates
  console.log('\n📊 Recent sync history:');
  const { data: recentSyncs } = await supabase
    .from('activity_availability')
    .select('updated_at, local_time')
    .eq('activity_id', productId)
    .eq('local_date', date)
    .order('updated_at', { ascending: false })
    .limit(10);
  
  if (recentSyncs && recentSyncs.length > 0) {
    const lastSync = new Date(recentSyncs[0].updated_at);
    console.log(`  Last synced: ${lastSync.toLocaleString()}`);
  }
  
  console.log('\n📊 Bokun vs Supabase Summary:');
  console.log(`  Bokun: 5 slots (as you mentioned)`);
  console.log(`  Supabase: ${availability.length} slots`);
  if (availability.length < 5) {
    console.log(`  ⚠️  Missing ${5 - availability.length} slot(s) in Supabase`);
  }
}

checkSeptember11Availability()
  .then(() => {
    console.log('\n✅ Check completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });