import { partnerSolutionService } from './services/partnerSolutionService';
import { supabase } from './config/supabase';

async function testBooking() {
  partnerSolutionService.clearConfigCache();
  partnerSolutionService.invalidateToken();

  const confirmationCode = 'ENRO-80419985';
  const yearMonth = '2025-12';

  console.log('=== TEST: Send booking to Partner Solution ===\n');

  // 1. Get booking data
  console.log('1. Fetching booking data...');
  const { data: booking, error } = await supabase
    .from('bookings')
    .select(`
      booking_id,
      confirmation_code,
      total_price,
      currency,
      creation_date,
      activity_bookings (
        activity_booking_id,
        product_title,
        total_price,
        start_date_time,
        activity_seller
      ),
      booking_customers (
        customers (
          first_name,
          last_name,
          email
        )
      )
    `)
    .eq('confirmation_code', confirmationCode)
    .single();

  if (error || !booking) {
    console.error('Booking not found:', error?.message);
    return;
  }

  const customer = booking.booking_customers?.[0]?.customers as any;
  console.log('   Customer:', customer?.first_name, customer?.last_name);
  console.log('   Activities:', booking.activity_bookings?.length);

  // 2. Check if monthly pratica exists (in our DB)
  console.log('\n2. Checking for existing monthly pratica...');
  const { data: existingPratica } = await supabase
    .from('monthly_praticas')
    .select('*')
    .eq('year_month', yearMonth)
    .single();

  let praticaIri: string;

  if (existingPratica?.partner_pratica_id) {
    console.log('   Found existing pratica:', existingPratica.partner_pratica_id);
    praticaIri = existingPratica.partner_pratica_id;
  } else {
    // 3. Create new monthly pratica in Partner Solution
    console.log('   No pratica found, creating new one for', yearMonth);

    const now = new Date().toISOString();
    const pratica = await partnerSolutionService.createPratica({
      codiceagenzia: 'demo2',
      tipocattura: 'API',
      stato: 'WP',
      datacreazione: now,
      datamodifica: now,
      cognomecliente: customer?.last_name || 'N/A',
      nomecliente: customer?.first_name || 'N/A',
      descrizionepratica: 'Monthly invoice ' + yearMonth,
      externalid: 'MONTHLY-' + yearMonth,
    });

    praticaIri = pratica['@id'];
    console.log('   Created pratica:', praticaIri);

    // Save to our DB
    await supabase.from('monthly_praticas').insert({
      year_month: yearMonth,
      partner_pratica_id: praticaIri,
      ps_status: 'WP',
      total_amount: 0,
      booking_count: 0,
    });
    console.log('   Saved to monthly_praticas table');
  }

  // 4. Add Servizio + Quota for each activity_booking
  console.log('\n3. Adding services for each activity...');

  for (const activity of (booking.activity_bookings || [])) {
    const activityDate = activity.start_date_time?.split('T')[0] || new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    console.log('\n   Activity:', activity.activity_booking_id);
    console.log('   Revenue:', activity.total_price, 'EUR');

    // Create Servizio
    const servizio = await partnerSolutionService.createServizio({
      pratica: praticaIri,
      tiposervizio: 'VIS',
      tipovendita: 'ORG',
      regimevendita: '74T',
      datainizioservizio: activityDate,
      datafineservizio: activityDate,
      datacreazione: now,
      nrpaxadulti: 1,
      nrpaxchild: 0,
      nrpaxinfant: 0,
      codicefornitore: 'ENROMA',
      codicefilefornitore: 'ENROMA',
      ragsocfornitore: 'EnRoma Tours',
      tipodestinazione: 'CEENAZ',
      duratagg: 1,
      duratant: 0,
      annullata: 0,
      descrizione: 'Tour Italia e Vaticano',
    });
    console.log('   Servizio created:', servizio['@id']);

    // Create Quota
    const quota = await partnerSolutionService.createQuota({
      servizio: servizio['@id'],
      descrizionequota: confirmationCode + ' - ' + activity.activity_booking_id,
      datavendita: activityDate,
      codiceisovalutacosto: 'eur',
      codiceisovalutaricavo: 'eur',
      quantitacosto: 1,
      quantitaricavo: 1,
      costovalutaprimaria: 0,
      ricavovalutaprimaria: activity.total_price,
      progressivo: 1,
      annullata: 0,
      commissioniattivevalutaprimaria: 0,
      commissionipassivevalutaprimaria: 0,
    });
    console.log('   Quota created:', quota['@id']);
  }

  console.log('\n=== SUCCESS ===');
  console.log('Booking', confirmationCode, 'sent to Partner Solution');
  console.log('Monthly Pratica:', praticaIri);
}

testBooking().catch(e => console.error('ERROR:', e.message));
