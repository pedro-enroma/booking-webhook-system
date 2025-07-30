// Script rapido per verificare che il fix timezone funzioni
import dotenv from 'dotenv';
import { OctoService } from './services/octoService';
import { supabase } from './config/supabase';

dotenv.config();

async function verifyFix() {
  const productId = process.argv[2] || '221226';
  const date = process.argv[3] || new Date().toISOString().split('T')[0];
  
  console.log('🔍 Verifica fix timezone');
  console.log(`📦 Prodotto: ${productId}`);
  console.log(`📅 Data: ${date}\n`);
  
  const octoService = new OctoService();
  
  try {
    // 1. Sincronizza
    console.log('1️⃣ Sincronizzazione in corso...');
    await octoService.syncAvailability(productId, date);
    
    // 2. Attendi un secondo
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 3. Verifica su database
    console.log('\n2️⃣ Verifica su database...');
    const { data, error } = await supabase
      .from('activity_availability')
      .select('local_date, local_time, availability_id')
      .eq('activity_id', productId)
      .eq('local_date', date)
      .order('local_time');
    
    if (error) throw error;
    
    if (!data || data.length === 0) {
      console.log('❌ Nessuna disponibilità trovata');
      return;
    }
    
    console.log(`\n✅ Trovate ${data.length} disponibilità:\n`);
    
    data.forEach(slot => {
      console.log(`   ${slot.local_time} - ${slot.availability_id}`);
    });
    
    console.log('\n💡 Verifica su Bokun che gli orari corrispondano!');
    console.log('   Se gli orari sono corretti, il fix funziona.');
    console.log('   Se sono spostati di 2 ore, c\'è ancora un problema.');
    
  } catch (error) {
    console.error('❌ Errore:', error);
  }
}

verifyFix().then(() => {
  console.log('\n✅ Verifica completata');
  process.exit(0);
}).catch(error => {
  console.error('💥 Errore:', error);
  process.exit(1);
});