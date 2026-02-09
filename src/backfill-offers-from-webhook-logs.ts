import { supabase } from './config/supabase';
import dotenv from 'dotenv';

dotenv.config();

interface BackfillStats {
  totalWebhooksProcessed: number;
  totalOffersFound: number;
  offersInserted: number;
  offersSkipped: number;
  errors: string[];
}

async function backfillOffersFromWebhookLogs(): Promise<void> {
  console.log('='.repeat(80));
  console.log('🔄 BACKFILL OFFERS FROM WEBHOOK LOGS');
  console.log('='.repeat(80));
  console.log(`Started at: ${new Date().toISOString()}\n`);

  const stats: BackfillStats = {
    totalWebhooksProcessed: 0,
    totalOffersFound: 0,
    offersInserted: 0,
    offersSkipped: 0,
    errors: []
  };

  try {
    // Step 1: Get existing promotions to avoid duplicates
    console.log('📊 Fetching existing promotions to avoid duplicates...');

    const { data: existingPromotions, error: existingError } = await supabase
      .from('booking_promotions')
      .select('booking_id, activity_booking_id, offer_id');

    if (existingError) {
      console.error('❌ Error fetching existing promotions:', existingError);
      throw existingError;
    }

    // Create a Set for quick lookup: "bookingId-activityId-offerId"
    const existingKeys = new Set(
      (existingPromotions || []).map(p => `${p.booking_id}-${p.activity_booking_id}-${p.offer_id}`)
    );

    console.log(`✅ Found ${existingPromotions?.length || 0} existing promotion records\n`);

    // Step 2: Process webhooks in pages
    console.log('📊 Processing webhook_logs in pages...\n');

    const PAGE_SIZE = 500;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      console.log(`\n📄 Page ${Math.floor(offset / PAGE_SIZE) + 1} (offset: ${offset})...`);

      const { data: page, error: queryError } = await supabase
        .from('webhook_logs')
        .select('id, booking_id, confirmation_code, action, raw_payload, received_at')
        .eq('webhook_type', 'BOOKING')
        .order('received_at', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (queryError) {
        console.error('❌ Error querying webhook_logs:', queryError);
        throw queryError;
      }

      if (!page || page.length === 0) {
        hasMore = false;
        continue;
      }

      // Process each webhook in this page
      for (const webhook of page) {
        stats.totalWebhooksProcessed++;

        const payload = webhook.raw_payload;
        const offerUsage = payload?.offerUsage;

        // Skip if no offer applied
        if (!offerUsage || !offerUsage.offerId) {
          continue;
        }

        stats.totalOffersFound++;

        const activityBookingId = payload.bookingId;
        const parentBookingId = payload.parentBooking?.bookingId || payload.parentBookingId;
        const confirmationCode = webhook.confirmation_code;
        const productId = payload.productId || payload.product?.id;
        const productTitle = payload.title;
        const currency = payload.currency || 'EUR';

        const key = `${parentBookingId}-${activityBookingId}-${offerUsage.offerId}`;

        if (existingKeys.has(key)) {
          stats.offersSkipped++;
          continue;
        }

        // Calculate pricing
        const originalPrice = payload.totalPrice || 0;
        const discountedPrice = payload.priceWithDiscount || payload.totalPrice || 0;
        const discountAmount = payload.discountAmount || (originalPrice - discountedPrice);

        // Insert the promotion
        const insertData = {
          offer_id: offerUsage.offerId,
          offer_owner_id: null, // Not available in offerUsage
          discount_percentage: offerUsage.discount || payload.discountPercentage || 0,
          booking_id: parentBookingId,
          confirmation_code: confirmationCode,
          activity_booking_id: activityBookingId,
          product_id: productId,
          product_title: productTitle,
          is_multi_activity_offer: false, // Will determine later if needed
          total_activities_in_offer: 1,
          first_activity_booking_id: activityBookingId,
          first_activity_product_id: productId,
          first_activity_title: productTitle,
          activity_sequence_in_offer: 1,
          original_price: originalPrice,
          discounted_price: discountedPrice,
          discount_amount: discountAmount,
          currency: currency,
          webhook_type: 'BACKFILL',
          raw_offer_data: offerUsage
        };

        const { error: insertError } = await supabase
          .from('booking_promotions')
          .insert(insertData);

        if (insertError) {
          // Check if it's a duplicate key error (might have been inserted in parallel)
          if (insertError.code === '23505') {
            stats.offersSkipped++;
          } else {
            console.error(`   ❌ Error inserting offer ${offerUsage.offerId} for ${confirmationCode}:`, insertError.message);
            stats.errors.push(`${confirmationCode} - Offer ${offerUsage.offerId}: ${insertError.message}`);
          }
        } else {
          console.log(`   ✅ ${confirmationCode}: Offer ${offerUsage.offerId} (${offerUsage.discount}%)`);
          stats.offersInserted++;
          existingKeys.add(key);
        }
      }

      offset += PAGE_SIZE;
      hasMore = page.length === PAGE_SIZE;

      // Progress update
      console.log(`   Processed: ${stats.totalWebhooksProcessed} webhooks, ${stats.offersInserted} offers inserted`);
    }

    // Step 3: Update multi-activity offer tracking
    console.log('\n🔄 Updating multi-activity offer tracking...');

    // Find bookings with multiple activities using the same offer
    const { data: multiActivityOffers } = await supabase
      .from('booking_promotions')
      .select('booking_id, offer_id')
      .order('booking_id');

    if (multiActivityOffers) {
      // Group by booking_id + offer_id
      const offerCounts = new Map<string, number>();
      for (const row of multiActivityOffers) {
        const key = `${row.booking_id}-${row.offer_id}`;
        offerCounts.set(key, (offerCounts.get(key) || 0) + 1);
      }

      // Update records where count > 1
      for (const [key, count] of offerCounts) {
        if (count > 1) {
          const [bookingId, offerId] = key.split('-');

          await supabase
            .from('booking_promotions')
            .update({
              is_multi_activity_offer: true,
              total_activities_in_offer: count
            })
            .eq('booking_id', parseInt(bookingId))
            .eq('offer_id', parseInt(offerId));
        }
      }

      console.log('✅ Multi-activity tracking updated');
    }

    // Print summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 BACKFILL SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total webhooks processed: ${stats.totalWebhooksProcessed}`);
    console.log(`Total offers found: ${stats.totalOffersFound}`);
    console.log(`Offers inserted: ${stats.offersInserted}`);
    console.log(`Offers skipped (already existed): ${stats.offersSkipped}`);
    console.log(`Errors: ${stats.errors.length}`);

    if (stats.errors.length > 0 && stats.errors.length <= 20) {
      console.log('\n❌ Errors encountered:');
      stats.errors.forEach(err => console.log(`   - ${err}`));
    } else if (stats.errors.length > 20) {
      console.log(`\n❌ Too many errors to display (${stats.errors.length})`);
    }

    console.log('\n✅ Backfill completed at:', new Date().toISOString());

  } catch (error) {
    console.error('\n❌ Fatal error during backfill:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  backfillOffersFromWebhookLogs()
    .then(() => {
      console.log('\n🎉 Done!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Backfill failed:', error);
      process.exit(1);
    });
}

export { backfillOffersFromWebhookLogs };
