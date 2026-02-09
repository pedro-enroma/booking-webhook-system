import { supabase } from './config/supabase';
import { getFullPayload } from './services/payloadStorage';
import dotenv from 'dotenv';

dotenv.config();

async function inspectOfferUsage(): Promise<void> {
  console.log('🔍 Inspecting offerUsage field...\n');

  // Get webhooks with offerUsage
  const { data: samples } = await supabase
    .from('webhook_logs')
    .select('confirmation_code, raw_payload, payload_storage_key')
    .eq('webhook_type', 'BOOKING')
    .order('received_at', { ascending: false })
    .limit(1000);

  if (!samples) {
    console.log('No samples found');
    return;
  }

  let found = 0;
  const offerIds = new Set<number>();

  for (const sample of samples) {
    const payload = await getFullPayload(sample);
    const offerUsage = payload?.offerUsage;

    if (offerUsage) {
      found++;
      console.log(`\n📦 ${sample.confirmation_code}`);
      console.log(`   offerUsage: ${JSON.stringify(offerUsage, null, 2)}`);

      if (offerUsage.offerId) {
        offerIds.add(offerUsage.offerId);
      }

      if (found >= 5) break; // Show first 5
    }
  }

  console.log(`\n📊 Found ${found} webhooks with offerUsage`);
  console.log(`📊 Unique offer IDs: ${Array.from(offerIds).join(', ')}`);
}

inspectOfferUsage()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
