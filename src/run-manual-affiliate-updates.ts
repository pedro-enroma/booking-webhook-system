import { supabase } from './config/supabase';
import * as fs from 'fs';
import * as path from 'path';

interface UpdateRecord {
  booking_id: number;
  affiliate_id: string;
  first_campaign: string | null;
}

async function runManualAffiliateUpdates() {
  console.log('🚀 Starting manual affiliate updates...');
  console.log('=' .repeat(70));
  
  // Define all updates
  const updates: UpdateRecord[] = [
    // visitasroma with (not set) campaign
    { booking_id: 66267020, affiliate_id: 'visitasroma', first_campaign: null },
    { booking_id: 67832160, affiliate_id: 'visitasroma', first_campaign: null },
    { booking_id: 67978880, affiliate_id: 'visitasroma', first_campaign: null },
    { booking_id: 68152343, affiliate_id: 'visitasroma', first_campaign: null },
    { booking_id: 69186625, affiliate_id: 'visitasroma', first_campaign: null },
    { booking_id: 69929208, affiliate_id: 'visitasroma', first_campaign: null },
    { booking_id: 70128174, affiliate_id: 'visitasroma', first_campaign: null },
    { booking_id: 71739382, affiliate_id: 'visitasroma', first_campaign: null },
    { booking_id: 71466533, affiliate_id: 'visitasroma', first_campaign: 'enroma-banners' },
    
    // mirian-valverde with (not set) campaign
    { booking_id: 68860076, affiliate_id: 'mirian-valverde', first_campaign: null },
    { booking_id: 72735139, affiliate_id: 'mirian-valverde', first_campaign: null },
    { booking_id: 72920681, affiliate_id: 'mirian-valverde', first_campaign: null },
    { booking_id: 73175471, affiliate_id: 'mirian-valverde', first_campaign: null },
    
    // losviajesdeclaudia
    { booking_id: 67114538, affiliate_id: 'losviajesdeclaudia', first_campaign: 'colis' },
    
    // viajeroscallejeros with coliseo-romano
    { booking_id: 67007642, affiliate_id: 'viajeroscallejeros', first_campaign: 'coliseo-romano' },
    { booking_id: 67857673, affiliate_id: 'viajeroscallejeros', first_campaign: 'coliseo-romano' },
    { booking_id: 68851134, affiliate_id: 'viajeroscallejeros', first_campaign: 'coliseo-romano' },
    { booking_id: 68856824, affiliate_id: 'viajeroscallejeros', first_campaign: 'coliseo-romano' },
    { booking_id: 69319744, affiliate_id: 'viajeroscallejeros', first_campaign: 'coliseo-romano' },
    { booking_id: 71759863, affiliate_id: 'viajeroscallejeros', first_campaign: 'coliseo-romano' },
    { booking_id: 73130418, affiliate_id: 'viajeroscallejeros', first_campaign: 'coliseo-romano' },
    { booking_id: 73197435, affiliate_id: 'viajeroscallejeros', first_campaign: 'coliseo-romano' },
    { booking_id: 73201768, affiliate_id: 'viajeroscallejeros', first_campaign: 'coliseo-romano' },
    
    // audioguiaroma with enroma
    { booking_id: 68840518, affiliate_id: 'audioguiaroma', first_campaign: 'enroma' },
    { booking_id: 71026252, affiliate_id: 'audioguiaroma', first_campaign: 'enroma' },
    { booking_id: 71362654, affiliate_id: 'audioguiaroma', first_campaign: 'enroma' },
    
    // cometeelmundo with various campaigns
    { booking_id: 70959104, affiliate_id: 'cometeelmundo', first_campaign: 'g-cj0kcqjwndhebhdvarisagh0g3dduawjyg' },
    { booking_id: 70959657, affiliate_id: 'cometeelmundo', first_campaign: 'g-cj0kcqjwndhebhdvarisagh0g3dduawjyg' },
    { booking_id: 73166464, affiliate_id: 'cometeelmundo', first_campaign: 'g-cj0kcqjwqqdfbhdharisaihtlkvs8tyxaj' },
    { booking_id: 73123047, affiliate_id: 'cometeelmundo', first_campaign: 'g-cjwkcajwq9rfbhaieiwagvazp8w14dzuab' },
    { booking_id: 73214048, affiliate_id: 'cometeelmundo', first_campaign: 'g-eaiaiqobchmiyeyo5euojwmvssh5bb2x4r' },
    { booking_id: 66652500, affiliate_id: 'cometeelmundo', first_campaign: 'visitar-el-vaticano-sin-colas-block' },
  ];
  
  let successCount = 0;
  let errorCount = 0;
  const errors: any[] = [];
  
  // Group updates by affiliate for better logging
  const groupedUpdates = updates.reduce((acc, update) => {
    if (!acc[update.affiliate_id]) {
      acc[update.affiliate_id] = [];
    }
    acc[update.affiliate_id].push(update);
    return acc;
  }, {} as Record<string, UpdateRecord[]>);
  
  // Process updates by affiliate group
  for (const [affiliate, affiliateUpdates] of Object.entries(groupedUpdates)) {
    console.log(`\n📦 Processing ${affiliate} (${affiliateUpdates.length} bookings)...`);
    
    for (const update of affiliateUpdates) {
      try {
        // Update each booking
        const { error } = await supabase
          .from('activity_bookings')
          .update({
            affiliate_id: update.affiliate_id,
            first_campaign: update.first_campaign
          })
          .eq('booking_id', update.booking_id);
        
        if (error) {
          throw error;
        }
        
        successCount++;
        console.log(`  ✅ Updated booking ${update.booking_id} - campaign: ${update.first_campaign || '(not set)'}`);
        
      } catch (error: any) {
        errorCount++;
        errors.push({ booking_id: update.booking_id, error: error.message });
        console.error(`  ❌ Failed to update booking ${update.booking_id}:`, error.message);
      }
    }
  }
  
  // Summary
  console.log('\n' + '=' .repeat(70));
  console.log('📊 Update Summary:');
  console.log(`  ✅ Successful updates: ${successCount}`);
  console.log(`  ❌ Failed updates: ${errorCount}`);
  
  if (errors.length > 0) {
    console.log('\n❌ Errors:');
    errors.forEach(e => {
      console.log(`  - Booking ${e.booking_id}: ${e.error}`);
    });
  }
  
  // Verify updates
  console.log('\n🔍 Verifying updates...');
  
  const bookingIds = updates.map(u => u.booking_id);
  const { data: verifyData, error: verifyError } = await supabase
    .from('activity_bookings')
    .select('booking_id, affiliate_id, first_campaign, product_title')
    .in('booking_id', bookingIds)
    .order('affiliate_id', { ascending: true })
    .order('booking_id', { ascending: true });
  
  if (verifyError) {
    console.error('❌ Error verifying updates:', verifyError);
  } else if (verifyData) {
    console.log(`\n✅ Verified ${verifyData.length} bookings updated successfully`);
    
    // Show sample of updates by affiliate
    const affiliateSummary: Record<string, number> = {};
    verifyData.forEach(row => {
      if (row.affiliate_id) {
        affiliateSummary[row.affiliate_id] = (affiliateSummary[row.affiliate_id] || 0) + 1;
      }
    });
    
    console.log('\n📊 Updates by affiliate:');
    Object.entries(affiliateSummary).forEach(([affiliate, count]) => {
      console.log(`  - ${affiliate}: ${count} bookings`);
    });
  }
  
  console.log('\n' + '=' .repeat(70));
  console.log('✅ Manual affiliate updates completed!');
}

// Run the updates
runManualAffiliateUpdates().catch(console.error);