import { partnerSolutionService } from './services/partnerSolutionService';

async function checkInvoiceEndpoints() {
  partnerSolutionService.clearConfigCache();
  partnerSolutionService.invalidateToken();

  try {
    const client = await (partnerSolutionService as any).getClient();
    
    // Try to get API documentation/entrypoint
    console.log('Checking available API endpoints...\n');
    
    const response = await client.get('/');
    console.log('API Entrypoint:');
    console.log(JSON.stringify(response.data, null, 2));

  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

checkInvoiceEndpoints();
