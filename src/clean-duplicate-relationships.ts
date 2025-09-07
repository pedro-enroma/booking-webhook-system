import { supabase } from './config/supabase';

async function cleanDuplicateRelationships() {
  console.log('🧹 Cleaning Duplicate Booking-Customer Relationships');
  console.log('=' .repeat(70));
  
  // First, get all relationships
  console.log('📊 Fetching all relationships...');
  const { data: allRelationships, error } = await supabase
    .from('booking_customers')
    .select('id, booking_id, customer_id, created_at')
    .order('created_at', { ascending: true });
  
  if (error) {
    console.error('Error fetching relationships:', error);
    return;
  }
  
  console.log(`   Found ${allRelationships?.length || 0} total relationships`);
  
  // Group by booking_id and customer_id to find duplicates
  const uniqueMap = new Map<string, any[]>();
  
  allRelationships?.forEach(rel => {
    const key = `${rel.booking_id}_${rel.customer_id}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, []);
    }
    uniqueMap.get(key)!.push(rel);
  });
  
  // Find duplicates
  const duplicatesToDelete: number[] = [];
  let duplicateGroups = 0;
  
  uniqueMap.forEach((relationships, key) => {
    if (relationships.length > 1) {
      duplicateGroups++;
      // Keep the first one, delete the rest
      for (let i = 1; i < relationships.length; i++) {
        duplicatesToDelete.push(relationships[i].id);
      }
    }
  });
  
  console.log(`\n📊 Analysis:`);
  console.log(`   Unique relationships: ${uniqueMap.size}`);
  console.log(`   Duplicate groups: ${duplicateGroups}`);
  console.log(`   Records to delete: ${duplicatesToDelete.length}`);
  
  if (duplicatesToDelete.length === 0) {
    console.log('\n✅ No duplicates found!');
    return;
  }
  
  // Delete duplicates in batches
  console.log('\n🗑️  Deleting duplicates...');
  const batchSize = 100;
  let deleted = 0;
  
  for (let i = 0; i < duplicatesToDelete.length; i += batchSize) {
    const batch = duplicatesToDelete.slice(i, i + batchSize);
    
    const { error: deleteError } = await supabase
      .from('booking_customers')
      .delete()
      .in('id', batch);
    
    if (deleteError) {
      console.error('Error deleting batch:', deleteError);
      break;
    }
    
    deleted += batch.length;
    process.stdout.write(`   Deleted ${deleted}/${duplicatesToDelete.length} records\r`);
  }
  
  console.log(`\n\n✅ Cleanup complete! Deleted ${deleted} duplicate relationships`);
  
  // Verify
  const { count } = await supabase
    .from('booking_customers')
    .select('*', { count: 'exact', head: true });
  
  console.log(`\n📊 Final count: ${count} relationships`);
}

cleanDuplicateRelationships()
  .then(() => {
    console.log('\n✅ Cleanup completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });