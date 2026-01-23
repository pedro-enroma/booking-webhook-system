import axios from 'axios';

async function testProductionAuth() {
  const apiUrl = 'https://catture.partnersolution.it';
  const username = 'enromacom';  // Demo credentials
  const password = '{q95j(t,v(N6';  // Demo credentials
  const agencyCode = '7206';  // Production agency code

  try {
    console.log('=== Testing Production Authentication ===\n');

    // Step 1: Authenticate
    console.log('Step 1: Authenticating...');
    console.log('  Username:', username);

    // Try URL-encoded form data
    const params = new URLSearchParams();
    params.append('_username', username);
    params.append('_password', password);

    const loginResponse = await axios.post(`${apiUrl}/login_check`, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      }
    });

    const token = loginResponse.data.token;
    console.log('  ✅ Authentication successful!');
    console.log('  Token (first 50 chars):', token.substring(0, 50) + '...');

    // Create authenticated client
    const client = axios.create({
      baseURL: apiUrl,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/ld+json',
        'Accept': 'application/ld+json'
      }
    });

    // Step 2: Try to list some existing data (READ ONLY)
    console.log('\nStep 2: Checking existing data (read-only)...');

    // Check accounts
    try {
      const accountsResponse = await client.get('/accounts', {
        params: { codiceagenzia: agencyCode, limit: 3 }
      });
      const accountCount = accountsResponse.data['hydra:totalItems'] || accountsResponse.data['hydra:member']?.length || 0;
      console.log(`  ✅ Accounts accessible - Found ${accountCount} accounts`);
      if (accountsResponse.data['hydra:member']?.length > 0) {
        console.log('  Sample account:', accountsResponse.data['hydra:member'][0]['@id']);
      }
    } catch (e: any) {
      console.log('  ❌ Accounts error:', e.response?.data?.['hydra:description'] || e.message);
    }

    // Check praticas
    try {
      const praticasResponse = await client.get('/prt_praticas', {
        params: { codiceagenzia: agencyCode, limit: 3 }
      });
      const praticaCount = praticasResponse.data['hydra:totalItems'] || praticasResponse.data['hydra:member']?.length || 0;
      console.log(`  ✅ Praticas accessible - Found ${praticaCount} praticas`);
      if (praticasResponse.data['hydra:member']?.length > 0) {
        console.log('  Sample pratica:', praticasResponse.data['hydra:member'][0]['@id']);
      }
    } catch (e: any) {
      console.log('  ❌ Praticas error:', e.response?.data?.['hydra:description'] || e.message);
    }

    // Check mov_finanziarios
    try {
      const movResponse = await client.get('/mov_finanziarios', {
        params: { codiceagenzia: agencyCode, limit: 3 }
      });
      const movCount = movResponse.data['hydra:totalItems'] || movResponse.data['hydra:member']?.length || 0;
      console.log(`  ✅ Movimenti Finanziari accessible - Found ${movCount} movements`);
    } catch (e: any) {
      console.log('  ❌ Movimenti error:', e.response?.data?.['hydra:description'] || e.message);
    }

    console.log('\n=== DRY RUN COMPLETE ===');
    console.log('Production credentials are working!');
    console.log('Agency code:', agencyCode);

  } catch (error: any) {
    console.error('\n=== ERROR ===');
    console.error('Message:', error.message);
    if (error.response?.data) {
      console.log('API Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testProductionAuth();
