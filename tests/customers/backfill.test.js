import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devClient } from './helpers.js';

const PROJECT_241 = '00000000-0000-0000-0000-000000000002';

// Helpers ───────────────────────────────────────────────────────────────────
function uniqUnitNo(tag) {
  return `BF-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

async function seedUnit(db, tag) {
  const { data, error } = await db.from('units').insert({
    unit_no: uniqUnitNo(tag),
    project_id: PROJECT_241,
    floor: 1,
    unit_type: 'Studio',
    area_sqft: 400,
    listed_price: 500000,
  }).select('id').single();
  if (error) throw new Error(`seedUnit(${tag}): ${error.message}`);
  return data.id;
}

async function seedSale(db, unitId, buyerName) {
  const payload = { unit_id: unitId, status: 'reserved' };
  if (buyerName !== undefined) payload.buyer_name = buyerName;
  const { data, error } = await db.from('unit_sales').insert(payload).select('id').single();
  if (error) throw new Error(`seedSale: ${error.message}`);
  return data.id;
}

test('backfill parses buyer_name into customers + junction (primary on first segment, dedup, idempotent)', async (t) => {
  const db = devClient();
  const createdUnitIds = [];
  const createdSaleIds = [];
  const createdCustomerNames = new Set();

  // Tag distinguishes test fixtures so cleanup is targeted.
  const RUN = `BF${Date.now().toString().slice(-6)}`;
  const N = {
    alice:  `Alice Smith ${RUN}`,
    bob:    `Bob Jones ${RUN}`,
    carol:  `Carol Jones ${RUN}`,
    dave:   `Dave Brown ${RUN}`,
    eve:    `Eve Brown ${RUN}`,
    frank:  `Frank Green ${RUN}`,
    grace:  `Grace Green ${RUN}`,
  };
  for (const n of Object.values(N)) createdCustomerNames.add(n);

  t.after(async () => {
    if (createdSaleIds.length) {
      await db.from('unit_sale_customers').delete().in('unit_sale_id', createdSaleIds);
      await db.from('unit_sales').delete().in('id', createdSaleIds);
    }
    if (createdUnitIds.length) await db.from('units').delete().in('id', createdUnitIds);
    if (createdCustomerNames.size) {
      await db.from('customers').delete().in('name', [...createdCustomerNames]);
    }
  });

  // Seed 5 sales with varied buyer_name shapes ─────────────────────────────
  const u1 = await seedUnit(db, 'single');   createdUnitIds.push(u1);
  const u2 = await seedUnit(db, 'amp');      createdUnitIds.push(u2);
  const u3 = await seedUnit(db, 'AND');      createdUnitIds.push(u3);
  const u4 = await seedUnit(db, 'and');      createdUnitIds.push(u4);
  const u5 = await seedUnit(db, 'null');     createdUnitIds.push(u5);

  const s1 = await seedSale(db, u1, N.alice);                              createdSaleIds.push(s1);
  const s2 = await seedSale(db, u2, `${N.bob} & ${N.carol}`);              createdSaleIds.push(s2);
  const s3 = await seedSale(db, u3, `${N.dave} AND ${N.eve}`);             createdSaleIds.push(s3);
  const s4 = await seedSale(db, u4, `${N.frank} and ${N.grace}`);          createdSaleIds.push(s4);
  const s5 = await seedSale(db, u5, undefined);                            createdSaleIds.push(s5);

  // Run backfill ─────────────────────────────────────────────────────────
  const { error: rpcErr } = await db.rpc('run_customer_backfill');
  assert.equal(rpcErr, null, `run_customer_backfill rpc: ${rpcErr?.message}`);

  // Assert single buyer ──────────────────────────────────────────────────
  {
    const { data: rows } = await db.from('unit_sale_customers')
      .select('is_primary, customers(name)').eq('unit_sale_id', s1);
    assert.equal(rows.length, 1, 's1 has one customer');
    assert.equal(rows[0].is_primary, true, 's1 sole customer is primary');
    assert.equal(rows[0].customers.name, N.alice);
  }

  // Assert ampersand split ───────────────────────────────────────────────
  {
    const { data: rows } = await db.from('unit_sale_customers')
      .select('is_primary, customers(name)')
      .eq('unit_sale_id', s2)
      .order('is_primary', { ascending: false });
    assert.equal(rows.length, 2, 's2 has two customers');
    assert.equal(rows[0].is_primary, true);
    assert.equal(rows[0].customers.name, N.bob, 's2 first segment is primary');
    assert.equal(rows[1].customers.name, N.carol);
    assert.equal(rows.filter(r => r.is_primary).length, 1, 's2 exactly one primary');
  }

  // Assert uppercase AND ─────────────────────────────────────────────────
  {
    const { data: rows } = await db.from('unit_sale_customers')
      .select('is_primary, customers(name)')
      .eq('unit_sale_id', s3)
      .order('is_primary', { ascending: false });
    assert.equal(rows.length, 2, 's3 has two customers');
    assert.equal(rows[0].customers.name, N.dave, 's3 first segment is primary');
    assert.equal(rows[1].customers.name, N.eve);
  }

  // Assert lowercase and ─────────────────────────────────────────────────
  {
    const { data: rows } = await db.from('unit_sale_customers')
      .select('is_primary, customers(name)')
      .eq('unit_sale_id', s4)
      .order('is_primary', { ascending: false });
    assert.equal(rows.length, 2, 's4 has two customers');
    assert.equal(rows[0].customers.name, N.frank, 's4 first segment is primary');
    assert.equal(rows[1].customers.name, N.grace);
  }

  // NULL buyer_name → zero junction rows ─────────────────────────────────
  {
    const { data: rows } = await db.from('unit_sale_customers')
      .select('customer_id').eq('unit_sale_id', s5);
    assert.equal(rows.length, 0, 's5 (null buyer_name) untouched');
  }

  // Idempotency: re-running should produce no new rows ───────────────────
  const countBefore = await db.from('unit_sale_customers')
    .select('unit_sale_id', { count: 'exact', head: true })
    .in('unit_sale_id', createdSaleIds);

  const { error: rpcErr2 } = await db.rpc('run_customer_backfill');
  assert.equal(rpcErr2, null, 'second backfill rpc ok');

  const countAfter = await db.from('unit_sale_customers')
    .select('unit_sale_id', { count: 'exact', head: true })
    .in('unit_sale_id', createdSaleIds);
  assert.equal(countAfter.count, countBefore.count, 'idempotent: no new junction rows');

  // Customer dedup by LOWER(TRIM(name)) ──────────────────────────────────
  // We don't have access to lowercase fixture buyer_name in the seeded set,
  // so probe directly: insert another sale with the same buyer (different case)
  // and verify it reuses the existing customer row.
  const u6 = await seedUnit(db, 'dedup');             createdUnitIds.push(u6);
  const s6 = await seedSale(db, u6, N.alice.toLowerCase());  createdSaleIds.push(s6);
  createdCustomerNames.add(N.alice.toLowerCase());

  const { error: rpcErr3 } = await db.rpc('run_customer_backfill');
  assert.equal(rpcErr3, null);

  const { data: aliceRows } = await db.from('customers').select('id').ilike('name', N.alice);
  assert.equal(aliceRows.length, 1, 'customer dedup: only one Alice row exists');

  const { data: s6Rows } = await db.from('unit_sale_customers')
    .select('customer_id, is_primary').eq('unit_sale_id', s6);
  assert.equal(s6Rows.length, 1);
  assert.equal(s6Rows[0].customer_id, aliceRows[0].id, 's6 reuses Alice customer row');
  assert.equal(s6Rows[0].is_primary, true);
});

test('backfill skips unit_sales that already have junction rows (preserve manual links)', async (t) => {
  const db = devClient();
  const RUN = `BFS${Date.now().toString().slice(-6)}`;
  const NAME_MANUAL = `Manual Owner ${RUN}`;
  const NAME_BUYER  = `Auto Buyer ${RUN}`;

  const { data: u, error: uErr } = await db.from('units').insert({
    unit_no: uniqUnitNo('skip'),
    project_id: PROJECT_241,
    floor: 1, unit_type: 'Studio', area_sqft: 400, listed_price: 500000,
  }).select('id').single();
  if (uErr) throw new Error(uErr.message);

  const { data: s } = await db.from('unit_sales').insert({
    unit_id: u.id, status: 'sold', buyer_name: NAME_BUYER,
  }).select('id').single();

  const { data: manualCust } = await db.from('customers')
    .insert({ name: NAME_MANUAL }).select('id').single();
  await db.from('unit_sale_customers').insert({
    unit_sale_id: s.id, customer_id: manualCust.id, is_primary: true,
  });

  t.after(async () => {
    await db.from('unit_sale_customers').delete().eq('unit_sale_id', s.id);
    await db.from('unit_sales').delete().eq('id', s.id);
    await db.from('units').delete().eq('id', u.id);
    await db.from('customers').delete().in('name', [NAME_MANUAL, NAME_BUYER]);
  });

  const { error: rpcErr } = await db.rpc('run_customer_backfill');
  assert.equal(rpcErr, null);

  const { data: rows } = await db.from('unit_sale_customers')
    .select('customer_id, is_primary, customers(name)')
    .eq('unit_sale_id', s.id);
  assert.equal(rows.length, 1, 'manual link preserved, buyer_name not parsed');
  assert.equal(rows[0].customers.name, NAME_MANUAL);
  assert.equal(rows[0].is_primary, true);

  // No customer row should be created for the parsed buyer_name.
  const { data: autoRows } = await db.from('customers').select('id').eq('name', NAME_BUYER);
  assert.equal(autoRows.length, 0, 'auto-buyer customer not created when junction exists');
});
