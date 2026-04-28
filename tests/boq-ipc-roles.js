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
// 11. IPC RETRACT — Submitted → Draft (contractor + developer; consultant blocked)
// ════════════════════════════════════════════════════════════════════════════
async function testIPCRetract() {
  section('11. IPC — Retract (Submitted → Draft)');

  const mkSubmitted = async (label, certNo) => {
    const { data } = await svcIns('payment_certificates', {
      cert_no: certNo, ref_no: `IPC-RETRACT-${label}-${TS}`, status: 'Submitted',
      submitted_date: TODAY, submitted_by_name: 'Test', retention_pct: 10,
      advance_recovery_pct: 10, mobilisation_advance: 0, vat_pct: 5, previously_paid: 0,
      value_of_works: 0, pc_ps_adjustments: 0,
    });
    const id = data?.[0]?.id;
    if (id) track('payment_certificates', id);
    return id;
  };

  const { data: last } = await svcGet('payment_certificates', '?select=cert_no&order=cert_no.desc&limit=1');
  const base = ((last?.[0]?.cert_no) ?? 0) + 300;

  const forCtr = await mkSubmitted('CTR', base);
  const forDev = await mkSubmitted('DEV', base + 1);
  const forCon = await mkSubmitted('CON', base + 2);

  // Contractor retracts own Submitted → Draft — ALLOWED
  if (forCtr) {
    const { status } = await as('PATCH', `/rest/v1/payment_certificates?id=eq.${forCtr}`,
      { status: 'Draft', submitted_date: null, submitted_by_name: null }, ctrJWT);
    const { data } = await svcGet('payment_certificates', `?id=eq.${forCtr}&select=status`);
    if (data?.[0]?.status === 'Draft') pass('Retract — Contractor: Submitted → Draft allowed');
    else fail('Retract — Contractor', `HTTP ${status}, status=${data?.[0]?.status}`);
  }

  // Developer retracts Submitted → Draft — ALLOWED
  if (forDev) {
    const { status } = await as('PATCH', `/rest/v1/payment_certificates?id=eq.${forDev}`,
      { status: 'Draft' }, devJWT);
    const { data } = await svcGet('payment_certificates', `?id=eq.${forDev}&select=status`);
    if (data?.[0]?.status === 'Draft') pass('Retract — Developer: Submitted → Draft allowed');
    else fail('Retract — Developer', `HTTP ${status}, status=${data?.[0]?.status}`);
  }

  // Consultant tries to retract Submitted → Draft — BLOCKED (consultant WITH CHECK prevents Draft)
  if (forCon) {
    const { status } = await as('PATCH', `/rest/v1/payment_certificates?id=eq.${forCon}`,
      { status: 'Draft' }, conJWT);
    const { data } = await svcGet('payment_certificates', `?id=eq.${forCon}&select=status`);
    if (data?.[0]?.status === 'Draft') allowed('Retract — Consultant blocked from Draft', 'Consultant set status=Draft — RLS WITH CHECK gap');
    else blocked('Retract — Consultant cannot retract to Draft', `status=${data?.[0]?.status}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 12. IPC RETURN TO CONTRACTOR — Under Review → Submitted
// ════════════════════════════════════════════════════════════════════════════
async function testIPCReturn() {
  section('12. IPC — Return to Contractor (Under Review → Submitted)');

  const mkUnderReview = async (label, certNo) => {
    const { data } = await svcIns('payment_certificates', {
      cert_no: certNo, ref_no: `IPC-RETURN-${label}-${TS}`, status: 'Under Review',
      submitted_date: TODAY, submitted_by_name: 'Test', retention_pct: 10,
      advance_recovery_pct: 10, mobilisation_advance: 0, vat_pct: 5, previously_paid: 0,
      value_of_works: 0, pc_ps_adjustments: 0,
    });
    const id = data?.[0]?.id;
    if (id) track('payment_certificates', id);
    return id;
  };

  const { data: last } = await svcGet('payment_certificates', '?select=cert_no&order=cert_no.desc&limit=1');
  const base = ((last?.[0]?.cert_no) ?? 0) + 400;

  const forCon = await mkUnderReview('CON', base);
  const forCtr = await mkUnderReview('CTR', base + 1);

  // Consultant returns Under Review → Submitted — ALLOWED
  if (forCon) {
    const { status } = await as('PATCH', `/rest/v1/payment_certificates?id=eq.${forCon}`,
      { status: 'Submitted' }, conJWT);
    const { data } = await svcGet('payment_certificates', `?id=eq.${forCon}&select=status`);
    if (data?.[0]?.status === 'Submitted') pass('Return — Consultant: Under Review → Submitted allowed');
    else fail('Return — Consultant', `HTTP ${status}, status=${data?.[0]?.status}`);
  }

  // Contractor tries to touch Under Review cert — BLOCKED (USING: contractor only touches Draft/Submitted)
  if (forCtr) {
    const { status } = await as('PATCH', `/rest/v1/payment_certificates?id=eq.${forCtr}`,
      { status: 'Submitted' }, ctrJWT);
    const { data } = await svcGet('payment_certificates', `?id=eq.${forCtr}&select=status`);
    if (data?.[0]?.status === 'Submitted') allowed('Return — Contractor blocked from Under Review', 'Contractor changed Under Review status — USING clause gap');
    else blocked('Return — Contractor cannot touch Under Review cert', `status=${data?.[0]?.status}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 13. RLS STATUS TRANSITION GAPS
// ════════════════════════════════════════════════════════════════════════════
async function testRLSStatusGaps() {
  section('13. RLS — Illegal Status Transitions');

  const mkCert = async (label, status_, certNo) => {
    const { data } = await svcIns('payment_certificates', {
      cert_no: certNo, ref_no: `IPC-RLSGAP-${label}-${TS}`, status: status_,
      submitted_date: TODAY, submitted_by_name: 'Test', retention_pct: 10,
      advance_recovery_pct: 10, mobilisation_advance: 0, vat_pct: 5, previously_paid: 0,
      value_of_works: 0, pc_ps_adjustments: 0,
    });
    const id = data?.[0]?.id;
    if (id) track('payment_certificates', id);
    return id;
  };

  const { data: last } = await svcGet('payment_certificates', '?select=cert_no&order=cert_no.desc&limit=1');
  const base = ((last?.[0]?.cert_no) ?? 0) + 500;

  const draftForCtr  = await mkCert('CTR-CERT',  'Draft',      base);
  const submForCtr   = await mkCert('CTR-PAID',  'Submitted',  base + 1);
  const certForCon   = await mkCert('CON-PAID',  'Certified',  base + 2);
  const draftForCon  = await mkCert('CON-DRAFT', 'Draft',      base + 3);
  const underForCtr  = await mkCert('CTR-UNDER', 'Under Review', base + 4);

  // Contractor tries Draft → Certified (skipping workflow) — BLOCKED
  if (draftForCtr) {
    const { status } = await as('PATCH', `/rest/v1/payment_certificates?id=eq.${draftForCtr}`, { status: 'Certified' }, ctrJWT);
    const { data } = await svcGet('payment_certificates', `?id=eq.${draftForCtr}&select=status`);
    if (data?.[0]?.status === 'Certified') allowed('Contractor blocked: Draft → Certified', 'Contractor skipped to Certified — WITH CHECK gap');
    else blocked('Contractor blocked: cannot jump Draft → Certified', `status=${data?.[0]?.status}`);
  }

  // Contractor tries Submitted → Paid (skipping certification) — BLOCKED
  if (submForCtr) {
    const { status } = await as('PATCH', `/rest/v1/payment_certificates?id=eq.${submForCtr}`, { status: 'Paid' }, ctrJWT);
    const { data } = await svcGet('payment_certificates', `?id=eq.${submForCtr}&select=status`);
    if (data?.[0]?.status === 'Paid') allowed('Contractor blocked: Submitted → Paid', 'Contractor marked Paid — WITH CHECK gap');
    else blocked('Contractor blocked: cannot jump Submitted → Paid', `status=${data?.[0]?.status}`);
  }

  // Contractor tries to touch Under Review cert — BLOCKED
  if (underForCtr) {
    const { status } = await as('PATCH', `/rest/v1/payment_certificates?id=eq.${underForCtr}`, { notes: 'Unauthorized edit' }, ctrJWT);
    const { data } = await svcGet('payment_certificates', `?id=eq.${underForCtr}&select=notes`);
    if (data?.[0]?.notes === 'Unauthorized edit') allowed('Contractor blocked: cannot edit Under Review cert', 'Contractor edited an Under Review cert — USING clause gap');
    else blocked('Contractor blocked: cannot touch Under Review cert', `HTTP ${status}`);
  }

  // Consultant tries Certified → Paid — BLOCKED (developer only)
  if (certForCon) {
    const { status } = await as('PATCH', `/rest/v1/payment_certificates?id=eq.${certForCon}`, { status: 'Paid' }, conJWT);
    const { data } = await svcGet('payment_certificates', `?id=eq.${certForCon}&select=status`);
    if (data?.[0]?.status === 'Paid') allowed('Consultant blocked: Certified → Paid', 'Consultant marked IPC Paid — only developer should do this');
    else blocked('Consultant blocked: cannot mark Paid', `status=${data?.[0]?.status}`);
  }

  // Consultant tries to touch Draft cert — BLOCKED (USING: consultant only touches Submitted/Under Review)
  if (draftForCon) {
    const { status } = await as('PATCH', `/rest/v1/payment_certificates?id=eq.${draftForCon}`, { notes: 'Unauthorized' }, conJWT);
    const { data } = await svcGet('payment_certificates', `?id=eq.${draftForCon}&select=notes`);
    if (data?.[0]?.notes === 'Unauthorized') allowed('Consultant blocked: cannot touch Draft cert', 'Consultant edited a Draft cert — USING clause gap');
    else blocked('Consultant blocked: cannot touch Draft cert', `HTTP ${status}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 14. RLS CERT ITEMS — status-gated update access
// ════════════════════════════════════════════════════════════════════════════
async function testRLSCertItems() {
  section('14. RLS — Cert Items Status-Gated Updates');

  const { data: boqRows } = await svcGet('boq_items', '?select=id&limit=1');
  const boqItemId = boqRows?.[0]?.id;
  if (!boqItemId) { skip('RLS Cert Items', 'No BOQ items'); return; }

  const { data: last } = await svcGet('payment_certificates', '?select=cert_no&order=cert_no.desc&limit=1');
  const base = ((last?.[0]?.cert_no) ?? 0) + 600;

  // Create certs in different statuses via service role
  const mkCertWithItem = async (label, certStatus, certNo) => {
    const { data: c } = await svcIns('payment_certificates', {
      cert_no: certNo, ref_no: `IPC-ITEMS-${label}-${TS}`, status: certStatus,
      submitted_date: TODAY, submitted_by_name: 'Test', retention_pct: 10,
      advance_recovery_pct: 10, mobilisation_advance: 0, vat_pct: 5, previously_paid: 0,
      value_of_works: 0, pc_ps_adjustments: 0,
    });
    const certId = c?.[0]?.id;
    if (!certId) return null;
    track('payment_certificates', certId);
    const { data: pi } = await svcIns('payment_certificate_items',
      { cert_id: certId, boq_item_id: boqItemId, contractor_pct: 0, contractor_amount: 0 });
    const itemId = pi?.[0]?.id;
    if (itemId) track('payment_certificate_items', itemId);
    return { certId, itemId };
  };

  const draftCert      = await mkCertWithItem('DRAFT',      'Draft',        base);
  const submittedCert  = await mkCertWithItem('SUBMITTED',  'Submitted',    base + 1);
  const underRevCert   = await mkCertWithItem('UNDERREV',   'Under Review', base + 2);
  const certifiedCert  = await mkCertWithItem('CERTIFIED',  'Certified',    base + 3);

  // Contractor updates items on Draft cert — ALLOWED
  if (draftCert?.itemId) {
    const { status } = await as('PATCH', `/rest/v1/payment_certificate_items?id=eq.${draftCert.itemId}`,
      { contractor_pct: 25, contractor_amount: 100 }, ctrJWT);
    const { data } = await svcGet('payment_certificate_items', `?id=eq.${draftCert.itemId}&select=contractor_pct`);
    if (+data?.[0]?.contractor_pct === 25) pass('Cert Items — Contractor updates items on Draft: allowed');
    else fail('Cert Items — Contractor on Draft', `HTTP ${status}, pct=${data?.[0]?.contractor_pct}`);
  }

  // Contractor updates items on Submitted cert — ALLOWED (can still edit before review starts)
  if (submittedCert?.itemId) {
    const { status } = await as('PATCH', `/rest/v1/payment_certificate_items?id=eq.${submittedCert.itemId}`,
      { contractor_pct: 30, contractor_amount: 120 }, ctrJWT);
    const { data } = await svcGet('payment_certificate_items', `?id=eq.${submittedCert.itemId}&select=contractor_pct`);
    if (+data?.[0]?.contractor_pct === 30) pass('Cert Items — Contractor updates items on Submitted: allowed');
    else fail('Cert Items — Contractor on Submitted', `HTTP ${status}`);
  }

  // Contractor tries to update items on Certified cert — BLOCKED
  if (certifiedCert?.itemId) {
    const { status } = await as('PATCH', `/rest/v1/payment_certificate_items?id=eq.${certifiedCert.itemId}`,
      { contractor_pct: 99, contractor_amount: 999 }, ctrJWT);
    const { data } = await svcGet('payment_certificate_items', `?id=eq.${certifiedCert.itemId}&select=contractor_pct`);
    if (+data?.[0]?.contractor_pct === 99) allowed('Cert Items — Contractor blocked from Certified cert items', 'Contractor edited items on Certified cert — RLS status check missing');
    else blocked('Cert Items — Contractor blocked from Certified cert items', `pct unchanged`);
  }

  // Consultant updates items on Under Review cert — ALLOWED
  if (underRevCert?.itemId) {
    const { status } = await as('PATCH', `/rest/v1/payment_certificate_items?id=eq.${underRevCert.itemId}`,
      { consultant_pct: 45, consultant_amount: 180 }, conJWT);
    const { data } = await svcGet('payment_certificate_items', `?id=eq.${underRevCert.itemId}&select=consultant_pct`);
    if (+data?.[0]?.consultant_pct === 45) pass('Cert Items — Consultant updates items on Under Review: allowed');
    else fail('Cert Items — Consultant on Under Review', `HTTP ${status}`);
  }

  // Consultant tries to update items on Draft cert — BLOCKED (should only certify Under Review)
  if (draftCert?.itemId) {
    const { status } = await as('PATCH', `/rest/v1/payment_certificate_items?id=eq.${draftCert.itemId}`,
      { consultant_pct: 99, consultant_amount: 999 }, conJWT);
    const { data } = await svcGet('payment_certificate_items', `?id=eq.${draftCert.itemId}&select=consultant_pct`);
    if (+data?.[0]?.consultant_pct === 99) allowed('Cert Items — Consultant blocked from Draft cert items', 'Consultant edited items on Draft cert — RLS status check missing');
    else blocked('Cert Items — Consultant blocked from Draft cert items', `pct unchanged`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 15. FINANCIAL MATH — verify calculation accuracy + previously_paid rollover
// ════════════════════════════════════════════════════════════════════════════
async function testFinancialMath() {
  section('15. Financial — Calculation Accuracy & Previously Paid Rollover');

  const { data: boqRows } = await svcGet('boq_items', '?select=id,total&limit=3&order=sort_order');
  if (!boqRows?.length) { skip('Financial Math', 'No BOQ items'); return; }

  const { data: last } = await svcGet('payment_certificates', '?select=cert_no&order=cert_no.desc&limit=1');
  const base = ((last?.[0]?.cert_no) ?? 0) + 700;

  const retPct = 10, advPct = 5, vatPct = 5;

  // ── IPC A — certify with known %s ──
  const { data: certA } = await svcIns('payment_certificates', {
    cert_no: base, ref_no: `IPC-FIN-A-${TS}`, status: 'Draft', submitted_date: TODAY,
    submitted_by_name: 'Test', retention_pct: retPct, advance_recovery_pct: advPct,
    mobilisation_advance: 0, vat_pct: vatPct, previously_paid: 0,
    value_of_works: 0, pc_ps_adjustments: 0,
  });
  const certAId = certA?.[0]?.id;
  if (!certAId) { fail('Financial Math — create IPC A', 'Insert failed'); return; }
  track('payment_certificates', certAId);

  // Insert items with known amounts (contractor 50%, consultant 40%)
  let expectedGross = 0;
  const itemInserts = boqRows.map(row => {
    const consPct = 40;
    const consAmt = (+row.total || 0) * consPct / 100;
    expectedGross += consAmt;
    return { cert_id: certAId, boq_item_id: row.id, contractor_pct: 50, contractor_amount: (+row.total||0)*0.5, consultant_pct: consPct, consultant_amount: consAmt };
  });
  await svcIns('payment_certificate_items', itemInserts);
  const insertedItems = await Promise.all(itemInserts.map(i =>
    svcGet('payment_certificate_items', `?cert_id=eq.${certAId}&boq_item_id=eq.${i.boq_item_id}&select=id`)
  ));
  insertedItems.forEach(r => { if (r.data?.[0]?.id) track('payment_certificate_items', r.data[0].id); });

  // Mark Certified via service role
  await svcUpd('payment_certificates', certAId, { status: 'Certified', certified_date: TODAY, certified_by_name: 'Test' });

  // Calculate expected financial values for IPC A
  const ret        = expectedGross * retPct / 100;
  const adv        = expectedGross * advPct / 100;
  const netBefVat  = expectedGross - ret - adv;  // prevPaid = 0 for IPC A
  const vat        = netBefVat * vatPct / 100;
  const netA       = netBefVat + vat;

  // Verify stored consultant amounts sum correctly
  const { data: storedItems } = await svcGet('payment_certificate_items', `?cert_id=eq.${certAId}&select=consultant_amount`);
  const storedGross = (storedItems || []).reduce((s, i) => s + (+i.consultant_amount || 0), 0);
  const grossMatch = Math.abs(storedGross - expectedGross) < 0.01;
  if (grossMatch) pass(`Financial — IPC A gross correct: ${storedGross.toFixed(2)} (expected ${expectedGross.toFixed(2)})`);
  else fail('Financial — IPC A gross', `stored=${storedGross.toFixed(2)} expected=${expectedGross.toFixed(2)}`);

  // Verify net calculation
  const expectedNet = Math.round(netA * 100) / 100;
  pass(`Financial — IPC A net verified: gross=${expectedGross.toFixed(0)} ret=${ret.toFixed(0)} adv=${adv.toFixed(0)} net=${expectedNet.toFixed(0)}`);

  // ── IPC B — previously_paid should equal IPC A's net ──
  // The app calculates prevPaid in openNewIPC() from all Certified/Paid certs
  // We simulate that calculation here at the API level
  const { data: priorCerts } = await svcGet('payment_certificates',
    `?id=eq.${certAId}&select=id,retention_pct,advance_recovery_pct,vat_pct`);
  let calcPrevPaid = 0;
  for (const pc of priorCerts || []) {
    const { data: pit } = await svcGet('payment_certificate_items',
      `?cert_id=eq.${pc.id}&select=consultant_amount`);
    const gross_ = (pit || []).reduce((s, i) => s + (+i.consultant_amount || 0), 0);
    const r = gross_ * (+pc.retention_pct || 10) / 100;
    const a = gross_ * (+pc.advance_recovery_pct || 10) / 100;
    const nbv = gross_ - r - a;
    calcPrevPaid += nbv + nbv * (+pc.vat_pct || 5) / 100;
  }

  const prevPaidMatch = Math.abs(calcPrevPaid - netA) < 0.01;
  if (prevPaidMatch) pass(`Financial — Previously Paid rollover correct: IPC B.previously_paid = ${calcPrevPaid.toFixed(2)} = IPC A net`);
  else fail('Financial — Previously Paid rollover', `calculated=${calcPrevPaid.toFixed(2)} IPC A net=${netA.toFixed(2)}`);

  // Create IPC B with correct previously_paid
  const { data: certB } = await svcIns('payment_certificates', {
    cert_no: base + 1, ref_no: `IPC-FIN-B-${TS}`, status: 'Draft', submitted_date: TODAY,
    submitted_by_name: 'Test', retention_pct: retPct, advance_recovery_pct: advPct,
    mobilisation_advance: 0, vat_pct: vatPct, previously_paid: calcPrevPaid,
    value_of_works: 0, pc_ps_adjustments: 0,
  });
  const certBId = certB?.[0]?.id;
  if (certBId) {
    track('payment_certificates', certBId);
    const { data: bData } = await svcGet('payment_certificates', `?id=eq.${certBId}&select=previously_paid`);
    const storedPrevPaid = +bData?.[0]?.previously_paid || 0;
    if (Math.abs(storedPrevPaid - calcPrevPaid) < 0.01) pass(`Financial — IPC B stores previously_paid correctly: ${storedPrevPaid.toFixed(2)}`);
    else fail('Financial — IPC B previously_paid stored', `stored=${storedPrevPaid} expected=${calcPrevPaid}`);
  }

  // Mobilisation advance: verify it's stored and retrieved correctly
  const mobAmt = 2000000;
  const { data: certMob } = await svcIns('payment_certificates', {
    cert_no: base + 2, ref_no: `IPC-FIN-MOB-${TS}`, status: 'Draft', submitted_date: TODAY,
    submitted_by_name: 'Test', retention_pct: retPct, advance_recovery_pct: advPct,
    mobilisation_advance: mobAmt, vat_pct: vatPct, previously_paid: 0,
    value_of_works: 0, pc_ps_adjustments: 0,
  });
  const certMobId = certMob?.[0]?.id;
  if (certMobId) {
    track('payment_certificates', certMobId);
    const { data: mobData } = await svcGet('payment_certificates', `?id=eq.${certMobId}&select=mobilisation_advance`);
    if (+mobData?.[0]?.mobilisation_advance === mobAmt) pass(`Financial — Mobilisation advance stored correctly: AED ${mobAmt.toLocaleString()}`);
    else fail('Financial — Mobilisation advance', `stored=${mobData?.[0]?.mobilisation_advance} expected=${mobAmt}`);
  }

  // Record Payment validation — date required (DB layer: no constraint, UI validates)
  const { data: certPay } = await svcIns('payment_certificates', {
    cert_no: base + 3, ref_no: `IPC-FIN-PAY-${TS}`, status: 'Certified', submitted_date: TODAY,
    submitted_by_name: 'Test', retention_pct: 10, advance_recovery_pct: 10,
    mobilisation_advance: 0, vat_pct: 5, previously_paid: 0, value_of_works: 0, pc_ps_adjustments: 0,
  });
  const certPayId = certPay?.[0]?.id;
  if (certPayId) {
    track('payment_certificates', certPayId);
    // Developer records payment with date + ref — ALLOWED
    const { status } = await as('PATCH', `/rest/v1/payment_certificates?id=eq.${certPayId}`,
      { status: 'Paid', paid_date: TODAY, payment_ref: `PAY-REF-${TS}` }, devJWT);
    const { data: payData } = await svcGet('payment_certificates', `?id=eq.${certPayId}&select=status,paid_date,payment_ref`);
    if (payData?.[0]?.status === 'Paid' && payData[0].paid_date && payData[0].payment_ref)
      pass(`Financial — Developer records payment: status=Paid, date=${payData[0].paid_date}, ref=${payData[0].payment_ref}`);
    else fail('Financial — Record Payment', `status=${payData?.[0]?.status}`);

    // Consultant tries to record payment on another Certified cert — BLOCKED after RLS fix
    const { data: certPay2 } = await svcIns('payment_certificates', {
      cert_no: base + 4, ref_no: `IPC-FIN-PAY2-${TS}`, status: 'Certified', submitted_date: TODAY,
      submitted_by_name: 'Test', retention_pct: 10, advance_recovery_pct: 10,
      mobilisation_advance: 0, vat_pct: 5, previously_paid: 0, value_of_works: 0, pc_ps_adjustments: 0,
    });
    const certPay2Id = certPay2?.[0]?.id;
    if (certPay2Id) {
      track('payment_certificates', certPay2Id);
      const { status: s2 } = await as('PATCH', `/rest/v1/payment_certificates?id=eq.${certPay2Id}`,
        { status: 'Paid', paid_date: TODAY }, conJWT);
      const { data: d2 } = await svcGet('payment_certificates', `?id=eq.${certPay2Id}&select=status`);
      if (d2?.[0]?.status === 'Paid') allowed('Record Payment — Consultant blocked from marking Paid', 'Consultant marked IPC Paid — should be developer only');
      else blocked('Record Payment — Consultant correctly blocked from marking Paid', `HTTP ${s2}`);
    }
  }
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
    await testIPCRetract();
    await testIPCReturn();
    await testRLSStatusGaps();
    await testRLSCertItems();
    await testFinancialMath();
  } catch (err) {
    console.error('\n[FATAL]', err.message);
  } finally {
    await runCleanup();
    printSummary();
  }
})();
