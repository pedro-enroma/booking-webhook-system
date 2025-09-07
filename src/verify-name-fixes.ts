#!/usr/bin/env npx ts-node
import { supabase } from './config/supabase';

async function verifyNameFixes() {
  console.log('🔍 Verifying Name Fixes');
  console.log('=' .repeat(70));
  
  // Check for successfully fixed names
  console.log('\n✅ Successfully fixed names (sample):');
  const { data: fixedSamples } = await supabase
    .from('customers')
    .select('customer_id, first_name, last_name')
    .or('last_name.ilike.%díaz%,last_name.ilike.%garcía%,last_name.ilike.%pérez%,last_name.ilike.%lópez%,last_name.ilike.%muñoz%')
    .limit(15);
  
  fixedSamples?.forEach(s => {
    console.log(`  ${s.customer_id}: ${s.first_name} ${s.last_name}`);
  });
  
  // Check for still broken names
  console.log('\n❌ Still broken names (need fixing):');
  const brokenPatterns = [
    'Daz', 'Muoz', 'Prez', 'Garca', 'Martnez',
    'Rodrguez', 'Gonzlez', 'Hernndez', 'Lpez', 'Snchez'
  ];
  
  for (const pattern of brokenPatterns) {
    const { count } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .or(`first_name.ilike.%${pattern}%,last_name.ilike.%${pattern}%`);
    
    if (count && count > 0) {
      console.log(`  Still have "${pattern}": ${count} occurrences`);
    }
  }
  
  // Check specific customer that was shown in screenshot
  console.log('\n📊 Checking specific customer from screenshot:');
  const { data: caizares } = await supabase
    .from('customers')
    .select('customer_id, first_name, last_name')
    .or('last_name.ilike.%cañizares%,last_name.ilike.%CAÑIZARES%')
    .limit(5);
  
  if (caizares && caizares.length > 0) {
    console.log('  Found CAÑIZARES (fixed):');
    caizares.forEach(c => {
      console.log(`    ${c.customer_id}: ${c.first_name} ${c.last_name}`);
    });
  }
  
  // Get overall statistics
  const { count: totalCustomers } = await supabase
    .from('customers')
    .select('*', { count: 'exact', head: true });
  
  const { count: customersWithAccents } = await supabase
    .from('customers')
    .select('*', { count: 'exact', head: true })
    .or('first_name.ilike.%á%,first_name.ilike.%é%,first_name.ilike.%í%,first_name.ilike.%ó%,first_name.ilike.%ú%,first_name.ilike.%ñ%,last_name.ilike.%á%,last_name.ilike.%é%,last_name.ilike.%í%,last_name.ilike.%ó%,last_name.ilike.%ú%,last_name.ilike.%ñ%');
  
  console.log('\n📊 Statistics:');
  console.log(`  Total customers: ${totalCustomers}`);
  console.log(`  Customers with proper accents: ${customersWithAccents}`);
  console.log(`  Percentage with accents: ${((customersWithAccents! / totalCustomers!) * 100).toFixed(1)}%`);
}

verifyNameFixes()
  .then(() => {
    console.log('\n✅ Verification completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });