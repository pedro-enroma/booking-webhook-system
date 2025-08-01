// Script per importare i nomi dei passeggeri dal file Excel
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import dotenv from 'dotenv';
import { supabase } from './config/supabase';

dotenv.config();

/**
 * STRUTTURA DEI DATI:
 * - Un booking principale (booking_id) può avere MOLTE attività
 * - Ogni riga del file rappresenta UN'ATTIVITÀ specifica
 * - confirmation_code = codice dell'attività (es. ENRO-T100013270)
 * - booking_id = ID del booking principale (es. BUE-67811961)
 * - I prefissi possono essere qualsiasi: ENRO-, BUE-, WEX-, HEA-, TIQ-, VIA-, TTG-, etc.
 */

interface PassengerInfo {
  name: string;
  category: string;
}

interface ImportRow {
  creation_date: string;
  external_reference: string;
  booking_id: string;
  confirmation_code: string;
  Customer: string;  // Maiuscola!
  Email: string;     // Maiuscola!
  'Phone number': string;  // Con spazio!
  product_id: number;
  product_title: string;
  start_date_time: string;
  booking_status: string;
  'Total PAX': number;  // Con spazio e maiuscole!
  Participants: string;  // Maiuscola!
  'signature.PaxName': string;
  'Total price with discount': number;  // Aggiungo questo campo!
}

// Funzione per parsare i nomi dei passeggeri
function parsePassengerNames(paxNameString: string): PassengerInfo[] {
  if (!paxNameString || paxNameString.trim() === '') {
    return [];
  }
  
  // Split per virgola e processa ogni passeggero
  const passengers = paxNameString.split('),').map(p => p.trim());
  
  return passengers.map(passenger => {
    // Rimuovi la parentesi finale se esiste
    passenger = passenger.endsWith(')') ? passenger : passenger + ')';
    
    // Estrai nome e categoria usando regex
    const match = passenger.match(/^(.+?)\s*\((.+?)\)$/);
    
    if (match) {
      return {
        name: match[1].trim(),
        category: match[2].trim()
      };
    }
    
    // Se non matcha il pattern, ritorna comunque qualcosa
    return {
      name: passenger.replace(/\(.+?\)/, '').trim(),
      category: 'Adultos' // Default
    };
  });
}

// Funzione per trovare o creare un booking
async function findOrCreateBooking(row: ImportRow) {
  try {
    // Estrai il booking ID numerico rimuovendo qualsiasi prefisso
    const bookingIdNumeric = parseInt(row.booking_id.replace(/[A-Z]+-/g, ''));
    
    // Prima cerca se il booking esiste già
    const { data: existingBooking, error: searchError } = await supabase
      .from('bookings')
      .select('booking_id')
      .eq('booking_id', bookingIdNumeric)
      .maybeSingle();
    
    if (existingBooking) {
      console.log(`   ✅ Booking principale esistente: ${row.booking_id} (ID: ${bookingIdNumeric})`);
      console.log(`   📎 Collegamento activity al booking esistente`);
      return existingBooking.booking_id;
    }
    
    // Se non esiste, crealo
    console.log(`   📝 Creazione nuovo booking principale: ${row.booking_id} (ID: ${bookingIdNumeric})`);
    
    // Crea prima il customer se necessario
    const customerId = await findOrCreateCustomer(row);
    
    // Calcola il total price del booking (potrebbe essere la somma di più attività)
    const totalPrice = row['Total price with discount'] || 0;
    
    // Poi crea il booking (usa bookingIdNumeric già dichiarato sopra)
    const { data: newBooking, error: insertError } = await supabase
      .from('bookings')
      .upsert({
        booking_id: bookingIdNumeric,  // Usa la variabile già esistente
        confirmation_code: row.booking_id, // Il booking ID originale con prefisso
        external_booking_reference: row.external_reference,
        status: row.booking_status,
        currency: 'EUR',
        total_price: totalPrice,  // Usa il prezzo dall'Excel
        total_paid: 0,
        total_due: totalPrice,    // Assumiamo che sia tutto da pagare
        payment_type: 'NOT_PAID',
        language: 'es',
        action: 'BOOKING_CONFIRMED',
        creation_date: new Date(row.creation_date).toISOString()
      }, {
        onConflict: 'booking_id'
      })
      .select('booking_id')
      .single();
    
    if (insertError) {
      // Se è un errore di duplicato, proviamo a recuperare il booking esistente
      if (insertError.code === '23505') {
        console.log('   ℹ️  Booking già esistente, recupero ID...');
        // NON ridichiarare bookingIdNumeric, è già stata dichiarata sopra!
        const { data: existingBookingById } = await supabase
          .from('bookings')
          .select('booking_id')
          .eq('booking_id', bookingIdNumeric)
          .single();
        
        if (existingBookingById) {
          return existingBookingById.booking_id;
        }
      }
      console.error('   ❌ Errore creando booking:', insertError);
      throw insertError;
    }
    
    // Collega il booking al cliente
    if (customerId && newBooking) {
      await linkBookingToCustomer(newBooking.booking_id, customerId);
    }
    
    return newBooking?.booking_id;
    
  } catch (error) {
    console.error('Errore in findOrCreateBooking:', error);
    throw error;
  }
}

// Funzione per trovare o creare un customer
async function findOrCreateCustomer(row: ImportRow) {
  try {
    // Genera un ID univoco basato sull'email
    const customerId = Math.abs(row.Email.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0));
    
    const { data: existing } = await supabase
      .from('customers')
      .select('customer_id')
      .eq('email', row.Email)
      .maybeSingle();
    
    if (existing) {
      return existing.customer_id;
    }
    
    // Estrai nome e cognome
    const nameParts = row.Customer.split(',').map(p => p.trim());
    const lastName = nameParts[0] || '';
    const firstName = nameParts[1] || '';
    
    const { data: newCustomer } = await supabase
      .from('customers')
      .insert({
        customer_id: customerId,
        uuid: `customer-${customerId}`,
        email: row.Email,
        first_name: firstName,
        last_name: lastName,
        phone_number: row['Phone number']?.toString() || null
      })
      .select('customer_id')
      .single();
    
    return newCustomer?.customer_id || customerId;
    
  } catch (error) {
    console.error('Errore in findOrCreateCustomer:', error);
    return null;
  }
}

// Funzione per collegare la prenotazione al cliente
async function linkBookingToCustomer(bookingId: number, customerId: number): Promise<void> {
  const { error } = await supabase
    .from('booking_customers')
    .upsert({
      booking_id: bookingId,
      customer_id: customerId
    }, {
      onConflict: 'booking_id,customer_id',
      ignoreDuplicates: true
    });
  
  if (error) {
    console.error('Errore collegando booking a customer:', error);
  }
}

// Funzione per creare un nuovo activity booking (quando sappiamo già che non esiste)
async function createActivityBooking(row: ImportRow, parentBookingId: number, activityBookingId: number) {
  try {
    // Metodo semplice: prendi i valori locali e aggiungi 'Z' per forzare come UTC
    const startDateTime = new Date(row.start_date_time);
    
    // Estrai i componenti locali
    const year = startDateTime.getFullYear();
    const month = String(startDateTime.getMonth() + 1).padStart(2, '0');
    const day = String(startDateTime.getDate()).padStart(2, '0');
    const hours = String(startDateTime.getHours()).padStart(2, '0');
    const minutes = String(startDateTime.getMinutes()).padStart(2, '0');
    const seconds = '00';
    
    // Costruisci ISO string con l'ora LOCALE ma marcata come UTC
    // Questo preserverà l'ora esatta che vedi nell'Excel
    const startDateTimeStr = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.000Z`;
    
    // Calcola end time (+2 ore)
    const endDateTime = new Date(startDateTime);
    endDateTime.setHours(endDateTime.getHours() + 2);
    
    const endYear = endDateTime.getFullYear();
    const endMonth = String(endDateTime.getMonth() + 1).padStart(2, '0');
    const endDay = String(endDateTime.getDate()).padStart(2, '0');
    const endHours = String(endDateTime.getHours()).padStart(2, '0');
    const endMinutes = String(endDateTime.getMinutes()).padStart(2, '0');
    
    const endDateTimeStr = `${endYear}-${endMonth}-${endDay}T${endHours}:${endMinutes}:${seconds}.000Z`;
    
    // Prendi il prezzo dalla colonna corretta
    const totalPrice = row['Total price with discount'] || 0;
    
    const { data: newActivity, error } = await supabase
      .from('activity_bookings')
      .insert({
        booking_id: parentBookingId,
        activity_booking_id: activityBookingId,
        product_id: row.product_id,
        activity_id: row.product_id.toString(),
        product_title: row.product_title,
        product_confirmation_code: row.confirmation_code,
        start_date_time: startDateTimeStr,  // Ora esatta dall'Excel
        end_date_time: endDateTimeStr,      // +2 ore
        status: row.booking_status,
        total_price: totalPrice,  // Usa il valore dall'Excel
        rate_title: 'Standard',
        start_time: `${hours}:${minutes}`,  // Ora locale
        date_string: `${day}/${month}/${year}`
      })
      .select('activity_booking_id')
      .single();
    
    if (error) {
      console.error('   ❌ Errore creando activity booking:', error);
      throw error;
    }
    
    console.log(`   ✅ Activity booking creato: ${activityBookingId} (${row.product_title})`);
    console.log(`      📅 Data/ora: ${day}/${month}/${year} ${hours}:${minutes}`);
    console.log(`      💰 Prezzo: €${totalPrice}`);
    return activityBookingId;
    
  } catch (error) {
    console.error('Errore in createActivityBooking:', error);
    throw error;
  }
}

// Funzione principale di import
async function importSignatures(filePath: string) {
  console.log('🚀 AVVIO IMPORT SIGNATURES');
  console.log('==========================\n');
  
  try {
    // Leggi il file Excel
    const fileContent = fs.readFileSync(filePath);
    const workbook = XLSX.read(fileContent, {
      cellDates: true,  // IMPORTANTE: converte automaticamente le date Excel in oggetti Date
      dateNF: 'dd/mm/yyyy hh:mm:ss'  // Formato date
    });
    
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json(firstSheet);
    
    console.log(`📊 Trovate ${rawData.length} righe da processare\n`);
    
    let successCount = 0;
    let errorCount = 0;
    let skipCount = 0;
    let skipNoNames = 0;
    let skipExisting = 0;
    const processedBookings = new Set<string>(); // Per tracciare i booking principali
    
    // Processa ogni riga
    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i] as ImportRow;
      
      console.log(`\n📋 Processando riga ${i + 1}/${rawData.length}`);
      console.log(`   Booking principale: ${row.booking_id}`);
      console.log(`   Activity: ${row.confirmation_code} - ${row.product_title}`);
      console.log(`   Cliente: ${row.Customer}`);
      console.log(`   Prezzo: €${row['Total price with discount']}`);
      
      try {
        // Verifica che ci siano nomi passeggeri
        if (!row['signature.PaxName'] || row['signature.PaxName'].trim() === '') {
          console.log('   ⚠️  Nessun nome passeggero, skip');
          skipNoNames++;
          skipCount++;
          continue;
        }
        
        // 1. PRIMA controlla se l'activity_booking esiste già
        const confirmMatch = row.confirmation_code.match(/[A-Z]+[-]?T?(\d+)/);
        if (!confirmMatch) {
          console.log('   ❌ Formato confirmation_code non valido:', row.confirmation_code);
          errorCount++;
          continue;
        }
        
        const activityBookingId = parseInt(confirmMatch[1]);
        
        // Verifica se l'activity booking esiste già
        const { data: existingActivity } = await supabase
          .from('activity_bookings')
          .select('activity_booking_id, booking_id')
          .eq('activity_booking_id', activityBookingId)
          .maybeSingle();
        
        if (existingActivity) {
          console.log(`   ⚠️  Activity booking ${activityBookingId} già esistente, skip`);
          skipExisting++;
          skipCount++;
          continue;
        }
        
        // 2. Se l'activity non esiste, trova o crea il booking principale
        const bookingId = await findOrCreateBooking(row);
        if (!bookingId) {
          throw new Error('Impossibile creare/trovare booking');
        }
        
        // 3. Crea l'activity booking (sappiamo già che non esiste)
        await createActivityBooking(row, bookingId, activityBookingId);
        
        // 4. Parsa i nomi dei passeggeri
        const passengers = parsePassengerNames(row['signature.PaxName']);
        console.log(`   👥 Trovati ${passengers.length} passeggeri`);
        
        // 5. Salva ogni passeggero
        for (let j = 0; j < passengers.length; j++) {
          const passenger = passengers[j];
          const isLeadPassenger = j === 0; // Il primo è il lead passenger
          
          // Genera ID univoco per pricing category booking
          const pricingCategoryBookingId = parseInt(
            activityBookingId.toString() + (j + 1).toString().padStart(3, '0')
          );
          
          // Determina pricing category ID basato sulla categoria
          let pricingCategoryId = 1; // Default: Adulto
          if (passenger.category.toLowerCase().includes('niñ') || 
              passenger.category.toLowerCase().includes('nin') ||
              passenger.category.toLowerCase().includes('child')) {
            pricingCategoryId = 2; // Bambino
          }
          
          // Estrai nome e cognome
          const nameParts = passenger.name.split(' ');
          const firstName = nameParts.slice(0, -1).join(' ') || passenger.name;
          const lastName = nameParts[nameParts.length - 1] || '';
          
          // Salva nel database
          const { error } = await supabase
            .from('pricing_category_bookings')
            .upsert({
              pricing_category_booking_id: pricingCategoryBookingId,
              activity_booking_id: activityBookingId,
              pricing_category_id: pricingCategoryId,
              booked_title: passenger.category,
              age: 0, // Non abbiamo l'età
              quantity: 1,
              occupancy: 1,
              passenger_first_name: firstName,
              passenger_last_name: lastName
              // lead_passenger: isLeadPassenger // Commentato se la colonna non esiste
            }, {
              onConflict: 'pricing_category_booking_id',
              ignoreDuplicates: false
            });
          
          if (error) {
            console.error(`   ❌ Errore salvando passeggero ${passenger.name}:`, error);
          } else {
            console.log(`   ✅ Passeggero salvato: ${passenger.name} (${passenger.category})`);
          }
        }
        
        successCount++;
        processedBookings.add(row.booking_id);
        console.log(`   ✅ Riga processata con successo`);
        
      } catch (error) {
        console.error(`   ❌ Errore processando riga:`, error);
        errorCount++;
      }
      
      // Pausa breve per non sovraccaricare il database
      if (i % 10 === 0 && i > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // Riepilogo finale
    console.log('\n=============================');
    console.log('📊 RIEPILOGO IMPORT');
    console.log('=============================');
    console.log(`✅ Attività processate con successo: ${successCount}`);
    console.log(`❌ Errori: ${errorCount}`);
    console.log(`⚠️  Skip totali: ${skipCount}`);
    if (skipCount > 0) {
      console.log(`    - Senza nomi passeggeri: ${skipNoNames}`);
      console.log(`    - Activity già esistenti: ${skipExisting}`);
    }
    console.log(`📊 Totale righe processate: ${rawData.length}`);
    console.log(`📦 Booking principali coinvolti: ${processedBookings.size}`);
    console.log('=============================');
    
  } catch (error) {
    console.error('💥 Errore fatale durante import:', error);
    throw error;
  }
}

// Funzione di test per verificare il parsing dei nomi
function testParseNames() {
  console.log('🧪 TEST PARSING NOMI');
  console.log('===================\n');
  
  const testCases = [
    "ENRIQUE BALLESTER CAUDET (Adultos), ENRIQUE BALLESTER CAPDEVILA (Adultos), ROSA ANA CAUDET HUGUET (Adultos), ANA BALLESTER CAUDET (Adultos)",
    "EstefanÃ­a Delgado Pacheco (Adultos), Mario Sanchez Paez (Adultos)",
    "JULIO VICENTE FERNÃNDEZ ALVAREZ (Adultos), MARIA BEATRIZ FERNÃNDEZ ALVAREZ (Adultos), ELSA GARCIA FERNANDEZ (Adultos), ALEX GARCIA FERNANDEZ (Adultos)"
  ];
  
  testCases.forEach((testCase, index) => {
    console.log(`Test ${index + 1}:`);
    console.log(`Input: "${testCase}"`);
    const parsed = parsePassengerNames(testCase);
    console.log('Output:', parsed);
    console.log('');
  });
  
  // Test estrazione activity_booking_id
  console.log('🧪 TEST ESTRAZIONE ACTIVITY BOOKING ID');
  console.log('=====================================\n');
  
  const confirmationCodes = [
    'ENRO-T100013270',
    'ENRO-T100013271',
    'CIV-T98765432',
    'WEX-T12345678',
    'BUE-T87654321'
  ];
  
  confirmationCodes.forEach(code => {
    const match = code.match(/[A-Z]+[-]?T?(\d+)/);
    if (match) {
      console.log(`${code} → ${match[1]}`);
    }
  });
}

// Script principale
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (command === 'test') {
    testParseNames();
  } else if (command === 'import') {
    const filePath = args[1] || 'Import Entradas Panteon dal 1 agosto.xlsx';
    await importSignatures(filePath);
  } else {
    console.log('📖 USO:');
    console.log('  npm run import-signature test     - Testa il parsing dei nomi');
    console.log('  npm run import-signature import [file.xlsx]  - Importa i dati');
    console.log('\nEsempio:');
    console.log('  npm run import-signature import "Import Entradas Panteon dal 1 agosto.xlsx"');
  }
}

// Esegui se chiamato direttamente
if (require.main === module) {
  main().then(() => {
    console.log('\n✅ Processo completato');
    process.exit(0);
  }).catch(error => {
    console.error('\n💥 Errore:', error);
    process.exit(1);
  });
}

export { importSignatures, parsePassengerNames, testParseNames };