# Participant Sync System - Documentation

## Overview
This system handles intelligent synchronization of participants (pricing_category_bookings) when `BOOKING_UPDATED` webhooks are received from Bokun. It ensures perfect sync by adding, removing, or keeping participants based on webhook data.

## Problem Being Solved
When Bokun sends `BOOKING_UPDATED` webhooks with modified participants:
- **Participant Added**: Webhook contains 3 participants, but DB has 2 → Add 1 new participant
- **Participant Removed**: Webhook contains 2 participants, but DB has 3 → Remove 1 participant
- **Participants Changed**: Some participants stay, some are added, some are removed

The old system would **delete all and re-insert**, which was inefficient and could lose data. The new system **syncs intelligently** by comparing IDs.

## How It Works

### 1. Smart Participant Syncing
When a `BOOKING_UPDATED` webhook arrives:

1. **Fetch existing participants** from database
2. **Compare with webhook participants** by `pricing_category_booking_id`
3. **Categorize into 3 groups**:
   - **MATCH**: Participant exists in both DB and webhook → Keep it
   - **REMOVE**: Participant exists in DB but not in webhook → Delete it
   - **ADD**: Participant exists in webhook but not in DB → Insert it

4. **Execute sync**:
   - Delete removed participants
   - Insert new participants with placeholder "DA CERCARE" if no passenger info
   - Keep matched participants unchanged

### 2. Placeholder Names
When adding new participants **without** passenger information:
- `passenger_first_name`: `'DA'`
- `passenger_last_name`: `'CERCARE'`

This makes it easy to identify participants that need manual data entry.

### 3. Comprehensive Logging
Every sync action is logged to `participant_sync_logs` table with:
- Which participants were added/removed/matched
- Counts before and after
- Full webhook data for audit
- Timestamps and notes

## Database Schema

### participant_sync_logs Table
```sql
CREATE TABLE participant_sync_logs (
  id SERIAL PRIMARY KEY,
  activity_booking_id BIGINT NOT NULL,
  booking_id BIGINT NOT NULL,
  confirmation_code VARCHAR(255) NOT NULL,
  sync_action VARCHAR(50) NOT NULL,  -- 'ADD', 'REMOVE', 'MATCH', 'UPDATE'
  pricing_category_booking_id BIGINT,
  pricing_category_id BIGINT,
  pricing_category_title VARCHAR(255),
  passenger_first_name VARCHAR(255),
  passenger_last_name VARCHAR(255),
  quantity INTEGER,
  occupancy INTEGER,
  webhook_participant_count INTEGER NOT NULL,
  db_participant_count_before INTEGER NOT NULL,
  db_participant_count_after INTEGER NOT NULL,
  sync_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  raw_participant_data JSONB,
  notes TEXT
);
```

### Views for Analysis

**participant_sync_summary**: Quick overview of changes per booking
```sql
SELECT * FROM participant_sync_summary;
```

**bookings_with_participant_changes**: Bookings that had participants added/removed
```sql
SELECT * FROM bookings_with_participant_changes;
```

## Setup Instructions

### 1. Run the SQL Migration
Option A - Automated (recommended):
```bash
npm run setup-participant-sync
```

Option B - Manual:
```sql
-- Copy and run contents from:
-- src/migrations/create-participant-sync-logs.sql
```

### 2. Verify Setup
Check that the table exists:
```sql
SELECT COUNT(*) FROM participant_sync_logs;
```

### 3. Deploy to Production
```bash
git add .
git commit -m "feat: Add intelligent participant sync for BOOKING_UPDATED webhooks"
git push
```

Railway will automatically deploy the changes.

## Testing

### Test with Real Webhook
1. In Bokun, create a booking with 2 participants
2. Wait for `BOOKING_CONFIRMED` webhook to be processed
3. In Bokun, add 1 more participant
4. Wait for `BOOKING_UPDATED` webhook
5. Check logs:
```bash
# View server logs
railway logs

# Or check Supabase
SELECT * FROM participant_sync_logs
WHERE confirmation_code = 'ENRO-XXXXX'
ORDER BY sync_timestamp DESC;
```

Expected output:
```
🔄 Sincronizzazione intelligente partecipanti per activity_booking 12345
   📊 DB partecipanti: 2, Webhook partecipanti: 3
   ✅ Mantengo: 2, ❌ Rimuovo: 0, ➕ Aggiungo: 1
   ➕ Aggiunto participant 283348938 (0 a 3 años) - DA CERCARE
   🎯 Sincronizzazione completata: 2 → 3 partecipanti
✅ Partecipanti sincronizzati intelligentemente
```

### Example Scenarios

#### Scenario 1: Add Participant (2 → 3)
**Initial State** (DB):
- Participant A (ID: 100)
- Participant B (ID: 101)

**Webhook Payload**:
- Participant A (ID: 100)
- Participant B (ID: 101)
- **Participant C (ID: 102)** ← NEW

**Result**:
- ✅ MATCH: Participant A kept
- ✅ MATCH: Participant B kept
- ➕ ADD: Participant C inserted with "DA CERCARE"

**Logs**:
```
sync_action: 'MATCH', participant_id: 100
sync_action: 'MATCH', participant_id: 101
sync_action: 'ADD',   participant_id: 102, passenger: 'DA CERCARE'
```

#### Scenario 2: Remove Participant (3 → 2)
**Initial State** (DB):
- Participant A (ID: 100)
- Participant B (ID: 101)
- Participant C (ID: 102)

**Webhook Payload**:
- Participant A (ID: 100)
- Participant B (ID: 101)

**Result**:
- ✅ MATCH: Participant A kept
- ✅ MATCH: Participant B kept
- ❌ REMOVE: Participant C deleted

**Logs**:
```
sync_action: 'MATCH',  participant_id: 100
sync_action: 'MATCH',  participant_id: 101
sync_action: 'REMOVE', participant_id: 102, notes: 'Participant not in webhook - removing'
```

#### Scenario 3: Replace Participant (3 → 3)
**Initial State** (DB):
- Participant A (ID: 100)
- Participant B (ID: 101)
- Participant C (ID: 102)

**Webhook Payload**:
- Participant A (ID: 100)
- Participant B (ID: 101)
- **Participant D (ID: 103)** ← DIFFERENT

**Result**:
- ✅ MATCH: Participant A kept
- ✅ MATCH: Participant B kept
- ❌ REMOVE: Participant C deleted
- ➕ ADD: Participant D inserted

**Logs**:
```
sync_action: 'MATCH',  participant_id: 100
sync_action: 'MATCH',  participant_id: 101
sync_action: 'REMOVE', participant_id: 102
sync_action: 'ADD',    participant_id: 103, passenger: 'DA CERCARE'
```

## Querying Sync Logs

### Get all changes for a booking
```sql
SELECT
  sync_action,
  pricing_category_title,
  passenger_first_name || ' ' || passenger_last_name as passenger,
  webhook_participant_count,
  db_participant_count_before,
  db_participant_count_after,
  sync_timestamp,
  notes
FROM participant_sync_logs
WHERE confirmation_code = 'ENRO-75863140'
ORDER BY sync_timestamp DESC;
```

### Find bookings with placeholder passengers
```sql
SELECT DISTINCT
  confirmation_code,
  activity_booking_id,
  COUNT(*) as placeholder_count
FROM participant_sync_logs
WHERE sync_action = 'ADD'
  AND passenger_first_name = 'DA'
  AND passenger_last_name = 'CERCARE'
GROUP BY confirmation_code, activity_booking_id
ORDER BY MAX(sync_timestamp) DESC;
```

### Summary of changes in last 24 hours
```sql
SELECT
  sync_action,
  COUNT(*) as count,
  COUNT(DISTINCT confirmation_code) as bookings_affected
FROM participant_sync_logs
WHERE sync_timestamp > NOW() - INTERVAL '24 hours'
GROUP BY sync_action
ORDER BY count DESC;
```

### Detailed view of a specific activity booking
```sql
SELECT
  psl.*,
  ab.product_title,
  ab.start_date_time,
  b.confirmation_code
FROM participant_sync_logs psl
JOIN activity_bookings ab ON ab.activity_booking_id = psl.activity_booking_id
JOIN bookings b ON b.booking_id = psl.booking_id
WHERE psl.activity_booking_id = 110220670
ORDER BY psl.sync_timestamp DESC;
```

## Code Architecture

### Flow
```
Webhook POST /webhook/booking
  ↓
webhook.ts: router.post('/webhook/booking')
  ↓
bookingService.handleBookingUpdated()
  ↓
bookingService.syncParticipantsIntelligently()
  ↓
  ├─→ Fetch existing participants from DB
  ├─→ Compare with webhook participants
  ├─→ Identify MATCH / REMOVE / ADD
  ├─→ Delete removed participants
  ├─→ Insert new participants (with "DA CERCARE" if needed)
  └─→ Log all changes to participant_sync_logs
```

### Key Methods

**`syncParticipantsIntelligently()`** - `src/services/bookingService.ts:531`
- Main sync logic
- Compares DB vs webhook participants
- Executes add/remove operations
- Logs all actions

**`logParticipantSync()`** - `src/services/bookingService.ts:674`
- Helper to log sync actions
- Inserts to `participant_sync_logs`
- Silent failures (won't break webhook)

**`savePricingCategoryBooking()`** - `src/services/bookingService.ts:734`
- Updated to support placeholder names
- New parameter: `usePlaceholder: boolean = false`
- Sets "DA CERCARE" when `usePlaceholder=true` and no passenger info

## Monitoring

### Check Recent Syncs
```bash
# In Railway logs
grep "Sincronizzazione intelligente"

# Or in Supabase
SELECT
  confirmation_code,
  COUNT(*) FILTER (WHERE sync_action = 'ADD') as added,
  COUNT(*) FILTER (WHERE sync_action = 'REMOVE') as removed,
  COUNT(*) FILTER (WHERE sync_action = 'MATCH') as matched,
  MAX(sync_timestamp) as last_sync
FROM participant_sync_logs
WHERE sync_timestamp > NOW() - INTERVAL '1 hour'
GROUP BY confirmation_code;
```

### Alert on Issues
Set up monitoring for:
- High removal rate (possible webhook issue)
- Many "DA CERCARE" placeholders (missing passenger data)
- Sync failures

## Troubleshooting

### Issue: Participants not syncing
**Check**:
1. Webhook is reaching the server: `grep "Webhook ricevuto" logs`
2. Action is `BOOKING_UPDATED`: Check `webhook_logs` table
3. `pricingCategoryBookings` array exists in payload
4. Database permissions for `pricing_category_bookings`

### Issue: Too many "DA CERCARE" placeholders
**Possible causes**:
- Bokun not sending passenger info in webhooks
- Passenger info added after booking creation
- Channel Manager bookings (no passenger details)

**Solution**: Update passenger info manually or via separate sync

### Issue: Sync logs not saving
**Check**:
- Table exists: `SELECT * FROM participant_sync_logs LIMIT 1;`
- Permissions in Supabase
- Error messages in logs: `grep "Non riesco a salvare log" logs`

**Note**: Logging failures won't break the webhook - sync will continue

## Best Practices

1. **Always check sync logs** after deploying changes
2. **Monitor "DA CERCARE" counts** - they indicate missing data
3. **Query by confirmation_code** for debugging specific bookings
4. **Use views** for quick analysis instead of complex queries
5. **Keep raw_participant_data** - it's invaluable for debugging

## API Endpoints

### Debug Participant Changes
Add these endpoints to `src/routes/webhook.ts`:

```typescript
// Get participant sync history for a booking
router.get('/webhook/debug/participants/:confirmationCode', async (req, res) => {
  const { confirmationCode } = req.params;

  const { data, error } = await supabase
    .from('participant_sync_logs')
    .select('*')
    .eq('confirmation_code', confirmationCode)
    .order('sync_timestamp', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  return res.json({
    confirmation_code: confirmationCode,
    total_changes: data.length,
    changes: data
  });
});
```

## Future Enhancements

1. **Real-time notifications** when participants change
2. **Automatic passenger data enrichment** from customer records
3. **Bulk update "DA CERCARE"** placeholders via API
4. **Sync validation** - compare DB state with Bokun API
5. **Rollback capability** using sync logs

## Summary

✅ **Perfect Sync**: Adds/removes only what changed
✅ **Comprehensive Logging**: Full audit trail of all changes
✅ **Placeholder Support**: "DA CERCARE" for missing passenger data
✅ **Efficient**: Only touches changed rows, not all participants
✅ **Safe**: Logs failures without breaking webhooks

For questions or issues, check:
- Server logs in Railway
- `participant_sync_logs` table in Supabase
- `webhook_logs` for full webhook history
