#!/usr/bin/env npx ts-node
import { supabase } from './config/supabase';
import * as fs from 'fs';

const BATCH_SIZE = 100;
const CSV_PATHS = {
  csv1: '/Users/pedromartinezsaro/Library/CloudStorage/Dropbox/TuItalianew/PEDRO/customers with booking id.csv',
  csv2: '/Users/pedromartinezsaro/Library/CloudStorage/Dropbox/TuItalianew/PEDRO/customers with booking id 2.csv'
};

interface CustomerData {
  booking_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number?: string;
}

function parseCSV(filePath: string): CustomerData[] {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const lines = fileContent.split('\n');
  const customers: CustomerData[] = [];
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
    
    customers.push({
      booking_id: booking_id,
      first_name: fields[1] || '',
      last_name: fields[2] || '',
      email: fields[3],
      phone_number: fields[4] || undefined
    });
  }
  
  return customers;
}

async function processAllCSVs() {
  console.log('🚀 Processing All Customer CSV Files');
  console.log('=' .repeat(70));
  
  // Parse both CSV files
  const csv1Data = parseCSV(CSV_PATHS.csv1);
  const csv2Data = parseCSV(CSV_PATHS.csv2);
  
  console.log(`📊 CSV 1: ${csv1Data.length} records`);
  console.log(`📊 CSV 2: ${csv2Data.length} records`);
  
  // Combine and deduplicate by booking_id
  const allCustomersMap = new Map<string, CustomerData>();
  
  [...csv1Data, ...csv2Data].forEach(customer => {
    allCustomersMap.set(customer.booking_id, customer);
  });
  
  const allCustomers = Array.from(allCustomersMap.values());
  console.log(`📊 Total unique records: ${allCustomers.length}\n`);
  
  // Get already processed bookings
  console.log('🔍 Fetching already processed bookings...');
  const processedBookings = new Set<string>();
  
  let offset = 0;
  let hasMore = true;
  
  while (hasMore) {
    const { data, error } = await supabase
      .from('booking_customers')
      .select('booking_id')
      .range(offset, offset + 999);
    
    if (error) {
      console.error('Error fetching processed:', error);
      break;
    }
    
    if (data && data.length > 0) {
      data.forEach(item => processedBookings.add(item.booking_id));
      offset += 1000;
      hasMore = data.length === 1000;
    } else {
      hasMore = false;
    }
  }
  
  console.log(`   Already processed: ${processedBookings.size}`);
  
  // Find unprocessed
  const unprocessed = allCustomers.filter(c => !processedBookings.has(c.booking_id));
  console.log(`   Remaining to process: ${unprocessed.length}\n`);
  
  if (unprocessed.length === 0) {
    console.log('✅ All customers have been imported!');
    return;
  }
  
  // Process in batches
  const totalBatches = Math.ceil(unprocessed.length / BATCH_SIZE);
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalRelationships = 0;
  
  for (let batchNum = 0; batchNum < Math.min(totalBatches, 10); batchNum++) {
    const start = batchNum * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, unprocessed.length);
    const batch = unprocessed.slice(start, end);
    
    console.log(`📦 Processing batch ${batchNum + 1}/${Math.min(totalBatches, 10)} (records ${start + 1}-${end})...`);
    
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
        
        // Check for existing relationship
        const { data: existingRel } = await supabase
          .from('booking_customers')
          .select('id')
          .eq('booking_id', customer.booking_id)
          .eq('customer_id', customerId)
          .single();
        
        if (!existingRel) {
          await supabase
            .from('booking_customers')
            .insert({
              booking_id: customer.booking_id,
              customer_id: customerId,
              created_at: new Date().toISOString()
            });
          relationships++;
        }
        
      } catch (error: any) {
        // Silent error handling to continue processing
      }
    }
    
    console.log(`   ✓ Created: ${created}, Updated: ${updated}, Relationships: ${relationships}\n`);
    
    totalCreated += created;
    totalUpdated += updated;
    totalRelationships += relationships;
  }
  
  console.log('=' .repeat(70));
  console.log('📊 SESSION SUMMARY');
  console.log(`   Total customers created: ${totalCreated}`);
  console.log(`   Total customers updated: ${totalUpdated}`);
  console.log(`   Total relationships created: ${totalRelationships}`);
  console.log(`   Remaining to process: ${unprocessed.length - (totalBatches > 10 ? BATCH_SIZE * 10 : unprocessed.length)}`);
  
  if (unprocessed.length > BATCH_SIZE * 10) {
    console.log('\n⏳ Run this script again to continue processing.');
  }
}

processAllCSVs()
  .then(() => {
    console.log('\n✅ Session completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });