import { supabase } from './config/supabase';
import * as fs from 'fs';

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
  const processedBookings = new Set<string>();
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const fields = line.split(';').map(f => f.trim());
    
    if (fields.length < 4) continue;
    
    const booking_id = fields[0];
    
    if (processedBookings.has(booking_id)) {
      continue;
    }
    
    processedBookings.add(booking_id);
    
    customers.push({
      booking_id: booking_id,
      first_name: fields[1] || '',
      last_name: fields[2] || '',
      email: fields[3] || '',
      phone_number: fields[4] || undefined
    });
  }
  
  return customers;
}

async function getProcessedBookings(): Promise<Set<string>> {
  console.log('🔍 Checking already processed bookings...');
  const processedSet = new Set<string>();
  
  // Get all existing booking-customer relationships
  let hasMore = true;
  let offset = 0;
  const limit = 1000;
  
  while (hasMore) {
    const { data, error } = await supabase
      .from('booking_customers')
      .select('booking_id')
      .range(offset, offset + limit - 1);
    
    if (error) {
      console.error('Error fetching processed bookings:', error);
      break;
    }
    
    if (data && data.length > 0) {
      data.forEach(item => processedSet.add(item.booking_id));
      offset += limit;
      hasMore = data.length === limit;
    } else {
      hasMore = false;
    }
  }
  
  console.log(`   Found ${processedSet.size} bookings already processed\n`);
  return processedSet;
}

async function importRemainingCustomers(csvPath: string) {
  console.log('🚀 Resuming CSV Customer Import');
  console.log('=' .repeat(70));
  console.log(`📁 Reading file: ${csvPath}\n`);
  
  let allCustomers: CustomerData[];
  
  try {
    allCustomers = parseCSV(csvPath);
    console.log(`📊 Found ${allCustomers.length} unique customer records in CSV`);
  } catch (error: any) {
    console.error(`❌ Error reading CSV file: ${error.message}`);
    return;
  }
  
  // Get already processed bookings
  const processedBookings = await getProcessedBookings();
  
  // Filter out already processed bookings
  const remainingCustomers = allCustomers.filter(c => !processedBookings.has(c.booking_id));
  
  console.log(`📊 ${remainingCustomers.length} bookings still need to be processed\n`);
  
  if (remainingCustomers.length === 0) {
    console.log('✅ All bookings have already been processed!');
    return;
  }
  
  let customersCreated = 0;
  let customersUpdated = 0;
  let relationshipsCreated = 0;
  let errors = 0;
  const errorDetails: any[] = [];
  
  // Process in smaller batches to avoid timeout
  const batchSize = 25;
  const totalBatches = Math.ceil(remainingCustomers.length / batchSize);
  
  for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
    const start = batchNum * batchSize;
    const end = Math.min(start + batchSize, remainingCustomers.length);
    const batch = remainingCustomers.slice(start, end);
    
    console.log(`\n📦 Processing batch ${batchNum + 1}/${totalBatches} (records ${start + 1}-${end})`);
    console.log('-' .repeat(50));
    
    for (const customerData of batch) {
      try {
        if (!customerData.email || !customerData.email.includes('@')) {
          continue;
        }
        
        // Check if customer exists
        const { data: existingCustomer } = await supabase
          .from('customers')
          .select('customer_id')
          .eq('email', customerData.email)
          .single();
        
        let customerId: string;
        
        if (existingCustomer) {
          customerId = existingCustomer.customer_id;
          
          await supabase
            .from('customers')
            .update({
              first_name: customerData.first_name,
              last_name: customerData.last_name,
              phone_number: customerData.phone_number || null
            })
            .eq('customer_id', customerId);
          
          customersUpdated++;
        } else {
          customerId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
          
          await supabase
            .from('customers')
            .insert({
              customer_id: customerId,
              uuid: crypto.randomUUID(),
              email: customerData.email,
              first_name: customerData.first_name,
              last_name: customerData.last_name,
              phone_number: customerData.phone_number || null,
              created_at: new Date().toISOString()
            });
          
          customersCreated++;
        }
        
        // Create relationship
        await supabase
          .from('booking_customers')
          .insert({
            booking_id: customerData.booking_id,
            customer_id: customerId,
            created_at: new Date().toISOString()
          });
        
        relationshipsCreated++;
        
        if ((customersCreated + customersUpdated) % 10 === 0) {
          process.stdout.write(`   ✓ Processed ${customersCreated + customersUpdated} customers\r`);
        }
        
      } catch (error: any) {
        errors++;
        errorDetails.push({
          booking_id: customerData.booking_id,
          email: customerData.email,
          error: error.message
        });
      }
    }
    
    // Add a small delay between batches to avoid rate limiting
    if (batchNum < totalBatches - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // Final summary
  console.log('\n\n' + '=' .repeat(70));
  console.log('📊 IMPORT SUMMARY');
  console.log('=' .repeat(70));
  console.log(`\n✅ Successfully processed in this run:`)
  console.log(`   - New customers created: ${customersCreated}`);
  console.log(`   - Existing customers updated: ${customersUpdated}`);
  console.log(`   - New relationships created: ${relationshipsCreated}`);
  
  if (errors > 0) {
    console.log(`\n❌ Errors encountered: ${errors}`);
    if (errorDetails.length > 0) {
      console.log('\nFirst 10 errors:');
      errorDetails.slice(0, 10).forEach(e => {
        console.log(`   - Booking ${e.booking_id}: ${e.error}`);
      });
    }
  }
}

const csvPath = '/Users/pedromartinezsaro/Library/CloudStorage/Dropbox/TuItalianew/PEDRO/customers with booking id.csv';

if (!fs.existsSync(csvPath)) {
  console.error(`❌ File not found: ${csvPath}`);
  process.exit(1);
}

importRemainingCustomers(csvPath)
  .then(() => {
    console.log('\n✅ Import completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });