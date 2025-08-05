import { Router, Request, Response } from 'express';
import { BookingService } from '../services/bookingService';
import { OctoService } from '../services/octoService';
import { AvailabilityWebhookEvent, extractProductIdFromExperience } from '../types/webhook-availability.types';
import { getCronStatus } from '../cronJobs';
import * as crypto from 'crypto';

const router = Router();
const bookingService = new BookingService();
const octoService = new OctoService();

// Funzione per verificare la firma del webhook
function verifyWebhookSignature(payload: string, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');
  
  return signature === expectedSignature;
}

// Nuovo endpoint per webhook di disponibilità
router.post('/webhook/availability', async (req: Request, res: Response) => {
  console.log('🔔 Webhook disponibilità ricevuto da Bokun');
  
  try {
    // Verifica firma se configurata
    const webhookSecret = process.env.BOKUN_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = req.headers['x-bokun-signature'] as string;
      const payload = JSON.stringify(req.body);
      
      if (!verifyWebhookSignature(payload, signature, webhookSecret)) {
        console.error('❌ Firma webhook non valida');
        return res.status(401).json({ error: 'Firma non valida' });
      }
    }
    
    const event: AvailabilityWebhookEvent = req.body;
    
    console.log('📊 Evento disponibilità ricevuto:');
    console.log('- Experience ID:', event.experienceId);
    console.log('- Update reasons:', event.updateReasons);
    console.log('- Date range:', event.dateFrom, 'a', event.dateTo);
    
    // Estrai il product ID dall'experience ID
    const productId = extractProductIdFromExperience(event.experienceId);
    if (!productId) {
      console.error('❌ Impossibile estrarre product ID da:', event.experienceId);
      return res.status(400).json({ error: 'Experience ID non valido' });
    }
    
    console.log('📦 Product ID estratto:', productId);
    
    // Calcola il numero di giorni da sincronizzare
    const dateFrom = new Date(event.dateFrom);
    const dateTo = new Date(event.dateTo);
    const daysDiff = Math.ceil((dateTo.getTime() - dateFrom.getTime()) / (1000 * 3600 * 24));
    
    // Limita a massimo 90 giorni per evitare sovraccarichi
    const daysToSync = Math.min(daysDiff + 1, 90);
    
    console.log(`📅 Sincronizzazione ${daysToSync} giorni di disponibilità...`);
    
    // Sincronizza ogni giorno nel range
    for (let i = 0; i <= daysToSync; i++) {
      const date = new Date(dateFrom);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      
      await octoService.syncAvailability(productId, dateStr);
      
      // Piccola pausa tra le chiamate
      if (i % 10 === 0 && i > 0) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    console.log('✅ Sincronizzazione disponibilità completata');
    
    return res.status(200).json({ 
      success: true, 
      message: 'Disponibilità aggiornata',
      productId: productId,
      daysUpdated: daysToSync
    });
    
  } catch (error) {
    console.error('❌ Errore nel processare webhook disponibilità:', error);
    
    return res.status(500).json({ 
      success: false, 
      error: 'Errore nel processare il webhook' 
    });
  }
});

// Endpoint esistente per booking webhook
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

// Endpoint per monitorare stato cron
router.get('/cron-status', (req: Request, res: Response) => {
  const status = getCronStatus();
  res.json(status);
});

router.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    message: 'Il server webhook è attivo e funzionante!',
    timestamp: new Date().toISOString()
  });
});

export default router;