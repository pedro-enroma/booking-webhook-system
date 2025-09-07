#!/usr/bin/env npx ts-node
import axios from 'axios';
import { config } from 'dotenv';

config();

async function debugSyncSeptember11() {
  console.log('🔍 Debugging Bokun Availability for Product 220107 on September 11th');
  console.log('=' .repeat(70));
  
  const productId = '220107';
  const date = '2025-09-11';
  
  // Get Bokun credentials
  const apiKey = process.env.BOKUN_API_KEY;
  const baseUrl = process.env.BOKUN_API_URL || 'https://api.bokun.io/octo/v1';
  
  if (!apiKey) {
    console.error('❌ BOKUN_API_KEY not found in environment variables');
    return;
  }
  
  console.log('📡 Calling Bokun API...');
  console.log(`  Endpoint: ${baseUrl}/availability`);
  console.log(`  Product ID: ${productId}`);
  console.log(`  Date: ${date}`);
  
  try {
    // Try to get availability for specific date
    const url = `${baseUrl}/availability`;
    const params = {
      productId,
      localDate: date,
      localTime: '',
      units: 1
    };
    
    console.log('\n📊 Request Parameters:');
    console.log(JSON.stringify(params, null, 2));
    
    const response = await axios.get(url, {
      params,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Accept': 'application/json'
      }
    });
    
    const availabilities = response.data as any[];
    
    console.log(`\n📊 Bokun Response: ${availabilities.length} slots`);
    console.log('=' .repeat(70));
    
    // Sort by time for easier comparison
    availabilities.sort((a: any, b: any) => {
      const timeA = a.localTime || a.localDateTimeStart?.split('T')[1];
      const timeB = b.localTime || b.localDateTimeStart?.split('T')[1];
      return timeA?.localeCompare(timeB);
    });
    
    availabilities.forEach((slot: any, index: number) => {
      console.log(`\nSlot ${index + 1}:`);
      console.log(`  ID: ${slot.id}`);
      console.log(`  Local Date: ${slot.localDate}`);
      console.log(`  Local Time: ${slot.localTime}`);
      console.log(`  Local DateTime Start: ${slot.localDateTimeStart}`);
      console.log(`  Local DateTime End: ${slot.localDateTimeEnd}`);
      console.log(`  All Day: ${slot.allDay}`);
      console.log(`  Available: ${slot.available}`);
      console.log(`  Status: ${slot.status}`);
      console.log(`  Vacancies: ${slot.vacancies}`);
      console.log(`  Capacity: ${slot.capacity}`);
      console.log(`  Max Units: ${slot.maxUnits}`);
      console.log(`  UTC Free Sale: ${slot.utcFreesaleCutoff}`);
      
      if (slot.pricing && slot.pricing.length > 0) {
        console.log(`  Price: ${slot.pricing[0].currency} ${slot.pricing[0].amount}`);
      }
    });
    
    // Extract unique times
    console.log('\n📊 Summary:');
    const uniqueTimes = new Set(availabilities.map((s: any) => s.localTime || 'All Day'));
    console.log(`  Unique time slots: ${uniqueTimes.size}`);
    Array.from(uniqueTimes).sort().forEach(time => {
      console.log(`    - ${time}`);
    });
    
    console.log('\n📊 Missing Slot Analysis:');
    console.log('  Supabase has: 09:30, 10:00, 10:25, 10:30');
    console.log('  Bokun has the above times');
    console.log('  Looking for the 5th slot that might be missing...');
    
  } catch (error: any) {
    console.error('\n❌ Error calling Bokun API:');
    if (error.response) {
      console.error('  Status:', error.response.status);
      console.error('  Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('  Message:', error.message);
    }
  }
}

debugSyncSeptember11()
  .then(() => {
    console.log('\n✅ Debug completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });