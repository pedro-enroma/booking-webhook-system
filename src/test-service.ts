import { partnerSolutionService } from './services/partnerSolutionService';

async function testService() {
  try {
    console.log('=== Testing PartnerSolutionService ===\n');

    // Test 1: List Commesse
    console.log('1. Listing Commesse...');
    const commesse = await partnerSolutionService.listCommesse();
    console.log(`   Found ${commesse.length} commesse:`);
    commesse.forEach(c => console.log(`   - ${c.codice_commessa}: ${c.Titolo}`));

    // Test 2: Get monthly commessa code
    console.log('\n2. Getting monthly commessa code...');
    const code = partnerSolutionService.getMonthlyCommessaCode();
    console.log(`   Current month code: ${code}`);

    // Test 3: Create a test booking pratica
    console.log('\n3. Creating test booking pratica...');
    const result = await partnerSolutionService.createBookingPratica({
      bookingId: '81893020',
      confirmationCode: 'CIV-81893020',
      customer: {
        firstName: 'Service',
        lastName: 'Test',
      },
      amount: 200,
      sellerTitle: 'Civitatis',
    });

    console.log('\n=== SUCCESS ===');
    console.log('Pratica IRI:', result.praticaIri);
    console.log('Commessa:', result.commessaCode);

  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

testService();
