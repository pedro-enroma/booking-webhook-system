import { supabase } from '../config/supabase';
import { OctoService } from './octoService';
import { PromotionService } from './promotionService';
import { InvoiceService } from './invoiceService';

export class BookingService {
  private octoService: OctoService;
  private promotionService: PromotionService;
  private invoiceService: InvoiceService;

  constructor() {
    this.octoService = new OctoService();
    this.promotionService = new PromotionService();
    this.invoiceService = new InvoiceService();
  }
  
  // Funzione principale che decide cosa fare in base all'action
  async processWebhook(data: any): Promise<void> {
    console.log('📥 Webhook ricevuto con action:', data.action);
    
    switch (data.action) {
      case 'BOOKING_CONFIRMED':
        await this.handleBookingConfirmed(data);
        break;
      
      case 'BOOKING_UPDATED':
        await this.handleBookingUpdated(data);
        break;
      
      case 'BOOKING_ITEM_CANCELLED':
        await this.handleBookingItemCancelled(data);
        break;
      
      default:
        console.log('⚠️ Action non gestita:', data.action);
    }
  }
  
  // Gestisce nuove prenotazioni confermate
  private async handleBookingConfirmed(bookingData: any): Promise<void> {
    console.log('➕ Gestione BOOKING_CONFIRMED:', bookingData.confirmationCode);
    
    try {
      if (!bookingData.parentBooking) {
        console.log('⚠️ Nessun parentBooking trovato, skip');
        return;
      }
      
      const parentBooking = bookingData.parentBooking;
      
      // 1. Salva o aggiorna il cliente
      if (parentBooking.customer) {
        const customerId = await this.saveOrUpdateCustomer(parentBooking.customer);
        console.log('✅ Cliente salvato/aggiornato:', customerId);
        
        // 2. Salva la prenotazione principale
        await this.saveMainBooking(parentBooking);
        console.log('✅ Prenotazione principale salvata');
        
        // 3. Collega la prenotazione al cliente
        await this.linkBookingToCustomer(parentBooking.bookingId, parentBooking.customer.id);
        console.log('✅ Prenotazione collegata al cliente');
      }
      
      // 4. Salva il venditore
      if (parentBooking.seller) {
        const sellerId = await this.saveOrUpdateSeller(parentBooking.seller);
        console.log('✅ Venditore salvato/aggiornato:', sellerId);
      }

      // 4.5 NUOVO: Salva anche l'agent come seller se presente
      if (bookingData.agent && bookingData.agent.title) {
        console.log('📌 Trovato agent nel webhook, salvo come seller:', bookingData.agent.title);
        // Crea un oggetto seller dal agent per salvarlo
        const agentAsSeller = {
          id: bookingData.agent.id || 999999, // ID fittizio se non presente
          title: bookingData.agent.title,
          email: bookingData.agent.email || null
        };
        await this.saveOrUpdateSeller(agentAsSeller);
        console.log('✅ Agent salvato come seller:', bookingData.agent.title);
      }

      // 4.6 NUOVO: Estrai il nome del seller per usarlo nelle attività
      // Priorità: agent.title > seller.title > default 'EnRoma.com'
      const sellerName = bookingData.agent?.title || parentBooking.seller?.title || 'EnRoma.com';
      console.log('📌 Seller name per le attività:', sellerName);

      // 5. Salva l'attività CON IL SELLER
      console.log('🔍 DEBUG: Tentativo salvataggio activity_booking:');
      console.log('   - activity_booking_id:', bookingData.bookingId);
      console.log('   - booking_id:', parentBooking.bookingId);
      console.log('   - product_id:', bookingData.productId || bookingData.product?.id);
      console.log('   - title:', bookingData.title);
      console.log('   - startDateTime:', bookingData.startDateTime);
      console.log('   - status:', bookingData.status);

      try {
        await this.saveActivityBookingFromRoot(bookingData, parentBooking.bookingId, sellerName, parentBooking);
        console.log('✅ Attività salvata:', bookingData.title);

        // Update booking-level EUR totals after saving activity
        await this.updateBookingEurTotals(parentBooking.bookingId);
      } catch (activityError: any) {
        console.error('❌❌❌ ERRORE CRITICO salvando activity_booking:', activityError);
        console.error('   Error message:', activityError.message);
        console.error('   Error details:', JSON.stringify(activityError, null, 2));
        throw activityError;
      }
      
      // 6. Salva i partecipanti con info passeggeri
      if (bookingData.pricingCategoryBookings && bookingData.pricingCategoryBookings.length > 0) {
        for (const participant of bookingData.pricingCategoryBookings) {
          await this.savePricingCategoryBooking(participant, bookingData.bookingId);
        }
        console.log('✅ Partecipanti salvati:', bookingData.pricingCategoryBookings.length);
      }
      
      // 7. NUOVO: Traccia promozioni/offerte
      await this.promotionService.processWebhookOffers(
        bookingData,
        parentBooking.bookingId,
        bookingData.confirmationCode,
        'BOOKING_CONFIRMED'
      );

      // 7.5 NUOVO: Traccia coupon codes
      await this.promotionService.processWebhookCoupons(
        bookingData,
        parentBooking.bookingId,
        bookingData.confirmationCode,
        'BOOKING_CONFIRMED'
      );

      // 8. NUOVO: Sincronizza disponibilità
      await this.syncAvailabilityForBooking(bookingData);

      // 9. NUOVO: Valida età partecipanti e auto-fix swap OTA
      await this.validateBookingAges(bookingData.bookingId);

      // 10. NUOVO: Auto-fatturazione se abilitata
      try {
        const shouldInvoice = await this.invoiceService.shouldAutoInvoice(sellerName);
        if (shouldInvoice) {
          console.log('💰 Triggering auto-invoice for seller:', sellerName);
          await this.invoiceService.createInvoiceFromBooking(
            parentBooking.bookingId,
            'webhook'
          );
        }
      } catch (invoiceError) {
        console.error('⚠️ Errore in auto-invoicing (non-blocking):', invoiceError);
        // Non propagare l'errore - la fatturazione non deve bloccare il webhook
      }

      console.log('🎉 BOOKING_CONFIRMED completato!');

    } catch (error) {
      console.error('❌ Errore in BOOKING_CONFIRMED:', error);
      throw error;
    }
  }
  
  // Gestisce aggiornamenti alle prenotazioni esistenti
  private async handleBookingUpdated(bookingData: any): Promise<void> {
    console.log('🔄 Gestione BOOKING_UPDATED:', bookingData.confirmationCode);
    console.log('=' .repeat(80));
    console.log('📋 MULTI-ACTIVITY & REBOOK DEBUG - Inizio analisi webhook');
    console.log('=' .repeat(80));

    try {
      if (!bookingData.parentBooking) {
        console.log('⚠️ Nessun parentBooking trovato, skip');
        return;
      }

      const parentBooking = bookingData.parentBooking;

      console.log('📊 WEBHOOK DATA:');
      console.log(`   activity_booking_id (bookingData.bookingId): ${bookingData.bookingId}`);
      console.log(`   parent booking_id: ${parentBooking.bookingId}`);
      console.log(`   confirmation_code: ${bookingData.confirmationCode}`);
      console.log(`   product_title: ${bookingData.title}`);
      console.log(`   product_id: ${bookingData.productId}`);
      console.log(`   status: ${bookingData.status}`);

      // MULTI-ACTIVITY CHECK: Verifica quante activities esistono per questo parent booking
      console.log('\n🔍 MULTI-ACTIVITY CHECK - Verifica activities per parent booking');
      const { data: allActivities, error: allError } = await supabase
        .from('activity_bookings')
        .select('activity_booking_id, status, product_title, product_id, start_date_time')
        .eq('booking_id', parentBooking.bookingId)
        .order('activity_booking_id', { ascending: true });

      if (!allError && allActivities) {
        console.log(`   📊 Activities esistenti per booking_id ${parentBooking.bookingId}: ${allActivities.length}`);
        if (allActivities.length > 0) {
          allActivities.forEach((act: any, index: number) => {
            console.log(`      ${index + 1}. activity_booking_id: ${act.activity_booking_id}`);
            console.log(`         product_id: ${act.product_id}, status: ${act.status}`);
            console.log(`         title: ${act.product_title}`);
          });
        } else {
          console.log('   ⚠️  Nessuna activity trovata per questo booking - strano per un UPDATE!');
        }

        if (allActivities.length >= 1) {
          console.log('\n   🎯 MULTI-ACTIVITY BOOKING DETECTED!');
          console.log(`   📌 Questo booking ha ${allActivities.length} activities`);
        }
      }

      // REBOOK DEBUG: Check se l'activity_booking_id del webhook esiste già nel DB
      console.log(`\n🔍 REBOOK DEBUG - Verifica esistenza activity_booking_id: ${bookingData.bookingId}`);
      const { data: existingActivity, error: checkError } = await supabase
        .from('activity_bookings')
        .select('activity_booking_id, booking_id, status, product_title, start_date_time')
        .eq('activity_booking_id', bookingData.bookingId)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('❌ REBOOK DEBUG - Errore nella verifica:', checkError);
      }

      if (existingActivity) {
        console.log('✅ SCENARIO: UPDATE di activity esistente');
        console.log('   📌 activity_booking_id:', existingActivity.activity_booking_id);
        console.log('   📌 booking_id (parent):', existingActivity.booking_id);
        console.log('   📌 status:', existingActivity.status);
        console.log('   📌 product_title:', existingActivity.product_title);
        console.log('   📌 start_date_time:', existingActivity.start_date_time);
      } else {
        console.log('🆕 SCENARIO: INSERT di nuova activity');
        console.log('   📌 activity_booking_id dal webhook: ' + bookingData.bookingId + ' NON esiste nel DB');

        if (allActivities && allActivities.length > 0) {
          const cancelledActivities = allActivities.filter((a: any) => a.status === 'CANCELLED');
          if (cancelledActivities.length > 0) {
            console.log('   🚨 Tipo: REBOOK (sostituzione activity cancellata)');
            cancelledActivities.forEach((act: any) => {
              console.log(`      ❌ activity_booking_id: ${act.activity_booking_id} - CANCELLED`);
            });
          } else {
            console.log('   ➕ Tipo: MULTI-ACTIVITY (seconda/terza activity per stesso booking)');
            console.log(`   📌 Questo sarà la activity #${allActivities.length + 1} per booking_id ${parentBooking.bookingId}`);
          }
        } else {
          console.log('   ⚠️  Tipo: Prima activity (strano per BOOKING_UPDATED)');
        }
      }

      console.log('=' .repeat(80));

      // Aggiorna solo i dati che potrebbero essere cambiati

      // 1. Aggiorna cliente se presente
      if (parentBooking.customer) {
        await this.saveOrUpdateCustomer(parentBooking.customer);
        console.log('✅ Cliente aggiornato');
      }

      // 2. Aggiorna prenotazione principale
      await this.updateMainBooking(parentBooking);
      console.log('✅ Prenotazione principale aggiornata');

      // 2.3 NUOVO: Salva anche l'agent come seller se presente
      if (bookingData.agent && bookingData.agent.title) {
        console.log('📌 Trovato agent nel webhook, salvo come seller:', bookingData.agent.title);
        const agentAsSeller = {
          id: bookingData.agent.id || 999999,
          title: bookingData.agent.title,
          email: bookingData.agent.email || null
        };
        await this.saveOrUpdateSeller(agentAsSeller);
        console.log('✅ Agent salvato come seller:', bookingData.agent.title);
      }

      // 2.5 NUOVO: Estrai il nome del seller per usarlo nelle attività
      // Priorità: agent.title > seller.title > default 'EnRoma.com'
      const sellerName = bookingData.agent?.title || parentBooking.seller?.title || 'EnRoma.com';
      console.log('📌 Seller name per aggiornamento attività:', sellerName);

      // 3. REBOOK LOGIC: Se activity non esiste, creala invece di updatarla!
      console.log('🔧 REBOOK DEBUG - Operazione da eseguire:');
      if (existingActivity) {
        console.log('   🔄 UPDATE di activity esistente');
        await this.updateActivityBooking(bookingData, parentBooking.bookingId, sellerName, parentBooking);
        console.log('✅ Attività aggiornata');
      } else {
        console.log('   ➕ INSERT di NUOVA activity (REBOOK scenario)');
        await this.saveActivityBookingFromRoot(bookingData, parentBooking.bookingId, sellerName, parentBooking);
        console.log('✅ Nuova attività creata (REBOOK)');
      }

      // Update booking-level EUR totals after saving/updating activity
      await this.updateBookingEurTotals(parentBooking.bookingId);

      // 4. NUOVO: Sincronizza partecipanti in modo intelligente
      console.log('🔧 REBOOK DEBUG - Sincronizzazione partecipanti');
      if (bookingData.pricingCategoryBookings) {
        console.log(`   📊 Webhook contiene ${bookingData.pricingCategoryBookings.length} partecipanti`);
        await this.syncParticipantsIntelligently(
          bookingData.bookingId,
          bookingData.pricingCategoryBookings,
          parentBooking.bookingId,
          bookingData.confirmationCode
        );
        console.log('✅ Partecipanti sincronizzati intelligentemente');
      }

      // 5. NUOVO: Traccia promozioni/offerte
      await this.promotionService.processWebhookOffers(
        bookingData,
        parentBooking.bookingId,
        bookingData.confirmationCode,
        'BOOKING_UPDATED'
      );

      // 5.5 NUOVO: Traccia coupon codes
      await this.promotionService.processWebhookCoupons(
        bookingData,
        parentBooking.bookingId,
        bookingData.confirmationCode,
        'BOOKING_UPDATED'
      );

      // 6. NUOVO: Sincronizza disponibilità
      await this.syncAvailabilityForBooking(bookingData);

      // Final summary
      console.log('\n' + '=' .repeat(80));
      console.log('📊 BOOKING_UPDATED SUMMARY');
      console.log('=' .repeat(80));
      console.log(`✅ Booking: ${bookingData.confirmationCode} (booking_id: ${parentBooking.bookingId})`);
      console.log(`✅ Activity: ${bookingData.bookingId} - ${bookingData.title}`);
      console.log(`✅ Operation: ${existingActivity ? 'UPDATED existing' : 'INSERTED new'} activity`);

      // Show final count of activities for this booking
      const { data: finalActivities } = await supabase
        .from('activity_bookings')
        .select('activity_booking_id')
        .eq('booking_id', parentBooking.bookingId);

      console.log(`✅ Total activities for this booking: ${finalActivities?.length || 0}`);
      console.log('=' .repeat(80));

      // 7. NUOVO: Valida età partecipanti e auto-fix swap OTA
      await this.validateBookingAges(bookingData.bookingId);

      console.log('🎉 BOOKING_UPDATED completato!');

    } catch (error) {
      console.error('❌ Errore in BOOKING_UPDATED:', error);
      throw error;
    }
  }
  
  // Gestisce cancellazione di attività
  private async handleBookingItemCancelled(bookingData: any): Promise<void> {
    console.log('❌ Gestione BOOKING_ITEM_CANCELLED:', bookingData.confirmationCode);
    console.log('=' .repeat(80));
    console.log('📋 CANCELLATION DEBUG - Dettagli cancellazione');
    console.log('=' .repeat(80));

    try {
      // CANCELLATION DEBUG: Mostra info prima della cancellazione
      const { data: activityBefore, error: beforeError } = await supabase
        .from('activity_bookings')
        .select('activity_booking_id, booking_id, status, product_title, start_date_time')
        .eq('activity_booking_id', bookingData.bookingId)
        .single();

      if (activityBefore) {
        console.log('📋 Activity da cancellare:');
        console.log('   📌 activity_booking_id:', activityBefore.activity_booking_id);
        console.log('   📌 booking_id (parent):', activityBefore.booking_id);
        console.log('   📌 status PRIMA:', activityBefore.status);
        console.log('   📌 product_title:', activityBefore.product_title);
        console.log('   📌 start_date_time:', activityBefore.start_date_time);

        // Check altre activities per questo booking
        const { data: allActivities } = await supabase
          .from('activity_bookings')
          .select('activity_booking_id, status, product_title')
          .eq('booking_id', activityBefore.booking_id)
          .order('activity_booking_id', { ascending: true });

        if (allActivities && allActivities.length > 0) {
          console.log(`   📊 Altre activities per booking_id ${activityBefore.booking_id}: ${allActivities.length}`);
          allActivities.forEach((act: any, index: number) => {
            const marker = act.activity_booking_id === activityBefore.activity_booking_id ? '👉' : '  ';
            console.log(`      ${marker} ${index + 1}. activity_booking_id: ${act.activity_booking_id}, status: ${act.status}`);
          });
        }
      } else {
        console.log('⚠️ Activity non trovata nel DB prima della cancellazione');
      }

      console.log('=' .repeat(80));

      // Aggiorna solo lo status dell'attività a CANCELLED
      const { error } = await supabase
        .from('activity_bookings')
        .update({ status: 'CANCELLED' })
        .eq('activity_booking_id', bookingData.bookingId);

      if (error) throw error;

      console.log('✅ Attività cancellata:', bookingData.bookingId);
      console.log('   ⏩ Il prossimo BOOKING_UPDATED con nuova activity sarà un REBOOK!');

      // NUOVO: Sincronizza disponibilità dopo cancellazione
      await this.syncAvailabilityForBooking(bookingData);

      // Always create credit note on cancellation (if invoice exists)
      try {
        if (activityBefore) {
          console.log('💸 Creating credit note for cancelled activity:', bookingData.bookingId);
          await this.invoiceService.createCreditNote(
            activityBefore.booking_id,
            bookingData.bookingId,
            'webhook'
          );
        }
      } catch (creditNoteError) {
        console.error('⚠️ Errore in credit note (non-blocking):', creditNoteError);
        // Non propagare l'errore - la nota di credito non deve bloccare il webhook
      }

      // Trigger notification rules evaluation
      try {
        await this.triggerNotificationRules('booking_cancelled', activityBefore, bookingData);
      } catch (rulesError) {
        console.error('⚠️ Errore in notification rules (non-blocking):', rulesError);
        // Non propagare l'errore - le notifiche non devono bloccare il webhook
      }

    } catch (error) {
      console.error('❌ Errore in BOOKING_ITEM_CANCELLED:', error);
      throw error;
    }
  }

  // Trigger notification rules in tourmageddon-saas
  private async triggerNotificationRules(trigger: string, activityData: any, bookingData: any): Promise<void> {
    const tourmageddonUrl = process.env.TOURMAGEDDON_URL || 'https://tourmageddon.it';
    const webhookSecret = process.env.TOURMAGEDDON_WEBHOOK_SECRET || process.env.SUPABASE_WEBHOOK_SECRET;

    try {
      // Get additional data for the notification
      const { data: bookingInfo } = await supabase
        .from('bookings')
        .select(`
          booking_id,
          confirmation_code,
          total_price,
          currency,
          customers (
            first_name,
            last_name,
            email
          )
        `)
        .eq('booking_id', activityData?.booking_id)
        .single();

      // Get pax count
      const { data: pricingBookings } = await supabase
        .from('pricing_category_bookings')
        .select('quantity')
        .eq('activity_booking_id', activityData?.activity_booking_id);

      const paxCount = pricingBookings?.reduce((sum: number, pb: any) => sum + (pb.quantity || 0), 0) || 0;

      // Get voucher info
      const { data: vouchers } = await supabase
        .from('vouchers')
        .select('id, is_placeholder')
        .eq('activity_booking_id', activityData?.activity_booking_id);

      const vouchersWithNames = vouchers?.filter((v: any) => !v.is_placeholder) || [];

      const customer = bookingInfo?.customers as any;
      const customerName = customer ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim() : 'Unknown';

      const travelDate = activityData?.start_date_time ? new Date(activityData.start_date_time) : null;
      const daysUntilTravel = travelDate ? Math.ceil((travelDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;

      const payload = {
        trigger,
        data: {
          activity_name: activityData?.product_title || bookingData.productTitle || 'Unknown',
          product_name: activityData?.product_title || bookingData.productTitle || 'Unknown',
          booking_id: activityData?.booking_id || bookingData.bookingId,
          confirmation_code: bookingInfo?.confirmation_code || bookingData.confirmationCode,
          customer_name: customerName,
          customer_email: customer?.email || '',
          pax_count: paxCount,
          ticket_count: paxCount,
          travel_date: travelDate ? travelDate.toISOString().split('T')[0] : '',
          days_until_travel: daysUntilTravel,
          has_uploaded_vouchers: vouchersWithNames.length > 0,
          voucher_count: vouchersWithNames.length,
          total_price: bookingInfo?.total_price || 0,
          currency: bookingInfo?.currency || 'EUR',
        }
      };

      console.log('📤 Triggering notification rules:', trigger);
      console.log('   📋 Payload:', JSON.stringify(payload, null, 2));

      const bodyString = JSON.stringify(payload);
      const response = await fetch(`${tourmageddonUrl}/api/notification-rules/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyString).toString(),
          'x-webhook-secret': webhookSecret || '',
        },
        body: bodyString,
      });

      if (response.ok) {
        console.log('✅ Notification rules triggered successfully');
      } else {
        const errorText = await response.text();
        console.error('⚠️ Notification rules response error:', response.status, errorText);
      }
    } catch (error) {
      console.error('⚠️ Failed to trigger notification rules:', error);
    }
  }

  // 🚀 METODO OTTIMIZZATO: Usa syncAvailabilityOptimized invece di 11 chiamate separate
  private async syncAvailabilityForBooking(bookingData: any): Promise<void> {
    try {
      console.log('🔄 Sincronizzazione disponibilità per prenotazione:', bookingData.confirmationCode);
      
      const productId = bookingData.productId?.toString() || bookingData.product?.id?.toString();
      
      // Determina la data centrale
      let centralDate = null;
      
      if (bookingData.startDateTime) {
        centralDate = new Date(bookingData.startDateTime);
      } else if (bookingData.dateString) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(bookingData.dateString)) {
          centralDate = new Date(bookingData.dateString);
        } else {
          try {
            const dateMatch = bookingData.dateString.match(/\b(\w+)\s+(\d{1,2})\s+(\d{4})\b/);
            if (dateMatch) {
              const monthsES: { [key: string]: string } = {
                'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
                'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
                'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
              };
              const monthsEN: { [key: string]: string } = {
                'january': '01', 'february': '02', 'march': '03', 'april': '04',
                'may': '05', 'june': '06', 'july': '07', 'august': '08',
                'september': '09', 'october': '10', 'november': '11', 'december': '12'
              };
              const monthName = dateMatch[1].toLowerCase();
              const month = monthsES[monthName] || monthsEN[monthName] || '01';
              const day = dateMatch[2].padStart(2, '0');
              const year = dateMatch[3];
              centralDate = new Date(`${year}-${month}-${day}`);
            }
          } catch (e) {
            console.error('Errore parsing data:', e);
          }
        }
      }
      
      if (productId && centralDate) {
        // 🚀 OTTIMIZZAZIONE: Usa una singola chiamata range invece di 11 chiamate separate
        const startDate = new Date(centralDate);
        const endDate = new Date(centralDate);
        
        // Calcola range: 5 giorni prima e 5 dopo
        startDate.setDate(startDate.getDate() - 5);
        endDate.setDate(endDate.getDate() + 5);
        
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];
        const centralDateStr = centralDate.toISOString().split('T')[0];
        
        console.log(`📅 Aggiornamento disponibilità per prodotto ${productId}`);
        console.log(`   📆 Data prenotazione: ${centralDateStr}`);
        console.log(`   🔄 Range ottimizzato: ${startDateStr} → ${endDateStr} (11 giorni)`);
        
        try {
          // 🚀 USA IL METODO OTTIMIZZATO (1 chiamata invece di 11!)
          const slotsSynced = await this.octoService.syncAvailabilityOptimized(
            productId, 
            startDateStr, 
            endDateStr
          );
          
          console.log(`✅ Disponibilità aggiornata: ${slotsSynced} slot sincronizzati con 1 chiamata!`);
          
        } catch (optimizedError: any) {
          console.warn(`⚠️ Metodo ottimizzato fallito: ${optimizedError.message}`);
          console.log('📌 Fallback al metodo tradizionale (11 chiamate separate)...');
          
          // FALLBACK: Se il metodo ottimizzato fallisce, usa quello tradizionale
          let successCount = 0;
          let failCount = 0;
          
          for (let offset = -5; offset <= 5; offset++) {
            const date = new Date(centralDate);
            date.setDate(date.getDate() + offset);
            
            // Skip se nel passato rispetto a oggi
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const dateAtMidnight = new Date(date);
            dateAtMidnight.setHours(0, 0, 0, 0);
            if (dateAtMidnight < today) {
              if (process.env.VERBOSE_SYNC === 'true') {
                console.log(`   ⏭️ Skip ${date.toISOString().split('T')[0]} (passato)`);
              }
              continue;
            }
            const dateStr = date.toISOString().split('T')[0];
            
            if (process.env.VERBOSE_SYNC === 'true') {
              console.log(`   📅 Sync ${dateStr} (${offset >= 0 ? '+' : ''}${offset} giorni)`);
            }
            
            try {
              await this.octoService.syncAvailability(productId, dateStr);
              successCount++;
            } catch (error: any) {
              console.error(`   ❌ Errore sync ${dateStr}:`, error.message);
              failCount++;
            }
            
            // Piccola pausa tra le chiamate
            if (offset < 5) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          }
          
          console.log(`✅ Fallback completato: ${successCount} successi, ${failCount} falliti`);
        }
        
      } else {
        console.log('⚠️ Dati mancanti per sincronizzazione disponibilità:', { 
          productId, 
          centralDate: centralDate?.toISOString()
        });
      }
    } catch (error) {
      console.error('❌ Errore nella sincronizzazione disponibilità post-webhook:', error);
      // Non propagare l'errore per non bloccare il webhook
    }
  }

  // NUOVO METODO: Crea prodotto placeholder per Channel Manager
  private async ensureProductExistsForChannelManager(productId: string, activityData: any): Promise<void> {
    try {
      // Verifica se il prodotto esiste già
      const { data: existingProduct } = await supabase
        .from('activities')
        .select('activity_id')
        .eq('activity_id', productId)
        .single();
      
      if (existingProduct) {
        return; // Il prodotto esiste già
      }
      
      console.log(`📦 Creazione prodotto Channel Manager ${productId}: ${activityData.title}`);
      
      // Crea il prodotto con i dati disponibili dal webhook
      // Marcalo come "Channel Manager" così sai che non è sincronizzato via OCTO
      const { error } = await supabase
        .from('activities')
        .insert({
          activity_id: productId,
          title: activityData.title || `Prodotto Channel Manager ${productId}`,
          description: `[CHANNEL MANAGER] ${activityData.product?.description || 'Prodotto gestito tramite Channel Manager API'}`,
          duration_amount: null,
          duration_unit: null,
          price_currency: 'EUR',
          price_amount: activityData.totalPrice || 0,
          available_currencies: ['EUR'],
          instant_confirmation: true,
          instant_delivery: false,
          requires_date: true,
          requires_time: true,
          default_option_id: null,
          max_capacity: null,
          last_sync: new Date().toISOString()
        });
      
      if (error) {
        console.error(`❌ Errore creando prodotto Channel Manager ${productId}:`, error);
        throw error;
      } else {
        console.log(`✅ Prodotto Channel Manager ${productId} creato`);
      }
    } catch (error) {
      console.error('Errore in ensureProductExistsForChannelManager:', error);
      // Non propagare l'errore se è solo il check di esistenza
      if ((error as any).code !== 'PGRST116') {
        throw error;
      }
    }
  }

  // Funzione per salvare o aggiornare un cliente
  private async saveOrUpdateCustomer(customer: any): Promise<number> {
    const { data, error } = await supabase
      .from('customers')
      .upsert({
        customer_id: customer.id,
        uuid: customer.uuid,
        email: customer.email,
        first_name: customer.firstName,
        last_name: customer.lastName,
        phone_number: customer.phoneNumber
      }, {
        onConflict: 'customer_id',
        ignoreDuplicates: false
      })
      .select('customer_id')
      .single();
    
    if (error) throw error;
    return data.customer_id;
  }
  
  // Funzione per salvare o aggiornare un venditore
  private async saveOrUpdateSeller(seller: any): Promise<number> {
    const { data, error } = await supabase
      .from('sellers')
      .upsert({
        seller_id: seller.id,
        title: seller.title,
        email: seller.emailAddress,
        phone_number: seller.phoneNumber,
        currency_code: seller.currencyCode,
        country_code: seller.countryCode,
        website: seller.website
      }, {
        onConflict: 'seller_id',
        ignoreDuplicates: false
      })
      .select('seller_id')
      .single();
    
    if (error) throw error;
    return data.seller_id;
  }
  
  // Funzione per salvare la prenotazione principale
  private async saveMainBooking(bookingData: any): Promise<void> {
    const creationDate = new Date(bookingData.creationDate);
    
    const { error } = await supabase
      .from('bookings')
      .upsert({
        booking_id: bookingData.bookingId,
        confirmation_code: bookingData.confirmationCode,
        external_booking_reference: bookingData.externalBookingReference || '',
        status: bookingData.status,
        currency: bookingData.currency,
        total_price: bookingData.totalPrice,
        total_paid: bookingData.totalPaid,
        total_due: bookingData.totalDue,
        payment_type: bookingData.paymentType,
        language: bookingData.language,
        action: 'BOOKING_CONFIRMED',
        creation_date: creationDate.toISOString()
      }, {
        onConflict: 'booking_id',
        ignoreDuplicates: false
      });
    
    if (error) throw error;
  }
  
  // Funzione per aggiornare la prenotazione principale
  private async updateMainBooking(bookingData: any): Promise<void> {
    const { error } = await supabase
      .from('bookings')
      .update({
        status: bookingData.status,
        total_price: bookingData.totalPrice,
        total_paid: bookingData.totalPaid,
        total_due: bookingData.totalDue,
        payment_type: bookingData.paymentType,
        action: 'BOOKING_UPDATED'
      })
      .eq('booking_id', bookingData.bookingId);

    if (error) throw error;
  }

  // Funzione per aggiornare i totali del booking (somma delle activity_bookings)
  private async updateBookingPricingTotals(bookingId: number): Promise<void> {
    try {
      // Get all activity bookings for this booking
      const { data: activities, error: fetchError } = await supabase
        .from('activity_bookings')
        .select('original_price, total_price, discount_amount, commission_amount, net_price')
        .eq('booking_id', bookingId);

      if (fetchError) {
        console.error('❌ Error fetching activities for pricing totals:', fetchError);
        return;
      }

      if (!activities || activities.length === 0) {
        return;
      }

      // Calculate sums
      let totalOriginalPrice: number | null = null;
      let totalPrice: number | null = null;
      let totalDiscountAmount: number | null = null;
      let totalCommissionAmount: number | null = null;
      let totalNetPrice: number | null = null;

      for (const activity of activities) {
        if (activity.original_price !== null) {
          totalOriginalPrice = (totalOriginalPrice || 0) + Number(activity.original_price);
        }
        if (activity.total_price !== null) {
          totalPrice = (totalPrice || 0) + Number(activity.total_price);
        }
        if (activity.discount_amount !== null) {
          totalDiscountAmount = (totalDiscountAmount || 0) + Number(activity.discount_amount);
        }
        if (activity.commission_amount !== null) {
          totalCommissionAmount = (totalCommissionAmount || 0) + Number(activity.commission_amount);
        }
        if (activity.net_price !== null) {
          totalNetPrice = (totalNetPrice || 0) + Number(activity.net_price);
        }
      }

      // Build update object with non-null values
      const updateData: Record<string, any> = {};
      if (totalOriginalPrice !== null) updateData.original_price = totalOriginalPrice;
      if (totalPrice !== null) updateData.total_price = totalPrice;
      if (totalDiscountAmount !== null) updateData.discount_amount = totalDiscountAmount;
      if (totalCommissionAmount !== null) updateData.commission_amount = totalCommissionAmount;
      if (totalNetPrice !== null) updateData.net_price = totalNetPrice;

      // Only update if we have values
      if (Object.keys(updateData).length > 0) {
        const { error: updateError } = await supabase
          .from('bookings')
          .update(updateData)
          .eq('booking_id', bookingId);

        if (updateError) {
          console.error('❌ Error updating booking pricing totals:', updateError);
          return;
        }

        console.log(`💰 Booking ${bookingId} pricing totals updated:`);
        console.log(`   original_price=${totalOriginalPrice}, total_price=${totalPrice}, net_price=${totalNetPrice}`);
        console.log(`   discount_amount=${totalDiscountAmount}, commission_amount=${totalCommissionAmount}`);
      }
    } catch (error) {
      console.error('❌ Error in updateBookingPricingTotals:', error);
      // Non-blocking - don't throw
    }
  }

  // Alias for backward compatibility
  private async updateBookingEurTotals(bookingId: number): Promise<void> {
    return this.updateBookingPricingTotals(bookingId);
  }

  // Funzione per collegare la prenotazione al cliente
  private async linkBookingToCustomer(bookingId: number, customerId: number): Promise<void> {
    const { error } = await supabase
      .from('booking_customers')
      .upsert({
        booking_id: bookingId,
        customer_id: customerId
      }, {
        onConflict: 'booking_id,customer_id',
        ignoreDuplicates: true
      });
    
    if (error) throw error;
  }
  
  // Helper: Ottieni il titolo canonico dall'activities table invece che dal webhook
  private async getCanonicalActivityTitle(activityId: string): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('activities')
        .select('title')
        .eq('activity_id', activityId)
        .single();

      if (error || !data) {
        console.warn(`⚠️ Impossibile trovare title per activity_id ${activityId}, uso titolo dal webhook`);
        return null;
      }

      return data.title;
    } catch (error) {
      console.warn(`⚠️ Errore recuperando title per activity_id ${activityId}:`, error);
      return null;
    }
  }

  // Funzione per salvare l'attività dal root object (AGGIORNATA CON SELLER)
  private async saveActivityBookingFromRoot(activityData: any, parentBookingId: number, sellerName: string = 'EnRoma.com', parentBooking?: any): Promise<void> {
    console.log('🔧 saveActivityBookingFromRoot - Inizio');
    console.log('   activityData.bookingId:', activityData.bookingId);
    console.log('   parentBookingId:', parentBookingId);
    console.log('   activityData.startDateTime:', activityData.startDateTime);
    console.log('   activityData.endDateTime:', activityData.endDateTime);

    if (!activityData.startDateTime || !activityData.endDateTime) {
      console.error('❌ Missing required datetime fields!');
      console.error('   startDateTime:', activityData.startDateTime);
      console.error('   endDateTime:', activityData.endDateTime);
      throw new Error('Missing startDateTime or endDateTime');
    }

    const startDateTime = new Date(activityData.startDateTime);
    const endDateTime = new Date(activityData.endDateTime);

    console.log('   Parsed startDateTime:', startDateTime.toISOString());
    console.log('   Parsed endDateTime:', endDateTime.toISOString());

    // Verifica se il prodotto esiste, altrimenti crealo (per prodotti Channel Manager)
    const productId = activityData.productId?.toString() || activityData.product?.id?.toString();
    console.log('   productId:', productId);

    if (productId) {
      await this.ensureProductExistsForChannelManager(productId, activityData);
    }

    // NUOVO: Usa il titolo canonico dalla tabella activities invece che dal webhook
    const canonicalTitle = await this.getCanonicalActivityTitle(productId);
    const productTitle = canonicalTitle || activityData.title;

    console.log('   productTitle finale:', productTitle);

    if (canonicalTitle && canonicalTitle !== activityData.title) {
      console.log(`📝 Uso titolo canonico: "${canonicalTitle}" invece di "${activityData.title}"`);
    }

    // ============================================
    // COMPREHENSIVE PRICING EXTRACTION
    // ============================================
    // Two scenarios:
    // 1. DIRECT SALES (EnRoma.com seller): Use priceWithDiscount, discountPercentage, etc.
    // 2. RESELLER SALES (agent present): Use sellerInvoice for EUR pricing and commission

    let originalPrice: number | null = null;
    let totalPrice: number | null = null;
    let discountPercentage: number | null = null;
    let discountAmount: number | null = null;
    let commissionPercentage: number | null = null;
    let commissionAmount: number | null = null;
    let netPrice: number | null = null;
    const paidType: string | null = activityData.paidType || null;
    const currency: string | null = activityData.currency || null;

    // Check if this is a reseller/agent booking (has sellerInvoice or agentInvoice with EUR)
    const sellerInvoice = activityData.sellerInvoice;
    const agentInvoice = activityData.agentInvoice;
    const isResellerBooking = (sellerInvoice && sellerInvoice.currency === 'EUR') ||
                               (agentInvoice && agentInvoice.currency === 'EUR');

    if (isResellerBooking) {
      // RESELLER/AGENT SCENARIO - use whichever invoice exists
      const invoice = (sellerInvoice && sellerInvoice.currency === 'EUR') ? sellerInvoice : agentInvoice;
      const invoiceType = (sellerInvoice && sellerInvoice.currency === 'EUR') ? 'sellerInvoice' : 'agentInvoice';

      console.log(`💼 RESELLER/AGENT BOOKING detected - extracting from ${invoiceType}`);

      // For sellerInvoice: net_price = totalAsMoney (after commission)
      // For agentInvoice: net_price = totalDiscountedAsMoney (after commission discount)
      if (invoiceType === 'sellerInvoice') {
        netPrice = invoice.totalAsMoney?.amount || invoice.total || null;
      } else {
        // agentInvoice uses totalDiscountedAsMoney for net price
        netPrice = invoice.totalDiscountedAsMoney?.amount || invoice.totalDiscounted || null;
      }

      // Extract from line items
      if (invoice.lineItems && invoice.lineItems.length > 0) {
        const firstLineItem = invoice.lineItems[0];
        commissionPercentage = firstLineItem.commission || null;

        if (invoiceType === 'sellerInvoice') {
          // For sellerInvoice: total_price = sum of totalWithoutCommission
          totalPrice = invoice.lineItems.reduce((sum: number, item: any) => {
            const itemTotal = item.totalWithoutCommissionAsMoney?.amount ||
                             (item.unitPrice * (item.quantity || 1));
            return sum + itemTotal;
          }, 0);
        } else {
          // For agentInvoice: total_price = sum of totalAsMoney (retail price)
          totalPrice = invoice.lineItems.reduce((sum: number, item: any) => {
            const itemTotal = item.totalAsMoney?.amount || item.total ||
                             (item.unitPrice * (item.quantity || 1));
            return sum + itemTotal;
          }, 0);
        }

        // Original price = same as total_price for resellers/agents
        originalPrice = totalPrice;

        // Commission amount = total_price - net_price
        if (totalPrice !== null && netPrice !== null) {
          commissionAmount = Number((totalPrice - netPrice).toFixed(2));
        }
      }

      console.log(`💶 Reseller/Agent Pricing (${invoiceType}):`);
      console.log(`   Customer paid (total_price): €${totalPrice}`);
      console.log(`   Commission: ${commissionPercentage}% (€${commissionAmount})`);
      console.log(`   EnRoma receives (net_price): €${netPrice}`);

    } else {
      // DIRECT SALES SCENARIO (EnRoma.com as seller)
      console.log('🏪 DIRECT SALES detected - extracting from activity data');

      // Original price = totalPrice (pre-discount)
      originalPrice = activityData.totalPrice || null;

      // Total price = priceWithDiscount (what customer should pay)
      totalPrice = activityData.priceWithDiscount || activityData.totalPrice || null;

      // Discount info
      discountPercentage = activityData.discountPercentage || null;
      discountAmount = activityData.discountAmount || null;

      // Net price = same as total_price for direct sales (no commission)
      netPrice = totalPrice;

      console.log(`💰 Direct Sales Pricing:`);
      console.log(`   Original price: €${originalPrice}`);
      console.log(`   Discount: ${discountPercentage}% (€${discountAmount})`);
      console.log(`   Customer pays (total_price): €${totalPrice}`);
      console.log(`   EnRoma receives (net_price): €${netPrice}`);
    }

    // Calculate total_paid and total_due from parentBooking
    // For single activity bookings, use booking values directly
    // For multi-activity, this will be the proportion based on this activity's price
    let activityTotalPaid: number | null = null;
    let activityTotalDue: number | null = null;

    if (parentBooking) {
      const bookingTotalPrice = parentBooking.totalPrice || 0;
      const bookingTotalPaid = parentBooking.totalPaid || 0;
      const bookingTotalDue = parentBooking.totalDue || 0;

      if (bookingTotalPrice > 0 && totalPrice !== null) {
        // Calculate proportion: this activity's share of total paid/due
        const proportion = totalPrice / bookingTotalPrice;
        activityTotalPaid = Number((bookingTotalPaid * proportion).toFixed(2));
        activityTotalDue = Number((bookingTotalDue * proportion).toFixed(2));
      } else {
        // Fallback: use booking values directly
        activityTotalPaid = bookingTotalPaid;
        activityTotalDue = bookingTotalDue;
      }

      console.log(`💳 Payment info from parentBooking:`);
      console.log(`   Booking: totalPrice=${bookingTotalPrice}, totalPaid=${bookingTotalPaid}, totalDue=${bookingTotalDue}`);
      console.log(`   Activity: totalPaid=${activityTotalPaid}, totalDue=${activityTotalDue}`);
    }

    // Extract vendor/supplier info
    const supplierName = activityData.product?.vendor?.title || null;
    if (supplierName) {
      console.log(`🏭 Supplier (vendor): ${supplierName}`);
    }

    const dataToUpsert: Record<string, any> = {
      booking_id: parentBookingId,
      activity_booking_id: activityData.bookingId,
      product_id: activityData.productId || activityData.product?.id,
      activity_id: productId,
      product_title: productTitle,
      product_confirmation_code: activityData.productConfirmationCode,
      start_date_time: startDateTime.toISOString(),
      end_date_time: endDateTime.toISOString(),
      status: activityData.status,
      // Comprehensive pricing fields
      original_price: originalPrice,
      total_price: totalPrice,
      discount_percentage: discountPercentage,
      discount_amount: discountAmount,
      commission_percentage: commissionPercentage,
      commission_amount: commissionAmount,
      net_price: netPrice,
      paid_type: paidType,
      currency: currency,
      total_paid: activityTotalPaid,
      total_due: activityTotalDue,
      // Other fields
      rate_id: activityData.rateId,
      rate_title: activityData.rateTitle,
      start_time: activityData.startTime,
      date_string: activityData.dateString,
      activity_seller: sellerName,
      activity_supplier: supplierName
    };

    console.log('📦 Dati da inserire in activity_bookings:', JSON.stringify(dataToUpsert, null, 2));

    const { error } = await supabase
      .from('activity_bookings')
      .upsert(dataToUpsert, {
        onConflict: 'activity_booking_id',
        ignoreDuplicates: false
      });

    if (error) {
      console.error('❌ Errore salvando activity booking:', error);
      throw error;
    }

    console.log(`✅ Activity booking salvato con seller: ${sellerName}`);
  }
  
  // Funzione per aggiornare l'attività (AGGIORNATA CON COMPREHENSIVE PRICING)
  private async updateActivityBooking(activityData: any, parentBookingId: number, sellerName: string = 'EnRoma.com', parentBooking?: any): Promise<void> {
    const startDateTime = new Date(activityData.startDateTime);
    const endDateTime = new Date(activityData.endDateTime);

    // Assicurati che il prodotto esista anche per gli update
    const productId = activityData.productId?.toString() || activityData.product?.id?.toString();
    if (productId) {
      await this.ensureProductExistsForChannelManager(productId, activityData);
    }

    // NUOVO: Usa il titolo canonico dalla tabella activities invece che dal webhook
    const canonicalTitle = await this.getCanonicalActivityTitle(productId);
    const productTitle = canonicalTitle || activityData.title;

    if (canonicalTitle && canonicalTitle !== activityData.title) {
      console.log(`📝 Uso titolo canonico: "${canonicalTitle}" invece di "${activityData.title}"`);
    }

    // ============================================
    // COMPREHENSIVE PRICING EXTRACTION (UPDATE)
    // ============================================
    let originalPrice: number | null = null;
    let totalPrice: number | null = null;
    let discountPercentage: number | null = null;
    let discountAmount: number | null = null;
    let commissionPercentage: number | null = null;
    let commissionAmount: number | null = null;
    let netPrice: number | null = null;
    const paidType: string | null = activityData.paidType || null;
    const currency: string | null = activityData.currency || null;

    // Check if this is a reseller/agent booking
    const sellerInvoice = activityData.sellerInvoice;
    const agentInvoice = activityData.agentInvoice;
    const isResellerBooking = (sellerInvoice && sellerInvoice.currency === 'EUR') ||
                               (agentInvoice && agentInvoice.currency === 'EUR');

    if (isResellerBooking) {
      // RESELLER/AGENT SCENARIO
      const invoice = (sellerInvoice && sellerInvoice.currency === 'EUR') ? sellerInvoice : agentInvoice;
      const invoiceType = (sellerInvoice && sellerInvoice.currency === 'EUR') ? 'sellerInvoice' : 'agentInvoice';
      console.log(`💼 RESELLER/AGENT BOOKING (update) - extracting from ${invoiceType}`);

      if (invoiceType === 'sellerInvoice') {
        netPrice = invoice.totalAsMoney?.amount || invoice.total || null;
      } else {
        netPrice = invoice.totalDiscountedAsMoney?.amount || invoice.totalDiscounted || null;
      }

      if (invoice.lineItems && invoice.lineItems.length > 0) {
        const firstLineItem = invoice.lineItems[0];
        commissionPercentage = firstLineItem.commission || null;

        if (invoiceType === 'sellerInvoice') {
          totalPrice = invoice.lineItems.reduce((sum: number, item: any) => {
            const itemTotal = item.totalWithoutCommissionAsMoney?.amount ||
                             (item.unitPrice * (item.quantity || 1));
            return sum + itemTotal;
          }, 0);
        } else {
          totalPrice = invoice.lineItems.reduce((sum: number, item: any) => {
            const itemTotal = item.totalAsMoney?.amount || item.total ||
                             (item.unitPrice * (item.quantity || 1));
            return sum + itemTotal;
          }, 0);
        }

        originalPrice = totalPrice;

        if (totalPrice !== null && netPrice !== null) {
          commissionAmount = Number((totalPrice - netPrice).toFixed(2));
        }
      }

      console.log(`💶 Reseller/Agent Pricing (update): total=${totalPrice}, commission=${commissionPercentage}%, net=${netPrice}`);

    } else {
      // DIRECT SALES SCENARIO
      console.log('🏪 DIRECT SALES (update) - extracting from activity data');

      originalPrice = activityData.totalPrice || null;
      totalPrice = activityData.priceWithDiscount || activityData.totalPrice || null;
      discountPercentage = activityData.discountPercentage || null;
      discountAmount = activityData.discountAmount || null;
      netPrice = totalPrice;

      console.log(`💰 Direct Sales Pricing (update): original=${originalPrice}, total=${totalPrice}, net=${netPrice}`);
    }

    // Calculate total_paid and total_due from parentBooking
    let activityTotalPaid: number | null = null;
    let activityTotalDue: number | null = null;

    if (parentBooking) {
      const bookingTotalPrice = parentBooking.totalPrice || 0;
      const bookingTotalPaid = parentBooking.totalPaid || 0;
      const bookingTotalDue = parentBooking.totalDue || 0;

      if (bookingTotalPrice > 0 && totalPrice !== null) {
        const proportion = totalPrice / bookingTotalPrice;
        activityTotalPaid = Number((bookingTotalPaid * proportion).toFixed(2));
        activityTotalDue = Number((bookingTotalDue * proportion).toFixed(2));
      } else {
        activityTotalPaid = bookingTotalPaid;
        activityTotalDue = bookingTotalDue;
      }

      console.log(`💳 Payment info (update): totalPaid=${activityTotalPaid}, totalDue=${activityTotalDue}`);
    }

    // Extract vendor/supplier info
    const supplierName = activityData.product?.vendor?.title || null;
    if (supplierName) {
      console.log(`🏭 Supplier (vendor): ${supplierName}`);
    }

    const updateData: Record<string, any> = {
      start_date_time: startDateTime.toISOString(),
      end_date_time: endDateTime.toISOString(),
      status: activityData.status,
      product_title: productTitle,
      rate_title: activityData.rateTitle,
      start_time: activityData.startTime,
      date_string: activityData.dateString,
      activity_seller: sellerName,
      activity_supplier: supplierName,
      // Comprehensive pricing fields
      original_price: originalPrice,
      total_price: totalPrice,
      discount_percentage: discountPercentage,
      discount_amount: discountAmount,
      commission_percentage: commissionPercentage,
      commission_amount: commissionAmount,
      net_price: netPrice,
      paid_type: paidType,
      currency: currency,
      total_paid: activityTotalPaid,
      total_due: activityTotalDue
    };

    const { error } = await supabase
      .from('activity_bookings')
      .update(updateData)
      .eq('activity_booking_id', activityData.bookingId);

    if (error) {
      console.error('❌ Errore aggiornando activity booking:', error);
      throw error;
    }

    console.log(`✅ Activity booking aggiornato con seller: ${sellerName}, supplier: ${supplierName}`);
  }
  
  // NUOVO: Sincronizza partecipanti in modo intelligente (add/remove/match)
  private async syncParticipantsIntelligently(
    activityBookingId: number,
    webhookParticipants: any[],
    parentBookingId: number,
    confirmationCode: string
  ): Promise<void> {
    try {
      console.log(`🔄 Sincronizzazione intelligente partecipanti per activity_booking ${activityBookingId}`);

      // 1. Recupera partecipanti esistenti dal DB
      const { data: existingParticipants, error: fetchError } = await supabase
        .from('pricing_category_bookings')
        .select('*')
        .eq('activity_booking_id', activityBookingId);

      if (fetchError) throw fetchError;

      const existingCount = existingParticipants?.length || 0;
      const webhookCount = webhookParticipants.length;

      console.log(`   📊 DB partecipanti: ${existingCount}, Webhook partecipanti: ${webhookCount}`);

      // 2. Crea mappa dei partecipanti dal webhook (usando pricing_category_booking_id)
      const webhookParticipantMap = new Map(
        webhookParticipants.map(p => [p.id, p])
      );

      // 3. Identifica partecipanti da mantenere, rimuovere e aggiungere
      const toKeep: any[] = [];
      const toRemove: any[] = [];

      // Check quali partecipanti esistenti sono ancora nel webhook
      for (const existing of existingParticipants || []) {
        if (webhookParticipantMap.has(existing.pricing_category_booking_id)) {
          const webhookParticipant = webhookParticipantMap.get(existing.pricing_category_booking_id);

          // Check if passenger info changed
          const webhookFirstName = webhookParticipant.passengerInfo?.firstName?.trim() || null;
          const webhookLastName = webhookParticipant.passengerInfo?.lastName?.trim() || null;
          const dbFirstName = existing.passenger_first_name;
          const dbLastName = existing.passenger_last_name;

          const namesChanged = webhookFirstName !== dbFirstName || webhookLastName !== dbLastName;

          if (namesChanged) {
            // UPDATE: Names changed, update the participant
            await this.savePricingCategoryBooking(webhookParticipant, activityBookingId, true);

            console.log(`   🔄 Aggiornato participant ${existing.pricing_category_booking_id}: "${dbFirstName} ${dbLastName}" → "${webhookFirstName || 'DA'} ${webhookLastName || 'CERCARE'}"`);

            // Log UPDATE
            await this.logParticipantSync({
              activity_booking_id: activityBookingId,
              booking_id: parentBookingId,
              confirmation_code: confirmationCode,
              sync_action: 'UPDATE',
              pricing_category_booking_id: existing.pricing_category_booking_id,
              pricing_category_id: existing.pricing_category_id,
              pricing_category_title: existing.booked_title,
              passenger_first_name: webhookFirstName || 'DA',
              passenger_last_name: webhookLastName || 'CERCARE',
              quantity: existing.quantity,
              occupancy: existing.occupancy,
              webhook_participant_count: webhookCount,
              db_participant_count_before: existingCount,
              db_participant_count_after: existingCount,
              raw_participant_data: webhookParticipant,
              notes: `Passenger info updated: "${dbFirstName} ${dbLastName}" → "${webhookFirstName || 'DA'} ${webhookLastName || 'CERCARE'}"`
            });
          } else {
            // MATCH: No change, just log it
            await this.logParticipantSync({
              activity_booking_id: activityBookingId,
              booking_id: parentBookingId,
              confirmation_code: confirmationCode,
              sync_action: 'MATCH',
              pricing_category_booking_id: existing.pricing_category_booking_id,
              pricing_category_id: existing.pricing_category_id,
              pricing_category_title: existing.booked_title,
              passenger_first_name: existing.passenger_first_name,
              passenger_last_name: existing.passenger_last_name,
              quantity: existing.quantity,
              occupancy: existing.occupancy,
              webhook_participant_count: webhookCount,
              db_participant_count_before: existingCount,
              db_participant_count_after: existingCount,
              raw_participant_data: webhookParticipant,
              notes: 'Participant matched in webhook - no changes'
            });
          }

          toKeep.push(existing);
        } else {
          toRemove.push(existing);

          // Log REMOVE
          await this.logParticipantSync({
            activity_booking_id: activityBookingId,
            booking_id: parentBookingId,
            confirmation_code: confirmationCode,
            sync_action: 'REMOVE',
            pricing_category_booking_id: existing.pricing_category_booking_id,
            pricing_category_id: existing.pricing_category_id,
            pricing_category_title: existing.booked_title,
            passenger_first_name: existing.passenger_first_name,
            passenger_last_name: existing.passenger_last_name,
            quantity: existing.quantity,
            occupancy: existing.occupancy,
            webhook_participant_count: webhookCount,
            db_participant_count_before: existingCount,
            db_participant_count_after: existingCount - 1,
            raw_participant_data: null,
            notes: 'Participant not in webhook - removing'
          });
        }
      }

      // 4. Identifica nuovi partecipanti da aggiungere
      const existingIds = new Set((existingParticipants || []).map(p => p.pricing_category_booking_id));
      const toAdd = webhookParticipants.filter(p => !existingIds.has(p.id));

      console.log(`   ✅ Mantengo: ${toKeep.length}, ❌ Rimuovo: ${toRemove.length}, ➕ Aggiungo: ${toAdd.length}`);

      // 5. Rimuovi partecipanti non più presenti
      for (const participant of toRemove) {
        const { error: deleteError } = await supabase
          .from('pricing_category_bookings')
          .delete()
          .eq('pricing_category_booking_id', participant.pricing_category_booking_id);

        if (deleteError) {
          console.error(`❌ Errore rimozione participant ${participant.pricing_category_booking_id}:`, deleteError);
        } else {
          console.log(`   ❌ Rimosso participant ${participant.pricing_category_booking_id} (${participant.booked_title})`);
        }
      }

      // 6. Aggiungi nuovi partecipanti con placeholder "DA CERCARE"
      let finalCount = existingCount - toRemove.length;

      for (const participant of toAdd) {
        // Usa i dati del passeggero se presenti, altrimenti "DA CERCARE"
        const passengerFirstName = participant.passengerInfo?.firstName || 'DA';
        const passengerLastName = participant.passengerInfo?.lastName || 'CERCARE';

        await this.savePricingCategoryBooking(participant, activityBookingId, true);
        finalCount++;

        console.log(`   ➕ Aggiunto participant ${participant.id} (${participant.bookedTitle}) - ${passengerFirstName} ${passengerLastName}`);

        // Log ADD
        await this.logParticipantSync({
          activity_booking_id: activityBookingId,
          booking_id: parentBookingId,
          confirmation_code: confirmationCode,
          sync_action: 'ADD',
          pricing_category_booking_id: participant.id,
          pricing_category_id: participant.pricingCategoryId,
          pricing_category_title: participant.bookedTitle,
          passenger_first_name: passengerFirstName,
          passenger_last_name: passengerLastName,
          quantity: participant.quantity,
          occupancy: participant.occupancy,
          webhook_participant_count: webhookCount,
          db_participant_count_before: existingCount,
          db_participant_count_after: finalCount,
          raw_participant_data: participant,
          notes: participant.passengerInfo ? 'New participant with passenger info' : 'New participant with placeholder DA CERCARE'
        });
      }

      console.log(`   🎯 Sincronizzazione completata: ${existingCount} → ${finalCount} partecipanti`);

    } catch (error) {
      console.error('❌ Errore nella sincronizzazione intelligente partecipanti:', error);
      throw error;
    }
  }

  // Helper: Log participant sync to database
  private async logParticipantSync(logData: {
    activity_booking_id: number;
    booking_id: number;
    confirmation_code: string;
    sync_action: 'ADD' | 'REMOVE' | 'MATCH' | 'UPDATE';
    pricing_category_booking_id: number;
    pricing_category_id: number;
    pricing_category_title: string;
    passenger_first_name: string | null;
    passenger_last_name: string | null;
    quantity: number;
    occupancy: number;
    webhook_participant_count: number;
    db_participant_count_before: number;
    db_participant_count_after: number;
    raw_participant_data: any;
    notes: string;
  }): Promise<void> {
    try {
      const { error } = await supabase
        .from('participant_sync_logs')
        .insert({
          activity_booking_id: logData.activity_booking_id,
          booking_id: logData.booking_id,
          confirmation_code: logData.confirmation_code,
          sync_action: logData.sync_action,
          pricing_category_booking_id: logData.pricing_category_booking_id,
          pricing_category_id: logData.pricing_category_id,
          pricing_category_title: logData.pricing_category_title,
          passenger_first_name: logData.passenger_first_name,
          passenger_last_name: logData.passenger_last_name,
          quantity: logData.quantity,
          occupancy: logData.occupancy,
          webhook_participant_count: logData.webhook_participant_count,
          db_participant_count_before: logData.db_participant_count_before,
          db_participant_count_after: logData.db_participant_count_after,
          raw_participant_data: logData.raw_participant_data,
          notes: logData.notes
        });

      if (error) {
        console.warn('⚠️ Non riesco a salvare log sincronizzazione participant:', error.message);
      }
    } catch (error) {
      // Non propagare errori di logging
      console.warn('⚠️ Errore logging participant sync:', error);
    }
  }

  // Elimina partecipanti esistenti prima di aggiornare
  private async deleteExistingParticipants(activityBookingId: number): Promise<void> {
    const { error } = await supabase
      .from('pricing_category_bookings')
      .delete()
      .eq('activity_booking_id', activityBookingId);
    
    if (error) throw error;
  }
  
  // Helper: Sanitize name by replacing hyphens with spaces
  private sanitizeName(name: string | null | undefined): string | null {
    if (!name) return null;
    // Replace hyphens with spaces (e.g., "Fernández-Caballero" → "Fernández Caballero")
    return name.trim().replace(/-/g, ' ');
  }

  // Funzione aggiornata per salvare i partecipanti CON info passeggeri
  private async savePricingCategoryBooking(participant: any, activityBookingId: number, usePlaceholder: boolean = false): Promise<void> {
    // Estrai info passeggero se esiste
    let passengerFirstName = null;
    let passengerLastName = null;
    let passengerDateOfBirth = null;

    if (participant.passengerInfo) {
      // Trim, sanitize (remove hyphens), and check for empty strings
      const firstName = this.sanitizeName(participant.passengerInfo.firstName);
      const lastName = this.sanitizeName(participant.passengerInfo.lastName);

      passengerFirstName = firstName || null;
      passengerLastName = lastName || null;

      // Converti data di nascita se presente
      if (participant.passengerInfo.dateOfBirth) {
        passengerDateOfBirth = new Date(participant.passengerInfo.dateOfBirth).toISOString().split('T')[0];
      }
    }

    // Se usePlaceholder è true e non ci sono dati passeggero, usa "DA CERCARE"
    if (usePlaceholder && (!passengerFirstName || !passengerLastName)) {
      passengerFirstName = passengerFirstName || 'DA';
      passengerLastName = passengerLastName || 'CERCARE';
    }
    
    const { error } = await supabase
      .from('pricing_category_bookings')
      .upsert({
        pricing_category_booking_id: participant.id,
        activity_booking_id: activityBookingId,
        pricing_category_id: participant.pricingCategoryId,
        booked_title: participant.bookedTitle,
        age: participant.age || 0,
        quantity: participant.quantity || 1,
        occupancy: participant.occupancy || 1,
        passenger_first_name: passengerFirstName,
        passenger_last_name: passengerLastName,
        passenger_date_of_birth: passengerDateOfBirth
      }, {
        onConflict: 'pricing_category_booking_id',
        ignoreDuplicates: false
      });
    
    if (error) throw error;
  }

  // NUOVO: Valida età partecipanti e auto-fix swap OTA
  private async validateBookingAges(activityBookingId: number): Promise<void> {
    try {
      console.log(`🔍 Validazione età partecipanti per booking ${activityBookingId}...`);

      // Chiama la funzione PostgreSQL che valida le età
      const { error } = await supabase.rpc('validate_booking_ages_for_booking', {
        p_booking_id: activityBookingId
      });

      if (error) {
        console.warn(`⚠️ Errore validazione età booking ${activityBookingId}:`, error.message);
        // Non propagare l'errore per non bloccare il webhook
        return;
      }

      console.log(`✅ Validazione età completata per booking ${activityBookingId}`);

    } catch (error) {
      console.warn('⚠️ Errore nella validazione età partecipanti:', error);
      // Non propagare l'errore per non bloccare il webhook
    }
  }
}