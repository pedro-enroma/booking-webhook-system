const fs = require('fs');

// Read all IDs from Excel
const allIds = JSON.parse(fs.readFileSync('activity_booking_ids.json', 'utf-8'));

// Read found IDs from Supabase
const foundRecords = JSON.parse(fs.readFileSync('found-in-supabase.json', 'utf-8'));
const foundIds = foundRecords.map(r => r.activity_booking_id);

// Find missing
const missingIds = allIds.filter(id => !foundIds.includes(id));

console.log('📊 COMPARISON RESULTS');
console.log('='.repeat(80));
console.log(`Total in Excel: ${allIds.length}`);
console.log(`Found in Supabase: ${foundIds.length}`);
console.log(`Missing in Supabase: ${missingIds.length}`);
console.log('='.repeat(80));

if (missingIds.length > 0) {
  console.log('\n❌ MISSING IDs:');
  console.log(missingIds.join(', '));

  // Save to file
  fs.writeFileSync('missing-ids.json', JSON.stringify(missingIds, null, 2));
  console.log('\n📄 Missing IDs saved to: missing-ids.json');

  // Get details for missing IDs
  const allDetails = JSON.parse(fs.readFileSync('activity_booking_details.json', 'utf-8'));
  const missingDetails = allDetails.filter(d => missingIds.includes(d.activity_booking_id));

  fs.writeFileSync('missing-details.json', JSON.stringify(missingDetails, null, 2));
  console.log('📄 Missing details saved to: missing-details.json');

  console.log('\n📋 First 10 missing records:');
  missingDetails.slice(0, 10).forEach((d, idx) => {
    console.log(`\n${idx + 1}. ID: ${d.activity_booking_id}`);
    console.log(`   Confirmation: ${d.product_confirmation_code}`);
    console.log(`   Cart: ${d.cart_confirmation_code}`);
    console.log(`   Product: ${d.product_title}`);
    console.log(`   Date: ${d.start_date}`);
    console.log(`   Customer: ${d.customer}`);
  });
} else {
  console.log('\n🎉 All IDs are present in Supabase!');
}
