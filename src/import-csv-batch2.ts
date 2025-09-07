#!/usr/bin/env npx ts-node
import { supabase } from './config/supabase';
import * as fs from 'fs';

const BATCH_SIZE = 100; // Process 100 records at a time
const CSV_PATH = '/Users/pedromartinezsaro/Library/CloudStorage/Dropbox/TuItalianew/PEDRO/customers with booking id 2.csv';

interface CustomerData {
  booking_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number?: string;
}

async function processNextBatch() {
  console.log('🚀 Processing next batch of customers from CSV 2');
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
  
  console.log(`📊 Total unique records in CSV 2: ${allCustomers.length}`);
  
  // Get already processed bookings - need to paginate for large datasets
  console.log('🔍 Checking already processed bookings...');
  const processedSet = new Set<string>();
  let offset = 0;
  let hasMore = true;
  
  while (hasMore) {
    const { data: batch } = await supabase
      .from('booking_customers')
      .select('booking_id')
      .range(offset, offset + 999);
    
    if (batch && batch.length > 0) {
      batch.forEach(item => processedSet.add(item.booking_id));
      offset += 1000;
      hasMore = batch.length === 1000;
    } else {
      hasMore = false;
    }
  }
  
  console.log(`   Already processed: ${processedSet.size}`);
  
  // Find unprocessed
  const unprocessed = allCustomers.filter(c => !processedSet.has(c.booking_id));
  console.log(`   Remaining to process: ${unprocessed.length}`);
  
  if (unprocessed.length === 0) {
    console.log('\n✅ All customers from CSV 2 have been imported!');
    return { completed: true, processed: 0 };
  }
  
  // Process next batch
  const batch = unprocessed.slice(0, BATCH_SIZE);
  console.log(`\n📦 Processing ${batch.length} records...`);
  
  let created = 0;
  let updated = 0;
  let relationships = 0;
  let errors = 0;
  const errorDetails: string[] = [];
  
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
      
      // Check if relationship already exists
      const { data: existingRel } = await supabase
        .from('booking_customers')
        .select('id')
        .eq('booking_id', customer.booking_id)
        .eq('customer_id', customerId)
        .single();
      
      if (!existingRel) {
        // Create relationship
        await supabase
          .from('booking_customers')
          .insert({
            booking_id: customer.booking_id,
            customer_id: customerId,
            created_at: new Date().toISOString()
          });
        relationships++;
      }
      
      if ((created + updated) % 20 === 0) {
        process.stdout.write(`   ✓ Processed ${created + updated} customers\r`);
      }
    } catch (error: any) {
      errors++;
      const errorMsg = `Booking ${customer.booking_id} (${customer.email}): ${error.message}`;
      errorDetails.push(errorMsg);
      if (errorDetails.length <= 5) {
        console.error(`\n   ❌ ${errorMsg}`);
      }
    }
  }
  
  console.log('\n' + '=' .repeat(70));
  console.log('📊 BATCH SUMMARY');
  console.log(`   New customers: ${created}`);
  console.log(`   Updated customers: ${updated}`);
  console.log(`   New relationships: ${relationships}`);
  if (errors > 0) {
    console.log(`   Errors: ${errors}`);
  }
  console.log(`   Remaining: ${unprocessed.length - batch.length}`);
  
  return { completed: false, processed: batch.length };
}

// Check if file exists
if (!fs.existsSync(CSV_PATH)) {
  console.error(`❌ File not found: ${CSV_PATH}`);
  process.exit(1);
}

// Run the batch process
processNextBatch()
  .then(result => {
    if (result.completed) {
      console.log('\n🎉 Import from CSV 2 fully completed!');
    } else {
      console.log('\n⏳ Run this script again to process the next batch.');
      console.log('   Command: npx ts-node src/import-csv-batch2.ts');
      console.log('   or: npm run import-batch2');
    }
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });