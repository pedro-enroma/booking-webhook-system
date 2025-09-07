#!/usr/bin/env npx ts-node
import axios from 'axios';
import { config } from 'dotenv';

config();

async function checkProductOptions() {
  console.log('🔍 Checking All Options for Product 220107');
  console.log('=' .repeat(70));
  
  const productId = '220107';
  const date = '2025-09-11';
  const apiKey = process.env.BOKUN_API_KEY;
  const baseUrl = process.env.BOKUN_API_URL || 'https://api.bokun.io/octo/v1';
  
  if (!apiKey) {
    console.error('❌ Missing BOKUN_API_KEY');
    return;
  }
  
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'X-Octo-Capabilities': 'octo/pricing',
    'X-Octo-Env': 'live',
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  
  try {
    // First, get the product details to find all options
    console.log('📦 Getting product details...');
    const productResponse = await axios.get(`${baseUrl}/products/${productId}`, {
      headers,
      timeout: 30000
    });
    
    const product = productResponse.data as any;
    console.log(`  Product: ${product.title || product.internalName || productId}`);
    
    const options = product.options || [];
    console.log(`  Found ${options.length} option(s):\n`);
    
    if (options.length === 0) {
      console.log('  No options found for this product.');
      return;
    }
    
    // Test availability for each option
    let totalSlots = 0;
    const allSlots = new Map<string, any>();
    
    for (const option of options) {
      console.log(`\n📊 Option: ${option.id} - ${option.title || 'Unnamed'}`);
      console.log('-'.repeat(50));
      
      try {
        const availResponse = await axios.post(`${baseUrl}/availability`, {
          productId: productId,
          optionId: option.id,
          localDateStart: date,
          localDateEnd: date
        }, { headers, timeout: 30000 });
        
        const slots = availResponse.data as any[];
        console.log(`  Found ${slots.length} slots:`);
        
        slots.forEach((s: any, i: number) => {
          const utcTime = s.localDateTimeStart?.split('T')[1]?.substring(0, 8);
          const romeHour = parseInt(utcTime.substring(0, 2)) + 2; // Convert UTC to Rome time
          const romeTime = `${String(romeHour).padStart(2, '0')}:${utcTime.substring(3, 8)}`;
          
          console.log(`    ${i + 1}. ID: ${s.id}, Rome: ${romeTime}, Status: ${s.status}, Available: ${s.vacancies}/${s.capacity}`);
          
          // Store all unique slots
          if (!allSlots.has(s.id)) {
            allSlots.set(s.id, { ...s, optionId: option.id, optionTitle: option.title });
            totalSlots++;
          }
        });
        
      } catch (error: any) {
        console.log(`  Error getting availability: ${error.response?.data?.errorMessage || error.message}`);
      }
    }
    
    // Summary
    console.log('\n' + '=' .repeat(70));
    console.log('📊 SUMMARY');
    console.log('=' .repeat(70));
    console.log(`  Total unique slots across all options: ${totalSlots}`);
    console.log(`  Current sync uses option: 556533`);
    
    // List all unique times
    const uniqueTimes = new Set<string>();
    allSlots.forEach(slot => {
      const utcTime = slot.localDateTimeStart?.split('T')[1]?.substring(0, 8);
      if (utcTime) {
        const romeHour = parseInt(utcTime.substring(0, 2)) + 2;
        const romeTime = `${String(romeHour).padStart(2, '0')}:${utcTime.substring(3, 5)}`;
        uniqueTimes.add(romeTime);
      }
    });
    
    console.log(`\n  All unique time slots (Rome time):`);
    Array.from(uniqueTimes).sort().forEach(time => {
      console.log(`    - ${time}`);
    });
    
    if (totalSlots > 4) {
      console.log('\n  ⚠️  FOUND THE ISSUE!');
      console.log(`  There are ${totalSlots} total slots across all options.`);
      console.log('  The missing slot(s) might be from a different option.');
    } else if (totalSlots === 4) {
      console.log('\n  ℹ️  Bokun only has 4 slots for this product on September 11th.');
      console.log('  The sync is working correctly.');
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

checkProductOptions()
  .then(() => {
    console.log('\n✅ Analysis completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });