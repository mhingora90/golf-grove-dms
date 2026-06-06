import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { devClient } from './helpers.js';

const SUPABASE_URL  = 'https://kdxvhrwnnehicgdryowu.supabase.co';
const ANON_KEY      = 'sb_publishable_EASrK2EfbUZ5Jz1VBNw8Kw_nqq18szU';
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY;
const TEST_PASSWORD = 'GGTest2026!';
const PERSISTENT_ACCOUNTS = {
  developer : 'test.developer@golfgrove.test',
  consultant: 'test.consultant@golfgrove.test',
};
const PROJECT_241 = '00000000-0000-0000-0000-000000000002';

if (!SERVICE_KEY) throw new Error('Set SUPABASE_SERVICE_KEY env var');

// Build an authenticated supabase-js client for a role.
// Persistent accounts (developer/consultant) reuse the shared fixture password.
// Transient roles (admin/sales) get a fresh auth user + profile per call.
async function clientAs(role, registry) {
  if (PERSISTENT_ACCOUNTS[role]) {
    const c = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await c.auth.signInWithPassword({
      email: PERSISTENT_ACCOUNTS[role],
      password: TEST_PASSWORD,
    });
    if (error) throw new Error(`signIn ${role}: ${error.message}`);
    return c;
  }

  // Transient role — create on the fly.
  const admin = devClient();
  const email = `rls-${role}-${Date.now()}-${Math.random().toString(36).slice(2,8)}@test.local`;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password: TEST_PASSWORD, email_confirm: true,
  });
  if (createErr) throw new Error(`createUser ${role}: ${createErr.message}`);
  const userId = created.user.id;
  registry?.push(userId);

  const { error: profErr } = await admin
    .from('profiles')
    .upsert({ id: userId, role }, { onConflict: 'id' });
  if (profErr) throw new Error(`upsert profile ${role}: ${profErr.message}`);

  const c = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signErr } = await c.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (signErr) throw new Error(`signIn transient ${role}: ${signErr.message}`);
  return c;
}

test('crm_lead_activities RLS: admin/developer/sales read both branches; consultant reads neither', async (t) => {
  const db = devClient();
  const transientUserIds = [];

  // ── Seed: a customer-scoped activity + a lead-scoped activity ────────────
  const { data: customer, error: cErr } = await db.from('customers')
    .insert({ name: 'RLS Matrix Customer ' + Date.now() }).select('id').single();
  assert.equal(cErr, null, 'seed customer');

  const { data: lead, error: lErr } = await db.from('crm_leads')
    .insert({ name: 'RLS Matrix Lead ' + Date.now(), project_id: PROJECT_241 })
    .select('id').single();
  assert.equal(lErr, null, 'seed lead');

  const { data: custAct, error: caErr } = await db.from('crm_lead_activities').insert({
    customer_id: customer.id, method: 'call', body: 'customer branch', author_name: 'seed',
  }).select('id').single();
  assert.equal(caErr, null, 'seed customer activity');

  const { data: leadAct, error: laErr } = await db.from('crm_lead_activities').insert({
    lead_id: lead.id, method: 'note', body: 'lead branch', author_name: 'seed',
  }).select('id').single();
  assert.equal(laErr, null, 'seed lead activity');

  t.after(async () => {
    if (custAct?.id) await db.from('crm_lead_activities').delete().eq('id', custAct.id);
    if (leadAct?.id) await db.from('crm_lead_activities').delete().eq('id', leadAct.id);
    if (customer?.id) await db.from('customers').delete().eq('id', customer.id);
    if (lead?.id) await db.from('crm_leads').delete().eq('id', lead.id);
    for (const uid of transientUserIds) {
      await db.auth.admin.deleteUser(uid).catch(() => {});
    }
  });

  // ── Positive role matrix: admin, developer, sales see BOTH branches ──────
  for (const role of ['admin', 'developer', 'sales']) {
    const c = await clientAs(role, transientUserIds);

    const { data: rowsCust, error: errCust } = await c
      .from('crm_lead_activities').select('id').eq('id', custAct.id);
    assert.equal(errCust, null, `${role}: customer branch error`);
    assert.equal(rowsCust.length, 1, `${role} can read customer-scoped activity`);

    const { data: rowsLead, error: errLead } = await c
      .from('crm_lead_activities').select('id').eq('id', leadAct.id);
    assert.equal(errLead, null, `${role}: lead branch error`);
    assert.equal(rowsLead.length, 1, `${role} can read lead-scoped activity`);
  }

  // ── Negative: consultant cannot read customer-scoped activity ────────────
  const consultant = await clientAs('consultant');
  const { data: consCust } = await consultant
    .from('crm_lead_activities').select('id').eq('id', custAct.id);
  assert.equal(consCust?.length ?? 0, 0, 'consultant cannot read customer-scoped activity');

  // Consultant also cannot read the lead branch (consultant lacks has_crm_access).
  // This confirms the OR is gated correctly and not over-permissive.
  const { data: consLead } = await consultant
    .from('crm_lead_activities').select('id').eq('id', leadAct.id);
  assert.equal(consLead?.length ?? 0, 0, 'consultant cannot read lead-scoped activity');

  // ── INSERT branch: WITH CHECK must accept both customer and lead parents
  //   for developer (proves the policy isn't single-branch).
  const dev = await clientAs('developer');
  const { data: insCust, error: insCustErr } = await dev
    .from('crm_lead_activities')
    .insert({ customer_id: customer.id, method: 'note', body: 'dev insert cust', author_name: 'dev' })
    .select('id').single();
  assert.equal(insCustErr, null, 'developer can INSERT customer-scoped activity');
  if (insCust?.id) await db.from('crm_lead_activities').delete().eq('id', insCust.id);

  const { data: insLead, error: insLeadErr } = await dev
    .from('crm_lead_activities')
    .insert({ lead_id: lead.id, method: 'note', body: 'dev insert lead', author_name: 'dev' })
    .select('id').single();
  assert.equal(insLeadErr, null, 'developer can INSERT lead-scoped activity');
  if (insLead?.id) await db.from('crm_lead_activities').delete().eq('id', insLead.id);
});
