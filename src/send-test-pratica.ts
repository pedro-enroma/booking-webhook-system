import { partnerSolutionService } from './services/partnerSolutionService';

async function sendTestPratica() {
  partnerSolutionService.clearConfigCache();
  partnerSolutionService.invalidateToken();

  const yearMonth = '2025-12';
  const now = new Date().toISOString();
  const testCode = 'TEST-' + Date.now();

  console.log('Sending test pratica to Partner Solution...\n');

  try {
    // Create pratica with 2025-12 in description
    const pratica = await partnerSolutionService.createPratica({
      codiceagenzia: 'demo2',
      tipocattura: 'API',
      stato: 'WP',
      datacreazione: now,
      datamodifica: now,
      cognomecliente: 'Demo',
      nomecliente: 'User',
      descrizionepratica: 'Pratica Mensile 2025-12',
      externalid: 'MONTHLY-' + yearMonth + '-TEST',
    });

    console.log('✅ Pratica created:', pratica['@id']);

    // Create servizio
    const servizio = await partnerSolutionService.createServizio({
      pratica: pratica['@id'],
      tiposervizio: 'PKQ',
      tipovendita: 'ORG',
      regimevendita: '74T',
      datainizioservizio: '2025-12-18',
      datafineservizio: '2025-12-18',
      datacreazione: now,
      nrpaxadulti: 2,
      nrpaxchild: 0,
      nrpaxinfant: 0,
      codicefornitore: 'ENROMA',
      codicefilefornitore: 'ENROMA',
      ragsocfornitore: 'EnRoma Tours',
      tipodestinazione: 'CEENAZ',
      duratagg: 1,
      duratant: 0,
      annullata: 0,
      descrizione: 'Vatican Museums Tour - ' + testCode,
    });

    console.log('✅ Servizio created:', servizio['@id']);

    // Create quota
    const quota = await partnerSolutionService.createQuota({
      servizio: servizio['@id'],
      descrizionequota: testCode + ' - Vatican Tour',
      datavendita: '2025-12-18',
      codiceisovalutacosto: 'eur',
      codiceisovalutaricavo: 'eur',
      quantitacosto: 1,
      quantitaricavo: 1,
      costovalutaprimaria: 0,
      ricavovalutaprimaria: 199.00,
      progressivo: 1,
      annullata: 0,
      commissioniattivevalutaprimaria: 0,
      commissionipassivevalutaprimaria: 0,
    });

    console.log('✅ Quota created:', quota['@id']);

    console.log('\n' + '='.repeat(50));
    console.log('SUCCESS! Check Sferanet Importazione pratiche');
    console.log('='.repeat(50));
    console.log('Pratica:', pratica['@id']);
    console.log('Description: Pratica Mensile 2025-12');
    console.log('Amount: EUR 199.00');

  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

sendTestPratica();
