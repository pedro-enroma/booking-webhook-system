import axios from 'axios';

async function testCommessa() {
  const apiUrl = 'https://catture.partnersolution.it';
  const username = 'enromacom';
  const password = '{q95j(t,v(N6';
  const agencyCode = '7206';

  try {
    console.log('=== Testing Commessa API ===\n');

    // Authenticate
    console.log('Authenticating...');
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
    console.log('✅ Authenticated\n');

    const client = axios.create({
      baseURL: apiUrl,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/ld+json',
        'Accept': 'application/ld+json'
      }
    });

    // Try different endpoint names for Commesse
    const possibleEndpoints = [
      '/commesses',
      '/commesse',
      '/prt_commesses',
      '/prt_commessa',
      '/commessa',
      '/job_orders',
      '/joborders',
      '/delivering',
      '/prt_delivering'
    ];

    console.log('Trying to find Commessa endpoint (GET)...\n');

    for (const endpoint of possibleEndpoints) {
      try {
        const response = await client.get(endpoint, {
          params: { codiceagenzia: agencyCode }
        });
        console.log(`✅ ${endpoint} - FOUND!`);
        console.log('Response:', JSON.stringify(response.data, null, 2).substring(0, 500));
        break;
      } catch (e: any) {
        const status = e.response?.status || 'error';
        console.log(`❌ ${endpoint} - ${status}`);
      }
    }

    // Also try to look at API documentation endpoint
    console.log('\nTrying to find API docs...');
    const docEndpoints = ['/docs', '/api/docs', '/api', '/', '/contexts'];

    for (const endpoint of docEndpoints) {
      try {
        const response = await client.get(endpoint);
        if (response.data && typeof response.data === 'object') {
          console.log(`✅ ${endpoint} - Found`);
          // Look for any mention of commess
          const dataStr = JSON.stringify(response.data);
          if (dataStr.toLowerCase().includes('commess')) {
            console.log('Found "commess" in response!');
          }
        }
      } catch (e: any) {
        // Skip
      }
    }

    // Try to create a test commessa with different endpoints
    console.log('\n\nTrying to CREATE Commessa...\n');

    const commessaPayload = {
      codiceagenzia: agencyCode,
      codicecommessa: 'TEST-2026-01',
      descrizione: 'Tour UE ed Extra UE Gennaio 2026',
      stato: 'INS'
    };

    const createEndpoints = ['/commesses', '/commesse', '/prt_commesses'];

    for (const endpoint of createEndpoints) {
      try {
        console.log(`Trying POST ${endpoint}...`);
        const response = await client.post(endpoint, commessaPayload);
        console.log(`✅ ${endpoint} - CREATED!`);
        console.log('Response:', JSON.stringify(response.data, null, 2));
        break;
      } catch (e: any) {
        const status = e.response?.status || 'error';
        const message = e.response?.data?.['hydra:description'] || e.response?.statusText || e.message;
        console.log(`❌ ${endpoint} - ${status}: ${message}`);
      }
    }

  } catch (error: any) {
    console.error('\n=== ERROR ===');
    console.error('Message:', error.message);
    if (error.response?.data) {
      console.log('API Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testCommessa();
