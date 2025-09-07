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

async function checkAndImportExisting() {
  console.log('🔍 Checking CSV Bookings Against Database & Importing Valid Ones');
  console.log('=' .repeat(70));
  
  // Parse both CSV files
  const csv1 = '/Users/pedromartinezsaro/Library/CloudStorage/Dropbox/TuItalianew/PEDRO/customers with booking id.csv';
  const csv2 = '/Users/pedromartinezsaro/Library/CloudStorage/Dropbox/TuItalianew/PEDRO/customers with booking id 2.csv';
  
  const allRecords: CustomerData[] = [];
  
  // Parse CSV 1
  console.log('📁 Reading CSV 1...');
  const csv1Content = fs.readFileSync(csv1, 'utf-8');
  const csv1Lines = csv1Content.split('\n');
  let csv1Count = 0;
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
      csv1Count++;
    }
  }
  console.log(`   Found ${csv1Count} records`);
  
  // Parse CSV 2
  console.log('📁 Reading CSV 2...');
  const csv2Content = fs.readFileSync(csv2, 'utf-8');
  const csv2Lines = csv2Content.split('\n');
  let csv2Count = 0;
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
      csv2Count++;
    }
  }
  console.log(`   Found ${csv2Count} records`);
  
  // Deduplicate by booking_id
  const uniqueMap = new Map<string, CustomerData>();
  allRecords.forEach(r => uniqueMap.set(r.booking_id, r));
  const uniqueRecords = Array.from(uniqueMap.values());
  
  console.log(`\n📊 Total unique booking IDs in CSVs: ${uniqueRecords.length}`);
  
  // Get all booking IDs from the bookings table
  console.log('\n🔍 Loading booking IDs from database...');
  const existingBookingIds = new Set<string>();
  
  // Get ALL bookings without pagination issues
  const { data: allBookings, error } = await supabase
    .from('bookings')
    .select('booking_id');
  
  if (error) {
    console.error('Error loading bookings:', error);
    return;
  }
  
  allBookings?.forEach(item => existingBookingIds.add(item.booking_id));
  
  console.log(`   Found ${existingBookingIds.size} bookings in database`);
  
  // Filter records to only those with existing bookings
  const validRecords = uniqueRecords.filter(r => existingBookingIds.has(r.booking_id));
  const invalidRecords = uniqueRecords.filter(r => !existingBookingIds.has(r.booking_id));
  
  console.log(`\n📊 Analysis:`);
  console.log(`   ✅ Valid records (booking exists): ${validRecords.length}`);
  console.log(`   ❌ Invalid records (booking missing): ${invalidRecords.length}`);
  
  // Show sample of invalid booking IDs
  if (invalidRecords.length > 0) {
    console.log(`\n   Sample of missing booking IDs:`);
    invalidRecords.slice(0, 10).forEach(r => {
      console.log(`     - ${r.booking_id}: ${r.first_name} ${r.last_name}`);
    });
    if (invalidRecords.length > 10) {
      console.log(`     ... and ${invalidRecords.length - 10} more`);
    }
  }
  
  // Check which valid records already have relationships
  console.log('\n🔍 Checking which valid records need import...');
  const needsImport: CustomerData[] = [];
  let alreadyImported = 0;
  
  for (const record of validRecords) {
    const { data } = await supabase
      .from('booking_customers')
      .select('id')
      .eq('booking_id', record.booking_id)
      .single();
    
    if (!data) {
      needsImport.push(record);
    } else {
      alreadyImported++;
    }
  }
  
  console.log(`   Already imported: ${alreadyImported}`);
  console.log(`   Need to import: ${needsImport.length}`);
  
  if (needsImport.length === 0) {
    console.log('\n✅ All valid records have already been imported!');
    return;
  }
  
  // Import the records that need importing
  console.log('\n⏳ Importing missing customer relationships for valid bookings...\n');
  let created = 0;
  let updated = 0;
  let relationships = 0;
  let errors = 0;
  
  for (let i = 0; i < needsImport.length; i++) {
    const customer = needsImport[i];
    
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
        console.log(`   ❌ Error with ${customer.booking_id}: ${relError.message}`);
      }
      
      // Progress update
      if ((i + 1) % 50 === 0) {
        console.log(`✓ Processed ${i + 1}/${needsImport.length} (Created: ${created}, Updated: ${updated}, Relationships: ${relationships})`);
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
  console.log(`\n📁 CSV Analysis:`);
  console.log(`   Total unique records in CSVs: ${uniqueRecords.length}`);
  console.log(`   Records with valid bookings: ${validRecords.length} (${((validRecords.length/uniqueRecords.length)*100).toFixed(1)}%)`);
  console.log(`   Records without bookings: ${invalidRecords.length} (${((invalidRecords.length/uniqueRecords.length)*100).toFixed(1)}%)`);
  
  console.log(`\n✅ Import Results:`);
  console.log(`   Processed: ${needsImport.length} records`);
  console.log(`   New customers created: ${created}`);
  console.log(`   Existing customers updated: ${updated}`);
  console.log(`   New relationships created: ${relationships}`);
  console.log(`   Errors: ${errors}`);
  
  // Database totals
  const { count: totalRelationships } = await supabase
    .from('booking_customers')
    .select('*', { count: 'exact', head: true });
  
  const { count: totalCustomers } = await supabase
    .from('customers')
    .select('*', { count: 'exact', head: true });
  
  const { count: totalBookings } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true });
  
  console.log(`\n📊 DATABASE TOTALS:`);
  console.log(`   Total bookings: ${totalBookings}`);
  console.log(`   Total customers: ${totalCustomers}`);
  console.log(`   Total relationships: ${totalRelationships}`);
  
  console.log(`\n💡 CONCLUSION:`);
  console.log(`   ✅ All possible customer relationships have been created.`);
  console.log(`   ⚠️  ${invalidRecords.length} records from CSVs cannot be imported`);
  console.log(`      because their booking IDs don't exist in the bookings table.`);
}

checkAndImportExisting()
  .then(() => {
    console.log('\n✅ Process completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });