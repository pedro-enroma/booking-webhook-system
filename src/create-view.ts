// Script per creare automaticamente la vista Roma su Supabase
import dotenv from 'dotenv';
import { supabase } from './config/supabase';

dotenv.config();

async function createRomeView() {
  console.log('🔧 CREAZIONE VISTA ROMA');
  console.log('======================\n');
  
  const viewSQL = `
    CREATE OR REPLACE VIEW activity_availability_rome AS
    SELECT 
      *,
      -- Aggiunge 2 ore in estate (apr-ott) o 1 ora in inverno
      CASE 
        WHEN EXTRACT(MONTH FROM local_date) BETWEEN 4 AND 10 THEN
          (local_time::time + interval '2 hours')::time
        ELSE
          (local_time::time + interval '1 hour')::time
      END as local_time_rome,
      
      -- Aggiusta la data se l'ora supera mezzanotte
      CASE 
        WHEN EXTRACT(MONTH FROM local_date) BETWEEN 4 AND 10 AND 
             local_time::time >= '22:00'::time THEN
          local_date + interval '1 day'
        WHEN EXTRACT(MONTH FROM local_date) NOT BETWEEN 4 AND 10 AND 
             local_time::time >= '23:00'::time THEN
          local_date + interval '1 day'
        ELSE
          local_date
      END as local_date_rome
    FROM activity_availability;
  `;
  
  try {
    console.log('📝 Creazione vista activity_availability_rome...\n');
    
    // Esegui il comando SQL
    const { error } = await supabase.rpc('exec_sql', { 
      sql_query: viewSQL 
    }).single();
    
    if (error) {
      // Se l'RPC non esiste, mostra istruzioni manuali
      if (error.message.includes('exec_sql')) {
        console.log('⚠️  La funzione RPC non esiste. Crea la vista manualmente:\n');
        console.log('1. Vai su Supabase Dashboard');
        console.log('2. Clicca su "SQL Editor"');
        console.log('3. Incolla questo codice:\n');
        console.log('```sql');
        console.log(viewSQL);
        console.log('```\n');
        console.log('4. Clicca su "Run"\n');
        return;
      }
      throw error;
    }
    
    console.log('✅ Vista creata con successo!\n');
    
    // Test della vista
    console.log('🧪 Test della vista...');
    const { data, error: testError } = await supabase
      .from('activity_availability_rome')
      .select('local_time, local_time_rome')
      .limit(1);
    
    if (testError) {
      throw testError;
    }
    
    console.log('✅ Vista funzionante!\n');
    
    // Mostra esempio
    if (data && data.length > 0) {
      console.log('📊 Esempio conversione:');
      console.log(`   Ora Bokun: ${data[0].local_time}`);
      console.log(`   Ora Roma:  ${data[0].local_time_rome}\n`);
    }
    
    console.log('📝 Come usare la vista:');
    console.log('```sql');
    console.log('SELECT * FROM activity_availability_rome');
    console.log('WHERE activity_id = \'221226\'');
    console.log('  AND local_date_rome >= CURRENT_DATE');
    console.log('ORDER BY local_date_rome, local_time_rome;');
    console.log('```');
    
  } catch (error: any) {
    console.error('❌ Errore:', error.message);
    
    // Mostra comunque il codice SQL
    console.log('\n💡 Copia questo codice SQL e eseguilo manualmente su Supabase:\n');
    console.log('```sql');
    console.log(viewSQL);
    console.log('```');
  }
}

// Alternativa: crea anche una funzione RPC per eseguire SQL
async function createExecSQLFunction() {
  const functionSQL = `
    CREATE OR REPLACE FUNCTION exec_sql(sql_query text)
    RETURNS void AS $$
    BEGIN
      EXECUTE sql_query;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `;
  
  console.log('\n💡 Per abilitare la creazione automatica, crea questa funzione su Supabase:');
  console.log('```sql');
  console.log(functionSQL);
  console.log('```');
}

// Esegui
createRomeView().then(() => {
  console.log('\n✅ Processo completato');
  process.exit(0);
}).catch((error) => {
  console.error('\n💥 Errore fatale:', error);
  process.exit(1);
});