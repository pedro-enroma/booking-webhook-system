import { partnerSolutionService } from './services/partnerSolutionService';

async function checkAllEndpoints() {
  partnerSolutionService.clearConfigCache();
  partnerSolutionService.invalidateToken();

  try {
    const client = await (partnerSolutionService as any).getClient();

    console.log('Fetching API documentation...\n');

    const docs = await client.get('/docs', { headers: { 'Accept': 'application/json' } });

    // List all endpoints
    console.log('='.repeat(60));
    console.log('ALL API ENDPOINTS');
    console.log('='.repeat(60));

    const paths = Object.keys(docs.data.paths || {}).sort();

    for (const path of paths) {
      const methods = Object.keys(docs.data.paths[path]).filter(m => m !== 'parameters');
      console.log(`${path} [${methods.join(', ')}]`);
    }

    // Check for incasso-related definitions
    console.log('\n\n' + '='.repeat(60));
    console.log('ALL DEFINITIONS (schemas)');
    console.log('='.repeat(60));

    const definitions = Object.keys(docs.data.definitions || {}).sort();
    for (const def of definitions) {
      console.log(`  - ${def}`);
    }

    // Check Pratica schema for all fields
    console.log('\n\n' + '='.repeat(60));
    console.log('PRATICA FULL SCHEMA');
    console.log('='.repeat(60));

    const praticaSchema = docs.data.definitions?.PrtPratica;
    if (praticaSchema?.properties) {
      const props = Object.keys(praticaSchema.properties).sort();
      for (const prop of props) {
        const def = praticaSchema.properties[prop];
        const desc = def.description ? ` // ${def.description.substring(0, 50)}` : '';
        console.log(`  - ${prop}: ${def.type || 'ref'}${desc}`);
      }
    }

    // Look for incasso in paths
    console.log('\n\n' + '='.repeat(60));
    console.log('SEARCHING FOR INCASSO/PAYMENT ENDPOINTS');
    console.log('='.repeat(60));

    const incassoPaths = paths.filter(p =>
      p.includes('incass') ||
      p.includes('pagament') ||
      p.includes('scadenz')  // scadenze = due dates
    );

    if (incassoPaths.length > 0) {
      console.log('\nIncasso-related paths:');
      for (const p of incassoPaths) {
        console.log(`  ${p}`);
      }
    } else {
      console.log('\nNo incasso-related paths found');
    }

    // Try to fetch the entrypoint to see all available resources
    console.log('\n\n' + '='.repeat(60));
    console.log('API ENTRYPOINT');
    console.log('='.repeat(60));

    try {
      const entrypoint = await client.get('/');
      const resources = Object.keys(entrypoint.data).filter(k => !k.startsWith('@'));
      console.log('\nAvailable resources:');
      for (const r of resources.sort()) {
        console.log(`  - ${r}: ${entrypoint.data[r]}`);
      }
    } catch (e) {
      console.log('Could not fetch entrypoint');
    }

  } catch (error: any) {
    console.error('Error:', error.message);
    if (error.response?.data) {
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

checkAllEndpoints();
