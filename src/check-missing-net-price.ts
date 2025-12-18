import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

async function check() {
  // Check date range of records without net_price
  const { data: oldest } = await supabase
    .from('activity_bookings')
    .select('created_at')
    .is('net_price', null)
    .order('created_at', { ascending: true })
    .limit(1);

  const { data: newest } = await supabase
    .from('activity_bookings')
    .select('created_at')
    .is('net_price', null)
    .order('created_at', { ascending: false })
    .limit(1);

  console.log('=== DATE RANGE OF RECORDS WITHOUT NET_PRICE ===');
  console.log('Oldest:', oldest?.[0]?.created_at);
  console.log('Newest:', newest?.[0]?.created_at);

  // Check by seller
  const { data: bySeller } = await supabase
    .from('activity_bookings')
    .select('activity_seller')
    .is('net_price', null);

  const sellerCounts: Record<string, number> = {};
  bySeller?.forEach(r => {
    const seller = r.activity_seller || '(null)';
    sellerCounts[seller] = (sellerCounts[seller] || 0) + 1;
  });

  console.log('\n=== BY SELLER (without net_price) ===');
  Object.entries(sellerCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([seller, count]) => console.log(`${seller}: ${count}`));

  // Check a sample of recent ones
  const { data: sample } = await supabase
    .from('activity_bookings')
    .select('activity_booking_id, booking_id, created_at, original_price, total_price, activity_seller')
    .is('net_price', null)
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('\n=== SAMPLE (5 MOST RECENT WITHOUT NET_PRICE) ===');
  sample?.forEach(r => console.log(r));
}

check().catch(console.error);
