import { partnerSolutionService } from './services/partnerSolutionService';

async function fetchApiDocs() {
  partnerSolutionService.clearConfigCache();
  partnerSolutionService.invalidateToken();

  try {
    const client = await (partnerSolutionService as any).getClient();

    console.log('Fetching API documentation...\n');

    // Try to get the docs endpoint
    const response = await client.get('/docs', {
      headers: {
        'Accept': 'application/json'
      }
    });

    console.log('API Docs Response:');
    console.log(JSON.stringify(response.data, null, 2));

  } catch (error: any) {
    console.error('Error fetching /docs:', error.message);

    // Try alternative documentation endpoints
    console.log('\nTrying alternative endpoints...\n');

    try {
      const client = await (partnerSolutionService as any).getClient();

      // Try /contexts/Docfiscale
      console.log('1. Fetching /contexts/Docfiscale...');
      const contextResponse = await client.get('/contexts/Docfiscale');
      console.log(JSON.stringify(contextResponse.data, null, 2));
    } catch (e: any) {
      console.log('   Error:', e.message);
    }

    try {
      const client = await (partnerSolutionService as any).getClient();

      // Try to get a single docfiscale to see the structure
      console.log('\n2. Fetching /docfiscales with minimal query...');
      const docsResponse = await client.get('/docfiscales', {
        params: { itemsPerPage: 1 }
      });

      const items = docsResponse.data['hydra:member'] || [];
      if (items.length > 0) {
        console.log('Sample docfiscale structure:');
        console.log(JSON.stringify(items[0], null, 2));
      } else {
        console.log('No docfiscales found');
      }
    } catch (e: any) {
      console.log('   Error:', e.message);
    }

    try {
      const client = await (partnerSolutionService as any).getClient();

      // Try docfiscaledettaglios
      console.log('\n3. Fetching /docfiscaledettaglios...');
      const dettagliResponse = await client.get('/docfiscaledettaglios', {
        params: { itemsPerPage: 1 }
      });

      const items = dettagliResponse.data['hydra:member'] || [];
      if (items.length > 0) {
        console.log('Sample dettaglio structure:');
        console.log(JSON.stringify(items[0], null, 2));
      } else {
        console.log('No dettaglios found');
      }
    } catch (e: any) {
      console.log('   Error:', e.message);
    }
  }
}

fetchApiDocs();
