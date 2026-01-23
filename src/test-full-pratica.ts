import axios from 'axios';

async function testFullPratica() {
  const apiUrl = 'https://catture.partnersolution.it';
  const username = 'enromacom';
  const password = '{q95j(t,v(N6';
  const agencyCode = '7206';
  
  const bookingId = '81893017';
  const confirmationCode = 'CIV-81893017';
  const customerName = { firstName: 'Test', lastName: 'No TipoDestinazione' };
  const amount = 180;

  try {
    console.log('=== Full Pratica - WITHOUT tipodestinazione ===\n');

    const params = new URLSearchParams();
    params.append('_username', username);
    params.append('_password', password);

    const loginResponse = await axios.post(`${apiUrl}/login_check`, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      }
    });

    const token = loginResponse.data.token;
    console.log('✅ Authenticated\n');

    const client = axios.create({
      baseURL: apiUrl,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/ld+json',
        'Accept': 'application/ld+json'
      }
    });

    const now = new Date().toISOString();

    // Account
    const accountResponse = await client.post('/accounts', {
      cognome: customerName.lastName,
      nome: customerName.firstName,
      flagpersonafisica: 1,
      codicefiscale: bookingId,
      codiceagenzia: agencyCode,
      stato: 'INS',
      tipocattura: 'PS',
      iscliente: 1,
      isfornitore: 0
    });
    console.log('✅ Account');

    // Pratica
    const praticaPayload = {
      codicecliente: bookingId,
      externalid: bookingId,
      cognomecliente: customerName.lastName,
      nomecliente: customerName.firstName,
      codiceagenzia: agencyCode,
      tipocattura: 'PS',
      datacreazione: now,
      datamodifica: now,
      stato: 'WP',
      descrizionepratica: 'Tour UE ed Extra UE',
      noteinterne: 'Seller: Civitatis'
    };
    const praticaResponse = await client.post('/prt_praticas', praticaPayload);
    const praticaIri = praticaResponse.data['@id'];
    console.log('✅ Pratica:', praticaIri);

    // Passeggero
    await client.post('/prt_praticapasseggeros', {
      pratica: praticaIri,
      cognomepax: customerName.lastName,
      nomepax: customerName.firstName,
      annullata: 0,
      iscontraente: 1
    });
    console.log('✅ Passeggero');

    // Servizio - NO tipodestinazione
    console.log('Adding Servizio WITHOUT tipodestinazione...');
    const servizioPayload = {
      pratica: praticaIri,
      externalid: bookingId,
      tiposervizio: 'VIS',
      tipovendita: 'ORG',
      regimevendita: '74T',
      codicefornitore: '2773',
      ragsocfornitore: 'EnRoma Tours',
      codicefilefornitore: bookingId,
      datacreazione: now,
      datainizioservizio: now,
      datafineservizio: now,
      duratant: 0,
      duratagg: 1,
      nrpaxadulti: 1,
      nrpaxchild: 0,
      nrpaxinfant: 0,
      descrizione: 'Tour UE ed Extra UE',
      // NO tipodestinazione
      annullata: 0,
      codiceagenzia: agencyCode,
      stato: 'INS'
    };
    const servizioResponse = await client.post('/prt_praticaservizios', servizioPayload);
    const servizioIri = servizioResponse.data['@id'];
    console.log('✅ Servizio');

    // Quota
    await client.post('/prt_praticaservizioquotas', {
      servizio: servizioIri,
      descrizionequota: 'Tour UE ed Extra UE',
      datavendita: now,
      codiceisovalutacosto: 'EUR',
      quantitacosto: 1,
      costovalutaprimaria: amount,
      quantitaricavo: 1,
      ricavovalutaprimaria: amount,
      codiceisovalutaricavo: 'EUR',
      commissioniattivevalutaprimaria: 0,
      commissionipassivevalutaprimaria: 0,
      progressivo: 1,
      annullata: 0,
      codiceagenzia: agencyCode,
      stato: 'INS'
    });
    console.log('✅ Quota');

    // Movimento
    await client.post('/mov_finanziarios', {
      externalid: bookingId,
      tipomovimento: 'I',
      codicefile: bookingId,
      codiceagenzia: agencyCode,
      tipocattura: 'PS',
      importo: amount,
      datacreazione: now,
      datamodifica: now,
      datamovimento: now,
      stato: 'INS',
      codcausale: 'PAGCC',
      descrizione: `Tour UE ed Extra UE - ${confirmationCode}`
    });
    console.log('✅ Movimento');

    // Update Pratica to INS
    await client.put(praticaIri, { ...praticaPayload, stato: 'INS' });
    console.log('✅ Pratica status: INS');

    console.log('\n=== SUCCESS: CIV-81893017 ===');

  } catch (error: any) {
    console.error('ERROR:', error.message);
    if (error.response?.data) {
      console.log('API Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testFullPratica();
