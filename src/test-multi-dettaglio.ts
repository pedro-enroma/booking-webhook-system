import { partnerSolutionService } from './services/partnerSolutionService';

async function testMultiDettaglio() {
  partnerSolutionService.clearConfigCache();
  partnerSolutionService.invalidateToken();

  try {
    const client = await (partnerSolutionService as any).getClient();

    const now = new Date().toISOString();
    const testId = Date.now();

    console.log('Creating docfiscale with multiple dettaglio (one per activity_booking)...\n');

    // Create the invoice header
    const docfiscale = await client.post('/docfiscales', {
      codiceagenzia: 'demo2',
      stato: 'INS',
      tipooperazione: 'A',
      tipodocumento: 'TD01',
      partitaiva: '12345678901',
      denominazione: 'Customer SRL',
      numerodocfiscale: 'MULTI-' + testId,
      datadocfiscale: now,
      oggetto: 'Monthly Invoice December 2025',
      causale: 'Tour services - December 2025',
      importototaledocumento: 767.00,  // Sum of all line items
    });

    console.log('✅ Docfiscale created:', docfiscale.data['@id']);
    const docfiscaleIri = docfiscale.data['@id'];

    // Simulate multiple activity bookings
    const activityBookings = [
      { id: 'ACT-001', description: 'Vatican Museums Tour - 2 Adults', qty: 2, price: 129.00 },
      { id: 'ACT-002', description: 'Colosseum Tour - 2 Adults', qty: 2, price: 94.50 },
      { id: 'ACT-003', description: 'Pompeii Day Trip - 2 Adults', qty: 2, price: 160.00 },
    ];

    console.log('\nCreating dettaglio for each activity_booking...\n');

    for (let i = 0; i < activityBookings.length; i++) {
      const booking = activityBookings[i];

      const dettaglio = await client.post('/docfiscaledettaglios', {
        docfiscale: docfiscaleIri,
        annullata: 0,
        issoggettoritenuta: 0,
        numerolinea: i + 1,
        descrizione: `${booking.description} [Booking: ${booking.id}]`,
        quantita: booking.qty,
        prezzounitario: booking.price.toFixed(2),
        aliquotaiva: 22,
      });

      console.log(`  ✅ Line ${i + 1}: ${booking.description}`);
      console.log(`     Qty: ${booking.qty} x €${booking.price} = €${(booking.qty * booking.price).toFixed(2)}`);
      console.log(`     Dettaglio ID: ${dettaglio.data['@id']}`);
    }

    // Fetch the complete docfiscale to see all dettagli
    console.log('\n\nFetching complete docfiscale with all dettagli...\n');

    const completeDoc = await client.get(docfiscaleIri);
    console.log('Docfiscale:', completeDoc.data.numerodocfiscale);
    console.log('Customer:', completeDoc.data.denominazione);
    console.log('VAT:', completeDoc.data.partitaiva);
    console.log('Total:', '€' + completeDoc.data.importototaledocumento);
    console.log('Dettagli count:', completeDoc.data.dettagli?.length || 0);
    console.log('Dettagli IRIs:', completeDoc.data.dettagli);

    // Check dettaglio schema for customer fields
    console.log('\n\n' + '='.repeat(50));
    console.log('CHECKING DETTAGLIO SCHEMA FOR CUSTOMER FIELDS');
    console.log('='.repeat(50));

    const docs = await client.get('/docs', { headers: { 'Accept': 'application/json' } });
    const dettaglioSchema = docs.data.definitions?.Docfiscaledettaglio;

    if (dettaglioSchema) {
      console.log('\nDocfiscaledettaglio properties:');
      const props = Object.keys(dettaglioSchema.properties || {});
      for (const prop of props) {
        const def = dettaglioSchema.properties[prop];
        console.log(`  - ${prop}: ${def.type || 'object'}${def.description ? ' // ' + def.description.substring(0, 50) : ''}`);
      }

      // Check if there are any customer-related fields
      const customerFields = props.filter(p =>
        p.toLowerCase().includes('cliente') ||
        p.toLowerCase().includes('customer') ||
        p.toLowerCase().includes('partitaiva') ||
        p.toLowerCase().includes('denominazione')
      );

      console.log('\nCustomer-related fields in dettaglio:', customerFields.length > 0 ? customerFields : 'NONE');
    }

    console.log('\n\n' + '='.repeat(50));
    console.log('ANSWER TO YOUR QUESTIONS');
    console.log('='.repeat(50));
    console.log('\n1. Can we create a dettaglio for every activity_booking_id?');
    console.log('   ✅ YES - We just created 3 dettagli (line items) for one docfiscale.');
    console.log('   Each activity_booking becomes a separate line item.\n');

    console.log('2. Can we add a customer to a docfiscaledettaglio?');
    console.log('   ❌ NO - Customer info (partitaiva, denominazione) is at the');
    console.log('   docfiscale (header) level, not the dettaglio (line item) level.');
    console.log('   This is standard for invoices - one customer per invoice.');

  } catch (error: any) {
    console.error('Error:', error.message);
    if (error.response?.data) {
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testMultiDettaglio();
