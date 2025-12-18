import { supabase } from './config/supabase';

async function countExactRecords() {
  console.log('🔍 CONTEGGIO ESATTO DEI RECORD\n');

  // Conta tutti i record con pricing_category_id = 166592
  const { count: count166592, error: error166592 } = await supabase
    .from('pricing_category_bookings')
    .select('*', { count: 'exact', head: true })
    .eq('pricing_category_id', 166592);

  console.log('📊 Record con pricing_category_id = 166592:', count166592 || 0);
  if (error166592) console.error('Errore:', error166592);

  // Conta tutti i record con pricing_category_id = 161602
  const { count: count161602, error: error161602 } = await supabase
    .from('pricing_category_bookings')
    .select('*', { count: 'exact', head: true })
    .eq('pricing_category_id', 161602);

  console.log('📊 Record con pricing_category_id = 161602:', count161602 || 0);
  if (error161602) console.error('Errore:', error161602);

  // Conta tutti i record con pricing_category_id = 161603
  const { count: count161603, error: error161603 } = await supabase
    .from('pricing_category_bookings')
    .select('*', { count: 'exact', head: true })
    .eq('pricing_category_id', 161603);

  console.log('📊 Record con pricing_category_id = 161603:', count161603 || 0);
  if (error161603) console.error('Errore:', error161603);

  // Conta totale record
  const { count: totalCount, error: totalError } = await supabase
    .from('pricing_category_bookings')
    .select('*', { count: 'exact', head: true });

  console.log('\n📊 TOTALE record in pricing_category_bookings:', totalCount || 0);
  if (totalError) console.error('Errore:', totalError);

  process.exit(0);
}

countExactRecords();
