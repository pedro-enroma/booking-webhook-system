import { supabase } from '../config/supabase';
import { OctoService } from './octoService';

export class BookingService {
  private octoService: OctoService;

  constructor() {
    this.octoService = new OctoService();
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
      
      // 4.5 NUOVO: Estrai il nome del seller per usarlo nelle attività
      // Priorità: agent.title > seller.title > default 'EnRoma.com'
      const sellerName = bookingData.agent?.title || parentBooking.seller?.title || 'EnRoma.com';
      console.log('📌 Seller name per le attività:', sellerName);
      
      // 5. Salva l'attività CON IL SELLER
      await this.saveActivityBookingFromRoot(bookingData, parentBooking.bookingId, sellerName);
      console.log('✅ Attività salvata:', bookingData.title);
      
      // 6. Salva i partecipanti con info passeggeri
      if (bookingData.pricingCategoryBookings && bookingData.pricingCategoryBookings.length > 0) {
        for (const participant of bookingData.pricingCategoryBookings) {
          await this.savePricingCategoryBooking(participant, bookingData.bookingId);
        }
        console.log('✅ Partecipanti salvati:', bookingData.pricingCategoryBookings.length);
      }
      
      // 7. NUOVO: Sincronizza disponibilità
      await this.syncAvailabilityForBooking(bookingData);
      
      console.log('🎉 BOOKING_CONFIRMED completato!');
      
    } catch (error) {
      console.error('❌ Errore in BOOKING_CONFIRMED:', error);
      throw error;
    }
  }
  
  // Gestisce aggiornamenti alle prenotazioni esistenti
  private async handleBookingUpdated(bookingData: any): Promise<void> {
    console.log('🔄 Gestione BOOKING_UPDATED:', bookingData.confirmationCode);
    
    try {
      if (!bookingData.parentBooking) {
        console.log('⚠️ Nessun parentBooking trovato, skip');
        return;
      }
      
      const parentBooking = bookingData.parentBooking;
      
      // Aggiorna solo i dati che potrebbero essere cambiati
      
      // 1. Aggiorna cliente se presente
      if (parentBooking.customer) {
        await this.saveOrUpdateCustomer(parentBooking.customer);
        console.log('✅ Cliente aggiornato');
      }
      
      // 2. Aggiorna prenotazione principale
      await this.updateMainBooking(parentBooking);
      console.log('✅ Prenotazione principale aggiornata');
      
      // 2.5 NUOVO: Estrai il nome del seller per usarlo nelle attività
      // Priorità: agent.title > seller.title > default 'EnRoma.com'
      const sellerName = bookingData.agent?.title || parentBooking.seller?.title || 'EnRoma.com';
      console.log('📌 Seller name per aggiornamento attività:', sellerName);
      
      // 3. Aggiorna attività CON IL SELLER
      await this.updateActivityBooking(bookingData, parentBooking.bookingId, sellerName);
      console.log('✅ Attività aggiornata');
      
      // 4. Aggiorna partecipanti
      if (bookingData.pricingCategoryBookings) {
        // Prima elimina i partecipanti esistenti
        await this.deleteExistingParticipants(bookingData.bookingId);
        
        // Poi inserisce i nuovi
        for (const participant of bookingData.pricingCategoryBookings) {
          await this.savePricingCategoryBooking(participant, bookingData.bookingId);
        }
        console.log('✅ Partecipanti aggiornati');
      }
      
      // 5. NUOVO: Sincronizza disponibilità
      await this.syncAvailabilityForBooking(bookingData);
      
      console.log('🎉 BOOKING_UPDATED completato!');
      
    } catch (error) {
      console.error('❌ Errore in BOOKING_UPDATED:', error);
      throw error;
    }
  }
  
  // Gestisce cancellazione di attività
  private async handleBookingItemCancelled(bookingData: any): Promise<void> {
    console.log('❌ Gestione BOOKING_ITEM_CANCELLED:', bookingData.confirmationCode);
    
    try {
      // Aggiorna solo lo status dell'attività a CANCELLED
      const { error } = await supabase
        .from('activity_bookings')
        .update({ status: 'CANCELLED' })
        .eq('activity_booking_id', bookingData.bookingId);
      
      if (error) throw error;
      
      console.log('✅ Attività cancellata:', bookingData.bookingId);
      
      // NUOVO: Sincronizza disponibilità dopo cancellazione
      await this.syncAvailabilityForBooking(bookingData);
      
    } catch (error) {
      console.error('❌ Errore in BOOKING_ITEM_CANCELLED:', error);
      throw error;
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
  
  // Funzione per salvare l'attività dal root object (AGGIORNATA CON SELLER)
  private async saveActivityBookingFromRoot(activityData: any, parentBookingId: number, sellerName: string = 'EnRoma.com'): Promise<void> {
    const startDateTime = new Date(activityData.startDateTime);
    const endDateTime = new Date(activityData.endDateTime);
    
    // Verifica se il prodotto esiste, altrimenti crealo (per prodotti Channel Manager)
    const productId = activityData.productId?.toString() || activityData.product?.id?.toString();
    if (productId) {
      await this.ensureProductExistsForChannelManager(productId, activityData);
    }
    
    const { error } = await supabase
      .from('activity_bookings')
      .upsert({
        booking_id: parentBookingId,
        activity_booking_id: activityData.bookingId,
        product_id: activityData.productId || activityData.product?.id,
        activity_id: productId,
        product_title: activityData.title,
        product_confirmation_code: activityData.productConfirmationCode,
        start_date_time: startDateTime.toISOString(),
        end_date_time: endDateTime.toISOString(),
        status: activityData.status,
        total_price: activityData.totalPrice,
        rate_id: activityData.rateId,
        rate_title: activityData.rateTitle,
        start_time: activityData.startTime,
        date_string: activityData.dateString,
        activity_seller: sellerName  // NUOVO CAMPO!
      }, {
        onConflict: 'activity_booking_id',
        ignoreDuplicates: false
      });
    
    if (error) {
      console.error('❌ Errore salvando activity booking:', error);
      throw error;
    }
    
    console.log(`✅ Activity booking salvato con seller: ${sellerName}`);
  }
  
  // Funzione per aggiornare l'attività (AGGIORNATA CON SELLER)
  private async updateActivityBooking(activityData: any, parentBookingId: number, sellerName: string = 'EnRoma.com'): Promise<void> {
    const startDateTime = new Date(activityData.startDateTime);
    const endDateTime = new Date(activityData.endDateTime);
    
    // Assicurati che il prodotto esista anche per gli update
    const productId = activityData.productId?.toString() || activityData.product?.id?.toString();
    if (productId) {
      await this.ensureProductExistsForChannelManager(productId, activityData);
    }
    
    const { error } = await supabase
      .from('activity_bookings')
      .update({
        start_date_time: startDateTime.toISOString(),
        end_date_time: endDateTime.toISOString(),
        status: activityData.status,
        total_price: activityData.totalPrice,
        rate_title: activityData.rateTitle,
        start_time: activityData.startTime,
        date_string: activityData.dateString,
        activity_seller: sellerName  // NUOVO CAMPO!
      })
      .eq('activity_booking_id', activityData.bookingId);
    
    if (error) {
      console.error('❌ Errore aggiornando activity booking:', error);
      throw error;
    }
    
    console.log(`✅ Activity booking aggiornato con seller: ${sellerName}`);
  }
  
  // Elimina partecipanti esistenti prima di aggiornare
  private async deleteExistingParticipants(activityBookingId: number): Promise<void> {
    const { error } = await supabase
      .from('pricing_category_bookings')
      .delete()
      .eq('activity_booking_id', activityBookingId);
    
    if (error) throw error;
  }
  
  // Funzione aggiornata per salvare i partecipanti CON info passeggeri
  private async savePricingCategoryBooking(participant: any, activityBookingId: number): Promise<void> {
    // Estrai info passeggero se esiste
    let passengerFirstName = null;
    let passengerLastName = null;
    let passengerDateOfBirth = null;
    
    if (participant.passengerInfo) {
      passengerFirstName = participant.passengerInfo.firstName || null;
      passengerLastName = participant.passengerInfo.lastName || null;
      
      // Converti data di nascita se presente
      if (participant.passengerInfo.dateOfBirth) {
        passengerDateOfBirth = new Date(participant.passengerInfo.dateOfBirth).toISOString().split('T')[0];
      }
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
}