import { partnerSolutionService } from './services/partnerSolutionService';

async function checkPratica() {
  partnerSolutionService.clearConfigCache();
  partnerSolutionService.invalidateToken();

  const praticaIri = '/prt_praticas/b5d63306-dc2e-11f0-bca8-000d3a3c3748';

  console.log('Checking pratica:', praticaIri);

  try {
    const pratica = await partnerSolutionService.getPratica(praticaIri);
    console.log('\nPratica found:');
    console.log(JSON.stringify(pratica, null, 2));
  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

checkPratica();
