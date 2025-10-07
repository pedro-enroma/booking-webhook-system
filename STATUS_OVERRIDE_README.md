# Status Override System for Materialized View

## Overview

This system allows you to **manually override the status** of specific `activity_booking_id` entries **ONLY in the materialized view** `activity_bookings_participants_mv`, while keeping the correct status in the `activity_bookings` table and all other tables.

### Use Cases
- Hide cancelled bookings from reports without actually cancelling them in the system
- Mark test bookings as CANCELLED in exports while preserving their real status
- Override status for data analysis purposes
- Create custom views of booking status for different audiences

### Key Features
- ✅ Override status in materialized view only
- ✅ Preserve original status in all base tables
- ✅ Track who made the override and why (audit trail)
- ✅ Easy to add, update, or remove overrides
- ✅ Bulk operations supported
- ✅ Automatic materialized view refresh via triggers

---

## Installation

### 1. Run the Migration

Execute the SQL migration in your Supabase SQL Editor:

```bash
# Option 1: Copy the file contents and paste into Supabase SQL Editor
cat src/migrations/add-status-override-system.sql
```

Or directly in Supabase:
```sql
-- Copy and paste the entire contents of:
-- src/migrations/add-status-override-system.sql
```

This will:
- Create the `activity_booking_status_overrides` table
- Recreate the materialized view with override logic
- Add necessary indexes
- Set up automatic refresh triggers

### 2. Verify Installation

```sql
-- Check if override table exists
SELECT * FROM activity_booking_status_overrides LIMIT 1;

-- Check if materialized view has new columns
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'activity_bookings_participants_mv'
AND column_name IN ('status', 'original_status', 'override_reason', 'overridden_by', 'overridden_at');
```

---

## Usage

### Command Line Interface (CLI)

The easiest way to manage overrides is through the CLI:

#### Add Override for Single Booking
```bash
npm run manage-overrides -- add 12345678 CANCELLED "Customer requested removal from reports"
```

#### Add Override for Multiple Bookings (Bulk)
```bash
npm run manage-overrides -- add-bulk 111,222,333 CANCELLED "Test bookings - hide from production reports"
```

#### Remove Override (Restore Original Status)
```bash
npm run manage-overrides -- remove 12345678
```

#### Remove Multiple Overrides
```bash
npm run manage-overrides -- remove-bulk 111,222,333
```

#### List All Active Overrides
```bash
npm run manage-overrides -- list
```

#### View Override Details for Specific Booking
```bash
npm run manage-overrides -- view 12345678
```

---

## Direct SQL Usage

### Add Override
```sql
INSERT INTO activity_booking_status_overrides (
    activity_booking_id,
    override_status,
    override_reason,
    overridden_by,
    original_status
) VALUES (
    12345678,  -- Replace with actual activity_booking_id
    'CANCELLED',
    'Customer requested removal from reports',
    'admin@enroma.com',
    (SELECT status FROM activity_bookings WHERE activity_booking_id = 12345678)
);
```

### Bulk Add Overrides
```sql
INSERT INTO activity_booking_status_overrides (
    activity_booking_id,
    override_status,
    override_reason,
    overridden_by,
    original_status
)
SELECT
    activity_booking_id,
    'CANCELLED' as override_status,
    'Bulk override for testing' as override_reason,
    'admin@enroma.com' as overridden_by,
    status as original_status
FROM activity_bookings
WHERE activity_booking_id IN (12345, 67890, 11111, 22222);
```

### View All Overrides
```sql
SELECT
    o.activity_booking_id,
    o.override_status,
    o.original_status,
    o.override_reason,
    o.overridden_by,
    o.overridden_at,
    ab.product_title,
    ab.start_date_time
FROM activity_booking_status_overrides o
JOIN activity_bookings ab ON o.activity_booking_id = ab.activity_booking_id
ORDER BY o.overridden_at DESC;
```

### Remove Override
```sql
DELETE FROM activity_booking_status_overrides
WHERE activity_booking_id = 12345678;
```

### Update Existing Override
```sql
UPDATE activity_booking_status_overrides
SET
    override_status = 'CONFIRMED',
    override_reason = 'Changed requirement - show as confirmed',
    overridden_at = NOW()
WHERE activity_booking_id = 12345678;
```

---

## How It Works

### Architecture

1. **Override Table**: `activity_booking_status_overrides`
   - Stores manual status overrides
   - Links to `activity_bookings` via foreign key
   - Contains audit fields (reason, who, when)

2. **Materialized View**: `activity_bookings_participants_mv`
   - Modified to include LEFT JOIN with override table
   - Uses `COALESCE(override_status, actual_status)` logic
   - Shows override status if exists, otherwise actual status

3. **Automatic Refresh**:
   - Trigger on override table automatically refreshes the MV
   - Changes are visible immediately after insert/update/delete

### Data Flow

```
Query MV
    ↓
Check Override Table
    ↓
┌─────────────────────┐
│ Override Exists?    │
├─────────┬───────────┤
│   YES   │    NO     │
│    ↓    │    ↓      │
│ Show    │  Show     │
│Override │ Actual    │
│ Status  │ Status    │
└─────────┴───────────┘
```

### Schema

**activity_booking_status_overrides**
```sql
activity_booking_id BIGINT PRIMARY KEY     -- Link to activity_bookings
override_status     VARCHAR(50) NOT NULL   -- Status to show in MV
override_reason     TEXT                   -- Why override was applied
overridden_by       VARCHAR(100)           -- Who applied it
overridden_at       TIMESTAMP              -- When applied
original_status     VARCHAR(50)            -- Original status at time of override
```

**activity_bookings_participants_mv (new columns)**
```sql
status              VARCHAR(50)   -- Shows override if exists, else actual
original_status     VARCHAR(50)   -- Always shows actual status from activity_bookings
override_reason     TEXT          -- Reason for override (NULL if no override)
overridden_by       VARCHAR(100)  -- Who overrode (NULL if no override)
overridden_at       TIMESTAMP     -- When overridden (NULL if no override)
```

---

## Verification & Monitoring

### Check if Booking Has Override
```sql
SELECT
    activity_booking_id,
    status as displayed_status,
    original_status as actual_status,
    CASE
        WHEN status != original_status THEN '⚠️ OVERRIDDEN'
        ELSE '✓ Normal'
    END as override_flag,
    override_reason,
    overridden_by,
    overridden_at
FROM activity_bookings_participants_mv
WHERE activity_booking_id = 12345678;
```

### Count Overridden Bookings
```sql
SELECT
    COUNT(*) as total_bookings,
    COUNT(*) FILTER (WHERE status != original_status) as overridden_count,
    COUNT(*) FILTER (WHERE status = original_status) as normal_count
FROM activity_bookings_participants_mv;
```

### Find All Overridden Bookings
```sql
SELECT
    activity_booking_id,
    product_title,
    start_date_time,
    status as displayed_status,
    original_status as actual_status,
    override_reason
FROM activity_bookings_participants_mv
WHERE status != original_status
ORDER BY start_date_time DESC;
```

### Compare Statuses (MV vs Base Table)
```sql
SELECT
    ab.activity_booking_id,
    ab.product_title,
    ab.status as table_status,
    mv.status as view_status,
    mv.original_status as view_original_status,
    CASE
        WHEN ab.status != mv.status THEN 'OVERRIDE ACTIVE ⚠️'
        ELSE 'NORMAL ✓'
    END as status_check
FROM activity_bookings ab
JOIN activity_bookings_participants_mv mv ON ab.activity_booking_id = mv.activity_booking_id
WHERE ab.activity_booking_id IN (12345678, 87654321)
LIMIT 10;
```

---

## Important Notes

### What This System Does ✅
- Overrides status **only** in `activity_bookings_participants_mv`
- Preserves original status in `activity_bookings` table
- Preserves original status in all other tables
- Provides audit trail (who, when, why)
- Automatically refreshes materialized view

### What This System Does NOT Do ❌
- Does **NOT** change data in `activity_bookings` table
- Does **NOT** change data in any other base tables
- Does **NOT** affect webhook processing
- Does **NOT** affect booking logic or business rules
- Does **NOT** trigger any booking-related actions

### Use Cases ✅
- Hide bookings from reports/exports
- Mark test bookings as cancelled in views
- Create custom status views for analysis
- Override status for specific audiences

### When NOT to Use ⚠️
- To actually cancel a booking (use proper cancellation process)
- To change booking status in the system (modify base table instead)
- For production booking management (this is view-only)

---

## Examples

### Example 1: Hide Test Bookings from Production Reports
```bash
# Mark all test bookings as CANCELLED in the view
npm run manage-overrides -- add-bulk 100001,100002,100003 CANCELLED "Test bookings - exclude from production reports"
```

### Example 2: Temporarily Hide Cancelled Booking (Show as Confirmed)
```sql
INSERT INTO activity_booking_status_overrides (
    activity_booking_id,
    override_status,
    override_reason,
    overridden_by,
    original_status
) VALUES (
    12345678,
    'CONFIRMED',
    'Customer dispute - show as confirmed temporarily while investigating',
    'support@enroma.com',
    'CANCELLED'
);
```

### Example 3: Override All Bookings for Specific Product
```sql
INSERT INTO activity_booking_status_overrides (
    activity_booking_id,
    override_status,
    override_reason,
    overridden_by,
    original_status
)
SELECT
    ab.activity_booking_id,
    'CANCELLED',
    'Product discontinued - hide from active reports',
    'admin@enroma.com',
    ab.status
FROM activity_bookings ab
WHERE ab.product_id = '216954'
AND ab.status = 'CONFIRMED';
```

### Example 4: Remove All Overrides
```sql
DELETE FROM activity_booking_status_overrides;
-- MV will automatically refresh and show all actual statuses
```

---

## Troubleshooting

### Override Not Showing in View
```sql
-- Force refresh the materialized view
REFRESH MATERIALIZED VIEW CONCURRENTLY activity_bookings_participants_mv;

-- Check if override exists
SELECT * FROM activity_booking_status_overrides WHERE activity_booking_id = 12345678;
```

### Trigger Not Working
```sql
-- Check if trigger exists
SELECT tgname FROM pg_trigger WHERE tgrelid = 'activity_booking_status_overrides'::regclass;

-- Recreate trigger if needed
DROP TRIGGER IF EXISTS refresh_mv_on_status_override ON activity_booking_status_overrides;

CREATE TRIGGER refresh_mv_on_status_override
AFTER INSERT OR UPDATE OR DELETE ON activity_booking_status_overrides
FOR EACH STATEMENT
EXECUTE FUNCTION refresh_activity_bookings_participants_mv();
```

### View Columns Not Updated
The migration recreates the materialized view. If you ran it before, you may need to:
```sql
DROP MATERIALIZED VIEW IF EXISTS activity_bookings_participants_mv CASCADE;
-- Then re-run the full migration script
```

---

## API Integration (Optional)

If you want to expose this functionality via API:

```typescript
// In src/routes/admin.ts (create if doesn't exist)
import { Router } from 'express';
import { addStatusOverride, removeStatusOverride } from '../manage-status-overrides';

const router = Router();

router.post('/admin/override-status', async (req, res) => {
  const { activity_booking_id, status, reason, overridden_by } = req.body;

  const result = await addStatusOverride(
    activity_booking_id,
    status,
    reason,
    overridden_by || 'api-user'
  );

  res.json(result);
});

router.delete('/admin/override-status/:id', async (req, res) => {
  const result = await removeStatusOverride(parseInt(req.params.id));
  res.json(result);
});

export default router;
```

---

## Maintenance

### Regular Cleanup (Optional)
If you want to automatically remove old overrides:

```sql
-- Remove overrides older than 90 days
DELETE FROM activity_booking_status_overrides
WHERE overridden_at < NOW() - INTERVAL '90 days';
```

### Audit Report
```sql
-- Generate audit report
SELECT
    DATE(overridden_at) as override_date,
    overridden_by,
    override_status,
    COUNT(*) as total_overrides
FROM activity_booking_status_overrides
GROUP BY DATE(overridden_at), overridden_by, override_status
ORDER BY override_date DESC;
```

---

## Support

For issues or questions:
1. Check if override table exists: `\dt activity_booking_status_overrides`
2. Check MV columns: `\d activity_bookings_participants_mv`
3. Verify triggers: `SELECT * FROM pg_trigger WHERE tgrelid = 'activity_booking_status_overrides'::regclass`
4. Force refresh: `REFRESH MATERIALIZED VIEW CONCURRENTLY activity_bookings_participants_mv;`