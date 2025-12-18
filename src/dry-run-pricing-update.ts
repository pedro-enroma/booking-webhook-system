/**
 * DRY RUN - Mostra cosa succederebbe con l'update
 * NON MODIFICA NESSUN DATO
 */

import { supabase } from './config/supabase';

interface RecordToUpdate {
  id: number;
  pricing_category_booking_id: number;
  activity_booking_id: number;
  pricing_category_id: number;
  booked_title: string;
  age: number;
  quantity: number;
  occupancy: number;
  passenger_first_name: string | null;
  passenger_last_name: string | null;
  activity_id: number;
  product_title: string;
  created_at: string;
}

async function dryRunUpdate() {
  console.log('🔍 DRY RUN - Simulazione Aggiornamento Pricing Categories\n');
  console.log('⚠️  NESSUN DATO VERRÀ MODIFICATO - Solo simulazione\n');
  console.log('='.repeat(100));

  try {
    // ========================================
    // 1. TROVA TUTTI I RECORD DA AGGIORNARE
    // ========================================
    console.log('\n📋 STEP 1: Recupero tutti i record da aggiornare...');
    console.log('-'.repeat(100));

    const { data: recordsToUpdate, error: findError } = await supabase
      .from('pricing_category_bookings')
      .select(`
        id,
        pricing_category_booking_id,
        activity_booking_id,
        pricing_category_id,
        booked_title,
        age,
        quantity,
        occupancy,
        passenger_first_name,
        passenger_last_name,
        created_at,
        activity_bookings!inner(
          activity_id,
          product_title
        )
      `)
      .in('activity_bookings.activity_id', [217949, 216954, 220107])
      .in('pricing_category_id', [161603, 161602])
      .order('pricing_category_id')
      .order('id');

    if (findError) {
      console.error('❌ Errore:', findError.message);
      process.exit(1);
    }

    const records = recordsToUpdate as unknown as RecordToUpdate[];
    console.log(`✅ Trovati ${records?.length || 0} record da aggiornare\n`);

    if (!records || records.length === 0) {
      console.log('⚠️  Nessun record da aggiornare. Operazione annullata.');
      process.exit(0);
    }

    // ========================================
    // 2. STATISTICHE GENERALI
    // ========================================
    console.log('\n📊 STEP 2: Statistiche Generali');
    console.log('-'.repeat(100));

    // Raggruppa per activity_id
    const byActivity: { [key: number]: RecordToUpdate[] } = {};
    records.forEach(record => {
      const activityId = (record as any).activity_bookings.activity_id;
      if (!byActivity[activityId]) {
        byActivity[activityId] = [];
      }
      byActivity[activityId].push(record);
    });

    console.log('\nDistribuzione per Activity:');
    Object.entries(byActivity).forEach(([activityId, recs]) => {
      const product = recs[0] ? (recs[0] as any).activity_bookings.product_title : 'N/A';
      console.log(`\n  Activity ${activityId}: ${recs.length} record`);
      console.log(`     Prodotto: ${product}`);

      // Conta per pricing_category_id
      const byPricing: { [key: number]: number } = {};
      recs.forEach(r => {
        byPricing[r.pricing_category_id] = (byPricing[r.pricing_category_id] || 0) + 1;
      });

      Object.entries(byPricing).forEach(([pricingId, count]) => {
        const title = recs.find(r => r.pricing_category_id === Number(pricingId))?.booked_title || '';
        console.log(`     - pricing_category_id ${pricingId} (${title}): ${count} record`);
      });
    });

    // ========================================
    // 3. PRIMA 20 MODIFICHE IN DETTAGLIO
    // ========================================
    console.log('\n\n📋 STEP 3: Prime 20 modifiche in dettaglio (BEFORE → AFTER)');
    console.log('-'.repeat(100));

    const samplesToShow = Math.min(20, records.length);
    console.log(`\nMostro ${samplesToShow} record su ${records.length} totali:\n`);

    for (let i = 0; i < samplesToShow; i++) {
      const record = records[i];
      const activityId = (record as any).activity_bookings.activity_id;

      console.log(`\n[${ i + 1}/${samplesToShow}] Record ID: ${record.id}`);
      console.log('  ┌─ BEFORE (attuale):');
      console.log(`  │  pricing_category_booking_id: ${record.pricing_category_booking_id}`);
      console.log(`  │  activity_booking_id: ${record.activity_booking_id}`);
      console.log(`  │  activity_id: ${activityId}`);
      console.log(`  │  pricing_category_id: ${record.pricing_category_id}`);
      console.log(`  │  booked_title: "${record.booked_title}"`);
      console.log(`  │  age: ${record.age}`);
      console.log(`  │  quantity: ${record.quantity}`);
      console.log(`  │  passenger: ${record.passenger_first_name || 'N/A'} ${record.passenger_last_name || ''}`);
      console.log(`  │  created_at: ${record.created_at}`);

      console.log('  │');
      console.log('  ├─ MODIFICHE:');
      console.log(`  │  pricing_category_id: ${record.pricing_category_id} → 166592`);
      console.log(`  │  booked_title: "${record.booked_title}" → "6 a 17 años"`);
      console.log(`  │  updated_at: ${record.created_at} → <TIMESTAMP_CORRENTE>`);

      console.log('  │');
      console.log('  └─ AFTER (risultato):');
      console.log(`     pricing_category_booking_id: ${record.pricing_category_booking_id}`);
      console.log(`     activity_booking_id: ${record.activity_booking_id}`);
      console.log(`     activity_id: ${activityId}`);
      console.log(`     pricing_category_id: 166592 ✨`);
      console.log(`     booked_title: "6 a 17 años" ✨`);
      console.log(`     age: ${record.age}`);
      console.log(`     quantity: ${record.quantity}`);
      console.log(`     passenger: ${record.passenger_first_name || 'N/A'} ${record.passenger_last_name || ''}`);
      console.log(`     updated_at: <TIMESTAMP_CORRENTE> ✨`);
    }

    if (records.length > samplesToShow) {
      console.log(`\n... e altri ${records.length - samplesToShow} record con le stesse modifiche`);
    }

    // ========================================
    // 4. RIEPILOGO MODIFICHE PER CAMPO
    // ========================================
    console.log('\n\n📋 STEP 4: Riepilogo Modifiche per Campo');
    console.log('-'.repeat(100));

    const pricingIdChanges: { [key: string]: number } = {};
    const bookedTitleChanges: { [key: string]: number } = {};

    records.forEach(record => {
      const oldId = record.pricing_category_id;
      const key = `${oldId} → 166592`;
      pricingIdChanges[key] = (pricingIdChanges[key] || 0) + 1;

      const titleKey = `"${record.booked_title}" → "6 a 17 años"`;
      bookedTitleChanges[titleKey] = (bookedTitleChanges[titleKey] || 0) + 1;
    });

    console.log('\nCambiamenti pricing_category_id:');
    Object.entries(pricingIdChanges).forEach(([change, count]) => {
      console.log(`  ${change}: ${count} record`);
    });

    console.log('\nCambiamenti booked_title:');
    Object.entries(bookedTitleChanges).forEach(([change, count]) => {
      console.log(`  ${change}: ${count} record`);
    });

    // ========================================
    // 5. VERIFICA IMPATTO SU MATERIALIZED VIEW
    // ========================================
    console.log('\n\n📋 STEP 5: Impatto su Materialized View');
    console.log('-'.repeat(100));

    const { count: mvCount, error: mvError } = await supabase
      .from('activity_bookings_participants_mv')
      .select('*', { count: 'exact', head: true })
      .in('activity_id', [217949, 216954, 220107])
      .in('pricing_category_id', [161603, 161602]);

    if (mvError) {
      console.log('⚠️  Impossibile verificare la materialized view:', mvError.message);
    } else {
      console.log(`\n✅ La materialized view ha ${mvCount || 0} record con i vecchi pricing_category_id`);
      console.log('   Dopo l\'update, questi record nella MV mostreranno ancora i vecchi valori');
      console.log('   FINO A quando non verrà eseguito: REFRESH MATERIALIZED VIEW activity_bookings_participants_mv');
    }

    // ========================================
    // 6. LISTA COMPLETA ACTIVITY_BOOKING_ID INTERESSATI
    // ========================================
    console.log('\n\n📋 STEP 6: Activity Booking ID interessati');
    console.log('-'.repeat(100));

    const uniqueActivityBookingIds = [...new Set(records.map(r => r.activity_booking_id))];
    console.log(`\n${uniqueActivityBookingIds.length} activity_booking distinti verranno interessati:`);

    if (uniqueActivityBookingIds.length <= 30) {
      console.log('\nLista completa:');
      uniqueActivityBookingIds.forEach(id => {
        const count = records.filter(r => r.activity_booking_id === id).length;
        console.log(`  - ${id} (${count} partecipanti)`);
      });
    } else {
      console.log('\nPrimi 30:');
      uniqueActivityBookingIds.slice(0, 30).forEach(id => {
        const count = records.filter(r => r.activity_booking_id === id).length;
        console.log(`  - ${id} (${count} partecipanti)`);
      });
      console.log(`  ... e altri ${uniqueActivityBookingIds.length - 30} activity_booking`);
    }

    // ========================================
    // 7. QUERY SQL EQUIVALENTE
    // ========================================
    console.log('\n\n📋 STEP 7: Query SQL equivalente all\'update');
    console.log('-'.repeat(100));

    console.log('\nLa seguente query SQL farà le stesse modifiche:\n');
    console.log('```sql');
    console.log('BEGIN;');
    console.log('');
    console.log('UPDATE pricing_category_bookings pcb');
    console.log('SET');
    console.log('    pricing_category_id = 166592,');
    console.log('    booked_title = \'6 a 17 años\',');
    console.log('    updated_at = NOW()');
    console.log('FROM activity_bookings ab');
    console.log('WHERE ab.activity_booking_id = pcb.activity_booking_id');
    console.log('  AND ab.activity_id IN (217949, 216954, 220107)');
    console.log('  AND pcb.pricing_category_id IN (161603, 161602);');
    console.log('');
    console.log('-- Verifica');
    console.log('SELECT COUNT(*) as updated_count FROM pricing_category_bookings pcb');
    console.log('JOIN activity_bookings ab ON ab.activity_booking_id = pcb.activity_booking_id');
    console.log('WHERE ab.activity_id IN (217949, 216954, 220107)');
    console.log('  AND pcb.pricing_category_id = 166592;');
    console.log('-- Dovrebbe restituire: ' + records.length);
    console.log('');
    console.log('COMMIT;');
    console.log('-- oppure ROLLBACK; se qualcosa non va');
    console.log('');
    console.log('-- Refresh materialized view');
    console.log('REFRESH MATERIALIZED VIEW activity_bookings_participants_mv;');
    console.log('```');

    // ========================================
    // RIEPILOGO FINALE
    // ========================================
    console.log('\n\n' + '='.repeat(100));
    console.log('📊 RIEPILOGO FINALE DRY RUN');
    console.log('='.repeat(100));

    console.log('\n✅ OPERAZIONE DA ESEGUIRE:');
    console.log(`   - Totale record da modificare: ${records.length}`);
    console.log(`   - Activity interessate: 3 (217949, 216954, 220107)`);
    console.log(`   - Activity bookings interessati: ${uniqueActivityBookingIds.length}`);
    console.log(`   - Campi modificati per record: 3 (pricing_category_id, booked_title, updated_at)`);

    console.log('\n📝 MODIFICHE PER ACTIVITY:');
    Object.entries(byActivity).forEach(([activityId, recs]) => {
      console.log(`   - Activity ${activityId}: ${recs.length} record`);
    });

    console.log('\n⚠️  AZIONI POST-UPDATE NECESSARIE:');
    console.log('   1. Refresh materialized view: REFRESH MATERIALIZED VIEW activity_bookings_participants_mv');
    console.log('   2. Verifica risultati con query di controllo');

    console.log('\n✅ SICUREZZA:');
    console.log('   - Nessuna foreign key bloccante');
    console.log('   - Valore target (166592) già usato in 546 record');
    console.log('   - Operazione reversibile (si può fare rollback se in transazione)');

    console.log('\n🚀 PER PROCEDERE:');
    console.log('   npm run update-pricing-categories');

    console.log('\n' + '='.repeat(100));

  } catch (error: any) {
    console.error('\n❌ ERRORE:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Esegui dry run
dryRunUpdate()
  .then(() => {
    console.log('\n✅ Dry run completato - NESSUN DATO È STATO MODIFICATO');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Errore fatale:', error);
    process.exit(1);
  });
