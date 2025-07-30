import { Router, Request, Response } from 'express';
import { OctoService } from '../services/octoService';
import { supabase } from '../config/supabase';

const router = Router();
const octoService = new OctoService();

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
    const { productId, date, days, startDate, endDate } = req.body;
    
    if (productId && date) {
      // Sync singolo prodotto/data
      await octoService.syncAvailability(productId, date);
      res.json({ 
        success: true, 
        message: `Disponibilità sincronizzata per prodotto ${productId} - data ${date}` 
      });
    } else if (productId && startDate && endDate) {
      // Sync range di date per un prodotto specifico
      await octoService.syncAvailabilityRange(productId, startDate, endDate);
      res.json({ 
        success: true, 
        message: `Disponibilità sincronizzata per prodotto ${productId} dal ${startDate} al ${endDate}` 
      });
    } else {
      // Sync tutti i prodotti per N giorni
      await octoService.syncAllAvailability(days || 30);
      res.json({ 
        success: true, 
        message: `Disponibilità sincronizzate per tutti i prodotti (${days || 30} giorni)` 
      });
    }
  } catch (error: any) {
    console.error('Errore sync disponibilità:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Errore sincronizzazione',
      details: error.message 
    });
  }
});

// Endpoint per visualizzare disponibilità di un prodotto
router.get('/sync/availability/:productId', async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const { date } = req.query;
    
    let query = supabase
      .from('activity_availability')
      .select('*')
      .eq('activity_id', productId)
      .order('local_date_time', { ascending: true });
    
    if (date) {
      query = query.eq('local_date', date as string);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    res.json({
      success: true,
      productId,
      count: data?.length || 0,
      availability: data
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Endpoint per sincronizzare prodotti prioritari
router.post('/sync/priority', async (req: Request, res: Response) => {
  try {
    const HIGH_PRIORITY_PRODUCTS = ['217949', '220107', '689976'];
    const days = req.body.days || 10;
    
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    console.log(`🎯 Sincronizzazione prodotti prioritari per ${days} giorni`);
    
    const results = [];
    
    for (const productId of HIGH_PRIORITY_PRODUCTS) {
      try {
        await octoService.syncAvailabilityRange(productId, startDateStr, endDateStr);
        results.push({ productId, status: 'success' });
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error: any) {
        results.push({ productId, status: 'error', error: error.message });
      }
    }
    
    res.json({ 
      success: true, 
      message: 'Sincronizzazione prodotti prioritari completata',
      results 
    });
  } catch (error: any) {
    console.error('Errore sync prodotti prioritari:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Errore sincronizzazione',
      details: error.message 
    });
  }
});

export default router;