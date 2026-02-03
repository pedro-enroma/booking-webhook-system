import { supabase } from '../config/supabase';

export interface PromotionData {
  offerId: number;
  offerOwnerId?: number;
  discountPercentage: number;
  bookingId: number;
  confirmationCode: string;
  activityBookingId: number;
  productId?: number;
  productTitle: string;
  isMultiActivityOffer: boolean;
  totalActivitiesInOffer: number;
  firstActivityBookingId?: number;
  firstActivityProductId?: number;
  firstActivityTitle?: string;
  activitySequenceInOffer: number;
  originalPrice?: number;
  discountedPrice?: number;
  discountAmount?: number;
  currency?: string;
  webhookType: string;
  rawOfferData: any;
}

export interface CouponData {
  promoCodeId: number;
  promoCode: string;
  promoCodeDescription?: string;
  bookingId: number;
  confirmationCode: string;
  firstCampaign?: string;
  affiliateId?: string;
  activityBookingId: number;
  productId?: number;
  productTitle: string;
  discountType?: string;
  discountValue?: number;
  discountAmount?: number;
  currency?: string;
  originalPrice?: number;
  discountedPrice?: number;
  webhookType: string;
  rawPromoData: any;
}

export class PromotionService {

  /**
   * Track a coupon/promo code usage with GTM campaign attribution
   */
  async trackCoupon(couponData: CouponData): Promise<void> {
    try {
      const { error } = await supabase
        .from('booking_coupons')
        .insert({
          promo_code_id: couponData.promoCodeId,
          promo_code: couponData.promoCode,
          promo_code_description: couponData.promoCodeDescription,
          booking_id: couponData.bookingId,
          confirmation_code: couponData.confirmationCode,
          first_campaign: couponData.firstCampaign,
          affiliate_id: couponData.affiliateId,
          activity_booking_id: couponData.activityBookingId,
          product_id: couponData.productId,
          product_title: couponData.productTitle,
          discount_type: couponData.discountType,
          discount_value: couponData.discountValue,
          discount_amount: couponData.discountAmount,
          currency: couponData.currency || 'EUR',
          original_price: couponData.originalPrice,
          discounted_price: couponData.discountedPrice,
          webhook_type: couponData.webhookType,
          raw_promo_data: couponData.rawPromoData,
          applied_at: new Date().toISOString()
        });

      if (error) {
        console.error('❌ Error saving coupon:', error);
        throw error;
      }

      console.log(`✅ Coupon tracked: ${couponData.promoCode} (ID: ${couponData.promoCodeId})`);
      if (couponData.firstCampaign) {
        console.log(`   📊 Campaign attribution: ${couponData.firstCampaign}`);
      }
    } catch (error) {
      console.error('❌ Error in trackCoupon:', error);
      // Don't throw - coupon tracking failure shouldn't break booking processing
    }
  }

  /**
   * Track a promotion from webhook data
   */
  async trackPromotion(promotionData: PromotionData): Promise<void> {
    try {
      const { error } = await supabase
        .from('booking_promotions')
        .insert({
          offer_id: promotionData.offerId,
          offer_owner_id: promotionData.offerOwnerId,
          discount_percentage: promotionData.discountPercentage,
          booking_id: promotionData.bookingId,
          confirmation_code: promotionData.confirmationCode,
          activity_booking_id: promotionData.activityBookingId,
          product_id: promotionData.productId,
          product_title: promotionData.productTitle,
          is_multi_activity_offer: promotionData.isMultiActivityOffer,
          total_activities_in_offer: promotionData.totalActivitiesInOffer,
          first_activity_booking_id: promotionData.firstActivityBookingId,
          first_activity_product_id: promotionData.firstActivityProductId,
          first_activity_title: promotionData.firstActivityTitle,
          activity_sequence_in_offer: promotionData.activitySequenceInOffer,
          original_price: promotionData.originalPrice,
          discounted_price: promotionData.discountedPrice,
          discount_amount: promotionData.discountAmount,
          currency: promotionData.currency || 'EUR',
          webhook_type: promotionData.webhookType,
          raw_offer_data: promotionData.rawOfferData
        });

      if (error) {
        console.error('❌ Error saving promotion:', error);
        throw error;
      }

      console.log(`✅ Promotion tracked: Offer ${promotionData.offerId} (${promotionData.discountPercentage}% off)`);
    } catch (error) {
      console.error('❌ Error in trackPromotion:', error);
      // Don't throw - promotion tracking failure shouldn't break booking processing
    }
  }

  /**
   * Extract and track promotions from booking webhook data
   * @param parentBooking - The root booking object (contains offers array)
   * @param activityData - The current activity being processed
   * @param parentBookingId - The parent booking ID
   * @param confirmationCode - The booking confirmation code
   * @param webhookType - BOOKING_CONFIRMED or BOOKING_UPDATED
   */
  async processWebhookOffers(
    parentBooking: any,
    activityData: any,
    parentBookingId: number,
    confirmationCode: string,
    webhookType: string
  ): Promise<void> {
    try {
      // Check if there are offers in the PARENT booking (not activity level)
      if (!parentBooking?.offers || parentBooking.offers.length === 0) {
        console.log('   📊 No offers found in parentBooking');
        return;
      }

      console.log(`\n🎁 PROMOTION DETECTION`);
      console.log(`   Found ${parentBooking.offers.length} offer(s) in parentBooking`);

      for (const offer of parentBooking.offers) {
        const isMultiActivity = offer.activities && offer.activities.length > 1;

        console.log(`\n   🎯 Offer ID: ${offer.id}`);
        console.log(`      Discount: ${offer.discount}%`);
        console.log(`      Owner ID: ${offer.ownerId}`);
        console.log(`      Type: ${isMultiActivity ? 'MULTI-ACTIVITY' : 'SINGLE ACTIVITY'}`);

        if (isMultiActivity) {
          console.log(`      📋 Applies to ${offer.activities.length} activities:`);
          offer.activities.forEach((activity: any, index: number) => {
            console.log(`         ${index + 1}. ${activity.title} (ID: ${activity.id})`);
          });
        }

        // Get current activity info from activityData
        const currentActivityBookingId = activityData.bookingId;
        const currentProductId = activityData.productId || activityData.product?.id;
        const currentProductTitle = activityData.title;

        // Determine if this is the first activity or a subsequent one
        let firstActivityInfo = null;
        let activitySequence = 1;

        if (isMultiActivity) {
          // Check if there are already activities with this offer for this booking
          const { data: existingPromotions } = await supabase
            .from('booking_promotions')
            .select('*')
            .eq('booking_id', parentBookingId)
            .eq('offer_id', offer.id)
            .order('created_at', { ascending: true });

          if (existingPromotions && existingPromotions.length > 0) {
            // This is a subsequent activity - use info from first
            firstActivityInfo = {
              bookingId: existingPromotions[0].activity_booking_id,
              productId: existingPromotions[0].product_id,
              title: existingPromotions[0].product_title
            };
            activitySequence = existingPromotions.length + 1;

            console.log(`\n      ➕ This is activity #${activitySequence} in multi-activity offer`);
            console.log(`      📌 First activity was: ${firstActivityInfo.title}`);
          } else {
            // This is the first activity
            console.log(`\n      🎬 This is the FIRST activity in multi-activity offer`);
            console.log(`      📌 Will track as trigger activity`);
          }
        }

        // Calculate discount amounts if we have pricing data
        let originalPrice = activityData.totalPrice;
        let discountedPrice = activityData.totalPrice;
        let discountAmount = 0;

        // Try to get pre-discount price from pricingCategoryBookings
        if (activityData.pricingCategoryBookings && activityData.pricingCategoryBookings.length > 0) {
          const totalBeforeDiscount = activityData.pricingCategoryBookings.reduce(
            (sum: number, pcb: any) => sum + (pcb.total || 0),
            0
          );
          const totalAfterDiscount = activityData.pricingCategoryBookings.reduce(
            (sum: number, pcb: any) => sum + (pcb.totalDiscounted || pcb.total || 0),
            0
          );

          if (totalBeforeDiscount > 0) {
            originalPrice = totalBeforeDiscount;
            discountedPrice = totalAfterDiscount;
            discountAmount = originalPrice - discountedPrice;

            console.log(`\n      💰 Pricing:`);
            console.log(`         Original: €${originalPrice.toFixed(2)}`);
            console.log(`         Discounted: €${discountedPrice.toFixed(2)}`);
            console.log(`         Saved: €${discountAmount.toFixed(2)}`);
          }
        }

        // Track the promotion
        await this.trackPromotion({
          offerId: offer.id,
          offerOwnerId: offer.ownerId,
          discountPercentage: offer.discount,
          bookingId: parentBookingId,
          confirmationCode: confirmationCode,
          activityBookingId: currentActivityBookingId,
          productId: currentProductId,
          productTitle: currentProductTitle,
          isMultiActivityOffer: isMultiActivity,
          totalActivitiesInOffer: isMultiActivity ? offer.activities.length : 1,
          firstActivityBookingId: firstActivityInfo?.bookingId || currentActivityBookingId,
          firstActivityProductId: firstActivityInfo?.productId || currentProductId,
          firstActivityTitle: firstActivityInfo?.title || currentProductTitle,
          activitySequenceInOffer: activitySequence,
          originalPrice: originalPrice,
          discountedPrice: discountedPrice,
          discountAmount: discountAmount,
          currency: activityData.currency || 'EUR',
          webhookType: webhookType,
          rawOfferData: offer
        });
      }

      console.log(`✅ Promotion processing completed`);

    } catch (error) {
      console.error('❌ Error processing webhook offers:', error);
      // Don't throw - promotion tracking failure shouldn't break booking processing
    }
  }

  /**
   * Process promo codes from webhook with GTM campaign attribution
   */
  async processWebhookCoupons(
    bookingData: any,
    parentBookingId: number,
    confirmationCode: string,
    webhookType: string
  ): Promise<void> {
    try {
      // Check for promoCode in parentBooking.invoice
      const promoCode = bookingData.parentBooking?.invoice?.promoCode;

      if (!promoCode) {
        console.log('   📊 No promo code found in webhook');
        return;
      }

      console.log(`\n🎟️  COUPON DETECTION`);
      console.log(`   Promo Code: "${promoCode.code}" (ID: ${promoCode.id})`);
      if (promoCode.description) {
        console.log(`   Description: ${promoCode.description}`);
      }

      // Get first_campaign and affiliate_id from activity_bookings
      const { data: activityBooking } = await supabase
        .from('activity_bookings')
        .select('activity_booking_id, first_campaign, affiliate_id, product_id, product_title')
        .eq('activity_booking_id', bookingData.bookingId)
        .single();

      let firstCampaign = null;
      let affiliateId = null;

      if (activityBooking) {
        firstCampaign = activityBooking.first_campaign;
        affiliateId = activityBooking.affiliate_id;

        console.log(`\n   🎯 GTM Campaign Attribution:`);
        console.log(`      first_campaign: ${firstCampaign || 'N/A'}`);
        console.log(`      affiliate_id: ${affiliateId || 'N/A'}`);
      } else {
        console.log(`\n   ⚠️  Activity not found in DB yet - GTM attribution will be empty`);
        console.log(`      (Will be populated when GTM webhook arrives)`);
      }

      // Calculate discount amounts
      let originalPrice = bookingData.totalPrice;
      let discountedPrice = bookingData.totalPrice;
      let discountAmount = 0;

      if (bookingData.pricingCategoryBookings && bookingData.pricingCategoryBookings.length > 0) {
        const totalBeforeDiscount = bookingData.pricingCategoryBookings.reduce(
          (sum: number, pcb: any) => sum + (pcb.total || 0),
          0
        );
        const totalAfterDiscount = bookingData.pricingCategoryBookings.reduce(
          (sum: number, pcb: any) => sum + (pcb.totalDiscounted || pcb.total || 0),
          0
        );

        if (totalBeforeDiscount > 0) {
          originalPrice = totalBeforeDiscount;
          discountedPrice = totalAfterDiscount;
          discountAmount = originalPrice - discountedPrice;

          console.log(`\n   💰 Pricing:`);
          console.log(`      Original: €${originalPrice.toFixed(2)}`);
          console.log(`      Discounted: €${discountedPrice.toFixed(2)}`);
          console.log(`      Saved: €${discountAmount.toFixed(2)}`);
        }
      }

      // Track the coupon
      await this.trackCoupon({
        promoCodeId: promoCode.id,
        promoCode: promoCode.code,
        promoCodeDescription: promoCode.description,
        bookingId: parentBookingId,
        confirmationCode: confirmationCode,
        firstCampaign: firstCampaign,
        affiliateId: affiliateId,
        activityBookingId: bookingData.bookingId,
        productId: bookingData.productId || bookingData.product?.id,
        productTitle: bookingData.title,
        discountAmount: discountAmount,
        originalPrice: originalPrice,
        discountedPrice: discountedPrice,
        currency: bookingData.currency || 'EUR',
        webhookType: webhookType,
        rawPromoData: promoCode
      });

      console.log(`✅ Coupon processing completed`);

    } catch (error) {
      console.error('❌ Error processing webhook coupons:', error);
      // Don't throw - coupon tracking failure shouldn't break booking processing
    }
  }

  /**
   * Get all promotions for a booking
   */
  async getBookingPromotions(bookingId: number): Promise<any[]> {
    const { data, error } = await supabase
      .from('booking_promotions')
      .select('*')
      .eq('booking_id', bookingId)
      .order('activity_sequence_in_offer', { ascending: true });

    if (error) {
      console.error('Error fetching booking promotions:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Get promotion statistics for an offer
   */
  async getOfferStats(offerId: number): Promise<any> {
    const { data, error } = await supabase
      .from('v_promotion_summary')
      .select('*')
      .eq('offer_id', offerId)
      .single();

    if (error) {
      console.error('Error fetching offer stats:', error);
      return null;
    }

    return data;
  }
}
