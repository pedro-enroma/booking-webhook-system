import axios from 'axios';
import { supabase } from '../config/supabase';
import { OctoProduct, OctoAvailability } from '../types/octo.types';

export class OctoService {
  private apiKey: string;
  private baseUrl: string;
  private supplierId: string;
  
  // Configurazione batch processing
  private readonly PARALLEL_PRODUCTS = 3; // Processa 3 prodotti in parallelo
  private readonly DAYS_PER_CHUNK = 10;   // Processa 10 giorni alla volta
  private readonly API_DELAY_MS = 50;     // Delay tra chiamate API
  private readonly VERBOSE = process.env.VERBOSE_SYNC === 'true';

  constructor() {
    if (!process.env.BOKUN_API_KEY || !process.env.BOKUN_SUPPLIER_ID) {
      throw new Error('Mancano le variabili di ambiente BOKUN_API_KEY o BOKUN_SUPPLIER_ID');
    }
    
    this.apiKey = process.env.BOKUN_API_KEY;
    this.baseUrl = process.env.BOKUN_API_URL || 'https://api.bokun.io/octo/v1';
    this.supplierId = process.env.BOKUN_SUPPLIER_ID;
    
    console.log('🔧 OctoService inizializzato con ottimizzazioni:');
    console.log('   - API URL:', this.baseUrl);
    console.log('   - Supplier ID:', this.supplierId);
    console.log('   - Parallel products:', this.PARALLEL_PRODUCTS);
    console.log('   - Days per chunk:', this.DAYS_PER_CHUNK);
  }

  private getHeaders() {
    return {
      'Authorization': `Bearer ${this.apiKey}/${this.supplierId}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  // Helper: divide array in chunks
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  // Helper: delay
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // NUOVO: Salva checkpoint per riprendere
  private async saveCheckpoint(jobType: string, productId: string, lastDate: string): Promise<void> {
    try {
      await supabase
        .from('sync_checkpoints')
        .upsert({
          job_type: jobType,
          product_id: productId,
          last_synced_date: lastDate,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'job_type,product_id'
        });
    } catch (error) {
      console.warn('⚠️ Impossibile salvare checkpoint (tabella potrebbe non esistere)');
    }
  }

  // NUOVO: Recupera checkpoint
  private async getCheckpoint(jobType: string, productId: string): Promise<string | null> {
    try {
      const { data } = await supabase
        .from('sync_checkpoints')
        .select('last_synced_date')
        .eq('job_type', jobType)
        .eq('product_id', productId)
        .single();
      
      return data?.last_synced_date || null;
    } catch {
      return null;
    }
  }

  // OTTIMIZZATO: Sincronizza disponibilità con range API per TUTTI gli options
  async syncAvailabilityOptimized(productId: string, startDate: string, endDate: string): Promise<number> {
    try {
      // Evita di sincronizzare giorni passati
      const todayStr = new Date().toISOString().split('T')[0];
      if (startDate < todayStr && endDate < todayStr) {
        console.log(`⏭️ Range completamente nel passato: ${startDate} → ${endDate}, skip`);
        return 0;
      }
      if (startDate < todayStr) {
        console.log(`⚠️ startDate (${startDate}) nel passato, aggiorno a oggi (${todayStr})`);
        startDate = todayStr;
      }
      
      // Get ALL options for the product
      const optionIds = await this.getAllProductOptionIds(productId);
      
      if (optionIds.length === 0) {
        console.log(`⚠️ Nessuna option trovata per ${productId}`);
        return 0;
      }
      
      console.log(`📅 Sync ${productId}: ${startDate} → ${endDate} (${optionIds.length} options)`);
      
      let totalSynced = 0;
      const url = `${this.baseUrl}/availability`;
      
      // Sync each option
      for (const optionId of optionIds) {
        const payload = {
          productId: productId,
          optionId: optionId,
          localDateStart: startDate,
          localDateEnd: endDate
        };
        
        try {
          const response = await axios.post<OctoAvailability[]>(url, payload, {
            headers: this.getHeaders(),
            timeout: 30000
          });

          const availabilities = response.data;
          
          // Salva in batch
          if (availabilities.length > 0) {
            const batchData = availabilities.map(avail => 
              this.prepareAvailabilityData(productId, avail)
            );
            
            const { error } = await supabase
              .from('activity_availability')
              .upsert(batchData, { onConflict: 'availability_id' });
            
            if (error) throw error;
            
            console.log(`  ✅ Option ${optionId}: ${availabilities.length} slot salvati`);
            totalSynced += availabilities.length;
          }
          
        } catch (optionError: any) {
          // If one option fails, continue with others
          if (optionError.response?.status === 400 || optionError.response?.status === 422) {
            console.log(`  ⚠️ Option ${optionId} fallback needed`);
            // Try fallback for this option
            const fallbackCount = await this.syncAvailabilityFallback(productId, startDate, endDate, optionId);
            totalSynced += fallbackCount;
          } else {
            console.error(`  ❌ Option ${optionId} error: ${optionError.message}`);
          }
        }
      }
      
      console.log(`✅ Total synced for ${productId}: ${totalSynced} slots`);
      return totalSynced;
      
    } catch (error: any) {
      console.error(`❌ Errore sync availability:`, error.message);
      throw error;
    }
  }

  // Fallback: sincronizza giorno per giorno
  private async syncAvailabilityFallback(productId: string, startDate: string, endDate: string, optionId?: string): Promise<number> {
    // Evita di sincronizzare giorni passati
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let start = new Date(startDate);
    let end = new Date(endDate);
    if (start < today && end < today) {
      console.log(`⏭️ Fallback: range completamente nel passato: ${startDate} → ${endDate}, skip`);
      return 0;
    }
    if (start < today) {
      console.log(`⚠️ Fallback: startDate (${startDate}) nel passato, aggiorno a oggi (${today.toISOString().split('T')[0]})`);
      start = new Date(today);
    }
    let totalSynced = 0;
    
    while (start <= end) {
      const dateStr = start.toISOString().split('T')[0];
      await this.syncAvailability(productId, dateStr);
      totalSynced++;
      start.setDate(start.getDate() + 1);
      await this.delay(this.API_DELAY_MS);
    }
    
    return totalSynced;
  }

  // Prepara dati per salvataggio batch
  private prepareAvailabilityData(productId: string, availability: OctoAvailability): any {
    let localDate = availability.localDate;
    let localTime = availability.localTime;
    
    if (!localDate || !localTime) {
      if (availability.localDateTimeStart.endsWith('Z')) {
        const utcDate = new Date(availability.localDateTimeStart);
        const romeTime = utcDate.toLocaleString('en-US', { 
          timeZone: 'Europe/Rome',
          hour12: false,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });
        
        const [datePartRome, timePartRome] = romeTime.split(', ');
        const [month, day, year] = datePartRome.split('/');
        localDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        localTime = timePartRome;
      } else {
        const parts = availability.localDateTimeStart.split('T');
        localDate = parts[0];
        if (parts[1]) {
          localTime = parts[1].substring(0, 5);
        }
      }
    }
    
    const vacancySold = (availability.capacity || 0) - (availability.vacancies || 0);
    
    return {
      activity_id: productId,
      availability_id: availability.id,
      local_date_time: availability.localDateTimeStart,
      local_date: localDate,
      local_time: localTime,
      available: availability.available,
      status: availability.status,
      vacancy_opening: availability.capacity || 0,
      vacancy_available: availability.vacancies || 0,
      vacancy_sold: vacancySold,
      price_currency: availability.pricing?.[0]?.currency,
      price_amount: availability.pricing?.[0]?.amount || availability.pricing?.[0]?.unitPrice,
      updated_at: new Date().toISOString()
    };
  }

  // NUOVO: Sincronizza lista prodotti per N giorni con batch processing
  async syncProductListForDays(
    productIds: string[], 
    days: number, 
    jobType: string = 'manual'
  ): Promise<{ success: number; failed: number }> {
    console.log(`🚀 Sync batch: ${productIds.length} prodotti per ${days} giorni`);
    
    const results = { success: 0, failed: 0 };
    const productChunks = this.chunkArray(productIds, this.PARALLEL_PRODUCTS);
    
    for (let chunkIndex = 0; chunkIndex < productChunks.length; chunkIndex++) {
      const chunk = productChunks[chunkIndex];
      console.log(`📦 Chunk ${chunkIndex + 1}/${productChunks.length} (${chunk.length} prodotti)`);
      
      // Processa prodotti in parallelo
      const promises = chunk.map(async (productId) => {
        try {
          // Controlla checkpoint
          const checkpoint = await this.getCheckpoint(jobType, productId);
          let startDay = 0;
          
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          if (checkpoint) {
            const checkpointDate = new Date(checkpoint);
            checkpointDate.setHours(0, 0, 0, 0);
            
            // Se il checkpoint è di oggi o oltre, skip
            if (checkpointDate.toISOString().split('T')[0] === today.toISOString().split('T')[0]) {
              console.log(`⏭️ ${productId} già sincronizzato oggi`);
              return;
            }
            
            // Calcola da dove riprendere, ma non prima di oggi
            const daysSinceCheckpoint = Math.ceil((today.getTime() - checkpointDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysSinceCheckpoint > 0) {
              startDay = 0; // riparti da oggi
              console.log(`↻ ${productId} checkpoint vecchio (${checkpoint}), riparto da oggi`);
            }
          }
          
          // Sincronizza a chunks di giorni
          for (let dayOffset = startDay; dayOffset < days; dayOffset += this.DAYS_PER_CHUNK) {
            const startDate = new Date();
            startDate.setHours(0, 0, 0, 0);
            startDate.setDate(startDate.getDate() + dayOffset);
            
            const endOffset = Math.min(dayOffset + this.DAYS_PER_CHUNK - 1, days - 1);
            const endDate = new Date();
            endDate.setHours(0, 0, 0, 0);
            endDate.setDate(endDate.getDate() + endOffset);
            
            if (this.VERBOSE) {
              console.log(`📅 Batch ${productId}: ${startDate.toISOString().split('T')[0]} → ${endDate.toISOString().split('T')[0]}`);
            }
            
            await this.syncAvailabilityOptimized(
              productId,
              startDate.toISOString().split('T')[0],
              endDate.toISOString().split('T')[0]
            );
            
            // Salva checkpoint
            await this.saveCheckpoint(jobType, productId, endDate.toISOString().split('T')[0]);
          }
          
          results.success++;
          
        } catch (error: any) {
          console.error(`❌ Fallito ${productId}: ${error.message}`);
          results.failed++;
        }
      });
      
      await Promise.all(promises);
      
      // Pausa tra chunks
      if (chunkIndex < productChunks.length - 1) {
        await this.delay(1000);
      }
    }
    
    console.log(`✅ Completato: ${results.success} successi, ${results.failed} falliti`);
    return results;
  }

  // MANTIENI I METODI ESISTENTI per compatibilità
  
  async syncProducts(): Promise<void> {
    try {
      console.log('🔄 Inizio sincronizzazione prodotti...');
      const url = `${this.baseUrl}/products`;
      
      const response = await axios.get<OctoProduct[]>(url, {
        headers: this.getHeaders()
      });

      const products = response.data;
      console.log(`📦 Trovati ${products.length} prodotti`);

      for (const product of products) {
        await this.saveProduct(product);
      }

      console.log('✅ Sincronizzazione prodotti completata');
    } catch (error: any) {
      console.error('❌ Errore sincronizzazione prodotti:', error.response?.data || error.message);
      throw error;
    }
  }

  private async saveProduct(product: OctoProduct): Promise<void> {
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

    if (error) throw error;
  }

  // Get ALL option IDs for a product
  private async getAllProductOptionIds(productId: string): Promise<string[]> {
    try {
      const url = `${this.baseUrl}/products/${productId}`;
      const response = await axios.get<OctoProduct>(url, {
        headers: this.getHeaders()
      });
      
      const product = response.data;
      if (product.options && product.options.length > 0) {
        const optionIds = product.options.map(opt => opt.id);
        console.log(`  Found ${optionIds.length} options for ${productId}`);
        return optionIds;
      }
      
      console.log(`  No options found for ${productId}`);
      return [];
      
    } catch (error: any) {
      console.error('❌ Error getting product options:', error.message);
      return [];
    }
  }
  
  private async getProductOptionId(productId: string): Promise<string> {
    try {
      const { data } = await supabase
        .from('activities')
        .select('default_option_id')
        .eq('activity_id', productId)
        .single();
      
      if (data && data.default_option_id) {
        return data.default_option_id;
      }
      
      const url = `${this.baseUrl}/products/${productId}`;
      const response = await axios.get<OctoProduct>(url, {
        headers: this.getHeaders()
      });
      
      const product = response.data;
      if (product.options && product.options.length > 0) {
        const defaultOption = product.options.find((opt) => opt.default) || product.options[0];
        
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

  async syncAvailability(productId: string, date: string): Promise<void> {
    try {
      // Get ALL options for the product
      const optionIds = await this.getAllProductOptionIds(productId);
      
      if (optionIds.length === 0) {
        console.log(`⚠️ No options found for ${productId}`);
        return;
      }
      
      const url = `${this.baseUrl}/availability`;
      
      // Sync each option
      for (const optionId of optionIds) {
        const payload = {
          productId: productId,
          optionId: optionId,
          localDateStart: date,
          localDateEnd: date
        };
        
        try {
          const response = await axios.post<OctoAvailability[]>(url, payload, {
            headers: this.getHeaders()
          });

          const availabilities = response.data;
          
          for (const availability of availabilities) {
            await this.saveAvailability(productId, availability);
          }
        } catch (optionError: any) {
          console.error(`❌ Error syncing option ${optionId} for ${productId} ${date}:`, optionError.message);
          // Continue with other options
        }
      }
      
    } catch (error: any) {
      console.error(`❌ Errore sync ${productId} ${date}:`, error.message);
      // Non propagare per non bloccare batch
    }
  }

  private async saveAvailability(productId: string, availability: OctoAvailability): Promise<void> {
    const data = this.prepareAvailabilityData(productId, availability);
    const { error } = await supabase
      .from('activity_availability')
      .upsert(data, { onConflict: 'availability_id' });
    
    if (error) throw error;
  }

  // Sincronizza un singolo prodotto per N giorni
  async syncProductForDays(productId: string, days: number): Promise<void> {
    try {
      console.log(`🔄 Sincronizzazione ${productId} per ${days} giorni`);
      
      for (let i = 0; i < days; i++) {
        const date = new Date();
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        
        await this.syncAvailability(productId, dateStr);
        
        // Pausa brevissima tra le chiamate
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      console.log(`✅ Sincronizzazione ${productId} completata per ${days} giorni`);
    } catch (error) {
      console.error(`❌ Errore sincronizzazione ${productId}:`, error);
      throw error;
    }
  }
  
  // Sincronizza disponibilità per un range di date
  async syncAvailabilityRange(productId: string, dateFrom: string, dateTo: string): Promise<void> {
    try {
      console.log(`🔄 Sincronizzazione ${productId} dal ${dateFrom} al ${dateTo}`);
      
      const startDate = new Date(dateFrom);
      const endDate = new Date(dateTo);
      const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      
      console.log(`📅 Sincronizzazione di ${daysDiff} giorni`);
      
      for (let i = 0; i < daysDiff; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(currentDate.getDate() + i);
        const dateStr = currentDate.toISOString().split('T')[0];
        
        await this.syncAvailability(productId, dateStr);
        
        // Pausa brevissima
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      console.log(`✅ Range sincronizzato per ${productId}`);
    } catch (error) {
      console.error(`❌ Errore sync range ${productId}:`, error);
      throw error;
    }
  }

  // Wrapper per compatibilità con cron esistenti
  async syncAllAvailabilityExcept(days: number = 30, excludedProducts: string[] = []): Promise<void> {
    try {
      const { data: activities, error } = await supabase
        .from('activities')
        .select('activity_id')
        .not('activity_id', 'in', `(${excludedProducts.join(',')})`);

      if (error) throw error;
      if (!activities || activities.length === 0) {
        console.log('⚠️ Nessun prodotto trovato.');
        return;
      }

      const productIds = activities.map(a => a.activity_id);
      await this.syncProductListForDays(productIds, days, 'all-except');
      
    } catch (error) {
      console.error('❌ Errore:', error);
      throw error;
    }
  }

  // NUOVO METODO per compatibilità con routes/sync.ts
  async syncAllAvailability(days: number = 30): Promise<void> {
    try {
      console.log(`🔄 Sincronizzazione tutti i prodotti per ${days} giorni`);
      
      const { data: activities, error } = await supabase
        .from('activities')
        .select('activity_id');

      if (error) throw error;
      if (!activities || activities.length === 0) {
        console.log('⚠️ Nessun prodotto trovato.');
        return;
      }

      const productIds = activities.map(a => a.activity_id);
      await this.syncProductListForDays(productIds, days, 'all-products');
      
      console.log('✅ Sincronizzazione completata');
    } catch (error) {
      console.error('❌ Errore:', error);
      throw error;
    }
  }
}