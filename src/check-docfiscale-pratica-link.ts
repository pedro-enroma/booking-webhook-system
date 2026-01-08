import { partnerSolutionService } from './services/partnerSolutionService';

async function checkDocfiscalePraticaLink() {
  partnerSolutionService.clearConfigCache();
  partnerSolutionService.invalidateToken();

  try {
    const client = await (partnerSolutionService as any).getClient();

    console.log('Fetching API documentation...\n');

    const docs = await client.get('/docs', { headers: { 'Accept': 'application/json' } });

    // Check Docfiscale schema for pratica-related fields
    console.log('='.repeat(60));
    console.log('DOCFISCALE FIELDS (checking for pratica/payment links)');
    console.log('='.repeat(60));

    const docfiscaleSchema = docs.data.definitions?.Docfiscale;
    if (docfiscaleSchema?.properties) {
      const props = Object.keys(docfiscaleSchema.properties);

      console.log('\nAll Docfiscale fields:');
      for (const prop of props.sort()) {
        const def = docfiscaleSchema.properties[prop];
        const desc = def.description ? ` // ${def.description.substring(0, 60)}` : '';
        console.log(`  - ${prop}: ${def.type || 'ref'}${desc}`);
      }

      // Check for pratica-related fields
      const praticaFields = props.filter(p =>
        p.toLowerCase().includes('pratica') ||
        p.toLowerCase().includes('servizio') ||
        p.toLowerCase().includes('quota')
      );
      console.log('\n🔗 Pratica-related fields:', praticaFields.length > 0 ? praticaFields : 'NONE');

      // Check for payment-related fields
      const paymentFields = props.filter(p =>
        p.toLowerCase().includes('pagamento') ||
        p.toLowerCase().includes('pagat') ||
        p.toLowerCase().includes('payment') ||
        p.toLowerCase().includes('paid') ||
        p.toLowerCase().includes('saldo') ||
        p.toLowerCase().includes('incasso')
      );
      console.log('💰 Payment-related fields:', paymentFields.length > 0 ? paymentFields : 'NONE');
    }

    // Check Pratica schema for docfiscale-related fields
    console.log('\n\n' + '='.repeat(60));
    console.log('PRATICA FIELDS (checking for docfiscale links)');
    console.log('='.repeat(60));

    const praticaSchema = docs.data.definitions?.PrtPratica;
    if (praticaSchema?.properties) {
      const props = Object.keys(praticaSchema.properties);

      // Check for docfiscale-related fields
      const docFields = props.filter(p =>
        p.toLowerCase().includes('docfiscale') ||
        p.toLowerCase().includes('fattura') ||
        p.toLowerCase().includes('invoice')
      );
      console.log('\n📄 Docfiscale-related fields in Pratica:', docFields.length > 0 ? docFields : 'NONE');

      // Check for payment-related fields in pratica
      const paymentFields = props.filter(p =>
        p.toLowerCase().includes('pagamento') ||
        p.toLowerCase().includes('pagat') ||
        p.toLowerCase().includes('payment') ||
        p.toLowerCase().includes('saldo') ||
        p.toLowerCase().includes('incasso')
      );
      console.log('💰 Payment-related fields in Pratica:', paymentFields.length > 0 ? paymentFields : 'NONE');
    }

    // Look for payment-related endpoints
    console.log('\n\n' + '='.repeat(60));
    console.log('PAYMENT-RELATED ENDPOINTS');
    console.log('='.repeat(60));

    const paths = Object.keys(docs.data.paths || {});
    const paymentPaths = paths.filter(p =>
      p.toLowerCase().includes('pagamento') ||
      p.toLowerCase().includes('incasso') ||
      p.toLowerCase().includes('payment') ||
      p.toLowerCase().includes('saldo')
    );

    console.log('\nPayment endpoints found:');
    if (paymentPaths.length > 0) {
      for (const path of paymentPaths) {
        const methods = Object.keys(docs.data.paths[path]);
        console.log(`  ${path} [${methods.join(', ')}]`);
      }
    } else {
      console.log('  NONE');
    }

    // Check for quota-related endpoints (quotas often have payment info)
    console.log('\n\nQuota-related endpoints:');
    const quotaPaths = paths.filter(p => p.includes('quota'));
    for (const path of quotaPaths) {
      console.log(`  ${path}`);
    }

    // Check PrtPraticaquota schema for payment fields
    console.log('\n\n' + '='.repeat(60));
    console.log('QUOTA FIELDS (checking for payment status)');
    console.log('='.repeat(60));

    const quotaSchema = docs.data.definitions?.PrtPraticaquota;
    if (quotaSchema?.properties) {
      const props = Object.keys(quotaSchema.properties);
      console.log('\nAll Quota fields:');
      for (const prop of props.sort()) {
        const def = quotaSchema.properties[prop];
        console.log(`  - ${prop}: ${def.type || 'ref'}`);
      }
    }

  } catch (error: any) {
    console.error('Error:', error.message);
    if (error.response?.data) {
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

checkDocfiscalePraticaLink();
