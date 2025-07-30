// Script per testare manualmente le sincronizzazioni senza aspettare i cron
import dotenv from 'dotenv';
import { OctoService } from './services/octoService';

// Carica le variabili d'ambiente
dotenv.config();

const octoService = new OctoService();

async function testSync() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  console.log('🧪 Test sincronizzazione manuale');
  console.log('================================');
  
  try {
    switch (command) {
      case 'products':
        console.log('📦 Test sincronizzazione prodotti...');
        await octoService.syncProducts();
        break;
        
      case 'availability':
        const days = parseInt(args[1]) || 7;
        console.log(`📅 Test sincronizzazione disponibilità per ${days} giorni...`);
        await octoService.syncAllAvailability(days);
        break;
        
      case 'availability-product':
        const productId = args[1];
        const startDate = args[2] || new Date().toISOString().split('T')[0];
        const endDate = args[3] || startDate;
        
        if (!productId) {
          console.error('❌ Devi specificare un productId');
          console.log('Uso: npm run test-sync availability-product <productId> [startDate] [endDate]');
          process.exit(1);
        }
        
        console.log(`📅 Test disponibilità per prodotto ${productId} dal ${startDate} al ${endDate}...`);
        await octoService.syncAvailabilityRange(productId, startDate, endDate);
        break;
        
      case 'priority':
        console.log('⭐ Test sincronizzazione prodotti prioritari...');
        
        // Lista dei prodotti prioritari (copia da cronJobs.ts)
        const HIGH_PRIORITY_PRODUCTS = ['217949', '220107', '689976'];
        
        const startDatePrio = new Date();
        const endDatePrio = new Date();
        endDatePrio.setDate(endDatePrio.getDate() + 10);
        
        const startDateStr = startDatePrio.toISOString().split('T')[0];
        const endDateStr = endDatePrio.toISOString().split('T')[0];
        
        for (const pid of HIGH_PRIORITY_PRODUCTS) {
          console.log(`🎯 Sincronizzando prodotto ${pid}...`);
          await octoService.syncAvailabilityRange(pid, startDateStr, endDateStr);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        break;
        
      case 'test-product':
        // Test con il prodotto dell'esempio (221226)
        console.log('🧪 Test con prodotto di esempio 221226...');
        await octoService.syncAvailabilityRange('221226', '2025-08-12', '2025-08-13');
        break;
        
      default:
        console.log('Comandi disponibili:');
        console.log('  npm run test-sync products                    - Sincronizza tutti i prodotti');
        console.log('  npm run test-sync availability [giorni]       - Sincronizza disponibilità (default 7 giorni)');
        console.log('  npm run test-sync availability-product <id> [startDate] [endDate] - Sincronizza un prodotto specifico');
        console.log('  npm run test-sync priority                    - Sincronizza prodotti prioritari');
        console.log('  npm run test-sync test-product                - Test con prodotto di esempio');
        process.exit(0);
    }
    
    console.log('✅ Test completato con successo!');
    
  } catch (error: any) {
    console.error('❌ Errore durante il test:', error);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    
    process.exit(1);
  }
}

// Esegui il test
testSync().then(() => {
  console.log('🏁 Test terminato');
  process.exit(0);
}).catch((error) => {
  console.error('💥 Errore fatale:', error);
  process.exit(1);
});