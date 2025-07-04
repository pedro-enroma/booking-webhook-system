import { supabase } from '../config/supabase';
import { BookingData } from '../types/booking.types';

// Servizio per gestire il salvataggio delle prenotazioni
export class BookingService {
  
  // Funzione principale che riceve i dati da Bokun e li salva nel database
  async saveBooking(bookingData: BookingData): Promise<void> {
    console.log('📥 Ricevuta prenotazione:', bookingData.confirmationCode);
    
    try {
      // 1. Prima salviamo o aggiorniamo il cliente
      const customerId = await this.saveOrUpdateCustomer(bookingData.customer);
      console.log('✅ Cliente salvato/aggiornato:', customerId);
      
      // 2. Poi salviamo o aggiorniamo il venditore
      const sellerId = await this.saveOrUpdateSeller(bookingData.seller);
      console.log('✅ Venditore salvato/aggiornato:', sellerId);
      
      // 3. Salviamo la prenotazione principale
      await this.saveMainBooking(bookingData);
      console.log('✅ Prenotazione principale salvata');
      
      // 4. Colleghiamo la prenotazione al cliente
      await this.linkBookingToCustomer(bookingData.bookingId, bookingData.customer.id);
      console.log('✅ Prenotazione collegata al cliente');
      
      // 5. Salviamo tutte le attività prenotate
      for (const activity of bookingData.activityBookings) {
        await this.saveActivityBooking(activity, bookingData.bookingId);
        console.log('✅ Attività salvata:', activity.title);
        
        // 6. Per ogni attività, salviamo i partecipanti
        for (const participant of activity.pricingCategoryBookings) {
          await this.savePricingCategoryBooking(participant, activity.bookingId);
        }
        console.log('✅ Partecipanti salvati per attività:', activity.bookingId);
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
        onConflict: 'customer_id',  // Se esiste già un cliente con questo ID, aggiornalo
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
  private async saveMainBooking(bookingData: BookingData): Promise<void> {
    // Convertiamo il timestamp in una data leggibile
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
        action: bookingData.action,
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
        onConflict: 'booking_id,customer_id',  // Evita duplicati
        ignoreDuplicates: true
      });
    
    if (error) throw error;
  }
  
  // Funzione per salvare un'attività (tour)
  private async saveActivityBooking(activity: any, parentBookingId: number): Promise<void> {
    // Convertiamo i timestamp in date leggibili
    const startDateTime = new Date(activity.startDateTime);
    const endDateTime = new Date(activity.endDateTime);
    
    const { error } = await supabase
      .from('activity_bookings')
      .upsert({
        booking_id: parentBookingId,
        activity_booking_id: activity.bookingId,
        product_id: activity.product.id,
        product_title: activity.title,
        product_confirmation_code: activity.productConfirmationCode,
        start_date_time: startDateTime.toISOString(),
        end_date_time: endDateTime.toISOString(),
        status: activity.status,
        total_price: activity.totalPrice,
        rate_id: activity.rateId,
        rate_title: activity.rateTitle,
        start_time: activity.startTime,
        date_string: activity.dateString
      }, {
        onConflict: 'activity_booking_id',
        ignoreDuplicates: false
      });
    
    if (error) throw error;
  }
  
  // Funzione per salvare i partecipanti di un'attività
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