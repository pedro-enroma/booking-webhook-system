const fs = require('fs');
const path = require('path');

console.log('📂 Extracting activity_booking_ids from Excel data...\n');

try {
  const jsonPath = path.join(__dirname, 'All_Offers_data.json');
  const fileContent = fs.readFileSync(jsonPath, 'utf-8');
  const offers = JSON.parse(fileContent);

  console.log(`📊 Total offers in Excel: ${offers.length}\n`);

  // Extract activity_booking_ids
  const activityBookingIds = [];
  const details = [];

  offers.forEach(offer => {
    const code = offer['Product confirmation code'];
    if (code && typeof code === 'string' && code.startsWith('ENRO-T')) {
      const idStr = code.replace('ENRO-T', '');
      const id = parseInt(idStr);
      if (!isNaN(id)) {
        activityBookingIds.push(id);
        details.push({
          activity_booking_id: id,
          product_confirmation_code: code,
          cart_confirmation_code: offer['Cart confirmation code'],
          customer: offer.Customer,
          email: offer.Email,
          product_id: offer['Product ID'],
          product_title: offer['Product title'],
          start_date: offer['Start date'],
          status: offer.Status,
          total_price: offer['Total price with discount'],
          currency: offer['Sale currency'],
          seller: offer.Seller
        });
      }
    }
  });

  console.log(`✅ Extracted ${activityBookingIds.length} activity_booking_ids\n`);
  console.log('Sample IDs:');
  activityBookingIds.slice(0, 20).forEach(id => console.log(`   - ${id}`));
  console.log('');

  // Save IDs to file
  const idsFile = path.join(__dirname, 'activity_booking_ids.json');
  fs.writeFileSync(idsFile, JSON.stringify(activityBookingIds, null, 2));
  console.log(`📄 IDs saved to: ${idsFile}`);

  // Save details
  const detailsFile = path.join(__dirname, 'activity_booking_details.json');
  fs.writeFileSync(detailsFile, JSON.stringify(details, null, 2));
  console.log(`📄 Details saved to: ${detailsFile}`);

  console.log('\n✅ Extraction complete!');
  process.exit(0);

} catch (error) {
  console.error('❌ Error:', error);
  process.exit(1);
}
