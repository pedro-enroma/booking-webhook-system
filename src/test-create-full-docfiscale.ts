import { partnerSolutionService } from './services/partnerSolutionService';

async function testCreateFullDocfiscale() {
  partnerSolutionService.clearConfigCache();
  partnerSolutionService.invalidateToken();

  try {
    const client = await (partnerSolutionService as any).getClient();

    const now = new Date().toISOString();
    const testId = Date.now();

    console.log('Creating a full docfiscale with all required fields...\n');

    // Create the invoice header
    const docfiscaleData = {
      codiceagenzia: 'demo2',
      stato: 'INS',  // INS = Inserted/Final
      tipooperazione: 'A',  // A = Active (outgoing invoice)
      tipodocumento: 'TD01',  // TD01 = Fattura (Invoice)

      // Customer data
      partitaiva: '12345678901',  // Customer VAT number
      denominazione: 'Test Customer SRL',  // Customer company name

      // Invoice metadata
      numerodocfiscale: 'TEST-' + testId,  // Invoice number
      datadocfiscale: now,  // Invoice date
      oggetto: 'Test Invoice via API',  // Subject
      causale: 'Vatican Museums Tour - Booking #12345',  // Description

      // Amounts
      importototaledocumento: 258.00,
      arrotondamento: 0,
    };

    console.log('Docfiscale data:', JSON.stringify(docfiscaleData, null, 2));
    console.log('\nSending POST to /docfiscales...');

    const response = await client.post('/docfiscales', docfiscaleData);

    console.log('\n✅ Docfiscale created!');
    console.log('Response:', JSON.stringify(response.data, null, 2));

    const docfiscaleIri = response.data['@id'];

    // Now create a line item (dettaglio)
    console.log('\n\nCreating line item (dettaglio)...');

    const dettaglioData = {
      docfiscale: docfiscaleIri,
      annullata: 0,
      issoggettoritenuta: 0,
      numerolinea: 1,
      descrizione: 'Vatican Museums Tour - 2 Adults',
      quantita: 2,
      prezzounitario: '129.00',
      aliquotaiva: 22,  // 22% VAT
    };

    console.log('Dettaglio data:', JSON.stringify(dettaglioData, null, 2));

    const dettaglioResponse = await client.post('/docfiscaledettaglios', dettaglioData);

    console.log('\n✅ Dettaglio created!');
    console.log('Response:', JSON.stringify(dettaglioResponse.data, null, 2));

    console.log('\n' + '='.repeat(50));
    console.log('SUCCESS - Invoice created via API!');
    console.log('='.repeat(50));
    console.log('Docfiscale:', docfiscaleIri);
    console.log('Invoice Number:', docfiscaleData.numerodocfiscale);
    console.log('Total:', '€' + docfiscaleData.importototaledocumento);

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.response?.data) {
      console.log('\nAPI Response:');
      console.log(JSON.stringify(error.response.data, null, 2));
    }
    if (error.response?.status) {
      console.log('Status:', error.response.status);
    }
  }
}

testCreateFullDocfiscale();
