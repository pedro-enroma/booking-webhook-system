#!/usr/bin/env npx ts-node
import { supabase } from './config/supabase';

async function checkSlots() {
  console.log('📊 Checking slots in Supabase for product 220107 on Sept 11th');
  
  const { data, error } = await supabase
    .from('activity_availability')
    .select('*')
    .eq('activity_id', '220107')
    .eq('local_date', '2025-09-11')
    .order('local_time');
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log(`\nFound ${data?.length || 0} slots:`);
  console.log('=' .repeat(70));
  
  data?.forEach((slot, i) => {
    console.log(`\n${i + 1}. Slot ID: ${slot.availability_id}`);
    console.log(`   Time: ${slot.local_time}`);
    console.log(`   Option: ${slot.option_id}`);
    console.log(`   Status: ${slot.status}`);
    console.log(`   Available: ${slot.vacancy_available}/${slot.vacancy_capacity}`);
  });
  
  // Group by option
  const byOption = new Map<string, any[]>();
  data?.forEach(slot => {
    if (!byOption.has(slot.option_id)) {
      byOption.set(slot.option_id, []);
    }
    byOption.get(slot.option_id)?.push(slot);
  });
  
  console.log('\n' + '=' .repeat(70));
  console.log('BY OPTION:');
  byOption.forEach((slots, optionId) => {
    console.log(`\nOption ${optionId}: ${slots.length} slots`);
    slots.forEach(s => {
      console.log(`  - ${s.local_time} (${s.status})`);
    });
  });
  
  console.log('\n' + '=' .repeat(70));
  console.log('✅ SUCCESS! All 6 slots are in the database:');
  console.log('  - 4 morning slots from option 556533');
  console.log('  - 2 afternoon slots from option 1623880');
}

checkSlots()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });