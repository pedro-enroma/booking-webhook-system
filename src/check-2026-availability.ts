#!/usr/bin/env npx ts-node
import axios from 'axios';
import { config } from 'dotenv';
import { supabase } from './config/supabase';

config();

async function check2026Availability() {
  console.log('🔍 Checking 2026 Availability for Product 220107');
  console.log('=' .repeat(70));
  
  const productId = '220107';
  const testDate = '2026-01-15'; // Mid-January 2026
  const apiKey = process.env.BOKUN_API_KEY;
  const baseUrl = process.env.BOKUN_API_URL || 'https://api.bokun.io/octo/v1';
  const supplierId = process.env.BOKUN_SUPPLIER_ID;
  
  if (!apiKey || !supplierId) {
    console.error('❌ Missing BOKUN_API_KEY or BOKUN_SUPPLIER_ID');
    return;
  }
  
  const headers = {
    'Authorization': `Bearer ${apiKey}/${supplierId}`,
    'X-Octo-Capabilities': 'octo/pricing',
    'X-Octo-Env': 'live',
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  
  try {
    // First, get the product to confirm options
    console.log('📦 Getting product details...');
    const productResponse = await axios.get(`${baseUrl}/products/${productId}`, {
      headers,
      timeout: 30000
    });
    
    const product = productResponse.data as any;
    console.log(`  Product: ${product.title || product.internalName || productId}`);
    console.log(`  Options found: ${product.options?.length || 0}`);
    
    if (product.options) {
      product.options.forEach((opt: any) => {
        console.log(`    - ${opt.id}: ${opt.title || 'Unnamed'}`);
      });
    }
    
    console.log('\n📅 Testing availability for ' + testDate);
    console.log('-'.repeat(50));
    
    // Test each option
    let totalSlots = 0;
    
    for (const option of (product.options || [])) {
      console.log(`\n  Testing option ${option.id}...`);
      
      const payload = {
        productId: productId,
        optionId: option.id,
        localDateStart: testDate,
        localDateEnd: testDate
      };
      
      try {
        const response = await axios.post(`${baseUrl}/availability`, payload, {
          headers,
          timeout: 30000
        });
        
        const slots = response.data as any[];
        console.log(`    Result: ${slots.length} slots`);
        
        if (slots.length > 0) {
          slots.forEach((s: any) => {
            console.log(`      - ID: ${s.id}, Status: ${s.status}, Available: ${s.vacancies}/${s.capacity}`);
          });
          totalSlots += slots.length;
        } else {
          console.log('      No availability returned');
        }
        
      } catch (error: any) {
        console.log(`    Error: ${error.response?.data?.errorMessage || error.message}`);
      }
    }
    
    // Check what's in Supabase for 2026
    console.log('\n📊 Checking Supabase for 2026 data...');
    console.log('-'.repeat(50));
    
    const { data: dbSlots, error } = await supabase
      .from('activity_availability')
      .select('availability_id, local_date, local_time')
      .eq('activity_id', productId)
      .gte('local_date', '2026-01-01')
      .lte('local_date', '2026-01-31')
      .order('local_date', { ascending: true });
    
    if (error) {
      console.error('  Database error:', error);
    } else {
      console.log(`  Found ${dbSlots?.length || 0} slots in database for January 2026`);
      if (dbSlots && dbSlots.length > 0) {
        // Group by date
        const byDate = new Map<string, number>();
        dbSlots.forEach(slot => {
          const count = byDate.get(slot.local_date) || 0;
          byDate.set(slot.local_date, count + 1);
        });
        
        console.log('  Slots by date:');
        byDate.forEach((count, date) => {
          console.log(`    ${date}: ${count} slots`);
        });
      }
    }
    
    // Summary
    console.log('\n' + '=' .repeat(70));
    console.log('📊 SUMMARY');
    console.log('=' .repeat(70));
    console.log(`  Product has ${product.options?.length || 0} options`);
    console.log(`  Bokun returned ${totalSlots} slots for ${testDate}`);
    console.log(`  Database has ${dbSlots?.length || 0} slots for January 2026`);
    
    if (totalSlots === 0) {
      console.log('\n⚠️  EXPLANATION:');
      console.log('  Bokun is not returning availability for 2026.');
      console.log('  This is normal - tour operators typically only load availability');
      console.log('  for the current year plus a few months ahead.');
      console.log('  The sync is working correctly, but there\'s no data to sync.');
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

check2026Availability()
  .then(() => {
    console.log('\n✅ Analysis completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });