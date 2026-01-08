import { partnerSolutionService } from './services/partnerSolutionService';

async function finalizePratica() {
  partnerSolutionService.clearConfigCache();
  partnerSolutionService.invalidateToken();

  const praticaIri = '/prt_praticas/b5d63306-dc2e-11f0-bca8-000d3a3c3748';

  console.log('Updating pratica status to INS...\n');

  try {
    const client = await (partnerSolutionService as any).getClient();
    
    // Get current pratica
    const pratica: any = await partnerSolutionService.getPratica(praticaIri);
    
    // Update to INS status
    await client.put(praticaIri, {
      codiceagenzia: pratica.codiceagenzia,
      tipocattura: pratica.tipocattura || 'API',
      stato: 'INS',  // Changed from WP to INS
      datacreazione: pratica.datacreazione,
      datamodifica: new Date().toISOString(),
      cognomecliente: pratica.cognomecliente,
      nomecliente: pratica.nomecliente,
      externalid: pratica.externalid,
      descrizionepratica: pratica.descrizionepratica,
    });

    console.log('✅ Pratica updated to INS status');
    console.log('Check Sferanet Importazione pratiche now');

  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

finalizePratica();
