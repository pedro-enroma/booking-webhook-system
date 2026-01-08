import { supabase } from './config/supabase';

async function checkConfig() {
  const { data: config } = await supabase
    .from('partner_solution_config')
    .select('*')
    .single();

  console.log('Current config:');
  console.log(JSON.stringify(config, null, 2));
  console.log('\nColumns:', Object.keys(config || {}));
}

checkConfig().catch(e => console.error(e.message));
