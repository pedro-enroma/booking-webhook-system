import axios from 'axios';

async function findSupplier() {
  const apiUrl = 'https://catture.partnersolution.it';
  const username = 'enromacom';
  const password = '{q95j(t,v(N6';
  const agencyCode = '7206';

  try {
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

    const client = axios.create({
      baseURL: apiUrl,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/ld+json',
        'Accept': 'application/ld+json'
      }
    });

    // Search for account with 2773
    console.log('Searching for any account containing 2773...');
    const response = await client.get('/accounts', { 
      params: { codiceagenzia: agencyCode, itemsPerPage: 100 } 
    });
    const accounts = response.data['hydra:member'] || [];
    
    const matching = accounts.filter((a: any) => 
      JSON.stringify(a).includes('2773')
    );
    
    if (matching.length > 0) {
      console.log('Found accounts with 2773:');
      matching.forEach((a: any) => console.log(JSON.stringify(a, null, 2)));
    } else {
      console.log('No accounts found with 2773');
      console.log('\nAll accounts:');
      accounts.forEach((a: any) => {
        const name = a.cognome || a.ragionesociale || 'N/A';
        console.log(`  ${a.codicefiscale} | ${name} | fornitore:${a.isfornitore}`);
      });
    }

    // Check a Servizio that imports successfully (from the old ones)
    console.log('\n\nLooking at Rossi Mario Servizio (the one that worked)...');
    const praticaResponse = await client.get('/prt_praticas', {
      params: { codiceagenzia: agencyCode, itemsPerPage: 50 }
    });
    const praticas = praticaResponse.data['hydra:member'] || [];
    console.log('Found', praticas.length, 'praticas');
    
    // Find one with ENROMA or different codice
    praticas.slice(0, 5).forEach((p: any) => {
      console.log(`  ${p.externalid} | ${p.cognomecliente} | stato:${p.stato}`);
    });

  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

findSupplier();
