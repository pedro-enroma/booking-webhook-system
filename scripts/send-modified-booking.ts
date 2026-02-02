/**
 * Send booking 83368919 to PS as 983368919 with creation date 31/01/2026
 */

import { PartnerSolutionService } from '../src/services/partnerSolutionService';
import { supabase } from '../src/config/supabase';

async function sendModifiedBooking() {
  console.log('='.repeat(60));
  console.log('Sending booking 83368919 as 983368919 to Partner Solution');
  console.log('='.repeat(60));

  const ps = new PartnerSolutionService();
  const client = await (ps as any).getClient();
  const agencyCode = process.env.PARTNER_SOLUTION_AGENCY_CODE || '7206';

  // Modified booking data
  const bookingId = 983368919;  // Modified ID
  const bookingIdPadded = String(bookingId).padStart(9, '0');
  const totalAmount = 53.00;
  const confirmationCode = 'HEA-83368919';
  const customerFirstName = 'Francisca Romero';
  const customerLastName = 'Ruiz';
  const sellerName = 'Headout Inc';

  // datacreazione and datamodifica always use current timestamp
  const now = new Date().toISOString();
  // Service dates and commessa use the desired period
  const serviceDateForCommessa = '2026-01-31';

  // Commessa for January 2026
  const yearMonth = '2026-01';
  const nrCommessa = yearMonth.replace('-', '');
  const deliveringValue = `commessa: ${nrCommessa}`;

  try {
    console.log(`\n📋 Booking Details:`);
    console.log(`   ID: ${bookingId} (padded: ${bookingIdPadded})`);
    console.log(`   Confirmation: ${confirmationCode}`);
    console.log(`   Amount: €${totalAmount}`);
    console.log(`   Customer: ${customerFirstName} ${customerLastName}`);
    console.log(`   Service Date: ${serviceDateForCommessa}`);
    console.log(`   Commessa: ${nrCommessa}`);

    // Step 1: Create Account
    console.log('\n1️⃣ Creating Account...');
    const accountResponse = await client.post('/accounts', {
      cognome: customerLastName,
      nome: customerFirstName,
      flagpersonafisica: 1,
      codicefiscale: bookingIdPadded,
      codiceagenzia: agencyCode,
      stato: 'INS',
      tipocattura: 'PS',
      iscliente: 1,
      isfornitore: 0,
      nazione: 'Spagna',
    });
    const accountIri = accountResponse.data['@id'];
    const accountId = accountIri.split('/').pop();
    console.log(`   ✅ Account created: ${accountIri}`);

    // Step 2: Create Pratica (WP first)
    console.log('\n2️⃣ Creating Pratica...');
    const praticaPayload = {
      codicecliente: accountId,
      externalid: bookingIdPadded,
      cognomecliente: customerLastName,
      nomecliente: customerFirstName,
      codiceagenzia: agencyCode,
      tipocattura: 'PS',
      datacreazione: now,
      datamodifica: now,
      stato: 'WP',
      descrizionepratica: 'Tour UE ed Extra UE',
      noteinterne: `Seller: ${sellerName}`,
      delivering: deliveringValue
    };
    const praticaResponse = await client.post('/prt_praticas', praticaPayload);
    const praticaIri = praticaResponse.data['@id'];
    console.log(`   ✅ Pratica created: ${praticaIri}`);

    // Step 3: Add Passeggero
    console.log('\n3️⃣ Creating Passeggero...');
    const passeggeroResponse = await client.post('/prt_praticapasseggeros', {
      pratica: praticaIri,
      cognomepax: customerLastName,
      nomepax: customerFirstName,
      annullata: 0,
      iscontraente: 1
    });
    console.log(`   ✅ Passeggero created: ${passeggeroResponse.data['@id']}`);

    // Step 4: Add Servizio
    console.log('\n4️⃣ Creating Servizio...');
    const todayDate = now.split('T')[0];  // datacreazione, datainizioservizio, datafineservizio always now
    const servizioResponse = await client.post('/prt_praticaservizios', {
      pratica: praticaIri,
      externalid: bookingIdPadded,
      tiposervizio: 'PKG',
      tipovendita: 'ORG',
      regimevendita: '74T',
      codicefornitore: 'IT09802381005',
      ragsocfornitore: 'EnRoma Tours',
      codicefilefornitore: bookingIdPadded,
      datacreazione: now,
      datainizioservizio: todayDate,
      datafineservizio: todayDate,
      duratant: 0,
      duratagg: 1,
      nrpaxadulti: 1,
      nrpaxchild: 0,
      nrpaxinfant: 0,
      descrizione: 'Tour UE ed Extra UE',
      tipodestinazione: 'MISTO',
      annullata: 0,
      codiceagenzia: agencyCode,
      stato: 'INS'
    });
    console.log(`   ✅ Servizio created: ${servizioResponse.data['@id']}`);

    // Step 5: Add Quota
    console.log('\n5️⃣ Creating Quota...');
    const quotaResponse = await client.post('/prt_praticaservizioquotas', {
      servizio: servizioResponse.data['@id'],
      descrizionequota: 'Tour UE ed Extra UE',
      datavendita: now,
      codiceisovalutacosto: 'EUR',
      quantitacosto: 1,
      costovalutaprimaria: totalAmount,
      quantitaricavo: 1,
      ricavovalutaprimaria: totalAmount,
      codiceisovalutaricavo: 'EUR',
      commissioniattivevalutaprimaria: 0,
      commissionipassivevalutaprimaria: 0,
      progressivo: 1,
      annullata: 0,
      codiceagenzia: agencyCode,
      stato: 'INS'
    });
    console.log(`   ✅ Quota created: ${quotaResponse.data['@id']}`);

    // Step 6: Add Movimento Finanziario
    console.log('\n6️⃣ Creating Movimento Finanziario...');
    const movimentoResponse = await client.post('/mov_finanziarios', {
      externalid: bookingIdPadded,
      tipomovimento: 'I',
      codicefile: bookingIdPadded,
      codiceagenzia: agencyCode,
      tipocattura: 'PS',
      importo: totalAmount,
      datacreazione: now,
      datamodifica: now,
      datamovimento: now,
      stato: 'INS',
      codcausale: 'PAGBOK',
      descrizione: `Tour UE ed Extra UE - ${confirmationCode}`
    });
    console.log(`   ✅ Movimento created: ${movimentoResponse.data['@id']}`);

    // Step 7: Update Pratica to INS
    console.log('\n7️⃣ Finalizing Pratica (WP → INS)...');
    await client.put(praticaIri, { ...praticaPayload, stato: 'INS' });
    console.log(`   ✅ Pratica finalized`);

    // Record in invoices table
    console.log('\n8️⃣ Recording in database...');
    await supabase.from('invoices').upsert({
      booking_id: bookingId,
      confirmation_code: confirmationCode,
      invoice_type: 'INVOICE',
      status: 'sent',
      total_amount: totalAmount,
      currency: 'EUR',
      customer_name: `${customerFirstName} ${customerLastName}`,
      seller_name: sellerName,
      booking_creation_date: serviceDateForCommessa,
      sent_at: new Date().toISOString(),
      ps_pratica_iri: praticaIri,
      ps_account_iri: accountIri,
      ps_passeggero_iri: passeggeroResponse.data['@id'],
      ps_movimento_iri: movimentoResponse.data['@id'],
      ps_commessa_code: yearMonth,
      created_by: 'manual_script',
    }, { onConflict: 'booking_id,invoice_type' });
    console.log(`   ✅ Recorded in database`);

    console.log('\n' + '='.repeat(60));
    console.log('✅ SUCCESS! Booking sent to Partner Solution');
    console.log('='.repeat(60));
    console.log(`\n📊 Summary:`);
    console.log(`   Pratica IRI: ${praticaIri}`);
    console.log(`   Account IRI: ${accountIri}`);
    console.log(`   Movimento IRI: ${movimentoResponse.data['@id']}`);
    console.log(`   Amount: €${totalAmount}`);
    console.log(`   Commessa: ${nrCommessa}`);

  } catch (error: any) {
    console.error('\n❌ ERROR:', error.response?.data?.['hydra:description'] || error.message);
    if (error.response?.data) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }

  process.exit(0);
}

sendModifiedBooking();
