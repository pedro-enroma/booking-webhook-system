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
  console.log('🚀 Final Import - Processing All Remaining Records');
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
  
  console.log(`📊 Total unique records to process: ${uniqueRecords.length}`);
  
  // Process in smaller chunks
  let processed = 0;
  let created = 0;
  let updated = 0;
  let relationships = 0;
  let skipped = 0;
  
  // Get count of already processed unique bookings to determine offset
  let processedBookings = new Set<string>();
  let checkOffset = 0;
  let hasMore = true;
  
  while (hasMore) {
    const { data } = await supabase
      .from('booking_customers')
      .select('booking_id')
      .range(checkOffset, checkOffset + 999);
    
    if (data && data.length > 0) {
      data.forEach(item => processedBookings.add(item.booking_id));
      checkOffset += 1000;
      hasMore = data.length === 1000;
    } else {
      hasMore = false;
    }
  }
  
  // Find first unprocessed record
  let startOffset = 0;
  for (let i = 0; i < uniqueRecords.length; i++) {
    if (!processedBookings.has(uniqueRecords[i].booking_id)) {
      startOffset = i;
      break;
    }
  }
  
  console.log(`📍 Starting from offset: ${startOffset}\n`);
  
  for (let i = startOffset; i < uniqueRecords.length && i < startOffset + 2000; i++) {
    const customer = uniqueRecords[i];
    
    try {
      // Check if relationship already exists
      const { data: existingRelation } = await supabase
        .from('booking_customers')
        .select('id')
        .eq('booking_id', customer.booking_id)
        .single();
      
      if (existingRelation) {
        skipped++;
        if (skipped % 100 === 0) {
          process.stdout.write(`   ⏭️  Skipped ${skipped} already processed\r`);
        }
        continue;
      }
      
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
      await supabase
        .from('booking_customers')
        .insert({
          booking_id: customer.booking_id,
          customer_id: customerId,
          created_at: new Date().toISOString()
        });
      relationships++;
      
      processed++;
      if (processed % 50 === 0) {
        console.log(`\n✓ Processed ${processed} new records (Created: ${created}, Updated: ${updated})`);
      }
      
    } catch (error) {
      // Continue on error
    }
  }
  
  console.log('\n' + '=' .repeat(70));
  console.log('📊 IMPORT SUMMARY');
  console.log(`   Records checked: ${processed + skipped}`);
  console.log(`   Already processed (skipped): ${skipped}`);
  console.log(`   New customers created: ${created}`);
  console.log(`   Existing customers updated: ${updated}`);
  console.log(`   New relationships created: ${relationships}`);
  
  // Final status check
  const { count: totalRelationships } = await supabase
    .from('booking_customers')
    .select('*', { count: 'exact', head: true });
  
  console.log(`\n📊 TOTAL RELATIONSHIPS IN DATABASE: ${totalRelationships}`);
  
  if (processed > 0) {
    console.log('\n⏳ Run again to continue processing remaining records.');
  } else if (skipped === 2000) {
    console.log('\n⏳ First 2000 records already processed. Run again for next batch.');
  } else {
    console.log('\n✅ Import complete!');
  }
}

importAllRemaining()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });