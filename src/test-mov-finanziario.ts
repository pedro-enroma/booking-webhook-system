import { partnerSolutionService } from './services/partnerSolutionService';

async function testMovFinanziario() {
  partnerSolutionService.clearConfigCache();
  partnerSolutionService.invalidateToken();

  try {
    const client = await (partnerSolutionService as any).getClient();

    const now = new Date().toISOString();
    const testId = 'PAYMENT-' + Date.now();

    console.log('Creating a mov_finanziario (payment record)...\n');

    const movData = {
      codiceagenzia: 'demo2',
      stato: 'INS',
      tipocattura: 'API',
      tipomovimento: 'I',  // I = Incasso (collection/payment received)
      externalid: testId,
      importo: 258.00,
      datacreazione: now,
      datamodifica: now,
      datamovimento: now,
      codcausale: 'INCAS',  // Incasso
      descrizione: 'Payment for Booking #12345 - Vatican Museums Tour',
      codiceesito: 'OK',  // Payment successful
      esitoincasso: 'Pagamento ricevuto',
    };

    console.log('MovFinanziario data:');
    console.log(JSON.stringify(movData, null, 2));

    const response = await client.post('/mov_finanziarios', movData);

    console.log('\n✅ MovFinanziario created!');
    console.log('Response:', JSON.stringify(response.data, null, 2));

    // Now check if we can link it to a pratica
    console.log('\n\n' + '='.repeat(50));
    console.log('CHECKING IF MOV_FINANZIARIO CAN LINK TO PRATICA');
    console.log('='.repeat(50));

    // The externalid field could be used to reference a pratica's externalid
    // Let's check if there's a praticaid field we missed

    const movFields = Object.keys(response.data).filter(k => !k.startsWith('@'));
    console.log('\nMovFinanziario fields returned:');
    for (const f of movFields.sort()) {
      console.log(`  - ${f}: ${response.data[f]}`);
    }

    const praticaRelatedFields = movFields.filter(f =>
      f.toLowerCase().includes('pratica') ||
      f.toLowerCase().includes('servizio') ||
      f.toLowerCase().includes('booking')
    );

    console.log('\nPratica-related fields:', praticaRelatedFields.length > 0 ? praticaRelatedFields : 'NONE (use externalid to reference)');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.response?.data) {
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testMovFinanziario();
