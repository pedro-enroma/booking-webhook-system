import { supabase } from './config/supabase';

async function checkPricingCategories() {
  console.log('🔍 CONTROLLO PRICING CATEGORIES PER ACTIVITY\n');
  console.log('='.repeat(100));

  const activityIds = [217949, 216954, 220107];

  for (const activityId of activityIds) {
    console.log(`\n📋 Activity ID: ${activityId}`);
    console.log('-'.repeat(100));

    // Ottieni info activity
    const { data: activity, error: actError } = await supabase
      .from('activities')
      .select('activity_id, title')
      .eq('activity_id', activityId)
      .single();

    if (actError) {
      console.log('❌ Errore:', actError.message);
    } else {
      console.log(`Titolo: ${activity?.title || 'N/A'}\n`);
    }

    // Ottieni tutti i pricing_category_id distinti con conteggi
    const { data: pricingData, error: pricingError } = await supabase
      .from('pricing_category_bookings')
      .select(`
        pricing_category_id,
        booked_title,
        activity_bookings!inner(
          activity_id
        )
      `)
      .eq('activity_bookings.activity_id', activityId);

    if (pricingError) {
      console.log('❌ Errore:', pricingError.message);
      continue;
    }

    // Raggruppa e conta
    const categoryStats: { [key: number]: { count: number; titles: Set<string> } } = {};

    pricingData?.forEach((record: any) => {
      const pricingId = record.pricing_category_id;
      if (!categoryStats[pricingId]) {
        categoryStats[pricingId] = {
          count: 0,
          titles: new Set()
        };
      }
      categoryStats[pricingId].count++;
      categoryStats[pricingId].titles.add(record.booked_title);
    });

    // Ordina per count decrescente
    const sorted = Object.entries(categoryStats)
      .sort((a, b) => b[1].count - a[1].count);

    console.log('Pricing Categories trovate:\n');
    console.log('ID          | Count  | Booked Titles');
    console.log('-'.repeat(100));

    sorted.forEach(([pricingId, stats]) => {
      const titles = Array.from(stats.titles).join(', ');
      console.log(`${pricingId.padEnd(11)} | ${stats.count.toString().padStart(6)} | ${titles}`);
    });

    console.log(`\nTotale record per questa activity: ${pricingData?.length || 0}`);
    console.log(`Pricing categories distinte: ${sorted.length}`);
  }

  console.log('\n' + '='.repeat(100));
  console.log('✅ Controllo completato');
  console.log('='.repeat(100));
}

checkPricingCategories()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Errore:', error);
    process.exit(1);
  });
