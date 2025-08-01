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
    const { productId, date, days } = req.body;
    
    if (productId && date) {
      // Sync singolo prodotto/data specifica
      console.log(`🔄 Sincronizzazione ${productId} per data ${date}`);
      await octoService.syncAvailability(productId, date);
      res.json({ success: true, message: `Disponibilità sincronizzata per ${productId} - ${date}` });
      
    } else if (productId && days) {
      // Sync singolo prodotto per N giorni
      console.log(`🔄 Sincronizzazione ${productId} per ${days} giorni`);
      
      for (let i = 0; i < days; i++) {
        const dateToSync = new Date();
        dateToSync.setDate(dateToSync.getDate() + i);
        const dateStr = dateToSync.toISOString().split('T')[0];
        
        console.log(`📅 Giorno ${i + 1}/${days}: ${dateStr}`);
        await octoService.syncAvailability(productId, dateStr);
        
        // Pausa tra le chiamate
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      res.json({ 
        success: true, 
        message: `Disponibilità sincronizzate per ${productId} - prossimi ${days} giorni` 
      });
      
    } else if (days) {
      // Sync tutti i prodotti per N giorni (solo se non c'è productId)
      console.log(`🔄 Sincronizzazione TUTTI i prodotti per ${days} giorni`);
      await octoService.syncAllAvailability(days);
      res.json({ success: true, message: `Disponibilità sincronizzate per tutti i prodotti - ${days} giorni` });
      
    } else {
      // Default: sync tutti i prodotti per 30 giorni
      console.log('🔄 Sincronizzazione tutti i prodotti per 30 giorni (default)');
      await octoService.syncAllAvailability(30);
      res.json({ success: true, message: 'Disponibilità sincronizzate per tutti i prodotti - 30 giorni' });
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

export default router;