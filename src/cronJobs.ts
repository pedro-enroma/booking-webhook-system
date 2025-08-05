import cron from 'node-cron';
import { OctoService } from './services/octoService';

// Prodotti con diverse priorità
const PRIORITY_PRODUCTS = ['217949', '220107', '216954', '841874'];
const SECONDARY_PRODUCTS = ['221221', '812355', '221226'];
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
  
  console.log('⏰ Inizializzazione cron jobs...');
  
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
  
  // 2. PRODOTTI PRIORITARI - Ogni 4 ore
  cron.schedule('0 */4 * * *', async () => {
    const jobId = `priority-15d-${Date.now()}`;
    logCronStart('Prodotti prioritari - 15 giorni', jobId);
    
    try {
      let totalSynced = 0;
      const totalToSync = PRIORITY_PRODUCTS.length * 15;
      
      for (const productId of PRIORITY_PRODUCTS) {
        for (let i = 0; i < 15; i++) {
          const date = new Date();
          date.setDate(date.getDate() + i);
          const dateStr = date.toISOString().split('T')[0];
          
          totalSynced++;
          if (totalSynced % 20 === 0 || totalSynced === 1) {
            console.log(`📈 Progress: ${totalSynced}/${totalToSync} (${Math.round(totalSynced/totalToSync*100)}%)`);
          }
          
          await octoService.syncAvailability(productId, dateStr);
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      logCronEnd(jobId, totalSynced, true);
    } catch (error) {
      logCronEnd(jobId, 0, false, error);
    }
  });
  
  // 3. PRODOTTI PRIORITARI - Ogni giorno alle 2:00 AM (60 giorni)
  cron.schedule('0 2 * * *', async () => {
    const jobId = `priority-60d-${Date.now()}`;
    logCronStart('Prodotti prioritari - 60 giorni', jobId);
    
    try {
      let totalSynced = 0;
      const totalToSync = PRIORITY_PRODUCTS.length * 60;
      
      for (const productId of PRIORITY_PRODUCTS) {
        for (let i = 0; i < 60; i++) {
          const date = new Date();
          date.setDate(date.getDate() + i);
          const dateStr = date.toISOString().split('T')[0];
          
          totalSynced++;
          if (totalSynced % 50 === 0 || totalSynced === 1) {
            console.log(`📈 Progress: ${totalSynced}/${totalToSync} (${Math.round(totalSynced/totalToSync*100)}%)`);
          }
          
          await octoService.syncAvailability(productId, dateStr);
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      logCronEnd(jobId, totalSynced, true);
    } catch (error) {
      logCronEnd(jobId, 0, false, error);
    }
  });
  
  // 4. PRODOTTI SECONDARI - Ogni 12 ore
  cron.schedule('0 */12 * * *', async () => {
    const jobId = `secondary-15d-${Date.now()}`;
    logCronStart('Prodotti secondari - 15 giorni', jobId);
    
    try {
      let totalSynced = 0;
      
      for (const productId of SECONDARY_PRODUCTS) {
        for (let i = 0; i < 15; i++) {
          const date = new Date();
          date.setDate(date.getDate() + i);
          const dateStr = date.toISOString().split('T')[0];
          
          totalSynced++;
          await octoService.syncAvailability(productId, dateStr);
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      logCronEnd(jobId, totalSynced, true);
    } catch (error) {
      logCronEnd(jobId, 0, false, error);
    }
  });
  
  // 5. PRODOTTI SECONDARI - Ogni giorno alle 4:00 AM (30 giorni)
  cron.schedule('0 4 * * *', async () => {
    const jobId = `secondary-30d-${Date.now()}`;
    logCronStart('Prodotti secondari - 30 giorni', jobId);
    
    try {
      let totalSynced = 0;
      
      for (const productId of SECONDARY_PRODUCTS) {
        for (let i = 0; i < 30; i++) {
          const date = new Date();
          date.setDate(date.getDate() + i);
          const dateStr = date.toISOString().split('T')[0];
          
          totalSynced++;
          await octoService.syncAvailability(productId, dateStr);
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      logCronEnd(jobId, totalSynced, true);
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
      
      logCronEnd(jobId, 30, true); // Approssimativo
    } catch (error) {
      logCronEnd(jobId, 0, false, error);
    }
  });
  
  // 7. TUTTI GLI ALTRI PRODOTTI - Ogni venerdì alle 6:00 AM (365 giorni)
  cron.schedule('0 6 * * 5', async () => {
    const jobId = `others-365d-${Date.now()}`;
    logCronStart('Altri prodotti - 365 giorni (venerdì)', jobId);
    
    try {
      await octoService.syncAllAvailabilityExcept(365, [
        ...EXCLUDED_PRODUCTS,
        ...PRIORITY_PRODUCTS,
        ...SECONDARY_PRODUCTS
      ]);
      
      logCronEnd(jobId, 365, true); // Approssimativo
    } catch (error) {
      logCronEnd(jobId, 0, false, error);
    }
  });
  
  console.log('✅ Cron jobs inizializzati:');
  console.log('   - Prodotti: ogni giorno alle 1:00 AM');
  console.log('   - Prioritari: ogni 4 ore (15gg) + 2:00 AM (60gg)');
  console.log('   - Secondari: ogni 12 ore (15gg) + 4:00 AM (30gg)');
  console.log('   - Altri: 6:00 AM (30gg) + venerdì (365gg)');
  console.log(`   - Esclusi: ${EXCLUDED_PRODUCTS.length} prodotti`);
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