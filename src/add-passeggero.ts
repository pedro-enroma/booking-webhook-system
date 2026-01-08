import { partnerSolutionService } from './services/partnerSolutionService';

async function addPasseggero() {
  partnerSolutionService.clearConfigCache();
  partnerSolutionService.invalidateToken();

  const praticaIri = '/prt_praticas/b5d63306-dc2e-11f0-bca8-000d3a3c3748';

  try {
    const client = await (partnerSolutionService as any).getClient();
    
    console.log('Creating passeggero...\n');
    
    const response = await client.post('/prt_praticapasseggeros', {
      pratica: praticaIri,
      cognomepax: 'Demo',
      nomepax: 'User',
      tipopax: 'ADT',
      sesso: 'M',
      iscontraente: 1,  // Main contractor
      annullata: 0,     // Not cancelled
    });

    console.log('✅ Passeggero created:', response.data['@id']);
    console.log('Check Sferanet Passeggeri tab now');

  } catch (error: any) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

addPasseggero();
