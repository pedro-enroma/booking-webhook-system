import { partnerSolutionService } from './services/partnerSolutionService';

async function testSdiInvoice() {
  partnerSolutionService.clearConfigCache();
  partnerSolutionService.invalidateToken();

  try {
    console.log('Testing SDI invoice creation with simple customer data...\n');

    const result = await partnerSolutionService.createSdiInvoice({
      customer: {
        firstName: 'Joan',
        lastName: 'Bonavila Giménez',
        email: 'civitatis@civitatis.com',
      },
      booking: {
        confirmationCode: 'TEST-SDI-001',
        totalAmount: 140,
        invoiceDate: new Date().toISOString().split('T')[0],
        description: 'Test SDI Invoice',
      },
      sendToSdi: false,  // Don't send to SDI, just create docfiscale
    });

    console.log('\n✅ SUCCESS!');
    console.log('Docfiscale:', result.docfiscale['@id']);
    console.log('Invoice Number:', result.docfiscale.numerodocfiscale);

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.response?.data) {
      console.log('\nAPI Response:');
      console.log(JSON.stringify(error.response.data, null, 2));
    }
  }
}

testSdiInvoice();
