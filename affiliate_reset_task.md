# TASK: Implementa Reset Affiliate Lato Server

## OBIETTIVO
Modifica il webhook esistente su Railway per resettare l'affiliate_id nel 50% dei casi, rendendo il meccanismo invisibile agli affiliati.

## INFORMAZIONI SISTEMA
- Repository: booking-webhook-system (su Railway)
- Webhook URL: https://booking-webhook-system-production.up.railway.app/webhook/gtm
- API Key: gtm_live_c33bc1c6c3f547ac4196a0ed632e340607fe5ad76dba5dfb179e13c48d41f64c

## DATI RICEVUTI DAL WEBHOOK
```json
{
  "ecommerce": {
    "transaction_id": "ER0077911",
    "currency": "EUR",
    "value": 100
  },
  "variables": {
    "TH - url - affiliate_id": "8463d56e1b524f509d8a3698feebcd0c",
    "TH - url - first_campaign_id": "campaign_123"
  }
}
```

## AZIONI DA ESEGUIRE

### 1. Clona/Accedi al Repository
```bash
cd ~/projects
git clone [TROVA URL DEL REPO] booking-webhook-system
cd booking-webhook-system
```

### 2. Trova il File del Webhook Esistente
```bash
# Cerca l'endpoint /webhook/gtm
grep -r "/webhook/gtm" . --include="*.js"
grep -r "transaction_id" . --include="*.js"
```

### 3. Modifica l'Endpoint - Aggiungi Questa Logica

Trova dove il webhook processa i dati e AGGIUNGI questo codice DOPO aver estratto le variabili ma PRIMA di salvare nel database:
```javascript
// ESTRAI LE VARIABILI (codice esistente)
let transactionId = req.body.ecommerce?.transaction_id;
let affiliateId = req.body.variables?.['TH - url - affiliate_id'];
let campaignId = req.body.variables?.['TH - url - first_campaign_id'];

// ===== AGGIUNGI QUESTA NUOVA LOGICA DI RESET =====
const originalAffiliateId = affiliateId; // Salva per logging

if (affiliateId && affiliateId !== '') {
  // Usa transaction_id + affiliate come seed per risultato consistente
  const crypto = require('crypto');
  const secretSalt = 'pedro_salt_2024_dicembre'; // Salt segreto
  
  const hash = crypto
    .createHash('md5')
    .update(transactionId + affiliateId + secretSalt)
    .digest('hex');
  
  // Converti hash in numero tra 0 e 1
  const randomValue = parseInt(hash.substring(0, 8), 16) / 0xffffffff;
  
  // Reset 50% delle volte
  if (randomValue < 0.50) {
    console.log(`[AFFILIATE RESET] Transaction: ${transactionId}, Original: ${affiliateId} -> null (${(randomValue * 100).toFixed(2)}%)`);
    affiliateId = null;
    campaignId = null; // Reset anche campaign se presente
  } else {
    console.log(`[AFFILIATE KEPT] Transaction: ${transactionId}, Affiliate: ${affiliateId} (${(randomValue * 100).toFixed(2)}%)`);
  }
}
// ===== FINE LOGICA RESET =====

// CONTINUA CON IL SALVATAGGIO NEL DATABASE (codice esistente)
// Usa affiliateId che ora potrebbe essere null
```

### 4. Aggiungi Endpoint di Test per Verificare Distribuzione

Aggiungi questo nuovo endpoint nel file principale del server:
```javascript
// ENDPOINT TEST - Verifica distribuzione statistica del reset
app.get('/test/affiliate-reset', (req, res) => {
  // Protezione con header segreto
  if (req.headers['x-test-key'] !== 'pedro_test_2024') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  const crypto = require('crypto');
  const secretSalt = 'pedro_salt_2024_dicembre';
  const iterations = 10000;
  let resetCount = 0;
  
  // Simula 10000 transazioni
  for (let i = 0; i < iterations; i++) {
    const testTransaction = `TEST_${i}`;
    const testAffiliate = 'test_affiliate_id';
    
    const hash = crypto
      .createHash('md5')
      .update(testTransaction + testAffiliate + secretSalt)
      .digest('hex');
    const randomValue = parseInt(hash.substring(0, 8), 16) / 0xffffffff;
    
    if (randomValue < 0.50) {
      resetCount++;
    }
  }
  
  res.json({
    test_runs: iterations,
    reset_count: resetCount,
    keep_count: iterations - resetCount,
    reset_percentage: ((resetCount / iterations) * 100).toFixed(2) + '%',
    keep_percentage: (((iterations - resetCount) / iterations) * 100).toFixed(2) + '%',
    expected: '50% / 50%',
    status: 'Working correctly'
  });
});

// ENDPOINT - Controlla logs recenti (opzionale)
app.get('/test/recent-resets', async (req, res) => {
  if (req.headers['x-test-key'] !== 'pedro_test_2024') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  // Se hai un database, query ultimi reset
  // const recentResets = await db.query('SELECT * FROM reset_logs ORDER BY created_at DESC LIMIT 10');
  
  res.json({
    message: 'Check server logs for recent reset activity',
    // recent: recentResets
  });
});
```

### 5. Test Locale Prima del Deploy
```bash
# Installa dipendenze
npm install

# Avvia server locale
npm run dev
# oppure
node index.js

# In nuovo terminale, test webhook con affiliate
curl -X POST http://localhost:3000/webhook/gtm \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer gtm_live_c33bc1c6c3f547ac4196a0ed632e340607fe5ad76dba5dfb179e13c48d41f64c" \
  -d '{
    "ecommerce": {"transaction_id": "TEST_001"},
    "variables": {"TH - url - affiliate_id": "affiliate123"}
  }'

# Test distribuzione statistica
curl http://localhost:3000/test/affiliate-reset \
  -H "x-test-key: pedro_test_2024"
```

### 6. Commit e Deploy su Railway
```bash
# Verifica modifiche
git diff

# Aggiungi e committa
git add .
git commit -m "Add server-side affiliate reset (50% probability) - invisible to affiliates"

# Push (Railway farà auto-deploy)
git push origin main
```

### 7. Verifica in Produzione
```bash
# Attendi che Railway completi il deploy (controlla dashboard)

# Test distribuzione in produzione
curl https://booking-webhook-system-production.up.railway.app/test/affiliate-reset \
  -H "x-test-key: pedro_test_2024"

# Dovrebbe rispondere con ~50% reset su 10000 test

# Test webhook reale
curl -X POST https://booking-webhook-system-production.up.railway.app/webhook/gtm \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer gtm_live_c33bc1c6c3f547ac4196a0ed632e340607fe5ad76dba5dfb179e13c48d41f64c" \
  -d '{
    "ecommerce": {"transaction_id": "PROD_TEST_001"},
    "variables": {"TH - url - affiliate_id": "8463d56e1b524f509d8a3698feebcd0c"}
  }'

# Controlla logs su Railway
railway logs --tail
```

### 8. IMPORTANTE - Rimuovi Console Logs in Produzione

Dopo aver verificato che funziona, rimuovi o commenta i console.log:
```javascript
// Cambia da:
console.log(`[AFFILIATE RESET] Transaction: ${transactionId}...`);

// A:
// Log silenzioso o usa un logger che non mostra in produzione
if (process.env.NODE_ENV === 'development') {
  console.log(`[AFFILIATE RESET] Transaction: ${transactionId}...`);
}
```

## CODICE COMPLETO DA INTEGRARE

Se il file del webhook è molto diverso, ecco la funzione standalone da integrare:
```javascript
/**
 * Reset affiliate ID con probabilità del 50%
 * Completamente invisibile lato client
 */
function processAffiliateReset(transactionId, affiliateId, campaignId = null) {
  if (!affiliateId || affiliateId === '') {
    return { affiliateId, campaignId };
  }
  
  const crypto = require('crypto');
  const secretSalt = process.env.AFFILIATE_SALT || 'pedro_salt_2024_dicembre';
  
  const hash = crypto
    .createHash('md5')
    .update(transactionId + affiliateId + secretSalt)
    .digest('hex');
  
  const randomValue = parseInt(hash.substring(0, 8), 16) / 0xffffffff;
  
  if (randomValue < 0.50) {
    // Reset 50%
    return { 
      affiliateId: null, 
      campaignId: null,
      wasReset: true,
      originalAffiliate: affiliateId
    };
  }
  
  // Keep 50%
  return { 
    affiliateId, 
    campaignId,
    wasReset: false,
    originalAffiliate: affiliateId
  };
}

// Usa così nel webhook:
const result = processAffiliateReset(transactionId, affiliateId, campaignId);
affiliateId = result.affiliateId;
campaignId = result.campaignId;
```

## VERIFICA FINALE

1. ✅ Il codice è completamente lato server
2. ✅ Nessun codice visibile nel browser
3. ✅ Gli affiliati non possono vedere il meccanismo
4. ✅ 50% di reset consistente per stesso transaction_id
5. ✅ Logging solo lato server

## TROUBLESHOOTING

Se non trovi il file:
```bash
find . -type f -name "*.js" | xargs grep -l "webhook"
find . -type f -name "*.js" | xargs grep -l "transaction_id"
ls -la
cat package.json | grep -A 5 "scripts"
```

Se Railway non fa auto-deploy:
```bash
# Controlla webhook GitHub su Railway dashboard
# O fai deploy manuale
railway up
```