import { partnerSolutionService } from './services/partnerSolutionService';

async function comparePratiche() {
  partnerSolutionService.clearConfigCache();
  partnerSolutionService.invalidateToken();

  try {
    const client = await (partnerSolutionService as any).getClient();
    
    // Working pratica (ROSSI MARIO - showed 525€)
    console.log('=== WORKING PRATICA (ROSSI MARIO - 525€) ===');
    const working = await client.get('/prt_praticas/a491750b-dc0a-11f0-bca8-000d3a3c3748');
    console.log('Status:', working.data.stato);
    console.log('Servizi:', working.data.servizi);
    
    if (working.data.servizi?.[0]) {
      const servizio = await client.get(working.data.servizi[0]);
      console.log('\nServizio:');
      console.log('  tiposervizio:', servizio.data.tiposervizio);
      console.log('  regimevendita:', servizio.data.regimevendita);
      console.log('  quote:', servizio.data.quote);
      
      if (servizio.data.quote?.[0]) {
        const quota = await client.get(servizio.data.quote[0]);
        console.log('\nQuota:');
        console.log('  ricavovalutaprimaria:', quota.data.ricavovalutaprimaria);
        console.log('  costovalutaprimaria:', quota.data.costovalutaprimaria);
      }
    }

    // New pratica (not showing totals)
    console.log('\n\n=== NEW PRATICA (Demo User - 199€) ===');
    const newP = await client.get('/prt_praticas/b5d63306-dc2e-11f0-bca8-000d3a3c3748');
    console.log('Status:', newP.data.stato);
    console.log('Servizi:', newP.data.servizi);
    
    if (newP.data.servizi?.[0]) {
      const servizio = await client.get(newP.data.servizi[0]);
      console.log('\nServizio:');
      console.log('  tiposervizio:', servizio.data.tiposervizio);
      console.log('  regimevendita:', servizio.data.regimevendita);
      console.log('  quote:', servizio.data.quote);
      
      if (servizio.data.quote?.[0]) {
        const quota = await client.get(servizio.data.quote[0]);
        console.log('\nQuota:');
        console.log('  ricavovalutaprimaria:', quota.data.ricavovalutaprimaria);
        console.log('  costovalutaprimaria:', quota.data.costovalutaprimaria);
      }
    }

  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

comparePratiche();
