import { supabase } from './config/supabase';
import { getFullPayload } from './services/payloadStorage';
import dotenv from 'dotenv';

dotenv.config();

async function inspectWebhookPayload(): Promise<void> {
  console.log('🔍 Inspecting webhook payload structure...\n');

  // Get a sample webhook
  const { data: sample } = await supabase
    .from('webhook_logs')
    .select('confirmation_code, raw_payload, payload_storage_key')
    .eq('webhook_type', 'BOOKING')
    .limit(1)
    .single();

  if (!sample) {
    console.log('No webhooks found');
    return;
  }

  const fullPayload = await getFullPayload(sample);

  console.log('📦 Sample webhook:', sample.confirmation_code);
  console.log('\n📋 Top-level keys:', Object.keys(fullPayload));

  const parentBooking = fullPayload?.parentBooking;
  if (parentBooking) {
    console.log('\n📋 parentBooking keys:', Object.keys(parentBooking));
    console.log('\n📋 parentBooking.offers:', parentBooking.offers);
    console.log('📋 parentBooking.invoice:', parentBooking.invoice ? Object.keys(parentBooking.invoice) : 'N/A');
  }

  // Check for discountAmount at activity level
  console.log('\n📋 Activity-level discount fields:');
  console.log('   discountAmount:', fullPayload.discountAmount);
  console.log('   discountPercentage:', fullPayload.discountPercentage);
  console.log('   priceWithDiscount:', fullPayload.priceWithDiscount);
  console.log('   totalPrice:', fullPayload.totalPrice);

  // Print full parentBooking for inspection (first 3000 chars)
  console.log('\n📄 Full parentBooking structure (truncated):');
  console.log(JSON.stringify(parentBooking, null, 2).substring(0, 3000));
}

inspectWebhookPayload()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
