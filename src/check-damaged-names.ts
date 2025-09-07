#!/usr/bin/env npx ts-node
import { supabase } from './config/supabase';

async function checkDamagedNames() {
  console.log('🔍 Checking Damaged Names After Bad Fix');
  console.log('=' .repeat(70));
  
  // Common Spanish/Italian names that should have accents
  const expectedPatterns = [
    { broken: 'Daz', fixed: 'Díaz' },
    { broken: 'Muoz', fixed: 'Muñoz' },
    { broken: 'Prez', fixed: 'Pérez' },
    { broken: 'Garca', fixed: 'García' },
    { broken: 'Martnez', fixed: 'Martínez' },
    { broken: 'Rodrguez', fixed: 'Rodríguez' },
    { broken: 'Gonzlez', fixed: 'González' },
    { broken: 'Hernndez', fixed: 'Hernández' },
    { broken: 'Lpez', fixed: 'López' },
    { broken: 'Snchez', fixed: 'Sánchez' },
    { broken: 'Ramrez', fixed: 'Ramírez' },
    { broken: 'Gmez', fixed: 'Gómez' },
    { broken: 'Fernndez', fixed: 'Fernández' },
    { broken: 'Jimnez', fixed: 'Jiménez' },
    { broken: 'Ruiz', fixed: 'Ruiz' }, // No accent
    { broken: 'lvarez', fixed: 'Álvarez' },
    { broken: 'Nez', fixed: 'Núñez' },
    { broken: 'Jess', fixed: 'Jesús' },
    { broken: 'Mara', fixed: 'María' },
    { broken: 'Jos', fixed: 'José' },
    { broken: 'ngel', fixed: 'Ángel' },
    { broken: 'Ral', fixed: 'Raúl' },
    { broken: 'Andrs', fixed: 'Andrés' },
    { broken: 'Caizares', fixed: 'Cañizares' },
    { broken: 'CAIZARES', fixed: 'CAÑIZARES' },
  ];
  
  console.log('\n📊 Checking for damaged names...\n');
  
  for (const pattern of expectedPatterns.slice(0, 10)) {
    const { data, count } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .or(`first_name.ilike.%${pattern.broken}%,last_name.ilike.%${pattern.broken}%`);
    
    if (count && count > 0) {
      console.log(`  Found "${pattern.broken}" ${count} times (should be "${pattern.fixed}")`);
    }
  }
  
  // Get samples of broken names
  console.log('\n📊 Sample of potentially broken names:');
  
  const { data: samples } = await supabase
    .from('customers')
    .select('customer_id, first_name, last_name')
    .or('last_name.ilike.%daz%,last_name.ilike.%muoz%,last_name.ilike.%prez%,last_name.ilike.%garca%,last_name.ilike.%lpez%')
    .limit(20);
  
  samples?.forEach(s => {
    console.log(`  ${s.customer_id}: ${s.first_name} ${s.last_name}`);
  });
  
  // Check the original CSV to see what encoding it uses
  console.log('\n📊 Original CSV Encoding Check:');
  console.log('  The CSV files were likely saved with Windows-1252 or ISO-8859-1 encoding');
  console.log('  But we read them as UTF-8, which corrupted the special characters');
  console.log('  Then we tried to "fix" them but made it worse by removing characters');
  
  console.log('\n⚠️  RECOMMENDATION:');
  console.log('  1. Re-import the CSV files with proper encoding (ISO-8859-1 or Windows-1252)');
  console.log('  2. OR manually fix common Spanish/Italian names with a mapping table');
  console.log('  3. OR restore from a backup if available');
}

checkDamagedNames()
  .then(() => {
    console.log('\n✅ Check completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });