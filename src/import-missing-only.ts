#!/usr/bin/env npx ts-node
import { supabase } from './config/supabase';
import * as fs from 'fs';

interface CustomerData {
  booking_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number?: string;
}

async function importMissingOnly() {
  console.log('🚀 Importing ONLY Missing Records');
  console.log('=' .repeat(70));
  
  // Parse both CSV files
  const csv1 = '/Users/pedromartinezsaro/Library/CloudStorage/Dropbox/TuItalianew/PEDRO/customers with booking id.csv';
  const csv2 = '/Users/pedromartinezsaro/Library/CloudStorage/Dropbox/TuItalianew/PEDRO/customers with booking id 2.csv';
  
  const allRecords: CustomerData[] = [];
  
  // Parse CSV 1
  console.log('📁 Reading CSV 1...');
  const csv1Content = fs.readFileSync(csv1, 'utf-8');
  const csv1Lines = csv1Content.split('\n');
  for (let i = 1; i < csv1Lines.length; i++) {
    const line = csv1Lines[i].trim();
    if (!line) continue;
    const fields = line.split(';').map(f => f.trim());
    if (fields.length >= 4 && fields[3] && fields[3].includes('@')) {
      allRecords.push({
        booking_id: fields[0],
        first_name: fields[1] || '',
        last_name: fields[2] || '',
        email: fields[3],
        phone_number: fields[4] || undefined
      });
    }
  }
  console.log(`   Found ${allRecords.length} records`);
  
  // Parse CSV 2
  console.log('📁 Reading CSV 2...');
  const csv2StartCount = allRecords.length;
  const csv2Content = fs.readFileSync(csv2, 'utf-8');
  const csv2Lines = csv2Content.split('\n');
  for (let i = 1; i < csv2Lines.length; i++) {
    const line = csv2Lines[i].trim();
    if (!line) continue;
    const fields = line.split(';').map(f => f.trim());
    if (fields.length >= 4 && fields[3] && fields[3].includes('@')) {
      allRecords.push({
        booking_id: fields[0],
        first_name: fields[1] || '',
        last_name: fields[2] || '',
        email: fields[3],
        phone_number: fields[4] || undefined
      });
    }
  }
  console.log(`   Found ${allRecords.length - csv2StartCount} records`);
  
  // Deduplicate by booking_id
  const uniqueMap = new Map<string, CustomerData>();
  allRecords.forEach(r => uniqueMap.set(r.booking_id, r));
  const uniqueRecords = Array.from(uniqueMap.values());
  
  console.log(`\n📊 Total unique records: ${uniqueRecords.length}`);
  
  // Check each record individually
  console.log('\n🔍 Checking for missing records...');
  const missingRecords: CustomerData[] = [];
  let checkedCount = 0;
  
  for (const record of uniqueRecords) {
    // Check if relationship exists
    const { data } = await supabase
      .from('booking_customers')
      .select('id')
      .eq('booking_id', record.booking_id)
      .single();
    
    if (!data) {
      missingRecords.push(record);
    }
    
    checkedCount++;
    if (checkedCount % 500 === 0) {
      process.stdout.write(`   Checked ${checkedCount}/${uniqueRecords.length} records (found ${missingRecords.length} missing)\r`);
    }
  }
  
  console.log(`\n   ✓ Found ${missingRecords.length} missing records to import\n`);
  
  if (missingRecords.length === 0) {
    console.log('✅ No missing records found!');
    return;
  }
  
  // Import missing records
  console.log('⏳ Importing missing records...\n');
  let created = 0;
  let updated = 0;
  let relationships = 0;
  let errors = 0;
  
  for (let i = 0; i < missingRecords.length; i++) {
    const customer = missingRecords[i];
    
    try {
      // Check/create customer
      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('customer_id')
        .eq('email', customer.email)
        .single();
      
      let customerId: string;
      
      if (existingCustomer) {
        customerId = existingCustomer.customer_id;
        await supabase
          .from('customers')
          .update({
            first_name: customer.first_name,
            last_name: customer.last_name,
            phone_number: customer.phone_number || null
          })
          .eq('customer_id', customerId);
        updated++;
      } else {
        customerId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
        await supabase
          .from('customers')
          .insert({
            customer_id: customerId,
            uuid: crypto.randomUUID(),
            email: customer.email,
            first_name: customer.first_name,
            last_name: customer.last_name,
            phone_number: customer.phone_number || null,
            created_at: new Date().toISOString()
          });
        created++;
      }
      
      // Create relationship
      const { error: relError } = await supabase
        .from('booking_customers')
        .insert({
          booking_id: customer.booking_id,
          customer_id: customerId,
          created_at: new Date().toISOString()
        });
      
      if (!relError) {
        relationships++;
      } else {
        errors++;
        console.log(`   ❌ Error creating relationship for ${customer.booking_id}: ${relError.message}`);
      }
      
      // Progress update
      if ((i + 1) % 100 === 0) {
        console.log(`✓ Processed ${i + 1}/${missingRecords.length} (Created: ${created}, Updated: ${updated}, Relationships: ${relationships})`);
      }
      
    } catch (error: any) {
      errors++;
      console.log(`   ❌ Error with ${customer.booking_id}: ${error.message}`);
    }
  }
  
  // Final summary
  console.log('\n' + '=' .repeat(70));
  console.log('📊 IMPORT SUMMARY');
  console.log('=' .repeat(70));
  console.log(`✅ Processed ${missingRecords.length} missing records:`);
  console.log(`   - New customers created: ${created}`);
  console.log(`   - Existing customers updated: ${updated}`);
  console.log(`   - New relationships created: ${relationships}`);
  console.log(`   - Errors: ${errors}`);
  
  // Verify
  const { count: totalRelationships } = await supabase
    .from('booking_customers')
    .select('*', { count: 'exact', head: true });
  
  const { count: totalCustomers } = await supabase
    .from('customers')
    .select('*', { count: 'exact', head: true });
  
  console.log(`\n📊 DATABASE TOTALS:`);
  console.log(`   - Total customers: ${totalCustomers}`);
  console.log(`   - Total relationships: ${totalRelationships}`);
  
  // Re-check for missing
  console.log('\n🔍 Verifying import...');
  let stillMissing = 0;
  for (const record of missingRecords) {
    const { data } = await supabase
      .from('booking_customers')
      .select('id')
      .eq('booking_id', record.booking_id)
      .single();
    
    if (!data) {
      stillMissing++;
    }
  }
  
  if (stillMissing === 0) {
    console.log('   ✅ All missing records have been imported successfully!');
  } else {
    console.log(`   ⚠️  ${stillMissing} records are still missing (may be due to errors)`);
  }
}

importMissingOnly()
  .then(() => {
    console.log('\n✅ Import completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });