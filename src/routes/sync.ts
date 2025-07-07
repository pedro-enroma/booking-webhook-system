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

export default router;