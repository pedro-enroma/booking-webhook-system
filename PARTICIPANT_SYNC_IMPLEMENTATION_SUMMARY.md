# Participant Sync Implementation - Summary

## ✅ Implementation Complete

The intelligent participant sync system for `BOOKING_UPDATED` webhooks has been successfully implemented.

## 📁 Files Created/Modified

### Created Files
1. **`src/migrations/create-participant-sync-logs.sql`**
   - Database migration for logging table
   - Creates `participant_sync_logs` table
   - Creates 2 views for analysis
   - Adds indexes for performance

2. **`src/setup-participant-sync-logging.ts`**
   - Setup script to run the migration
   - Tests the setup
   - Can be run via `npm run setup-participant-sync`

3. **`PARTICIPANT_SYNC_README.md`**
   - Complete documentation
   - Usage examples
   - Query examples
   - Troubleshooting guide

4. **`PARTICIPANT_SYNC_IMPLEMENTATION_SUMMARY.md`** (this file)

### Modified Files
1. **`src/services/bookingService.ts`**
   - Added `syncParticipantsIntelligently()` method (lines 531-671)
   - Added `logParticipantSync()` helper (lines 674-721)
   - Updated `savePricingCategoryBooking()` to support placeholders (line 734)
   - Modified `handleBookingUpdated()` to use new sync method (lines 126-135)

2. **`package.json`**
   - Added script: `"setup-participant-sync": "ts-node src/setup-participant-sync-logging.ts"`

## 🎯 How It Works

### When BOOKING_UPDATED Webhook Arrives:

1. **Fetch existing participants** from `pricing_category_bookings` table
2. **Compare by ID** with webhook's `pricingCategoryBookings` array
3. **Categorize changes**:
   - **MATCH**: Participant in both DB and webhook → Keep
   - **REMOVE**: Participant in DB but not webhook → Delete
   - **ADD**: Participant in webhook but not DB → Insert with "DA CERCARE" placeholder

4. **Execute sync**:
   ```
   Example: DB has 3, Webhook has 2
   → Keep 2 matched participants
   → Delete 1 removed participant
   → Final count: 2
   ```

5. **Log everything** to `participant_sync_logs` for audit

### Placeholder Logic
When adding new participants without passenger info:
- `passenger_first_name = 'DA'`
- `passenger_last_name = 'CERCARE'`

This makes it easy to identify missing data that needs manual entry.

## 🚀 Deployment Steps

### 1. Run Database Migration
```bash
npm run setup-participant-sync
```

Or manually in Supabase SQL Editor:
```sql
-- Run the contents of:
-- src/migrations/create-participant-sync-logs.sql
```

### 2. Commit & Push to Railway
```bash
git add .
git commit -m "feat: Add intelligent participant sync for BOOKING_UPDATED webhooks"
git push
```

Railway will auto-deploy.

### 3. Verify Deployment
```bash
# Check Railway logs
railway logs

# Look for successful webhook processing
grep "Sincronizzazione intelligente" logs
```

## 📊 Testing

### Test Scenario 1: Add Participant
1. Create booking in Bokun with 2 participants
2. Wait for BOOKING_CONFIRMED webhook
3. Add 1 participant in Bokun
4. Wait for BOOKING_UPDATED webhook
5. Check logs:
```bash
🔄 Sincronizzazione intelligente partecipanti per activity_booking XXXXX
   📊 DB partecipanti: 2, Webhook partecipanti: 3
   ✅ Mantengo: 2, ❌ Rimuovo: 0, ➕ Aggiungo: 1
   ➕ Aggiunto participant 283348938 (0 a 3 años) - DA CERCARE
   🎯 Sincronizzazione completata: 2 → 3 partecipanti
```

### Test Scenario 2: Remove Participant
1. Start with booking that has 3 participants
2. Remove 1 participant in Bokun
3. Wait for BOOKING_UPDATED webhook
4. Check logs:
```bash
🔄 Sincronizzazione intelligente partecipanti per activity_booking XXXXX
   📊 DB partecipanti: 3, Webhook partecipanti: 2
   ✅ Mantengo: 2, ❌ Rimuovo: 1, ➕ Aggiungo: 0
   ❌ Rimosso participant 283348938 (0 a 3 años)
   🎯 Sincronizzazione completata: 3 → 2 partecipanti
```

## 🔍 Monitoring Queries

### Recent Participant Changes
```sql
SELECT
  confirmation_code,
  sync_action,
  pricing_category_title,
  passenger_first_name || ' ' || passenger_last_name as passenger,
  webhook_participant_count,
  db_participant_count_before,
  db_participant_count_after,
  sync_timestamp
FROM participant_sync_logs
WHERE sync_timestamp > NOW() - INTERVAL '24 hours'
ORDER BY sync_timestamp DESC;
```

### Find "DA CERCARE" Placeholders
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

### Sync Summary
```sql
SELECT
  sync_action,
  COUNT(*) as total,
  COUNT(DISTINCT confirmation_code) as unique_bookings
FROM participant_sync_logs
WHERE sync_timestamp > NOW() - INTERVAL '7 days'
GROUP BY sync_action;
```

## 🎨 Key Features

✅ **Perfect Sync**: Only changes what's different (no delete-all-reinsert)
✅ **Comprehensive Logging**: Every action logged for audit
✅ **Placeholder Support**: "DA CERCARE" for missing passenger data
✅ **Efficient**: Minimal database operations
✅ **Safe**: Logging failures don't break webhooks
✅ **Observable**: Rich console logs + database audit trail

## 📝 Code Locations

| Component | File | Line |
|-----------|------|------|
| Main sync logic | `src/services/bookingService.ts` | 531-671 |
| Logging helper | `src/services/bookingService.ts` | 674-721 |
| Placeholder support | `src/services/bookingService.ts` | 734-754 |
| Integration point | `src/services/bookingService.ts` | 126-135 |
| Database migration | `src/migrations/create-participant-sync-logs.sql` | Full file |
| Setup script | `src/setup-participant-sync-logging.ts` | Full file |

## 🐛 Troubleshooting

### Issue: Participants not syncing
**Check**:
1. Webhook received: `grep "Webhook ricevuto" railway logs`
2. Action is BOOKING_UPDATED
3. `pricingCategoryBookings` array exists in webhook payload

### Issue: Sync logs not saving
**Solution**: Logging failures are non-blocking. Check:
- Table exists in Supabase
- Permissions are correct
- Look for warning in logs: `"Non riesco a salvare log"`

### Issue: Too many "DA CERCARE"
**Normal**: Bokun doesn't always send passenger info in webhooks
**Solution**: Update manually or via separate sync process

## 🎯 Next Steps

1. **Deploy to Railway** ✓ Ready
2. **Run migration** in Supabase
3. **Test with real bookings**
4. **Monitor logs** for first few days
5. **Query sync stats** weekly

## 📚 Documentation

- **Full Guide**: `PARTICIPANT_SYNC_README.md`
- **Original Issue**: Webhook examples in `update items changed participant *.txt`
- **Webhook Logging**: `WEBHOOK_LOGGING_README.md`

## ✨ Example Output

```
📥 Webhook ricevuto con action: BOOKING_UPDATED
🔄 Gestione BOOKING_UPDATED: ENRO-75863140
✅ Cliente aggiornato
✅ Prenotazione principale aggiornata
📌 Seller name per aggiornamento attività: EnRoma.com
✅ Attività aggiornata
🔄 Sincronizzazione intelligente partecipanti per activity_booking 110220670
   📊 DB partecipanti: 2, Webhook partecipanti: 3
   ✅ Mantengo: 2, ❌ Rimuovo: 0, ➕ Aggiungo: 1
   ➕ Aggiunto participant 283348938 (0 a 3 años) - DA CERCARE
   🎯 Sincronizzazione completata: 2 → 3 partecipanti
✅ Partecipanti sincronizzati intelligentemente
🔄 Sincronizzazione disponibilità per prenotazione: ENRO-75863140
✅ Disponibilità aggiornata: 11 slot sincronizzati
🎉 BOOKING_UPDATED completato!
```

---

**Status**: ✅ Ready for deployment
**Date**: 2025-10-07
**Author**: Claude Code with Pedro
