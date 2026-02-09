# Promotions, Offers & Discounts Analysis

## Current Status: ❌ NOT TRACKED

Bokun webhooks contain discount and offer data, but we're **NOT currently storing** this information in the database.

## Webhook Structure

### Offers Array (at activity level)
```json
{
  "offers": [
    {
      "id": 723,
      "ownerId": 27164,
      "discount": 12,  // Percentage discount
      "activities": [
        {
          "id": 221221,
          "title": "Tour Coliseo y Foro Romano adaptado a niños – Tour de grupo"
        }
      ]
    }
  ]
}
```

### Pricing Category Discount Fields
```json
{
  "discount": 0,
  "calculatedDiscount": 0,
  "customDiscount": 0,
  "calculatedDiscountAmount": 0,
  "discountAmountAsMoney": {
    "amount": 0,
    "currency": "EUR"
  },
  "totalDiscounted": 69,
  "totalDiscountedAsMoney": {
    "amount": 69,
    "currency": "EUR"
  },
  "supportsDiscount": true
}
```

## Multi-Activity Bookings with Promotions

### Scenario: 2-for-1 Offer or Package Deal

When a customer books multiple activities with a promotion:

1. **Webhook 1** (Activity 1): Contains `offers` array with promotion details
2. **Webhook 2** (Activity 2): May reference the same promotion

### Current Behavior
- ✅ Both activities are saved (with enhanced logging)
- ❌ Promotion/discount data is **NOT saved**
- ❌ Cannot track which bookings used promotions
- ❌ Cannot calculate actual revenue vs. discounted revenue

## Impact on Multi-Activity Bookings

### Example: Vatican + Colosseum Package (15% off)

**Without Promotion Tracking:**
```
Activity 1: Vatican - €50 (saved)
Activity 2: Colosseum - €40 (saved)
Total stored: €90
Promotion: 15% off → NOT SAVED ❌
Actual price paid: €76.50 → NOT TRACKED ❌
```

**Problem:** Reports show €90 revenue but customer only paid €76.50

## Recommended Solution

### Option 1: Add Promotion Fields to activity_bookings

```sql
ALTER TABLE activity_bookings ADD COLUMN offer_id INTEGER;
ALTER TABLE activity_bookings ADD COLUMN offer_discount_percentage DECIMAL(5,2);
ALTER TABLE activity_bookings ADD COLUMN total_before_discount DECIMAL(10,2);
ALTER TABLE activity_bookings ADD COLUMN discount_amount DECIMAL(10,2);
ALTER TABLE activity_bookings ADD COLUMN is_part_of_multi_activity_offer BOOLEAN DEFAULT FALSE;
```

### Option 2: Create Separate Promotions Table

```sql
CREATE TABLE booking_promotions (
  id SERIAL PRIMARY KEY,
  booking_id BIGINT NOT NULL,
  offer_id INTEGER,
  offer_owner_id INTEGER,
  discount_percentage DECIMAL(5,2),
  affected_activity_ids BIGINT[],
  total_discount_amount DECIMAL(10,2),
  currency VARCHAR(3),
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (booking_id) REFERENCES bookings(booking_id)
);
```

### Option 3: Store in pricing_category_bookings

```sql
ALTER TABLE pricing_category_bookings ADD COLUMN discount DECIMAL(10,2);
ALTER TABLE pricing_category_bookings ADD COLUMN calculated_discount DECIMAL(10,2);
ALTER TABLE pricing_category_bookings ADD COLUMN custom_discount DECIMAL(10,2);
ALTER TABLE pricing_category_bookings ADD COLUMN total_discounted DECIMAL(10,2);
```

## Detection Logic for Multi-Activity Promotions

```typescript
// In bookingService.ts
private hasMultiActivityPromotion(bookingData: any): boolean {
  if (!bookingData.offers || bookingData.offers.length === 0) {
    return false;
  }

  // Check if any offer applies to multiple activities
  return bookingData.offers.some((offer: any) =>
    offer.activities && offer.activities.length > 1
  );
}

// Log multi-activity promotions
if (this.hasMultiActivityPromotion(bookingData)) {
  console.log('🎁 MULTI-ACTIVITY PROMOTION DETECTED!');
  bookingData.offers.forEach((offer: any) => {
    console.log(`   Offer ID: ${offer.id}`);
    console.log(`   Discount: ${offer.discount}%`);
    console.log(`   Applies to ${offer.activities.length} activities`);
  });
}
```

## Current Database Fields

### ✅ We Store:
- `total_price` (after discount)
- `activity_booking_id`
- `product_title`
- `status`

### ❌ We DON'T Store:
- Offer ID
- Discount percentage
- Original price (before discount)
- Discount amount
- Multi-activity package indicator

## Testing Scenarios

### Test 1: Single Activity with Discount
- Book 1 activity with 10% off
- Check if discount is visible in webhook
- Verify if saved to DB (currently NO)

### Test 2: Multi-Activity Package Deal
- Book Vatican + Colosseum with "2-for-1" offer
- Check both webhooks for offer data
- Verify both activities reference same offer ID
- Check if relationship is preserved (currently NO)

### Test 3: Per-Participant Discount
- Book 2 adults + 1 child with "kids free" promotion
- Check pricing_category_bookings for discount fields
- Verify participant-level discounts (currently NOT saved)

## Quick Check Query

To see if any recent bookings had offers/discounts, check webhook_logs:

```sql
SELECT
  confirmation_code,
  action,
  raw_payload->'offers' as offers,
  raw_payload->'pricingCategoryBookings'->0->'discount' as discount
FROM webhook_logs
WHERE raw_payload->'offers' IS NOT NULL
  OR raw_payload->'pricingCategoryBookings'->0->'discount' != '0'
ORDER BY received_at DESC
LIMIT 10;
```

## Conclusion

**Answer to your question:**

**YES, multi-activity bookings CAN include promotions/discounts**, and Bokun sends this data in the webhooks with:
- `offers` array with promotion details
- Discount percentages and amounts
- References to which activities the offer applies to

**BUT** we're **NOT currently capturing or storing** this information, which means:
- ❌ Cannot track promotional bookings
- ❌ Cannot calculate discount impact on revenue
- ❌ Cannot identify multi-activity package deals
- ❌ Pricing reports may be inaccurate if they use `total_price` alone

**Recommendation:** Add promotion tracking to properly handle multi-activity package deals and discount analysis.
