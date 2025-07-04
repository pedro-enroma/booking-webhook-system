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
    
    // Log dettagliato della struttura
    console.log('📊 Struttura dati principale:');
    console.log('- bookingId:', req.body.bookingId);
    console.log('- parentBookingId:', req.body.parentBookingId);
    console.log('- action:', req.body.action);
    console.log('- customer esiste?', !!req.body.customer);
    console.log('- parentBooking esiste?', !!req.body.parentBooking);
    
    if (req.body.parentBooking) {
      console.log('📊 Dati in parentBooking:');
      console.log('- parentBooking.customer esiste?', !!req.body.parentBooking.customer);
      console.log('- parentBooking.bookingId:', req.body.parentBooking.bookingId);
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

// Endpoint per vedere la struttura dei dati
router.get('/last-data-structure', (req: Request, res: Response) => {
  if (!lastReceivedData) {
    res.json({ message: 'Nessun dato ricevuto ancora' });
    return;
  }
  
  // Mostra solo la struttura, non tutti i dati
  const structure = {
    topLevelKeys: Object.keys(lastReceivedData),
    bookingId: lastReceivedData.bookingId,
    parentBookingId: lastReceivedData.parentBookingId,
    action: lastReceivedData.action,
    hasCustomer: !!lastReceivedData.customer,
    hasParentBooking: !!lastReceivedData.parentBooking,
    parentBookingKeys: lastReceivedData.parentBooking ? Object.keys(lastReceivedData.parentBooking) : null,
    parentBookingHasCustomer: lastReceivedData.parentBooking ? !!lastReceivedData.parentBooking.customer : null,
    activityBookingsCount: lastReceivedData.activityBookings ? lastReceivedData.activityBookings.length : 0
  };
  
  res.json(structure);
});

// Endpoint per vedere solo i dati del cliente
router.get('/last-data-customer', (req: Request, res: Response) => {
  if (!lastReceivedData) {
    res.json({ message: 'Nessun dato ricevuto ancora' });
    return;
  }
  
  const customerData = {
    directCustomer: lastReceivedData.customer || null,
    parentBookingCustomer: lastReceivedData.parentBooking?.customer || null
  };
  
  res.json(customerData);
});

router.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    message: 'Il server webhook è attivo e funzionante!',
    timestamp: new Date().toISOString()
  });
});

export default router;