import { partnerSolutionService } from './services/partnerSolutionService';

async function testClientSearch() {
  try {
    console.log('=== Testing Client Search via FacileWS3 ===\n');

    // Test 1: Search by CF
    console.log('1. Searching for client by CF (81893015)...');
    const client = await partnerSolutionService.findClientByCfOrPi({
      codiceFiscale: '81893015'
    });
    if (client) {
      console.log('   Found:', JSON.stringify(client, null, 2).substring(0, 500));
    } else {
      console.log('   Not found');
    }

    // Test 2: Search Anagrafica
    console.log('\n2. Searching Anagrafica (first 3 results)...');
    const anagrafica = await partnerSolutionService.searchAnagrafica();
    console.log('   Found ' + anagrafica.length + ' entries');
    anagrafica.slice(0, 3).forEach((a: any) => {
      const name = a.Cognome || a.RagioneSociale || 'N/A';
      console.log('   - ' + name + ' | CF: ' + a.CodiceFiscale);
    });

  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

testClientSearch();
