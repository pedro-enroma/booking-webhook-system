#!/usr/bin/env npx ts-node
import { OctoService } from './services/octoService';
import { supabase } from './config/supabase';

async function testNewSync() {
  console.log('🔍 Testing Updated Sync for Product 220107');
  console.log('=' .repeat(70));
  
  const productId = '220107';
  const date = '2025-09-11';
  
  console.log(`\n📊 BEFORE: Checking current slots in Supabase...`);
  const { data: beforeSlots } = await supabase
    .from('activity_availability')
    .select('availability_id, local_time, option_id')
    .eq('activity_id', productId)
    .eq('local_date', date)
    .order('local_time', { ascending: true });
  
  console.log(`  Found ${beforeSlots?.length || 0} slots before sync:`);
  beforeSlots?.forEach((s, i) => {
    console.log(`    ${i + 1}. Time: ${s.local_time}, ID: ${s.availability_id}`);
  });
  
  console.log('\n🚀 Running sync with ALL options...');
  
  const octoService = new OctoService();
  
  try {
    const slotsCount = await octoService.syncAvailabilityOptimized(productId, date, date);
    console.log(`\n✅ Sync completed: ${slotsCount} total slots processed`);
  } catch (error: any) {
    console.error('❌ Sync error:', error.message);
  }
  
  console.log(`\n📊 AFTER: Checking slots in Supabase...`);
  const { data: afterSlots } = await supabase
    .from('activity_availability')
    .select('availability_id, local_time, option_id, status, vacancy_available')
    .eq('activity_id', productId)
    .eq('local_date', date)
    .order('local_time', { ascending: true });
  
  console.log(`  Found ${afterSlots?.length || 0} slots after sync:`);
  afterSlots?.forEach((s, i) => {
    console.log(`    ${i + 1}. Time: ${s.local_time}, Status: ${s.status}, Available: ${s.vacancy_available}, ID: ${s.availability_id}`);
  });
  
  // Compare
  const beforeCount = beforeSlots?.length || 0;
  const afterCount = afterSlots?.length || 0;
  
  console.log('\n📊 SUMMARY:');
  console.log('=' .repeat(70));
  console.log(`  Before sync: ${beforeCount} slots`);
  console.log(`  After sync: ${afterCount} slots`);
  console.log(`  Difference: ${afterCount > beforeCount ? '+' : ''}${afterCount - beforeCount} slots`);
  
  if (afterCount === 6) {
    console.log('\n✅ SUCCESS! All 6 slots are now in Supabase!');
    console.log('  - 4 morning slots (09:30, 10:00, 10:25, 10:30)');
    console.log('  - 2 afternoon slots (15:15, 15:30)');
  } else if (afterCount > beforeCount) {
    console.log(`\n✅ Improved! Added ${afterCount - beforeCount} new slot(s).`);
  } else {
    console.log('\n⚠️  No new slots added. Check the logs for any errors.');
  }
}

testNewSync()
  .then(() => {
    console.log('\n✅ Test completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });