import { supabase } from './config/supabase';

async function verifySpecificBooking() {
  const activityBookingId = 112493724;
  const pricingCategoryBookingId = 25984;

  console.log('🔍 VERIFICA BOOKING SPECIFICO\n');
  console.log('='.repeat(100));

  // Verifica pricing_category_booking
  console.log('\n📋 Dettagli pricing_category_booking:');
  const { data: pcb, error: pcbError } = await supabase
    .from('pricing_category_bookings')
    .select('*')
    .eq('id', pricingCategoryBookingId)
    .single();

  if (pcbError) {
    console.error('❌ Errore:', pcbError.message);
  } else {
    console.log(JSON.stringify(pcb, null, 2));
  }

  // Verifica activity_booking
  console.log('\n📋 Dettagli activity_booking:');
  const { data: ab, error: abError } = await supabase
    .from('activity_bookings')
    .select('activity_booking_id, activity_id, product_id, product_title, status')
    .eq('activity_booking_id', activityBookingId)
    .single();

  if (abError) {
    console.error('❌ Errore:', abError.message);
  } else {
    console.log(JSON.stringify(ab, null, 2));

    console.log('\n✅ RISULTATO:');
    console.log(`   activity_booking_id: ${ab.activity_booking_id}`);
    console.log(`   activity_id: ${ab.activity_id}`);
    console.log(`   product_title: ${ab.product_title}`);

    const targetActivities = [217949, 216954, 220107];
    if (targetActivities.includes(ab.activity_id)) {
      console.log(`   ✅ Questa activity (${ab.activity_id}) ERA NELLE TARGET!`);
      console.log('   ⚠️  Questo record DOVEVA essere aggiornato ma NON lo è stato!');
    } else {
      console.log(`   ℹ️  Questa activity (${ab.activity_id}) NON era nelle target`);
      console.log('   ✅ Normale che non sia stato aggiornato');
    }
  }

  // Conta quanti record con 161602 e 161603 esistono ancora per le 3 activity target
  console.log('\n\n📊 Conteggio record NON aggiornati per activity target:');
  console.log('-'.repeat(100));

  const targetActivities = [217949, 216954, 220107];
  const oldPricingIds = [161602, 161603];

  for (const activityId of targetActivities) {
    const { data: activity } = await supabase
      .from('activities')
      .select('title')
      .eq('activity_id', activityId)
      .single();

    console.log(`\nActivity ${activityId}: ${activity?.title || 'N/A'}`);

    for (const pricingId of oldPricingIds) {
      const { count, error } = await supabase
        .from('pricing_category_bookings')
        .select('*', { count: 'exact', head: true })
        .eq('pricing_category_id', pricingId)
        .eq('activity_bookings.activity_id', activityId);

      // Query alternativa senza join
      const { data: activityBookingIds } = await supabase
        .from('activity_bookings')
        .select('activity_booking_id')
        .eq('activity_id', activityId);

      const ids = activityBookingIds?.map(ab => ab.activity_booking_id) || [];

      const { count: realCount } = await supabase
        .from('pricing_category_bookings')
        .select('*', { count: 'exact', head: true })
        .in('activity_booking_id', ids)
        .eq('pricing_category_id', pricingId);

      console.log(`   pricing_category_id ${pricingId}: ${realCount || 0} record`);
    }
  }

  console.log('\n' + '='.repeat(100));
}

verifySpecificBooking()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Errore:', error);
    process.exit(1);
  });
