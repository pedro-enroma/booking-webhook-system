import { supabase } from './config/supabase';
import { getFullPayload } from './services/payloadStorage';
import dotenv from 'dotenv';

dotenv.config();

async function findWebhooksWithDiscounts(): Promise<void> {
  console.log('🔍 Finding webhooks with discounts...\n');

  // Get webhooks where discountAmount > 0
  const { data: samples } = await supabase
    .from('webhook_logs')
    .select('confirmation_code, raw_payload, payload_storage_key')
    .eq('webhook_type', 'BOOKING')
    .order('received_at', { ascending: false })
    .limit(500);

  if (!samples) {
    console.log('No samples found');
    return;
  }

  let withDiscount = 0;
  let withOfferApplied = 0;

  for (const sample of samples) {
    const payload = await getFullPayload(sample);
    const discountAmount = payload?.discountAmount || 0;
    const offerApplied = payload?.offerApplied;

    if (discountAmount > 0 || offerApplied) {
      withDiscount++;
      console.log(`\n📦 ${sample.confirmation_code}`);
      console.log(`   discountAmount: ${discountAmount}`);
      console.log(`   discountPercentage: ${payload?.discountPercentage}`);
      console.log(`   offerApplied: ${JSON.stringify(offerApplied)}`);
      console.log(`   totalPrice: ${payload?.totalPrice}`);
      console.log(`   priceWithDiscount: ${payload?.priceWithDiscount}`);

      // Check parentBooking for offers
      const parentOffers = payload?.parentBooking?.offers;
      console.log(`   parentBooking.offers: ${JSON.stringify(parentOffers)}`);

      // Check for any "offer" related keys
      const offerKeys = Object.keys(payload).filter(k => k.toLowerCase().includes('offer'));
      console.log(`   offer-related keys: ${JSON.stringify(offerKeys)}`);

      if (offerApplied) withOfferApplied++;

      if (withDiscount >= 10) break; // Show first 10
    }
  }

  console.log(`\n📊 Summary (from ${samples.length} webhooks):`);
  console.log(`   With discount: ${withDiscount}`);
  console.log(`   With offerApplied: ${withOfferApplied}`);
}

findWebhooksWithDiscounts()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
