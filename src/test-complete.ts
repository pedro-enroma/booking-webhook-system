// Test completo: sincronizzazione + vista Roma
import dotenv from 'dotenv';
import { OctoService } from './services/octoService';
import { supabase } from './config/supabase';

dotenv.config();

async function testCompleteSystem() {
  const productId = process.argv[2] || '221226';
  const testDate = process.argv[3] || '2025-08-12';
  
  console.log('🧪 TEST COMPLETO SISTEMA');
  console.log('========================\n');
  
  const octoService = new OctoService();
  
  try {
    // 1. SINCRONIZZA DISPONIBILITÀ
    console.log('1️⃣ SINCRONIZZAZIONE DISPONIBILITÀ');
    console.log(`📦 Prodotto: ${productId}`);
    console.log(`📅 Data: ${testDate}\n`);
    
    await octoService.syncAvailability(productId, testDate);
    console.log('✅ Sincronizzazione completata\n');
    
    // Attendi un secondo per assicurarsi che i dati siano salvati
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 2. VERIFICA DATI ORIGINALI (tabella base)
    console.log('2️⃣ VERIFICA DATI ORIGINALI (activity_availability)');
    const { data: originalData, error: error1 } = await supabase
      .from('activity_availability')
      .select('availability_id, local_date, local_time, vacancy_available, status')
      .eq('activity_id', productId)
      .eq('local_date', testDate)
      .order('local_time');
    
    if (error1) throw error1;
    
    if (!originalData || originalData.length === 0) {
      console.log('❌ Nessuna disponibilità trovata nella tabella base');
      return;
    }
    
    console.log(`📊 Trovate ${originalData.length} disponibilità:\n`);
    
    originalData.forEach(slot => {
      console.log(`   ${slot.local_time} - Posti: ${slot.vacancy_available} - Status: ${slot.status}`);
    });
    
    console.log('\n');
    
    // 3. VERIFICA VISTA ROMA (con ore aggiunte)
    console.log('3️⃣ VERIFICA VISTA ROMA (activity_availability_rome)');
    const { data: romeData, error: error2 } = await supabase
      .from('activity_availability_rome')
      .select('availability_id, local_date, local_time, local_date_rome, local_time_rome, vacancy_available, status')
      .eq('activity_id', productId)
      .eq('local_date', testDate)
      .order('local_time');
    
    if (error2) {
      console.log('❌ Errore leggendo vista Roma:', error2);
      console.log('   Assicurati di aver creato la vista su Supabase!');
      return;
    }
    
    if (!romeData || romeData.length === 0) {
      console.log('❌ Nessuna disponibilità trovata nella vista Roma');
      return;
    }
    
    console.log(`📊 Vista Roma (stesso numero di record: ${romeData.length}):\n`);
    
    romeData.forEach(slot => {
      const dateChanged = slot.local_date !== slot.local_date_rome ? ' ⚠️ (+1 giorno)' : '';
      console.log(`   Bokun: ${slot.local_time} → Roma: ${slot.local_time_rome}${dateChanged} - Posti: ${slot.vacancy_available}`);
    });
    
    console.log('\n');
    
    // 4. CONFRONTO E VALIDAZIONE
    console.log('4️⃣ VALIDAZIONE CONVERSIONE');
    
    const month = new Date(testDate).getMonth();
    const expectedOffset = (month >= 3 && month <= 9) ? 2 : 1; // apr-ott = +2, resto = +1
    const season = expectedOffset === 2 ? 'ESTATE' : 'INVERNO';
    
    console.log(`📅 Mese: ${month + 1} → ${season} → Offset atteso: +${expectedOffset} ore\n`);
    
    let allCorrect = true;
    
    for (let i = 0; i < Math.min(3, romeData.length); i++) { // Verifica primi 3 slot
      const slot = romeData[i];
      const originalHour = parseInt(slot.local_time.split(':')[0]);
      const romeHour = parseInt(slot.local_time_rome.split(':')[0]);
      
      let expectedRomeHour = (originalHour + expectedOffset) % 24;
      const actualOffset = romeHour >= originalHour ? romeHour - originalHour : (24 + romeHour - originalHour);
      
      const isCorrect = actualOffset === expectedOffset;
      allCorrect = allCorrect && isCorrect;
      
      console.log(`   ${isCorrect ? '✅' : '❌'} ${slot.local_time} + ${expectedOffset}h = ${slot.local_time_rome} ${isCorrect ? '' : `(atteso: ${String(expectedRomeHour).padStart(2, '0')}:00)`}`);
    }
    
    console.log('\n');
    
    // 5. RISULTATO FINALE
    console.log('5️⃣ RISULTATO TEST');
    if (allCorrect) {
      console.log('✅ TUTTO FUNZIONA CORRETTAMENTE!');
      console.log('   - Sincronizzazione: OK');
      console.log('   - Dati salvati: OK');
      console.log('   - Vista Roma: OK');
      console.log('   - Conversione ore: OK');
    } else {
      console.log('❌ CI SONO PROBLEMI:');
      console.log('   - Controlla la vista SQL');
      console.log('   - Verifica la logica di conversione');
    }
    
    // 6. SUGGERIMENTO QUERY
    console.log('\n📝 QUERY DI ESEMPIO PER LA TUA APP:');
    console.log('```sql');
    console.log(`SELECT * FROM activity_availability_rome`);
    console.log(`WHERE activity_id = '${productId}'`);
    console.log(`  AND local_date_rome >= CURRENT_DATE`);
    console.log(`  AND available = true`);
    console.log(`ORDER BY local_date_rome, local_time_rome;`);
    console.log('```');
    
  } catch (error: any) {
    console.error('❌ Errore durante il test:', error);
    
    if (error.message?.includes('activity_availability_rome')) {
      console.log('\n💡 SUGGERIMENTO:');
      console.log('   Sembra che la vista non esista. Crea la vista su Supabase:');
      console.log('   Dashboard → SQL Editor → Esegui il codice SQL della vista');
    }
  }
}

// Esegui il test
testCompleteSystem().then(() => {
  console.log('\n✅ Test completato');
  process.exit(0);
}).catch((error) => {
  console.error('💥 Errore fatale:', error);
  process.exit(1);
});