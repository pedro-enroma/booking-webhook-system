import { partnerSolutionService } from './services/partnerSolutionService';

async function checkDocfiscale() {
  partnerSolutionService.clearConfigCache();
  partnerSolutionService.invalidateToken();

  try {
    const client = await (partnerSolutionService as any).getClient();
    
    // Get existing docfiscale records
    console.log('Checking docfiscale endpoint...\n');
    
    const response = await client.get('/docfiscales', {
      params: {
        itemsPerPage: 3
      }
    });
    
    console.log('Total docfiscales:', response.data['hydra:totalItems']);
    console.log('\nSample records:');
    
    const items = response.data['hydra:member'] || [];
    if (items.length > 0) {
      console.log(JSON.stringify(items[0], null, 2));
    } else {
      console.log('No docfiscales found');
      
      // Try to get schema/documentation
      console.log('\nTrying to get endpoint info...');
      try {
        const docs = await client.options('/docfiscales');
        console.log('Options:', docs.data);
      } catch (e) {
        console.log('No options available');
      }
    }

  } catch (error: any) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
    }
  }
}

checkDocfiscale();
