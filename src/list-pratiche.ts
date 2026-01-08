import { partnerSolutionService } from './services/partnerSolutionService';

async function listPratiche() {
  partnerSolutionService.clearConfigCache();
  partnerSolutionService.invalidateToken();

  console.log('Listing all pratiche from API...\n');

  try {
    const client = await (partnerSolutionService as any).getClient();
    
    // Get pratiche for demo2 agency
    const response = await client.get('/prt_praticas', {
      params: {
        codiceagenzia: 'demo2',
        'order[datacreazione]': 'desc',
        itemsPerPage: 10
      }
    });

    const pratiche = response.data['hydra:member'] || [];
    
    console.log(`Found ${pratiche.length} pratiche:\n`);
    
    for (const p of pratiche) {
      console.log('---');
      console.log('ID:', p['@id']);
      console.log('External ID:', p.externalid);
      console.log('Description:', p.descrizionepratica);
      console.log('Customer:', p.nomecliente, p.cognomecliente);
      console.log('Status:', p.stato);
      console.log('Elaborata:', p.elaborata);
      console.log('Created:', p.datacreazione);
      console.log('Servizi:', p.servizi?.length || 0);
    }

  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

listPratiche();
