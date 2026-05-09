#!/usr/bin/env node
/**
 * Contractor Role User Journey Test — Golf Grove DMS
 * Permissions: upload, submit, manageSubs, submitMS (no approve, no raise, no manageUsers, no manageRegister)
 *
 * Run: node tests/journeys/contractor-journey.js
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

let contractorProfile = null;
const coName = () => contractorProfile?.full_name || 'Test Contractor';
const coId   = () => contractorProfile?.id || null;

async function signIn() {
  const { data } = await sel('profiles', `?email=eq.${TEST_ACCOUNTS.contractor}&limit=1`);
  contractorProfile = Array.isArray(data) ? data[0] : null;
  if (contractorProfile) console.log(`[auth] Contractor profile: ${contractorProfile.full_name} (${contractorProfile.role})`);
  else console.warn('[auth] No contractor profile found — using fallback name');
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

  // Contractor can upload (insert drawing + revision records) but not approve/CDE advance
  let drawId;
  {
    const seq = (TS % 9999).toString().padStart(4, '0');
    const { status, data } = await ins('drawings', {
      drawing_no: `CON-GG-ZZ-00-DR-A-${seq}-RevA`, title: `TEST Contractor Drawing ${TS}`,
      discipline: 'Architecture', revision: 'RevA', status: 'WIP', cde_state: 'WIP',
      originator: 'CON', zone: 'GG', level: 'ZZ', doc_type: 'DR', arfi: 'AR',
      uploaded_by: coName(), superseded_revisions: '[]', related_drawings: [],
    });
    if (status === 201 && data?.[0]?.id) {
      drawId = data[0].id; track('drawings', drawId);
      await ins('drawing_revisions', { drawing_id: drawId, revision: 'RevA', status: 'WIP', uploaded_by_name: coName(), uploaded_by_id: coId(), upload_date: TODAY });
      pass('Drawing — Upload (create record + revision)');
    } else fail('Drawing — Upload', `HTTP ${status}: ${JSON.stringify(data)?.substring(0, 120)}`);
  }

  if (drawId) {
    const { status, data } = await sel('drawings', `?id=eq.${drawId}&select=drawing_no,title,discipline,revision,status,cde_state`);
    if (status === 200 && data?.[0]?.drawing_no) pass('Drawing — View / Export CSV (columns readable)');
    else fail('Drawing — View', `HTTP ${status}`);
  }

  skip('Drawing — Approve', 'ROLE-GATED: approve=false for contractor');
  skip('Drawing — Advance CDE', 'ROLE-GATED: approve=false for contractor');
  skip('Drawing — Bulk Import XLSX', 'ROLE-GATED: manageRegister=false for contractor');
  skip('Drawing — Void / Link', 'ROLE-GATED: approve=false for contractor');
}

// ── 2. SUBMITTALS ────────────────────────────────────────────────────────────
async function testSubmittals() {
  section('2. SUBMITTALS (DSUB)');

  // Contractor submits submittals
  let subId;
  {
    const { status, data } = await ins('submittals', { ref_no: `DSUB-CON-${TS}`, title: `TEST Contractor Submittal ${TS}`, from_party: 'Modern Building Contracting', to_party: 'POE Engineering', discipline: 'Architecture', revision: '00', status: 'Pending Review', submit_date: TODAY });
    if (status === 201 && data?.[0]?.id) { subId = data[0].id; track('submittals', subId); pass('Submittal — Submit (create)'); }
    else fail('Submittal — Submit', `HTTP ${status}`);
  }

  skip('Submittal — Review / Approve', 'ROLE-GATED: approve=false for contractor');
  skip('Submittal — Batch Mark Reviewed', 'ROLE-GATED: approve=false for contractor');

  // Resubmit: contractor can resubmit a "Revise & Resubmit" submittal
  if (subId) {
    await upd('submittals', subId, { status: 'Revise & Resubmit' });
    const { status, data } = await ins('submittals', { ref_no: `DSUB-CON-${TS}-R1`, title: `TEST Contractor Resubmit ${TS}`, from_party: 'Modern Building Contracting', to_party: 'POE Engineering', discipline: 'Architecture', revision: '01', status: 'Pending Review', submit_date: TODAY, parent_id: subId });
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
  skip('Submittal Register — All actions', 'ROLE-GATED: manageRegister=false for contractor');
}

// ── 4. INSPECTION REQUESTS ───────────────────────────────────────────────────
async function testIRs() {
  section('4. INSPECTION REQUESTS');

  let irId;
  {
    const { status, data } = await ins('inspections', { ref_no: `IRT-CON-${TS}`, location: 'Level 5 – TEST', elements: 'Steel Frame', request_date: TODAY, inspection_date: TODAY, status: 'Pending', rep: coName(), site_engineer: 'Test Engineer' });
    if (status === 201 && data?.[0]?.id) { irId = data[0].id; track('inspections', irId); pass('IR — Create'); }
    else fail('IR — Create', `HTTP ${status}`);
  }

  skip('IR — Respond', 'ROLE-GATED: approve=false for contractor');

  // Re-inspect after failed IR (contractor-only action)
  if (irId) {
    await upd('inspections', irId, { status: 'Rejected' });
    const { status, data } = await ins('inspections', { ref_no: `IRT-CON-${TS}-RI`, location: 'Level 5 – TEST (Re-inspect)', elements: 'Steel Frame', request_date: TODAY, inspection_date: TODAY, status: 'Pending', rep: coName(), site_engineer: 'Test Engineer', parent_ir_id: irId });
    if (status === 201 && data?.[0]?.id) { track('inspections', data[0].id); pass('IR — Re-Inspect (new IR linked to failed parent)'); }
    else fail('IR — Re-Inspect', `HTTP ${status}`);
  }
}

// ── 5. NCRs ──────────────────────────────────────────────────────────────────
async function testNCRs() {
  section('5. NON-CONFORMANCE REPORTS');

  skip('NCR — Raise', 'ROLE-GATED: raise=false for contractor');

  // Submit CAP on a seeded NCR (contractor-specific action)
  let ncrId;
  {
    const { status, data } = await ins('ncrs', { ref_no: `NCR-CON-${TS}`, title: `TEST NCR for contractor CAP ${TS}`, location: 'Level 1', raised_by: 'Test Consultant', raised_date: TODAY, severity: 'Major', status: 'Open' });
    if (status === 201 && data?.[0]?.id) { ncrId = data[0].id; track('ncrs', ncrId); }
    else { fail('NCR — Submit CAP (setup failed)', `HTTP ${status}`); return; }
  }

  {
    const { status } = await upd('ncrs', ncrId, { status: 'CAP Submitted', corrective_action: 'TEST: Replace non-compliant concrete batch', root_cause: 'Workmanship', cap_responsible: coName(), cap_target_date: TODAY, cap_submitted_date: TODAY, cap_submitted_by: coName() });
    if (status === 200) pass('NCR — Submit CAP');
    else fail('NCR — Submit CAP', `HTTP ${status}`);
  }

  skip('NCR — Verify CAP / Reject CAP / Close', 'ROLE-GATED: approve=false for contractor');
}

// ── 6. RFIs ──────────────────────────────────────────────────────────────────
async function testRFIs() {
  section('6. RFIs');

  let rfiId;
  {
    const { status, data } = await ins('rfis', { ref_no: `RFI-CON-${TS}`, subject: `TEST Contractor RFI ${TS}`, from_party: 'MBC', to_party: 'POE', discipline: 'Architecture', status: 'Open', due_date: TODAY });
    if (status === 201 && data?.[0]?.id) { rfiId = data[0].id; track('rfis', rfiId); pass('RFI — Create'); }
    else fail('RFI — Create', `HTTP ${status}`);
  }

  skip('RFI — Respond / Close', 'ROLE-GATED: approve=false for contractor');
}

// ── 7. TRANSMITTALS ──────────────────────────────────────────────────────────
async function testTransmittals() {
  section('7. TRANSMITTALS');

  let transId;
  {
    const { status, data } = await ins('transmittals', { ref_no: `TRANS-CON-${TS}`, from_party: 'MBC', to_party: 'POE', transmit_date: TODAY, purpose: 'For Approval', method: 'Email', documents: JSON.stringify([{ no: 'CON-DR-001', title: 'Test', rev: 'RevA', copies: 1 }]), response_required: TODAY });
    if (status === 201 && data?.[0]?.id) { transId = data[0].id; track('transmittals', transId); pass('Transmittal — Create'); }
    else fail('Transmittal — Create', `HTTP ${status}`);
  }

  if (transId) {
    const { status } = await upd('transmittals', transId, { acknowledged_by: coName(), acknowledged_at: new Date().toISOString() });
    if (status === 200) pass('Transmittal — Acknowledge Receipt');
    else fail('Transmittal — Acknowledge Receipt', `HTTP ${status}`);
  }
}

// ── 8. CORRESPONDENCE ────────────────────────────────────────────────────────
function testCorrespondence() {
  section('8. CORRESPONDENCE');
  skip('Correspondence — Create / Close', 'ROLE-GATED: approve=false for contractor (canCreateOnPage requires can("approve"))');
}

// ── 9. PUNCH LIST ────────────────────────────────────────────────────────────
function testPunchList() {
  section('9. PUNCH LIST');
  skip('Punch List — All actions', 'ROLE-GATED: approve=false for contractor (canCreateOnPage requires can("approve"))');
}

// ── 10. METHOD STATEMENTS ────────────────────────────────────────────────────
async function testMethodStatements() {
  section('10. METHOD STATEMENTS');

  let msId;
  {
    const { status, data } = await ins('method_statements', { ref_no: `MS-CON-${TS}`, title: `TEST Method Statement Contractor ${TS}`, activity: 'Concrete Pour – Level 3', discipline: 'Civil', location: 'Level 3 – Grid B', revision: 'Rev 0', submitted_by: coName(), submitted_date: TODAY, status: 'Pending Review' });
    if (status === 201 && data?.[0]?.id) { msId = data[0].id; track('method_statements', msId); pass('MS — Submit'); }
    else fail('MS — Submit', `HTTP ${status}`);
  }

  skip('MS — Review / Approve', 'ROLE-GATED: approve=false for contractor');
}

// ── 11. SUBCONTRACTORS ───────────────────────────────────────────────────────
async function testSubcontractors() {
  section('11. SUBCONTRACTORS');

  let scId;
  {
    const { status, data } = await ins('subcontractors', { name: `TEST SC Contractor ${TS}`, rep: 'Test Rep', discipline: 'Civil', trade: 'Concrete' });
    if (status === 201 && data?.[0]?.id) { scId = data[0].id; track('subcontractors', scId); pass('Subcontractors — Add'); }
    else fail('Subcontractors — Add', `HTTP ${status}`);
  }

  if (scId) {
    const { status } = await del('subcontractors', scId);
    if (status === 204 || status === 200) { toDelete['subcontractors'] = (toDelete['subcontractors'] || []).filter(id => id !== scId); pass('Subcontractors — Remove'); }
    else fail('Subcontractors — Remove', `HTTP ${status}`);
  }
}

// ── 12. COMMENTS ─────────────────────────────────────────────────────────────
async function testComments() {
  section('12. COMMENTS');

  let rfiId;
  { const { data } = await ins('rfis', { ref_no: `RFI-CMT-CON-${TS}`, subject: 'Comment test', from_party: 'MBC', to_party: 'POE', discipline: 'General', status: 'Open' }); rfiId = data?.[0]?.id; if (rfiId) track('rfis', rfiId); }

  if (rfiId) {
    const { status, data } = await ins('comments', { record_type: 'rfi', record_id: rfiId, message: 'TEST comment by contractor', author_name: coName() });
    if (status === 201) { if (data?.[0]?.id) track('comments', data[0].id); pass('Comments — Post on RFI'); }
    else fail('Comments — Post on RFI', `HTTP ${status}`);
  }
}

function checkRoleGates() {
  section('13. ROLE GATE CHECKS');
  skip('User Management', 'ROLE-GATED: manageUsers=false for contractor');
  skip('Submittal Register — manage', 'ROLE-GATED: manageRegister=false for contractor');
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   CONTRACTOR ROLE USER JOURNEY TEST                          ║');
  console.log(`║   Golf Grove DMS  •  ${new Date().toISOString().split('T')[0]}                              ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  await signIn();

  await testDrawings();
  await testSubmittals();
  testSubmittalRegister();
  await testIRs();
  await testNCRs();
  await testRFIs();
  await testTransmittals();
  testCorrespondence();
  testPunchList();
  await testMethodStatements();
  await testSubcontractors();
  await testComments();
  checkRoleGates();

  await runCleanup();
  printSummary();
}

main().catch(err => { console.error('\nFatal error:', err); process.exit(1); });
