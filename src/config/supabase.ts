import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Carica le variabili dal file .env che abbiamo creato prima
dotenv.config();

// Verifica che le variabili esistano
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Mancano le variabili di ambiente per Supabase! Controlla il file .env');
}

// Crea il client Supabase con la service_role key
// La service_role key ha permessi completi sul database
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,     // Non salva la sessione (siamo un server)
      autoRefreshToken: false,   // Non rinnova automaticamente il token
    }
  }
);

console.log('✅ Connessione a Supabase configurata correttamente');