import axios from 'axios';

async function testPraticaFlow() {
  const apiUrl = 'https://catture.partnersolution.it';
  const username = 'enromacom';
  const password = '{q95j(t,v(N6';
  const agencyCode = '7206'; // Production agency code

  const bookingId = '81893012'; // Numeric only, no prefix (max 13 chars)
  const bookingIdPadded = bookingId.padStart(9, '0'); // Padded to 9 chars per spec
  const confirmationCode = 'CIV-81893012'; // Full code for descriptions
  const customerName = { firstName: 'Maria Jose', lastName: 'Domingo Garcia' };
  const sellerTitle = 'Civitatis'; // Seller for tracking
  const amount = 118; // Real amount from booking
  const commessaCode = '2026-01'; // January 2026 - Commessa created in UI
  const commessaUUID = 'B53D23E5-3DB1-4CC2-8659-EFAED539336D'; // UUID from FacileWS3

  try {
    console.log('=== Testing Pratica Flow - PRODUCTION ===\n');
    console.log(`Booking: ${confirmationCode}`);
    console.log(`Customer: ${customerName.firstName} ${customerName.lastName}`);
    console.log(`Amount: €${amount}`);
    console.log(`Agency: ${agencyCode}`);
    console.log(`Commessa: ${commessaCode}\n`);

    // Authenticate
    console.log('Authenticating...');
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

    // Step 1: Always create new Account (per spec - always create, don't search)
    console.log('Step 1: Creating new account...');
    const accountPayload = {
      cognome: customerName.lastName,
      nome: customerName.firstName,
      flagpersonafisica: 1,
      codicefiscale: bookingIdPadded, // Must be 9 chars, left-padded with 0
      codiceagenzia: agencyCode,
      stato: 'INS',
      tipocattura: 'PS',
      iscliente: 1,
      isfornitore: 0
    };

    const accountResponse = await client.post('/accounts', accountPayload);
    const accountIri = accountResponse.data['@id'];
    console.log('  ✅ Account created:', accountIri);

    // Step 2: Create Pratica (status WP)
    console.log('\nStep 2: Creating Pratica...');
    const praticaPayload = {
      codicecliente: bookingIdPadded,  // Must be 9 chars, left-padded with 0
      externalid: bookingIdPadded,     // Must be 9 chars, left-padded with 0
      cognomecliente: customerName.lastName,
      nomecliente: customerName.firstName,
      codiceagenzia: agencyCode,
      tipocattura: 'PS',
      datacreazione: now,
      datamodifica: now,
      stato: 'WP',
      descrizionepratica: 'Tour UE ed Extra UE',
      noteinterne: `Seller: ${sellerTitle}`,
      delivering: `commessa:${commessaUUID}` // Must be UUID, not code
    };

    const praticaResponse = await client.post('/prt_praticas', praticaPayload);
    const praticaIri = praticaResponse.data['@id'];
    console.log('  ✅ Pratica created:', praticaIri);

    // Step 3: Add Passeggero
    console.log('\nStep 3: Adding Passeggero...');
    const passeggeroPayload = {
      pratica: praticaIri,
      cognomepax: customerName.lastName,
      nomepax: customerName.firstName,
      annullata: 0,
      iscontraente: 1
    };

    const passeggeroResponse = await client.post('/prt_praticapasseggeros', passeggeroPayload);
    console.log('  ✅ Passeggero added:', passeggeroResponse.data['@id']);

    // Step 4: Add Servizio
    console.log('\nStep 4: Adding Servizio...');
    const servizioPayload = {
      pratica: praticaIri,
      externalid: bookingIdPadded,          // Must be 9 chars, left-padded with 0
      tiposervizio: 'PKQ',                  // Always PKQ per spec
      tipovendita: 'ORG',
      regimevendita: '74T',
      codicefornitore: 'IT09802381005',     // Supplier VAT per spec
      ragsocfornitore: 'EnRoma Tours',
      codicefilefornitore: bookingIdPadded, // Must be 9 chars, left-padded with 0
      datacreazione: now,
      datainizioservizio: now.split('T')[0],
      datafineservizio: now.split('T')[0],
      duratant: 0,
      duratagg: 1,
      nrpaxadulti: 1,                       // Total participants
      nrpaxchild: 0,                        // Always 0 per spec
      nrpaxinfant: 0,                       // Always 0 per spec
      descrizione: 'Tour UE ed Extra UE',
      tipodestinazione: 'CEENAZ',
      annullata: 0,
      codiceagenzia: agencyCode,
      stato: 'INS'
    };

    const servizioResponse = await client.post('/prt_praticaservizios', servizioPayload);
    const servizioIri = servizioResponse.data['@id'];
    console.log('  ✅ Servizio added:', servizioIri);

    // Step 5: Add Quota
    console.log('\nStep 5: Adding Quota...');
    const quotaPayload = {
      servizio: servizioIri,
      descrizionequota: 'Tour UE ed Extra UE',
      datavendita: now,
      codiceisovalutacosto: 'EUR',
      quantitacosto: 1,
      costovalutaprimaria: amount, // Same as customer price
      quantitaricavo: 1,
      ricavovalutaprimaria: amount, // Customer price
      codiceisovalutaricavo: 'EUR',
      commissioniattivevalutaprimaria: 0,
      commissionipassivevalutaprimaria: 0,
      progressivo: 1,
      annullata: 0,
      codiceagenzia: agencyCode,
      stato: 'INS'
    };

    const quotaResponse = await client.post('/prt_praticaservizioquotas', quotaPayload);
    console.log('  ✅ Quota added:', quotaResponse.data['@id']);

    // Step 6: Add Movimento Finanziario
    console.log('\nStep 6: Adding Movimento Finanziario...');
    const movimentoPayload = {
      externalid: bookingIdPadded,   // Must be 9 chars, left-padded with 0
      tipomovimento: 'I',
      codicefile: bookingIdPadded,   // Must be 9 chars, left-padded with 0
      codiceagenzia: agencyCode,
      tipocattura: 'PS',
      importo: amount,
      datacreazione: now,
      datamodifica: now,
      datamovimento: now,
      stato: 'INS',
      codcausale: 'PAGBOK',          // PAGBOK per spec
      descrizione: `Tour UE ed Extra UE - ${confirmationCode}`
    };

    const movimentoResponse = await client.post('/mov_finanziarios', movimentoPayload);
    console.log('  ✅ Movimento added:', movimentoResponse.data['@id']);

    // Step 7: Update Pratica to INS
    console.log('\nStep 7: Updating Pratica status to INS...');
    await client.put(praticaIri, {
      ...praticaPayload,
      stato: 'INS'
    });
    console.log('  ✅ Pratica status updated to INS');

    console.log('\n========================================');
    console.log('=== SUCCESS - PRODUCTION DATA CREATED ===');
    console.log('========================================');
    console.log('Pratica IRI:', praticaIri);
    console.log('Booking:', confirmationCode);
    console.log('Customer:', `${customerName.firstName} ${customerName.lastName}`);
    console.log('Amount: €', amount);
    console.log('Commessa:', commessaCode);
    console.log('Agency:', agencyCode);

  } catch (error: any) {
    console.error('\n=== ERROR ===');
    console.error('Message:', error.message);
    if (error.response?.data) {
      console.log('API Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testPraticaFlow();
