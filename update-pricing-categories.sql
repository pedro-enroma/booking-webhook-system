-- ========================================
-- AGGIORNAMENTO PRICING CATEGORIES
-- ========================================
--
-- Obiettivo: Cambiare pricing_category_id da 161603 e 161602 a 166592
-- per le activity_id: 217949, 216954, 220107
-- e aggiornare il booked_title a "6 a 17 años"
--

-- STEP 1: VERIFICA DATI ESISTENTI
-- ========================================
SELECT
    'DATI ESISTENTI' as fase,
    pcb.id,
    pcb.pricing_category_booking_id,
    pcb.activity_booking_id,
    pcb.pricing_category_id,
    pcb.booked_title,
    pcb.age,
    ab.activity_id,
    ab.product_title
FROM pricing_category_bookings pcb
JOIN activity_bookings ab ON ab.activity_booking_id = pcb.activity_booking_id
WHERE ab.activity_id IN (217949, 216954, 220107)
  AND pcb.pricing_category_id IN (161603, 161602)
ORDER BY ab.activity_id, pcb.id;

-- STEP 2: CONTA RECORD DA AGGIORNARE
-- ========================================
SELECT
    'CONTEGGIO RECORD' as fase,
    ab.activity_id,
    pcb.pricing_category_id,
    COUNT(*) as num_records
FROM pricing_category_bookings pcb
JOIN activity_bookings ab ON ab.activity_booking_id = pcb.activity_booking_id
WHERE ab.activity_id IN (217949, 216954, 220107)
  AND pcb.pricing_category_id IN (161603, 161602)
GROUP BY ab.activity_id, pcb.pricing_category_id
ORDER BY ab.activity_id, pcb.pricing_category_id;

-- STEP 3: VERIFICA FOREIGN KEY CONSTRAINTS
-- ========================================
-- Questo query verifica se ci sono constraint di foreign key sulla colonna pricing_category_id
SELECT
    'FOREIGN KEYS' as fase,
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name='pricing_category_bookings'
    AND kcu.column_name = 'pricing_category_id';

-- STEP 4: VERIFICA CHE IL NUOVO pricing_category_id (166592) ESISTA
-- ========================================
-- Se questa query non ritorna risultati, significa che dobbiamo prima creare il pricing_category
SELECT
    'VERIFICA NUOVO ID' as fase,
    *
FROM pricing_categories
WHERE id = 166592;

-- STEP 5: BACKUP - CREA UNA TABELLA TEMPORANEA DI BACKUP
-- ========================================
CREATE TEMP TABLE pricing_category_bookings_backup AS
SELECT
    pcb.*
FROM pricing_category_bookings pcb
JOIN activity_bookings ab ON ab.activity_booking_id = pcb.activity_booking_id
WHERE ab.activity_id IN (217949, 216954, 220107)
  AND pcb.pricing_category_id IN (161603, 161602);

SELECT 'BACKUP CREATO' as fase, COUNT(*) as record_salvati FROM pricing_category_bookings_backup;

-- STEP 6: ESEGUI L'UPDATE (TRANSAZIONE SICURA)
-- ========================================
BEGIN;

-- Aggiorna i record
UPDATE pricing_category_bookings pcb
SET
    pricing_category_id = 166592,
    booked_title = '6 a 17 años',
    updated_at = NOW()
FROM activity_bookings ab
WHERE ab.activity_booking_id = pcb.activity_booking_id
  AND ab.activity_id IN (217949, 216954, 220107)
  AND pcb.pricing_category_id IN (161603, 161602);

-- Verifica il risultato
SELECT
    'VERIFICA UPDATE' as fase,
    ab.activity_id,
    pcb.pricing_category_id,
    pcb.booked_title,
    COUNT(*) as num_updated
FROM pricing_category_bookings pcb
JOIN activity_bookings ab ON ab.activity_booking_id = pcb.activity_booking_id
WHERE ab.activity_id IN (217949, 216954, 220107)
  AND pcb.pricing_category_id = 166592
GROUP BY ab.activity_id, pcb.pricing_category_id, pcb.booked_title;

-- Se tutto è ok, fai COMMIT, altrimenti ROLLBACK
-- COMMIT;
-- ROLLBACK;

-- ========================================
-- ISTRUZIONI PER L'ESECUZIONE
-- ========================================
--
-- 1. Prima esegui gli STEP 1-4 per verificare i dati
-- 2. Controlla che lo STEP 4 ritorni un record (altrimenti il pricing_category 166592 non esiste)
-- 3. Esegui lo STEP 5 per creare il backup
-- 4. Esegui lo STEP 6 per fare l'update
-- 5. Verifica i risultati con la query "VERIFICA UPDATE"
-- 6. Se tutto è ok, esegui COMMIT, altrimenti ROLLBACK
--
-- NOTA: Commenta il "COMMIT;" o il "ROLLBACK;" a seconda del risultato
