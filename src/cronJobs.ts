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
  '243718',
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
    const startTime = Date.now();
    console.log('🔄 [CRON] Avvio sincronizzazione prodotti programmata');
    
    try {
      await octoService.syncProducts();
      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log(`✅ [CRON] Sincronizzazione prodotti completata in ${duration}s`);
    } catch (error: any) {
      console.error('❌ [CRON] Errore sincronizzazione prodotti:', error);
      console.error('Stack trace:', error.stack);
      
      // Log dettagliato dell'errore
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      }
    }
  });
  
  // 2. Sincronizza disponibilità per i PROSSIMI 2 ANNI - Una volta al giorno alle 02:00
  cron.schedule('0 2 * * *', async () => {
    const startTime = Date.now();
    console.log('🔄 [CRON] Avvio sincronizzazione disponibilità 2 anni');
    console.log(`📅 Data/ora avvio: ${new Date().toISOString()}`);
    
    try {
      await octoService.syncAllAvailability(730); // 2 anni = 730 giorni
      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log(`✅ [CRON] Sincronizzazione disponibilità 2 anni completata in ${duration}s`);
    } catch (error: any) {
      console.error('❌ [CRON] Errore sincronizzazione disponibilità 2 anni:', error);
      console.error('Stack trace:', error.stack);
      
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      }
    }
  });
  
  // 3. Sincronizza disponibilità per i PROSSIMI 30 GIORNI - Ogni 6 ore
  cron.schedule('0 */6 * * *', async () => {
    const startTime = Date.now();
    console.log('🔄 [CRON] Avvio sincronizzazione disponibilità 30 giorni');
    console.log(`📅 Data/ora avvio: ${new Date().toISOString()}`);
    console.log(`🚫 Prodotti esclusi: ${EXCLUDED_PRODUCTS.join(', ')}`);
    
    try {
      await octoService.syncAllAvailabilityExcept(30, EXCLUDED_PRODUCTS);
      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log(`✅ [CRON] Sincronizzazione disponibilità 30 giorni completata in ${duration}s`);
    } catch (error: any) {
      console.error('❌ [CRON] Errore sincronizzazione disponibilità 30 giorni:', error);
      console.error('Stack trace:', error.stack);
      
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      }
    }
  });
  
  // 4. Sincronizza disponibilità PRODOTTI PRIORITARI (10 giorni) - Ogni 2 ore
  cron.schedule('0 */2 * * *', async () => {
    const startTime = Date.now();
    console.log('🔄 [CRON] Avvio sincronizzazione prodotti prioritari');
    console.log(`📅 Data/ora avvio: ${new Date().toISOString()}`);
    console.log(`⭐ Prodotti prioritari: ${HIGH_PRIORITY_PRODUCTS.join(', ')}`);
    
    try {
      // Calcola date range
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 10);
      
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];
      
      console.log(`📆 Range date: ${startDateStr} - ${endDateStr}`);
      
      // Sincronizza ogni prodotto prioritario
      for (const productId of HIGH_PRIORITY_PRODUCTS) {
        try {
          console.log(`🎯 Sincronizzando prodotto prioritario ${productId}...`);
          
          // Usa il metodo ottimizzato che richiede l'intero range in una chiamata
          await octoService.syncAvailabilityRange(productId, startDateStr, endDateStr);
          
          console.log(`✅ Prodotto ${productId} sincronizzato`);
          
          // Pausa breve tra i prodotti
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error: any) {
          console.error(`⚠️ Errore sincronizzando prodotto prioritario ${productId}:`, error.message);
          // Continua con gli altri prodotti anche se uno fallisce
        }
      }
      
      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log(`✅ [CRON] Sincronizzazione prodotti prioritari completata in ${duration}s`);
    } catch (error: any) {
      console.error('❌ [CRON] Errore sincronizzazione prodotti prioritari:', error);
      console.error('Stack trace:', error.stack);
    }
  });
  
  // Test job - Esegui ogni 5 minuti per verificare che il cron stia funzionando
  if (process.env.NODE_ENV === 'development') {
    cron.schedule('*/5 * * * *', () => {
      console.log(`🏓 [CRON] Heartbeat - ${new Date().toISOString()} - Cron jobs attivi`);
    });
  }
  
  // Log riassuntivo
  console.log('✅ Cron jobs inizializzati:');
  console.log('   - Prodotti: ogni 6 ore');
  console.log('   - Disponibilità 2 anni: ogni giorno alle 02:00');
  console.log('   - Disponibilità 30 giorni: ogni 6 ore');
  console.log('   - Prodotti prioritari: ogni 2 ore');
  
  if (process.env.NODE_ENV === 'development') {
    console.log('   - Heartbeat: ogni 5 minuti (solo development)');
  }
  
  // Funzione helper per test manuale
  return {
    testSyncProducts: () => octoService.syncProducts(),
    testSyncAllAvailability: (days: number) => octoService.syncAllAvailability(days),
    testSyncProductAvailability: (productId: string, startDate: string, endDate: string) => 
      octoService.syncAvailabilityRange(productId, startDate, endDate)
  };
}