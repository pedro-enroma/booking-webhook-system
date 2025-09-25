import { Router, Request, Response } from 'express';
import { BookingService } from '../services/bookingService';
import { OctoService } from '../services/octoService';
import { AvailabilityWebhookEvent, extractProductIdFromExperience } from '../types/webhook-availability.types';
import { getCronStatus } from '../cronJobs';
import { WebhookLogger } from '../services/webhookLogger';
import * as crypto from 'crypto';

const router = Router();
const bookingService = new BookingService();
const octoService = new OctoService();
const webhookLogger = new WebhookLogger();

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

  // Log webhook to our detailed logging system
  const logEntry = await webhookLogger.logWebhookReceived(req.body, 'BOOKING');

  try {
    // Start processing log
    await webhookLogger.logProcessingStart(logEntry);

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

    // Check if this is an out-of-order webhook
    if (logEntry.out_of_order) {
      console.warn('⚠️ OUT OF ORDER WEBHOOK DETECTED!');
      console.warn(`Confirmation Code: ${logEntry.confirmation_code}`);
      console.warn(`Action: ${logEntry.action}, Status: ${logEntry.status}`);

      // Check for specific problematic patterns
      if (logEntry.action === 'BOOKING_UPDATED' && logEntry.status !== 'CANCELLED') {
        // Check if we already have a CANCELLED status for this booking
        const history = await webhookLogger.getWebhookHistory(logEntry.booking_id, 5);
        const hasCancellation = history.some(h =>
          h.action === 'BOOKING_ITEM_CANCELLED' || h.status === 'CANCELLED'
        );

        if (hasCancellation) {
          console.error('🚨 CRITICAL: Update webhook trying to override CANCELLED status!');
          console.error('🚨 Skipping this webhook to preserve CANCELLED status');

          await webhookLogger.logProcessingComplete(
            logEntry,
            'SKIPPED',
            'Out-of-order UPDATE after CANCELLATION - skipped to preserve CANCELLED status'
          );

          return res.status(200).json({
            success: true,
            message: 'Webhook skipped (out-of-order UPDATE after CANCELLATION)',
            warning: 'Out-of-order webhook detected and handled'
          });
        }
      }
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

    // Track previous status if updating
    let previousStatus = null;
    if (action === 'BOOKING_UPDATED' || action === 'BOOKING_ITEM_CANCELLED') {
      // Try to get current status from database
      // This would need to be implemented in bookingService
      // For now, we'll track it from webhook history
      const history = await webhookLogger.getWebhookHistory(logEntry.booking_id, 1);
      if (history.length > 0) {
        previousStatus = history[0].status;
      }
    }

    // Aggiungi l'action all'oggetto se non c'è
    const dataWithAction = {
      ...req.body,
      action: action
    };

    // Processa con l'action corretta
    await bookingService.processWebhook(dataWithAction);

    // Log successful processing
    await webhookLogger.logProcessingComplete(
      logEntry,
      'SUCCESS',
      undefined,
      previousStatus ? { from: previousStatus, to: req.body.status } : undefined
    );

    res.status(200).json({
      success: true,
      message: 'Webhook elaborato con successo'
    });

  } catch (error: any) {
    console.error('❌ Errore nel processare il webhook:', error);

    // Log error
    await webhookLogger.logProcessingComplete(
      logEntry,
      'ERROR',
      error.message || 'Unknown error'
    );

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

// New debug endpoints for webhook analysis
router.get('/webhook/debug/history/:confirmationCode', async (req: Request, res: Response) => {
  try {
    const { confirmationCode } = req.params;
    const issues = await webhookLogger.detectOutOfOrderIssues(confirmationCode);

    if (!issues) {
      return res.status(404).json({
        error: 'No webhooks found for this confirmation code'
      });
    }

    res.json(issues);
  } catch (error: any) {
    console.error('Error fetching webhook history:', error);
    res.status(500).json({
      error: 'Error fetching webhook history',
      message: error.message
    });
  }
});

// Get webhook logs for a specific booking
router.get('/webhook/debug/logs/:bookingId', async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;

    const history = await webhookLogger.getWebhookHistory(bookingId, limit);

    res.json({
      booking_id: bookingId,
      webhook_count: history.length,
      webhooks: history
    });
  } catch (error: any) {
    console.error('Error fetching webhook logs:', error);
    res.status(500).json({
      error: 'Error fetching webhook logs',
      message: error.message
    });
  }
});

// Generate webhook report
router.get('/webhook/debug/report', async (req: Request, res: Response) => {
  try {
    const startDate = req.query.startDate
      ? new Date(req.query.startDate as string)
      : new Date(Date.now() - 24 * 60 * 60 * 1000);

    const endDate = req.query.endDate
      ? new Date(req.query.endDate as string)
      : new Date();

    const report = await webhookLogger.generateReport(startDate, endDate);

    res.type('text/plain').send(report);
  } catch (error: any) {
    console.error('Error generating report:', error);
    res.status(500).json({
      error: 'Error generating report',
      message: error.message
    });
  }
});

// Get the path to the detailed log file
router.get('/webhook/debug/log-file', (req: Request, res: Response) => {
  const logPath = webhookLogger.getLogFilePath();
  res.json({
    log_file_path: logPath,
    message: 'Use this path to access the detailed webhook log file'
  });
});

export default router;