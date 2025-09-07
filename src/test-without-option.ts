#!/usr/bin/env npx ts-node
import axios from 'axios';
import { config } from 'dotenv';

config();

async function testWithoutOption() {
  console.log('🔍 Testing Bokun API WITH and WITHOUT optionId');
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
    'Accept-Encoding': 'gzip, deflate',
    'Accept': 'application/json'
  };
  
  try {
    // Test 1: WITH optionId (current implementation)
    console.log('\n📊 Test 1: WITH optionId = 556533');
    console.log('-'.repeat(40));
    
    const response1 = await axios.post(`${baseUrl}/availability`, {
      productId: productId,
      optionId: '556533',
      localDateStart: date,
      localDateEnd: date
    }, { headers, timeout: 30000 });
    
    const slots1 = response1.data as any[];
    console.log(`  Result: ${slots1.length} slots`);
    slots1.forEach((s: any, i: number) => {
      const utcTime = s.localDateTimeStart?.split('T')[1]?.substring(0, 8);
      console.log(`    ${i + 1}. ID: ${s.id}, UTC: ${utcTime}, Status: ${s.status}`);
    });
    
    // Test 2: WITHOUT optionId
    console.log('\n📊 Test 2: WITHOUT optionId');
    console.log('-'.repeat(40));
    
    const response2 = await axios.post(`${baseUrl}/availability`, {
      productId: productId,
      localDateStart: date,
      localDateEnd: date
    }, { headers, timeout: 30000 });
    
    const slots2 = response2.data as any[];
    console.log(`  Result: ${slots2.length} slots`);
    slots2.forEach((s: any, i: number) => {
      const utcTime = s.localDateTimeStart?.split('T')[1]?.substring(0, 8);
      console.log(`    ${i + 1}. ID: ${s.id}, UTC: ${utcTime}, Status: ${s.status}`);
    });
    
    // Test 3: Try with optionId = null
    console.log('\n📊 Test 3: WITH optionId = null');
    console.log('-'.repeat(40));
    
    const response3 = await axios.post(`${baseUrl}/availability`, {
      productId: productId,
      optionId: null,
      localDateStart: date,
      localDateEnd: date
    }, { headers, timeout: 30000 });
    
    const slots3 = response3.data as any[];
    console.log(`  Result: ${slots3.length} slots`);
    slots3.forEach((s: any, i: number) => {
      const utcTime = s.localDateTimeStart?.split('T')[1]?.substring(0, 8);
      console.log(`    ${i + 1}. ID: ${s.id}, UTC: ${utcTime}, Status: ${s.status}`);
    });
    
    // Compare results
    console.log('\n📊 COMPARISON:');
    console.log('=' .repeat(70));
    console.log(`  With optionId '556533': ${slots1.length} slots`);
    console.log(`  Without optionId: ${slots2.length} slots`);
    console.log(`  With optionId null: ${slots3.length} slots`);
    
    if (slots2.length > slots1.length) {
      console.log('\n  ⚠️  FOUND THE ISSUE!');
      console.log('  Without optionId, Bokun returns more slots.');
      console.log('  The missing slot(s) might be for a different option.');
      
      // Find the difference
      const ids1 = new Set(slots1.map((s: any) => s.id));
      const extra = slots2.filter((s: any) => !ids1.has(s.id));
      if (extra.length > 0) {
        console.log('\n  Extra slot(s) without optionId:');
        extra.forEach((s: any) => {
          const utcTime = s.localDateTimeStart?.split('T')[1]?.substring(0, 8);
          console.log(`    - ID: ${s.id}, UTC: ${utcTime}, Status: ${s.status}`);
        });
      }
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testWithoutOption()
  .then(() => {
    console.log('\n✅ Test completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });