# Aggiornamento Pricing Categories - Guida Completa

## 📋 Obiettivo

Aggiornare i record nella tabella `pricing_category_bookings` per cambiare:
- **pricing_category_id** da `161603` e `161602` a `166592`
- **booked_title** a `"6 a 17 años"`

Per le seguenti activity_id:
- `217949`
- `216954`
- `220107`

---

## 🔍 Analisi Collegamenti Database

### Struttura Tabella `pricing_category_bookings`

```sql
pricing_category_bookings
├── id (PRIMARY KEY, auto-increment)
├── pricing_category_booking_id (UNIQUE)
├── activity_booking_id (FOREIGN KEY → activity_bookings.activity_booking_id)
├── pricing_category_id (QUESTO CAMPO VERRÀ MODIFICATO)
├── booked_title (QUESTO CAMPO VERRÀ MODIFICATO)
├── age
├── quantity
├── occupancy
├── passenger_first_name
├── passenger_last_name
├── passenger_date_of_birth
└── updated_at
```

### Foreign Key Constraints

La tabella `pricing_category_bookings` ha le seguenti foreign key:

1. **activity_booking_id** → `activity_bookings(activity_booking_id)`
   - ✅ Non interessata dall'update (non viene modificata)

2. **pricing_category_id** → `pricing_categories(id)`
   - ⚠️  **IMPORTANTE**: Questa viene modificata
   - Prima dell'update DEVE esistere il record con `id = 166592` nella tabella `pricing_categories`
   - Lo script verifica automaticamente questo prerequisito

### Tabelle e View Collegate

#### 1. Materialized View: `activity_bookings_participants_mv`

Questa view **utilizza i dati** di `pricing_category_bookings` e include le colonne:
- `pricing_category_id`
- `booked_title`

**Azione richiesta**: Dopo l'update, la materialized view DEVE essere refreshata:
```sql
REFRESH MATERIALIZED VIEW activity_bookings_participants_mv;
```

Lo script TypeScript lo fa automaticamente.

#### 2. Altre Tabelle Dipendenti

Nessuna altra tabella ha foreign key che puntano a `pricing_category_bookings`, quindi l'update è **sicuro**.

---

## ✅ È SICURO PROCEDERE?

### ✅ SÌ, SE:

1. ✅ Esiste il record `pricing_categories(id = 166592)` nel database
2. ✅ Il `booked_title` di questo record è correttamente impostato a "6 a 17 años"
3. ✅ Hai verificato che le activity_id (217949, 216954, 220107) sono corrette
4. ✅ Hai un backup recente del database (sempre consigliato)

### ⚠️ Prerequisiti da Verificare:

Prima di eseguire l'update, verifica che il pricing_category 166592 esista:

```sql
SELECT * FROM pricing_categories WHERE id = 166592;
```

Se questa query non ritorna risultati, DEVI PRIMA creare il pricing_category 166592.

---

## 🚀 Come Procedere

### Metodo 1: Script TypeScript (CONSIGLIATO)

Questo metodo è più sicuro perché:
- ✅ Verifica automaticamente i prerequisiti
- ✅ Mostra i record che verranno modificati prima dell'update
- ✅ Gestisce automaticamente il refresh della materialized view
- ✅ Fornisce log dettagliati di ogni operazione
- ✅ Gestisce gli errori in modo robusto

#### Esecuzione:

```bash
npm run update-pricing-categories
```

#### Output Atteso:

```
🔍 Inizio processo di aggiornamento pricing_category_id...

📋 STEP 1: Verifica esistenza pricing_category_id 166592...
✅ pricing_category_id 166592 trovato: { id: 166592, title: "6 a 17 años", ... }

📋 STEP 2: Ricerca record da aggiornare...
✅ Trovati X record da aggiornare

📊 Record da aggiornare:
────────────────────────────────────────────────────────────────────────────
ID: 123 | Booking: 456 | Activity: 217949 | Old Category: 161603 | Old Title: "..."
ID: 124 | Booking: 457 | Activity: 216954 | Old Category: 161602 | Old Title: "..."
...
────────────────────────────────────────────────────────────────────────────

⚠️  ATTENZIONE: Stai per aggiornare questi record!
   - Nuovo pricing_category_id: 166592
   - Nuovo booked_title: "6 a 17 años"

⏳ Inizio aggiornamento tra 3 secondi... (Ctrl+C per annullare)

📝 STEP 5: Esecuzione aggiornamenti...

🔄 Aggiornamento per activity_id 217949...
   ✅ Aggiornati X record per activity 217949
...

✅ Totale record aggiornati: X su Y

📋 STEP 6: Refresh materialized view...
✅ Materialized view refreshata

📋 STEP 7: Verifica finale...
✅ Verifica completata: X record con nuovo pricing_category_id

📊 Distribuzione per activity_id:
   Activity 217949: X record
   Activity 216954: Y record
   Activity 220107: Z record

════════════════════════════════════════════════════════════════════════════
✅ AGGIORNAMENTO COMPLETATO CON SUCCESSO!
════════════════════════════════════════════════════════════════════════════
```

---

### Metodo 2: Script SQL Manuale

Se preferisci eseguire l'update manualmente tramite SQL:

#### File: `update-pricing-categories.sql`

Questo file contiene tutti gli step SQL commentati.

#### Esecuzione:

1. Apri il file `update-pricing-categories.sql`
2. Esegui gli STEP 1-4 per verificare i dati
3. Verifica che lo STEP 4 ritorni un record (pricing_category 166592 esiste)
4. Esegui lo STEP 5 per creare un backup temporaneo
5. Esegui lo STEP 6 per fare l'update all'interno di una transazione
6. Verifica i risultati con la query "VERIFICA UPDATE"
7. Se tutto è ok, esegui `COMMIT;`, altrimenti `ROLLBACK;`

#### Dopo l'update SQL, DEVI refreshare la materialized view:

```sql
REFRESH MATERIALIZED VIEW activity_bookings_participants_mv;
```

---

## 🔍 Verifica Post-Aggiornamento

Dopo aver eseguito l'aggiornamento, verifica i risultati:

### Query di Verifica 1: Conta Record Aggiornati

```sql
SELECT
    ab.activity_id,
    pcb.pricing_category_id,
    pcb.booked_title,
    COUNT(*) as num_records
FROM pricing_category_bookings pcb
JOIN activity_bookings ab ON ab.activity_booking_id = pcb.activity_booking_id
WHERE ab.activity_id IN (217949, 216954, 220107)
  AND pcb.pricing_category_id = 166592
GROUP BY ab.activity_id, pcb.pricing_category_id, pcb.booked_title
ORDER BY ab.activity_id;
```

**Risultato atteso**: Tutti i record dovrebbero avere:
- `pricing_category_id = 166592`
- `booked_title = "6 a 17 años"`

### Query di Verifica 2: Verifica Nessun Record Vecchio

```sql
SELECT COUNT(*) as old_records_remaining
FROM pricing_category_bookings pcb
JOIN activity_bookings ab ON ab.activity_booking_id = pcb.activity_booking_id
WHERE ab.activity_id IN (217949, 216954, 220107)
  AND pcb.pricing_category_id IN (161603, 161602);
```

**Risultato atteso**: `old_records_remaining = 0`

### Query di Verifica 3: Verifica Materialized View

```sql
SELECT
    activity_id,
    pricing_category_id,
    booked_title,
    COUNT(*) as count
FROM activity_bookings_participants_mv
WHERE activity_id IN (217949, 216954, 220107)
  AND pricing_category_id = 166592
GROUP BY activity_id, pricing_category_id, booked_title;
```

**Risultato atteso**: I dati nella materialized view devono corrispondere ai dati nella tabella base.

---

## 🛡️ Sicurezza e Rollback

### Script TypeScript
- Lo script esegue automaticamente verifiche preliminari
- Fornisce un countdown di 3 secondi per permettere di annullare (Ctrl+C)
- Non utilizza transazioni SQL (Supabase client non le supporta direttamente)
- **Consiglio**: Fai un backup del database prima di eseguire

### Script SQL
- Utilizza una transazione (`BEGIN` ... `COMMIT`/`ROLLBACK`)
- Crea una tabella temporanea di backup
- Puoi fare `ROLLBACK` se qualcosa va male

### Backup Manuale (Consigliato)

Prima di eseguire qualsiasi aggiornamento, crea un backup:

```sql
-- Backup della tabella pricing_category_bookings
CREATE TABLE pricing_category_bookings_backup_20250120 AS
SELECT * FROM pricing_category_bookings;

-- Verifica backup
SELECT COUNT(*) FROM pricing_category_bookings_backup_20250120;
```

### Rollback (se necessario)

Se dopo l'update ti accorgi che qualcosa è andato storto:

```sql
-- Ripristina dalla tabella di backup
UPDATE pricing_category_bookings pcb
SET
    pricing_category_id = backup.pricing_category_id,
    booked_title = backup.booked_title
FROM pricing_category_bookings_backup_20250120 backup
WHERE pcb.id = backup.id
  AND pcb.id IN (
    SELECT pcb2.id
    FROM pricing_category_bookings pcb2
    JOIN activity_bookings ab ON ab.activity_booking_id = pcb2.activity_booking_id
    WHERE ab.activity_id IN (217949, 216954, 220107)
  );

-- Refresh materialized view
REFRESH MATERIALIZED VIEW activity_bookings_participants_mv;
```

---

## 📊 Impatto Stimato

L'aggiornamento interesserà:
- Tabella principale: `pricing_category_bookings`
- Materialized view: `activity_bookings_participants_mv`
- Numero di activity_id: 3 (217949, 216954, 220107)
- Numero di pricing_category_id vecchi: 2 (161603, 161602)
- Nuovo pricing_category_id: 1 (166592)

Il numero esatto di record interessati dipende da quanti `pricing_category_bookings` esistono per queste attività.

---

## 🎯 Riepilogo

### ✅ È POSSIBILE procedere con l'aggiornamento

**Motivi**:
1. ✅ Non ci sono foreign key da altre tabelle verso `pricing_category_bookings`
2. ✅ L'unica foreign key in uscita (`pricing_category_id`) è gestita correttamente (se 166592 esiste)
3. ✅ La materialized view può essere refreshata facilmente
4. ✅ Gli script forniti gestiscono tutto automaticamente

**Raccomandazioni**:
1. ⚠️  Verifica che `pricing_categories(id = 166592)` esista
2. 💾 Crea un backup del database
3. 🚀 Usa lo script TypeScript (più sicuro e automatico)
4. ✅ Verifica i risultati dopo l'update

### 📞 Supporto

In caso di problemi:
1. Controlla i log dello script
2. Verifica le query di verifica post-aggiornamento
3. Se necessario, usa il rollback dalla tabella di backup

---

**Creato il**: 2025-01-20
**Versione**: 1.0
