#!/usr/bin/env npx ts-node
import { supabase } from './config/supabase';

async function fixAllEncoding() {
  console.log('🔧 Comprehensive Fix for Character Encoding Issues');
  console.log('=' .repeat(70));
  
  // Get ALL customers to fix encoding
  console.log('\n🔍 Loading all customers...');
  
  let allCustomers: any[] = [];
  let offset = 0;
  const limit = 1000;
  
  while (true) {
    const { data, error } = await supabase
      .from('customers')
      .select('customer_id, first_name, last_name')
      .range(offset, offset + limit - 1);
    
    if (error) {
      console.error('Error fetching customers:', error);
      break;
    }
    
    if (!data || data.length === 0) break;
    
    allCustomers = allCustomers.concat(data);
    if (data.length < limit) break;
    offset += limit;
  }
  
  console.log(`Loaded ${allCustomers.length} total customers`);
  
  // Function to fix encoding
  function fixEncoding(text: string | null): string {
    if (!text) return '';
    
    let fixed = text;
    
    // Common UTF-8 double encoding patterns
    fixed = fixed
      // Spanish/Italian vowels with accents
      .replace(/Ã¡/g, 'á')
      .replace(/Ã©/g, 'é') 
      .replace(/Ã­/g, 'í')
      .replace(/Ã³/g, 'ó')
      .replace(/Ãº/g, 'ú')
      .replace(/Ã /g, 'à')
      .replace(/Ã¨/g, 'è')
      .replace(/Ã¬/g, 'ì')
      .replace(/Ã²/g, 'ò')
      .replace(/Ã¹/g, 'ù')
      // Uppercase accents
      .replace(/Ã\u0081/g, 'Á')
      .replace(/Ã\u0089/g, 'É')
      .replace(/Ã\u008D/g, 'Í')
      .replace(/Ã\u0093/g, 'Ó')
      .replace(/Ãš/g, 'Ú')
      .replace(/Ã\u0080/g, 'À')
      .replace(/Ã\u0088/g, 'È')
      .replace(/ÃŒ/g, 'Ì')
      .replace(/Ã\u0092/g, 'Ò')
      .replace(/Ã\u0099/g, 'Ù')
      // Ñ and ñ
      .replace(/Ã±/g, 'ñ')
      .replace(/Ã\u0091/g, 'Ñ')
      // German/Nordic
      .replace(/Ã¤/g, 'ä')
      .replace(/Ã¶/g, 'ö')
      .replace(/Ã¼/g, 'ü')
      .replace(/Ã\u0084/g, 'Ä')
      .replace(/Ã\u0096/g, 'Ö')
      .replace(/Ãœ/g, 'Ü')
      .replace(/ÃŸ/g, 'ß')
      // Cedilla
      .replace(/Ã§/g, 'ç')
      .replace(/Ã\u0087/g, 'Ç')
      // Other symbols
      .replace(/â€™/g, "'")
      .replace(/â€œ/g, '"')
      .replace(/â€\u009D/g, '"')
      .replace(/â€"/g, '–')
      .replace(/â€"/g, '—')
      .replace(/Â°/g, '°')
      .replace(/â‚¬/g, '€')
      // Specific problem patterns
      .replace(/�/g, '')  // Remove replacement character
      .replace(/Â /g, ' ')  // Non-breaking space
      .replace(/Â/g, '')  // Remove stray Â
      .replace(/Ã\u009F/g, 'ß')
      .replace(/Å\u0093/g, 'œ')
      .replace(/Å\u0092/g, 'Œ');
    
    // Clean up any remaining weird patterns
    fixed = fixed
      .replace(/\s+/g, ' ')  // Multiple spaces to single
      .trim();
    
    return fixed;
  }
  
  console.log('\n⏳ Fixing encoding for all customers...\n');
  
  let fixed = 0;
  let unchanged = 0;
  let errors = 0;
  
  for (let i = 0; i < allCustomers.length; i++) {
    const customer = allCustomers[i];
    const originalFirst = customer.first_name || '';
    const originalLast = customer.last_name || '';
    
    const fixedFirst = fixEncoding(customer.first_name);
    const fixedLast = fixEncoding(customer.last_name);
    
    // Only update if something changed
    if (fixedFirst !== originalFirst || fixedLast !== originalLast) {
      const { error } = await supabase
        .from('customers')
        .update({
          first_name: fixedFirst,
          last_name: fixedLast
        })
        .eq('customer_id', customer.customer_id);
      
      if (error) {
        errors++;
        console.log(`❌ Error updating ${customer.customer_id}: ${error.message}`);
      } else {
        fixed++;
        if (fixed % 100 === 0) {
          console.log(`✓ Fixed ${fixed} customers...`);
        }
      }
    } else {
      unchanged++;
    }
    
    // Progress indicator
    if ((i + 1) % 500 === 0) {
      console.log(`  Progress: ${i + 1}/${allCustomers.length} processed`);
    }
  }
  
  console.log('\n' + '=' .repeat(70));
  console.log('📊 FINAL RESULTS');
  console.log('=' .repeat(70));
  console.log(`✅ Fixed: ${fixed} customers`);
  console.log(`⏭  Unchanged: ${unchanged} customers`);
  console.log(`❌ Errors: ${errors}`);
  console.log(`📊 Total processed: ${allCustomers.length}`);
  
  // Final verification
  console.log('\n🔍 Final verification...');
  const { data: stillBroken } = await supabase
    .from('customers')
    .select('customer_id, first_name, last_name')
    .or('first_name.ilike.%�%,last_name.ilike.%�%,first_name.ilike.%Ã%,last_name.ilike.%Ã%')
    .limit(10);
  
  if (stillBroken && stillBroken.length > 0) {
    console.log(`\n⚠️  Found ${stillBroken.length} customers that may still have issues:`);
    stillBroken.forEach(c => {
      console.log(`  ${c.customer_id}: "${c.first_name}" "${c.last_name}"`);
    });
    console.log('\nYou may need to manually fix these remaining cases.');
  } else {
    console.log('✅ All encoding issues have been resolved!');
  }
}

fixAllEncoding()
  .then(() => {
    console.log('\n✅ Encoding fix completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });