import { supabase } from './config/supabase';
import { partnerSolutionService } from './services/partnerSolutionService';

async function testNewAccountCreation() {
  partnerSolutionService.clearConfigCache();
  partnerSolutionService.invalidateToken();

  // Get a customer with a Spanish phone number
  const { data: customers } = await supabase
    .from('customers')
    .select('customer_id, first_name, last_name, email, phone_number')
    .like('phone_number', '+34%')
    .limit(3);

  if (!customers || customers.length === 0) {
    console.log('No Spanish customers found');
    return;
  }

  const customer = customers[0];

  console.log('=== Testing New Account Creation ===');
  console.log('Customer ID:', customer.customer_id);
  console.log('Name:', customer.first_name, customer.last_name);
  console.log('Email:', customer.email);
  console.log('Phone:', customer.phone_number);

  // Get or create account
  const account = await partnerSolutionService.getOrCreateAccount({
    customer_id: customer.customer_id,
    first_name: customer.first_name,
    last_name: customer.last_name,
    email: customer.email,
    phone_number: customer.phone_number,
  });

  console.log('\n=== Account Result ===');
  console.log('Account IRI:', account['@id']);
  console.log('Codice Fiscale:', account.codicefiscale);
  console.log('Country:', account.nazione);
  console.log('External ID:', account.externalid);

  // Now verify we can find it again
  console.log('\n=== Verifying lookup works ===');
  const found = await partnerSolutionService.findAccountByExternalId('CUST-' + customer.customer_id);
  console.log('Found by externalid:', found ? found['@id'] : 'NOT FOUND');
}

testNewAccountCreation().catch(e => console.error('ERROR:', e.message));
