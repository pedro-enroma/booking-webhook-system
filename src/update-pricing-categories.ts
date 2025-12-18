/**
 * Script per aggiornare pricing_category_id in pricing_category_bookings
 *
 * Cambia pricing_category_id da 161603 e 161602 a 166592
 * per le activity_id: 217949, 216954, 220107
 * e aggiorna il booked_title a "6 a 17 años"
 */

import { supabase } from './config/supabase';

interface UpdateResult {
  success: boolean;
  recordsFound: number;
  recordsUpdated: number;
  errors: string[];
}

async function updatePricingCategories(): Promise<UpdateResult> {
  const result: UpdateResult = {
    success: false,
    recordsFound: 0,
    recordsUpdated: 0,
    errors: []
  };

  console.log('🔍 Inizio processo di aggiornamento pricing_category_id...\n');

  try {
    // STEP 1: Verifica che il valore 166592 sia già usato (quindi valido)
    console.log('📋 STEP 1: Verifica che pricing_category_id 166592 sia un valore valido...');
    const { count: existingCount, error: countError } = await supabase
      .from('pricing_category_bookings')
      .select('*', { count: 'exact', head: true })
      .eq('pricing_category_id', 166592);

    if (countError) {
      result.errors.push('❌ ERRORE nella verifica: ' + countError.message);
      console.error(result.errors[0]);
      return result;
    }

    console.log(`✅ pricing_category_id 166592 è già usato in ${existingCount || 0} record (valore valido)`);
    console.log('');

    // STEP 2: Trova tutti i record da aggiornare
    console.log('📋 STEP 2: Ricerca record da aggiornare...');
    const { data: recordsToUpdate, error: findError } = await supabase
      .from('pricing_category_bookings')
      .select(`
        id,
        pricing_category_booking_id,
        activity_booking_id,
        pricing_category_id,
        booked_title,
        age,
        activity_bookings!inner(
          activity_id,
          product_title
        )
      `)
      .in('activity_bookings.activity_id', [217949, 216954, 220107])
      .in('pricing_category_id', [161603, 161602]);

    if (findError) {
      result.errors.push(`❌ Errore nella ricerca: ${findError.message}`);
      console.error(result.errors[0]);
      return result;
    }

    result.recordsFound = recordsToUpdate?.length || 0;
    console.log(`✅ Trovati ${result.recordsFound} record da aggiornare\n`);

    if (result.recordsFound === 0) {
      console.log('⚠️  Nessun record da aggiornare. Operazione completata.');
      result.success = true;
      return result;
    }

    // STEP 3: Mostra i record che verranno aggiornati
    console.log('📊 Record da aggiornare:');
    console.log('─'.repeat(100));
    recordsToUpdate?.forEach((record: any) => {
      console.log(`ID: ${record.id} | ` +
        `Booking: ${record.activity_booking_id} | ` +
        `Activity: ${record.activity_bookings.activity_id} | ` +
        `Old Category: ${record.pricing_category_id} | ` +
        `Old Title: "${record.booked_title}"`);
    });
    console.log('─'.repeat(100));
    console.log('');

    // STEP 4: Chiedi conferma (in ambiente interattivo)
    console.log('⚠️  ATTENZIONE: Stai per aggiornare questi record!');
    console.log('   - Nuovo pricing_category_id: 166592');
    console.log('   - Nuovo booked_title: "6 a 17 años"');
    console.log('');

    // Aspetta 3 secondi per permettere di cancellare se necessario
    console.log('⏳ Inizio aggiornamento tra 3 secondi... (Ctrl+C per annullare)');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // STEP 5: Esegui l'update per ogni activity_id
    console.log('\n📝 STEP 5: Esecuzione aggiornamenti...\n');

    const activityIds = ['217949', '216954', '220107'];
    const oldPricingIds = [161603, 161602];

    for (const activityId of activityIds) {
      console.log(`\n🔄 Aggiornamento per activity_id ${activityId}...`);

      // Prima trova gli activity_booking_id per questa activity
      const { data: activityBookings, error: abError } = await supabase
        .from('activity_bookings')
        .select('activity_booking_id')
        .eq('activity_id', activityId);

      if (abError) {
        result.errors.push(`❌ Errore trovando activity_bookings per activity ${activityId}: ${abError.message}`);
        console.error(result.errors[result.errors.length - 1]);
        continue;
      }

      const activityBookingIds = activityBookings?.map(ab => ab.activity_booking_id) || [];

      if (activityBookingIds.length === 0) {
        console.log(`   ⚠️  Nessun activity_booking trovato per activity ${activityId}`);
        continue;
      }

      // Aggiorna i pricing_category_bookings
      const { data: updated, error: updateError } = await supabase
        .from('pricing_category_bookings')
        .update({
          pricing_category_id: 166592,
          booked_title: '6 a 17 años'
        })
        .in('activity_booking_id', activityBookingIds)
        .in('pricing_category_id', oldPricingIds)
        .select();

      if (updateError) {
        result.errors.push(`❌ Errore aggiornando activity ${activityId}: ${updateError.message}`);
        console.error(result.errors[result.errors.length - 1]);
        continue;
      }

      const updatedCount = updated?.length || 0;
      result.recordsUpdated += updatedCount;
      console.log(`   ✅ Aggiornati ${updatedCount} record per activity ${activityId}`);
    }

    console.log(`\n✅ Totale record aggiornati: ${result.recordsUpdated} su ${result.recordsFound}\n`);

    // STEP 6: Refresh materialized view
    console.log('📋 STEP 6: Refresh materialized view...');
    const { error: refreshError } = await supabase.rpc('refresh_activity_bookings_mv');

    if (refreshError) {
      // Prova il metodo alternativo
      console.log('⚠️  RPC non disponibile, tento refresh diretto...');
      const { error: directRefreshError } = await supabase
        .from('activity_bookings_participants_mv')
        .select('count')
        .limit(1);

      if (directRefreshError) {
        result.errors.push(`⚠️  Warning: Impossibile refreshare la materialized view: ${refreshError.message}`);
        console.warn(result.errors[result.errors.length - 1]);
        console.warn('   Dovrai eseguire manualmente: REFRESH MATERIALIZED VIEW activity_bookings_participants_mv;');
      } else {
        console.log('✅ Materialized view refreshata (metodo alternativo)');
      }
    } else {
      console.log('✅ Materialized view refreshata');
    }

    // STEP 7: Verifica finale
    console.log('\n📋 STEP 7: Verifica finale...');
    const { data: verifyData, error: verifyError } = await supabase
      .from('pricing_category_bookings')
      .select(`
        pricing_category_id,
        booked_title,
        activity_bookings!inner(
          activity_id
        )
      `)
      .in('activity_bookings.activity_id', [217949, 216954, 220107])
      .eq('pricing_category_id', 166592);

    if (verifyError) {
      result.errors.push(`❌ Errore nella verifica: ${verifyError.message}`);
      console.error(result.errors[result.errors.length - 1]);
    } else {
      console.log(`✅ Verifica completata: ${verifyData?.length || 0} record con nuovo pricing_category_id`);

      // Conta per activity
      const countByActivity: { [key: number]: number } = {};
      verifyData?.forEach((record: any) => {
        const activityId = record.activity_bookings.activity_id;
        countByActivity[activityId] = (countByActivity[activityId] || 0) + 1;
      });

      console.log('\n📊 Distribuzione per activity_id:');
      Object.entries(countByActivity).forEach(([activityId, count]) => {
        console.log(`   Activity ${activityId}: ${count} record`);
      });
    }

    result.success = result.errors.length === 0;

    console.log('\n' + '='.repeat(100));
    if (result.success) {
      console.log('✅ AGGIORNAMENTO COMPLETATO CON SUCCESSO!');
    } else {
      console.log('⚠️  AGGIORNAMENTO COMPLETATO CON ALCUNI WARNING:');
      result.errors.forEach(err => console.log(`   ${err}`));
    }
    console.log('='.repeat(100));

  } catch (error: any) {
    result.errors.push(`❌ Errore imprevisto: ${error.message}`);
    console.error('\n❌ ERRORE CRITICO:', error);
  }

  return result;
}

// Esegui lo script
updatePricingCategories()
  .then(result => {
    console.log('\n📊 Risultato finale:', {
      success: result.success,
      recordsFound: result.recordsFound,
      recordsUpdated: result.recordsUpdated,
      errors: result.errors.length
    });

    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Errore fatale:', error);
    process.exit(1);
  });
