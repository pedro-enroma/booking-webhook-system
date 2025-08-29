import cron from 'node-cron';
import { OctoService } from './services/octoService';
import { supabase } from './config/supabase';

// Prodotti con diverse priorità
const PRIORITY_PRODUCTS = ['216954', '217949', '220107', '840868', '841414', '841874', '892386', '901938', '901972'];
const SECONDARY_PRODUCTS = ['219901', '220614', '220617', '221221', '221226', '222980', '265854', '734833', '812355', '820657', '852605', '856126', '898759', '901369', '901961', '903596', '923099', '926058', '952868', '1038597'];
const EXCLUDED_PRODUCTS = ['243718', '243709', '219735', '217930'];

// Tracking delle esecuzioni
export const cronExecutions: { [key: string]: { 
  start: Date, 
  end?: Date, 
  success?: boolean, 
  error?: string,
  itemsProcessed?: number,
  duration?: number 
}} = {};

function logCronStart(jobName: string, jobId: string) {
  cronExecutions[jobId] = { start: new Date() };
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔄 [CRON ${jobId}] ${jobName}`);
  console.log(`⏰ Start: ${new Date().toISOString()}`);
  console.log(`${'='.repeat(60)}`);
}

function logCronEnd(jobId: string, itemsProcessed: number, success: boolean, error?: any) {
  const end = new Date();
  const duration = (end.getTime() - cronExecutions[jobId].start.getTime()) / 1000;
  
  cronExecutions[jobId] = {
    ...cronExecutions[jobId],
    end,
    success,
    duration,
    itemsProcessed,
    error: error?.message
  };
  
  if (success) {
    console.log(`✅ [CRON ${jobId}] Completato`);
    console.log(`📊 Items: ${itemsProcessed} | ⏱️ Durata: ${duration}s`);
  } else {
    console.error(`❌ [CRON ${jobId}] Fallito`);
    console.error(`❌ Errore: ${error?.message}`);
  }
  console.log(`${'='.repeat(60)}\n`);
}

export function initializeCronJobs() {
  const octoService = new OctoService();
  
  console.log('⏰ Inizializzazione cron jobs ottimizzati...');
  
  // 1. Sincronizza PRODOTTI una volta al giorno alle 1:00 AM
  cron.schedule('0 1 * * *', async () => {
    const jobId = `products-${Date.now()}`;
    logCronStart('Sincronizzazione prodotti', jobId);
    
    try {
      await octoService.syncProducts();
      logCronEnd(jobId, 1, true);
    } catch (error) {
      logCronEnd(jobId, 0, false, error);
    }
  });
  
  // 2. PRODOTTI PRIORITARI - Ogni 4 ore (15 giorni) - OTTIMIZZATO
  cron.schedule('0 */4 * * *', async () => {
    const jobId = `priority-15d-${Date.now()}`;
    logCronStart('Prodotti prioritari - 15 giorni', jobId);
    
    try {
      const result = await octoService.syncProductListForDays(
        PRIORITY_PRODUCTS, 
        15, 
        'priority-15d'
      );
      logCronEnd(jobId, result.success, true);
    } catch (error) {
      logCronEnd(jobId, 0, false, error);
    }
  });
  
  // 3. PRODOTTI PRIORITARI - Ogni giorno alle 2:00 AM (60 giorni) - OTTIMIZZATO
  cron.schedule('0 2 * * *', async () => {
    const jobId = `priority-60d-${Date.now()}`;
    logCronStart('Prodotti prioritari - 60 giorni', jobId);
    
    try {
      const result = await octoService.syncProductListForDays(
        PRIORITY_PRODUCTS, 
        60, 
        'priority-60d'
      );
      logCronEnd(jobId, result.success, true);
    } catch (error) {
      logCronEnd(jobId, 0, false, error);
    }
  });
  
  // 4. PRODOTTI SECONDARI - Ogni 12 ore (15 giorni) - OTTIMIZZATO
  cron.schedule('0 */12 * * *', async () => {
    const jobId = `secondary-15d-${Date.now()}`;
    logCronStart('Prodotti secondari - 15 giorni', jobId);
    
    try {
      const result = await octoService.syncProductListForDays(
        SECONDARY_PRODUCTS, 
        15, 
        'secondary-15d'
      );
      logCronEnd(jobId, result.success, true);
    } catch (error) {
      logCronEnd(jobId, 0, false, error);
    }
  });
  
  // 5. PRODOTTI SECONDARI - Ogni giorno alle 4:00 AM (30 giorni) - OTTIMIZZATO
  cron.schedule('0 4 * * *', async () => {
    const jobId = `secondary-30d-${Date.now()}`;
    logCronStart('Prodotti secondari - 30 giorni', jobId);
    
    try {
      const result = await octoService.syncProductListForDays(
        SECONDARY_PRODUCTS, 
        30, 
        'secondary-30d'
      );
      logCronEnd(jobId, result.success, true);
    } catch (error) {
      logCronEnd(jobId, 0, false, error);
    }
  });
  
  // 6. TUTTI GLI ALTRI PRODOTTI - Ogni giorno alle 6:00 AM (30 giorni)
  cron.schedule('0 6 * * *', async () => {
    const jobId = `others-30d-${Date.now()}`;
    logCronStart('Altri prodotti - 30 giorni', jobId);
    
    try {
      await octoService.syncAllAvailabilityExcept(30, [
        ...EXCLUDED_PRODUCTS,
        ...PRIORITY_PRODUCTS,
        ...SECONDARY_PRODUCTS
      ]);
      
      logCronEnd(jobId, 30, true);
    } catch (error) {
      logCronEnd(jobId, 0, false, error);
    }
  });
  
  // 7. TUTTI I PRODOTTI (tranne esclusi) - Ogni venerdì alle 6:00 AM (90 giorni)
  cron.schedule('0 6 * * 5', async () => {
    const jobId = `all-products-90d-${Date.now()}`;
    logCronStart('Tutti i prodotti - 90 giorni (venerdì)', jobId);
    
    try {
      // Sincronizza TUTTI i prodotti per i prossimi 90 giorni
      // Escludi solo i 4 prodotti nella blacklist
      await octoService.syncAllAvailabilityExcept(90, EXCLUDED_PRODUCTS);
      
      logCronEnd(jobId, 90, true);
    } catch (error) {
      logCronEnd(jobId, 0, false, error);
    }
  });
  
  // 8. NUOVO: Health check ogni 30 minuti per verificare stato sync
  cron.schedule('*/30 * * * *', async () => {
    try {
      const now = new Date();
      const running = Object.values(cronExecutions).filter(
        e => e.start && !e.end && (now.getTime() - e.start.getTime()) > 3600000 // Running da più di 1 ora
      );
      
      if (running.length > 0) {
        console.log(`⚠️ [HEALTH] ${running.length} job in esecuzione da più di 1 ora`);
        running.forEach(job => {
          const minutes = Math.round((now.getTime() - job.start.getTime()) / 60000);
          console.log(`   - Running da ${minutes} minuti`);
        });
      }
      
      // Controlla prodotti non sincronizzati
      const { data: staleProducts } = await supabase
        .from('activity_availability')
        .select('activity_id')
        .lt('updated_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .limit(10);
      
      if (staleProducts && staleProducts.length > 0) {
        console.log(`⚠️ [HEALTH] ${staleProducts.length} prodotti non aggiornati da 7+ giorni`);
      }
      
    } catch (error) {
      console.error('❌ [HEALTH] Errore health check:', error);
    }
  });
  
  // 9. NUOVO: Cleanup checkpoint vecchi ogni domenica
  cron.schedule('0 0 * * 0', async () => {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      await supabase
        .from('sync_checkpoints')
        .delete()
        .lt('updated_at', thirtyDaysAgo.toISOString());
      
      console.log('🧹 [CLEANUP] Checkpoint vecchi puliti');
    } catch (error) {
      console.error('❌ [CLEANUP] Errore pulizia:', error);
    }
  });
  
  console.log('✅ Cron jobs ottimizzati inizializzati:');
  console.log('   - Prodotti: ogni giorno alle 1:00 AM');
  console.log('   - Prioritari: ogni 4 ore (15gg) + 2:00 AM (60gg) [BATCH]');
  console.log('   - Secondari: ogni 12 ore (15gg) + 4:00 AM (30gg) [BATCH]');
  console.log('   - Altri: 6:00 AM (30gg) + venerdì (90gg) [CHECKPOINT]');
  console.log('   - Health check: ogni 30 minuti');
  console.log('   - Cleanup: ogni domenica');
  console.log(`   - Esclusi: ${EXCLUDED_PRODUCTS.length} prodotti`);
}

// Funzione per forzare sincronizzazione manuale
export async function forceSyncProducts(productIds: string[], days: number): Promise<void> {
  const octoService = new OctoService();
  console.log(`🔧 Sincronizzazione manuale: ${productIds.length} prodotti per ${days} giorni`);
  
  try {
    const result = await octoService.syncProductListForDays(productIds, days, 'manual');
    console.log(`✅ Completato: ${result.success} successi, ${result.failed} falliti`);
  } catch (error) {
    console.error('❌ Errore sync manuale:', error);
    throw error;
  }
}

export function getCronStatus() {
  const now = new Date();
  const executions = Object.entries(cronExecutions)
    .map(([id, data]) => ({
      id,
      ...data,
      isRunning: data.start && !data.end,
      ageMinutes: Math.round((now.getTime() - data.start.getTime()) / 60000)
    }))
    .sort((a, b) => b.start.getTime() - a.start.getTime());
  
  return {
    executions,
    summary: {
      total: executions.length,
      running: executions.filter(e => e.isRunning).length,
      failed: executions.filter(e => !e.success && e.end).length,
      lastRun: executions[0]
    }
  };
}