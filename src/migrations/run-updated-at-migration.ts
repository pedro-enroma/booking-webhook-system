import { supabase } from '../config/supabase';

async function addUpdatedAtColumn() {
  console.log('🔧 Adding updated_at column to customers table');
  console.log('=' .repeat(70));
  
  try {
    // Since we can't run raw SQL directly through Supabase client,
    // let's check if the column exists first
    console.log('📊 Checking current customers table structure...');
    
    const { data: sample, error: sampleError } = await supabase
      .from('customers')
      .select('*')
      .limit(1);
    
    if (sampleError) {
      console.error('❌ Error checking customers table:', sampleError);
      return;
    }
    
    console.log('\n📝 SQL Migration to run in Supabase SQL Editor:');
    console.log('=' .repeat(70));
    
    const migrationSQL = `
-- Add updated_at column to customers table
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Create a trigger to automatically update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop the trigger if it exists and create it
DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at 
    BEFORE UPDATE ON customers 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Update existing rows to have current timestamp
UPDATE customers 
SET updated_at = COALESCE(created_at, CURRENT_TIMESTAMP) 
WHERE updated_at IS NULL;

-- Verify the column was added
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'customers' 
AND column_name = 'updated_at';`;
    
    console.log(migrationSQL);
    console.log('=' .repeat(70));
    
    console.log('\n⚠️  IMPORTANT STEPS:');
    console.log('1. Copy the SQL above');
    console.log('2. Go to Supabase Dashboard > SQL Editor');
    console.log('3. Paste and run the SQL');
    console.log('4. Come back and run: npm run import-customers');
    console.log('\n✅ Migration SQL generated successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the migration
addUpdatedAtColumn().catch(console.error);