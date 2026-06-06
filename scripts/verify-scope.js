const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const URL = 'https://kdxvhrwnnehicgdryowu.supabase.co';
const m = fs.readFileSync('.env.test','utf8').match(/SUPABASE_SERVICE_KEY=(\S+)/);
const sb = createClient(URL, m[1], { auth: { persistSession: false } });
(async () => {
  const { data: projs } = await sb.from('projects').select('id,name').order('name');
  for (const p of projs) {
    const { count } = await sb.from('customers').select('*',{count:'exact',head:true}).eq('project_id', p.id);
    console.log(`${p.name}: ${count} customers with project_id`);
  }
  const { count: nulls } = await sb.from('customers').select('*',{count:'exact',head:true}).is('project_id', null);
  console.log(`unassigned (null): ${nulls}`);
})();
