import axios from 'axios';

async function testCommessa() {
  const apiUrl = 'https://catture.partnersolution.it';
  const username = 'enromacom';
  const password = '{q95j(t,v(N6';

  try {
    console.log('=== Checking API Docs for Commessa ===\n');

    // Authenticate
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

    // Get the API docs
    const docsResponse = await client.get('/docs', {
      headers: { 'Accept': 'application/json' }
    });

    const docsStr = JSON.stringify(docsResponse.data, null, 2);

    // Find all mentions of "commess" (case insensitive)
    const lines = docsStr.split('\n');
    console.log('Lines containing "commess":');
    lines.forEach((line, i) => {
      if (line.toLowerCase().includes('commess')) {
        console.log(`  Line ${i}: ${line.trim()}`);
      }
    });

    // Also look for all endpoint paths in the docs
    console.log('\n\nLooking for all paths in docs...');
    const pathMatches = docsStr.match(/"\/[a-z_]+"/gi);
    if (pathMatches) {
      const uniquePaths = [...new Set(pathMatches)];
      console.log('Found paths:', uniquePaths.slice(0, 50));
    }

    // Check the root endpoint for available resources
    console.log('\n\nChecking root endpoint for resources...');
    try {
      const rootResponse = await client.get('/');
      console.log('Root response keys:', Object.keys(rootResponse.data));
      if (rootResponse.data['@context']) {
        console.log('Context:', rootResponse.data['@context']);
      }
    } catch (e) {
      console.log('Root error');
    }

  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

testCommessa();
