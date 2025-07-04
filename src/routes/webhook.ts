import { Router, Request, Response } from 'express';
import { BookingService } from '../services/bookingService';

const router = Router();
const bookingService = new BookingService();

router.post('/webhook/booking', async (req: Request, res: Response) => {
  console.log('🔔 Webhook ricevuto da Bokun');
  
  try {
    // Processa la prenotazione
    await bookingService.saveBooking(req.body);
    
    res.status(200).json({ 
      success: true, 
      message: 'Prenotazione elaborata con successo' 
    });
    
  } catch (error) {
    console.error('❌ Errore nel processare il webhook:', error);
    
    res.status(500).json({ 
      success: false, 
      error: 'Errore nel processare la prenotazione' 
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