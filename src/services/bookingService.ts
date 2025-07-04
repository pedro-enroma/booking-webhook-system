import { supabase } from '../config/supabase';
import { BookingData } from '../types/booking.types';

// Servizio per gestire il salvataggio delle prenotazioni
export class BookingService {
  
  // Funzione principale che riceve i dati da Bokun e li salva nel database
  async saveBooking(bookingData: any): Promise<void> {
    console.log('📥 Ricevuta prenotazione attività:', bookingData.confirmationCode);
    
    try {
      // Controlla se c'è parentBooking (che contiene i dati principali)
      if (!bookingData.parentBooking) {
        console.log('⚠️ Nessun parentBooking trovato, skip');
        return;
      }
      
      const parentBooking = bookingData.parentBooking;
      
      // 1. Prima salviamo o aggiorniamo il cliente (ora da parentBooking)
      if (parentBooking.customer) {
        const customerId = await this.saveOrUpdateCustomer(parentBooking.customer);
        console.log('✅ Cliente salvato/aggiornato:', customerId);
        
        // 3. Salviamo la prenotazione principale (parentBooking)
        await this.saveMainBooking(parentBooking);
        console.log('✅ Prenotazione principale salvata');
        
        // 4. Colleghiamo la prenotazione al cliente
        await this.linkBookingToCustomer(parentBooking.bookingId, parentBooking.customer.id);
        console.log('✅ Prenotazione collegata al cliente');
      }
      
      // 2. Salviamo o aggiorniamo il venditore (se esiste)
      if (parentBooking.seller) {
        const sellerId = await this.saveOrUpdateSeller(parentBooking.seller);
        console.log('✅ Venditore salvato/aggiornato:', sellerId);
      }
      
      // 5. Salviamo l'attività specifica
      await this.saveActivityBookingFromRoot(bookingData, parentBooking.bookingId);
      console.log('✅ Attività salvata:', bookingData.title);
      
      // 6. Salviamo i partecipanti se esistono
      if (bookingData.pricingCategoryBookings && bookingData.pricingCategoryBookings.length > 0) {
        for (const participant of bookingData.pricingCategoryBookings) {
          await this.savePricingCategoryBooking(participant, bookingData.bookingId);
        }
        console.log('✅ Partecipanti salvati:', bookingData.pricingCategoryBookings.length);
      }
      
      console.log('🎉 Prenotazione completata con successo!');
      
    } catch (error) {
      console.error('❌ Errore nel salvare la prenotazione:', error);
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
  
  // Nuova funzione per salvare l'attività dal root object
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
  
  // Funzione per salvare i partecipanti
  private async savePricingCategoryBooking(participant: any, activityBookingId: number): Promise<void> {
    const { error } = await supabase
      .from('pricing_category_bookings')
      .upsert({
        pricing_category_booking_id: participant.id,
        activity_booking_id: activityBookingId,
        pricing_category_id: participant.pricingCategoryId,
        booked_title: participant.bookedTitle,
        age: participant.age || 0,
        quantity: participant.quantity || 1,
        occupancy: participant.occupancy || 1
      }, {
        onConflict: 'pricing_category_booking_id',
        ignoreDuplicates: false
      });
    
    if (error) throw error;
  }
}