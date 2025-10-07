# Affiliate Commission System

## Overview

This system automatically calculates affiliate commissions in the materialized view based on configurable commission percentages.

**Formula:** `affiliate_commission = total_price * (commission_percentage / 100)`

---

## 🚀 Installation Steps

### Step 1: Run the SQL Migration

1. Open the file:
   ```
   /Users/pedromartinezsaro/Desktop/booking-webhook-system/src/migrations/add-affiliate-commission.sql
   ```

2. Copy ALL contents

3. Go to Supabase SQL Editor → New Query

4. Paste and RUN

5. Should see: "Success. No rows returned"

---

## 📊 What Was Created

### 1. `affiliate_commissions` Table

Stores commission percentage for each affiliate:

```sql
CREATE TABLE affiliate_commissions (
    id SERIAL PRIMARY KEY,
    affiliate_id VARCHAR(255) UNIQUE NOT NULL,
    commission_percentage NUMERIC(5,2) NOT NULL,  -- 0-100
    notes TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

### 2. Materialized View - New Columns

- **`affiliate_commission`** - Calculated commission amount (EUR)
- **`affiliate_commission_percentage`** - The % used for calculation

### 3. Management Page (SaaS App)

Located at: `/dashboard/affiliates`

Features:
- ✅ Add/Edit/Delete commission rates
- ✅ View affiliate statistics
- ✅ See total commissions per affiliate
- ✅ Real-time calculation

---

## 💡 How It Works

### Example Calculation

**Booking:**
- `total_price`: €100.00
- `affiliate_id`: "cometeelmundo"

**Commission Table:**
- "cometeelmundo" → 10.5%

**Result in Materialized View:**
- `affiliate_commission`: €10.50 (calculated automatically)

### NULL Handling

`affiliate_commission` is **NULL** when:
- No `affiliate_id` on the booking
- Affiliate has no commission % configured

---

## 📝 Usage Examples

### Add Commission Rate (SQL)

```sql
INSERT INTO affiliate_commissions (affiliate_id, commission_percentage, notes)
VALUES ('cometeelmundo', 10.00, 'Standard rate')
ON CONFLICT (affiliate_id)
DO UPDATE SET
    commission_percentage = EXCLUDED.commission_percentage,
    notes = EXCLUDED.notes,
    updated_at = NOW();
```

### Update Commission Rate

```sql
UPDATE affiliate_commissions
SET commission_percentage = 12.50,
    updated_at = NOW()
WHERE affiliate_id = 'cometeelmundo';
```

### View Commissions Report

```sql
SELECT
    affiliate_id,
    COUNT(*) as booking_count,
    SUM(total_price) as total_revenue,
    AVG(affiliate_commission_percentage) as avg_rate,
    SUM(affiliate_commission) as total_commission
FROM activity_bookings_participants_mv
WHERE affiliate_id IS NOT NULL
  AND affiliate_commission IS NOT NULL
GROUP BY affiliate_id
ORDER BY total_commission DESC;
```

### Find Affiliates Without Commission Rates

```sql
SELECT DISTINCT
    ab.affiliate_id,
    COUNT(*) as booking_count,
    SUM(ab.total_price) as potential_revenue
FROM activity_bookings ab
LEFT JOIN affiliate_commissions ac ON ab.affiliate_id = ac.affiliate_id
WHERE ab.affiliate_id IS NOT NULL
  AND ac.id IS NULL
GROUP BY ab.affiliate_id
ORDER BY booking_count DESC;
```

---

## 🎯 Using the Management Page

### Access the Page

In your SaaS app at:
```
http://localhost:3000/dashboard/affiliates
```

### Add New Commission

1. Click **"Add Commission"**
2. Enter:
   - **Affiliate ID**: (e.g., "cometeelmundo")
   - **Commission %**: (e.g., 10.5)
   - **Notes**: (optional, e.g., "Standard rate")
3. Click **"Add Commission"**

### Edit Commission

1. Click the **pencil icon** next to an affiliate
2. Update the percentage or notes
3. Click **"Update Commission"**

### Delete Commission

1. Click the **trash icon** next to an affiliate
2. Confirm deletion
3. Bookings will show NULL commission (no longer calculated)

### View Statistics

The page shows:
- **Total Affiliates** with commission rates
- **Total Bookings** from all affiliates
- **Total Commissions** calculated

For each affiliate:
- Number of bookings
- Total revenue
- Total commission earned

---

## 🔍 Verification Queries

### Check Commission Calculation

```sql
SELECT
    activity_booking_id,
    affiliate_id,
    total_price,
    affiliate_commission_percentage,
    affiliate_commission,
    -- Verify calculation
    ROUND(total_price * (affiliate_commission_percentage / 100), 2) as manual_calc
FROM activity_bookings_participants_mv
WHERE affiliate_id = 'cometeelmundo'
LIMIT 10;
```

### Check All Affiliates with Commissions

```sql
SELECT * FROM affiliate_commissions ORDER BY affiliate_id;
```

### Total Commission Summary

```sql
SELECT
    DATE_TRUNC('month', start_date_time) as month,
    affiliate_id,
    COUNT(*) as bookings,
    SUM(total_price) as revenue,
    SUM(affiliate_commission) as commission
FROM activity_bookings_participants_mv
WHERE affiliate_commission IS NOT NULL
GROUP BY DATE_TRUNC('month', start_date_time), affiliate_id
ORDER BY month DESC, commission DESC;
```

---

## ⚡ Important Notes

### Automatic Updates

✅ When you change a commission %:
- Materialized view **automatically refreshes** (via trigger)
- All bookings recalculate commission instantly

### Retroactive Changes

✅ Changing commission % affects ALL bookings:
- Past bookings
- Current bookings
- Future bookings

If you need historical commission rates, consider adding a `effective_date` field.

### NULL Values

- `affiliate_commission` = NULL means:
  - No affiliate on booking, OR
  - Affiliate has no commission % set
- This is normal and expected

---

## 🔧 Troubleshooting

### Commission Not Calculating

**Check 1: Does affiliate have commission rate?**
```sql
SELECT * FROM affiliate_commissions WHERE affiliate_id = 'your-affiliate-id';
```

**Check 2: Force refresh view**
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY activity_bookings_participants_mv;
```

**Check 3: Verify calculation**
```sql
SELECT
    activity_booking_id,
    affiliate_id,
    total_price,
    affiliate_commission_percentage,
    affiliate_commission
FROM activity_bookings_participants_mv
WHERE affiliate_id = 'your-affiliate-id'
LIMIT 5;
```

### Management Page Not Loading

**Check Supabase permissions:**
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON affiliate_commissions TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE affiliate_commissions_id_seq TO authenticated;
```

### Wrong Calculations

**Verify formula:**
```sql
SELECT
    affiliate_id,
    total_price,
    affiliate_commission_percentage,
    affiliate_commission,
    -- Should match:
    ROUND(total_price * (affiliate_commission_percentage / 100), 2) as expected
FROM activity_bookings_participants_mv
WHERE affiliate_id IS NOT NULL
  AND affiliate_commission IS NOT NULL
LIMIT 10;
```

---

## 📊 Example Data

### Sample Commission Rates

```sql
INSERT INTO affiliate_commissions (affiliate_id, commission_percentage, notes)
VALUES
    ('cometeelmundo', 10.00, 'Standard partner - 10%'),
    ('il-colosseo', 12.50, 'Premium partner - 12.5%'),
    ('tourmageddon', 15.00, 'Internal affiliate - 15%'),
    ('viator', 8.00, 'OTA - 8%')
ON CONFLICT (affiliate_id) DO NOTHING;
```

### Expected Results

For a €200 booking:
- `cometeelmundo` → €20.00 commission
- `il-colosseo` → €25.00 commission
- `tourmageddon` → €30.00 commission
- `viator` → €16.00 commission

---

## 🎓 Best Practices

### 1. Set Commission Rates Before Bookings

Configure commission rates for known affiliates before bookings come in.

### 2. Regular Reviews

Periodically check affiliates without commission rates:
```sql
SELECT DISTINCT ab.affiliate_id
FROM activity_bookings ab
LEFT JOIN affiliate_commissions ac ON ab.affiliate_id = ac.affiliate_id
WHERE ab.affiliate_id IS NOT NULL AND ac.id IS NULL;
```

### 3. Document Rate Changes

Use the `notes` field to document why rates changed:
```sql
UPDATE affiliate_commissions
SET
    commission_percentage = 15.00,
    notes = 'Increased from 10% to 15% - Q4 promotion',
    updated_at = NOW()
WHERE affiliate_id = 'cometeelmundo';
```

### 4. Export Commission Reports

Monthly commission report:
```sql
SELECT
    affiliate_id,
    COUNT(*) as bookings,
    SUM(total_price) as revenue,
    SUM(affiliate_commission) as commission_due,
    DATE_TRUNC('month', start_date_time) as month
FROM activity_bookings_participants_mv
WHERE affiliate_commission IS NOT NULL
  AND start_date_time >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY affiliate_id, DATE_TRUNC('month', start_date_time)
ORDER BY commission_due DESC;
```

---

## 🔗 Related Files

- **Migration**: `src/migrations/add-affiliate-commission.sql`
- **Management Page**: `tourmageddon-saas/src/app/dashboard/affiliates/page.tsx`
- **Documentation**: This file

---

## ✅ Quick Checklist

After installation:
- [ ] Run migration in Supabase
- [ ] Verify `affiliate_commissions` table exists
- [ ] Check materialized view has new columns
- [ ] Access management page at `/dashboard/affiliates`
- [ ] Add commission rate for test affiliate
- [ ] Verify calculation in materialized view
- [ ] Test editing and deleting rates

---

## 💬 Support

If commissions aren't calculating:
1. Check affiliate has commission rate set
2. Force refresh materialized view
3. Verify affiliate_id matches exactly (case-sensitive)
4. Check logs for any errors