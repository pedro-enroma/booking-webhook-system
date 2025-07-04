import { Router, Request, Response } from 'express';
import { BookingService } from '../services/bookingService';
import { BookingData } from '../types/booking.types';
import fs from 'fs';

const router = Router();
const bookingService = new BookingService();

router.post('/webhook/booking', async (req: Request, res: Response) => {
  console.log('🔔 Webhook ricevuto da Bokun');
  
  try {
    // Salva i dati in un file per analisi
    fs.writeFileSync('bokun-data.json', JSON.stringify(req.body, null, 2));
    console.log('📁 Dati salvati in bokun-data.json');
    
    // Per ora, rispondiamo solo con successo
    res.status(200).json({ 
      success: true, 
      message: 'Dati ricevuti e salvati per analisi' 
    });
    
  } catch (error) {
    console.error('❌ Errore:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Errore nel processare il webhook' 
    });
  }
});

router.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    message: 'Il server webhook è attivo e funzionante!',
    timestamp: new Date().toISOString()
  });
});

export default router;