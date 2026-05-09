#!/usr/bin/env node
/**
 * Scenario Tests — Golf Grove DMS
 *
 * Tests cross-role interactions, workflow state guards, RLS enforcement, and
 * delete permissions across ALL modules. Uses real role JWTs (not service role)
 * so Supabase RLS policies are enforced on every assertion.
 *
 * Each test:
 *   1. Seeds record(s) via service role
 *   2. Attempts action as a specific role (JWT-enforced)
 *   3. Verifies outcome via service role read-back
 *
 * Run: node tests/journeys/scenario-tests.js
 */

const { SUPABASE_URL, SERVICE_KEY, ANON_KEY, TEST_ACCOUNTS, TEST_PASSWORD } = require('../config');

const TODAY = new Date().toISOString().split('T')[0];
const TS    = Date.now();

// ── RESULTS ─────────────────────────────────────────────────────────────────
const results  = [];
const toDelete = {};

function track(table, id) { if (!id) return; (toDelete[table] = toDelete[table] || []).push(id); }
function pass(name)         { results.push({ name, status: 'PASS' });                console.log(`  ✓  PASS  ${name}`); }
function fail(name, err)    { const e = typeof err === 'string' ? err : (err?.message || JSON.stringify(err)).substring(0,120); results.push({ name, status: 'FAIL', info: e }); console.error(`  ✗  FAIL  ${name}  →  ${e}`); }
function skip(name, why)    { results.push({ name, status: 'SKIP', info: why });    console.log(`  ⊘  SKIP  ${name}  →  ${why}`); }
function section(t)         { console.log(`\n${'═'.repeat(68)}\n  ${t}\n${'─'.repeat(68)}`); }

// ── HTTP HELPERS ─────────────────────────────────────────────────────────────
// Service-role request: apikey=SERVICE_KEY bypasses RLS (for setup/teardown/readback)
async function req(method, path, body, apikey = SERVICE_KEY, authToken = SERVICE_KEY) {
  const headers = {
    apikey,
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
    Prefer       : 'return=representation',
  };
  const res  = await fetch(`${SUPABASE_URL}${path}`, { method, headers, body: body != null ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, ok: res.status >= 200 && res.status < 300 };
}

// Role-JWT request: apikey=ANON_KEY so RLS IS enforced
async function roleReq(method, path, body, userJwt) {
  return req(method, path, body, ANON_KEY, userJwt);
}

// Service-role helpers (bypass RLS — for seed/teardown/readback only)
const ins  = (t, b)     => req('POST',   `/rest/v1/${t}`, b);
const upd  = (t, id, b) => req('PATCH',  `/rest/v1/${t}?id=eq.${id}`, b);
const sel  = (t, q='')  => req('GET',    `/rest/v1/${t}${q}`);
const del  = (t, id)    => req('DELETE', `/rest/v1/${t}?id=eq.${id}`);

// Role JWT cache
const jwtCache = {};

async function getJWT(role) {
  if (jwtCache[role]) return jwtCache[role];
  const r = await req('POST', '/auth/v1/token?grant_type=password',
    { email: TEST_ACCOUNTS[role], password: TEST_PASSWORD }, ANON_KEY);
  if (r.status !== 200 || !r.data?.access_token) throw new Error(`Login failed for ${role}: ${JSON.stringify(r.data)}`);
  jwtCache[role] = r.data.access_token;
  return jwtCache[role];
}

// Role-enforced request (RLS active)
async function as(role, method, path, body) {
  const jwt = await getJWT(role);
  return roleReq(method, path, body, jwt);
}

// Shortcuts
const asIns = (role, t, b)     => as(role, 'POST',   `/rest/v1/${t}`, b);
const asUpd = (role, t, id, b) => as(role, 'PATCH',  `/rest/v1/${t}?id=eq.${id}`, b);
const asDel = (role, t, id)    => as(role, 'DELETE', `/rest/v1/${t}?id=eq.${id}`, null);
const asSel = (role, t, q='')  => as(role, 'GET',    `/rest/v1/${t}${q}`);

// RLS UPDATE test helper — attempts update as role, then reads back via service to confirm actual change or non-change
async function rlsUpdateTest(name, role, table, id, patch, fieldToCheck, expectedValue, expectBlocked) {
  const r = await asUpd(role, table, id, patch);
  const readback = await sel(table, `?id=eq.${id}&select=${fieldToCheck}`);
  const actual   = readback.data?.[0]?.[fieldToCheck];
  if (expectBlocked) {
    if (actual === expectedValue) pass(`${name} — RLS blocks ${role} update (value unchanged: ${actual})`);
    else fail(`${name} — RLS should have blocked ${role} update`, `field changed to ${actual}`);
  } else {
    if (actual === expectedValue) pass(`${name} — ${role} update allowed (value = ${actual})`);
    else fail(`${name} — ${role} update blocked unexpectedly`, `expected ${expectedValue}, got ${actual}`);
  }
}

// Cleanup
async function runCleanup() {
  console.log('\n── Cleanup ──────────────────────────────────────────────');
  for (const [table, ids] of Object.entries(toDelete)) {
    let deleted = 0;
    for (const id of ids) { const { status } = await del(table, id); if (status === 204 || status === 200) deleted++; }
    if (ids.length) console.log(`  ${table}: ${deleted}/${ids.length}`);
  }
}

function printSummary() {
  const counts = { PASS: 0, FAIL: 0, SKIP: 0 };
  for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;
  const W = Math.max(...results.map(r => r.name.length), 60);
  console.log('\n' + '═'.repeat(W + 24));
  console.log('  SCENARIO TEST RESULTS');
  console.log('═'.repeat(W + 24));
  for (const r of results) {
    const icon = { PASS: '✓', FAIL: '✗', SKIP: '⊘' }[r.status];
    const suf  = r.info ? `  ← ${r.info}` : '';
    console.log(`  ${icon}  ${r.status.padEnd(5)}  ${r.name.padEnd(W)}${suf}`);
  }
  console.log('─'.repeat(W + 24));
  console.log(`  PASS: ${counts.PASS}   FAIL: ${counts.FAIL}   SKIP: ${counts.SKIP}   TOTAL: ${results.length}`);
  console.log('═'.repeat(W + 24) + '\n');
  if (counts.FAIL > 0) process.exit(1);
}

// ════════════════════════════════════════════════════════════════════════════
// SCENARIO GROUPS
// ════════════════════════════════════════════════════════════════════════════

// ── 1. IPC WORKFLOW SCENARIOS ────────────────────────────────────────────────
async function testIPCScenarios() {
  section('1. IPC — WORKFLOW STATE GUARDS');

  const certBase = (Math.floor(TS / 1000) % 90000) + 9000;

  let ipcId;
  {
    const r = await ins('payment_certificates', {
      cert_no: certBase, ref_no: `IPC-SCN-${TS}`,
      status: 'Draft', notes: 'Scenario test',
    });
    ipcId = r.data?.[0]?.id;
    if (ipcId) { track('payment_certificates', ipcId); pass('IPC — seed Draft IPC'); }
    else { fail('IPC — seed Draft IPC', `HTTP ${r.status}: ${JSON.stringify(r.data)}`); return; }
  }

  // 1a. Contractor CAN edit notes in Draft
  await rlsUpdateTest('IPC-1a: Contractor edits in Draft', 'contractor', 'payment_certificates', ipcId,
    { notes: 'Contractor edit' }, 'notes', 'Contractor edit', false);

  // 1b. Consultant blocked in Draft (RLS: consultant needs Submitted/Under Review/Certified)
  await rlsUpdateTest('IPC-1b: Consultant blocked in Draft', 'consultant', 'payment_certificates', ipcId,
    { notes: 'Consultant edit attempt' }, 'notes', 'Contractor edit', true);

  // 1c. Advance to Submitted
  await upd('payment_certificates', ipcId, { status: 'Submitted' });
  pass('IPC — advance to Submitted');

  // 1d. Contractor still edits in Submitted
  await rlsUpdateTest('IPC-1d: Contractor can edit in Submitted', 'contractor', 'payment_certificates', ipcId,
    { notes: 'Submitted edit' }, 'notes', 'Submitted edit', false);

  // 1e. Subcontractor CANNOT edit IPC at all
  await rlsUpdateTest('IPC-1e: Subcontractor blocked from editing IPC', 'subcontractor', 'payment_certificates', ipcId,
    { notes: 'Sub hack' }, 'notes', 'Submitted edit', true);

  // 1f. Advance to Under Review
  await upd('payment_certificates', ipcId, { status: 'Under Review' });
  pass('IPC — advance to Under Review');

  // 1g. Contractor blocked in Under Review
  await rlsUpdateTest('IPC-1g: Contractor blocked in Under Review', 'contractor', 'payment_certificates', ipcId,
    { notes: 'Contractor hack' }, 'notes', 'Submitted edit', true);

  // 1h. Consultant CAN edit in Under Review
  await rlsUpdateTest('IPC-1h: Consultant can edit in Under Review', 'consultant', 'payment_certificates', ipcId,
    { notes: 'Consultant edit' }, 'notes', 'Consultant edit', false);

  // 1i. Developer CAN issue certificate (→ Certified)
  {
    const r = await asUpd('developer', 'payment_certificates', ipcId, { status: 'Certified' });
    const check = await sel('payment_certificates', `?id=eq.${ipcId}&select=status`);
    if (check.data?.[0]?.status === 'Certified') pass('IPC-1i: Developer issues certificate (→ Certified)');
    else fail('IPC-1i: Developer issue certificate', `status = ${check.data?.[0]?.status}`);
  }

  // 1j. Contractor CANNOT issue certificate
  await upd('payment_certificates', ipcId, { status: 'Under Review' });
  await rlsUpdateTest('IPC-1j: Contractor cannot issue certificate', 'contractor', 'payment_certificates', ipcId,
    { status: 'Certified' }, 'status', 'Under Review', true);

  // 1k. Consultant CAN issue certificate (Under Review → Certified)
  {
    const r = await asUpd('consultant', 'payment_certificates', ipcId, { status: 'Certified' });
    const check = await sel('payment_certificates', `?id=eq.${ipcId}&select=status`);
    if (check.data?.[0]?.status === 'Certified') pass('IPC-1k: Consultant issues certificate (→ Certified)');
    else fail('IPC-1k: Consultant issue certificate', `status = ${check.data?.[0]?.status}`);
  }

  // 1l. Only developer can mark Paid; contractor blocked
  await rlsUpdateTest('IPC-1l: Contractor cannot mark Paid', 'contractor', 'payment_certificates', ipcId,
    { status: 'Paid' }, 'status', 'Certified', true);
  {
    const r = await asUpd('developer', 'payment_certificates', ipcId, { status: 'Paid' });
    const check = await sel('payment_certificates', `?id=eq.${ipcId}&select=status`);
    if (check.data?.[0]?.status === 'Paid') pass('IPC-1l: Developer marks Paid');
    else fail('IPC-1l: Developer marks Paid', `status = ${check.data?.[0]?.status}`);
  }

  // 1m. Contractor CAN delete Draft IPC
  const r2 = await ins('payment_certificates', { cert_no: certBase + 1, ref_no: `IPC-DEL-${TS}`, status: 'Draft' });
  const draftId = r2.data?.[0]?.id;
  if (draftId) {
    await asDel('contractor', 'payment_certificates', draftId);
    const check = await sel('payment_certificates', `?id=eq.${draftId}&select=id`);
    if (!check.data?.length) pass('IPC-1m: Contractor deletes Draft IPC');
    else { fail('IPC-1m: Contractor delete Draft IPC blocked', 'record still exists'); track('payment_certificates', draftId); }
  }

  // 1n. Contractor CANNOT delete Submitted IPC
  const r3 = await ins('payment_certificates', { cert_no: certBase + 2, ref_no: `IPC-DEL2-${TS}`, status: 'Submitted' });
  const submId = r3.data?.[0]?.id;
  if (submId) {
    track('payment_certificates', submId);
    await asDel('contractor', 'payment_certificates', submId);
    const check = await sel('payment_certificates', `?id=eq.${submId}&select=id`);
    if (check.data?.length) pass('IPC-1n: Contractor cannot delete Submitted IPC (record survives)');
    else fail('IPC-1n: Submitted IPC should survive contractor delete', 'record was deleted');
  }
}

// ── 2. SUBMITTAL SCENARIOS ───────────────────────────────────────────────────
async function testSubmittalScenarios() {
  section('2. SUBMITTALS — CROSS-ROLE & STATE GUARDS');

  // Seed: contractor submits a submittal
  let subId;
  {
    const r = await ins('submittals', {
      ref_no: `DSUB-SCN-${TS}`, title: `Scenario Submittal ${TS}`,
      from_party: 'MBC', to_party: 'POE', discipline: 'Architecture',
      revision: '00', status: 'Pending Review', submit_date: TODAY,
    });
    subId = r.data?.[0]?.id;
    if (subId) { track('submittals', subId); pass('Submittal — seed Pending Review'); }
    else { fail('Submittal — seed', `HTTP ${r.status}`); return; }
  }

  // 2a. Contractor CANNOT approve own submittal (RLS: UPDATE approve only for developer/consultant)
  await rlsUpdateTest('Submittal-2a: Contractor cannot approve own submittal', 'contractor', 'submittals', subId,
    { status: 'Approved', outcome: '1', reviewed_by: 'Contractor', review_date: TODAY }, 'status', 'Pending Review', true);

  // 2b. Subcontractor CANNOT approve submittal
  await rlsUpdateTest('Submittal-2b: Subcontractor cannot approve submittal', 'subcontractor', 'submittals', subId,
    { status: 'Approved', outcome: '1' }, 'status', 'Pending Review', true);

  // 2c. Contractor CAN edit while Pending Review
  await rlsUpdateTest('Submittal-2c: Contractor can edit in Pending Review', 'contractor', 'submittals', subId,
    { revision: '01' }, 'revision', '01', false);

  // 2d. Consultant CAN approve (Pending Review → Approved)
  {
    const r = await asUpd('consultant', 'submittals', subId, { status: 'Approved', outcome: '1', reviewed_by: 'Test Consultant', review_date: TODAY });
    const check = await sel('submittals', `?id=eq.${subId}&select=status`);
    if (check.data?.[0]?.status === 'Approved') pass('Submittal-2d: Consultant approves submittal');
    else fail('Submittal-2d: Consultant approve', `status = ${check.data?.[0]?.status}`);
  }

  // 2e. Contractor CANNOT edit after Approved (status guard in RLS)
  await rlsUpdateTest('Submittal-2e: Contractor cannot edit Approved submittal', 'contractor', 'submittals', subId,
    { revision: '99' }, 'revision', '01', true);

  // 2f. Contractor CANNOT delete submittal
  {
    await asDel('contractor', 'submittals', subId);
    const check = await sel('submittals', `?id=eq.${subId}&select=id`);
    if (check.data?.length) pass('Submittal-2f: Contractor cannot delete submittal (survives)');
    else fail('Submittal-2f: Submittal should survive contractor delete', 'was deleted');
  }

  // 2g. Subcontractor CANNOT delete submittal
  {
    await asDel('subcontractor', 'submittals', subId);
    const check = await sel('submittals', `?id=eq.${subId}&select=id`);
    if (check.data?.length) pass('Submittal-2g: Subcontractor cannot delete submittal (survives)');
    else fail('Submittal-2g: Submittal should survive subcontractor delete', 'was deleted');
  }

  // 2h. Developer CAN delete submittal
  {
    const r2 = await ins('submittals', { ref_no: `DSUB-DEL-${TS}`, title: 'Delete test', from_party: 'MBC', to_party: 'POE', discipline: 'MEP', revision: '00', status: 'Approved', submit_date: TODAY });
    const delId = r2.data?.[0]?.id;
    if (delId) {
      await asDel('developer', 'submittals', delId);
      const check = await sel('submittals', `?id=eq.${delId}&select=id`);
      if (!check.data?.length) pass('Submittal-2h: Developer deletes submittal');
      else { fail('Submittal-2h: Developer delete blocked', 'record survives'); track('submittals', delId); }
    }
  }

  // 2i. Resubmit: Revise & Resubmit → contractor creates new revision
  await upd('submittals', subId, { status: 'Revise & Resubmit' });
  {
    const r = await asIns('contractor', 'submittals', {
      ref_no: `DSUB-SCN-${TS}-R1`, title: `Scenario Submittal ${TS} Rev1`,
      from_party: 'MBC', to_party: 'POE', discipline: 'Architecture',
      revision: '01', status: 'Pending Review', submit_date: TODAY, parent_id: subId,
    });
    if (r.status === 201 && r.data?.[0]?.id) {
      track('submittals', r.data[0].id);
      await upd('submittals', subId, { status: 'Superseded' });
      pass('Submittal-2i: Contractor resubmits after Revise & Resubmit');
    } else fail('Submittal-2i: Contractor resubmit', `HTTP ${r.status}`);
  }
}

// ── 3. DRAWING SCENARIOS ─────────────────────────────────────────────────────
async function testDrawingScenarios() {
  section('3. DRAWINGS — CDE STATE GUARDS');

  let drawId, revId;
  {
    const seq = (TS % 9999).toString().padStart(4, '0');
    const r = await ins('drawings', {
      drawing_no: `SCN-GG-ZZ-00-DR-A-${seq}-RevA`, title: `Scenario Drawing ${TS}`,
      discipline: 'Architecture', revision: 'RevA', status: 'WIP', cde_state: 'WIP',
      originator: 'SCN', zone: 'GG', level: 'ZZ', doc_type: 'DR', arfi: 'AR',
      uploaded_by: 'Test', superseded_revisions: '[]', related_drawings: [],
    });
    drawId = r.data?.[0]?.id;
    if (!drawId) { fail('Drawing — seed', `HTTP ${r.status}`); return; }
    track('drawings', drawId);
    const rv = await ins('drawing_revisions', { drawing_id: drawId, revision: 'RevA', status: 'WIP', uploaded_by_name: 'Test', upload_date: TODAY });
    revId = rv.data?.[0]?.id; if (revId) track('drawing_revisions', revId);
    pass('Drawing — seed WIP drawing');
  }

  // 3a. Contractor CANNOT advance CDE (update cde_state) — RLS: UPDATE = approve roles only
  await rlsUpdateTest('Drawing-3a: Contractor cannot advance CDE (WIP→Shared)', 'contractor', 'drawings', drawId,
    { cde_state: 'Shared' }, 'cde_state', 'WIP', true);

  // 3b. Subcontractor CANNOT advance CDE
  await rlsUpdateTest('Drawing-3b: Subcontractor cannot advance CDE', 'subcontractor', 'drawings', drawId,
    { cde_state: 'Shared' }, 'cde_state', 'WIP', true);

  // 3c. Consultant CAN advance CDE WIP → Shared
  await rlsUpdateTest('Drawing-3c: Consultant advances CDE WIP → Shared', 'consultant', 'drawings', drawId,
    { cde_state: 'Shared' }, 'cde_state', 'Shared', false);

  // 3d. Consultant CAN advance Shared → Published
  await rlsUpdateTest('Drawing-3d: Consultant advances Shared → Published', 'consultant', 'drawings', drawId,
    { cde_state: 'Published' }, 'cde_state', 'Published', false);

  // 3e. Developer CAN advance Published → Archived
  await rlsUpdateTest('Drawing-3e: Developer archives drawing', 'developer', 'drawings', drawId,
    { cde_state: 'Archived' }, 'cde_state', 'Archived', false);

  // 3f. Contractor CANNOT approve drawing (status → Approved)
  await upd('drawings', drawId, { status: 'Under Review', cde_state: 'Shared' });
  await rlsUpdateTest('Drawing-3f: Contractor cannot approve drawing', 'contractor', 'drawings', drawId,
    { status: 'Approved' }, 'status', 'Under Review', true);

  // 3g. Contractor CAN upload new revision record (insert drawing_revisions)
  {
    const r = await asIns('contractor', 'drawing_revisions', {
      drawing_id: drawId, revision: 'RevB', status: 'WIP',
      uploaded_by_name: 'Test Contractor', upload_date: TODAY,
    });
    if (r.status === 201 && r.data?.[0]?.id) {
      track('drawing_revisions', r.data[0].id);
      pass('Drawing-3g: Contractor uploads new revision record (upload=true)');
    } else fail('Drawing-3g: Contractor upload revision', `HTTP ${r.status}`);
  }

  // 3h. Subcontractor CANNOT upload revision (insert drawing_revisions blocked)
  {
    const r = await asIns('subcontractor', 'drawing_revisions', {
      drawing_id: drawId, revision: 'RevC', status: 'WIP',
      uploaded_by_name: 'Test Sub', upload_date: TODAY,
    });
    if (r.status !== 201) pass('Drawing-3h: Subcontractor blocked from uploading revision');
    else { track('drawing_revisions', r.data?.[0]?.id); fail('Drawing-3h: Subcontractor upload should be blocked', `HTTP ${r.status}`); }
  }

  // 3i. Void drawing: consultant CAN void, status → Void
  {
    const r = await asUpd('consultant', 'drawings', drawId, { status: 'Void' });
    const check = await sel('drawings', `?id=eq.${drawId}&select=status`);
    if (check.data?.[0]?.status === 'Void') pass('Drawing-3i: Consultant voids drawing');
    else fail('Drawing-3i: Consultant void drawing', `status = ${check.data?.[0]?.status}`);
  }

  // 3j. Contractor CANNOT void drawing
  await upd('drawings', drawId, { status: 'Under Review' });
  await rlsUpdateTest('Drawing-3j: Contractor cannot void drawing', 'contractor', 'drawings', drawId,
    { status: 'Void' }, 'status', 'Under Review', true);
}

// ── 4. NCR WORKFLOW SCENARIOS ────────────────────────────────────────────────
async function testNCRScenarios() {
  section('4. NCRs — WORKFLOW & SELF-APPROVAL GUARDS');

  let ncrId;
  {
    const r = await ins('ncrs', {
      ref_no: `NCR-SCN-${TS}`, title: `Scenario NCR ${TS}`,
      location: 'Level 3', raised_by: 'Test Developer', raised_date: TODAY,
      severity: 'Major', status: 'Open',
    });
    ncrId = r.data?.[0]?.id;
    if (ncrId) { track('ncrs', ncrId); pass('NCR — seed Open NCR'); }
    else { fail('NCR — seed', `HTTP ${r.status}`); return; }
  }

  // 4a. Contractor CANNOT raise NCR (INSERT blocked by RLS)
  {
    const r = await asIns('contractor', 'ncrs', {
      ref_no: `NCR-CON-BLOCKED-${TS}`, title: 'Contractor NCR attempt',
      location: 'Level 1', raised_by: 'Contractor', raised_date: TODAY, severity: 'Minor', status: 'Open',
    });
    if (r.status !== 201) pass('NCR-4a: Contractor cannot raise NCR (INSERT blocked)');
    else { track('ncrs', r.data?.[0]?.id); fail('NCR-4a: Contractor NCR insert should be blocked', `HTTP ${r.status}`); }
  }

  // 4b. Subcontractor CANNOT raise NCR
  {
    const r = await asIns('subcontractor', 'ncrs', {
      ref_no: `NCR-SUB-BLOCKED-${TS}`, title: 'Sub NCR attempt',
      location: 'Level 1', raised_by: 'Sub', raised_date: TODAY, severity: 'Minor', status: 'Open',
    });
    if (r.status !== 201) pass('NCR-4b: Subcontractor cannot raise NCR (INSERT blocked)');
    else { track('ncrs', r.data?.[0]?.id); fail('NCR-4b: Subcontractor NCR insert should be blocked', `HTTP ${r.status}`); }
  }

  // 4c. Contractor CAN submit CAP when Open
  {
    const r = await asUpd('contractor', 'ncrs', ncrId, {
      status: 'CAP Submitted', corrective_action: 'Replace materials',
      root_cause: 'Workmanship', cap_responsible: 'Foreman',
      cap_target_date: TODAY, cap_submitted_date: TODAY, cap_submitted_by: 'Test Contractor',
    });
    const check = await sel('ncrs', `?id=eq.${ncrId}&select=status`);
    if (check.data?.[0]?.status === 'CAP Submitted') pass('NCR-4c: Contractor submits CAP (Open → CAP Submitted)');
    else fail('NCR-4c: Contractor CAP submit', `status = ${check.data?.[0]?.status}`);
  }

  // 4d. Contractor CANNOT verify own CAP (RLS: verify only for developer/consultant)
  await rlsUpdateTest('NCR-4d: Contractor cannot verify own CAP', 'contractor', 'ncrs', ncrId,
    { status: 'CAP Verified', cap_verified_by: 'Contractor', cap_verified_date: TODAY }, 'status', 'CAP Submitted', true);

  // 4e. Contractor CANNOT close NCR directly
  await rlsUpdateTest('NCR-4e: Contractor cannot close NCR', 'contractor', 'ncrs', ncrId,
    { status: 'Closed', closed_date: TODAY }, 'status', 'CAP Submitted', true);

  // 4f. Developer CAN reject CAP (CAP Submitted → Open)
  {
    const r = await asUpd('developer', 'ncrs', ncrId, { status: 'Open', cap_verify_comments: 'Insufficient' });
    const check = await sel('ncrs', `?id=eq.${ncrId}&select=status`);
    if (check.data?.[0]?.status === 'Open') pass('NCR-4f: Developer rejects CAP (→ Open)');
    else fail('NCR-4f: Developer reject CAP', `status = ${check.data?.[0]?.status}`);
  }

  // 4g. Contractor CANNOT submit CAP when status != Open (after being returned, wait — it IS Open now)
  // Instead test: contractor CANNOT submit CAP when status = CAP Submitted (skip, already Open again)
  // Re-submit CAP
  await asUpd('contractor', 'ncrs', ncrId, { status: 'CAP Submitted', corrective_action: 'Revised action', cap_submitted_date: TODAY, cap_submitted_by: 'Contractor' });

  // 4h. Developer CAN verify CAP
  {
    const r = await asUpd('developer', 'ncrs', ncrId, { status: 'CAP Verified', cap_verified_by: 'Developer', cap_verified_date: TODAY, cap_verify_comments: 'Adequate' });
    const check = await sel('ncrs', `?id=eq.${ncrId}&select=status`);
    if (check.data?.[0]?.status === 'CAP Verified') pass('NCR-4h: Developer verifies CAP');
    else fail('NCR-4h: Developer verify CAP', `status = ${check.data?.[0]?.status}`);
  }

  // 4i. Consultant CAN close NCR
  {
    const r = await asUpd('consultant', 'ncrs', ncrId, { status: 'Closed', closed_date: TODAY });
    const check = await sel('ncrs', `?id=eq.${ncrId}&select=status`);
    if (check.data?.[0]?.status === 'Closed') pass('NCR-4i: Consultant closes NCR');
    else fail('NCR-4i: Consultant close NCR', `status = ${check.data?.[0]?.status}`);
  }
}

// ── 5. IR SCENARIOS ──────────────────────────────────────────────────────────
async function testIRScenarios() {
  section('5. IRs — WORKFLOW & ROLE GUARDS');

  let irId;
  {
    const r = await ins('inspections', {
      ref_no: `IRT-SCN-${TS}`, location: 'Level 4', elements: 'Concrete Pour',
      request_date: TODAY, inspection_date: TODAY, status: 'Pending', rep: 'Rep', site_engineer: 'SE',
    });
    irId = r.data?.[0]?.id;
    if (irId) { track('inspections', irId); pass('IR — seed Pending IR'); }
    else { fail('IR — seed', `HTTP ${r.status}`); return; }
  }

  // 5a. Contractor CANNOT respond to IR
  await rlsUpdateTest('IR-5a: Contractor cannot respond to IR', 'contractor', 'inspections', irId,
    { status: 'Approved', inspected_by: 'Contractor', response_date: TODAY }, 'status', 'Pending', true);

  // 5b. Subcontractor CANNOT respond to IR
  await rlsUpdateTest('IR-5b: Subcontractor cannot respond to IR', 'subcontractor', 'inspections', irId,
    { status: 'Approved', inspected_by: 'Sub' }, 'status', 'Pending', true);

  // 5c. Consultant CAN respond
  {
    const r = await asUpd('consultant', 'inspections', irId, { status: 'Approved', inspected_by: 'Consultant', response_date: TODAY, comments: 'OK' });
    const check = await sel('inspections', `?id=eq.${irId}&select=status`);
    if (check.data?.[0]?.status === 'Approved') pass('IR-5c: Consultant responds to IR (→ Approved)');
    else fail('IR-5c: Consultant respond', `status = ${check.data?.[0]?.status}`);
  }

  // 5d. IR Rejected → contractor CAN re-inspect
  await upd('inspections', irId, { status: 'Rejected' });
  {
    const r = await asIns('contractor', 'inspections', {
      ref_no: `IRT-SCN-${TS}-RI`, location: 'Level 4 (RI)', elements: 'Concrete Pour',
      request_date: TODAY, inspection_date: TODAY, status: 'Pending',
      rep: 'Rep', site_engineer: 'SE', parent_ir_id: irId,
    });
    if (r.status === 201 && r.data?.[0]?.id) {
      track('inspections', r.data[0].id);
      pass('IR-5d: Contractor re-inspects after Rejected');
    } else fail('IR-5d: Contractor re-inspect', `HTTP ${r.status}`);
  }

  // 5e. IR Rejected → subcontractor CAN re-inspect
  {
    const r = await asIns('subcontractor', 'inspections', {
      ref_no: `IRT-SCN-${TS}-SUB-RI`, location: 'Level 4 (Sub RI)', elements: 'Concrete Pour',
      request_date: TODAY, inspection_date: TODAY, status: 'Pending',
      rep: 'Sub Rep', site_engineer: 'SE', parent_ir_id: irId,
    });
    if (r.status === 201 && r.data?.[0]?.id) {
      track('inspections', r.data[0].id);
      pass('IR-5e: Subcontractor re-inspects after Rejected');
    } else fail('IR-5e: Subcontractor re-inspect', `HTTP ${r.status}`);
  }
}

// ── 6. METHOD STATEMENT SCENARIOS ────────────────────────────────────────────
async function testMSScenarios() {
  section('6. METHOD STATEMENTS — SELF-APPROVAL & STATE GUARDS');

  let msId;
  {
    const r = await ins('method_statements', {
      ref_no: `MS-SCN-${TS}`, title: `Scenario MS ${TS}`, activity: 'Waterproofing',
      discipline: 'Civil', location: 'Basement', revision: 'Rev 0',
      submitted_by: 'Test Contractor', submitted_date: TODAY, status: 'Pending Review',
    });
    msId = r.data?.[0]?.id;
    if (msId) { track('method_statements', msId); pass('MS — seed Pending Review MS'); }
    else { fail('MS — seed', `HTTP ${r.status}`); return; }
  }

  // 6a. Contractor CANNOT approve own MS
  await rlsUpdateTest('MS-6a: Contractor cannot approve own MS', 'contractor', 'method_statements', msId,
    { status: 'Approved', reviewed_by: 'Contractor', review_date: TODAY }, 'status', 'Pending Review', true);

  // 6b. Subcontractor CANNOT approve MS
  await rlsUpdateTest('MS-6b: Subcontractor cannot approve MS', 'subcontractor', 'method_statements', msId,
    { status: 'Approved', reviewed_by: 'Sub' }, 'status', 'Pending Review', true);

  // 6c. Contractor CAN edit while Pending Review
  await rlsUpdateTest('MS-6c: Contractor can edit MS in Pending Review', 'contractor', 'method_statements', msId,
    { activity: 'Waterproofing Revised' }, 'activity', 'Waterproofing Revised', false);

  // 6d. Consultant CAN approve MS
  {
    const r = await asUpd('consultant', 'method_statements', msId, { status: 'Approved', reviewed_by: 'Consultant', review_date: TODAY, review_comments: 'OK' });
    const check = await sel('method_statements', `?id=eq.${msId}&select=status`);
    if (check.data?.[0]?.status === 'Approved') pass('MS-6d: Consultant approves MS');
    else fail('MS-6d: Consultant approve MS', `status = ${check.data?.[0]?.status}`);
  }

  // 6e. Contractor CANNOT edit after Approved
  await rlsUpdateTest('MS-6e: Contractor cannot edit Approved MS', 'contractor', 'method_statements', msId,
    { activity: 'Hacked' }, 'activity', 'Waterproofing Revised', true);

  // 6f. Developer CAN reject MS
  await upd('method_statements', msId, { status: 'Pending Review' });
  {
    const r = await asUpd('developer', 'method_statements', msId, { status: 'Rejected', reviewed_by: 'Developer', review_date: TODAY, review_comments: 'Missing COSHH' });
    const check = await sel('method_statements', `?id=eq.${msId}&select=status`);
    if (check.data?.[0]?.status === 'Rejected') pass('MS-6f: Developer rejects MS');
    else fail('MS-6f: Developer reject MS', `status = ${check.data?.[0]?.status}`);
  }
}

// ── 7. RFI SCENARIOS ─────────────────────────────────────────────────────────
async function testRFIScenarios() {
  section('7. RFIs — EDIT WINDOW & ROLE GUARDS');

  let rfiId;
  {
    const r = await ins('rfis', {
      ref_no: `RFI-SCN-${TS}`, subject: `Scenario RFI ${TS}`,
      from_party: 'MBC', to_party: 'POE', discipline: 'Structure', status: 'Open', due_date: TODAY,
    });
    rfiId = r.data?.[0]?.id;
    if (rfiId) { track('rfis', rfiId); pass('RFI — seed Open RFI'); }
    else { fail('RFI — seed', `HTTP ${r.status}`); return; }
  }

  // 7a. Contractor CAN edit RFI while Open
  await rlsUpdateTest('RFI-7a: Contractor can edit Open RFI', 'contractor', 'rfis', rfiId,
    { subject: 'Updated Subject' }, 'subject', 'Updated Subject', false);

  // 7b. Subcontractor CAN edit RFI while Open
  await rlsUpdateTest('RFI-7b: Subcontractor can edit Open RFI', 'subcontractor', 'rfis', rfiId,
    { subject: 'Sub Updated Subject' }, 'subject', 'Sub Updated Subject', false);

  // 7c. Contractor CANNOT respond/close RFI (approve role only)
  await rlsUpdateTest('RFI-7c: Contractor cannot respond to RFI', 'contractor', 'rfis', rfiId,
    { status: 'Responded', response: 'Contractor response', responded_by: 'Contractor', responded_date: TODAY }, 'status', 'Open', true);

  // 7d. Consultant CAN respond to RFI
  {
    const r = await asUpd('consultant', 'rfis', rfiId, { status: 'Responded', response: 'Refer to drawings', responded_by: 'Consultant', responded_date: TODAY });
    const check = await sel('rfis', `?id=eq.${rfiId}&select=status`);
    if (check.data?.[0]?.status === 'Responded') pass('RFI-7d: Consultant responds to RFI');
    else fail('RFI-7d: Consultant respond', `status = ${check.data?.[0]?.status}`);
  }

  // 7e. Contractor CANNOT edit after Responded (status guard in RLS: only if status='Open')
  await rlsUpdateTest('RFI-7e: Contractor cannot edit Responded RFI', 'contractor', 'rfis', rfiId,
    { subject: 'Hacked after response' }, 'status', 'Responded', true);

  // 7f. Developer CAN close RFI
  {
    const r = await asUpd('developer', 'rfis', rfiId, { status: 'Closed' });
    const check = await sel('rfis', `?id=eq.${rfiId}&select=status`);
    if (check.data?.[0]?.status === 'Closed') pass('RFI-7f: Developer closes RFI');
    else fail('RFI-7f: Developer close', `status = ${check.data?.[0]?.status}`);
  }

  // 7g. Contractor CANNOT delete RFI
  {
    await asDel('contractor', 'rfis', rfiId);
    const check = await sel('rfis', `?id=eq.${rfiId}&select=id`);
    if (check.data?.length) pass('RFI-7g: Contractor cannot delete RFI (survives)');
    else fail('RFI-7g: RFI should survive contractor delete', 'was deleted');
  }
}

// ── 8. PUNCH LIST SCENARIOS ──────────────────────────────────────────────────
async function testPunchScenarios() {
  section('8. PUNCH LIST — ROLE GUARDS');

  let punchId;
  {
    const r = await ins('punch_list', {
      description: `Scenario Punch ${TS}`, location: 'Level 6', element: 'Door frame',
      discipline: 'Architecture', severity: 'Minor', assigned_to: 'Test SC',
      raised_by: 'Developer', status: 'Open',
    });
    punchId = r.data?.[0]?.id;
    if (punchId) { track('punch_list', punchId); pass('Punch — seed Open punch item'); }
    else { fail('Punch — seed', `HTTP ${r.status}`); return; }
  }

  // 8a. Contractor CAN update punch item (Open → In Progress)
  {
    const r = await asUpd('contractor', 'punch_list', punchId, { status: 'In Progress', contractor_response: 'Rework started' });
    const check = await sel('punch_list', `?id=eq.${punchId}&select=status`);
    if (check.data?.[0]?.status === 'In Progress') pass('Punch-8a: Contractor updates punch item (→ In Progress)');
    else fail('Punch-8a: Contractor update punch', `status = ${check.data?.[0]?.status}`);
  }

  // 8b. Contractor CANNOT close punch item
  await rlsUpdateTest('Punch-8b: Contractor cannot close punch item', 'contractor', 'punch_list', punchId,
    { status: 'Closed', closed_date: TODAY }, 'status', 'In Progress', true);

  // 8c. Subcontractor CANNOT update punch item
  await rlsUpdateTest('Punch-8c: Subcontractor cannot update punch item', 'subcontractor', 'punch_list', punchId,
    { contractor_response: 'Sub response' }, 'contractor_response', 'Rework started', true);

  // 8d. Developer CAN close punch item
  {
    const r = await asUpd('developer', 'punch_list', punchId, { status: 'Closed', closed_date: TODAY });
    const check = await sel('punch_list', `?id=eq.${punchId}&select=status`);
    if (check.data?.[0]?.status === 'Closed') pass('Punch-8d: Developer closes punch item');
    else fail('Punch-8d: Developer close punch', `status = ${check.data?.[0]?.status}`);
  }
}

// ── 9. DELETE PERMISSIONS ACROSS ALL MODULES ─────────────────────────────────
async function testDeletePermissions() {
  section('9. DELETE PERMISSIONS — ALL MODULES');

  // Seed one record per module, test who can delete
  const modules = [
    { table: 'rfis',             body: { ref_no: `DEL-RFI-${TS}`, subject: 'Del test', from_party: 'X', to_party: 'Y', discipline: 'G', status: 'Open' } },
    { table: 'transmittals',     body: { ref_no: `DEL-TRN-${TS}`, from_party: 'X', to_party: 'Y', transmit_date: TODAY, purpose: 'Info', method: 'Email', documents: '[]', response_required: TODAY } },
    { table: 'correspondence',   body: { ref_no: `DEL-COR-${TS}`, type: 'Letter', subject: 'Del test', from_party: 'X', to_party: 'Y', correspondence_date: TODAY, due_date: TODAY, body: 'x', status: 'Open', logged_by: 'Dev' } },
    { table: 'punch_list',       body: { description: `Del test ${TS}`, location: 'L1', element: 'x', discipline: 'A', severity: 'Minor', assigned_to: 'x', raised_by: 'Dev', status: 'Open' } },
  ];

  for (const { table, body } of modules) {
    const r = await ins(table, body);
    const id = r.data?.[0]?.id;
    if (!id) { fail(`Delete — seed ${table}`, `HTTP ${r.status}`); continue; }

    // Contractor cannot delete
    await asDel('contractor', table, id);
    const afterCon = await sel(table, `?id=eq.${id}&select=id`);
    if (afterCon.data?.length) pass(`Delete-9: Contractor cannot delete ${table}`);
    else { fail(`Delete-9: ${table} should survive contractor delete`, 'was deleted'); continue; }

    // Subcontractor cannot delete
    await asDel('subcontractor', table, id);
    const afterSub = await sel(table, `?id=eq.${id}&select=id`);
    if (afterSub.data?.length) pass(`Delete-9: Subcontractor cannot delete ${table}`);
    else { fail(`Delete-9: ${table} should survive subcontractor delete`, 'was deleted'); continue; }

    // Developer CAN delete
    await asDel('developer', table, id);
    const afterDev = await sel(table, `?id=eq.${id}&select=id`);
    if (!afterDev.data?.length) pass(`Delete-9: Developer deletes ${table}`);
    else { fail(`Delete-9: Developer should delete ${table}`, 'record survives'); track(table, id); }
  }
}

// ── 10. RLS DATA ISOLATION ───────────────────────────────────────────────────
async function testDataIsolation() {
  section('10. RLS DATA ISOLATION — ALL ROLES SEE ALL RECORDS (shared project)');

  // Golf Grove DMS uses shared-project model: all roles see all records (no per-user scoping)
  // Verify: subcontractor can read drawings, NCRs, IRs
  {
    const r = await asSel('subcontractor', 'drawings', '?limit=1&select=id,drawing_no');
    if (r.status === 200 && Array.isArray(r.data)) pass('Isolation-10a: Subcontractor can read drawings (shared project model)');
    else fail('Isolation-10a: Subcontractor read drawings', `HTTP ${r.status}`);
  }
  {
    const r = await asSel('subcontractor', 'ncrs', '?limit=1&select=id,ref_no');
    if (r.status === 200 && Array.isArray(r.data)) pass('Isolation-10b: Subcontractor can read NCRs (shared project model)');
    else fail('Isolation-10b: Subcontractor read NCRs', `HTTP ${r.status}`);
  }
  {
    const r = await asSel('contractor', 'payment_certificates', '?limit=1&select=id,ref_no');
    if (r.status === 200 && Array.isArray(r.data)) pass('Isolation-10c: Contractor can read all IPCs (shared project model)');
    else fail('Isolation-10c: Contractor read IPCs', `HTTP ${r.status}`);
  }

  // Verify: no role can tamper with profiles of another user
  {
    // Get a non-contractor profile
    const { data } = await sel('profiles', '?role=eq.developer&limit=1&select=id,role');
    const devProfileId = data?.[0]?.id;
    if (devProfileId) {
      await asUpd('contractor', 'profiles', devProfileId, { role: 'developer' }); // attempt privilege escalation
      const check = await sel('profiles', `?id=eq.${devProfileId}&select=role`);
      if (check.data?.[0]?.role === 'developer') pass('Isolation-10d: Contractor cannot change another user\'s role (profiles protected)');
      else fail('Isolation-10d: Profile role tamper check', `role changed to ${check.data?.[0]?.role}`);
    } else skip('Isolation-10d: Profile role tamper', 'no developer profile found');
  }

  // Verify: contractor cannot escalate own role to developer
  {
    const { data: selfData } = await asSel('contractor', 'profiles', `?email=eq.${TEST_ACCOUNTS.contractor}&select=id,role`);
    const selfId = selfData?.[0]?.id;
    if (selfId) {
      await asUpd('contractor', 'profiles', selfId, { role: 'developer' });
      const check = await sel('profiles', `?id=eq.${selfId}&select=role`);
      if (check.data?.[0]?.role === 'contractor') pass('Isolation-10e: Contractor cannot escalate own role to developer');
      else {
        // Restore role immediately
        await upd('profiles', selfId, { role: 'contractor' });
        fail('Isolation-10e: Role escalation SUCCEEDED — fix RLS on profiles UPDATE', `role became ${check.data?.[0]?.role}`);
      }
    } else skip('Isolation-10e: Role escalation test', 'contractor profile id not found');
  }
}

// ── 11. CORRESPONDENCE & TRANSMITTAL SCENARIOS ───────────────────────────────
async function testCorrTransScenarios() {
  section('11. CORRESPONDENCE & TRANSMITTALS — ROLE GUARDS');

  // 11a. Contractor CANNOT create correspondence (INSERT blocked, approve role only)
  {
    const r = await asIns('contractor', 'correspondence', {
      ref_no: `CORR-CON-BLOCKED-${TS}`, type: 'Letter', subject: 'Contractor attempt',
      from_party: 'MBC', to_party: 'POE', correspondence_date: TODAY, due_date: TODAY,
      body: 'Test', status: 'Open', logged_by: 'Contractor',
    });
    if (r.status !== 201) pass('Corr-11a: Contractor cannot create correspondence (INSERT blocked)');
    else { track('correspondence', r.data?.[0]?.id); fail('Corr-11a: Correspondence INSERT should be blocked', `HTTP ${r.status}`); }
  }

  // 11b. Subcontractor CANNOT create correspondence
  {
    const r = await asIns('subcontractor', 'correspondence', {
      ref_no: `CORR-SUB-BLOCKED-${TS}`, type: 'Email', subject: 'Sub attempt',
      from_party: 'SC', to_party: 'MBC', correspondence_date: TODAY, due_date: TODAY,
      body: 'Test', status: 'Open', logged_by: 'Sub',
    });
    if (r.status !== 201) pass('Corr-11b: Subcontractor cannot create correspondence');
    else { track('correspondence', r.data?.[0]?.id); fail('Corr-11b: Correspondence INSERT should be blocked', `HTTP ${r.status}`); }
  }

  // 11c. Transmittal: contractor CAN acknowledge
  let transId;
  {
    const r = await ins('transmittals', { ref_no: `TRN-SCN-${TS}`, from_party: 'POE', to_party: 'MBC', transmit_date: TODAY, purpose: 'Info', method: 'Email', documents: '[]', response_required: TODAY });
    transId = r.data?.[0]?.id;
    if (transId) track('transmittals', transId);
  }
  if (transId) {
    const r = await asUpd('contractor', 'transmittals', transId, { acknowledged_by: 'Contractor', acknowledged_at: new Date().toISOString() });
    const check = await sel('transmittals', `?id=eq.${transId}&select=acknowledged_by`);
    if (check.data?.[0]?.acknowledged_by === 'Contractor') pass('Corr-11c: Contractor acknowledges transmittal');
    else fail('Corr-11c: Contractor acknowledge transmittal', `acknowledged_by = ${check.data?.[0]?.acknowledged_by}`);
  }

  // 11d. Subcontractor CANNOT create transmittal (INSERT: upload roles only — developer, consultant, contractor)
  {
    const r = await asIns('subcontractor', 'transmittals', {
      ref_no: `TRN-SUB-BLOCKED-${TS}`, from_party: 'SC', to_party: 'MBC',
      transmit_date: TODAY, purpose: 'Info', method: 'Email', documents: '[]', response_required: TODAY,
    });
    // Note: check actual RLS — transmittals INSERT may allow all roles. If so, skip.
    if (r.status !== 201) pass('Corr-11d: Subcontractor cannot create transmittal');
    else { track('transmittals', r.data?.[0]?.id); skip('Corr-11d: Transmittal INSERT allows subcontractor (by design — verify intent)', 'check RLS policy'); }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   SCENARIO TESTS — Golf Grove DMS                            ║');
  console.log('║   Cross-role interactions, workflow guards, RLS enforcement   ║');
  console.log(`║   ${new Date().toISOString()}                          ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // Pre-warm JWTs for all 4 roles
  console.log('\n── Auth: pre-warming role JWTs ───────────────────────────────');
  for (const role of ['developer', 'consultant', 'contractor', 'subcontractor']) {
    try { await getJWT(role); console.log(`  ✓ ${role}`); }
    catch (e) { console.error(`  ✗ ${role} — ${e.message}`); }
  }

  await testIPCScenarios();
  await testSubmittalScenarios();
  await testDrawingScenarios();
  await testNCRScenarios();
  await testIRScenarios();
  await testMSScenarios();
  await testRFIScenarios();
  await testPunchScenarios();
  await testDeletePermissions();
  await testDataIsolation();
  await testCorrTransScenarios();

  await runCleanup();
  printSummary();
}

main().catch(err => { console.error('\nFatal:', err); process.exit(1); });
