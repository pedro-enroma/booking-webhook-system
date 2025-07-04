import { Router, Request, Response } from 'express';
import { BookingService } from '../services/bookingService';

const router = Router();
const bookingService = new BookingService();

router.post('/webhook/booking', async (req: Request, res: Response) => {
  console.log('🔔 Webhook ricevuto da Bokun');
  
  try {
    // Log dettagliati per capire la struttura
    console.log('📊 Campi principali ricevuti:');
    console.log('- action:', req.body.action);
    console.log('- status:', req.body.status);
    console.log('- bookingId:', req.body.bookingId);
    console.log('- parentBookingId:', req.body.parentBookingId);
    
    if (req.body.parentBooking) {
      console.log('📊 Dati parentBooking:');
      console.log('- parentBooking.action:', req.body.parentBooking.action);
      console.log('- parentBooking.status:', req.body.parentBooking.status);
    }
    
    // Per ora, determiniamo l'azione basandoci sullo status
    let action = req.body.action;
    
    // Se action non esiste, proviamo a dedurla dallo status
    if (!action) {
      if (req.body.status === 'CANCELLED') {
        action = 'BOOKING_ITEM_CANCELLED';
      } else if (req.body.status === 'CONFIRMED') {
        // Controlla se è una nuova prenotazione o un aggiornamento
        // Per ora assumiamo che sia sempre CONFIRMED
        action = 'BOOKING_CONFIRMED';
      }
      console.log('🔄 Action dedotta dallo status:', action);
    }
    
    // Aggiungi l'action all'oggetto se non c'è
    const dataWithAction = {
      ...req.body,
      action: action
    };
    
    // Processa con l'action corretta
    await bookingService.processWebhook(dataWithAction);
    
    res.status(200).json({ 
      success: true, 
      message: 'Webhook elaborato con successo' 
    });
    
  } catch (error) {
    console.error('❌ Errore nel processare il webhook:', error);
    
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