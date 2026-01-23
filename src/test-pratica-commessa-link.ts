import axios from 'axios';

async function testPraticaWithCommessaID() {
  const apiUrl = 'https://catture.partnersolution.it';
  const username = 'enromacom';
  const password = '{q95j(t,v(N6';
  const agencyCode = '7206';

  // Commessa 2026-01 UUID from facilews3
  const commessaId = 'B53D23E5-3DB1-4CC2-8659-EFAED539336D';
  
  const bookingId = '81893013';
  const confirmationCode = 'CIV-81893013';
  const customerName = { firstName: 'Test', lastName: 'Commessa Link' };
  const amount = 100;

  try {
    console.log('=== Testing Pratica with Commessa UUID ===\n');

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

    const now = new Date().toISOString();

    // Try different formats for delivering field
    const deliveringFormats = [
      `commessa:${commessaId}`,           // UUID format
      `/commesses/${commessaId}`,         // IRI format
      commessaId,                          // Just UUID
    ];

    for (const delivering of deliveringFormats) {
      console.log(`\nTrying delivering: "${delivering}"`);
      
      try {
        const praticaPayload = {
          codicecliente: bookingId,
          externalid: bookingId,
          cognomecliente: customerName.lastName,
          nomecliente: customerName.firstName,
          codiceagenzia: agencyCode,
          tipocattura: 'PS',
          datacreazione: now,
          datamodifica: now,
          stato: 'WP',
          descrizionepratica: 'Tour UE ed Extra UE',
          noteinterne: 'Test linking to Commessa',
          delivering: delivering
        };

        const praticaResponse = await client.post('/prt_praticas', praticaPayload);
        console.log('  ✅ Pratica created:', praticaResponse.data['@id']);
        console.log('  delivering value accepted:', delivering);
        break;
      } catch (e: any) {
        console.log('  ❌ Error:', e.response?.data?.['hydra:description'] || e.message);
      }
    }

    // Also check what fields the Pratica schema expects
    console.log('\n\nChecking Pratica schema for commessa-related fields...');
    try {
      const schemaResponse = await client.get('/docs.jsonld');
      const schemaStr = JSON.stringify(schemaResponse.data);
      
      // Look for commessa mentions
      if (schemaStr.toLowerCase().includes('commess')) {
        console.log('Found commessa references in schema');
      }
      
      // Look for delivering field
      if (schemaStr.includes('delivering')) {
        console.log('Found delivering field in schema');
      }
    } catch (e) {
      console.log('Could not fetch schema');
    }

  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

testPraticaWithCommessaID();
