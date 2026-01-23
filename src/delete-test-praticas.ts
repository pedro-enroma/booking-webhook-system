import axios from 'axios';

async function deleteTestPraticas() {
  const apiUrl = 'https://catture.partnersolution.it';
  const username = 'enromacom';
  const password = '{q95j(t,v(N6';
  const agencyCode = '7206';

  // Praticas to delete (all except 81893021)
  const toDelete = [
    '81893020',
    '81893016', 
    '81893015',
    '81893014',
    '81893013',
    '81893012',
    '81893011',
    '81896444',
    '81897826',
    '80759979',
  ];

  try {
    console.log('=== Deleting Test Praticas ===\n');

    // Authenticate
    const params = new URLSearchParams();
    params.append('_username', username);
    params.append('_password', password);

    const loginResponse = await axios.post(apiUrl + '/login_check', params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      }
    });

    const token = loginResponse.data.token;
    console.log('Authenticated\n');

    const client = axios.create({
      baseURL: apiUrl,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/ld+json',
        'Accept': 'application/ld+json'
      }
    });

    for (const externalId of toDelete) {
      console.log('Looking for pratica with externalid: ' + externalId);
      
      try {
        // Find pratica by externalid
        const searchResponse = await client.get('/prt_praticas', {
          params: { externalid: externalId, codiceagenzia: agencyCode }
        });

        const praticas = searchResponse.data['hydra:member'] || [];
        
        for (const pratica of praticas) {
          const iri = pratica['@id'];
          console.log('  Deleting: ' + iri);
          
          try {
            await client.delete(iri);
            console.log('  Deleted successfully');
          } catch (e: any) {
            console.log('  Delete failed: ' + (e.response?.status || e.message));
          }
        }

        if (praticas.length === 0) {
          console.log('  Not found');
        }
      } catch (e: any) {
        console.log('  Search error: ' + e.message);
      }
    }

    console.log('\nDone!');

  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

deleteTestPraticas();
