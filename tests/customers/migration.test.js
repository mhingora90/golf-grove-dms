import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devClient } from './helpers.js';

test('customers table exists with required columns', async () => {
  const db = devClient();
  // Probe by selecting the column set; this returns the empty rowset on success.
  const { error } = await db
    .from('customers')
    .select('id,name,phone,email,nationality,created_at,updated_at,created_by')
    .limit(0);
  assert.equal(error, null);
});

test('unit_sale_customers junction enforces single primary per sale', async () => {
  const db = devClient();
  const { data: u } = await db.from('units').insert({
    unit_no: 'TEST-J1', project_id: '00000000-0000-0000-0000-000000000001',
    floor: 1, unit_type: 'Studio', area_sqft: 400, listed_price: 500000
  }).select('id').single();
  const { data: s } = await db.from('unit_sales').insert({
    unit_id: u.id, status: 'reserved'
  }).select('id').single();
  const { data: c1 } = await db.from('customers').insert({ name: 'Joint A' }).select('id').single();
  const { data: c2 } = await db.from('customers').insert({ name: 'Joint B' }).select('id').single();

  const { error: e1 } = await db.from('unit_sale_customers').insert({
    unit_sale_id: s.id, customer_id: c1.id, is_primary: true
  });
  assert.equal(e1, null);

  const { error: e2 } = await db.from('unit_sale_customers').insert({
    unit_sale_id: s.id, customer_id: c2.id, is_primary: true
  });
  assert.ok(e2, 'expected unique violation for second primary');

  await db.from('unit_sales').delete().eq('id', s.id);
  await db.from('units').delete().eq('id', u.id);
  await db.from('customers').delete().in('id', [c1.id, c2.id]);
});
