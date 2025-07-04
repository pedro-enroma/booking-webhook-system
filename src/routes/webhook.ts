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
    // Salva TUTTO quello che arriva
    lastReceivedData = req.body;
    
    // Log per capire la struttura
    console.log('📊 Tipo di dato ricevuto:', Array.isArray(req.body) ? 'ARRAY' : 'OBJECT');
    console.log('📊 Lunghezza/chiavi:', Array.isArray(req.body) ? req.body.length : Object.keys(req.body).length);
    
    // Se è un array, mostra il primo elemento
    if (Array.isArray(req.body) && req.body.length > 0) {
      console.log('📊 Primo elemento ha questi campi:', Object.keys(req.body[0]));
      console.log('📊 Action:', req.body[0].action);
    }
    
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

// Endpoint migliorato per vedere i dati
router.get('/last-data', (req: Request, res: Response) => {
  if (lastReceivedData) {
    res.json({
      dataType: Array.isArray(lastReceivedData) ? 'ARRAY' : 'OBJECT',
      arrayLength: Array.isArray(lastReceivedData) ? lastReceivedData.length : null,
      data: lastReceivedData
    });
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