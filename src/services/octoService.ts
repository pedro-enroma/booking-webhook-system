import axios from 'axios';
import { supabase } from '../config/supabase';
import { OctoProduct, OctoAvailability } from '../types/octo.types';

export class OctoService {
  private apiKey: string;
  private baseUrl: string;
  private supplierId: string;

  constructor() {
    // Verifica variabili d'ambiente
    if (!process.env.BOKUN_API_KEY || !process.env.BOKUN_SUPPLIER_ID) {
      throw new Error('Mancano le variabili di ambiente BOKUN_API_KEY o BOKUN_SUPPLIER_ID');
    }
    
    this.apiKey = process.env.BOKUN_API_KEY;
    this.baseUrl = process.env.BOKUN_API_URL || 'https://api.bokun.io/octo/v1';
    this.supplierId = process.env.BOKUN_SUPPLIER_ID;
    
    console.log('🔧 OctoService inizializzato:');
    console.log('   - API URL:', this.baseUrl);
    console.log('   - Supplier ID:', this.supplierId);
  }

  // Headers corretti per Bokun OCTO API
  private getHeaders() {
    return {
      // Usa Authorization con formato vendor-specific per rimuovere il limite di 100 prodotti
      'Authorization': `Bearer ${this.apiKey}/${this.supplierId}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  // RIMOSSO: Funzione di conversione orario - Bokun invia già gli orari locali corretti

  // Sincronizza tutti i prodotti
  async syncProducts(): Promise<void> {
    try {
      console.log('🔄 Inizio sincronizzazione prodotti...');
      
      // Usa /products senza supplier ID (il vendor ID è nel token)
      const url = `${this.baseUrl}/products`;
      console.log('📍 URL chiamata:', url);
      console.log('🔑 Headers:', JSON.stringify(this.getHeaders(), null, 2));
      
      const response = await axios.get<OctoProduct[]>(url, {
        headers: this.getHeaders()
      });

      console.log('📡 Risposta ricevuta:', response.status);
      
      const products = response.data;
      console.log(`📦 Trovati ${products.length} prodotti (senza limite di paginazione)`);

      for (const product of products) {
        await this.saveProduct(product);
      }

      console.log('✅ Sincronizzazione prodotti completata');
    } catch (error: any) {
      console.error('❌ Errore sincronizzazione prodotti:', error.response?.data || error.message);
      
      if (error.response) {
        console.error('🚨 Dettagli errore:');
        console.error('   - Status:', error.response.status);
        console.error('   - Response:', JSON.stringify(error.response.data));
      }
      
      throw error;
    }
  }

  // Salva un singolo prodotto
  private async saveProduct(product: OctoProduct): Promise<void> {
    console.log(`💾 Salvando prodotto: ${product.id} - ${product.internalName || product.title}`);
    
    // Trova l'option ID di default se esiste
    let defaultOptionId = null;
    if (product.options && product.options.length > 0) {
      const defaultOption = product.options.find(opt => opt.default) || product.options[0];
      defaultOptionId = defaultOption.id;
    }
    
    const { error } = await supabase
      .from('activities')
      .upsert({
        activity_id: product.id,
        title: product.internalName || product.title || 'Senza titolo',
        description: product.description,
        duration_amount: product.durationAmount ? parseInt(product.durationAmount) : null,
        duration_unit: product.durationUnit,
        price_currency: product.defaultCurrency,
        price_amount: product.pricingFrom?.[0]?.amount || 0,
        available_currencies: product.availableCurrencies || [],
        instant_confirmation: product.instantConfirmation || false,
        instant_delivery: product.instantDelivery || false,
        requires_date: product.availabilityRequired || true,
        requires_time: product.availabilityType === 'START_TIME',
        default_option_id: defaultOptionId,  // Salva l'option ID
        last_sync: new Date().toISOString()
      }, {
        onConflict: 'activity_id'
      });

    if (error) {
      console.error(`❌ Errore salvando prodotto ${product.id}:`, error);
      throw error;
    }
    console.log(`✅ Salvato prodotto: ${product.internalName || product.title} (Option: ${defaultOptionId})`);
  }

  // Recupera l'option ID corretto per un prodotto - CORREZIONE QUI
  private async getProductOptionId(productId: string): Promise<string> {
    try {
      // Prima proviamo a recuperare dal database se l'abbiamo salvato
      const { data, error } = await supabase
        .from('activities')
        .select('default_option_id')
        .eq('activity_id', productId)
        .single();
      
      if (data && data.default_option_id) {
        console.log(`✅ Option ID trovato nel DB: ${data.default_option_id}`);
        return data.default_option_id;
      }
      
      // Se non l'abbiamo, recuperiamo il prodotto dall'API
      console.log(`📡 Recupero opzioni per prodotto ${productId} dall'API`);
      
      // CORREZIONE: Usa l'endpoint corretto senza suppliers
      const url = `${this.baseUrl}/products/${productId}`;
      
      const response = await axios.get<OctoProduct>(url, {
        headers: this.getHeaders()
      });
      
      const product = response.data;
      if (product.options && product.options.length > 0) {
        // Prendi la prima opzione o quella marcata come default
        const defaultOption = product.options.find((opt) => opt.default) || product.options[0];
        
        // Salva nel database per uso futuro
        await supabase
          .from('activities')
          .update({ default_option_id: defaultOption.id })
          .eq('activity_id', productId);
        
        console.log(`✅ Option ID recuperato dall'API: ${defaultOption.id}`);
        return defaultOption.id;
      }
      
      // CORREZIONE: Non ritornare 'DEFAULT', lancia un errore
      throw new Error(`Nessuna option trovata per il prodotto ${productId}`);
      
    } catch (error: any) {
      console.error('❌ Errore recuperando option ID:', error.message);
      throw error; // Propaga l'errore invece di ritornare 'DEFAULT'
    }
  }

  // Sincronizza disponibilità per un prodotto
  async syncAvailability(productId: string, date: string): Promise<void> {
    try {
      console.log(`🔄 Sincronizzazione disponibilità per ${productId} - ${date}`);
      
      // Recupera l'option ID corretto
      const optionId = await this.getProductOptionId(productId);
      console.log(`📌 Usando option ID: ${optionId}`);
      
      const url = `${this.baseUrl}/availability`;
      const payload = {
        productId: productId,
        optionId: optionId,  // Usa l'option ID recuperato
        localDateStart: date,
        localDateEnd: date
      };
      
      const response = await axios.post<OctoAvailability[]>(url, payload, {
        headers: this.getHeaders()
      });

      const availabilities = response.data;
      
      // LOG DEBUG
      console.log(`📊 Ricevute ${availabilities.length} disponibilità`);
      if (availabilities.length > 0) {
        console.log('Esempio disponibilità:', JSON.stringify(availabilities[0], null, 2));
      }
      
      // Salva solo se ci sono disponibilità
      for (const availability of availabilities) {
        await this.saveAvailability(productId, availability);
      }

      console.log(`✅ Salvate ${availabilities.length} disponibilità`);
    } catch (error: any) {
      console.error('❌ Errore sincronizzazione disponibilità:', error.response?.data || error.message);
      throw error;
    }
  }

  // Salva singola disponibilità
  private async saveAvailability(productId: string, availability: OctoAvailability): Promise<void> {
    let localDate = availability.localDate;
    let localTime = availability.localTime;
    
    if (!localDate || !localTime) {
      // Se Bokun non manda localDate/localTime, estraili da localDateTimeStart
      
      // Controlla se c'è la Z alla fine (UTC)
      if (availability.localDateTimeStart.endsWith('Z')) {
        // È UTC, dobbiamo convertire a ora locale Roma
        // Parsing manuale per evitare problemi con timezone del server
        const [datePart, timePart] = availability.localDateTimeStart.split('T');
        localDate = datePart;
        
        // Estrai ore e minuti
        const hours = parseInt(timePart.substring(0, 2));
        const minutes = timePart.substring(3, 5);
        
        // Aggiungi 2 ore per Roma (UTC+2 in estate)
        const romeHours = (hours + 2) % 24;
        
        // Se superiamo mezzanotte, aggiusta anche la data
        if (hours + 2 >= 24) {
          const date = new Date(datePart);
          date.setDate(date.getDate() + 1);
          localDate = date.toISOString().split('T')[0];
        }
        
        localTime = `${romeHours.toString().padStart(2, '0')}:${minutes}`;
        
        console.log(`🕐 Conversione UTC→Roma: ${availability.localDateTimeStart} → ${localDate} ${localTime}`);
      } else {
        // Non c'è la Z, è già ora locale
        const parts = availability.localDateTimeStart.split('T');
        localDate = parts[0];
        if (parts[1]) {
          localTime = parts[1].substring(0, 5);
        }
        console.log(`📝 Ora locale (no Z): ${localDate} ${localTime}`);
      }
    }
    
    // Calcola i posti venduti
    const vacancySold = (availability.capacity || 0) - (availability.vacancies || 0);
    
    const { error } = await supabase
      .from('activity_availability')
      .upsert({
        activity_id: productId,
        availability_id: availability.id,
        local_date_time: availability.localDateTimeStart, // Salva l'originale
        local_date: localDate, // Data locale
        local_time: localTime, // Ora locale
        available: availability.available,
        status: availability.status,
        vacancy_opening: availability.capacity || 0,  // Capacità totale
        vacancy_available: availability.vacancies || 0,  // Posti disponibili
        vacancy_sold: vacancySold,  // Posti venduti (calcolati)
        price_currency: availability.pricing?.[0]?.currency,
        price_amount: availability.pricing?.[0]?.amount || availability.pricing?.[0]?.unitPrice,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'availability_id'
      });

    if (error) throw error;
    
    console.log(`💾 Salvata disponibilità: ${localDate} ${localTime} - Posti: ${availability.vacancies}/${availability.capacity} - Status: ${availability.status}`);
  }

  // Sincronizza disponibilità per tutti i prodotti per i prossimi N giorni
  async syncAllAvailability(days: number = 30): Promise<void> {
    try {
      console.log(`🔄 Inizio sincronizzazione disponibilità per ${days} giorni`);
      
      const { data: activities, error } = await supabase
        .from('activities')
        .select('activity_id');

      if (error) throw error;
      if (!activities || activities.length === 0) {
        console.log('⚠️ Nessun prodotto trovato. Esegui prima la sincronizzazione prodotti.');
        return;
      }

      console.log(`📦 Sincronizzazione disponibilità per ${activities.length} prodotti`);

      for (const activity of activities) {
        for (let i = 0; i < days; i++) {
          const date = new Date();
          date.setDate(date.getDate() + i);
          const dateStr = date.toISOString().split('T')[0];
          
          await this.syncAvailability(activity.activity_id, dateStr);
          
          // Pausa per non sovraccaricare l'API
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log('✅ Sincronizzazione disponibilità completata');
    } catch (error) {
      console.error('❌ Errore sincronizzazione disponibilità:', error);
      throw error;
    }
  }

  // Sincronizza disponibilità per tutti i prodotti ECCETTO alcuni, per i prossimi N giorni
  async syncAllAvailabilityExcept(days: number = 30, excludedProducts: string[] = []): Promise<void> {
    try {
      console.log(`🔄 Inizio sincronizzazione disponibilità per ${days} giorni (con esclusioni)`);
      
      const { data: activities, error } = await supabase
        .from('activities')
        .select('activity_id')
        .not('activity_id', 'in', `(${excludedProducts.join(',')})`);

      if (error) throw error;
      if (!activities || activities.length === 0) {
        console.log('⚠️ Nessun prodotto trovato.');
        return;
      }

      console.log(`📦 Sincronizzazione disponibilità per ${activities.length} prodotti (esclusi: ${excludedProducts.length})`);

      for (const activity of activities) {
        for (let i = 0; i < days; i++) {
          const date = new Date();
          date.setDate(date.getDate() + i);
          const dateStr = date.toISOString().split('T')[0];
          
          await this.syncAvailability(activity.activity_id, dateStr);
          
          // Pausa per non sovraccaricare l'API
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log('✅ Sincronizzazione disponibilità completata');
    } catch (error) {
      console.error('❌ Errore sincronizzazione disponibilità:', error);
      throw error;
    }
  }
}