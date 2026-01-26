import { partnerSolutionService } from './services/partnerSolutionService';

async function testCompleteInvoicingFlow() {
  partnerSolutionService.clearConfigCache();
  partnerSolutionService.invalidateToken();

  const now = new Date().toISOString();
  const bookingId = 'BOOKING-' + Date.now();

  // Simulate a booking with multiple activities
  const booking = {
    id: bookingId,
    customer: {
      name: 'Mario',
      surname: 'Rossi',
      email: 'mario.rossi@example.com',
      phone: '+39 333 1234567',
      vatNumber: '12345678901',
      companyName: 'Rossi Travel SRL',
    },
    activities: [
      { id: 'ACT-001', description: 'Vatican Museums Tour', date: '2025-12-20', pax: 2, price: 129.00 },
      { id: 'ACT-002', description: 'Colosseum Underground', date: '2025-12-21', pax: 2, price: 94.50 },
      { id: 'ACT-003', description: 'Pompeii Day Trip', date: '2025-12-22', pax: 2, price: 160.00 },
    ],
    totalAmount: 767.00,
    isPaid: true,
  };

  console.log('='.repeat(60));
  console.log('COMPLETE INVOICING FLOW TEST');
  console.log('='.repeat(60));
  console.log('\nBooking:', bookingId);
  console.log('Customer:', booking.customer.companyName);
  console.log('Activities:', booking.activities.length);
  console.log('Total:', '€' + booking.totalAmount);
  console.log('\n');

  try {
    const client = await (partnerSolutionService as any).getClient();

    // ============================================================
    // STEP 1: Create PRATICA with SERVIZI, QUOTE, and PASSEGGERI
    // ============================================================
    console.log('STEP 1: Creating PRATICA (booking record for Sferanet)');
    console.log('-'.repeat(50));

    const pratica = await partnerSolutionService.createPratica({
      codiceagenzia: '7206',
      tipocattura: 'API',
      stato: 'INS',
      datacreazione: now,
      datamodifica: now,
      externalid: bookingId,
      cognomecliente: booking.customer.surname,
      nomecliente: booking.customer.name,
      emailcliente: booking.customer.email,
      telefonocliente: booking.customer.phone,
      descrizionepratica: `Pratica Mensile 2025-12 - ${booking.customer.companyName}`,
    });
    console.log('✅ Pratica created:', pratica['@id']);

    // Create servizi and quote for each activity
    for (const activity of booking.activities) {
      const servizio = await partnerSolutionService.createServizio({
        pratica: pratica['@id'],
        tiposervizio: 'PKQ',
        tipovendita: 'ORG',
        regimevendita: '74T',
        datainizioservizio: activity.date,
        datafineservizio: activity.date,
        datacreazione: now,
        nrpaxadulti: activity.pax,
        nrpaxchild: 0,
        nrpaxinfant: 0,
        codicefornitore: 'ENROMA',
        codicefilefornitore: 'ENROMA',
        ragsocfornitore: 'EnRoma Tours',
        tipodestinazione: 'CEENAZ',
        duratagg: 1,
        duratant: 0,
        annullata: 0,
        descrizione: `${activity.description} [${activity.id}]`,
      });

      await partnerSolutionService.createQuota({
        servizio: servizio['@id'],
        descrizionequota: activity.description,
        datavendita: now.split('T')[0],
        codiceisovalutacosto: 'eur',
        codiceisovalutaricavo: 'eur',
        quantitacosto: 1,
        quantitaricavo: activity.pax,
        costovalutaprimaria: 0,
        ricavovalutaprimaria: activity.price * activity.pax,
        progressivo: 1,
        annullata: 0,
        commissioniattivevalutaprimaria: 0,
        commissionipassivevalutaprimaria: 0,
      });

      console.log(`   ✅ Servizio + Quota: ${activity.description} (€${(activity.price * activity.pax).toFixed(2)})`);
    }

    // Create passeggero (main contact)
    await client.post('/prt_praticapasseggeros', {
      pratica: pratica['@id'],
      cognomepax: booking.customer.surname,
      nomepax: booking.customer.name,
      tipopax: 'ADT',
      sesso: 'M',
      iscontraente: 1,
      annullata: 0,
    });
    console.log(`   ✅ Passeggero: ${booking.customer.name} ${booking.customer.surname}`);

    // ============================================================
    // STEP 2: Create DOCFISCALE with DETTAGLI
    // ============================================================
    console.log('\n\nSTEP 2: Creating DOCFISCALE (invoice for accounting)');
    console.log('-'.repeat(50));

    const docfiscale = await client.post('/docfiscales', {
      codiceagenzia: '7206',
      stato: 'INS',
      tipooperazione: 'A',  // Active (outgoing invoice)
      tipodocumento: 'TD01',  // Fattura
      partitaiva: booking.customer.vatNumber,
      denominazione: booking.customer.companyName,
      numerodocfiscale: 'INV-' + Date.now(),
      datadocfiscale: now,
      oggetto: `Invoice for ${bookingId}`,
      causale: `Tour services - ${bookingId}`,
      importototaledocumento: booking.totalAmount,
    });
    console.log('✅ Docfiscale created:', docfiscale.data['@id']);
    console.log('   Invoice Number:', docfiscale.data.numerodocfiscale);

    // Create dettaglio for each activity
    for (let i = 0; i < booking.activities.length; i++) {
      const activity = booking.activities[i];
      const lineTotal = activity.price * activity.pax;

      await client.post('/docfiscaledettaglios', {
        docfiscale: docfiscale.data['@id'],
        annullata: 0,
        issoggettoritenuta: 0,
        numerolinea: i + 1,
        descrizione: `${activity.description} [${activity.id}] - ${activity.pax} pax`,
        quantita: activity.pax,
        prezzounitario: activity.price.toFixed(2),
        aliquotaiva: 22,
      });

      console.log(`   ✅ Dettaglio ${i + 1}: ${activity.description} (€${lineTotal.toFixed(2)})`);
    }

    // ============================================================
    // STEP 3: Create MOV_FINANZIARIO (payment record)
    // ============================================================
    console.log('\n\nSTEP 3: Creating MOV_FINANZIARIO (payment record)');
    console.log('-'.repeat(50));

    const movFinanziario = await client.post('/mov_finanziarios', {
      codiceagenzia: '7206',
      stato: 'INS',
      tipocattura: 'API',
      tipomovimento: 'I',  // Incasso (payment received)
      externalid: bookingId,
      importo: booking.totalAmount,
      datacreazione: now,
      datamodifica: now,
      datamovimento: now,
      codcausale: 'INCAS',
      descrizione: `Payment for ${bookingId} - ${booking.customer.companyName}`,
      codiceesito: booking.isPaid ? 'OK' : 'richiesto',
      esitoincasso: booking.isPaid ? 'Pagamento completato' : 'In attesa di pagamento',
    });
    console.log('✅ MovFinanziario created:', movFinanziario.data['@id']);
    console.log('   Payment Status:', movFinanziario.data.codiceesito);
    console.log('   Amount:', '€' + movFinanziario.data.importo);

    // ============================================================
    // SUMMARY
    // ============================================================
    console.log('\n\n' + '='.repeat(60));
    console.log('SUCCESS! COMPLETE INVOICING FLOW CREATED');
    console.log('='.repeat(60));
    console.log('\n📋 PRATICA (Sferanet Import)');
    console.log('   ID:', pratica['@id']);
    console.log('   External ID:', bookingId);
    console.log('   Servizi:', booking.activities.length);
    console.log('   → Check: Sferanet > Importazione Pratiche');

    console.log('\n📄 DOCFISCALE (Invoice)');
    console.log('   ID:', docfiscale.data['@id']);
    console.log('   Number:', docfiscale.data.numerodocfiscale);
    console.log('   Customer:', docfiscale.data.denominazione);
    console.log('   VAT:', docfiscale.data.partitaiva);
    console.log('   Total:', '€' + docfiscale.data.importototaledocumento);
    console.log('   Dettagli:', booking.activities.length);

    console.log('\n💰 MOV_FINANZIARIO (Payment)');
    console.log('   ID:', movFinanziario.data['@id']);
    console.log('   Status:', movFinanziario.data.codiceesito);
    console.log('   Amount:', '€' + movFinanziario.data.importo);

    console.log('\n🔗 All linked by External ID:', bookingId);

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.response?.data) {
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testCompleteInvoicingFlow();
