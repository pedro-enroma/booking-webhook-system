import dotenv from 'dotenv';
import { OctoService } from './services/octoService';

dotenv.config();

const PRIORITY_PRODUCTS = ['217949', '220107', '216954', '841874'];
const SECONDARY_PRODUCTS = ['221221', '812355', '221226'];
const EXCLUDED_PRODUCTS = ['243718', '243709', '219735', '217930'];

async function testCron(type: string) {
  const octoService = new OctoService();
  
  switch(type) {
    case 'priority-15':
      console.log('🧪 Test prodotti prioritari - 15 giorni');
      for (const productId of PRIORITY_PRODUCTS.slice(0, 1)) { // Solo il primo per test
        for (let i = 0; i < 3; i++) { // Solo 3 giorni per test
          const date = new Date();
          date.setDate(date.getDate() + i);
          const dateStr = date.toISOString().split('T')[0];
          console.log(`Sync ${productId} - ${dateStr}`);
          await octoService.syncAvailability(productId, dateStr);
        }
      }
      break;
      
    case 'secondary-15':
      console.log('🧪 Test prodotti secondari - 15 giorni');
      const productId = SECONDARY_PRODUCTS[0];
      const date = new Date().toISOString().split('T')[0];
      await octoService.syncAvailability(productId, date);
      break;
      
    case 'products':
      console.log('🧪 Test sync prodotti');
      await octoService.syncProducts();
      break;
  }
}

const testType = process.argv[2] || 'priority-15';
testCron(testType).then(() => {
  console.log('✅ Test completato');
  process.exit(0);
});