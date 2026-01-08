import { partnerSolutionService } from './services/partnerSolutionService';

async function checkServizio() {
  partnerSolutionService.clearConfigCache();
  partnerSolutionService.invalidateToken();

  const praticaIri = '/prt_praticas/b5d63306-dc2e-11f0-bca8-000d3a3c3748';
  const servizioIri = '/prt_praticaservizios/b5e0a9b7-dc2e-11f0-bca8-000d3a3c3748';

  try {
    const client = await (partnerSolutionService as any).getClient();
    
    // Get pratica with servizi
    console.log('=== PRATICA ===');
    const pratica = await client.get(praticaIri);
    console.log('Servizi linked:', pratica.data.servizi);
    console.log('Passeggeri:', pratica.data.passeggeri);
    
    // Get servizio details
    console.log('\n=== SERVIZIO ===');
    const servizio = await client.get(servizioIri);
    console.log(JSON.stringify(servizio.data, null, 2));

    // Get quota
    console.log('\n=== QUOTA ===');
    const quotaIri = '/prt_praticaservizioquotas/b5ebfb3f-dc2e-11f0-bca8-000d3a3c3748';
    const quota = await client.get(quotaIri);
    console.log(JSON.stringify(quota.data, null, 2));

  } catch (error: any) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

checkServizio();
