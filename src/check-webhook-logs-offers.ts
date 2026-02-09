import { supabase } from './config/supabase';
import { getFullPayload } from './services/payloadStorage';
import dotenv from 'dotenv';

dotenv.config();

async function checkWebhookLogsForOffers(): Promise<void> {
  console.log('🔍 Checking webhook_logs for offers...\n');

  // Check date range of logs
  const { data: dateRange } = await supabase
    .from('webhook_logs')
    .select('received_at')
    .order('received_at', { ascending: true })
    .limit(1);

  const { data: latestDate } = await supabase
    .from('webhook_logs')
    .select('received_at')
    .order('received_at', { ascending: false })
    .limit(1);

  console.log('📅 Webhook logs date range:');
  console.log(`   First: ${dateRange?.[0]?.received_at || 'N/A'}`);
  console.log(`   Last: ${latestDate?.[0]?.received_at || 'N/A'}`);

  // Count total logs
  const { count: totalLogs } = await supabase
    .from('webhook_logs')
    .select('id', { count: 'exact', head: true });

  console.log(`\n📊 Total webhook logs: ${totalLogs}`);

  // Sample a few recent webhooks to check structure
  console.log('\n🔍 Sampling recent webhooks to check for offers...\n');

  const { data: samples } = await supabase
    .from('webhook_logs')
    .select('id, confirmation_code, raw_payload, payload_storage_key')
    .eq('webhook_type', 'BOOKING')
    .order('received_at', { ascending: false })
    .limit(10);

  if (samples) {
    for (const sample of samples) {
      const fullPayload = await getFullPayload(sample);
      const parentBooking = fullPayload?.parentBooking;
      const offers = parentBooking?.offers;
      const hasOffers = offers && Array.isArray(offers) && offers.length > 0;

      console.log(`${sample.confirmation_code}: offers=${hasOffers ? offers.length : 'none'}`);

      if (hasOffers) {
        console.log(`   Offers: ${JSON.stringify(offers.map((o: any) => ({ id: o.id, discount: o.discount })))}`);
      }
    }
  }

  // Try to find ANY webhook with offers using raw SQL via RPC
  console.log('\n🔍 Searching for webhooks with offers...');

  // Check a broader sample
  const { data: broadSample } = await supabase
    .from('webhook_logs')
    .select('confirmation_code, raw_payload, payload_storage_key')
    .eq('webhook_type', 'BOOKING')
    .limit(100);

  let foundWithOffers = 0;
  if (broadSample) {
    for (const row of broadSample) {
      const fullPayload = await getFullPayload(row);
      const offers = fullPayload?.parentBooking?.offers;
      if (offers && Array.isArray(offers) && offers.length > 0) {
        foundWithOffers++;
        console.log(`   ✅ ${row.confirmation_code} has ${offers.length} offer(s)`);
      }
    }
  }

  console.log(`\n📊 Found ${foundWithOffers} webhooks with offers in sample of ${broadSample?.length || 0}`);
}

checkWebhookLogsForOffers()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
