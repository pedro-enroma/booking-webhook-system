// Test sincronizzazione di massa con verifica vista Roma
import dotenv from 'dotenv';
import { OctoService } from './services/octoService';
import { supabase } from './config/supabase';

dotenv.config();

async function testMassSync() {
  const days = parseInt(process.argv[2]) || 7;
  const limitProducts = parseInt(process.argv[3]) || 5; // Limita a N prodotti per test
  
  console.log('🧪 TEST SINCRONIZZAZIONE DI MASSA');
  console.log('==================================\n');
  console.log(`📅 Giorni da sincronizzare: ${days}`);
  console.log(`📦 Prodotti da testare: ${limitProducts}\n`);
  
  const octoService = new OctoService();
  
  try {
    // 1. SELEZIONA PRODOTTI DI TEST
    console.log('1️⃣ SELEZIONE PRODOTTI DI TEST');
    
    const { data: products, error: productsError } = await supabase
      .from('activities')
      .select('activity_id, title')
      .limit(limitProducts);
    
    if (productsError) throw productsError;
    if (!products || products.length === 0) {
      console.log('❌ Nessun prodotto trovato. Esegui prima: npm run test-sync products');
      return;
    }
    
    console.log(`📦 Prodotti selezionati:`);
    products.forEach(p => console.log(`   - ${p.activity_id}: ${p.title}`));
    console.log('\n');
    
    // 2. SINCRONIZZA DISPONIBILITÀ
    console.log('2️⃣ SINCRONIZZAZIONE DISPONIBILITÀ');
    
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    console.log(`📅 Range: ${startDateStr} → ${endDateStr}\n`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const product of products) {
      try {
        process.stdout.write(`   Sincronizzando ${product.activity_id}...`);
        await octoService.syncAvailabilityRange(product.activity_id, startDateStr, endDateStr);
        successCount++;
        console.log(' ✅');
      } catch (error: any) {
        errorCount++;
        console.log(' ❌');
        if (error.response?.status === 404) {
          console.log(`     → Prodotto non trovato su OCTO API`);
        } else {
          console.log(`     → Errore: ${error.message}`);
        }
      }
    }
    
    console.log(`\n📊 Risultato: ${successCount} successi, ${errorCount} errori\n`);
    
    // Attendi che i dati siano salvati
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 3. VERIFICA DATI SALVATI
    console.log('3️⃣ VERIFICA DATI SALVATI');
    
    const { count: totalCount } = await supabase
      .from('activity_availability')
      .select('*', { count: 'exact', head: true })
      .gte('local_date', startDateStr)
      .lte('local_date', endDateStr);
    
    console.log(`📊 Totale disponibilità salvate nel periodo: ${totalCount || 0}\n`);
    
    // 4. TEST VISTA ROMA (esempio con primo prodotto)
    if (successCount > 0) {
      console.log('4️⃣ TEST VISTA ROMA (primo prodotto)');
      
      const testProduct = products[0];
      const { data: romeData, error: romeError } = await supabase
        .from('activity_availability_rome')
        .select('local_date, local_time, local_date_rome, local_time_rome, vacancy_available')
        .eq('activity_id', testProduct.activity_id)
        .eq('local_date', startDateStr)
        .order('local_time')
        .limit(3);
      
      if (romeError) {
        console.log('❌ Errore vista Roma:', romeError.message);
      } else if (romeData && romeData.length > 0) {
        console.log(`📦 ${testProduct.title}`);
        console.log(`📅 Data: ${startDateStr}\n`);
        
        romeData.forEach(slot => {
          console.log(`   Bokun: ${slot.local_time} → Roma: ${slot.local_time_rome} (${slot.vacancy_available} posti)`);
        });
      } else {
        console.log('   Nessuna disponibilità per oggi');
      }
    }
    
    // 5. STATISTICHE FINALI
    console.log('\n5️⃣ STATISTICHE FINALI');
    
    // Conta prodotti con disponibilità
    const { data: productsWithAvail } = await supabase
      .from('activity_availability')
      .select('activity_id')
      .gte('local_date', startDateStr)
      .lte('local_date', endDateStr);
    
    const uniqueProducts = new Set(productsWithAvail?.map(a => a.activity_id) || []);
    
    console.log(`📊 Prodotti con disponibilità: ${uniqueProducts.size}`);
    console.log(`📊 Media slot per prodotto: ${totalCount && uniqueProducts.size ? Math.round(totalCount / uniqueProducts.size) : 0}`);
    
    // 6. QUERY UTILI
    console.log('\n📝 QUERY UTILI PER VERIFICARE:');
    console.log('\n-- Disponibilità di oggi con orari Roma:');
    console.log(`SELECT activity_id, local_time, local_time_rome, vacancy_available`);
    console.log(`FROM activity_availability_rome`);
    console.log(`WHERE local_date_rome = CURRENT_DATE`);
    console.log(`ORDER BY activity_id, local_time_rome;`);
    
    console.log('\n-- Prodotti senza disponibilità:');
    console.log(`SELECT a.activity_id, a.title`);
    console.log(`FROM activities a`);
    console.log(`LEFT JOIN activity_availability av ON a.activity_id = av.activity_id`);
    console.log(`WHERE av.activity_id IS NULL;`);
    
  } catch (error: any) {
    console.error('❌ Errore durante il test:', error);
  }
}

// Esegui il test
testMassSync().then(() => {
  console.log('\n✅ Test completato');
  process.exit(0);
}).catch((error) => {
  console.error('💥 Errore fatale:', error);
  process.exit(1);
});