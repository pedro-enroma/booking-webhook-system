import { Router, Request, Response } from 'express';
import { BookingService } from '../services/bookingService';
import { BookingData } from '../types/booking.types';

const router = Router();
const bookingService = new BookingService();

// Variabile per salvare temporaneamente gli ultimi dati ricevuti
let lastReceivedData: any = null;

router.post('/webhook/booking', async (req: Request, res: Response) => {
  console.log('🔔 Webhook ricevuto da Bokun');
  
  try {
    // Salva i dati nella variabile
    lastReceivedData = req.body;
    console.log('💾 Dati salvati in memoria');
    
    // Log parziale per vedere la struttura
    console.log('📊 Struttura dati:', JSON.stringify(req.body, null, 2).substring(0, 1000) + '...');
    
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

// Nuovo endpoint per vedere gli ultimi dati ricevuti
router.get('/last-data', (req: Request, res: Response) => {
  if (lastReceivedData) {
    res.json(lastReceivedData);
  } else {
    res.json({ message: 'Nessun dato ricevuto ancora' });
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