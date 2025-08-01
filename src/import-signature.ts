// src/import-signature.ts
import * as XLSX from 'xlsx';
import { supabase } from './config/supabase';
import dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

// Interfaccia per i dati Signature
interface SignatureRow {
  creation_date: string | number | Date;  // Aggiunto Date
  external_reference?: string;
  booking_id: string;
  confirmation_code?: string;
  Customer: string;
  Email: string;
  'Phone number'?: string;
  'Product ID'?: string;
  product_title: string;
  product_id?: number;
  start_date_time: string | number | Date;
  booking_status: string;
  'Total price with discount': number | string;
  'Sale currency': string;
  'Payment status'?: string;
  'Total PAX'?: number | string;
  Participants?: string;
  'signature.PaxName': string;
}

interface ParsedParticipant {
  name?: string;
  surname?: string;
  category: string;
  age?: number;
}

class SignatureImporter {
  private readonly stats = {
    totalRows: 0,
    skippedActivities: 0,
    customersCreated: 0,
    bookingsCreated: 0,
    activitiesCreated: 0,
    participantsCreated: 0,
    errors: [] as any[]
  };

  async importFromExcel(filePath: string): Promise<void> {
    console.log('📊 IMPORTAZIONE SIGNATURE → SUPABASE');
    console.log('=====================================\n');
    
    try {
      // 1. Leggi il file Excel
      console.log('1️⃣ Lettura file Excel Signature...');
      const workbook = XLSX.readFile(filePath, {
        cellDates: false,  // NON convertire date automaticamente
        raw: false,        // Mantieni come stringhe
        dateNF: 'DD/MM/YYYY HH:mm'  // Formato date italiano
      });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Converti in JSON
      const data: SignatureRow[] = XLSX.utils.sheet_to_json(worksheet, {
        raw: false,        // Mantieni come stringhe
        dateNF: 'DD/MM/YYYY HH:mm'
      });
      
      this.stats.totalRows = data.length;
      console.log(`✅ Trovate ${data.length} righe (attività)\n`);
      
      // Debug: mostra prima riga
      if (data.length > 0) {
        console.log('📋 Esempio prima riga:');
        console.log(`   start_date_time: ${data[0].start_date_time} (tipo: ${typeof data[0].start_date_time})`);
        console.log(`   creation_date: ${data[0].creation_date} (tipo: ${typeof data[0].creation_date})\n`);
      }
      
      // 2. Processa ogni riga (ogni riga = una attività)
      console.log('2️⃣ Importazione attività...\n');
      
      let processed = 0;
      for (const row of data) {
        try {
          await this.processActivityRow(row);
          processed++;
          
          // Progress
          if (processed % 10 === 0) {
            const imported = processed - this.stats.skippedActivities;
            console.log(`   Elaborate ${processed}/${data.length} attività (${imported} importate, ${this.stats.skippedActivities} saltate)...`);
          }
        } catch (error: any) {
          console.error(`❌ Errore per ${row.booking_id} / ${row.confirmation_code}:`, error.message);
          this.stats.errors.push({ 
            bookingId: row.booking_id,
            confirmationCode: row.confirmation_code,
            error: error.message,
            customer: row.Customer 
          });
        }
        
        // Pausa per non sovraccaricare Supabase
        if (processed % 50 === 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // 3. Report finale
      this.printReport();
      
    } catch (error) {
      console.error('❌ Errore fatale:', error);
      throw error;
    }
  }
  
  private async processActivityRow(row: SignatureRow): Promise<void> {
    // 1. Estrai gli ID
    const numericBookingId = this.extractNumericId(row.booking_id);
    const activityConfirmationCode = row.confirmation_code || row.booking_id;
    const activityBookingId = this.extractNumericId(activityConfirmationCode);
    
    // 2. Controlla se l'ATTIVITÀ esiste già
    const { data: existingActivity, error: checkError } = await supabase
      .from('activity_bookings')
      .select('activity_booking_id')
      .or(`activity_booking_id.eq.${activityBookingId},product_confirmation_code.eq.${activityConfirmationCode}`)
      .maybeSingle();
    
    if (checkError) {
      console.error(`⚠️  Errore controllo duplicati per ${activityConfirmationCode}:`, checkError.message);
    }
    
    if (existingActivity) {
      console.log(`⏭️  Saltata attività ${activityConfirmationCode} - già importata`);
      this.stats.skippedActivities++;
      return;
    }
    
    // 3. Parse customer name
    const customerData = this.parseCustomerName(row.Customer);
    
    // 4. Controlla se il BOOKING principale esiste già
    const { data: existingBooking } = await supabase
      .from('bookings')
      .select('booking_id')
      .eq('booking_id', numericBookingId)
      .maybeSingle();
    
    let customerId: number;
    
    if (!existingBooking) {
      // Se il booking non esiste, crea tutto
      customerId = await this.saveCustomer(row, customerData);
      await this.saveBooking(row, numericBookingId);
      await this.linkBookingToCustomer(numericBookingId, customerId);
    } else {
      // Se il booking esiste, recupera o crea il customer
      const { data: existingLink } = await supabase
        .from('booking_customers')
        .select('customer_id')
        .eq('booking_id', numericBookingId)
        .maybeSingle();
      
      if (existingLink) {
        customerId = existingLink.customer_id;
      } else {
        customerId = await this.saveCustomer(row, customerData);
        await this.linkBookingToCustomer(numericBookingId, customerId);
      }
    }
    
    // 5. Salva l'attività
    await this.saveActivityBooking(row, numericBookingId, activityBookingId, activityConfirmationCode);
    
    // 6. Parse e salva partecipanti
    const participants = this.parseParticipants(row['signature.PaxName']);
    await this.saveParticipants(participants, activityBookingId, customerData);
  }
  
  private parseCustomerName(customerName: string): { firstName: string, lastName: string } {
    // Formato: "Cognome, Nome" o "Cognome1 Cognome2, Nome1 Nome2"
    const parts = customerName.split(',').map(p => p.trim());
    
    if (parts.length >= 2) {
      return {
        lastName: parts[0],
        firstName: parts[1]
      };
    }
    
    // Fallback se formato diverso
    const spaceParts = customerName.split(' ');
    if (spaceParts.length >= 2) {
      return {
        firstName: spaceParts[0],
        lastName: spaceParts.slice(1).join(' ')
      };
    }
    
    return {
      firstName: customerName,
      lastName: ''
    };
  }
  
  private parseParticipants(paxNameString: string): ParsedParticipant[] {
    if (!paxNameString) return [];
    
    const participants: ParsedParticipant[] = [];
    
    // Dividi per virgola e processa ogni parte
    const parts = paxNameString.split(',').map(p => p.trim());
    
    for (const part of parts) {
      // Pattern: "Nome Cognome (Categoria)" o solo "(Categoria)"
      const matchWithName = part.match(/^(.+?)\s*\((.+?)\)$/);
      const matchOnlyCategory = part.match(/^\((.+?)\)$/);
      
      if (matchWithName) {
        // Ha nome e categoria
        const fullName = matchWithName[1].trim();
        const category = matchWithName[2].trim();
        
        const nameParts = fullName.split(' ');
        const participant: ParsedParticipant = {
          name: nameParts.slice(0, -1).join(' ') || nameParts[0],
          surname: nameParts.length > 1 ? nameParts[nameParts.length - 1] : '',
          category: category
        };
        
        // Determina età dalla categoria
        if (category.includes('4 a 17')) {
          participant.age = 10; // età media
        } else if (category.toLowerCase().includes('adult')) {
          participant.age = 30; // età default adulto
        }
        
        participants.push(participant);
        
      } else if (matchOnlyCategory) {
        // Solo categoria, senza nome
        const category = matchOnlyCategory[1].trim();
        const participant: ParsedParticipant = {
          category: category
        };
        
        if (category.includes('4 a 17')) {
          participant.age = 10;
        } else if (category.toLowerCase().includes('adult')) {
          participant.age = 30;
        }
        
        participants.push(participant);
      }
    }
    
    return participants;
  }
  
  private async saveCustomer(row: SignatureRow, customerData: { firstName: string, lastName: string }): Promise<number> {
    // Genera customer_id dal booking_id
    const customerId = this.generateCustomerId(row.booking_id);
    
    // Genera un UUID valido v4
    const uuid = this.generateUUID();
    
    const { error } = await supabase
      .from('customers')
      .upsert({
        customer_id: customerId,
        uuid: uuid,
        email: row.Email,
        first_name: customerData.firstName,
        last_name: customerData.lastName,
        phone_number: row['Phone number'] || null
      }, {
        onConflict: 'customer_id',
        ignoreDuplicates: false
      });
    
    if (error) throw error;
    
    this.stats.customersCreated++;
    return customerId;
  }
  
  private async saveBooking(row: SignatureRow, numericBookingId: number): Promise<void> {
    // Parse date senza conversioni
    let creationDateStr: string;
    
    if (typeof row.creation_date === 'string') {
      // Se è stringa formato DD/MM/YYYY
      if (row.creation_date.includes('/')) {
        const [day, month, year] = row.creation_date.split('/');
        creationDateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} 00:00:00`;
      } else {
        // Altri formati stringa
        creationDateStr = row.creation_date;
      }
    } else if (row.creation_date instanceof Date) {
      // Se è Date, prendi valori locali
      const year = row.creation_date.getFullYear();
      const month = String(row.creation_date.getMonth() + 1).padStart(2, '0');
      const day = String(row.creation_date.getDate()).padStart(2, '0');
      creationDateStr = `${year}-${month}-${day} 00:00:00`;
    } else if (typeof row.creation_date === 'number') {
      // Numero Excel
      const excelDate = this.excelDateToJSDate(row.creation_date);
      const year = excelDate.getFullYear();
      const month = String(excelDate.getMonth() + 1).padStart(2, '0');
      const day = String(excelDate.getDate()).padStart(2, '0');
      creationDateStr = `${year}-${month}-${day} 00:00:00`;
    } else {
      // Fallback a oggi
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      creationDateStr = `${year}-${month}-${day} 00:00:00`;
    }
    
    const { error } = await supabase
      .from('bookings')
      .upsert({
        booking_id: numericBookingId,
        confirmation_code: row.booking_id, // Il booking_id originale
        external_booking_reference: row.external_reference || row.booking_id,
        status: this.mapBookingStatus(row.booking_status),
        currency: row['Sale currency'] || 'EUR',
        total_price: Number(row['Total price with discount']) || 0,
        total_paid: row['Payment status'] === 'Paid' ? Number(row['Total price with discount']) || 0 : 0,
        total_due: row['Payment status'] !== 'Paid' ? Number(row['Total price with discount']) || 0 : 0,
        payment_type: row['Payment status'] === 'Paid' ? 'PAID' : 'NOT_PAID',
        language: 'es',
        action: 'BOOKING_CONFIRMED',
        creation_date: creationDateStr
      }, {
        onConflict: 'booking_id',
        ignoreDuplicates: false
      });
    
    if (error) throw error;
    
    this.stats.bookingsCreated++;
  }
  
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
  
  private async saveActivityBooking(
    row: SignatureRow, 
    bookingId: number, 
    activityBookingId: number,
    activityConfirmationCode: string
  ): Promise<void> {
    // Prendi la data/ora dall'Excel SENZA CONVERSIONI
    let startDateTimeStr: string;
    let startTime: string = '00:00';
    let dateStr: string = '';
    
    // Se è una stringa (formato tipico: "16/08/2025 18:00")
    if (typeof row.start_date_time === 'string') {
      const parts = row.start_date_time.split(' ');
      if (parts.length >= 2) {
        // Data parte: 16/08/2025
        const datePart = parts[0];
        // Ora parte: 18:00
        const timePart = parts[1];
        
        // Converti data da DD/MM/YYYY a YYYY-MM-DD
        const [day, month, year] = datePart.split('/');
        dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        
        // Prendi l'ora così com'è
        startTime = timePart.substring(0, 5); // 18:00
        
        // Crea la stringa datetime nel formato corretto per Postgres
        startDateTimeStr = `${dateStr} ${timePart}:00`; // 2025-08-16 18:00:00
      } else {
        // Solo data, niente ora
        const [day, month, year] = row.start_date_time.split('/');
        dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        startDateTimeStr = `${dateStr} 00:00:00`;
      }
    } else if (row.start_date_time instanceof Date) {
      // Se Excel l'ha convertita in Date, prendi i valori LOCALI
      const year = row.start_date_time.getFullYear();
      const month = String(row.start_date_time.getMonth() + 1).padStart(2, '0');
      const day = String(row.start_date_time.getDate()).padStart(2, '0');
      const hours = String(row.start_date_time.getHours()).padStart(2, '0');
      const minutes = String(row.start_date_time.getMinutes()).padStart(2, '0');
      
      dateStr = `${year}-${month}-${day}`;
      startTime = `${hours}:${minutes}`;
      startDateTimeStr = `${dateStr} ${hours}:${minutes}:00`;
    } else if (typeof row.start_date_time === 'number') {
      // Numero Excel - convertilo senza timezone
      const excelDate = this.excelDateToJSDate(row.start_date_time);
      const year = excelDate.getFullYear();
      const month = String(excelDate.getMonth() + 1).padStart(2, '0');
      const day = String(excelDate.getDate()).padStart(2, '0');
      const hours = String(excelDate.getHours()).padStart(2, '0');
      const minutes = String(excelDate.getMinutes()).padStart(2, '0');
      
      dateStr = `${year}-${month}-${day}`;
      startTime = `${hours}:${minutes}`;
      startDateTimeStr = `${dateStr} ${hours}:${minutes}:00`;
    } else {
      // Fallback
      console.warn(`⚠️  Formato data non riconosciuto per ${activityConfirmationCode}:`, row.start_date_time);
      const now = new Date();
      dateStr = now.toISOString().split('T')[0];
      startDateTimeStr = `${dateStr} 00:00:00`;
    }
    
    // Calcola durata in base al prodotto
    let durationHours = 2;
    if (row.product_title.toLowerCase().includes('vaticano')) {
      durationHours = 3;
    } else if (row.product_title.toLowerCase().includes('colosseo')) {
      durationHours = 3;
    } else if (row.product_title.toLowerCase().includes('centro')) {
      durationHours = 2.5;
    }
    
    // Calcola end_date_time aggiungendo le ore
    const [endDate, endTime] = this.addHoursToDateTime(dateStr, startTime, durationHours);
    const endDateTimeStr = `${endDate} ${endTime}:00`;
    
    // Product ID
    const productIdFromFile = row.product_id ? String(row.product_id) : '';
    let activityId: string;
    let numericProductId: number | null = null;
    
    if (productIdFromFile) {
      activityId = productIdFromFile;
      numericProductId = parseInt(productIdFromFile) || 0;
      await this.ensureProductExists(activityId, row.product_title);
    } else {
      activityId = this.generateProductIdFromTitle(row.product_title) || 'SIGNATURE-IMPORT';
      console.log(`   ⚠️  Product ID mancante per ${activityConfirmationCode}, generato: "${activityId}"`);
      await this.ensureProductExists(activityId, row.product_title);
    }
    
    // Format date_string come DD/MM/YYYY
    const [yearPart, monthPart, dayPart] = dateStr.split('-');
    const dateString = `${dayPart}/${monthPart}/${yearPart}`;
    
    const { error } = await supabase
      .from('activity_bookings')
      .upsert({
        booking_id: bookingId,
        activity_booking_id: activityBookingId,
        product_id: numericProductId || 0,
        activity_id: activityId,
        product_title: row.product_title,
        product_confirmation_code: activityConfirmationCode,
        start_date_time: startDateTimeStr,
        end_date_time: endDateTimeStr,
        status: this.mapBookingStatus(row.booking_status),
        total_price: Number(row['Total price with discount']) || 0,
        rate_id: null,
        rate_title: null,
        start_time: startTime,
        date_string: dateString
      }, {
        onConflict: 'activity_booking_id',
        ignoreDuplicates: false
      });
    
    if (error) throw error;
    
    this.stats.activitiesCreated++;
  }
  
  private async ensureProductExists(productId: string, title: string): Promise<void> {
    const activityId = String(productId);
    
    try {
      const { data: existing } = await supabase
        .from('activities')
        .select('activity_id')
        .eq('activity_id', activityId)
        .maybeSingle();
      
      if (!existing) {
        const { error } = await supabase
          .from('activities')
          .insert({
            activity_id: activityId,
            title: title || `Producto Signature ${activityId}`,
            description: '[IMPORTADO DE SIGNATURE]',
            price_currency: 'EUR',
            price_amount: 0,
            available_currencies: ['EUR'],
            instant_confirmation: true,
            requires_date: true,
            requires_time: true,
            last_sync: new Date().toISOString()
          });
        
        if (error && error.code !== '23505') {
          console.error(`Errore creando prodotto ${activityId}:`, error);
        }
      }
    } catch (error) {
      // Ignora errori di ricerca, prova comunque a inserire
      console.log(`Creando prodotto ${activityId}...`);
    }
  }
  
  private async saveParticipants(
    participants: ParsedParticipant[], 
    activityBookingId: number,
    mainCustomer: { firstName: string, lastName: string }
  ): Promise<void> {
    
    for (let i = 0; i < participants.length; i++) {
      const participant = participants[i];
      const participantId = activityBookingId * 1000 + i + 1;
      
      // Se il primo partecipante non ha nome e coincide con il cliente principale, usa i suoi dati
      let firstName = participant.name || null;
      let lastName = participant.surname || null;
      
      if (i === 0 && !firstName && participant.category.toLowerCase().includes('adult')) {
        // Probabilmente è il cliente principale
        firstName = mainCustomer.firstName;
        lastName = mainCustomer.lastName;
      }
      
      const { error } = await supabase
        .from('pricing_category_bookings')
        .upsert({
          pricing_category_booking_id: participantId,
          activity_booking_id: activityBookingId,
          pricing_category_id: participant.category.includes('4 a 17') ? 2 : 1, // 2 per bambini, 1 per adulti
          booked_title: participant.category,
          age: participant.age || 0,
          quantity: 1,
          occupancy: 1,
          passenger_first_name: firstName,
          passenger_last_name: lastName,
          passenger_date_of_birth: null
        }, {
          onConflict: 'pricing_category_booking_id',
          ignoreDuplicates: false
        });
      
      if (error) throw error;
      
      this.stats.participantsCreated++;
    }
  }
  
  // Utility functions
  private generateUUID(): string {
    // Genera un UUID v4 valido
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  
  private extractNumericId(bookingId: string): number {
    if (!bookingId) return 0;
    
    // Estrae il numero dopo qualsiasi prefisso (ENRO-, CIV-, HEA-, TIQ-, ecc.)
    const match = bookingId.match(/[A-Z]+-(\d+)/);
    if (match && match[1]) {
      return parseInt(match[1]);
    }
    
    // Se è già numerico
    if (/^\d+$/.test(bookingId)) {
      return parseInt(bookingId);
    }
    
    // Fallback: usa hash del string
    return this.hashString(bookingId);
  }
  
  private generateProductIdFromTitle(title: string): string {
    // Genera un product_id basato sul titolo
    if (!title) return '';
    
    // Prendi le prime lettere di ogni parola
    const words = title.split(' ').filter(w => w.length > 2);
    const acronym = words.map(w => w[0]).join('').toUpperCase();
    
    // Aggiungi un numero basato sull'hash del titolo
    const hash = Math.abs(this.hashString(title)) % 10000;
    
    return `${acronym}-${hash}`;
  }
  
  private generateCustomerId(bookingId: string): number {
    // Genera un ID cliente basato sul booking
    return this.extractNumericId(bookingId) + 2000000; // Offset
  }
  
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
  
  private excelDateToJSDate(excelDate: number): Date {
    // Excel memorizza le date come numero di giorni dal 1/1/1900
    // Ma c'è un bug: considera il 1900 bisestile quando non lo è
    const EXCEL_EPOCH = new Date(1899, 11, 30); // 30/12/1899
    const msPerDay = 24 * 60 * 60 * 1000;
    
    // Per date dopo il 28/02/1900, dobbiamo considerare il bug di Excel
    let daysOffset = excelDate;
    if (excelDate > 60) {
      daysOffset = excelDate - 1;
    }
    
    return new Date(EXCEL_EPOCH.getTime() + daysOffset * msPerDay);
  }
  
  private addHoursToDateTime(dateStr: string, timeStr: string, hours: number): [string, string] {
    // dateStr formato: YYYY-MM-DD
    // timeStr formato: HH:MM
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hour, minute] = timeStr.split(':').map(Number);
    
    // Crea data/ora locale
    const dt = new Date(year, month - 1, day, hour, minute);
    
    // Aggiungi ore
    dt.setHours(dt.getHours() + Math.floor(hours));
    dt.setMinutes(dt.getMinutes() + (hours % 1) * 60);
    
    // Estrai nuova data e ora
    const newYear = dt.getFullYear();
    const newMonth = String(dt.getMonth() + 1).padStart(2, '0');
    const newDay = String(dt.getDate()).padStart(2, '0');
    const newHour = String(dt.getHours()).padStart(2, '0');
    const newMinute = String(dt.getMinutes()).padStart(2, '0');
    
    return [`${newYear}-${newMonth}-${newDay}`, `${newHour}:${newMinute}`];
  }
  
  private parseDate(dateValue: string | number | Date | undefined): Date {
    if (!dateValue) return new Date();
    
    // Se è già una Date
    if (dateValue instanceof Date) {
      return dateValue;
    }
    
    // Se è un numero, è una data Excel
    if (typeof dateValue === 'number') {
      // Conversione da numero Excel a Date JavaScript
      // Excel conta i giorni dal 1/1/1900, ma c'è un bug: considera il 1900 bisestile
      const excelEpoch = new Date(1900, 0, 1);
      const msPerDay = 24 * 60 * 60 * 1000;
      
      // Sottrai 2 perché Excel inizia da 1 e ha il bug del 29/02/1900
      const days = dateValue - 2;
      const ms = days * msPerDay;
      
      return new Date(excelEpoch.getTime() + ms);
    }
    
    // Se è stringa, prova vari formati
    try {
      const date = new Date(dateValue);
      if (!isNaN(date.getTime())) {
        return date;
      }
      
      // Prova formato DD/MM/YYYY o DD-MM-YYYY
      const parts = dateValue.split(/[\/\-]/);
      if (parts.length === 3) {
        const day = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        const year = parseInt(parts[2]);
        return new Date(year, month, day);
      }
    } catch {
      // Ignora errori
    }
    
    return new Date();
  }
  
  private mapBookingStatus(status: string): string {
    const statusMap: { [key: string]: string } = {
      'Confirmed': 'CONFIRMED',
      'Cancelled': 'CANCELLED',
      'Pending': 'PENDING',
      'Rejected': 'CANCELLED'
    };
    
    return statusMap[status] || status.toUpperCase();
  }
  
  private printReport(): void {
    // TypeScript safety check
    if (!this.stats) return;
    
    console.log('\n\n📊 REPORT IMPORTAZIONE SIGNATURE');
    console.log('=================================');
    console.log(`✅ Righe totali processate: ${this.stats.totalRows}`);
    console.log(`⏭️  Attività saltate (già esistenti): ${this.stats.skippedActivities}`);
    console.log(`✅ Clienti creati/aggiornati: ${this.stats.customersCreated}`);
    console.log(`✅ Prenotazioni create/aggiornate: ${this.stats.bookingsCreated}`);
    console.log(`✅ Attività create/aggiornate: ${this.stats.activitiesCreated}`);
    console.log(`✅ Partecipanti creati: ${this.stats.participantsCreated}`);
    
    if (this.stats.errors.length > 0) {
      console.log(`\n❌ Errori: ${this.stats.errors.length}`);
      console.log('\nPrimi 10 errori:');
      this.stats.errors.slice(0, 10).forEach(err => {
        console.log(`   - ${err.bookingId} / ${err.confirmationCode} (${err.customer}): ${err.error}`);
      });
      
      if (this.stats.errors.length > 10) {
        console.log(`   ... e altri ${this.stats.errors.length - 10} errori`);
      }
      
      // Salva errori in un file
      const errorFile = `import-errors-${new Date().toISOString().split('T')[0]}.json`;
      try {
        fs.writeFileSync(errorFile, JSON.stringify(this.stats.errors, null, 2));
        console.log(`\n💾 Errori salvati in: ${errorFile}`);
      } catch (writeError: any) {
        console.error(`\n⚠️  Non riesco a salvare il file errori:`, writeError?.message || writeError);
      }
    }
    
    console.log('\n✅ Importazione completata!');
    
    console.log(`\n💡 Riepilogo finale:`);
    console.log(`   - ${this.stats.activitiesCreated} nuove attività importate`);
    console.log(`   - ${this.stats.skippedActivities} attività saltate (già esistenti)`);
    console.log(`   - ${this.stats.errors.length} errori`);
  }
}

// Script principale
async function main() {
  const args = process.argv.slice(2);
  const filePath = args[0];
  
  if (!filePath) {
    console.log('📊 IMPORTATORE SIGNATURE → SUPABASE');
    console.log('====================================\n');
    console.log('Uso:');
    console.log('  npm run import-signature <file.xlsx>\n');
    console.log('Esempio:');
    console.log('  npm run import-signature "Import Viaje al centro del mundo dal 1 agosto.xlsx"\n');
    console.log('Il file deve avere le colonne Signature standard:');
    console.log('  - booking_id (formato PREFIX-XXXXXXX: ENRO-, CIV-, HEA-, TIQ-, ecc.)');
    console.log('  - confirmation_code (codice dell\'attività)');
    console.log('  - Customer (formato "Cognome, Nome")');
    console.log('  - signature.PaxName (tutti i partecipanti)');
    console.log('  - product_id (minuscolo - ID numerico del prodotto)');
    console.log('  - Email, product_title, ecc.');
    console.log('\nNOTA: Ogni riga rappresenta UN\'ATTIVITÀ, non un booking.');
    console.log('      Più righe possono avere lo stesso booking_id.');
    process.exit(0);
  }
  
  try {
    if (!fs.existsSync(filePath)) {
      console.error('❌ File non trovato:', filePath);
      process.exit(1);
    }
  } catch {
    console.error('❌ Errore accesso file:', filePath);
    process.exit(1);
  }
  
  const importer = new SignatureImporter();
  await importer.importFromExcel(filePath);
}

// Esegui
main().catch(error => {
  console.error('❌ Errore:', error);
  process.exit(1);
});