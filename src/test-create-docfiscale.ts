import { partnerSolutionService } from './services/partnerSolutionService';

async function testCreateDocfiscale() {
  partnerSolutionService.clearConfigCache();
  partnerSolutionService.invalidateToken();

  try {
    const client = await (partnerSolutionService as any).getClient();
    
    console.log('Trying to create a docfiscale...\n');
    
    const response = await client.post('/docfiscales', {
      codiceagenzia: 'demo2',
      stato: 'WP',
      tipodocumento: 'FT',  // Fattura
      datacreazione: new Date().toISOString(),
      datamodifica: new Date().toISOString(),
    });
    
    console.log('Response:', response.data);

  } catch (error: any) {
    console.error('Error:', error.message);
    if (error.response?.data) {
      console.log('\nValidation errors:');
      console.log(JSON.stringify(error.response.data, null, 2));
    }
  }
}

testCreateDocfiscale();
