import { partnerSolutionService } from './services/partnerSolutionService';

async function testSendToSDI() {
  partnerSolutionService.clearConfigCache();
  partnerSolutionService.invalidateToken();

  try {
    const client = await (partnerSolutionService as any).getClient();

    // First, check if there are existing docfiscalexmls to understand the structure
    console.log('Checking existing docfiscalexmls...\n');

    const existingXmls = await client.get('/docfiscalexmls', {
      params: { itemsPerPage: 3 }
    });

    const xmlItems = existingXmls.data['hydra:member'] || [];
    console.log('Total docfiscalexmls:', existingXmls.data['hydra:totalItems']);

    if (xmlItems.length > 0) {
      console.log('\nExample docfiscalexml:');
      console.log(JSON.stringify(xmlItems[0], null, 2));
    }

    // Get the docfiscale we just created
    console.log('\n\nFetching recently created docfiscales...\n');

    const docfiscales = await client.get('/docfiscales', {
      params: {
        itemsPerPage: 3,
      }
    });

    const docItems = docfiscales.data['hydra:member'] || [];
    console.log('Total docfiscales:', docfiscales.data['hydra:totalItems']);
    console.log('\nRecent docfiscales:');

    for (const doc of docItems) {
      console.log(`  - ${doc.numerodocfiscale} | ${doc.denominazione} | €${doc.importototaledocumento} | stato: ${doc.stato}`);
    }

    if (docItems.length > 0) {
      const latestDoc = docItems[0];
      console.log('\n\nLatest docfiscale details:');
      console.log(JSON.stringify(latestDoc, null, 2));

      // Try to create a docfiscalexml to send to SDI
      console.log('\n\n' + '='.repeat(50));
      console.log('Trying to create docfiscalexml for SDI submission...');
      console.log('='.repeat(50));

      const xmlData = {
        codiceagenzia: 'demo2',
        stato: 'INS',
        docfiscaleid: latestDoc.id,
        tipomovimento: 'E',  // E = Emissione (Emission)
        formatotrasmissione: 'FPA12',  // FPA12 = FatturaPA format for PA
        codicedestinatario: '0000000',  // Default code for private citizens
      };

      console.log('\nXML data:', JSON.stringify(xmlData, null, 2));

      try {
        const xmlResponse = await client.post('/docfiscalexmls', xmlData);
        console.log('\n✅ Docfiscalexml created!');
        console.log('Response:', JSON.stringify(xmlResponse.data, null, 2));
      } catch (xmlError: any) {
        console.log('\n❌ Error creating docfiscalexml:', xmlError.message);
        if (xmlError.response?.data) {
          console.log('Response:', JSON.stringify(xmlError.response.data, null, 2));
        }
        if (xmlError.response?.status) {
          console.log('Status:', xmlError.response.status);
        }
      }
    }

  } catch (error: any) {
    console.error('Error:', error.message);
    if (error.response?.data) {
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testSendToSDI();
