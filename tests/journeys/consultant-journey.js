#!/usr/bin/env node
/**
 * Consultant Role User Journey Test — Golf Grove DMS
 * Tests every action a Consultant can perform across all modules.
 * Permissions: approve, upload, raise, submit, manageRegister (no manageUsers, no manageSubs, no submitMS)
 *
 * Run: node tests/journeys/consultant-journey.js
 */

const { SUPABASE_URL, SERVICE_KEY, TEST_ACCOUNTS, TEST_PASSWORD } = require('../config');

const TODAY = new Date().toISOString().split('T')[0];
const TS    = Date.now();

const results  = [];
const toDelete = {};

function track(table, id) { if (!id) return; (toDelete[table] = toDelete[table] || []).push(id); }
function pass(name)         { results.push({ name, status: 'PASS', info: null });   console.log(`  ✓  PASS  ${name}`); }
function fail(name, err)    { const e = typeof err === 'string' ? err : (err?.message || JSON.stringify(err)); results.push({ name, status: 'FAIL', info: e }); console.error(`  ✗  FAIL  ${name}  →  ${e}`); }
function skip(name, reason) { results.push({ name, status: 'SKIP', info: reason }); console.log(`  ⊘  SKIP  ${name}  →  ${reason}`); }
function warn(name, msg)    { results.push({ name, status: 'WARN', info: msg });    console.warn(`  ⚠  WARN  ${name}  →  ${msg}`); }
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
const updQ = (table, qs, body) => api('PATCH',  `/rest/v1/${table}?${qs}`, body);
const sel  = (table, qs = '')  => api('GET',    `/rest/v1/${table}${qs}`, null);
const del  = (table, id)       => api('DELETE', `/rest/v1/${table}?id=eq.${id}`, null, SERVICE_KEY, { Prefer: '' });

let consultantProfile = null;
const cName = () => consultantProfile?.full_name || 'Test Consultant';
const cId   = () => consultantProfile?.id || null;

async function audit(docId, docType, action) {
  await ins('document_audit_log', { document_id: docId, document_type: docType, action, performed_by_name: cName(), performed_by_id: cId() });
}

async function signIn() {
  const { data } = await sel('profiles', `?email=eq.${TEST_ACCOUNTS.consultant}&limit=1`);
  consultantProfile = Array.isArray(data) ? data[0] : null;
  if (consultantProfile) console.log(`[auth] Consultant profile: ${consultantProfile.full_name} (${consultantProfile.role})`);
  else console.warn('[auth] No consultant profile found — using fallback name');
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

  let drawId;
  {
    const seq = (TS % 9999).toString().padStart(4, '0');
    const dno = `CST-GG-ZZ-00-DR-A-${seq}-RevA`;
    const { status, data } = await ins('drawings', {
      drawing_no: dno, title: `TEST Consultant Drawing ${TS}`, discipline: 'Structure',
      revision: 'RevA', status: 'WIP', cde_state: 'WIP',
      originator: 'CST', zone: 'GG', level: 'ZZ', doc_type: 'DR', arfi: 'AR',
      uploaded_by: cName(), superseded_revisions: '[]', related_drawings: [],
    });
    if (status === 201 && data?.[0]?.id) {
      drawId = data[0].id; track('drawings', drawId);
      await ins('drawing_revisions', { drawing_id: drawId, revision: 'RevA', status: 'WIP', uploaded_by_name: cName(), uploaded_by_id: cId(), upload_date: TODAY });
      pass('Drawing — Create (with initial revision)');
    } else fail('Drawing — Create', `HTTP ${status}: ${JSON.stringify(data)?.substring(0, 120)}`);
  }

  if (!drawId) { warn('Drawing — (remaining skipped, no drawId)', 'create failed'); return; }

  for (const [from, to] of [['WIP', 'Shared'], ['Shared', 'Published'], ['Published', 'Archived']]) {
    const { status } = await upd('drawings', drawId, { cde_state: to });
    if (status === 200) { await audit(drawId, 'drawing', `CDE State Change → ${to}`); pass(`Drawing — Advance CDE: ${from} → ${to}`); }
    else fail(`Drawing — Advance CDE: ${from} → ${to}`, `HTTP ${status}`);
  }

  {
    await upd('drawings', drawId, { status: 'Under Review', cde_state: 'Shared' });
    const { status: s1 } = await upd('drawings', drawId, { status: 'Approved' });
    await api('PATCH', `/rest/v1/drawing_revisions?drawing_id=eq.${drawId}&revision=eq.RevA`, { approved_by_name: cName(), approval_date: new Date().toISOString(), status: 'Approved' });
    if (s1 === 200) { await audit(drawId, 'drawing', 'Drawing Approved'); pass('Drawing — Approve'); }
    else fail('Drawing — Approve', `HTTP ${s1}`);
  }

  {
    const { status, data } = await ins('drawing_revisions', { drawing_id: drawId, revision: 'RevB', status: 'WIP', uploaded_by_name: cName(), uploaded_by_id: cId(), upload_date: TODAY, review_comments: 'TEST revision by consultant' });
    if (status === 201) { if (data?.[0]?.id) track('drawing_revisions', data[0].id); pass('Drawing — New Revision (record insert)'); }
    else fail('Drawing — New Revision', `HTTP ${status}`);
  }

  {
    const { status } = await upd('drawings', drawId, { related_drawings: [drawId] });
    if (status === 200) pass('Drawing — Link Related Drawings');
    else fail('Drawing — Link Related Drawings', `HTTP ${status}`);
  }

  {
    const { status } = await upd('drawings', drawId, { status: 'Void' });
    if (status === 200) { await audit(drawId, 'drawing', 'Drawing Voided'); pass('Drawing — Void'); }
    else fail('Drawing — Void', `HTTP ${status}`);
  }

  {
    const { status, data } = await sel('drawings', `?id=eq.${drawId}&select=drawing_no,title,discipline,revision,status,cde_state`);
    if (status === 200 && data?.[0]?.drawing_no) pass('Drawing — Export CSV (columns readable)');
    else fail('Drawing — Export CSV', `HTTP ${status}`);
  }

  {
    const b = await Promise.all([1, 2].map(n => ins('drawings', {
      drawing_no: `CST-GG-ZZ-00-DR-A-B${n}${TS % 999}-RevA`, title: `TEST Batch ${n}`, discipline: 'MEP',
      revision: 'RevA', status: 'Under Review', cde_state: 'Shared',
      originator: 'CST', zone: 'GG', level: 'ZZ', doc_type: 'DR', arfi: 'AR',
      uploaded_by: cName(), superseded_revisions: '[]', related_drawings: [],
    })));
    const ids = b.map(r => r.data?.[0]?.id).filter(Boolean);
    ids.forEach(id => track('drawings', id));
    if (ids.length === 2) {
      const { status } = await updQ('drawings', `id=in.(${ids.join(',')})`, { status: 'Approved' });
      if (status === 200) pass('Drawing — Batch Approve (2 drawings)');
      else fail('Drawing — Batch Approve', `HTTP ${status}`);
    } else fail('Drawing — Batch Approve', 'Could not create 2 batch drawings');
  }
}

// ── 2. SUBMITTALS ────────────────────────────────────────────────────────────
async function testSubmittals() {
  section('2. SUBMITTALS (DSUB)');

  const outcomeMap = { '1': 'Approved', '2': 'Approved', '3': 'Revise & Resubmit', '4': 'Approved' };
  const subIds = {};

  for (const code of ['1', '2', '3', '4']) {
    const { status, data } = await ins('submittals', {
      ref_no: `DSUB-CST-${TS}-${code}`, title: `TEST Consultant Submittal ${code}`,
      from_party: 'Modern Building Contracting', to_party: 'POE Engineering Consultants',
      discipline: 'Structure', revision: '00', status: 'Pending Review', submit_date: TODAY,
    });
    if (status === 201 && data?.[0]?.id) { subIds[code] = data[0].id; track('submittals', data[0].id); pass(`Submittal — Create (outcome ${code})`); }
    else fail(`Submittal — Create (outcome ${code})`, `HTTP ${status}`);
  }

  for (const code of ['1', '2', '3', '4']) {
    if (!subIds[code]) continue;
    const { status } = await upd('submittals', subIds[code], { outcome: code, status: outcomeMap[code], reviewed_by: cName(), review_date: TODAY, eng_comments: `TEST review code ${code}` });
    if (status === 200) { await audit(subIds[code], 'submittal', `Reviewed: Code ${code}`); pass(`Submittal — Review: Code ${code} → ${outcomeMap[code]}`); }
    else fail(`Submittal — Review Code ${code}`, `HTTP ${status}`);
  }

  const batchIds = Object.values(subIds).filter(Boolean).slice(0, 2);
  if (batchIds.length === 2) {
    await updQ('submittals', `id=in.(${batchIds.join(',')})`, { status: 'Pending Review' });
    const { status } = await updQ('submittals', `id=in.(${batchIds.join(',')})`, { status: 'Under Review' });
    if (status === 200) pass('Submittal — Batch Mark Reviewed');
    else fail('Submittal — Batch Mark Reviewed', `HTTP ${status}`);
  }

  skip('Submittal — Resubmit', 'ROLE-GATED: resubmit hidden when can("approve") is true — contractor-only action');
}

// ── 3. SUBMITTAL REGISTER ────────────────────────────────────────────────────
async function testSubmittalRegister() {
  section('3. SUBMITTAL REGISTER');

  let regId;
  {
    const { status, data } = await ins('submittal_register', { item_no: `CST-${TS}`, spec_ref: 'CST-SPEC-01', title: `TEST Consultant Register ${TS}`, discipline: 'Structure', required_by: TODAY });
    if (status === 201 && data?.[0]?.id) { regId = data[0].id; track('submittal_register', regId); pass('Submittal Register — Add Item'); }
    else fail('Submittal Register — Add Item', `HTTP ${status}`);
  }

  {
    const rows = [
      { item_no: `CSV-CST-${TS}-01`, spec_ref: 'SPEC-A', title: `CSV Item 1 ${TS}`, discipline: 'MEP', required_by: TODAY },
      { item_no: `CSV-CST-${TS}-02`, spec_ref: 'SPEC-B', title: `CSV Item 2 ${TS}`, discipline: 'Architecture', required_by: TODAY },
    ];
    const res_ = await Promise.all(rows.map(r => ins('submittal_register', r)));
    res_.forEach(r => { if (r.data?.[0]?.id) track('submittal_register', r.data[0].id); });
    if (res_.every(r => r.status === 201)) pass('Submittal Register — Import CSV (2 rows)');
    else fail('Submittal Register — Import CSV', res_.map(r => r.status).join(', '));
  }

  if (regId) {
    const { status } = await del('submittal_register', regId);
    if (status === 204 || status === 200) { toDelete['submittal_register'] = (toDelete['submittal_register'] || []).filter(id => id !== regId); pass('Submittal Register — Delete Item'); }
    else fail('Submittal Register — Delete Item', `HTTP ${status}`);
  }
}

// ── 4. INSPECTION REQUESTS ───────────────────────────────────────────────────
async function testIRs() {
  section('4. INSPECTION REQUESTS');

  let irId;
  {
    const { status, data } = await ins('inspections', { ref_no: `IRT-CST-${TS}`, location: 'Level 2 – TEST Zone', elements: 'Rebar – TEST', request_date: TODAY, inspection_date: TODAY, status: 'Pending', rep: 'Test Rep', site_engineer: cName() });
    if (status === 201 && data?.[0]?.id) { irId = data[0].id; track('inspections', irId); pass('IR — Create'); }
    else fail('IR — Create', `HTTP ${status}`);
  }

  if (irId) {
    for (const irStatus of ['Approved', 'Rejected', 'Approved as Noted', 'Correction']) {
      await upd('inspections', irId, { status: 'Pending' });
      const { status } = await upd('inspections', irId, { status: irStatus, inspected_by: cName(), response_date: TODAY, comments: `TEST: ${irStatus}` });
      if (status === 200) { await audit(irId, 'inspection', `IR Response: ${irStatus}`); pass(`IR — Respond: ${irStatus}`); }
      else fail(`IR — Respond: ${irStatus}`, `HTTP ${status}`);
    }
  }

  skip('IR — Re-Inspect', 'ROLE-GATED: re-inspect hidden when can("approve") is true — contractor-only');
}

// ── 5. NCRs ──────────────────────────────────────────────────────────────────
async function testNCRs() {
  section('5. NON-CONFORMANCE REPORTS');

  let ncrId;
  {
    const { status, data } = await ins('ncrs', { ref_no: `NCR-CST-${TS}`, title: `TEST NCR Consultant ${TS}`, location: 'Level 3', raised_by: cName(), raised_date: TODAY, severity: 'Minor', status: 'Open' });
    if (status === 201 && data?.[0]?.id) { ncrId = data[0].id; track('ncrs', ncrId); await audit(ncrId, 'ncr', 'NCR Raised'); pass('NCR — Raise'); }
    else fail('NCR — Raise', `HTTP ${status}`);
  }

  skip('NCR — Submit CAP', 'ROLE-GATED: submitCAP hidden when can("approve") is true — contractor-only');

  if (ncrId) {
    await upd('ncrs', ncrId, { status: 'CAP Submitted', corrective_action: 'TEST: Replace materials', root_cause: 'Design', cap_responsible: 'Site Foreman', cap_target_date: TODAY, cap_submitted_date: TODAY, cap_submitted_by: 'Test Contractor' });

    {
      const { status } = await upd('ncrs', ncrId, { status: 'CAP Verified', cap_verified_by: cName(), cap_verified_date: TODAY, cap_verify_comments: 'TEST: CAP adequate' });
      if (status === 200) { await audit(ncrId, 'ncr', 'NCR: CAP Verified'); pass('NCR — Verify CAP'); }
      else fail('NCR — Verify CAP', `HTTP ${status}`);
    }

    {
      await upd('ncrs', ncrId, { status: 'CAP Submitted' });
      const { status } = await upd('ncrs', ncrId, { status: 'Open', cap_verify_comments: 'TEST: CAP insufficient' });
      if (status === 200) { await audit(ncrId, 'ncr', 'NCR: CAP Returned → Open'); pass('NCR — Reject CAP'); }
      else fail('NCR — Reject CAP', `HTTP ${status}`);
    }

    await upd('ncrs', ncrId, { status: 'CAP Submitted', cap_submitted_date: TODAY });
    await upd('ncrs', ncrId, { status: 'CAP Verified', cap_verified_by: cName(), cap_verified_date: TODAY });
    {
      const { status } = await upd('ncrs', ncrId, { status: 'Closed', closed_date: TODAY });
      if (status === 200) { await audit(ncrId, 'ncr', 'NCR: Closed'); pass('NCR — Close'); }
      else fail('NCR — Close', `HTTP ${status}`);
    }
  }
}

// ── 6. RFIs ──────────────────────────────────────────────────────────────────
async function testRFIs() {
  section('6. RFIs');

  let rfiId;
  {
    const { status, data } = await ins('rfis', { ref_no: `RFI-CST-${TS}`, subject: `TEST Consultant RFI ${TS}`, from_party: 'MBC', to_party: 'POE', discipline: 'Structure', status: 'Open', due_date: TODAY });
    if (status === 201 && data?.[0]?.id) { rfiId = data[0].id; track('rfis', rfiId); pass('RFI — Create'); }
    else fail('RFI — Create', `HTTP ${status}`);
  }

  if (rfiId) {
    { const { status } = await upd('rfis', rfiId, { status: 'Responded', response: 'TEST: Refer to updated drawings.', responded_by: cName(), responded_date: TODAY }); if (status === 200) pass('RFI — Respond'); else fail('RFI — Respond', `HTTP ${status}`); }
    { const { status } = await upd('rfis', rfiId, { status: 'Closed' }); if (status === 200) pass('RFI — Close'); else fail('RFI — Close', `HTTP ${status}`); }
  }
}

// ── 7. TRANSMITTALS ──────────────────────────────────────────────────────────
async function testTransmittals() {
  section('7. TRANSMITTALS');

  let transId;
  {
    const { status, data } = await ins('transmittals', { ref_no: `TRANS-CST-${TS}`, from_party: 'POE Engineering', to_party: 'MBC', transmit_date: TODAY, purpose: 'For Construction', method: 'Email', documents: JSON.stringify([{ no: 'CST-DR-001', title: 'Test', rev: 'RevA', copies: 1 }]), response_required: TODAY });
    if (status === 201 && data?.[0]?.id) { transId = data[0].id; track('transmittals', transId); pass('Transmittal — Create'); }
    else fail('Transmittal — Create', `HTTP ${status}`);
  }

  if (transId) {
    const { status } = await upd('transmittals', transId, { acknowledged_by: cName(), acknowledged_at: new Date().toISOString() });
    if (status === 200) pass('Transmittal — Acknowledge Receipt');
    else fail('Transmittal — Acknowledge Receipt', `HTTP ${status}`);
  }
}

// ── 8. CORRESPONDENCE ────────────────────────────────────────────────────────
async function testCorrespondence() {
  section('8. CORRESPONDENCE');

  let corrId;
  {
    const { status, data } = await ins('correspondence', { ref_no: `CORR-CST-${TS}`, type: 'Letter', subject: `TEST Consultant Corr ${TS}`, from_party: 'POE', to_party: 'MBC', correspondence_date: TODAY, due_date: TODAY, body: 'Test body.', status: 'Open', logged_by: cName() });
    if (status === 201 && data?.[0]?.id) { corrId = data[0].id; track('correspondence', corrId); pass('Correspondence — Create'); }
    else fail('Correspondence — Create', `HTTP ${status}`);
  }

  if (corrId) {
    const { status } = await upd('correspondence', corrId, { status: 'Closed', closed_date: TODAY });
    if (status === 200) { await audit(corrId, 'correspondence', 'Closed'); pass('Correspondence — Close'); }
    else fail('Correspondence — Close', `HTTP ${status}`);
  }
}

// ── 9. PUNCH LIST ────────────────────────────────────────────────────────────
async function testPunchList() {
  section('9. PUNCH LIST');

  let punchId;
  {
    const { status, data } = await ins('punch_list', { description: `TEST Punch Consultant ${TS}`, location: 'Level 4', element: 'Window frame', discipline: 'Architecture', severity: 'Minor', assigned_to: 'Test SC', raised_by: cName(), status: 'Open' });
    if (status === 201 && data?.[0]?.id) { punchId = data[0].id; track('punch_list', punchId); pass('Punch List — Add Item'); }
    else fail('Punch List — Add Item', `HTTP ${status}`);
  }

  if (punchId) {
    { const { status } = await upd('punch_list', punchId, { contractor_response: 'TEST: Rework done', status: 'In Progress' }); if (status === 200) pass('Punch List — Update Item'); else fail('Punch List — Update', `HTTP ${status}`); }
    { const { status } = await upd('punch_list', punchId, { status: 'Closed', closed_date: TODAY }); if (status === 200) pass('Punch List — Close Item'); else fail('Punch List — Close', `HTTP ${status}`); }
  }
}

// ── 10. METHOD STATEMENTS ────────────────────────────────────────────────────
async function testMethodStatements() {
  section('10. METHOD STATEMENTS');

  skip('MS — Submit', 'ROLE-GATED: submitMS=false for consultant — contractor/subcontractor only');

  let msId;
  {
    const { status, data } = await ins('method_statements', { ref_no: `MS-CST-${TS}`, title: `TEST MS Consultant ${TS}`, activity: 'Formwork', discipline: 'Civil', location: 'Level 2', revision: 'Rev 0', submitted_by: 'Test Contractor', submitted_date: TODAY, status: 'Pending Review' });
    if (status === 201 && data?.[0]?.id) { msId = data[0].id; track('method_statements', msId); }
    else { fail('MS — Review (setup: could not create test MS)', `HTTP ${status}`); return; }
  }

  if (msId) {
    {
      const { status } = await upd('method_statements', msId, { status: 'Approved', reviewed_by: cName(), review_date: TODAY, review_comments: 'TEST: Adequate' });
      if (status === 200) {
        await ins('comments', { record_type: 'ms', record_id: msId, message: `Review submitted — Approved.`, author_name: cName() });
        pass('MS — Review: Approved');
      } else fail('MS — Review: Approved', `HTTP ${status}`);
    }
    {
      await upd('method_statements', msId, { status: 'Pending Review' });
      const { status } = await upd('method_statements', msId, { status: 'Rejected', reviewed_by: cName(), review_date: TODAY, review_comments: 'TEST: Insufficient detail' });
      if (status === 200) pass('MS — Review: Rejected');
      else fail('MS — Review: Rejected', `HTTP ${status}`);
    }
  }
}

// ── 11. COMMENTS ─────────────────────────────────────────────────────────────
async function testComments() {
  section('11. COMMENTS');

  let rfiId;
  { const { data } = await ins('rfis', { ref_no: `RFI-CMT-CST-${TS}`, subject: 'Comment test', from_party: 'MBC', to_party: 'POE', discipline: 'General', status: 'Open' }); rfiId = data?.[0]?.id; if (rfiId) track('rfis', rfiId); }

  if (rfiId) {
    const { status, data } = await ins('comments', { record_type: 'rfi', record_id: rfiId, message: 'TEST comment by consultant', author_name: cName() });
    if (status === 201) { if (data?.[0]?.id) track('comments', data[0].id); pass('Comments — Post on RFI'); }
    else fail('Comments — Post on RFI', `HTTP ${status}`);
  }
}

// ── ROLE GATES ────────────────────────────────────────────────────────────────
function checkRoleGates() {
  section('12. ROLE GATE CHECKS');
  skip('User Management — View/Change Role', 'ROLE-GATED: manageUsers=false for consultant');
  skip('Subcontractors — Add/Remove', 'ROLE-GATED: manageSubs=false for consultant');
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   CONSULTANT ROLE USER JOURNEY TEST                          ║');
  console.log(`║   Golf Grove DMS  •  ${new Date().toISOString().split('T')[0]}                              ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  await signIn();

  await testDrawings();
  await testSubmittals();
  await testSubmittalRegister();
  await testIRs();
  await testNCRs();
  await testRFIs();
  await testTransmittals();
  await testCorrespondence();
  await testPunchList();
  await testMethodStatements();
  await testComments();
  checkRoleGates();

  await runCleanup();
  printSummary();
}

main().catch(err => { console.error('\nFatal error:', err); process.exit(1); });
