#!/usr/bin/env npx ts-node
import { supabase } from './config/supabase';

async function fixRemainingNames() {
  console.log('🔧 Fixing Remaining Broken Names');
  console.log('=' .repeat(70));
  
  // More comprehensive list including compound names
  const fixes = [
    // Last names that need fixing
    { find: 'Daz', replace: 'Díaz' },
    { find: 'Muoz', replace: 'Muñoz' },
    { find: 'Prez', replace: 'Pérez' },
    { find: 'Garca', replace: 'García' },
    { find: 'Martnez', replace: 'Martínez' },
    { find: 'Gonzlez', replace: 'González' },
    { find: 'Lpez', replace: 'López' },
    { find: 'Snchez', replace: 'Sánchez' },
    { find: 'Rodrguez', replace: 'Rodríguez' },
    { find: 'Hernndez', replace: 'Hernández' },
    { find: 'Guzmn', replace: 'Guzmán' },
    { find: 'Garzn', replace: 'Garzón' },
    { find: 'Cerd', replace: 'Cerdá' },
    { find: 'Rendn', replace: 'Rendón' },
    { find: 'Vliz', replace: 'Véliz' },
    { find: 'Jurez', replace: 'Juárez' },
    { find: 'Beltrn', replace: 'Beltrán' },
    { find: 'Caldern', replace: 'Calderón' },
    { find: 'Rincn', replace: 'Rincón' },
    { find: 'Menndez', replace: 'Menéndez' },
    { find: 'Mjica', replace: 'Mújica' },
    { find: 'Bermdez', replace: 'Bermúdez' },
    { find: 'Cspedes', replace: 'Céspedes' },
    { find: 'Tllez', replace: 'Téllez' },
    { find: 'Ynez', replace: 'Yáñez' },
    { find: 'Quez', replace: 'Núñez' },
    
    // First names
    { find: 'Mara', replace: 'María' },
    { find: 'Jos', replace: 'José' },
    { find: 'Jess', replace: 'Jesús' },
    { find: 'ngel', replace: 'Ángel' },
    { find: 'Concepcin', replace: 'Concepción' },
    { find: 'Adrin', replace: 'Adrián' },
    { find: 'Beln', replace: 'Belén' },
    { find: 'Csar', replace: 'César' },
    { find: 'Damin', replace: 'Damián' },
    { find: 'Fabin', replace: 'Fabián' },
    { find: 'Gastn', replace: 'Gastón' },
    { find: 'Hernn', replace: 'Hernán' },
    { find: 'Ismal', replace: 'Ismael' },
    { find: 'Julin', replace: 'Julián' },
    { find: 'Matas', replace: 'Matías' },
    { find: 'Nstor', replace: 'Néstor' },
    { find: 'scar', replace: 'Óscar' },
    { find: 'Rubn', replace: 'Rubén' },
    { find: 'Simn', replace: 'Simón' },
    { find: 'Toms', replace: 'Tomás' },
  ];
  
  console.log('\n⏳ Processing remaining fixes...\n');
  
  let totalFixed = 0;
  
  for (const fix of fixes) {
    // Get all customers that need this fix
    const { data: customers } = await supabase
      .from('customers')
      .select('customer_id, first_name, last_name')
      .or(`first_name.ilike.%${fix.find}%,last_name.ilike.%${fix.find}%`);
    
    if (!customers || customers.length === 0) continue;
    
    let fixedCount = 0;
    
    for (const customer of customers) {
      let needsUpdate = false;
      let newFirstName = customer.first_name || '';
      let newLastName = customer.last_name || '';
      
      // Use word boundary to avoid partial replacements
      const regex = new RegExp(`\\b${fix.find}\\b`, 'g');
      
      if (newFirstName && newFirstName.match(regex)) {
        newFirstName = newFirstName.replace(regex, fix.replace);
        needsUpdate = true;
      }
      
      if (newLastName && newLastName.match(regex)) {
        newLastName = newLastName.replace(regex, fix.replace);
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        const { error } = await supabase
          .from('customers')
          .update({
            first_name: newFirstName,
            last_name: newLastName
          })
          .eq('customer_id', customer.customer_id);
        
        if (!error) {
          fixedCount++;
          totalFixed++;
        }
      }
    }
    
    if (fixedCount > 0) {
      console.log(`  Fixed "${fix.find}" -> "${fix.replace}": ${fixedCount} occurrences`);
    }
  }
  
  console.log('\n' + '=' .repeat(70));
  console.log('📊 SUMMARY');
  console.log('=' .repeat(70));
  console.log(`✅ Total fixes applied: ${totalFixed}`);
  
  // Final check
  console.log('\n🔍 Final check for broken patterns...');
  
  const brokenPatterns = ['Daz', 'Muoz', 'Prez', 'Garca', 'Lpez', 'Martnez'];
  let stillBroken = 0;
  
  for (const pattern of brokenPatterns) {
    const { count } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .or(`first_name.ilike.%${pattern}%,last_name.ilike.%${pattern}%`);
    
    if (count && count > 0) {
      console.log(`  Still found "${pattern}": ${count} times`);
      stillBroken += count;
    }
  }
  
  if (stillBroken === 0) {
    console.log('  ✅ No more broken patterns found!');
  } else {
    console.log(`  ⚠️  ${stillBroken} instances may need manual review`);
  }
}

fixRemainingNames()
  .then(() => {
    console.log('\n✅ Name fixing completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });