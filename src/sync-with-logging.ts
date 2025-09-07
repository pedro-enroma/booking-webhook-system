#!/usr/bin/env npx ts-node
import axios from 'axios';
import { config } from 'dotenv';
import { supabase } from './config/supabase';

config();

async function syncWithLogging() {
  console.log('🔍 Syncing Product 220107 for September 11th with Detailed Logging');
  console.log('=' .repeat(70));
  
  const productId = '220107';
  const date = '2025-09-11';
  
  const apiKey = process.env.BOKUN_API_KEY;
  const baseUrl = process.env.BOKUN_API_URL || 'https://api.bokun.io/octo/v1';
  const supplierId = process.env.BOKUN_SUPPLIER_ID;
  
  if (!apiKey || !supplierId) {
    console.error('❌ Missing BOKUN_API_KEY or BOKUN_SUPPLIER_ID');
    return;
  }
  
  // Get option ID from database
  console.log('📦 Getting product option ID...');
  const { data: productData } = await supabase
    .from('activities')
    .select('default_option_id')
    .eq('activity_id', productId)
    .single();
  
  const optionId = productData?.default_option_id || null;
  console.log(`  Option ID: ${optionId || 'none'}`);
  
  console.log('\n📡 Calling Bokun API...');
  const url = `${baseUrl}/availability`;
  const payload = {
    productId: productId,
    optionId: optionId,
    localDateStart: date,
    localDateEnd: date
  };
  
  console.log('Request payload:', JSON.stringify(payload, null, 2));
  
  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'X-Octo-Capabilities': 'octo/pricing',
        'X-Octo-Env': 'live',
        'Content-Type': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Accept': 'application/json'
      },
      timeout: 30000
    });
    
    const availabilities = response.data as any[];
    console.log(`\n📊 Bokun Response: ${availabilities.length} slots`);
    console.log('=' .repeat(70));
    
    // Check for duplicate IDs
    const idMap = new Map<string, any[]>();
    availabilities.forEach((slot: any) => {
      if (!idMap.has(slot.id)) {
        idMap.set(slot.id, []);
      }
      idMap.get(slot.id)!.push(slot);
    });
    
    // Sort by time
    availabilities.sort((a: any, b: any) => {
      const timeA = a.localTime || a.localDateTimeStart?.split('T')[1];
      const timeB = b.localTime || b.localDateTimeStart?.split('T')[1];
      return timeA?.localeCompare(timeB);
    });
    
    // Display all slots
    console.log('\n📋 All Slots from Bokun:');
    availabilities.forEach((slot: any, index: number) => {
      console.log(`\nSlot ${index + 1}:`);
      console.log(`  ID: ${slot.id}`);
      console.log(`  localTime: ${slot.localTime}`);
      console.log(`  localDate: ${slot.localDate}`);
      console.log(`  localDateTimeStart: ${slot.localDateTimeStart}`);
      console.log(`  localDateTimeEnd: ${slot.localDateTimeEnd}`);
      console.log(`  Status: ${slot.status}`);
      console.log(`  Available: ${slot.available}`);
      console.log(`  Vacancies: ${slot.vacancies}`);
      console.log(`  Capacity: ${slot.capacity}`);
    });
    
    // Check for duplicate IDs
    console.log('\n⚠️  Checking for Duplicate IDs:');
    let hasDuplicates = false;
    idMap.forEach((slots, id) => {
      if (slots.length > 1) {
        hasDuplicates = true;
        console.log(`  ❌ ID "${id}" appears ${slots.length} times!`);
        slots.forEach(s => {
          console.log(`      - Time: ${s.localTime}, Status: ${s.status}`);
        });
      }
    });
    
    if (!hasDuplicates) {
      console.log('  ✅ No duplicate IDs found');
    }
    
    // Compare with Supabase
    console.log('\n📊 Comparing with Supabase:');
    const { data: supabaseData } = await supabase
      .from('activity_availability')
      .select('availability_id, local_time')
      .eq('activity_id', productId)
      .eq('local_date', date)
      .order('local_time', { ascending: true });
    
    console.log(`  Supabase has: ${supabaseData?.length || 0} slots`);
    console.log(`  Bokun has: ${availabilities.length} slots`);
    
    if (supabaseData) {
      console.log('\n  Supabase slots:');
      supabaseData.forEach((s, i) => {
        console.log(`    ${i + 1}. ID: ${s.availability_id}, Time: ${s.local_time}`);
      });
    }
    
    // Find missing slots
    if (supabaseData && availabilities.length > supabaseData.length) {
      console.log('\n  🔍 Missing slots in Supabase:');
      const supabaseIds = new Set(supabaseData.map(s => s.availability_id));
      availabilities.forEach((slot: any) => {
        if (!supabaseIds.has(slot.id)) {
          console.log(`    - ID: ${slot.id}, Time: ${slot.localTime}`);
        }
      });
    }
    
    // Check if the issue is duplicate IDs being overwritten
    if (hasDuplicates) {
      console.log('\n⚠️  ISSUE FOUND: Duplicate availability IDs from Bokun!');
      console.log('  This causes the upsert to overwrite slots with the same ID.');
      console.log('  Solution: The sync logic may need to be updated to handle this case.');
    }
    
  } catch (error: any) {
    console.error('\n❌ Error:', error.response?.data || error.message);
  }
}

syncWithLogging()
  .then(() => {
    console.log('\n✅ Analysis completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });