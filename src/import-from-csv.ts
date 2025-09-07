import { supabase } from './config/supabase';
import * as fs from 'fs';
import * as path from 'path';

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
  
  // Skip header and process data
  const customers: CustomerData[] = [];
  const processedBookings = new Set<string>(); // Track unique booking IDs
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const fields = line.split(';').map(f => f.trim());
    
    if (fields.length < 4) continue; // Skip invalid lines
    
    const booking_id = fields[0];
    
    // Skip duplicates
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

async function importCustomersFromCSV(csvPath: string) {
  console.log('🚀 Starting CSV Customer Import');
  console.log('=' .repeat(70));
  console.log(`📁 Reading file: ${csvPath}\n`);
  
  let customerDataList: CustomerData[];
  
  try {
    customerDataList = parseCSV(csvPath);
    console.log(`📊 Found ${customerDataList.length} unique customer records in CSV\n`);
  } catch (error: any) {
    console.error(`❌ Error reading CSV file: ${error.message}`);
    return;
  }
  
  let customersCreated = 0;
  let customersUpdated = 0;
  let relationshipsCreated = 0;
  let errors = 0;
  const errorDetails: any[] = [];
  
  // Process in batches to avoid overwhelming the database
  const batchSize = 50;
  const totalBatches = Math.ceil(customerDataList.length / batchSize);
  
  for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
    const start = batchNum * batchSize;
    const end = Math.min(start + batchSize, customerDataList.length);
    const batch = customerDataList.slice(start, end);
    
    console.log(`\n📦 Processing batch ${batchNum + 1}/${totalBatches} (records ${start + 1}-${end})`);
    console.log('-' .repeat(50));
    
    for (const customerData of batch) {
      try {
        // Skip if email is invalid
        if (!customerData.email || !customerData.email.includes('@')) {
          console.log(`   ⚠️  Skipping ${customerData.booking_id}: Invalid email`);
          continue;
        }
        
        // 1. Check if customer exists by email
        const { data: existingCustomer, error: checkError } = await supabase
          .from('customers')
          .select('customer_id')
          .eq('email', customerData.email)
          .single();
        
        let customerId: string;
        
        if (existingCustomer) {
          // Customer exists, update their data
          customerId = existingCustomer.customer_id;
          
          const { error: updateError } = await supabase
            .from('customers')
            .update({
              first_name: customerData.first_name,
              last_name: customerData.last_name,
              phone_number: customerData.phone_number || null
            })
            .eq('customer_id', customerId);
          
          if (updateError) {
            throw updateError;
          }
          customersUpdated++;
          
        } else {
          // Create new customer
          customerId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
          
          const { error: insertError } = await supabase
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
          
          if (insertError) {
            throw insertError;
          }
          customersCreated++;
        }
        
        // 2. Check if relationship already exists
        const { data: existingRelation, error: relationCheckError } = await supabase
          .from('booking_customers')
          .select('id')
          .eq('booking_id', customerData.booking_id)
          .eq('customer_id', customerId)
          .single();
        
        if (!existingRelation) {
          // Create the booking-customer relationship
          const { error: relationError } = await supabase
            .from('booking_customers')
            .insert({
              booking_id: customerData.booking_id,
              customer_id: customerId,
              created_at: new Date().toISOString()
            });
          
          if (relationError) {
            throw relationError;
          }
          relationshipsCreated++;
        }
        
        // Show progress for every 10th record
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
  }
  
  // Final summary
  console.log('\n\n' + '=' .repeat(70));
  console.log('📊 IMPORT SUMMARY');
  console.log('=' .repeat(70));
  console.log(`\n✅ Successfully processed:`)
  console.log(`   - New customers created: ${customersCreated}`);
  console.log(`   - Existing customers updated: ${customersUpdated}`);
  console.log(`   - New relationships created: ${relationshipsCreated}`);
  
  if (errors > 0) {
    console.log(`\n❌ Errors encountered: ${errors}`);
    console.log('\nFirst 10 errors:');
    errorDetails.slice(0, 10).forEach(e => {
      console.log(`   - Booking ${e.booking_id} (${e.email}): ${e.error}`);
    });
  }
  
  // Verification
  console.log('\n' + '=' .repeat(70));
  console.log('🔍 VERIFICATION');
  console.log('=' .repeat(70));
  
  const uniqueBookingIds = [...new Set(customerDataList.map(c => c.booking_id))];
  const { data: verifyData } = await supabase
    .from('booking_customers')
    .select('booking_id')
    .in('booking_id', uniqueBookingIds.slice(0, 1000)); // Check first 1000
  
  console.log(`\n📊 Out of ${uniqueBookingIds.length} unique bookings in CSV:`);
  console.log(`   - ${verifyData?.length || 0} now have customer relationships (sample of first 1000)`);
}

// Get the CSV file path from command line or use default
const csvPath = process.argv[2] || '/Users/pedromartinezsaro/Library/CloudStorage/Dropbox/TuItalianew/PEDRO/customers with booking id.csv';

// Check if file exists
if (!fs.existsSync(csvPath)) {
  console.error(`❌ File not found: ${csvPath}`);
  process.exit(1);
}

// Run the import
importCustomersFromCSV(csvPath)
  .then(() => {
    console.log('\n✅ Import completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });