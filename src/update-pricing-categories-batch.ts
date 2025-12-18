import { supabase } from './config/supabase';

async function updateInBatches() {
  console.log('🔍 UPDATE IN BATCH - Aggiornamento Pricing Categories\n');
  console.log('='.repeat(100));

  const BATCH_SIZE = 50; // Update 50 record alla volta
  let totalUpdated = 0;

  try {
    // Trova TUTTI i record da aggiornare
    const { data: records, error } = await supabase
      .from('pricing_category_bookings')
      .select('id')
      .in('pricing_category_id', [161602, 161603]);

    if (error) {
      console.error('❌ Errore:', error.message);
      process.exit(1);
    }

    console.log(`\n📊 Trovati ${records?.length || 0} record totali da aggiornare\n`);

    if (!records || records.length === 0) {
      console.log('✅ Nessun record da aggiornare');
      process.exit(0);
    }

    // Dividi in batch
    const ids = records.map(r => r.id);
    const batches = [];
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      batches.push(ids.slice(i, i + BATCH_SIZE));
    }

    console.log(`📦 Diviso in ${batches.length} batch da max ${BATCH_SIZE} record\n`);
    console.log('⏳ Inizio aggiornamento tra 2 secondi... (Ctrl+C per annullare)\n');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Aggiorna batch per batch
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      const { data: updated, error: updateError } = await supabase
        .from('pricing_category_bookings')
        .update({
          pricing_category_id: 166592,
          booked_title: '6 a 17 años'
        })
        .in('id', batch)
        .select('id');

      if (updateError) {
        console.error(`❌ Errore batch ${i + 1}:`, updateError.message);
        continue;
      }

      const count = updated?.length || 0;
      totalUpdated += count;

      process.stdout.write(`\r🔄 Batch ${i + 1}/${batches.length}: ${count} record aggiornati | Totale: ${totalUpdated}/${records.length}`);

      // Piccola pausa tra i batch per non sovraccaricare il database
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('\n\n' + '='.repeat(100));
    console.log(`✅ AGGIORNAMENTO COMPLETATO!`);
    console.log(`   Record aggiornati: ${totalUpdated}/${records.length}`);
    console.log('='.repeat(100));

    // Verifica finale
    console.log('\n📋 Verifica finale...');
    const { count: remaining161602 } = await supabase
      .from('pricing_category_bookings')
      .select('*', { count: 'exact', head: true })
      .eq('pricing_category_id', 161602);

    const { count: remaining161603 } = await supabase
      .from('pricing_category_bookings')
      .select('*', { count: 'exact', head: true })
      .eq('pricing_category_id', 161603);

    const { count: new166592 } = await supabase
      .from('pricing_category_bookings')
      .select('*', { count: 'exact', head: true })
      .eq('pricing_category_id', 166592);

    console.log(`   Record con 161602: ${remaining161602 || 0} (dovrebbe essere 0)`);
    console.log(`   Record con 161603: ${remaining161603 || 0} (dovrebbe essere 0)`);
    console.log(`   Record con 166592: ${new166592 || 0}\n`);

    if ((remaining161602 || 0) + (remaining161603 || 0) === 0) {
      console.log('✅ TUTTI I RECORD SONO STATI AGGIORNATI CORRETTAMENTE!\n');
    } else {
      console.log(`⚠️  ATTENZIONE: Rimangono ${(remaining161602 || 0) + (remaining161603 || 0)} record da aggiornare\n`);
    }

    process.exit(0);

  } catch (error: any) {
    console.error('\n❌ ERRORE:', error.message);
    process.exit(1);
  }
}

updateInBatches();
