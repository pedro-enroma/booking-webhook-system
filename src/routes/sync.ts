import { Router, Request, Response } from 'express';
import { OctoService } from '../services/octoService';
import { supabase } from '../config/supabase';

const router = Router();
const octoService = new OctoService();

// Lista dei prodotti prioritari (copia da cronJobs.ts)
const HIGH_PRIORITY_PRODUCTS = [
  '217949',
  '220107',
  '689976',
];

// Lista dei prodotti esclusi (copia da cronJobs.ts)
const EXCLUDED_PRODUCTS: string[] = [
  '243718',
  '243709',
  '219735',
  '217930',    
];

// Endpoint per sincronizzare i prodotti manualmente
router.post('/sync/products', async (req: Request, res: Response) => {
  try {
    console.log('📡 Richiesta sincronizzazione prodotti ricevuta');
    await octoService.syncProducts();
    res.json({ success: true, message: 'Prodotti sincronizzati' });
  } catch (error: any) {
    console.error('Errore sync prodotti:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Errore sincronizzazione',
      details: error.message 
    });
  }
});

// Endpoint per test - visualizza prodotti salvati
router.get('/sync/products', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    res.json({
      success: true,
      count: data?.length || 0,
      products: data
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Endpoint per sincronizzare disponibilità
router.post('/sync/availability', async (req: Request, res: Response) => {
  try {
    const { productId, date, days } = req.body;
    
    if (productId && date) {
      // Sync singolo prodotto/data
      await octoService.syncAvailability(productId, date);
    } else {
      // Sync tutti i prodotti per N giorni
      await octoService.syncAllAvailability(days || 30);
    }
    
    res.json({ success: true, message: 'Disponibilità sincronizzate' });
  } catch (error) {
    console.error('Errore sync disponibilità:', error);
    res.status(500).json({ success: false, error: 'Errore sincronizzazione' });
  }
});

// ========== NUOVI ENDPOINT PER TESTARE I CRON JOBS ==========

// Test Cron Job 1: Sincronizza prodotti (normalmente ogni 6 ore)
router.post('/test/cron-sync-products', async (req: Request, res: Response) => {
  try {
    console.log('🧪 TEST CRON: Avvio sincronizzazione prodotti');
    const startTime = Date.now();
    
    await octoService.syncProducts();
    
    const duration = Date.now() - startTime;
    res.json({ 
      success: true, 
      message: 'Test cron sincronizzazione prodotti completato',
      duration: `${duration}ms`
    });
  } catch (error: any) {
    console.error('❌ TEST CRON: Errore:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Test Cron Job 2: Sincronizza disponibilità 2 anni (normalmente una volta al giorno)
router.post('/test/cron-sync-2years', async (req: Request, res: Response) => {
  try {
    console.log('🧪 TEST CRON: Avvio sincronizzazione disponibilità 2 anni');
    const startTime = Date.now();
    
    // Per il test, usa solo 7 giorni invece di 730
    const testDays = req.body.days || 7;
    await octoService.syncAllAvailability(testDays);
    
    const duration = Date.now() - startTime;
    res.json({ 
      success: true, 
      message: `Test cron disponibilità completato per ${testDays} giorni`,
      duration: `${duration}ms`
    });
  } catch (error: any) {
    console.error('❌ TEST CRON: Errore:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Test Cron Job 3: Sincronizza disponibilità 30 giorni (normalmente ogni 6 ore)
router.post('/test/cron-sync-30days', async (req: Request, res: Response) => {
  try {
    console.log('🧪 TEST CRON: Avvio sincronizzazione disponibilità 30 giorni (con esclusioni)');
    const startTime = Date.now();
    
    // Per il test, usa solo 3 giorni invece di 30
    const testDays = req.body.days || 3;
    await octoService.syncAllAvailabilityExcept(testDays, EXCLUDED_PRODUCTS);
    
    const duration = Date.now() - startTime;
    res.json({ 
      success: true, 
      message: `Test cron disponibilità completato per ${testDays} giorni (esclusi ${EXCLUDED_PRODUCTS.length} prodotti)`,
      excludedProducts: EXCLUDED_PRODUCTS,
      duration: `${duration}ms`
    });
  } catch (error: any) {
    console.error('❌ TEST CRON: Errore:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Test Cron Job 4: Sincronizza prodotti prioritari (normalmente ogni 2 ore)
router.post('/test/cron-sync-priority', async (req: Request, res: Response) => {
  try {
    console.log('🧪 TEST CRON: Avvio sincronizzazione prodotti prioritari');
    const startTime = Date.now();
    const results = [];
    
    // Per il test, usa solo 3 giorni invece di 10
    const testDays = req.body.days || 3;
    
    for (const productId of HIGH_PRIORITY_PRODUCTS) {
      const productResults = [];
      
      for (let i = 0; i < testDays; i++) {
        const date = new Date();
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        
        try {
          await octoService.syncAvailability(productId, dateStr);
          productResults.push({ date: dateStr, status: 'success' });
        } catch (error: any) {
          productResults.push({ date: dateStr, status: 'error', error: error.message });
        }
        
        // Pausa breve tra le chiamate
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      results.push({ productId, results: productResults });
    }
    
    const duration = Date.now() - startTime;
    res.json({ 
      success: true, 
      message: `Test cron prodotti prioritari completato`,
      priorityProducts: HIGH_PRIORITY_PRODUCTS,
      days: testDays,
      results,
      duration: `${duration}ms`
    });
  } catch (error: any) {
    console.error('❌ TEST CRON: Errore:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Endpoint per verificare lo stato dei cron jobs
router.get('/test/cron-info', (req: Request, res: Response) => {
  res.json({
    info: 'Informazioni sui Cron Jobs',
    cronJobs: [
      {
        name: 'Sincronizza Prodotti',
        schedule: 'Ogni 6 ore (00:00, 06:00, 12:00, 18:00)',
        testEndpoint: 'POST /api/test/cron-sync-products'
      },
      {
        name: 'Sincronizza Disponibilità 2 anni',
        schedule: 'Una volta al giorno alle 02:00',
        testEndpoint: 'POST /api/test/cron-sync-2years',
        note: 'Per il test usa solo 7 giorni'
      },
      {
        name: 'Sincronizza Disponibilità 30 giorni',
        schedule: 'Ogni 6 ore',
        testEndpoint: 'POST /api/test/cron-sync-30days',
        note: 'Per il test usa solo 3 giorni',
        excludedProducts: EXCLUDED_PRODUCTS
      },
      {
        name: 'Sincronizza Prodotti Prioritari',
        schedule: 'Ogni 2 ore',
        testEndpoint: 'POST /api/test/cron-sync-priority',
        note: 'Per il test usa solo 3 giorni',
        priorityProducts: HIGH_PRIORITY_PRODUCTS
      }
    ],
    environment: process.env.NODE_ENV || 'development',
    cronEnabled: process.env.NODE_ENV === 'production'
  });
});

export default router;