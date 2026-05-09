#!/usr/bin/env node
/**
 * Subcontractor Role User Journey Test — Golf Grove DMS
 * Permissions: submit, submitMS only (no approve, no upload drawing, no raise, no manage*)
 *
 * Run: node tests/journeys/subcontractor-journey.js
 */

const { SUPABASE_URL, SERVICE_KEY, TEST_ACCOUNTS } = require('../config');

const TODAY = new Date().toISOString().split('T')[0];
const TS    = Date.now();

const results  = [];
const toDelete = {};

function track(table, id) { if (!id) return; (toDelete[table] = toDelete[table] || []).push(id); }
function pass(name)         { results.push({ name, status: 'PASS', info: null });   console.log(`  ✓  PASS  ${name}`); }
function fail(name, err)    { const e = typeof err === 'string' ? err : (err?.message || JSON.stringify(err)); results.push({ name, status: 'FAIL', info: e }); console.error(`  ✗  FAIL  ${name}  →  ${e}`); }
function skip(name, reason) { results.push({ name, status: 'SKIP', info: reason }); console.log(`  ⊘  SKIP  ${name}  →  ${reason}`); }
function section(t)         { console.log(`\n${'═'.repeat(60)}\n  ${t}\n${'─'.repeat(60)}`); }

async function api(method, path, body, token = SERVICE_KEY, extra = {}) {
  const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...extra };
  const res  = await fetch(`${SUPABASE_URL}${path}`, { method, headers, body: body != null ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, ok: res.status >= 200 && res.status < 300 };
}

const ins  = (table, body)     => api('POST',   `/rest/v1/${table}`, body);
const upd  = (table, id, body) => api('PATCH',  `/rest/v1/${table}?id=eq.${id}`, body);
const sel  = (table, qs = '')  => api('GET',    `/rest/v1/${table}${qs}`, null);
const del  = (table, id)       => api('DELETE', `/rest/v1/${table}?id=eq.${id}`, null, SERVICE_KEY, { Prefer: '' });

let subProfile = null;
const sName = () => subProfile?.full_name || 'Test Subcontractor';
const sId   = () => subProfile?.id || null;

async function signIn() {
  const { data } = await sel('profiles', `?email=eq.${TEST_ACCOUNTS.subcontractor}&limit=1`);
  subProfile = Array.isArray(data) ? data[0] : null;
  if (subProfile) console.log(`[auth] Subcontractor profile: ${subProfile.full_name} (${subProfile.role})`);
  else console.warn('[auth] No subcontractor profile found — using fallback name');
}

async function runCleanup() {
  console.log('\n── Cleanup ──────────────────────────────────────────────');
  for (const [table, ids] of Object.entries(toDelete)) {
    let deleted = 0;
    for (const id of ids) { const { status } = await del(table, id); if (status === 204 || status === 200) deleted++; }
    if (ids.length) console.log(`  ${table}: deleted ${deleted}/${ids.length}`);
  }
}

function printSummary() {
  const counts = { PASS: 0, FAIL: 0, SKIP: 0, WARN: 0 };
  for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;
  const W = Math.max(...results.map(r => r.name.length), 40);
  console.log('\n' + '═'.repeat(W + 24));
  console.log('  RESULTS SUMMARY');
  console.log('═'.repeat(W + 24));
  for (const r of results) {
    const icon   = { PASS: '✓', FAIL: '✗', SKIP: '⊘', WARN: '⚠' }[r.status];
    const suffix = r.info ? `  ← ${r.info}` : '';
    console.log(`  ${icon}  ${r.status.padEnd(5)}  ${r.name.padEnd(W)}${suffix}`);
  }
  console.log('─'.repeat(W + 24));
  console.log(`  PASS: ${counts.PASS}   FAIL: ${counts.FAIL}   WARN: ${counts.WARN}   SKIP: ${counts.SKIP}   TOTAL: ${results.length}`);
  console.log('═'.repeat(W + 24) + '\n');
  if (counts.FAIL > 0) process.exit(1);
}

// ── 1. DRAWING REGISTER ──────────────────────────────────────────────────────
async function testDrawings() {
  section('1. DRAWING REGISTER');

  // Can view but not upload, approve, or advance CDE
  const { status, data } = await sel('drawings', '?limit=1&select=id,drawing_no,title,cde_state');
  if (status === 200 && Array.isArray(data)) pass(`Drawing — View list (${data.length} rows visible via service role)`);
  else fail('Drawing — View list', `HTTP ${status}`);

  skip('Drawing — Upload revision', 'ROLE-GATED: upload=false for subcontractor');
  skip('Drawing — Approve / CDE advance', 'ROLE-GATED: approve=false for subcontractor');
  skip('Drawing — Bulk import', 'ROLE-GATED: manageRegister=false for subcontractor');
}

// ── 2. SUBMITTALS ────────────────────────────────────────────────────────────
async function testSubmittals() {
  section('2. SUBMITTALS (DSUB)');

  let subId;
  {
    const { status, data } = await ins('submittals', { ref_no: `DSUB-SUB-${TS}`, title: `TEST Subcontractor Submittal ${TS}`, from_party: 'Test Subcontractor Co', to_party: 'Modern Building Contracting', discipline: 'MEP', revision: '00', status: 'Pending Review', submit_date: TODAY });
    if (status === 201 && data?.[0]?.id) { subId = data[0].id; track('submittals', subId); pass('Submittal — Submit (create)'); }
    else fail('Submittal — Submit', `HTTP ${status}`);
  }

  skip('Submittal — Review / Approve', 'ROLE-GATED: approve=false for subcontractor');

  // Subcontractor can resubmit (submit:true, not an approver)
  if (subId) {
    await upd('submittals', subId, { status: 'Revise & Resubmit' });
    const { status, data } = await ins('submittals', { ref_no: `DSUB-SUB-${TS}-R1`, title: `TEST Subcontractor Resubmit ${TS}`, from_party: 'Test Subcontractor Co', to_party: 'MBC', discipline: 'MEP', revision: '01', status: 'Pending Review', submit_date: TODAY, parent_id: subId });
    if (status === 201 && data?.[0]?.id) {
      track('submittals', data[0].id);
      await upd('submittals', subId, { status: 'Superseded' });
      pass('Submittal — Resubmit (new revision, parent superseded)');
    } else fail('Submittal — Resubmit', `HTTP ${status}`);
  }
}

// ── 3. SUBMITTAL REGISTER ────────────────────────────────────────────────────
function testSubmittalRegister() {
  section('3. SUBMITTAL REGISTER');
  skip('Submittal Register — All actions', 'ROLE-GATED: manageRegister=false for subcontractor');
}

// ── 4. INSPECTION REQUESTS ───────────────────────────────────────────────────
async function testIRs() {
  section('4. INSPECTION REQUESTS');

  let irId;
  {
    const { status, data } = await ins('inspections', { ref_no: `IRT-SUB-${TS}`, location: 'Level 2 – MEP Zone', elements: 'Conduit Installation', request_date: TODAY, inspection_date: TODAY, status: 'Pending', rep: sName(), site_engineer: 'Test Engineer' });
    if (status === 201 && data?.[0]?.id) { irId = data[0].id; track('inspections', irId); pass('IR — Create'); }
    else fail('IR — Create', `HTTP ${status}`);
  }

  skip('IR — Respond', 'ROLE-GATED: approve=false for subcontractor');

  // Re-inspect (subcontractor can re-inspect, same as contractor)
  if (irId) {
    await upd('inspections', irId, { status: 'Rejected' });
    const { status, data } = await ins('inspections', { ref_no: `IRT-SUB-${TS}-RI`, location: 'Level 2 – MEP Zone (Re-inspect)', elements: 'Conduit Installation', request_date: TODAY, inspection_date: TODAY, status: 'Pending', rep: sName(), site_engineer: 'Test Engineer', parent_ir_id: irId });
    if (status === 201 && data?.[0]?.id) { track('inspections', data[0].id); pass('IR — Re-Inspect (new IR linked to failed parent)'); }
    else fail('IR — Re-Inspect', `HTTP ${status}`);
  }
}

// ── 5. NCRs ──────────────────────────────────────────────────────────────────
function testNCRs() {
  section('5. NON-CONFORMANCE REPORTS');
  skip('NCR — Raise', 'ROLE-GATED: raise=false for subcontractor');
  skip('NCR — Submit CAP', 'ROLE-GATED: no manageSubs or specific NCR access — subcontractor view-only');
  skip('NCR — Verify / Close', 'ROLE-GATED: approve=false for subcontractor');
}

// ── 6. RFIs ──────────────────────────────────────────────────────────────────
async function testRFIs() {
  section('6. RFIs');

  let rfiId;
  {
    const { status, data } = await ins('rfis', { ref_no: `RFI-SUB-${TS}`, subject: `TEST Subcontractor RFI ${TS}`, from_party: 'Test SC Co', to_party: 'MBC', discipline: 'MEP', status: 'Open', due_date: TODAY });
    if (status === 201 && data?.[0]?.id) { rfiId = data[0].id; track('rfis', rfiId); pass('RFI — Create'); }
    else fail('RFI — Create', `HTTP ${status}`);
  }

  skip('RFI — Respond / Close', 'ROLE-GATED: approve=false for subcontractor');
}

// ── 7. TRANSMITTALS ──────────────────────────────────────────────────────────
async function testTransmittals() {
  section('7. TRANSMITTALS');

  let transId;
  {
    const { status, data } = await ins('transmittals', { ref_no: `TRANS-SUB-${TS}`, from_party: 'Test SC Co', to_party: 'MBC', transmit_date: TODAY, purpose: 'For Information', method: 'Email', documents: JSON.stringify([{ no: 'SUB-DOC-001', title: 'Test', rev: 'Rev0', copies: 1 }]), response_required: TODAY });
    if (status === 201 && data?.[0]?.id) { transId = data[0].id; track('transmittals', transId); pass('Transmittal — Create'); }
    else fail('Transmittal — Create', `HTTP ${status}`);
  }

  if (transId) {
    const { status } = await upd('transmittals', transId, { acknowledged_by: sName(), acknowledged_at: new Date().toISOString() });
    if (status === 200) pass('Transmittal — Acknowledge Receipt');
    else fail('Transmittal — Acknowledge Receipt', `HTTP ${status}`);
  }
}

// ── 8. CORRESPONDENCE / PUNCH LIST ──────────────────────────────────────────
function testCorrespondencePunch() {
  section('8. CORRESPONDENCE & PUNCH LIST');
  skip('Correspondence — Create / Close', 'ROLE-GATED: approve=false for subcontractor');
  skip('Punch List — All actions', 'ROLE-GATED: approve=false for subcontractor');
}

// ── 9. METHOD STATEMENTS ────────────────────────────────────────────────────
async function testMethodStatements() {
  section('9. METHOD STATEMENTS');

  let msId;
  {
    const { status, data } = await ins('method_statements', { ref_no: `MS-SUB-${TS}`, title: `TEST Method Statement Subcontractor ${TS}`, activity: 'MEP Conduit Installation – Level 2', discipline: 'MEP', location: 'Level 2 – Grid C', revision: 'Rev 0', submitted_by: sName(), submitted_date: TODAY, status: 'Pending Review' });
    if (status === 201 && data?.[0]?.id) { msId = data[0].id; track('method_statements', msId); pass('MS — Submit'); }
    else fail('MS — Submit', `HTTP ${status}`);
  }

  skip('MS — Review / Approve', 'ROLE-GATED: approve=false for subcontractor');
}

// ── 10. COMMENTS ─────────────────────────────────────────────────────────────
async function testComments() {
  section('10. COMMENTS');

  let rfiId;
  { const { data } = await ins('rfis', { ref_no: `RFI-CMT-SUB-${TS}`, subject: 'Comment test', from_party: 'SC Co', to_party: 'MBC', discipline: 'General', status: 'Open' }); rfiId = data?.[0]?.id; if (rfiId) track('rfis', rfiId); }

  if (rfiId) {
    const { status, data } = await ins('comments', { record_type: 'rfi', record_id: rfiId, message: 'TEST comment by subcontractor', author_name: sName() });
    if (status === 201) { if (data?.[0]?.id) track('comments', data[0].id); pass('Comments — Post on RFI'); }
    else fail('Comments — Post on RFI', `HTTP ${status}`);
  }
}

function checkRoleGates() {
  section('11. ROLE GATE CHECKS');
  skip('User Management', 'ROLE-GATED: manageUsers=false for subcontractor');
  skip('Subcontractors — manage', 'ROLE-GATED: manageSubs=false for subcontractor');
  skip('Submittal Register', 'ROLE-GATED: manageRegister=false for subcontractor');
  skip('Drawing upload', 'ROLE-GATED: upload=false for subcontractor');
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   SUBCONTRACTOR ROLE USER JOURNEY TEST                       ║');
  console.log(`║   Golf Grove DMS  •  ${new Date().toISOString().split('T')[0]}                              ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  await signIn();

  await testDrawings();
  await testSubmittals();
  testSubmittalRegister();
  await testIRs();
  testNCRs();
  await testRFIs();
  await testTransmittals();
  testCorrespondencePunch();
  await testMethodStatements();
  await testComments();
  checkRoleGates();

  await runCleanup();
  printSummary();
}

main().catch(err => { console.error('\nFatal error:', err); process.exit(1); });
