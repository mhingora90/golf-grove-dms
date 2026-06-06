import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devClient } from './helpers.js';

test('activity insert rejects both parents set', async () => {
  const db = devClient();
  const { data: c } = await db.from('customers').insert({ name: 'XOR Test' }).select('id').single();
  const { data: l } = await db.from('crm_leads').insert({ name: 'XOR Lead', project_id: '00000000-0000-0000-0000-000000000001' }).select('id').single();
  const { error } = await db.from('crm_lead_activities').insert({
    lead_id: l.id, customer_id: c.id, method: 'note', body: 'x', author_name: 'dev'
  });
  assert.ok(error, 'expected XOR violation');
  await db.from('customers').delete().eq('id', c.id);
  await db.from('crm_leads').delete().eq('id', l.id);
});

test('activity insert rejects neither parent set', async () => {
  const db = devClient();
  const { error } = await db.from('crm_lead_activities').insert({
    method: 'note', body: 'x', author_name: 'dev'
  });
  assert.ok(error, 'expected XOR violation');
});

test('activity accepts customer-only parent', async () => {
  const db = devClient();
  const { data: c } = await db.from('customers').insert({ name: 'Customer Solo' }).select('id').single();
  const { error } = await db.from('crm_lead_activities').insert({
    customer_id: c.id, method: 'in_person', body: 'walk-in', author_name: 'dev'
  });
  assert.equal(error, null);
  await db.from('crm_lead_activities').delete().eq('customer_id', c.id);
  await db.from('customers').delete().eq('id', c.id);
});
