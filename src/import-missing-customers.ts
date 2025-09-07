import { supabase } from './config/supabase';

interface CustomerData {
  booking_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number?: string;
}

async function importMissingCustomers(customerDataList: CustomerData[]) {
  console.log('🚀 Starting Customer Data Import');
  console.log('=' .repeat(70));
  console.log(`📊 Processing ${customerDataList.length} customer records\n`);
  
  let customersCreated = 0;
  let customersUpdated = 0;
  let relationshipsCreated = 0;
  let errors = 0;
  const errorDetails: any[] = [];
  
  try {
    for (const customerData of customerDataList) {
      try {
        console.log(`\n📝 Processing Booking ID: ${customerData.booking_id}`);
        console.log(`   Customer: ${customerData.first_name} ${customerData.last_name} (${customerData.email})`);
        
        // 1. Check if customer exists by email
        const { data: existingCustomer, error: checkError } = await supabase
          .from('customers')
          .select('customer_id')
          .eq('email', customerData.email)
          .single();
        
        let customerId: string;
        
        if (existingCustomer) {
          // Customer exists, update their data
          console.log(`   ✓ Customer exists with ID: ${existingCustomer.customer_id}`);
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
          console.log(`   ✓ Customer data updated`);
          
        } else {
          // Create new customer
          // Generate a unique customer_id (Bokun-style)
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
          console.log(`   ✓ New customer created with ID: ${customerId}`);
        }
        
        // 2. Check if booking exists in bookings table
        const { data: bookingExists, error: bookingCheckError } = await supabase
          .from('bookings')
          .select('booking_id')
          .eq('booking_id', customerData.booking_id)
          .single();
        
        if (!bookingExists) {
          console.log(`   ⚠️  Warning: Booking ${customerData.booking_id} not found in bookings table`);
          // Continue anyway to create the relationship if needed
        }
        
        // 3. Check if relationship already exists
        const { data: existingRelation, error: relationCheckError } = await supabase
          .from('booking_customers')
          .select('id')
          .eq('booking_id', customerData.booking_id)
          .eq('customer_id', customerId)
          .single();
        
        if (existingRelation) {
          console.log(`   ℹ️  Relationship already exists`);
        } else {
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
          console.log(`   ✓ Booking-Customer relationship created`);
        }
        
      } catch (error: any) {
        errors++;
        console.error(`   ❌ Error processing booking ${customerData.booking_id}:`, error.message);
        errorDetails.push({
          booking_id: customerData.booking_id,
          email: customerData.email,
          error: error.message
        });
      }
    }
    
    // Final summary
    console.log('\n' + '=' .repeat(70));
    console.log('📊 IMPORT SUMMARY');
    console.log('=' .repeat(70));
    console.log(`\n✅ Successfully processed:`);
    console.log(`   - New customers created: ${customersCreated}`);
    console.log(`   - Existing customers updated: ${customersUpdated}`);
    console.log(`   - New relationships created: ${relationshipsCreated}`);
    
    if (errors > 0) {
      console.log(`\n❌ Errors encountered: ${errors}`);
      console.log('\nError details:');
      errorDetails.forEach(e => {
        console.log(`   - Booking ${e.booking_id} (${e.email}): ${e.error}`);
      });
    }
    
    // Verify the import
    console.log('\n' + '=' .repeat(70));
    console.log('🔍 VERIFICATION');
    console.log('=' .repeat(70));
    
    // Check how many bookings now have customers
    const bookingIds = customerDataList.map(c => c.booking_id);
    const { data: verifyData } = await supabase
      .from('booking_customers')
      .select('booking_id')
      .in('booking_id', bookingIds);
    
    console.log(`\n📊 Out of ${bookingIds.length} bookings processed:`);
    console.log(`   - ${verifyData?.length || 0} now have customer relationships`);
    console.log(`   - ${bookingIds.length - (verifyData?.length || 0)} still missing relationships`);
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
  }
}

// Example usage - Replace this with your actual data
const sampleData: CustomerData[] = [
  // {
  //   booking_id: '73260301',
  //   first_name: 'John',
  //   last_name: 'Doe',
  //   email: 'john.doe@example.com',
  //   phone_number: '+1234567890'
  // },
  // Add more customer data here
];

// Uncomment and modify this section when you have the actual data
// importMissingCustomers(sampleData).catch(console.error);

// Export for use in other scripts
export { importMissingCustomers, CustomerData };