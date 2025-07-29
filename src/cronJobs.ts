import cron from 'node-cron';
import { OctoService } from './services/octoService';

// Lista dei prodotti che richiedono sincronizzazione più frequente
const HIGH_PRIORITY_PRODUCTS = [
  '217949',  // Sostituisci con i tuoi 5-6 prodotti prioritari
  '220107',
  '689976',
  // Aggiungi altri prodotti qui
];

// Lista dei prodotti da escludere dalla sincronizzazione ogni 6 ore
const EXCLUDED_PRODUCTS: string[] = [
    '243718',  // Sostituisci con i tuoi 5-6 prodotti prioritari
    '243709',
    '219735',
    '217930',    
  // Aggiungi qui i prodotti da escludere
];

export function initializeCronJobs() {
  const octoService = new OctoService();
  
  console.log('⏰ Inizializzazione cron jobs...');
  
  // 1. Sincronizza PRODOTTI ogni 6 ore (00:00, 06:00, 12:00, 18:00)
  cron.schedule('0 */6 * * *', async () => {
    console.log('🔄 [CRON] Avvio sincronizzazione prodotti programmata');
    try {
      await octoService.syncProducts();
      console.log('✅ [CRON] Sincronizzazione prodotti completata');
    } catch (error) {
      console.error('❌ [CRON] Errore sincronizzazione prodotti:', error);
    }
  });
  
  // 2. Sincronizza disponibilità per i PROSSIMI 2 ANNI - Una volta al giorno alle 02:00
  cron.schedule('0 2 * * *', async () => {
    console.log('🔄 [CRON] Avvio sincronizzazione disponibilità 2 anni');
    try {
      await octoService.syncAllAvailability(730); // 2 anni = 730 giorni
      console.log('✅ [CRON] Sincronizzazione disponibilità 2 anni completata');
    } catch (error) {
      console.error('❌ [CRON] Errore sincronizzazione disponibilità 2 anni:', error);
    }
  });
  
  // 3. Sincronizza disponibilità per i PROSSIMI 30 GIORNI - Ogni 6 ore
  cron.schedule('0 */6 * * *', async () => {
    console.log('🔄 [CRON] Avvio sincronizzazione disponibilità 30 giorni');
    try {
      await octoService.syncAllAvailabilityExcept(30, EXCLUDED_PRODUCTS);
      console.log('✅ [CRON] Sincronizzazione disponibilità 30 giorni completata');
    } catch (error) {
      console.error('❌ [CRON] Errore sincronizzazione disponibilità 30 giorni:', error);
    }
  });
  
  // 4. Sincronizza disponibilità PRODOTTI PRIORITARI (10 giorni) - Ogni 2 ore
  cron.schedule('0 */2 * * *', async () => {
    console.log('🔄 [CRON] Avvio sincronizzazione prodotti prioritari');
    try {
      for (const productId of HIGH_PRIORITY_PRODUCTS) {
        for (let i = 0; i < 10; i++) {
          const date = new Date();
          date.setDate(date.getDate() + i);
          const dateStr = date.toISOString().split('T')[0];
          
          await octoService.syncAvailability(productId, dateStr);
          
          // Pausa breve tra le chiamate
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      console.log('✅ [CRON] Sincronizzazione prodotti prioritari completata');
    } catch (error) {
      console.error('❌ [CRON] Errore sincronizzazione prodotti prioritari:', error);
    }
  });
  
  // Log riassuntivo
  console.log('✅ Cron jobs inizializzati:');
  console.log('   - Prodotti: ogni 6 ore');
  console.log('   - Disponibilità 2 anni: ogni giorno alle 02:00');
  console.log('   - Disponibilità 30 giorni: ogni 6 ore');
  console.log('   - Prodotti prioritari: ogni 2 ore');
}