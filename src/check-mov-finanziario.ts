import { partnerSolutionService } from './services/partnerSolutionService';

async function checkMovFinanziario() {
  partnerSolutionService.clearConfigCache();
  partnerSolutionService.invalidateToken();

  try {
    const client = await (partnerSolutionService as any).getClient();

    console.log('Fetching MovFinanziario schema...\n');

    const docs = await client.get('/docs', { headers: { 'Accept': 'application/json' } });

    // Check MovFinanziario schema
    console.log('='.repeat(60));
    console.log('MOV_FINANZIARIO SCHEMA (Financial Movements/Payments)');
    console.log('='.repeat(60));

    const movSchema = docs.data.definitions?.MovFinanziario;
    if (movSchema?.properties) {
      const props = Object.keys(movSchema.properties).sort();
      console.log('\nAll MovFinanziario fields:');
      for (const prop of props) {
        const def = movSchema.properties[prop];
        const desc = def.description ? ` // ${def.description.substring(0, 60)}` : '';
        console.log(`  - ${prop}: ${def.type || 'ref'}${desc}`);
      }

      console.log('\nRequired fields:', movSchema.required || 'none');
    }

    // Try to fetch existing mov_finanziarios
    console.log('\n\n' + '='.repeat(60));
    console.log('EXISTING MOV_FINANZIARIOS');
    console.log('='.repeat(60));

    try {
      const movs = await client.get('/mov_finanziarios', {
        params: { itemsPerPage: 3 }
      });

      const items = movs.data['hydra:member'] || [];
      console.log('\nTotal mov_finanziarios:', movs.data['hydra:totalItems']);

      if (items.length > 0) {
        console.log('\nSample mov_finanziario:');
        console.log(JSON.stringify(items[0], null, 2));
      }
    } catch (e: any) {
      console.log('Error fetching mov_finanziarios:', e.message);
    }

    // Check Quota schema for incasso fields
    console.log('\n\n' + '='.repeat(60));
    console.log('QUOTA SCHEMA (checking for payment/incasso fields)');
    console.log('='.repeat(60));

    const quotaSchema = docs.data.definitions?.PrtPraticaservizioquota;
    if (quotaSchema?.properties) {
      const props = Object.keys(quotaSchema.properties).sort();
      console.log('\nAll Quota fields:');
      for (const prop of props) {
        const def = quotaSchema.properties[prop];
        const desc = def.description ? ` // ${def.description.substring(0, 50)}` : '';
        console.log(`  - ${prop}: ${def.type || 'ref'}${desc}`);
      }
    }

    // Check Docfiscale paths for query parameters
    console.log('\n\n' + '='.repeat(60));
    console.log('DOCFISCALE PATH PARAMETERS');
    console.log('='.repeat(60));

    const docfiscalePath = docs.data.paths?.['/docfiscales'];
    if (docfiscalePath?.get?.parameters) {
      console.log('\nQuery parameters for GET /docfiscales:');
      for (const param of docfiscalePath.get.parameters) {
        console.log(`  - ${param.name}: ${param.type || 'string'} ${param.required ? '(required)' : ''}`);
      }
    }

  } catch (error: any) {
    console.error('Error:', error.message);
    if (error.response?.data) {
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

checkMovFinanziario();
