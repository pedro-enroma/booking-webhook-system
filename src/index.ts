import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import webhookRoutes from './routes/webhook';

// Carica le variabili d'ambiente dal file .env
dotenv.config();

// Crea l'applicazione Express
const app = express();

// IMPORTANTE: Railway fornisce la porta tramite la variabile PORT
const PORT = process.env.PORT || 3000;

// Middleware per permettere richieste da altri domini
app.use(cors());

// Middleware per parsare il JSON nel body delle richieste
// Importante: limit aumentato per gestire webhook grandi
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Aggiungi un log per ogni richiesta ricevuta
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path} - ${new Date().toLocaleString()}`);
  next();
});

// Usa le route del webhook
app.use(webhookRoutes);

// Route principale per verificare che il server funzioni
app.get('/', (req, res) => {
  res.json({
    message: '🚀 Server Webhook per Bokun attivo!',
    endpoints: {
      webhook: 'POST /webhook/booking',
      health: 'GET /health'
    },
    status: 'ready'
  });
});

// Avvia il server - IMPORTANTE: usa 0.0.0.0 per Railway
app.listen(PORT, '0.0.0.0', () => {
  console.log('================================');
  console.log(`🚀 Server avviato con successo!`);
  console.log(`📡 In ascolto sulla porta ${PORT}`);
  console.log(`🔗 URL locale: http://localhost:${PORT}`);
  console.log('================================');
  console.log('Endpoints disponibili:');
  console.log(`- POST http://localhost:${PORT}/webhook/booking (per ricevere prenotazioni)`);
  console.log(`- GET  http://localhost:${PORT}/health (per verificare lo stato)`);
  console.log('================================');
});