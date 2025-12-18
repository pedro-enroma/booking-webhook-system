/**
 * Script di verifica preliminare prima dell'aggiornamento pricing_category_id
 *
 * Questo script NON modifica nessun dato, solo verifica e mostra informazioni
 */

import { supabase } from './config/supabase';

async function verifyBeforeUpdate() {
  console.log('🔍 VERIFICA PRELIMINARE - Aggiornamento Pricing Categories\n');
  console.log('='.repeat(100));

  let allChecksPass = true;

  try {
    // ========================================
    // VERIFICA 1: Il nuovo pricing_category_id esiste?
    // ========================================
    console.log('\n📋 VERIFICA 1: Esistenza pricing_category_id 166592');
    console.log('-'.repeat(100));

    const { data: newPricingCategory, error: pricingError } = await supabase
      .from('pricing_categories')
      .select('*')
      .eq('id', 166592)
      .single();

    if (pricingError || !newPricingCategory) {
      console.log('❌ ERRORE CRITICO: pricing_category_id 166592 NON ESISTE!');
      console.log('   Devi prima creare questo record nella tabella pricing_categories');
      console.log('   L\'update non può procedere senza questo record.\n');
      allChecksPass = false;
    } else {
      console.log('✅ pricing_category_id 166592 TROVATO:');
      console.log('   ID:', newPricingCategory.id);
      console.log('   Title:', newPricingCategory.title || '(non impostato)');
      console.log('   Label:', newPricingCategory.label || '(non impostato)');

      // Verifica che il title sia corretto
      if (newPricingCategory.title === '6 a 17 años') {
        console.log('   ✅ Title è corretto: "6 a 17 años"');
      } else {
        console.log(`   ⚠️  WARNING: Title è "${newPricingCategory.title}" invece di "6 a 17 años"`);
        console.log('   Potresti voler aggiornare anche il pricing_category prima di procedere.');
      }
      console.log();
    }

    // ========================================
    // VERIFICA 2: Quanti record verranno modificati?
    // ========================================
    console.log('\n📋 VERIFICA 2: Conta record da aggiornare');
    console.log('-'.repeat(100));

    const { data: recordsToUpdate, error: countError } = await supabase
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

    if (countError) {
      console.log('❌ Errore nel conteggio:', countError.message);
      allChecksPass = false;
    } else {
      const totalCount = recordsToUpdate?.length || 0;
      console.log(`✅ Totale record da aggiornare: ${totalCount}\n`);

      if (totalCount === 0) {
        console.log('⚠️  ATTENZIONE: Nessun record trovato da aggiornare!');
        console.log('   Possibili motivi:');
        console.log('   - I record sono già stati aggiornati');
        console.log('   - Le activity_id specificate non hanno questi pricing_category_id');
        console.log('   - Errore nelle activity_id o pricing_category_id specificati\n');
      } else {
        // Conta per activity_id
        const countByActivity: { [key: number]: { [key: number]: number } } = {};
        recordsToUpdate?.forEach((record: any) => {
          const activityId = record.activity_bookings.activity_id;
          const pricingId = record.pricing_category_id;

          if (!countByActivity[activityId]) {
            countByActivity[activityId] = {};
          }
          countByActivity[activityId][pricingId] = (countByActivity[activityId][pricingId] || 0) + 1;
        });

        console.log('📊 Distribuzione per activity_id e pricing_category_id:');
        Object.entries(countByActivity).forEach(([activityId, pricingCounts]) => {
          console.log(`\n   Activity ${activityId}:`);
          Object.entries(pricingCounts).forEach(([pricingId, count]) => {
            console.log(`      pricing_category_id ${pricingId}: ${count} record`);
          });
        });
        console.log();
      }
    }

    // ========================================
    // VERIFICA 3: Mostra esempi di record
    // ========================================
    console.log('\n📋 VERIFICA 3: Esempi di record che verranno modificati (primi 10)');
    console.log('-'.repeat(100));

    if (recordsToUpdate && recordsToUpdate.length > 0) {
      const examples = recordsToUpdate.slice(0, 10);

      console.log('\nRecord ATTUALI (verranno modificati):');
      console.log('─'.repeat(100));
      examples.forEach((record: any) => {
        console.log(
          `ID: ${record.id.toString().padEnd(6)} | ` +
          `Booking: ${record.activity_booking_id.toString().padEnd(8)} | ` +
          `Activity: ${record.activity_bookings.activity_id.toString().padEnd(8)} | ` +
          `PricingCat: ${record.pricing_category_id.toString().padEnd(8)} | ` +
          `Title: "${record.booked_title}" | ` +
          `Age: ${record.age}`
        );
      });
      console.log('─'.repeat(100));

      console.log('\nDopo l\'update diventeranno:');
      console.log('─'.repeat(100));
      examples.forEach((record: any) => {
        console.log(
          `ID: ${record.id.toString().padEnd(6)} | ` +
          `Booking: ${record.activity_booking_id.toString().padEnd(8)} | ` +
          `Activity: ${record.activity_bookings.activity_id.toString().padEnd(8)} | ` +
          `PricingCat: ${'166592'.padEnd(8)} | ` +
          `Title: "6 a 17 años" | ` +
          `Age: ${record.age}`
        );
      });
      console.log('─'.repeat(100));

      if (recordsToUpdate.length > 10) {
        console.log(`\n... e altri ${recordsToUpdate.length - 10} record`);
      }
      console.log();
    }

    // ========================================
    // VERIFICA 4: Controlla se esistono già record con il nuovo pricing_category_id
    // ========================================
    console.log('\n📋 VERIFICA 4: Record già esistenti con pricing_category_id 166592');
    console.log('-'.repeat(100));

    const { data: existingRecords, error: existingError } = await supabase
      .from('pricing_category_bookings')
      .select(`
        id,
        activity_booking_id,
        activity_bookings!inner(
          activity_id
        )
      `)
      .in('activity_bookings.activity_id', [217949, 216954, 220107])
      .eq('pricing_category_id', 166592);

    if (existingError) {
      console.log('❌ Errore nella verifica:', existingError.message);
    } else {
      const existingCount = existingRecords?.length || 0;
      if (existingCount > 0) {
        console.log(`⚠️  Trovati ${existingCount} record già con pricing_category_id = 166592`);
        console.log('   Questi NON verranno modificati (sono già aggiornati).\n');
      } else {
        console.log('✅ Nessun record già con pricing_category_id = 166592');
        console.log('   Tutti i record verranno aggiornati da zero.\n');
      }
    }

    // ========================================
    // VERIFICA 5: Dettagli delle activity
    // ========================================
    console.log('\n📋 VERIFICA 5: Informazioni sulle activity da aggiornare');
    console.log('-'.repeat(100));

    const { data: activities, error: actError } = await supabase
      .from('activities')
      .select('activity_id, title, description')
      .in('activity_id', [217949, 216954, 220107]);

    if (actError) {
      console.log('❌ Errore nel recupero activities:', actError.message);
    } else {
      if (activities && activities.length > 0) {
        activities.forEach(activity => {
          console.log(`\n   Activity ${activity.activity_id}:`);
          console.log(`      Title: ${activity.title || '(non disponibile)'}`);
          if (activity.description) {
            const desc = activity.description.length > 100
              ? activity.description.substring(0, 100) + '...'
              : activity.description;
            console.log(`      Description: ${desc}`);
          }
        });
        console.log();
      } else {
        console.log('⚠️  Nessuna activity trovata per gli ID specificati');
        console.log('   Verifica che gli activity_id siano corretti.\n');
      }
    }

    // ========================================
    // RIEPILOGO FINALE
    // ========================================
    console.log('\n' + '='.repeat(100));
    console.log('📊 RIEPILOGO VERIFICHE');
    console.log('='.repeat(100));

    if (!allChecksPass) {
      console.log('\n❌ ALCUNE VERIFICHE SONO FALLITE!');
      console.log('   Risolvi i problemi sopra indicati prima di procedere con l\'update.\n');
      return false;
    }

    if (!recordsToUpdate || recordsToUpdate.length === 0) {
      console.log('\n⚠️  NESSUN RECORD DA AGGIORNARE');
      console.log('   Verifica i criteri di selezione.\n');
      return false;
    }

    console.log('\n✅ TUTTE LE VERIFICHE SONO PASSATE!');
    console.log('\nPuoi procedere con l\'aggiornamento usando:');
    console.log('   npm run update-pricing-categories');
    console.log('\nOppure esegui manualmente lo script SQL:');
    console.log('   update-pricing-categories.sql');
    console.log('\n' + '='.repeat(100));

    return true;

  } catch (error: any) {
    console.error('\n❌ ERRORE CRITICO:', error.message);
    console.error(error);
    return false;
  }
}

// Esegui la verifica
verifyBeforeUpdate()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Errore fatale:', error);
    process.exit(1);
  });
