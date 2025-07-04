import { Router, Request, Response } from 'express';
import { BookingService } from '../services/bookingService';
import { BookingData } from '../types/booking.types';

// Crea un router per gestire le route del webhook
const router = Router();

// Crea un'istanza del servizio
const bookingService = new BookingService();

// Route per ricevere i webhook da Bokun
router.post('/webhook/booking', async (req: Request, res: Response) => {
  console.log('🔔 Webhook ricevuto da Bokun');
  
  try {
    // Bokun potrebbe mandare un array di prenotazioni o una singola prenotazione
    const bookings: BookingData[] = Array.isArray(req.body) ? req.body : [req.body];
    
    console.log(`📊 Numero di prenotazioni ricevute: ${bookings.length}`);
    
    // Processa ogni prenotazione
    for (const booking of bookings) {
      await bookingService.saveBooking(booking);
    }
    
    // Rispondi a Bokun che tutto è andato bene
    res.status(200).json({ 
      success: true, 
      message: `${bookings.length} prenotazioni elaborate con successo` 
    });
    
  } catch (error) {
    console.error('❌ Errore nel processare il webhook:', error);
    
    // Rispondi a Bokun che c'è stato un errore
    res.status(500).json({ 
      success: false, 
      error: 'Errore nel processare la prenotazione' 
    });
  }
});

// Route di test per verificare che il server funzioni
router.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    message: 'Il server webhook è attivo e funzionante!',
    timestamp: new Date().toISOString()
  });
});

export default router;