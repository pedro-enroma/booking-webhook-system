# URGENT: Revert Incorrect Pricing Category Updates

## What Happened

Yesterday's update to pricing_category_id 166592 affected MORE activities than intended:

**AFFECTED (need revert):**
- Activity 249770: 8 records
- Activity 265854: 15 records
- Activity 901369: 10 records
- Activity 901938: 12 records
- **TOTAL: 45 records**

**CORRECT (keep as-is):**
- Activity 216954: 364 records ✅
- Activity 217949: 209 records ✅
- Activity 220107: 410 records ✅

## Why This Happened

The update script `src/update-pricing-categories.ts` should have only updated the 3 intended activities, but it appears more records were affected. The script did NOT create a backup table before running.

## How to Restore

### Option 1: Supabase Point-in-Time Recovery (RECOMMENDED)

If you have Supabase Pro/Team/Enterprise:

1. Go to Supabase Dashboard → Your Project → Database → Backups
2. Use Point-in-Time Recovery to restore to YESTERDAY (before the update)
3. This will restore the ENTIRE database to that point
4. Then re-run the update correctly for ONLY the 3 intended activities

⚠️ **WARNING**: This will revert ALL database changes since yesterday, not just pricing categories!

### Option 2: Query Backup Database for Original Values

If you have a backup database or PITR read replica:

1. Connect to your backup database from YESTERDAY
2. Run the query in `src/get-backup-data-sql.sql`
3. Export results as CSV/JSON
4. I'll create a script to restore those specific values

**Steps:**
```bash
# In your backup database, run:
psql $BACKUP_DATABASE_URL -f src/get-backup-data-sql.sql > original_values.csv
```

Then tell me and I'll create the restore script.

### Option 3: Manual Database Backup File

If you have a SQL dump from yesterday:

1. Restore it to a temporary database
2. Query the original values using the SQL above
3. Provide me the results

### Option 4: Determine Original Values from Business Logic

If NO backup exists, we need to determine the correct values logically.

Looking at the data pattern:
- These activities currently have: 161601 (Adulto), 161726 (0 a 5 años)
- The incorrect records have: 166592 (6 a 17 años)

**Question**: Were these "6 a 17 años" records supposed to be:
- pricing_category_id **161603** with a different booked_title?
- pricing_category_id **161602** with a different booked_title?
- Something else entirely?

## Next Steps

**Tell me which option you can use:**

1. ✅ I have access to Supabase PITR - I'll restore the whole database
2. ✅ I have a backup database - I'll run the query to get original values
3. ✅ I have a SQL dump file - I'll restore it temporarily
4. ❌ I don't have any backup - We need to determine values logically

Once you tell me, I'll help you complete the restoration.
