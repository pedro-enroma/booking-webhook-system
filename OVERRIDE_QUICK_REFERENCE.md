# Status Override - Quick Reference Card

## 🚀 Quick Start

```bash
# 1. Run migration in Supabase SQL Editor
# Copy/paste: src/migrations/add-status-override-system.sql

# 2. Mark bookings as CANCELLED (view only)
npm run manage-overrides -- add 12345678 CANCELLED "Reason here"

# 3. Mark multiple bookings
npm run manage-overrides -- add-bulk 111,222,333 CANCELLED "Reason here"

# 4. Remove override (show real status)
npm run manage-overrides -- remove 12345678

# 5. List all overrides
npm run manage-overrides -- list

# 6. View specific booking
npm run manage-overrides -- view 12345678
```

---

## 📋 Common SQL Commands

### Add Override
```sql
INSERT INTO activity_booking_status_overrides (
    activity_booking_id, override_status, override_reason, overridden_by, original_status
) VALUES (
    12345678, 'CANCELLED', 'Hide from reports', 'admin@enroma.com',
    (SELECT status FROM activity_bookings WHERE activity_booking_id = 12345678)
);
```

### Remove Override
```sql
DELETE FROM activity_booking_status_overrides WHERE activity_booking_id = 12345678;
```

### View All Overrides
```sql
SELECT * FROM activity_booking_status_overrides ORDER BY overridden_at DESC;
```

### Compare View vs Actual Status
```sql
SELECT
    activity_booking_id,
    status as view_status,
    original_status as actual_status,
    CASE WHEN status != original_status THEN '⚠️ OVERRIDDEN' ELSE '✓' END
FROM activity_bookings_participants_mv
WHERE activity_booking_id = 12345678;
```

### Find All Overridden Bookings
```sql
SELECT activity_booking_id, product_title, status, original_status, override_reason
FROM activity_bookings_participants_mv
WHERE status != original_status
ORDER BY start_date_time DESC;
```

---

## ✅ What It Does

- ✅ Changes status **ONLY** in materialized view `activity_bookings_participants_mv`
- ✅ Keeps **ACTUAL** status unchanged in `activity_bookings` table
- ✅ All other tables remain unchanged
- ✅ Tracks who, when, why (audit trail)
- ✅ Automatic view refresh via triggers

---

## ❌ What It Does NOT Do

- ❌ Does **NOT** change `activity_bookings` table
- ❌ Does **NOT** actually cancel bookings
- ❌ Does **NOT** affect webhooks
- ❌ Does **NOT** trigger business logic

---

## 🎯 Use Cases

✅ **Use when:**
- Hiding test bookings from reports
- Excluding specific bookings from exports
- Creating custom status views for analysis
- Temporarily showing different status to specific audiences

❌ **Don't use when:**
- Actually cancelling a booking (use proper cancellation)
- Changing production booking status (modify base table)
- Need to trigger booking-related actions

---

## 🔍 Verification

```sql
-- Check if override is active
SELECT
    ab.status as table_status,
    mv.status as view_status,
    mv.override_reason
FROM activity_bookings ab
JOIN activity_bookings_participants_mv mv ON ab.activity_booking_id = mv.activity_booking_id
WHERE ab.activity_booking_id = 12345678;

-- Count overrides
SELECT COUNT(*) FROM activity_booking_status_overrides;

-- Force refresh view (if needed)
REFRESH MATERIALIZED VIEW CONCURRENTLY activity_bookings_participants_mv;
```

---

## 📝 New Columns in Materialized View

| Column | Description |
|--------|-------------|
| `status` | **Shows override if exists**, otherwise actual status |
| `original_status` | **Always shows actual status** from activity_bookings |
| `override_reason` | Why override was applied (NULL if no override) |
| `overridden_by` | Who applied override (NULL if no override) |
| `overridden_at` | When override was applied (NULL if no override) |

---

## 🆘 Troubleshooting

**Override not showing?**
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY activity_bookings_participants_mv;
```

**Check if table exists:**
```sql
SELECT * FROM activity_booking_status_overrides LIMIT 1;
```

**Remove all overrides:**
```sql
DELETE FROM activity_booking_status_overrides;
```

---

## 📞 Support

- Full docs: `STATUS_OVERRIDE_README.md`
- Migration: `src/migrations/add-status-override-system.sql`
- Manager: `src/manage-status-overrides.ts`