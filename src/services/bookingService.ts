import { supabase } from '../config/supabase';

export class BookingService {
  
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
      
      // 5. Salva l'attività
      await this.saveActivityBookingFromRoot(bookingData, parentBooking.bookingId);
      console.log('✅ Attività salvata:', bookingData.title);
      
      // 6. Salva i partecipanti con info passeggeri
      if (bookingData.pricingCategoryBookings && bookingData.pricingCategoryBookings.length > 0) {
        for (const participant of bookingData.pricingCategoryBookings) {
          await this.savePricingCategoryBooking(participant, bookingData.bookingId);
        }
        console.log('✅ Partecipanti salvati:', bookingData.pricingCategoryBookings.length);
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
      
      // 3. Aggiorna attività
      await this.updateActivityBooking(bookingData, parentBooking.bookingId);
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
      
    } catch (error) {
      console.error('❌ Errore in BOOKING_ITEM_CANCELLED:', error);
      throw error;
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
  
  // Funzione per salvare l'attività dal root object
  private async saveActivityBookingFromRoot(activityData: any, parentBookingId: number): Promise<void> {
    const startDateTime = new Date(activityData.startDateTime);
    const endDateTime = new Date(activityData.endDateTime);
    
    const { error } = await supabase
      .from('activity_bookings')
      .upsert({
        booking_id: parentBookingId,
        activity_booking_id: activityData.bookingId,
        product_id: activityData.productId || activityData.product?.id,
        product_title: activityData.title,
        product_confirmation_code: activityData.productConfirmationCode,
        start_date_time: startDateTime.toISOString(),
        end_date_time: endDateTime.toISOString(),
        status: activityData.status,
        total_price: activityData.totalPrice,
        rate_id: activityData.rateId,
        rate_title: activityData.rateTitle,
        start_time: activityData.startTime,
        date_string: activityData.dateString
      }, {
        onConflict: 'activity_booking_id',
        ignoreDuplicates: false
      });
    
    if (error) throw error;
  }
  
  // Funzione per aggiornare l'attività
  private async updateActivityBooking(activityData: any, parentBookingId: number): Promise<void> {
    const startDateTime = new Date(activityData.startDateTime);
    const endDateTime = new Date(activityData.endDateTime);
    
    const { error } = await supabase
      .from('activity_bookings')
      .update({
        start_date_time: startDateTime.toISOString(),
        end_date_time: endDateTime.toISOString(),
        status: activityData.status,
        total_price: activityData.totalPrice,
        rate_title: activityData.rateTitle,
        start_time: activityData.startTime,
        date_string: activityData.dateString
      })
      .eq('activity_booking_id', activityData.bookingId);
    
    if (error) throw error;
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