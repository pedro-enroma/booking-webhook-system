import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import webhookRoutes from './routes/webhook';
import syncRoutes from './routes/sync';
import gtmRoutes from './routes/gtm';
// import gtmEnhancedRoutes from './routes/gtm-enhanced'; // Not needed - using existing GTM webhook
import { initializeCronJobs } from './cronJobs';

// Carica le variabili d'ambiente dal file .env
dotenv.config();

// Crea l'applicazione Express
const app = express();

// IMPORTANTE: Railway fornisce la porta tramite la variabile PORT
const PORT = parseInt(process.env.PORT || '3000', 10);

// Middleware with CORS configuration for GTM
const corsOptions = {
  origin: function (origin: any, callback: any) {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);
    
    // List of allowed origins
    const allowedOrigins = [
      'https://enroma.com',
      'https://www.enroma.com',
      'http://localhost:3000', // for testing
      /\.googletagmanager\.com$/  // Allow all GTM domains
    ];
    
    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return allowed === origin;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.log('⚠️ CORS blocked origin:', origin);
      callback(null, true); // Still allow for now, but log it
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
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
app.use(gtmRoutes);
// app.use(gtmEnhancedRoutes); // Not needed - using existing GTM webhook

// Route principale
app.get('/', (req, res) => {
  res.json({
    message: '🚀 Server Webhook per Bokun attivo!',
    endpoints: {
      webhook_booking: 'POST /webhook/booking',
      webhook_availability: 'POST /webhook/availability',
      webhook_gtm: 'POST /webhook/gtm',
      gtm_health: 'GET /webhook/gtm/health',
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
  console.log(`- POST http://localhost:${PORT}/webhook/availability (riceve aggiornamenti disponibilità)`);
  console.log(`- POST http://localhost:${PORT}/webhook/gtm (riceve dati GTM/GA4)`);
  console.log(`- GET  http://localhost:${PORT}/webhook/gtm/health (stato GTM webhook)`);
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