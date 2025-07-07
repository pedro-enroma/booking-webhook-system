import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import webhookRoutes from './routes/webhook';
import syncRoutes from './routes/sync';
import { initializeCronJobs } from './cronJobs';

// Carica le variabili d'ambiente dal file .env
dotenv.config();

// Crea l'applicazione Express
const app = express();

// IMPORTANTE: Railway fornisce la porta tramite la variabile PORT
const PORT = parseInt(process.env.PORT || '3000', 10);

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Log per ogni richiesta ricevuta
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path} - ${new Date().toLocaleString()}`);
  next();
});

// Routes
app.use(webhookRoutes);
app.use('/api', syncRoutes);

// Route principale
app.get('/', (req, res) => {
  res.json({
    message: '🚀 Server Webhook per Bokun attivo!',
    endpoints: {
      webhook: 'POST /webhook/booking',
      health: 'GET /health',
      syncProducts: 'POST /api/sync/products',
      syncAvailability: 'POST /api/sync/availability',
      getProducts: 'GET /api/sync/products'
    },
    status: 'ready',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Avvia il server
app.listen(PORT, '0.0.0.0', () => {
  console.log('================================');
  console.log(`🚀 Server avviato con successo!`);
  console.log(`📡 In ascolto sulla porta ${PORT}`);
  console.log(`🔗 URL locale: http://localhost:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('================================');
  console.log('Endpoints disponibili:');
  console.log(`- POST http://localhost:${PORT}/webhook/booking (riceve prenotazioni)`);
  console.log(`- GET  http://localhost:${PORT}/health (verifica stato)`);
  console.log(`- POST http://localhost:${PORT}/api/sync/products (sincronizza prodotti)`);
  console.log(`- POST http://localhost:${PORT}/api/sync/availability (sincronizza disponibilità)`);
  console.log(`- GET  http://localhost:${PORT}/api/sync/products (visualizza prodotti)`);
  console.log('================================');
  
  // Inizializza cron jobs solo in produzione
  if (process.env.NODE_ENV === 'production') {
    initializeCronJobs();
  } else {
    console.log('⏰ Cron jobs disabilitati in development');
  }
});