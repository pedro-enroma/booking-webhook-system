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
   * Uses activityData.offerUsage which contains {id, offerId, discount}
   * @param parentBooking - The root booking object
   * @param activityData - The current activity being processed (contains offerUsage)
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
      // Check for offerUsage at the ACTIVITY level (not parentBooking.offers)
      const offerUsage = activityData?.offerUsage;

      if (!offerUsage || !offerUsage.offerId) {
        console.log('   📊 No offer applied to this activity');
        return;
      }

      console.log(`\n🎁 PROMOTION DETECTION`);
      console.log(`   🎯 Offer ID: ${offerUsage.offerId}`);
      console.log(`      Discount: ${offerUsage.discount}%`);
      console.log(`      Usage ID: ${offerUsage.id}`);

      // Get current activity info
      const currentActivityBookingId = activityData.bookingId;
      const currentProductId = activityData.productId || activityData.product?.id;
      const currentProductTitle = activityData.title;

      // Check if this is part of a multi-activity offer
      const { data: existingPromotions } = await supabase
        .from('booking_promotions')
        .select('activity_booking_id, product_id, product_title')
        .eq('booking_id', parentBookingId)
        .eq('offer_id', offerUsage.offerId)
        .order('created_at', { ascending: true });

      let firstActivityInfo = null;
      let activitySequence = 1;
      let isMultiActivity = false;

      if (existingPromotions && existingPromotions.length > 0) {
        // This is a subsequent activity in a multi-activity offer
        isMultiActivity = true;
        firstActivityInfo = {
          bookingId: existingPromotions[0].activity_booking_id,
          productId: existingPromotions[0].product_id,
          title: existingPromotions[0].product_title
        };
        activitySequence = existingPromotions.length + 1;

        console.log(`      📋 Multi-activity offer - Activity #${activitySequence}`);
        console.log(`      📌 First activity was: ${firstActivityInfo.title}`);
      }

      // Calculate pricing from activity data
      const originalPrice = activityData.totalPrice || 0;
      const discountedPrice = activityData.priceWithDiscount || activityData.totalPrice || 0;
      const discountAmount = activityData.discountAmount || (originalPrice - discountedPrice);

      console.log(`      💰 Pricing: €${originalPrice} → €${discountedPrice} (saved €${discountAmount.toFixed(2)})`);

      // Track the promotion
      await this.trackPromotion({
        offerId: offerUsage.offerId,
        offerOwnerId: undefined, // Not available in offerUsage
        discountPercentage: offerUsage.discount || activityData.discountPercentage || 0,
        bookingId: parentBookingId,
        confirmationCode: confirmationCode,
        activityBookingId: currentActivityBookingId,
        productId: currentProductId,
        productTitle: currentProductTitle,
        isMultiActivityOffer: isMultiActivity,
        totalActivitiesInOffer: activitySequence, // Will be updated as more activities come in
        firstActivityBookingId: firstActivityInfo?.bookingId || currentActivityBookingId,
        firstActivityProductId: firstActivityInfo?.productId || currentProductId,
        firstActivityTitle: firstActivityInfo?.title || currentProductTitle,
        activitySequenceInOffer: activitySequence,
        originalPrice: originalPrice,
        discountedPrice: discountedPrice,
        discountAmount: discountAmount,
        currency: activityData.currency || 'EUR',
        webhookType: webhookType,
        rawOfferData: offerUsage
      });

      // Update multi-activity count for previous records if this is part of multi-activity
      if (isMultiActivity && existingPromotions) {
        await supabase
          .from('booking_promotions')
          .update({
            is_multi_activity_offer: true,
            total_activities_in_offer: activitySequence
          })
          .eq('booking_id', parentBookingId)
          .eq('offer_id', offerUsage.offerId);
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

      // Look up coupon-to-affiliate rule
      const { data: affiliateRule } = await supabase
        .from('coupon_affiliate_rules')
        .select('affiliate_id, coupon_code')
        .eq('coupon_code', promoCode.code.toUpperCase())
        .eq('is_active', true)
        .single();

      if (affiliateRule) {
        console.log(`\n   🔗 COUPON-AFFILIATE RULE MATCH`);
        console.log(`      Coupon "${promoCode.code}" → affiliate "${affiliateRule.affiliate_id}"`);

        // Update ALL activity_bookings for this parent booking with coupon-based affiliate
        const { error: affiliateUpdateError, count } = await supabase
          .from('activity_bookings')
          .update({
            affiliate_id: affiliateRule.affiliate_id,
            affiliate_source: 'coupon'
          })
          .eq('booking_id', parentBookingId);

        if (affiliateUpdateError) {
          console.error('❌ Error setting coupon-based affiliate:', affiliateUpdateError);
        } else {
          console.log(`      ✅ Updated ${count ?? '?'} activity booking(s) with affiliate "${affiliateRule.affiliate_id}"`);
        }
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
