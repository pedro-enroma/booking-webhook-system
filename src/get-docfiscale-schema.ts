import { partnerSolutionService } from './services/partnerSolutionService';

async function getDocfiscaleSchema() {
  partnerSolutionService.clearConfigCache();
  partnerSolutionService.invalidateToken();

  try {
    const client = await (partnerSolutionService as any).getClient();

    console.log('Fetching API documentation for Docfiscale schema...\n');

    const response = await client.get('/docs', {
      headers: {
        'Accept': 'application/json'
      }
    });

    const swagger = response.data;

    // Extract Docfiscale-related definitions
    console.log('='.repeat(60));
    console.log('DOCFISCALE SCHEMA');
    console.log('='.repeat(60));

    if (swagger.definitions?.Docfiscale) {
      console.log('\n--- Docfiscale ---');
      console.log(JSON.stringify(swagger.definitions.Docfiscale, null, 2));
    }

    console.log('\n' + '='.repeat(60));
    console.log('DOCFISCALEDETTAGLIO SCHEMA (line items)');
    console.log('='.repeat(60));

    if (swagger.definitions?.Docfiscaledettaglio) {
      console.log('\n--- Docfiscaledettaglio ---');
      console.log(JSON.stringify(swagger.definitions.Docfiscaledettaglio, null, 2));
    }

    console.log('\n' + '='.repeat(60));
    console.log('DOCFISCALEXML SCHEMA (SDI XML)');
    console.log('='.repeat(60));

    if (swagger.definitions?.Docfiscalexml) {
      console.log('\n--- Docfiscalexml ---');
      console.log(JSON.stringify(swagger.definitions.Docfiscalexml, null, 2));
    }

    console.log('\n' + '='.repeat(60));
    console.log('DOCFISCALEXMLNOTIFICA SCHEMA (SDI notifications)');
    console.log('='.repeat(60));

    if (swagger.definitions?.Docfiscalexmlnotifica) {
      console.log('\n--- Docfiscalexmlnotifica ---');
      console.log(JSON.stringify(swagger.definitions.Docfiscalexmlnotifica, null, 2));
    }

    // Also try to fetch an existing docfiscale to see actual data structure
    console.log('\n\n' + '='.repeat(60));
    console.log('EXISTING DOCFISCALE EXAMPLES');
    console.log('='.repeat(60));

    try {
      const existingResponse = await client.get('/docfiscales', {
        params: { itemsPerPage: 2 }
      });

      const items = existingResponse.data['hydra:member'] || [];
      console.log('\nTotal docfiscales:', existingResponse.data['hydra:totalItems']);

      if (items.length > 0) {
        console.log('\nExample docfiscale:');
        console.log(JSON.stringify(items[0], null, 2));
      }
    } catch (e: any) {
      console.log('Could not fetch existing docfiscales:', e.message);
    }

  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

getDocfiscaleSchema();
