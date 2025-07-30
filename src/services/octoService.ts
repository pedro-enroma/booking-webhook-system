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
      'Authorization': `Bearer ${this.apiKey}/${this.supplierId}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Octo-Capabilities': 'text' // Aggiungi questo header come nei tuoi test
    };
  }

  // Sincronizza tutti i prodotti
  async syncProducts(): Promise<void> {
    try {
      console.log('🔄 Inizio sincronizzazione prodotti...');
      
      const url = `${this.baseUrl}/products`;
      console.log('📍 URL chiamata:', url);
      
      const response = await axios.get<OctoProduct[]>(url, {
        headers: this.getHeaders()
      });

      console.log('📡 Risposta ricevuta:', response.status);
      
      const products = response.data;
      console.log(`📦 Trovati ${products.length} prodotti`);

      // Salva i prodotti in batch per migliori performance
      const savePromises = products.map(product => this.saveProduct(product));
      await Promise.all(savePromises);

      console.log('✅ Sincronizzazione prodotti completata');
    } catch (error: any) {
      console.error('❌ Errore sincronizzazione prodotti:', error.response?.data || error.message);
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
        default_option_id: defaultOptionId,
        last_sync: new Date().toISOString()
      }, {
        onConflict: 'activity_id'
      });

    if (error) {
      console.error(`❌ Errore salvando prodotto ${product.id}:`, error);
      throw error;
    }
  }

  // Recupera l'option ID corretto per un prodotto
  private async getProductOptionId(productId: string): Promise<string> {
    try {
      // Prima proviamo a recuperare dal database
      const { data, error } = await supabase
        .from('activities')
        .select('default_option_id')
        .eq('activity_id', productId)
        .single();
      
      if (data && data.default_option_id) {
        return data.default_option_id;
      }
      
      // Se non l'abbiamo, recuperiamo il prodotto dall'API
      console.log(`📡 Recupero opzioni per prodotto ${productId} dall'API`);
      
      const url = `${this.baseUrl}/products/${productId}`;
      
      const response = await axios.get<OctoProduct>(url, {
        headers: this.getHeaders()
      });
      
      const product = response.data;
      if (product.options && product.options.length > 0) {
        const defaultOption = product.options.find((opt) => opt.default) || product.options[0];
        
        // Salva nel database per uso futuro
        await supabase
          .from('activities')
          .update({ default_option_id: defaultOption.id })
          .eq('activity_id', productId);
        
        return defaultOption.id;
      }
      
      throw new Error(`Nessuna option trovata per il prodotto ${productId}`);
      
    } catch (error: any) {
      console.error('❌ Errore recuperando option ID:', error.message);
      throw error;
    }
  }

  // Sincronizza disponibilità per un prodotto con range di date
  async syncAvailabilityRange(productId: string, startDate: string, endDate: string): Promise<void> {
    try {
      console.log(`🔄 Sincronizzazione disponibilità per ${productId} dal ${startDate} al ${endDate}`);
      
      // Recupera l'option ID corretto
      const optionId = await this.getProductOptionId(productId);
      
      const url = `${this.baseUrl}/availability`;
      const payload = {
        productId: productId,
        optionId: optionId,
        localDateStart: startDate,
        localDateEnd: endDate
      };
      
      console.log('📤 Richiesta disponibilità:', payload);
      
      const response = await axios.post<OctoAvailability[]>(url, payload, {
        headers: this.getHeaders()
      });

      const availabilities = response.data;
      
      console.log(`📊 Ricevute ${availabilities.length} disponibilità`);
      
      // Salva tutte le disponibilità in batch
      const savePromises = availabilities.map(availability => 
        this.saveAvailability(productId, availability)
      );
      await Promise.all(savePromises);

      console.log(`✅ Salvate ${availabilities.length} disponibilità`);
    } catch (error: any) {
      if (error.response?.status === 404) {
        console.log(`⚠️ Prodotto ${productId} non trovato su OCTO API`);
        return;
      }
      console.error(`❌ Errore sincronizzazione disponibilità per ${productId}:`, error.response?.data || error.message);
      throw error;
    }
  }

  // Sincronizza disponibilità per una singola data (usato dai webhook)
  async syncAvailability(productId: string, date: string): Promise<void> {
    await this.syncAvailabilityRange(productId, date, date);
  }

  // Salva singola disponibilità
  private async saveAvailability(productId: string, availability: OctoAvailability): Promise<void> {
    // SALVA ESATTAMENTE COME ARRIVA DA BOKUN - NESSUNA MODIFICA
    // Supabase o l'app che legge aggiungerà 2 ore quando necessario
    const dateTimeStr = availability.localDateTimeStart.replace('Z', '');
    const [datePart, timeWithSeconds] = dateTimeStr.split('T');
    const timePart = timeWithSeconds.substring(0, 5); // HH:MM
    
    // Calcola i posti venduti
    const vacancySold = (availability.capacity || 0) - (availability.vacancies || 0);
    
    // Log per debug
    if (Math.random() < 0.1) { // Log solo 10% per non intasare
      console.log(`💾 Bokun: ${availability.localDateTimeStart} → DB: ${datePart} ${timePart} (no modifiche)`);
    }
    
    const { error } = await supabase
      .from('activity_availability')
      .upsert({
        activity_id: productId,
        availability_id: availability.id,
        local_date_time: availability.localDateTimeStart, // Timestamp originale di Bokun
        local_date: datePart,
        local_time: timePart, // Ora esatta di Bokun (16:00)
        available: availability.available,
        status: availability.status,
        vacancy_opening: availability.capacity || 0,
        vacancy_available: availability.vacancies || 0,
        vacancy_sold: vacancySold,
        price_currency: availability.pricing?.[0]?.currency,
        price_amount: availability.pricing?.[0]?.amount || availability.pricing?.[0]?.unitPrice,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'availability_id'
      });

    if (error) {
      console.error(`❌ Errore salvando disponibilità ${availability.id}:`, error);
      throw error;
    }
  }

  // Sincronizza disponibilità per tutti i prodotti per i prossimi N giorni - OTTIMIZZATO
  async syncAllAvailability(days: number = 30): Promise<void> {
    try {
      console.log(`🔄 Inizio sincronizzazione disponibilità per ${days} giorni`);
      
      // Recupera tutti i prodotti
      let query = supabase
        .from('activities')
        .select('activity_id, description');
      
      const { data: activities, error } = await query;

      if (error) throw error;
      if (!activities || activities.length === 0) {
        console.log('⚠️ Nessun prodotto trovato. Esegui prima la sincronizzazione prodotti.');
        return;
      }
      
      // Filtra manualmente i prodotti Channel Manager
      const filteredActivities = activities.filter(activity => {
        return !activity.description || !activity.description.includes('[CHANNEL MANAGER]');
      });
      
      console.log(`📦 Trovati ${activities.length} prodotti totali, ${filteredActivities.length} da sincronizzare`);
      
      if (filteredActivities.length === 0) {
        console.log('⚠️ Nessun prodotto da sincronizzare dopo il filtro Channel Manager.');
        return;
      }

      // Calcola le date di inizio e fine
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + days);
      
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      console.log(`📅 Range date: ${startDateStr} - ${endDateStr}`);

      // Processa i prodotti in batch per evitare troppi carichi sull'API
      const batchSize = 5; // Processa 5 prodotti alla volta
      
      for (let i = 0; i < filteredActivities.length; i += batchSize) {
        const batch = filteredActivities.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (activity) => {
          try {
            // Richiedi l'intero range di date in una singola chiamata
            await this.syncAvailabilityRange(activity.activity_id, startDateStr, endDateStr);
          } catch (error) {
            console.error(`⚠️ Errore per prodotto ${activity.activity_id}, continuo con gli altri`);
          }
        });
        
        await Promise.all(batchPromises);
        
        // Log progressi
        console.log(`📊 Progresso: ${Math.min(i + batchSize, filteredActivities.length)}/${filteredActivities.length} prodotti`);
        
        // Pausa tra i batch per non sovraccaricare l'API
        if (i + batchSize < filteredActivities.length) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 secondo tra i batch
        }
      }

      console.log('✅ Sincronizzazione disponibilità completata');
    } catch (error) {
      console.error('❌ Errore sincronizzazione disponibilità:', error);
      throw error;
    }
  }

  // Sincronizza disponibilità per tutti i prodotti ECCETTO alcuni - OTTIMIZZATO
  async syncAllAvailabilityExcept(days: number = 30, excludedProducts: string[] = []): Promise<void> {
    try {
      console.log(`🔄 Inizio sincronizzazione disponibilità per ${days} giorni (con esclusioni)`);
      console.log(`📋 Prodotti esclusi: ${excludedProducts.join(', ')}`);
      
      // Recupera tutti i prodotti
      const { data: activities, error } = await supabase
        .from('activities')
        .select('activity_id, description');

      if (error) throw error;
      if (!activities || activities.length === 0) {
        console.log('⚠️ Nessun prodotto trovato.');
        return;
      }
      
      // Filtra manualmente: escludi Channel Manager E prodotti nella lista di esclusione
      const filteredActivities = activities.filter(activity => {
        const isChannelManager = activity.description && activity.description.includes('[CHANNEL MANAGER]');
        const isExcluded = excludedProducts.includes(activity.activity_id);
        return !isChannelManager && !isExcluded;
      });
      
      console.log(`📦 Trovati ${activities.length} prodotti totali, ${filteredActivities.length} da sincronizzare`);
      
      if (filteredActivities.length === 0) {
        console.log('⚠️ Nessun prodotto da sincronizzare dopo i filtri.');
        return;
      }

      // Calcola le date
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + days);
      
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      console.log(`📅 Range date: ${startDateStr} - ${endDateStr}`);

      // Processa in batch
      const batchSize = 5;
      
      for (let i = 0; i < filteredActivities.length; i += batchSize) {
        const batch = filteredActivities.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (activity) => {
          try {
            await this.syncAvailabilityRange(activity.activity_id, startDateStr, endDateStr);
          } catch (error) {
            console.error(`⚠️ Errore per prodotto ${activity.activity_id}, continuo con gli altri`);
          }
        });
        
        await Promise.all(batchPromises);
        
        console.log(`📊 Progresso: ${Math.min(i + batchSize, filteredActivities.length)}/${filteredActivities.length} prodotti`);
        
        if (i + batchSize < filteredActivities.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      console.log('✅ Sincronizzazione disponibilità completata');
    } catch (error) {
      console.error('❌ Errore sincronizzazione disponibilità:', error);
      throw error;
    }
  }
}