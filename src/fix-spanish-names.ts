#!/usr/bin/env npx ts-node
import { supabase } from './config/supabase';

async function fixSpanishNames() {
  console.log('🔧 Fixing Common Spanish/Italian Names');
  console.log('=' .repeat(70));
  
  // Common Spanish/Italian name patterns to fix
  const nameFixPatterns = [
    // Last names
    { pattern: 'Daz', replacement: 'Díaz' },
    { pattern: 'Muoz', replacement: 'Muñoz' },
    { pattern: 'Prez', replacement: 'Pérez' },
    { pattern: 'Garca', replacement: 'García' },
    { pattern: 'Martnez', replacement: 'Martínez' },
    { pattern: 'Rodrguez', replacement: 'Rodríguez' },
    { pattern: 'Gonzlez', replacement: 'González' },
    { pattern: 'Hernndez', replacement: 'Hernández' },
    { pattern: 'Lpez', replacement: 'López' },
    { pattern: 'Snchez', replacement: 'Sánchez' },
    { pattern: 'Ramrez', replacement: 'Ramírez' },
    { pattern: 'Gmez', replacement: 'Gómez' },
    { pattern: 'Fernndez', replacement: 'Fernández' },
    { pattern: 'Jimnez', replacement: 'Jiménez' },
    { pattern: 'lvarez', replacement: 'Álvarez' },
    { pattern: 'Nez', replacement: 'Núñez' },
    { pattern: 'Martn', replacement: 'Martín' },
    { pattern: 'Rubn', replacement: 'Rubén' },
    { pattern: 'Gutirrez', replacement: 'Gutiérrez' },
    { pattern: 'Domnguez', replacement: 'Domínguez' },
    { pattern: 'Vzquez', replacement: 'Vázquez' },
    { pattern: 'Caizares', replacement: 'Cañizares' },
    { pattern: 'CAIZARES', replacement: 'CAÑIZARES' },
    { pattern: 'Pea', replacement: 'Peña' },
    { pattern: 'Peas', replacement: 'Peñas' },
    { pattern: 'Beln', replacement: 'Belén' },
    { pattern: 'Len', replacement: 'León' },
    { pattern: 'Milln', replacement: 'Millán' },
    { pattern: 'Castao', replacement: 'Castaño' },
    { pattern: 'Ordez', replacement: 'Ordóñez' },
    { pattern: 'Nez', replacement: 'Núñez' },
    { pattern: 'Bez', replacement: 'Báez' },
    { pattern: 'Glvez', replacement: 'Gálvez' },
    { pattern: 'Corts', replacement: 'Cortés' },
    { pattern: 'Surez', replacement: 'Suárez' },
    { pattern: 'Mndez', replacement: 'Méndez' },
    { pattern: 'Valds', replacement: 'Valdés' },
    
    // First names
    { pattern: 'Mara', replacement: 'María' },
    { pattern: 'Jos', replacement: 'José' },
    { pattern: 'Jess', replacement: 'Jesús' },
    { pattern: 'ngel', replacement: 'Ángel' },
    { pattern: 'ngela', replacement: 'Ángela' },
    { pattern: 'Ral', replacement: 'Raúl' },
    { pattern: 'Andrs', replacement: 'Andrés' },
    { pattern: 'Hctor', replacement: 'Héctor' },
    { pattern: 'Vctor', replacement: 'Víctor' },
    { pattern: 'Adrin', replacement: 'Adrián' },
    { pattern: 'Ivn', replacement: 'Iván' },
    { pattern: 'Sebastin', replacement: 'Sebastián' },
    { pattern: 'Nicols', replacement: 'Nicolás' },
    { pattern: 'Cristbal', replacement: 'Cristóbal' },
    { pattern: 'Valentn', replacement: 'Valentín' },
    { pattern: 'Joaqun', replacement: 'Joaquín' },
    { pattern: 'Luca', replacement: 'Lucía' },
    { pattern: 'Sofa', replacement: 'Sofía' },
    { pattern: 'Ins', replacement: 'Inés' },
    { pattern: 'Estefana', replacement: 'Estefanía' },
    { pattern: 'Concepcin', replacement: 'Concepción' },
    { pattern: 'Brbara', replacement: 'Bárbara' },
    { pattern: 'Mnica', replacement: 'Mónica' },
    { pattern: 'Vernica', replacement: 'Verónica' },
  ];
  
  console.log('\n⏳ Applying fixes to Spanish/Italian names...\n');
  
  let totalFixed = 0;
  
  for (const fix of nameFixPatterns) {
    // Fix in first_name field
    const { data: firstNameMatches } = await supabase
      .from('customers')
      .select('customer_id, first_name')
      .ilike('first_name', `%${fix.pattern}%`);
    
    if (firstNameMatches && firstNameMatches.length > 0) {
      for (const customer of firstNameMatches) {
        const fixed = customer.first_name.replace(
          new RegExp(`\\b${fix.pattern}\\b`, 'g'),
          fix.replacement
        );
        
        await supabase
          .from('customers')
          .update({ first_name: fixed })
          .eq('customer_id', customer.customer_id);
        
        totalFixed++;
      }
      console.log(`  Fixed "${fix.pattern}" -> "${fix.replacement}" in ${firstNameMatches.length} first names`);
    }
    
    // Fix in last_name field
    const { data: lastNameMatches } = await supabase
      .from('customers')
      .select('customer_id, last_name')
      .ilike('last_name', `%${fix.pattern}%`);
    
    if (lastNameMatches && lastNameMatches.length > 0) {
      for (const customer of lastNameMatches) {
        const fixed = customer.last_name.replace(
          new RegExp(`\\b${fix.pattern}\\b`, 'g'),
          fix.replacement
        );
        
        await supabase
          .from('customers')
          .update({ last_name: fixed })
          .eq('customer_id', customer.customer_id);
        
        totalFixed++;
      }
      console.log(`  Fixed "${fix.pattern}" -> "${fix.replacement}" in ${lastNameMatches.length} last names`);
    }
  }
  
  console.log('\n' + '=' .repeat(70));
  console.log('📊 RESULTS');
  console.log('=' .repeat(70));
  console.log(`✅ Total fixes applied: ${totalFixed}`);
  
  // Verify the fixes
  console.log('\n🔍 Verifying fixes...');
  
  const { data: samples } = await supabase
    .from('customers')
    .select('customer_id, first_name, last_name')
    .or('last_name.ilike.%díaz%,last_name.ilike.%garcía%,last_name.ilike.%pérez%,last_name.ilike.%lópez%')
    .limit(10);
  
  if (samples && samples.length > 0) {
    console.log('\nSample of fixed names:');
    samples.forEach(s => {
      console.log(`  ${s.customer_id}: ${s.first_name} ${s.last_name}`);
    });
  }
}

fixSpanishNames()
  .then(() => {
    console.log('\n✅ Spanish/Italian names fixed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });