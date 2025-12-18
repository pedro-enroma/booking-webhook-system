import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyData() {
  // Check a sample with commission
  const { data: withCommission } = await supabase
    .from('activity_bookings')
    .select('activity_booking_id, original_price, total_price, commission_percentage, commission_amount, net_price, activity_seller')
    .not('commission_percentage', 'is', null)
    .gt('commission_percentage', 0)
    .limit(5);

  console.log('=== RECORDS WITH COMMISSION ===');
  withCommission?.forEach(r => {
    console.log(`ID: ${r.activity_booking_id}, Seller: ${r.activity_seller}`);
    console.log(`  original: ${r.original_price}, total: ${r.total_price}, commission: ${r.commission_percentage}%, commission_amt: ${r.commission_amount}, net: ${r.net_price}`);
  });

  // Check a sample with discount
  const { data: withDiscount } = await supabase
    .from('activity_bookings')
    .select('activity_booking_id, original_price, total_price, discount_percentage, discount_amount, net_price, activity_seller')
    .not('discount_percentage', 'is', null)
    .gt('discount_percentage', 0)
    .limit(5);

  console.log('\n=== RECORDS WITH DISCOUNT ===');
  withDiscount?.forEach(r => {
    console.log(`ID: ${r.activity_booking_id}, Seller: ${r.activity_seller}`);
    console.log(`  original: ${r.original_price}, total: ${r.total_price}, discount: ${r.discount_percentage}%, discount_amt: ${r.discount_amount}, net: ${r.net_price}`);
  });

  // Verify the math is correct for one record
  const { data: sample } = await supabase
    .from('activity_bookings')
    .select('*')
    .eq('activity_booking_id', 112385168)
    .single();

  console.log('\n=== VERIFY MATH FOR ID 112385168 ===');
  if (sample) {
    console.log(`Original: ${sample.original_price}`);
    console.log(`Total: ${sample.total_price}`);
    console.log(`Discount %: ${sample.discount_percentage}%`);
    console.log(`Discount Amount: ${sample.discount_amount}`);
    console.log(`Commission %: ${sample.commission_percentage}%`);
    console.log(`Commission Amount: ${sample.commission_amount}`);
    console.log(`Net: ${sample.net_price}`);

    // Verify:
    const expectedTotal = sample.original_price - (sample.discount_amount || 0);
    const expectedNet = (sample.total_price || sample.original_price) - (sample.commission_amount || 0);
    console.log(`\nExpected total (orig - discount): ${expectedTotal.toFixed(2)}`);
    console.log(`Expected net (total - commission): ${expectedNet.toFixed(2)}`);
  }

  // Check how many records have each type of pricing
  const { count: totalRecords } = await supabase
    .from('activity_bookings')
    .select('*', { count: 'exact', head: true });

  const { count: withCommissionCount } = await supabase
    .from('activity_bookings')
    .select('*', { count: 'exact', head: true })
    .not('commission_percentage', 'is', null)
    .gt('commission_percentage', 0);

  const { count: withDiscountCount } = await supabase
    .from('activity_bookings')
    .select('*', { count: 'exact', head: true })
    .not('discount_percentage', 'is', null)
    .gt('discount_percentage', 0);

  const { count: withNetPriceCount } = await supabase
    .from('activity_bookings')
    .select('*', { count: 'exact', head: true })
    .not('net_price', 'is', null);

  console.log('\n=== SUMMARY STATISTICS ===');
  console.log(`Total activity_bookings: ${totalRecords}`);
  console.log(`Records with commission_percentage: ${withCommissionCount}`);
  console.log(`Records with discount_percentage: ${withDiscountCount}`);
  console.log(`Records with net_price: ${withNetPriceCount}`);
}

verifyData()
  .then(() => console.log('\nVerification complete!'))
  .catch(console.error);
