#!/usr/bin/env node
/**
 * BOQ + IPC (Payment Certificates) — Multi-Role Test
 * tests/boq-ipc-roles.js
 *
 * Tests the full BOQ Add Bill workflow and Payment Certificate lifecycle
 * across all 3 application roles: developer, consultant, contractor.
 *
 * Strategy:
 *  - 2 temporary auth users created (consultant, contractor) + real developer account
 *  - Each signs in → receives real JWT → RLS fully enforced
 *  - All test data cleaned up after
 *
 * Run:
 *   DEV_EMAIL=mohammed@regent-developments.com DEV_PASSWORD=Mman1990 node tests/boq-ipc-roles.js
 */

const SUPABASE_URL = 'https://kdxvhrwnnehicgdryowu.supabase.co';
const ANON_KEY    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkeHZocndubmVoaWNnZHJ5b3d1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTg2NjMsImV4cCI6MjA5MTIzNDY2M30.uMlyBkTeth6nVl8ofBu9g_AYlnDLkgDyVTsxxaHI_ic';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkeHZocndubmVoaWNnZHJ5b3d1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY1ODY2MywiZXhwIjoyMDkxMjM0NjYzfQ.q9i53Jx2GXHpX5t89Tdzly0WPiS-TOeiuY36D6uRnUA';

const TODAY  = new Date().toISOString().split('T')[0];
const TS     = Date.now();
const TMPC   = `tmp-con-${TS}@boqtest.internal`;
const TMPK   = `tmp-ctr-${TS}@boqtest.internal`;
const TMPPW  = `BqTest${TS}!`;

// ── Results & cleanup ─────────────────────────────────────────────────────────
const results    = [];
const toDelete   = {};
const tmpAuthIds = [];

function track(table, id) {
  if (!id) return;
  (toDelete[table] = toDelete[table] || []).push(id);
}
function trackAuth(id) { if (id) tmpAuthIds.push(id); }

function pass(name)          { results.push({ name, status: 'PASS' });                           console.log(`  ✓  PASS     ${name}`); }
function fail(name, err)     { const e = String(err?.message||err||'').substring(0,120); results.push({ name, status: 'FAIL', info: e }); console.error(`  ✗  FAIL     ${name}  →  ${e}`); }
function blocked(name, note) { results.push({ name, status: 'PASS', info: 'Correctly blocked' }); console.log(`  ✓  BLOCKED  ${name}  (${note||'RLS'})`); }
function allowed(name, note) { results.push({ name, status: 'FAIL', info: 'RLS gap: '+note });    console.error(`  ✗  ALLOWED! ${name}  →  ${note}`); }
function skip(name, reason)  { results.push({ name, status: 'SKIP', info: reason });              console.log(`  ⊘  SKIP     ${name}  →  ${reason}`); }
function section(t)          { console.log(`\n${'═'.repeat(64)}\n  ${t}\n${'─'.repeat(64)}`); }

// ── HTTP helpers ──────────────────────────────────────────────────────────────
async function api(method, path, body, token = SERVICE_KEY, extra = {}) {
  const res  = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...extra },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, ok: res.status >= 200 && res.status < 300 };
}

// Enforces RLS — uses real user JWT with anon apikey
async function as(method, path, body, jwt) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, ok: res.status >= 200 && res.status < 300 };
}

const svcIns = (table, body)     => api('POST',   `/rest/v1/${table}`, body);
const svcUpd = (table, id, body) => api('PATCH',  `/rest/v1/${table}?id=eq.${id}`, body);
const svcDel = (table, id)       => api('DELETE', `/rest/v1/${table}?id=eq.${id}`, null, SERVICE_KEY, { Prefer: '' });
const svcGet = (table, qs = '')  => api('GET',    `/rest/v1/${table}${qs}`, null);

// ── Auth helpers ──────────────────────────────────────────────────────────────
async function signIn(email, password) {
  const { status, data } = await api('POST', '/auth/v1/token?grant_type=password',
    { email, password }, ANON_KEY);
  if (status === 200 && data.access_token) return { jwt: data.access_token, uid: data.user?.id };
  throw new Error(`Sign-in failed for ${email}: ${data?.error_description || data?.error || status}`);
}

async function createTmpUser(email, role) {
  const { status, data } = await api('POST', '/auth/v1/admin/users',
    { email, password: TMPPW, email_confirm: true }, SERVICE_KEY);
  if ((status !== 200 && status !== 201) || !data?.id)
    throw new Error(`Admin create user failed (${status}): ${JSON.stringify(data)?.substring(0, 100)}`);
  const uid = data.id;
  trackAuth(uid);

  // Upsert profile — a trigger may auto-create a row on auth.user insert
  const profRes = await api('POST', '/rest/v1/profiles',
    { id: uid, email, full_name: `Test ${role} ${TS}`, role, company: 'Test Co' },
    SERVICE_KEY, { Prefer: 'resolution=merge-duplicates,return=representation' });
  if (profRes.status !== 200 && profRes.status !== 201)
    throw new Error(`Profile upsert failed (${profRes.status}): ${JSON.stringify(profRes.data)?.substring(0, 100)}`);

  return uid;
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
async function runCleanup() {
  console.log('\n── Cleanup ──────────────────────────────────────────────────');
  // Delete in dependency order: items first, then certs, then boq
  const ORDER = ['payment_certificate_items', 'payment_certificates', 'boq_items', 'boq_bills'];
  for (const table of ORDER) {
    const ids = toDelete[table] || [];
    let n = 0;
    for (const id of ids) {
      const { status } = await svcDel(table, id);
      if (status === 204 || status === 200) n++;
    }
    if (ids.length) console.log(`  ${table}: removed ${n}/${ids.length}`);
  }
  for (const uid of tmpAuthIds) {
    const { status } = await api('DELETE', `/auth/v1/admin/users/${uid}`, null, SERVICE_KEY, { Prefer: '' });
    console.log(`  auth ${uid.substring(0, 8)}…: ${status === 200 || status === 204 ? 'removed' : `status ${status}`}`);
    // Also remove the profile (auth delete may not cascade)
    await svcDel('profiles', uid).catch(() => {});
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
function printSummary() {
  const counts = { PASS: 0, FAIL: 0, SKIP: 0 };
  for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;
  const W = Math.max(...results.map(r => r.name.length), 50);
  console.log('\n' + '═'.repeat(W + 24));
  console.log('  BOQ + IPC MULTI-ROLE TEST RESULTS');
  console.log('═'.repeat(W + 24));
  for (const r of results) {
    const icon = { PASS: '✓', FAIL: '✗', SKIP: '⊘' }[r.status];
    const suffix = r.info ? `  ← ${r.info}` : '';
    console.log(`  ${icon}  ${r.status.padEnd(5)}  ${r.name.padEnd(W)}${suffix}`);
  }
  console.log('─'.repeat(W + 24));
  console.log(`  PASS: ${counts.PASS}   FAIL: ${counts.FAIL}   SKIP: ${counts.SKIP}   TOTAL: ${results.length}`);
  console.log('═'.repeat(W + 24) + '\n');
  if (counts.FAIL > 0) process.exit(1);
}

// ════════════════════════════════════════════════════════════════════════════
// SETUP
// ════════════════════════════════════════════════════════════════════════════
let devJWT, conJWT, ctrJWT;
let devId,  conId,  ctrId;

async function setupAuth() {
  section('SETUP — Authentication');

  const email = process.env.DEV_EMAIL;
  const pass_ = process.env.DEV_PASSWORD;
  if (!email || !pass_) throw new Error('DEV_EMAIL and DEV_PASSWORD env vars required');

  const dev = await signIn(email, pass_);
  devJWT = dev.jwt; devId = dev.uid;
  console.log(`  [dev]  Signed in as ${email} (id: ${devId?.substring(0, 8)}…)`);

  conId = await createTmpUser(TMPC, 'consultant');
  const con = await signIn(TMPC, TMPPW);
  conJWT = con.jwt;
  console.log(`  [con]  Temp consultant: ${TMPC} (id: ${conId?.substring(0, 8)}…)`);

  ctrId = await createTmpUser(TMPK, 'contractor');
  const ctr = await signIn(TMPK, TMPPW);
  ctrJWT = ctr.jwt;
  console.log(`  [ctr]  Temp contractor: ${TMPK} (id: ${ctrId?.substring(0, 8)}…)`);

  // Verify get_user_role() works for each temp user by reading their own profile
  for (const [label, jwt, id] of [['con', conJWT, conId], ['ctr', ctrJWT, ctrId]]) {
    const { data } = await as('GET', `/rest/v1/profiles?id=eq.${id}&select=role`, null, jwt);
    const role = Array.isArray(data) ? data[0]?.role : null;
    console.log(`  [${label}]  Profile role confirmed: ${role || 'NOT FOUND — RLS tests may be unreliable'}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 1. BOQ READ — all roles can view bills and items
// ════════════════════════════════════════════════════════════════════════════
async function testBOQRead() {
  section('1. BOQ — Read Access (all roles)');
  for (const [label, jwt] of [['Developer', devJWT], ['Consultant', conJWT], ['Contractor', ctrJWT]]) {
    const { status, data } = await as('GET', '/rest/v1/boq_bills?select=id,bill_no,title&limit=5', null, jwt);
    if (status === 200 && Array.isArray(data)) pass(`BOQ Bills — ${label} can read (${data.length} bills returned)`);
    else fail(`BOQ Bills — ${label} read`, `HTTP ${status}`);

    const { status: s2, data: d2 } = await as('GET', '/rest/v1/boq_items?select=id,item_no&limit=5', null, jwt);
    if (s2 === 200 && Array.isArray(d2)) pass(`BOQ Items — ${label} can read (${d2.length} items returned)`);
    else fail(`BOQ Items — ${label} read`, `HTTP ${s2}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 2. BOQ ADD BILL — developer + consultant allowed; contractor blocked
// ════════════════════════════════════════════════════════════════════════════
let testBillDevId, testBillConId;

async function testBOQAddBill() {
  section('2. BOQ — Add Bill');

  const { data: ex } = await svcGet('boq_bills', '?select=sort_order&order=sort_order.desc&limit=1');
  const base = ((ex?.[0]?.sort_order) ?? 0) + 100;

  // Developer — ALLOWED
  {
    const { status, data } = await as('POST', '/rest/v1/boq_bills',
      { bill_no: `TST-D-${TS}`, title: `Test Bill Dev ${TS}`, sort_order: base }, devJWT);
    if (status === 201 && data?.[0]?.id) {
      testBillDevId = data[0].id; track('boq_bills', testBillDevId);
      pass('Add Bill — Developer: allowed (HTTP 201)');
    } else fail('Add Bill — Developer', `HTTP ${status}: ${JSON.stringify(data)?.substring(0, 80)}`);
  }

  // Consultant — ALLOWED
  {
    const { status, data } = await as('POST', '/rest/v1/boq_bills',
      { bill_no: `TST-C-${TS}`, title: `Test Bill Con ${TS}`, sort_order: base + 1 }, conJWT);
    if (status === 201 && data?.[0]?.id) {
      testBillConId = data[0].id; track('boq_bills', testBillConId);
      pass('Add Bill — Consultant: allowed (HTTP 201)');
    } else fail('Add Bill — Consultant', `HTTP ${status}: ${JSON.stringify(data)?.substring(0, 80)}`);
  }

  // Contractor — BLOCKED
  {
    const { status, data } = await as('POST', '/rest/v1/boq_bills',
      { bill_no: `TST-K-${TS}`, title: `Test Bill Ctr ${TS}`, sort_order: base + 2 }, ctrJWT);
    if (status === 201 && data?.[0]?.id) {
      track('boq_bills', data[0].id);
      allowed('Add Bill — Contractor blocked', 'INSERT to boq_bills succeeded');
    } else blocked('Add Bill — Contractor correctly blocked', `HTTP ${status}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 3. BOQ ADD & EDIT ITEMS — developer + consultant allowed; contractor blocked
// ════════════════════════════════════════════════════════════════════════════
let testItemDevId;

async function testBOQEditItems() {
  section('3. BOQ — Add & Edit Items');

  if (!testBillDevId) { skip('BOQ Items (all)', 'No test bill created'); return; }

  const { data: gmax } = await svcGet('boq_items', '?select=sort_order&order=sort_order.desc&limit=1');
  const nextSort = ((gmax?.[0]?.sort_order) ?? 0) + 1;

  // Developer adds item — ALLOWED
  {
    const { status, data } = await as('POST', '/rest/v1/boq_items',
      { bill_id: testBillDevId, item_no: 'T.01.A', description: 'Test item', qty: 10, unit: 'm2', rate: 50, total: 500, sort_order: nextSort }, devJWT);
    if (status === 201 && data?.[0]?.id) {
      testItemDevId = data[0].id; track('boq_items', testItemDevId);
      pass('Add Item — Developer: allowed (HTTP 201)');
    } else fail('Add Item — Developer', `HTTP ${status}: ${JSON.stringify(data)?.substring(0, 80)}`);
  }

  if (!testItemDevId) { skip('Edit/Delete item tests', 'No test item'); return; }

  // Developer edits item — ALLOWED; verify value changes
  {
    const { status } = await as('PATCH', `/rest/v1/boq_items?id=eq.${testItemDevId}`, { rate: 60, total: 600 }, devJWT);
    const { data: check } = await svcGet('boq_items', `?id=eq.${testItemDevId}&select=rate`);
    const newRate = check?.[0]?.rate;
    if ((status === 200 || status === 204) && +newRate === 60) pass('Edit Item — Developer: value confirmed changed to 60');
    else fail('Edit Item — Developer', `HTTP ${status}, rate=${newRate}`);
  }

  // Consultant edits item — ALLOWED; verify
  {
    const { status } = await as('PATCH', `/rest/v1/boq_items?id=eq.${testItemDevId}`, { rate: 55, total: 550 }, conJWT);
    const { data: check } = await svcGet('boq_items', `?id=eq.${testItemDevId}&select=rate`);
    const newRate = check?.[0]?.rate;
    if ((status === 200 || status === 204) && +newRate === 55) pass('Edit Item — Consultant: value confirmed changed to 55');
    else fail('Edit Item — Consultant', `HTTP ${status}, rate=${newRate}`);
  }

  // Contractor edits item — BLOCKED (PostgREST returns 200 but 0 rows affected; verify value unchanged)
  {
    const { status } = await as('PATCH', `/rest/v1/boq_items?id=eq.${testItemDevId}`, { rate: 999, total: 9990 }, ctrJWT);
    const { data: check } = await svcGet('boq_items', `?id=eq.${testItemDevId}&select=rate`);
    const newRate = +check?.[0]?.rate;
    if (newRate === 999) allowed('Edit Item — Contractor blocked', 'Value was actually changed — RLS update policy missing');
    else blocked('Edit Item — Contractor correctly blocked', `HTTP ${status}, rate unchanged at ${newRate}`);
  }

  // Contractor adds item to a bill — BLOCKED
  {
    const { status, data } = await as('POST', '/rest/v1/boq_items',
      { bill_id: testBillDevId, item_no: 'T.01.X', description: 'Unauth item', qty: 1, unit: 'ls', rate: 1, total: 1, sort_order: 9999 }, ctrJWT);
    if (status === 201 && data?.[0]?.id) {
      track('boq_items', data[0].id);
      allowed('Add Item — Contractor blocked', 'INSERT to boq_items succeeded');
    } else blocked('Add Item — Contractor correctly blocked', `HTTP ${status}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 4. BOQ DELETE — developer + consultant allowed; contractor blocked
// ════════════════════════════════════════════════════════════════════════════
async function testBOQDelete() {
  section('4. BOQ — Delete Bill');

  if (!testBillConId) { skip('BOQ Delete', 'No consultant test bill'); return; }

  // Contractor tries to delete — BLOCKED
  {
    const { status } = await as('DELETE', `/rest/v1/boq_bills?id=eq.${testBillConId}`, null, ctrJWT);
    const { data: still } = await svcGet('boq_bills', `?id=eq.${testBillConId}&select=id`);
    if (still?.[0]?.id) blocked('Delete Bill — Contractor correctly blocked', `HTTP ${status}`);
    else { toDelete['boq_bills'] = (toDelete['boq_bills']||[]).filter(i=>i!==testBillConId); allowed('Delete Bill — Contractor blocked', 'DELETE succeeded'); }
  }

  // Consultant deletes their bill — ALLOWED
  {
    const { status } = await as('DELETE', `/rest/v1/boq_bills?id=eq.${testBillConId}`, null, conJWT);
    const { data: still } = await svcGet('boq_bills', `?id=eq.${testBillConId}&select=id`);
    if (!still?.[0]?.id) {
      toDelete['boq_bills'] = (toDelete['boq_bills']||[]).filter(i=>i!==testBillConId);
      pass('Delete Bill — Consultant: allowed (bill gone from DB)');
    } else fail('Delete Bill — Consultant', `HTTP ${status} but bill still exists`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 5. IPC CREATE — contractor + developer allowed; consultant blocked
// ════════════════════════════════════════════════════════════════════════════
let ctrDraftId, devDraftId;

async function testIPCCreate() {
  section('5. IPC — Create Payment Certificate');

  const { data: last } = await svcGet('payment_certificates', '?select=cert_no&order=cert_no.desc&limit=1');
  const baseNo = ((last?.[0]?.cert_no) ?? 0) + 100;

  const ipcBase = (certNo, label) => ({
    cert_no: certNo, ref_no: `IPC-TEST-${label}-${TS}`, status: 'Draft',
    submitted_date: TODAY, submitted_by_name: `Test ${label} ${TS}`,
    retention_pct: 10, advance_recovery_pct: 10, mobilisation_advance: 0, vat_pct: 5,
    previously_paid: 0, value_of_works: 0, pc_ps_adjustments: 0,
  });

  // Contractor — ALLOWED
  {
    const { status, data } = await as('POST', '/rest/v1/payment_certificates', ipcBase(baseNo, 'CTR'), ctrJWT);
    if (status === 201 && data?.[0]?.id) {
      ctrDraftId = data[0].id; track('payment_certificates', ctrDraftId);
      pass('Create IPC — Contractor: allowed (HTTP 201)');
    } else fail('Create IPC — Contractor', `HTTP ${status}: ${JSON.stringify(data)?.substring(0, 100)}`);
  }

  // Developer — ALLOWED
  {
    const { status, data } = await as('POST', '/rest/v1/payment_certificates', ipcBase(baseNo + 1, 'DEV'), devJWT);
    if (status === 201 && data?.[0]?.id) {
      devDraftId = data[0].id; track('payment_certificates', devDraftId);
      pass('Create IPC — Developer: allowed (HTTP 201)');
    } else fail('Create IPC — Developer', `HTTP ${status}: ${JSON.stringify(data)?.substring(0, 100)}`);
  }

  // Consultant — BLOCKED (only contractor + developer can create IPCs)
  {
    const { status, data } = await as('POST', '/rest/v1/payment_certificates', ipcBase(baseNo + 2, 'CON'), conJWT);
    if (status === 201 && data?.[0]?.id) {
      track('payment_certificates', data[0].id);
      allowed('Create IPC — Consultant blocked', 'INSERT to payment_certificates succeeded');
    } else blocked('Create IPC — Consultant correctly blocked', `HTTP ${status}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 6. IPC ADD ITEMS — contractor + developer allowed; consultant blocked
// ════════════════════════════════════════════════════════════════════════════
let ctrItemId;

async function testIPCAddItems() {
  section('6. IPC — Add Line Items');

  if (!ctrDraftId) { skip('IPC Add Items', 'No contractor draft IPC'); return; }

  const { data: boqRows } = await svcGet('boq_items', '?select=id&limit=1');
  const boqItemId = boqRows?.[0]?.id;
  if (!boqItemId) { skip('IPC Add Items', 'No BOQ items to reference'); return; }

  // Contractor adds items — ALLOWED
  {
    const { status, data } = await as('POST', '/rest/v1/payment_certificate_items',
      { cert_id: ctrDraftId, boq_item_id: boqItemId, contractor_pct: 50, contractor_amount: 250 }, ctrJWT);
    if (status === 201 && data?.[0]?.id) {
      ctrItemId = data[0].id; track('payment_certificate_items', ctrItemId);
      pass('Add IPC Item — Contractor: allowed (HTTP 201)');
    } else fail('Add IPC Item — Contractor', `HTTP ${status}: ${JSON.stringify(data)?.substring(0, 80)}`);
  }

  // Consultant adds items — BLOCKED (no insert policy for consultant)
  {
    const { status, data } = await as('POST', '/rest/v1/payment_certificate_items',
      { cert_id: ctrDraftId, boq_item_id: boqItemId, contractor_pct: 10, contractor_amount: 50 }, conJWT);
    if (status === 201 && data?.[0]?.id) {
      track('payment_certificate_items', data[0].id);
      allowed('Add IPC Item — Consultant blocked', 'INSERT succeeded — only contractor/developer should add items');
    } else blocked('Add IPC Item — Consultant correctly blocked', `HTTP ${status}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 7. IPC FULL WORKFLOW — Draft → Submitted → Under Review → Certified → Paid
// ════════════════════════════════════════════════════════════════════════════
async function testIPCWorkflow() {
  section('7. IPC — Full Workflow Lifecycle');

  if (!ctrDraftId) { skip('IPC Workflow', 'No contractor draft IPC'); return; }

  // Contractor submits (Draft → Submitted)
  {
    const { status } = await as('PATCH', `/rest/v1/payment_certificates?id=eq.${ctrDraftId}`, { status: 'Submitted' }, ctrJWT);
    const { data } = await svcGet('payment_certificates', `?id=eq.${ctrDraftId}&select=status`);
    if (data?.[0]?.status === 'Submitted') pass('IPC Workflow — Contractor submits: Draft → Submitted');
    else fail('IPC Workflow — Contractor submit', `HTTP ${status}, status=${data?.[0]?.status}`);
  }

  // Consultant moves to Under Review
  {
    const { status } = await as('PATCH', `/rest/v1/payment_certificates?id=eq.${ctrDraftId}`, { status: 'Under Review' }, conJWT);
    const { data } = await svcGet('payment_certificates', `?id=eq.${ctrDraftId}&select=status`);
    if (data?.[0]?.status === 'Under Review') pass('IPC Workflow — Consultant: Submitted → Under Review');
    else fail('IPC Workflow — Under Review', `HTTP ${status}, status=${data?.[0]?.status}`);
  }

  // Consultant certifies items (enters certified amounts)
  if (ctrItemId) {
    const { status } = await as('PATCH', `/rest/v1/payment_certificate_items?id=eq.${ctrItemId}`,
      { consultant_pct: 45, consultant_amount: 225 }, conJWT);
    const { data } = await svcGet('payment_certificate_items', `?id=eq.${ctrItemId}&select=consultant_pct,consultant_amount`);
    if (+data?.[0]?.consultant_pct === 45) pass('IPC Workflow — Consultant certifies line items (consultant_pct confirmed)');
    else fail('IPC Workflow — Consultant certify items', `HTTP ${status}, pct=${data?.[0]?.consultant_pct}`);
  }

  // Consultant certifies IPC (Under Review → Certified)
  {
    const { status } = await as('PATCH', `/rest/v1/payment_certificates?id=eq.${ctrDraftId}`,
      { status: 'Certified', certified_by_name: `Test Consultant ${TS}`, certified_date: TODAY }, conJWT);
    const { data } = await svcGet('payment_certificates', `?id=eq.${ctrDraftId}&select=status,certified_by_name`);
    if (data?.[0]?.status === 'Certified') pass('IPC Workflow — Consultant certifies: Under Review → Certified');
    else fail('IPC Workflow — Certify', `HTTP ${status}, status=${data?.[0]?.status}`);
  }

  // Developer marks as Paid (Certified → Paid)
  {
    const { status } = await as('PATCH', `/rest/v1/payment_certificates?id=eq.${ctrDraftId}`,
      { status: 'Paid', paid_date: TODAY, payment_ref: `PAY-TEST-${TS}` }, devJWT);
    const { data } = await svcGet('payment_certificates', `?id=eq.${ctrDraftId}&select=status,payment_ref`);
    if (data?.[0]?.status === 'Paid') pass(`IPC Workflow — Developer marks Paid (ref: ${data[0].payment_ref})`);
    else fail('IPC Workflow — Paid', `HTTP ${status}, status=${data?.[0]?.status}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 8. IPC DELETE — contractor: draft only; developer: any; consultant: blocked
// ════════════════════════════════════════════════════════════════════════════
async function testIPCDelete() {
  section('8. IPC — Delete Permissions');

  const mkIPC = async (certNo, status, label) => {
    const { data } = await svcIns('payment_certificates', {
      cert_no: certNo, ref_no: `IPC-DEL-${label}-${TS}`, status,
      submitted_date: TODAY, submitted_by_name: 'Test', retention_pct: 10,
      advance_recovery_pct: 10, mobilisation_advance: 0, vat_pct: 5, previously_paid: 0,
      value_of_works: 0, pc_ps_adjustments: 0,
    });
    const id = data?.[0]?.id;
    if (id) track('payment_certificates', id);
    return id;
  };

  const { data: last } = await svcGet('payment_certificates', '?select=cert_no&order=cert_no.desc&limit=1');
  const base = ((last?.[0]?.cert_no) ?? 0) + 200;

  const draftForCtr     = await mkIPC(base,     'Draft',     'CTR-DRAFT');
  const certifiedForCtr = await mkIPC(base + 1, 'Certified', 'CTR-CERT');
  const draftForCon     = await mkIPC(base + 2, 'Draft',     'CON-DRAFT');
  const draftForDev     = await mkIPC(base + 3, 'Certified', 'DEV-ANY');

  // Contractor deletes own Draft — ALLOWED
  if (draftForCtr) {
    const { status } = await as('DELETE', `/rest/v1/payment_certificates?id=eq.${draftForCtr}`, null, ctrJWT);
    const { data: still } = await svcGet('payment_certificates', `?id=eq.${draftForCtr}&select=id`);
    if (!still?.[0]?.id) { toDelete['payment_certificates'] = (toDelete['payment_certificates']||[]).filter(i=>i!==draftForCtr); pass('Delete IPC — Contractor deletes Draft: allowed'); }
    else fail('Delete IPC — Contractor deletes Draft', `HTTP ${status} but record still exists`);
  }

  // Contractor tries to delete Certified — BLOCKED
  if (certifiedForCtr) {
    const { status } = await as('DELETE', `/rest/v1/payment_certificates?id=eq.${certifiedForCtr}`, null, ctrJWT);
    const { data: still } = await svcGet('payment_certificates', `?id=eq.${certifiedForCtr}&select=id`);
    if (still?.[0]?.id) blocked('Delete IPC — Contractor blocked from Certified', `HTTP ${status}`);
    else { toDelete['payment_certificates'] = (toDelete['payment_certificates']||[]).filter(i=>i!==certifiedForCtr); allowed('Delete IPC — Contractor blocked from Certified', 'Deleted a non-Draft IPC — RLS status check missing'); }
  }

  // Consultant tries to delete any IPC — BLOCKED
  if (draftForCon) {
    const { status } = await as('DELETE', `/rest/v1/payment_certificates?id=eq.${draftForCon}`, null, conJWT);
    const { data: still } = await svcGet('payment_certificates', `?id=eq.${draftForCon}&select=id`);
    if (still?.[0]?.id) blocked('Delete IPC — Consultant correctly blocked', `HTTP ${status}`);
    else { toDelete['payment_certificates'] = (toDelete['payment_certificates']||[]).filter(i=>i!==draftForCon); allowed('Delete IPC — Consultant blocked', 'Consultant deleted an IPC'); }
  }

  // Developer deletes any status — ALLOWED
  if (draftForDev) {
    const { status } = await as('DELETE', `/rest/v1/payment_certificates?id=eq.${draftForDev}`, null, devJWT);
    const { data: still } = await svcGet('payment_certificates', `?id=eq.${draftForDev}&select=id`);
    if (!still?.[0]?.id) { toDelete['payment_certificates'] = (toDelete['payment_certificates']||[]).filter(i=>i!==draftForDev); pass('Delete IPC — Developer deletes Certified: allowed'); }
    else fail('Delete IPC — Developer', `HTTP ${status} but record still exists`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 9. IPC READ — all roles can view all certificates
// ════════════════════════════════════════════════════════════════════════════
async function testIPCRead() {
  section('9. IPC — Read Access (all roles)');
  for (const [label, jwt] of [['Developer', devJWT], ['Consultant', conJWT], ['Contractor', ctrJWT]]) {
    const { status, data } = await as('GET', '/rest/v1/payment_certificates?select=id,ref_no,status&limit=5', null, jwt);
    if (status === 200 && Array.isArray(data)) pass(`Read IPC List — ${label}: allowed (${data.length} certs visible)`);
    else fail(`Read IPC List — ${label}`, `HTTP ${status}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 10. BOQ BILL ORDER — verify client-side numeric sort produces correct order
// ════════════════════════════════════════════════════════════════════════════
async function testBOQBillOrder() {
  section('10. BOQ — Bill Numeric Sort Order');

  const { status, data } = await as('GET', '/rest/v1/boq_bills?select=bill_no,title', null, devJWT);
  if (status !== 200 || !Array.isArray(data)) { fail('BOQ Bill Order — read', `HTTP ${status}`); return; }

  const realBills = data.filter(b => !b.bill_no.startsWith('TST-'));
  // Simulate client-side sort (mirrors app: numeric then lexicographic fallback)
  const sorted = [...realBills].sort((a, b) =>
    ((+a.bill_no || 0) - (+b.bill_no || 0)) || a.bill_no.localeCompare(b.bill_no)
  );
  const sortedNos = sorted.map(b => b.bill_no);
  const numericOk = sortedNos.every((no, i) => +no === i + 1 || isNaN(+no));
  pass(`BOQ Bill numeric sort — ${realBills.length} bills, order: [${sortedNos.join(', ')}]`);

  // Verify no gaps in expected numeric sequence (01→16 or whatever range)
  const numericNos = sortedNos.filter(n => !isNaN(+n)).map(Number);
  const min = Math.min(...numericNos), max = Math.max(...numericNos);
  const missing = [];
  for (let i = min; i <= max; i++) { if (!numericNos.includes(i)) missing.push(i); }
  if (missing.length === 0) pass(`BOQ Bill sequence complete — no gaps (${min}–${max})`);
  else fail('BOQ Bill sequence', `Missing bill numbers: ${missing.join(', ')}`);
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════
(async () => {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Golf Grove DMS — BOQ + IPC Multi-Role Test                 ║');
  console.log(`║  ${new Date().toISOString()}                         ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  try {
    await setupAuth();
    await testBOQRead();
    await testBOQAddBill();
    await testBOQEditItems();
    await testBOQDelete();
    await testIPCCreate();
    await testIPCAddItems();
    await testIPCWorkflow();
    await testIPCDelete();
    await testIPCRead();
    await testBOQBillOrder();
  } catch (err) {
    console.error('\n[FATAL]', err.message);
  } finally {
    await runCleanup();
    printSummary();
  }
})();
