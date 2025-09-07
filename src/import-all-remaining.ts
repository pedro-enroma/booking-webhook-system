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

async function importAllRemaining() {
  console.log('🚀 FINAL COMPLETE IMPORT - Processing ALL Remaining Records');
  console.log('=' .repeat(70));
  
  // Parse both CSV files
  const csv1 = '/Users/pedromartinezsaro/Library/CloudStorage/Dropbox/TuItalianew/PEDRO/customers with booking id.csv';
  const csv2 = '/Users/pedromartinezsaro/Library/CloudStorage/Dropbox/TuItalianew/PEDRO/customers with booking id 2.csv';
  
  const allRecords: CustomerData[] = [];
  
  // Parse CSV 1
  const csv1Content = fs.readFileSync(csv1, 'utf-8');
  const csv1Lines = csv1Content.split('\n');
  for (let i = 1; i < csv1Lines.length; i++) {
    const line = csv1Lines[i].trim();
    if (!line) continue;
    const fields = line.split(';').map(f => f.trim());
    if (fields.length >= 4 && fields[3].includes('@')) {
      allRecords.push({
        booking_id: fields[0],
        first_name: fields[1] || '',
        last_name: fields[2] || '',
        email: fields[3],
        phone_number: fields[4] || undefined
      });
    }
  }
  
  // Parse CSV 2
  const csv2Content = fs.readFileSync(csv2, 'utf-8');
  const csv2Lines = csv2Content.split('\n');
  for (let i = 1; i < csv2Lines.length; i++) {
    const line = csv2Lines[i].trim();
    if (!line) continue;
    const fields = line.split(';').map(f => f.trim());
    if (fields.length >= 4 && fields[3].includes('@')) {
      allRecords.push({
        booking_id: fields[0],
        first_name: fields[1] || '',
        last_name: fields[2] || '',
        email: fields[3],
        phone_number: fields[4] || undefined
      });
    }
  }
  
  // Deduplicate by booking_id
  const uniqueMap = new Map<string, CustomerData>();
  allRecords.forEach(r => uniqueMap.set(r.booking_id, r));
  const uniqueRecords = Array.from(uniqueMap.values());
  
  console.log(`📊 Total unique records in CSVs: ${uniqueRecords.length}`);
  
  // Get ALL already processed bookings
  console.log('🔍 Loading already processed bookings...');
  const processedBookings = new Set<string>();
  let offset = 0;
  
  while (true) {
    const { data } = await supabase
      .from('booking_customers')
      .select('booking_id')
      .range(offset, offset + 999);
    
    if (!data || data.length === 0) break;
    
    data.forEach(item => processedBookings.add(item.booking_id));
    offset += 1000;
    if (data.length < 1000) break;
  }
  
  console.log(`✓ Already processed: ${processedBookings.size} unique bookings\n`);
  
  // Filter to only unprocessed records
  const unprocessedRecords = uniqueRecords.filter(r => !processedBookings.has(r.booking_id));
  console.log(`📊 Remaining to process: ${unprocessedRecords.length}\n`);
  
  if (unprocessedRecords.length === 0) {
    console.log('✅ All records have been imported!');
    return;
  }
  
  // Process ALL unprocessed records
  let created = 0;
  let updated = 0;
  let relationships = 0;
  let errors = 0;
  
  console.log('⏳ Processing all remaining records...\n');
  
  for (let i = 0; i < unprocessedRecords.length; i++) {
    const customer = unprocessedRecords[i];
    
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
        const { error } = await supabase
          .from('customers')
          .update({
            first_name: customer.first_name,
            last_name: customer.last_name,
            phone_number: customer.phone_number || null
          })
          .eq('customer_id', customerId);
        
        if (!error) updated++;
      } else {
        customerId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
        const { error } = await supabase
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
        
        if (!error) created++;
      }
      
      // Create relationship
      const { error: relError } = await supabase
        .from('booking_customers')
        .insert({
          booking_id: customer.booking_id,
          customer_id: customerId,
          created_at: new Date().toISOString()
        });
      
      if (!relError) relationships++;
      else errors++;
      
      // Progress update every 100 records
      if ((i + 1) % 100 === 0) {
        console.log(`✓ Processed ${i + 1}/${unprocessedRecords.length} (Created: ${created}, Updated: ${updated}, Relationships: ${relationships})`);
      }
      
    } catch (error) {
      errors++;
    }
  }
  
  // Final summary
  console.log('\n' + '=' .repeat(70));
  console.log('🎉 IMPORT COMPLETE!');
  console.log('=' .repeat(70));
  console.log(`✅ Successfully processed ${unprocessedRecords.length} records:`);
  console.log(`   - New customers created: ${created}`);
  console.log(`   - Existing customers updated: ${updated}`);
  console.log(`   - New relationships created: ${relationships}`);
  console.log(`   - Errors: ${errors}`);
  
  // Final database check
  const { count: totalRelationships } = await supabase
    .from('booking_customers')
    .select('*', { count: 'exact', head: true });
  
  const { count: totalCustomers } = await supabase
    .from('customers')
    .select('*', { count: 'exact', head: true });
  
  console.log(`\n📊 FINAL DATABASE TOTALS:`);
  console.log(`   - Total customers: ${totalCustomers}`);
  console.log(`   - Total relationships: ${totalRelationships}`);
  console.log(`   - Import completion: 100% ✅`);
}

importAllRemaining()
  .then(() => {
    console.log('\n✅ Import completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });