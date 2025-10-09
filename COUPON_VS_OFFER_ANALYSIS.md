# Coupons vs Offers - Analysis & Questions

## Current Understanding

### Offers (Already Implemented ✅)
- Found in webhook: `bookingData.offers[]`
- Structure:
  ```json
  {
    "id": 723,
    "ownerId": 27164,
    "discount": 12,
    "activities": [...]
  }
  ```
- Use case: Multi-activity packages, automatic discounts
- Tracked in: `booking_promotions` table

### Coupons (Need Implementation ❌)
- **Where in webhook?** → NEED EXAMPLE
- Likely fields to check:
  - `bookingData.couponCode`
  - `bookingData.promotionCode`
  - `bookingData.voucherCode`
  - `parentBooking.couponCode`
  - `parentBooking.discount.code`

## Key Difference

| Feature | Offers | Coupons |
|---------|--------|---------|
| Application | Automatic (multi-activity packages) | Manual (customer enters code) |
| Bokun Field | `offers[]` array | Unknown - need webhook example |
| GTM Tracking | Not linked to campaign | **Should link to `first_campaign`** |
| Example | "Vatican + Colosseum Combo" | "SUMMER2024" |

## Required Information

### Questions:
1. **Do you have a webhook example where a coupon was used?**
   - Please share a webhook JSON or text file

2. **What field does Bokun use for coupons?**
   - `couponCode`?
   - `promotionCode`?
   - Part of `offers` array but different type?

3. **Can coupons and offers be used together?**
   - Example: Book Vatican + Colosseum (offer) AND use coupon "SAVE10"

4. **Coupon attribution to campaign:**
   - Should we link coupon to `first_campaign` from the FIRST activity?
   - Or from the activity where coupon was applied?

## Proposed Solution (Pending Confirmation)

### Option A: Separate Coupon Table
```sql
CREATE TABLE booking_coupons (
  id SERIAL PRIMARY KEY,
  coupon_code VARCHAR(100) NOT NULL,
  booking_id BIGINT NOT NULL,
  confirmation_code VARCHAR(255),

  -- GTM Campaign Attribution
  first_campaign_id VARCHAR(255), -- From GTM
  affiliate_id VARCHAR(100),      -- From GTM

  -- Discount info
  discount_type VARCHAR(50), -- 'PERCENTAGE' or 'FIXED_AMOUNT'
  discount_value DECIMAL(10,2),
  discount_amount DECIMAL(10,2),
  currency VARCHAR(3),

  -- Which activity this coupon was applied to
  activity_booking_id BIGINT,
  product_id INTEGER,

  -- Metadata
  applied_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Option B: Add Coupon Fields to booking_promotions
```sql
ALTER TABLE booking_promotions
ADD COLUMN promotion_type VARCHAR(50), -- 'OFFER' or 'COUPON'
ADD COLUMN coupon_code VARCHAR(100),
ADD COLUMN first_campaign_id VARCHAR(255),
ADD COLUMN affiliate_id VARCHAR(100);
```

## Recommendation

**Option A (Separate Table)** is better because:
1. Coupons and offers are conceptually different
2. Different attribution logic (coupons → campaign, offers → multi-activity)
3. Easier to report on separately
4. Clearer data model

## Next Steps

1. **Get webhook example with coupon usage**
2. Identify exact field name for coupons in Bokun webhooks
3. Confirm coupon + offer combination behavior
4. Implement coupon tracking with GTM campaign attribution
5. Update promotion service to handle both

## Example Scenario (Once Implemented)

Customer journey:
1. Clicks affiliate link (GTM tracks: `first_campaign="summer-promo"`)
2. Uses coupon code "SAVE15"
3. Books Vatican + Colosseum (multi-activity offer 3% off)

Database should show:
- `booking_coupons`: code="SAVE15", first_campaign="summer-promo"
- `booking_promotions`: offer_id=360, discount=3%, type="OFFER"

Total discount: 15% (coupon) + 3% (offer) = 18% off
