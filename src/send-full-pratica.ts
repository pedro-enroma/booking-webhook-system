import { partnerSolutionService } from './services/partnerSolutionService';

async function sendFullPratica() {
  partnerSolutionService.clearConfigCache();
  partnerSolutionService.invalidateToken();

  const now = new Date().toISOString();
  const testId = Date.now();

  console.log('Creating full pratica with multiple servizi and passeggeri...\n');

  try {
    const client = await (partnerSolutionService as any).getClient();

    // 1. Create pratica
    console.log('1. Creating pratica...');
    const pratica = await partnerSolutionService.createPratica({
      codiceagenzia: 'demo2',
      tipocattura: 'API',
      stato: 'INS',
      datacreazione: now,
      datamodifica: now,
      cognomecliente: 'Martinez',
      nomecliente: 'Pedro',
      descrizionepratica: 'Pratica Mensile 2025-12 - Full Test',
      externalid: 'FULL-TEST-' + testId,
    });
    console.log('   ✅ Pratica:', pratica['@id']);

    // 2. Create multiple servizi with quote
    const servizi = [
      { desc: 'Vatican Museums Tour', amount: 258.00, pax: 2 },
      { desc: 'Colosseum Tour', amount: 189.00, pax: 2 },
      { desc: 'Pompeii Day Trip', amount: 320.00, pax: 2 },
    ];

    console.log('\n2. Creating servizi and quote...');
    for (const s of servizi) {
      const servizio = await partnerSolutionService.createServizio({
        pratica: pratica['@id'],
        tiposervizio: 'VIS',
        tipovendita: 'ORG',
        regimevendita: '74T',
        datainizioservizio: '2025-12-20',
        datafineservizio: '2025-12-20',
        datacreazione: now,
        nrpaxadulti: s.pax,
        nrpaxchild: 0,
        nrpaxinfant: 0,
        codicefornitore: 'ENROMA',
        codicefilefornitore: 'ENROMA',
        ragsocfornitore: 'EnRoma Tours',
        tipodestinazione: 'CEENAZ',
        duratagg: 1,
        duratant: 0,
        annullata: 0,
        descrizione: s.desc,
      });
      console.log('   ✅ Servizio:', s.desc);

      const quota = await partnerSolutionService.createQuota({
        servizio: servizio['@id'],
        descrizionequota: s.desc,
        datavendita: '2025-12-18',
        codiceisovalutacosto: 'eur',
        codiceisovalutaricavo: 'eur',
        quantitacosto: 1,
        quantitaricavo: 1,
        costovalutaprimaria: 0,
        ricavovalutaprimaria: s.amount,
        progressivo: 1,
        annullata: 0,
        commissioniattivevalutaprimaria: 0,
        commissionipassivevalutaprimaria: 0,
      });
      console.log('      Quota: €' + s.amount);
    }

    // 3. Create multiple passeggeri
    const passeggeri = [
      { cognome: 'Martinez', nome: 'Pedro', tipo: 'ADT', sesso: 'M', contraente: 1 },
      { cognome: 'Martinez', nome: 'Maria', tipo: 'ADT', sesso: 'F', contraente: 0 },
      { cognome: 'Martinez', nome: 'Lucas', tipo: 'CHD', sesso: 'M', contraente: 0 },
    ];

    console.log('\n3. Creating passeggeri...');
    for (const p of passeggeri) {
      await client.post('/prt_praticapasseggeros', {
        pratica: pratica['@id'],
        cognomepax: p.cognome,
        nomepax: p.nome,
        tipopax: p.tipo,
        sesso: p.sesso,
        iscontraente: p.contraente,
        annullata: 0,
      });
      console.log('   ✅ Passeggero:', p.nome, p.cognome, '(' + p.tipo + ')');
    }

    const totalAmount = servizi.reduce((sum, s) => sum + s.amount, 0);

    console.log('\n' + '='.repeat(50));
    console.log('SUCCESS!');
    console.log('='.repeat(50));
    console.log('Pratica:', pratica['@id']);
    console.log('Description: Pratica Mensile 2025-12 - Full Test');
    console.log('Servizi: 3');
    console.log('Passeggeri: 3 (2 adults, 1 child)');
    console.log('Total Amount: €' + totalAmount.toFixed(2));
    console.log('\nCheck Sferanet Importazione pratiche');

  } catch (error: any) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

sendFullPratica();
