// test-sync-optimized.ts
// Script per testare le ottimizzazioni
import dotenv from 'dotenv';
import { OctoService } from './services/octoService';
import { supabase } from './config/supabase';
import { forceSyncProducts } from './cronJobs';

dotenv.config();

// Test prodotto specifico (217949 che si fermava)
const TEST_PRODUCT = '217949';
const PRIORITY_PRODUCTS = ['216954', '217949', '220107'];

async function testSpecificProduct() {
  console.log('\n🧪 TEST 1: Prodotto Specifico che si fermava');
  console.log('=========================================');
  
  const octoService = new OctoService();
  
  try {
    // Test sync per 60 giorni
    console.log(`Testing ${TEST_PRODUCT} per 60 giorni...`);
    
    const startTime = Date.now();
    const result = await octoService.syncProductListForDays(
      [TEST_PRODUCT], 
      60, 
      'test-60d'
    );
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`✅ Completato in ${duration}s`);
    console.log(`📊 Risultato: ${result.success} successi, ${result.failed} falliti`);
    
    // Verifica nel database
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 60);
    
    const { count } = await supabase
      .from('activity_availability')
      .select('*', { count: 'exact', head: true })
      .eq('activity_id', TEST_PRODUCT)
      .gte('local_date', new Date().toISOString().split('T')[0])
      .lte('local_date', endDate.toISOString().split('T')[0]);
    
    console.log(`📅 Disponibilità salvate nel DB: ${count || 0}`);
    
    // Verifica l'ultima data sincronizzata
    const { data: lastDate } = await supabase
      .from('activity_availability')
      .select('local_date')
      .eq('activity_id', TEST_PRODUCT)
      .order('local_date', { ascending: false })
      .limit(1)
      .single();
    
    if (lastDate) {
      const daysDiff = Math.ceil(
        (new Date(lastDate.local_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );
      console.log(`📆 Ultima data sincronizzata: ${lastDate.local_date} (${daysDiff} giorni nel futuro)`);
      
      if (daysDiff >= 59) {
        console.log('✅ TEST PASSATO: Sincronizzati tutti i 60 giorni!');
      } else {
        console.log(`⚠️ TEST PARZIALE: Solo ${daysDiff} giorni sincronizzati su 60`);
      }
    }
    
  } catch (error) {
    console.error('❌ Test fallito:', error);
  }
}

async function testBatchProcessing() {
  console.log('\n🧪 TEST 2: Batch Processing (3 prodotti in parallelo)');
  console.log('====================================================');
  
  const octoService = new OctoService();
  
  try {
    console.log(`Testing ${PRIORITY_PRODUCTS.length} prodotti per 15 giorni...`);
    
    const startTime = Date.now();
    const result = await octoService.syncProductListForDays(
      PRIORITY_PRODUCTS, 
      15, 
      'test-batch'
    );
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`✅ Completato in ${duration}s`);
    console.log(`📊 Risultato: ${result.success} successi, ${result.failed} falliti`);
    
    // Tempo medio per prodotto
    const avgTime = (parseFloat(duration) / PRIORITY_PRODUCTS.length).toFixed(2);
    console.log(`⏱️ Tempo medio per prodotto: ${avgTime}s`);
    
    if (parseFloat(duration) < PRIORITY_PRODUCTS.length * 15) {
      console.log('✅ TEST PASSATO: Batch processing più veloce del sequenziale!');
    }
    
  } catch (error) {
    console.error('❌ Test fallito:', error);
  }
}

async function testCheckpointSystem() {
  console.log('\n🧪 TEST 3: Sistema Checkpoint');
  console.log('============================');
  
  try {
    // Verifica se la tabella checkpoint esiste
    const { data, error } = await supabase
      .from('sync_checkpoints')
      .select('*')
      .limit(1);
    
    if (error && error.code === '42P01') {
      console.log('⚠️ Tabella checkpoint non esiste');
      console.log('📝 Esegui lo script SQL per crearla su Supabase');
      return;
    }
    
    console.log('✅ Tabella checkpoint trovata');
    
    // Verifica checkpoint per il prodotto test
    const { data: checkpoint } = await supabase
      .from('sync_checkpoints')
      .select('*')
      .eq('product_id', TEST_PRODUCT)
      .eq('job_type', 'test-60d')
      .single();
    
    if (checkpoint) {
      console.log(`✅ Checkpoint trovato per ${TEST_PRODUCT}:`);
      console.log(`   - Ultima sync: ${checkpoint.last_synced_date}`);
      console.log(`   - Aggiornato: ${checkpoint.updated_at}`);
      
      // Test resume da checkpoint
      console.log('\n📝 Test resume da checkpoint...');
      const octoService = new OctoService();
      
      const startTime = Date.now();
      const result = await octoService.syncProductListForDays(
        [TEST_PRODUCT], 
        60, 
        'test-60d'
      );
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      
      if (parseFloat(duration) < 5) {
        console.log(`✅ Resume veloce (${duration}s) - checkpoint funziona!`);
      } else {
        console.log(`⚠️ Resume lento (${duration}s) - potrebbe risincronizzare tutto`);
      }
    } else {
      console.log('ℹ️ Nessun checkpoint trovato (prima esecuzione)');
    }
    
  } catch (error) {
    console.error('❌ Test checkpoint fallito:', error);
  }
}

async function testRangeAPI() {
  console.log('\n🧪 TEST 4: Range API (se supportato)');
  console.log('===================================');
  
  const octoService = new OctoService();
  
  try {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 7);
    
    console.log(`Testing range API per ${TEST_PRODUCT}...`);
    console.log(`Range: ${startDate.toISOString().split('T')[0]} → ${endDate.toISOString().split('T')[0]}`);
    
    const startTime = Date.now();
    const slots = await octoService.syncAvailabilityOptimized(
      TEST_PRODUCT,
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    );
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`📊 ${slots} slot sincronizzati in ${duration}s`);
    
    if (parseFloat(duration) < 3) {
      console.log('✅ Range API funziona! Molto più veloce');
    } else {
      console.log('ℹ️ Probabilmente usa fallback giornaliero');
    }
    
  } catch (error) {
    console.error('❌ Test range API fallito:', error);
  }
}

async function showSyncStatus() {
  console.log('\n📊 STATO SINCRONIZZAZIONE ATTUALE');
  console.log('=================================');
  
  try {
    // Prodotti prioritari
    const priorityList = ['216954', '217949', '220107', '840868', '841414', '841874', '892386', '901938', '901972'];
    
    for (const productId of priorityList.slice(0, 3)) {
      const { data: product } = await supabase
        .from('activities')
        .select('title')
        .eq('activity_id', productId)
        .single();
      
      const { data: lastAvailability } = await supabase
        .from('activity_availability')
        .select('local_date')
        .eq('activity_id', productId)
        .gte('local_date', new Date().toISOString().split('T')[0])
        .order('local_date', { ascending: false })
        .limit(1)
        .single();
      
      const { count } = await supabase
        .from('activity_availability')
        .select('*', { count: 'exact', head: true })
        .eq('activity_id', productId)
        .gte('local_date', new Date().toISOString().split('T')[0]);
      
      if (lastAvailability) {
        const daysFuture = Math.ceil(
          (new Date(lastAvailability.local_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
        );
        
        console.log(`\n📦 ${productId}: ${product?.title || 'N/A'}`);
        console.log(`   - Slot futuri: ${count || 0}`);
        console.log(`   - Ultima data: ${lastAvailability.local_date} (${daysFuture} giorni)`);
        
        if (daysFuture < 15) {
          console.log(`   ⚠️ ATTENZIONE: Solo ${daysFuture} giorni sincronizzati!`);
        } else if (daysFuture < 60) {
          console.log(`   ⚠️ Sincronizzato solo parzialmente (dovrebbero essere 60 giorni)`);
        } else {
          console.log(`   ✅ Sincronizzazione OK`);
        }
      } else {
        console.log(`\n📦 ${productId}: NESSUNA DISPONIBILITÀ FUTURA`);
      }
    }
    
  } catch (error) {
    console.error('❌ Errore recupero stato:', error);
  }
}

// Menu principale
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  console.clear();
  console.log('🔧 TEST SISTEMA SINCRONIZZAZIONE OTTIMIZZATO');
  console.log('============================================\n');
  
  switch (command) {
    case 'product':
      await testSpecificProduct();
      break;
      
    case 'batch':
      await testBatchProcessing();
      break;
      
    case 'checkpoint':
      await testCheckpointSystem();
      break;
      
    case 'range':
      await testRangeAPI();
      break;
      
    case 'status':
      await showSyncStatus();
      break;
      
    case 'all':
      await testSpecificProduct();
      await testBatchProcessing();
      await testCheckpointSystem();
      await testRangeAPI();
      await showSyncStatus();
      break;
      
    case 'fix':
      // Forza risincronizzazione del prodotto problematico
      console.log('🔧 Forzando risincronizzazione prodotti prioritari...');
      await forceSyncProducts(
        ['216954', '217949', '220107', '840868', '841414', '841874', '892386', '901938', '901972'],
        60
      );
      break;
      
    default:
      console.log('📚 COMANDI DISPONIBILI:');
      console.log('========================\n');
      console.log('npm run test-sync product    - Test prodotto specifico (217949)');
      console.log('npm run test-sync batch      - Test batch processing');
      console.log('npm run test-sync checkpoint - Test sistema checkpoint');
      console.log('npm run test-sync range      - Test range API');
      console.log('npm run test-sync status     - Mostra stato attuale');
      console.log('npm run test-sync all        - Esegui tutti i test');
      console.log('npm run test-sync fix        - Forza risincronizzazione prioritari');
      break;
  }
}

// Esegui
main().then(() => {
  console.log('\n✅ Test completato');
  process.exit(0);
}).catch(error => {
  console.error('\n💥 Errore:', error);
  process.exit(1);
});