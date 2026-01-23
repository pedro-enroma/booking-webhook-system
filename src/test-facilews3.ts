import axios from 'axios';

async function testFacileWS3() {
  const apiUrl = 'https://facilews3.partnersolution.it';
  const username = 'enromacom';
  const password = '{q95j(t,v(N6';
  const agencyCode = '7206';

  try {
    console.log('=== Testing FacileWS3 API for Commesse ===\n');

    // Try different auth endpoints
    const authEndpoints = [
      '/login_check',
      '/api/login_check', 
      '/auth',
      '/api/auth',
      '/login',
      '/api/login',
      '/oauth/token'
    ];

    let token = null;
    
    for (const endpoint of authEndpoints) {
      try {
        console.log(`Trying auth at ${endpoint}...`);
        const params = new URLSearchParams();
        params.append('_username', username);
        params.append('_password', password);

        const response = await axios.post(`${apiUrl}${endpoint}`, params.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
          }
        });
        console.log(`✅ ${endpoint} worked!`);
        console.log('Response:', JSON.stringify(response.data, null, 2).substring(0, 300));
        token = response.data.token;
        break;
      } catch (e: any) {
        const status = e.response?.status || 'error';
        console.log(`  ${status}`);
      }
    }

    // Try to access root or docs without auth
    console.log('\nTrying unauthenticated endpoints...');
    const publicEndpoints = ['/', '/docs', '/api', '/api/docs'];
    
    for (const endpoint of publicEndpoints) {
      try {
        const response = await axios.get(`${apiUrl}${endpoint}`, {
          headers: { 'Accept': 'application/json' }
        });
        console.log(`✅ ${endpoint} accessible`);
        console.log('Response:', JSON.stringify(response.data, null, 2).substring(0, 500));
      } catch (e: any) {
        const status = e.response?.status || 'error';
        console.log(`❌ ${endpoint} - ${status}`);
      }
    }

    // Try with Basic Auth
    console.log('\nTrying Basic Auth...');
    try {
      const response = await axios.get(`${apiUrl}/commesse`, {
        auth: { username, password },
        headers: { 'Accept': 'application/json' }
      });
      console.log('✅ Basic Auth worked!');
      console.log('Response:', JSON.stringify(response.data, null, 2).substring(0, 500));
    } catch (e: any) {
      console.log('Basic Auth:', e.response?.status || e.message);
    }

  } catch (error: any) {
    console.error('\n=== ERROR ===');
    console.error('Message:', error.message);
  }
}

testFacileWS3();
