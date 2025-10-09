# Setup Promotions Tracking

## Quick Setup

### 1. Run SQL Migration in Supabase

1. Go to your Supabase project: https://supabase.com/dashboard/project/_/sql
2. Click "New query"
3. Copy the entire contents of `src/migrations/create-promotions-table.sql`
4. Paste and click "Run"

### 2. Verify Tables Created

Run this query to check:
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name = 'booking_promotions';
```

Should return: `booking_promotions`

### 3. Deploy Code

```bash
git add .
git commit -m "feat: Add promotion tracking for multi-activity offers"
git push
railway up
```

## What You Get

### Database Tables

**`booking_promotions`** - Main table tracking all offers:
- `offer_id` - Bokun offer ID (for mapping in Tourmagedon)
- `discount_percentage` - Discount % (3 means 3% off)
- `first_activity_booking_id` - Which activity triggered the offer
- `activity_sequence_in_offer` - 1st, 2nd, 3rd activity in package
- All pricing and discount amounts

**Views for Reporting:**
- `v_promotion_summary` - Stats by offer_id
- `v_multi_activity_offers` - Multi-activity package details

### Example Queries

#### See all promotions for a booking:
```sql
SELECT * FROM booking_promotions
WHERE booking_id = 75897941
ORDER BY activity_sequence_in_offer;
```

#### Multi-activity offers summary:
```sql
SELECT * FROM v_multi_activity_offers
ORDER BY first_booking_time DESC
LIMIT 10;
```

#### Promotions used today:
```sql
SELECT
  offer_id,
  discount_percentage,
  COUNT(*) as times_used,
  SUM(discount_amount) as total_discount_given
FROM booking_promotions
WHERE created_at::date = CURRENT_DATE
GROUP BY offer_id, discount_percentage;
```

#### Find which activity triggered multi-activity offers:
```sql
SELECT
  offer_id,
  first_activity_title as trigger_activity,
  COUNT(*) as total_bookings,
  SUM(discount_amount) as revenue_impact
FROM booking_promotions
WHERE is_multi_activity_offer = TRUE
GROUP BY offer_id, first_activity_title
ORDER BY total_bookings DESC;
```

## Testing

### Test Scenario 1: Single Activity with Discount

1. Book 1 activity in Bokun with a promotion
2. Check Railway logs for: `🎁 PROMOTION DETECTION`
3. Query: `SELECT * FROM booking_promotions ORDER BY created_at DESC LIMIT 1;`

### Test Scenario 2: Multi-Activity Package (Vatican + Colosseum)

1. Book Vatican tour in Bokun
2. Add Colosseum tour to same reservation (with multi-activity offer)
3. Check Railway logs - should show:
   ```
   🎁 PROMOTION DETECTION
      Found 1 offer(s) in webhook
      🎯 Offer ID: 360
         Discount: 3%
         Type: MULTI-ACTIVITY
         📋 Applies to 2 activities
   ```
4. Query database:
   ```sql
   SELECT
     offer_id,
     activity_sequence_in_offer,
     product_title,
     first_activity_title,
     discount_amount
   FROM booking_promotions
   WHERE booking_id = <your_booking_id>
   ORDER BY activity_sequence_in_offer;
   ```

Should see:
- Row 1: Vatican (sequence 1, first_activity = Vatican)
- Row 2: Colosseum (sequence 2, first_activity = Vatican)

## For Tourmagedon Integration

You'll be able to:
1. Query `SELECT DISTINCT offer_id, discount_percentage FROM booking_promotions`
2. Create a mapping table in Tourmagedon: `offer_id → custom_title`
3. Use for reporting: "Rome Combo Deal", "Summer Special", etc.

Example mapping:
- offer_id 360 → "Vatican + Colosseum Combo"
- offer_id 723 → "Family Package 12% Off"
- offer_id 845 → "Early Bird Special"
