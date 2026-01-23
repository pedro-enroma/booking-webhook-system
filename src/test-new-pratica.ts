import { partnerSolutionService } from './services/partnerSolutionService';

async function testNewPratica() {
  try {
    console.log('=== Creating New Pratica with Updated Service ===\n');

    const result = await partnerSolutionService.createBookingPratica({
      bookingId: '81893021',
      confirmationCode: 'CIV-81893021',
      customer: {
        firstName: 'Updated',
        lastName: 'Service Test',
      },
      amount: 250,
      sellerTitle: 'Civitatis',
    });

    console.log('\n=== RESULT ===');
    console.log('Pratica IRI:', result.praticaIri);
    console.log('Account IRI:', result.accountIri);
    console.log('Servizio IRI:', result.servizioIri);
    console.log('Quota IRI:', result.quotaIri);
    console.log('Movimento IRI:', result.movimentoIri);
    console.log('Commessa:', result.commessaCode);

  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

testNewPratica();
