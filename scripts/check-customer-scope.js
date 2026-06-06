const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = 'https://kdxvhrwnnehicgdryowu.supabase.co';
let SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SERVICE_KEY && fs.existsSync('.env.test')) {
  const m = fs.readFileSync('.env.test', 'utf8').match(/SUPABASE_SERVICE_KEY=(\S+)/);
  if (m) SERVICE_KEY = m[1];
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

(async () => {
  const { count: cCount } = await sb.from('customers').select('*', { count: 'exact', head: true });
  console.log('customers total rows:', cCount);

  const { count: uscCount } = await sb.from('unit_sale_customers').select('*', { count: 'exact', head: true });
  console.log('unit_sale_customers total rows:', uscCount);

  const { count: usCount } = await sb.from('unit_sales').select('*', { count: 'exact', head: true });
  console.log('unit_sales total rows:', usCount);

  const { count: usWithBuyer } = await sb.from('unit_sales').select('*', { count: 'exact', head: true }).not('buyer_name', 'is', null);
  console.log('unit_sales with buyer_name:', usWithBuyer);

  // Sample 5 customers
  const { data: sample, error: e1 } = await sb.from('customers').select('id, name').limit(10);
  if (e1) console.log('err:', e1.message);
  console.log('\nfirst 10 customers:');
  (sample || []).forEach(c => console.log(' ', c.name));

  // Per project, count linked customers via straightforward joins
  const { data: projects } = await sb.from('projects').select('id, name').order('name');
  for (const p of projects) {
    const { data: usForProj } = await sb.from('unit_sales')
      .select('id, units!inner(project_id)')
      .eq('units.project_id', p.id);
    const saleIds = (usForProj || []).map(s => s.id);
    if (!saleIds.length) { console.log(`\n${p.name}: no sales`); continue; }
    const { data: links } = await sb.from('unit_sale_customers')
      .select('customer_id')
      .in('unit_sale_id', saleIds);
    const custIds = [...new Set((links || []).map(l => l.customer_id))];
    const { data: custs } = await sb.from('customers').select('name').in('id', custIds).order('name');
    console.log(`\n${p.name}: ${custs?.length || 0} linked customers (via ${saleIds.length} sales, ${links?.length || 0} junction rows)`);
    (custs || []).slice(0, 8).forEach(c => console.log('  -', c.name));
    if ((custs || []).length > 8) console.log(`  …and ${custs.length - 8} more`);
  }
})();
