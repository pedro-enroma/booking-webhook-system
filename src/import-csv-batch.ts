#!/usr/bin/env npx ts-node
import { supabase } from './config/supabase';
import * as fs from 'fs';

const BATCH_SIZE = 100; // Process 100 records at a time
const CSV_PATH = '/Users/pedromartinezsaro/Library/CloudStorage/Dropbox/TuItalianew/PEDRO/customers with booking id.csv';

interface CustomerData {
  booking_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number?: string;
}

async function processNextBatch() {
  console.log('🚀 Processing next batch of customers from CSV');
  console.log('=' .repeat(70));
  
  // Parse CSV
  const fileContent = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = fileContent.split('\n');
  const allCustomers: CustomerData[] = [];
  const seenBookings = new Set<string>();
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const fields = line.split(';').map(f => f.trim());
    if (fields.length < 4) continue;
    
    const booking_id = fields[0];
    if (seenBookings.has(booking_id)) continue;
    
    seenBookings.add(booking_id);
    
    if (!fields[3] || !fields[3].includes('@')) continue;
    
    allCustomers.push({
      booking_id: booking_id,
      first_name: fields[1] || '',
      last_name: fields[2] || '',
      email: fields[3],
      phone_number: fields[4] || undefined
    });
  }
  
  console.log(`📊 Total unique records in CSV: ${allCustomers.length}`);
  
  // Get already processed bookings
  console.log('🔍 Checking already processed bookings...');
  const { data: processed } = await supabase
    .from('booking_customers')
    .select('booking_id');
  
  const processedSet = new Set(processed?.map(p => p.booking_id) || []);
  console.log(`   Already processed: ${processedSet.size}`);
  
  // Find unprocessed
  const unprocessed = allCustomers.filter(c => !processedSet.has(c.booking_id));
  console.log(`   Remaining to process: ${unprocessed.length}`);
  
  if (unprocessed.length === 0) {
    console.log('\n✅ All customers have been imported!');
    return { completed: true, processed: 0 };
  }
  
  // Process next batch
  const batch = unprocessed.slice(0, BATCH_SIZE);
  console.log(`\n📦 Processing ${batch.length} records...`);
  
  let created = 0;
  let updated = 0;
  let relationships = 0;
  
  for (const customer of batch) {
    try {
      // Check if customer exists
      const { data: existing } = await supabase
        .from('customers')
        .select('customer_id')
        .eq('email', customer.email)
        .single();
      
      let customerId: string;
      
      if (existing) {
        customerId = existing.customer_id;
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
      
      if ((created + updated) % 20 === 0) {
        process.stdout.write(`   ✓ Processed ${created + updated} customers\r`);
      }
    } catch (error: any) {
      console.error(`\n   ❌ Error with ${customer.booking_id}: ${error.message}`);
    }
  }
  
  console.log('\n' + '=' .repeat(70));
  console.log('📊 BATCH SUMMARY');
  console.log(`   New customers: ${created}`);
  console.log(`   Updated customers: ${updated}`);
  console.log(`   New relationships: ${relationships}`);
  console.log(`   Remaining: ${unprocessed.length - batch.length}`);
  
  return { completed: false, processed: batch.length };
}

// Run the batch process
processNextBatch()
  .then(result => {
    if (result.completed) {
      console.log('\n🎉 Import fully completed!');
    } else {
      console.log('\n⏳ Run this script again to process the next batch.');
      console.log('   Command: npx ts-node src/import-csv-batch.ts');
    }
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });