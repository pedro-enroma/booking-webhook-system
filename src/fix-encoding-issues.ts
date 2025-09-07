#!/usr/bin/env npx ts-node
import { supabase } from './config/supabase';

async function fixEncodingIssues() {
  console.log('🔧 Fixing Character Encoding Issues in Customers Table');
  console.log('=' .repeat(70));
  
  // Common encoding fixes
  const replacements: Record<string, string> = {
    '�': '',  // Remove replacement character
    'Ã¡': 'á',
    'Ã©': 'é',
    'Ã­': 'í',
    'Ã³': 'ó',
    'Ãº': 'ú',
    'Ã ': 'à',
    'Ã¨': 'è',
    'Ã¬': 'ì',
    'Ã²': 'ò',
    'Ã¹': 'ù',
    'Ã±': 'ñ',
    'Ã¼': 'ü',
    'Ã¤': 'ä',
    'Ã¶': 'ö',
    'Ã§': 'ç',
    'Â°': '°',
  };
  
  // Get all customers with potential encoding issues
  console.log('\n🔍 Finding customers with encoding issues...');
  
  const { data: customers, error } = await supabase
    .from('customers')
    .select('customer_id, first_name, last_name')
    .or('first_name.ilike.%�%,last_name.ilike.%�%,first_name.ilike.%Ã%,last_name.ilike.%Ã%');
  
  if (error) {
    console.error('Error fetching customers:', error);
    return;
  }
  
  console.log(`Found ${customers?.length || 0} customers with potential encoding issues\n`);
  
  if (!customers || customers.length === 0) {
    console.log('No encoding issues found!');
    return;
  }
  
  // Show sample of issues
  console.log('Sample of encoding issues found:');
  customers.slice(0, 10).forEach(c => {
    console.log(`  ${c.customer_id}: ${c.first_name} ${c.last_name}`);
  });
  
  if (customers.length > 10) {
    console.log(`  ... and ${customers.length - 10} more\n`);
  }
  
  // Fix encoding issues
  console.log('\n⏳ Fixing encoding issues...\n');
  let fixed = 0;
  let errors = 0;
  
  for (const customer of customers) {
    let fixedFirstName = customer.first_name || '';
    let fixedLastName = customer.last_name || '';
    let needsUpdate = false;
    
    // Apply replacements
    for (const [bad, good] of Object.entries(replacements)) {
      if (fixedFirstName.includes(bad)) {
        fixedFirstName = fixedFirstName.replace(new RegExp(bad, 'g'), good);
        needsUpdate = true;
      }
      if (fixedLastName.includes(bad)) {
        fixedLastName = fixedLastName.replace(new RegExp(bad, 'g'), good);
        needsUpdate = true;
      }
    }
    
    // Remove any remaining � characters
    if (fixedFirstName.includes('�')) {
      fixedFirstName = fixedFirstName.replace(/�/g, '');
      needsUpdate = true;
    }
    if (fixedLastName.includes('�')) {
      fixedLastName = fixedLastName.replace(/�/g, '');
      needsUpdate = true;
    }
    
    if (needsUpdate) {
      const { error: updateError } = await supabase
        .from('customers')
        .update({
          first_name: fixedFirstName,
          last_name: fixedLastName
        })
        .eq('customer_id', customer.customer_id);
      
      if (updateError) {
        errors++;
        console.log(`❌ Error fixing ${customer.customer_id}: ${updateError.message}`);
      } else {
        fixed++;
        if (fixed % 50 === 0) {
          console.log(`✓ Fixed ${fixed} customers...`);
        }
      }
    }
  }
  
  console.log('\n' + '=' .repeat(70));
  console.log('📊 FIX SUMMARY');
  console.log('=' .repeat(70));
  console.log(`✅ Fixed: ${fixed} customers`);
  console.log(`❌ Errors: ${errors}`);
  
  // Verify fix
  console.log('\n🔍 Verifying fixes...');
  const { data: stillBroken } = await supabase
    .from('customers')
    .select('customer_id, first_name, last_name')
    .or('first_name.ilike.%�%,last_name.ilike.%�%');
  
  if (stillBroken && stillBroken.length > 0) {
    console.log(`⚠️  Still ${stillBroken.length} customers with � character`);
    console.log('Sample:');
    stillBroken.slice(0, 5).forEach(c => {
      console.log(`  ${c.customer_id}: ${c.first_name} ${c.last_name}`);
    });
  } else {
    console.log('✅ All encoding issues have been fixed!');
  }
}

fixEncodingIssues()
  .then(() => {
    console.log('\n✅ Process completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });