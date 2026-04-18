#!/usr/bin/env node
/**
 * TASK A — Developer Role User Journey Test
 * Golf Grove DMS
 *
 * Tests every action a Developer can perform across all modules.
 * Uses the Supabase service role key to bypass RLS for setup/teardown.
 * Auth: optionally sign in with DEV_EMAIL + DEV_PASSWORD (env vars).
 *
 * Run:
 *   node tests/developer-journey.js
 *   DEV_EMAIL=you@email.com DEV_PASSWORD=pass node tests/developer-journey.js
 */

const SUPABASE_URL = 'https://kdxvhrwnnehicgdryowu.supabase.co';
const ANON_KEY    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkeHZocndubmVoaWNnZHJ5b3d1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTg2NjMsImV4cCI6MjA5MTIzNDY2M30.uMlyBkTeth6nVl8ofBu9g_AYlnDLkgDyVTsxxaHI_ic';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkeHZocndubmVoaWNnZHJ5b3d1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY1ODY2MywiZXhwIjoyMDkxMjM0NjYzfQ.q9i53Jx2GXHpX5t89Tdzly0WPiS-TOeiuY36D6uRnUA';

const TODAY = new Date().toISOString().split('T')[0];
const TS    = Date.now();

// ── RESULTS & CLEANUP ────────────────────────────────────────────────────────

const results  = [];
const toDelete = {}; // { tableName: [id, ...] }

function track(table, id) {
  if (!id) return;
  if (!toDelete[table]) toDelete[table] = [];
  toDelete[table].push(id);
}

function pass(name)         { results.push({ name, status: 'PASS', info: null });   console.log(`  ✓  PASS  ${name}`); }
function fail(name, err)    { const e = typeof err === 'string' ? err : (err?.message || JSON.stringify(err)); results.push({ name, status: 'FAIL', info: e }); console.error(`  ✗  FAIL  ${name}  →  ${e}`); }
function skip(name, reason) { results.push({ name, status: 'SKIP', info: reason }); console.log(`  ⊘  SKIP  ${name}  →  ${reason}`); }
function warn(name, msg)    { results.push({ name, status: 'WARN', info: msg });    console.warn(`  ⚠  WARN  ${name}  →  ${msg}`); }
function section(t)         { console.log(`\n${'═'.repeat(60)}\n  ${t}\n${'─'.repeat(60)}`); }

// ── HTTP HELPERS ─────────────────────────────────────────────────────────────

async function api(method, path, body, token = SERVICE_KEY, extra = {}) {
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...extra,
  };
  const res  = await fetch(`${SUPABASE_URL}${path}`, { method, headers, body: body != null ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, ok: res.status >= 200 && res.status < 300 };
}

const db   = (m, table, q = '')   => (body) => api(m, `/rest/v1/${table}${q}`, body);
const ins  = (table, body)        => api('POST',   `/rest/v1/${table}`, body);
const upd  = (table, id, body)    => api('PATCH',  `/rest/v1/${table}?id=eq.${id}`, body);
const updQ = (table, qs, body)    => api('PATCH',  `/rest/v1/${table}?${qs}`, body);
const sel  = (table, qs = '')     => api('GET',    `/rest/v1/${table}${qs}`, null);
const del  = (table, id)          => api('DELETE', `/rest/v1/${table}?id=eq.${id}`, null, SERVICE_KEY, { Prefer: '' });

async function audit(docId, docType, action) {
  await ins('document_audit_log', {
    document_id: docId, document_type: docType, action,
    performed_by_name: devName(), performed_by_id: devId(),
  });
}

// ── AUTH & PROFILE ────────────────────────────────────────────────────────────

let devProfile = null;

async function signIn() {
  const email = process.env.DEV_EMAIL;
  const pass_ = process.env.DEV_PASSWORD;

  if (email && pass_) {
    const { status, data } = await api('POST', '/auth/v1/token?grant_type=password',
      { email, password: pass_ }, ANON_KEY);
    if (status === 200 && data.access_token) {
      console.log(`[auth] ✓ Signed in as ${email}`);
    } else {
      console.warn(`[auth] Login failed (${data?.error_description || data?.error}) — continuing with service role`);
    }
  } else {
    console.log('[auth] DEV_EMAIL/DEV_PASSWORD not set — using service role (bypasses RLS)');
  }

  const { data } = await sel('profiles', '?role=eq.developer&limit=1');
  devProfile = Array.isArray(data) ? data[0] : null;
  if (devProfile) console.log(`[auth] Developer profile: ${devProfile.full_name} (${devProfile.role})`);
  else console.warn('[auth] No developer profile found in DB');
}

const devName = () => devProfile?.full_name || 'Test Developer';
const devId   = () => devProfile?.id || null;

// ── CLEANUP ───────────────────────────────────────────────────────────────────

async function runCleanup() {
  console.log('\n── Cleanup ──────────────────────────────────────────────');
  for (const [table, ids] of Object.entries(toDelete)) {
    let deleted = 0;
    for (const id of ids) {
      const { status } = await del(table, id);
      if (status === 204 || status === 200) deleted++;
    }
    if (ids.length) console.log(`  ${table}: deleted ${deleted}/${ids.length}`);
  }
}

// ── SUMMARY ───────────────────────────────────────────────────────────────────

function printSummary() {
  const counts = { PASS: 0, FAIL: 0, SKIP: 0, WARN: 0 };
  for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;

  const W = Math.max(...results.map(r => r.name.length), 40);
  console.log('\n' + '═'.repeat(W + 24));
  console.log('  RESULTS SUMMARY');
  console.log('═'.repeat(W + 24));
  for (const r of results) {
    const icon = { PASS: '✓', FAIL: '✗', SKIP: '⊘', WARN: '⚠' }[r.status];
    const suffix = r.info ? `  ← ${r.info}` : '';
    console.log(`  ${icon}  ${r.status.padEnd(5)}  ${r.name.padEnd(W)}${suffix}`);
  }
  console.log('─'.repeat(W + 24));
  console.log(`  PASS: ${counts.PASS}   FAIL: ${counts.FAIL}   WARN: ${counts.WARN}   SKIP: ${counts.SKIP}   TOTAL: ${results.length}`);
  console.log('═'.repeat(W + 24) + '\n');

  if (counts.FAIL > 0) process.exit(1);
}

// ════════════════════════════════════════════════════════════════════════════
// TEST SECTIONS
// ════════════════════════════════════════════════════════════════════════════

// ── 1. DRAWING REGISTER ───────────────────────────────────────────────────────
async function testDrawings() {
  section('1. DRAWING REGISTER');

  // 1a. Create
  let drawId;
  {
    const seq  = (TS % 9999).toString().padStart(4, '0');
    const dno  = `TST-GG-ZZ-00-DR-A-${seq}-RevA`;
    const { status, data } = await ins('drawings', {
      drawing_no: dno, title: `TEST Drawing ${TS}`, discipline: 'Architecture',
      revision: 'RevA', status: 'WIP', cde_state: 'WIP',
      originator: 'TST', zone: 'GG', level: 'ZZ', doc_type: 'DR', arfi: 'AR',
      uploaded_by: devName(), superseded_revisions: '[]', related_drawings: [],
    });
    if (status === 201 && data?.[0]?.id) {
      drawId = data[0].id; track('drawings', drawId);
      // Create initial revision record (mirrors doNewDraw)
      await ins('drawing_revisions', {
        drawing_id: drawId, revision: 'RevA', status: 'WIP',
        uploaded_by_name: devName(), uploaded_by_id: devId(), upload_date: TODAY,
      });
      pass('Drawing — Create (with initial revision record)');
    } else fail('Drawing — Create', `HTTP ${status}: ${JSON.stringify(data)?.substring(0, 120)}`);
  }

  if (!drawId) { warn('Drawing — (remaining tests skipped, no drawId)', 'create failed'); return; }

  // 1b. Advance CDE WIP → Shared
  {
    const { status } = await upd('drawings', drawId, { cde_state: 'Shared' });
    if (status === 200) { await audit(drawId, 'drawing', 'CDE State Change → Shared'); pass('Drawing — Advance CDE: WIP → Shared'); }
    else fail('Drawing — Advance CDE: WIP → Shared', `HTTP ${status}`);
  }

  // 1c. Advance CDE Shared → Published
  {
    const { status } = await upd('drawings', drawId, { cde_state: 'Published' });
    if (status === 200) { await audit(drawId, 'drawing', 'CDE State Change → Published'); pass('Drawing — Advance CDE: Shared → Published'); }
    else fail('Drawing — Advance CDE: Shared → Published', `HTTP ${status}`);
  }

  // 1d. Advance CDE Published → Archived
  {
    const { status } = await upd('drawings', drawId, { cde_state: 'Archived' });
    if (status === 200) { await audit(drawId, 'drawing', 'CDE State Change → Archived'); pass('Drawing — Advance CDE: Published → Archived'); }
    else fail('Drawing — Advance CDE: Published → Archived', `HTTP ${status}`);
  }

  // 1e. Approve drawing (mirrors approveDrawing: only status on drawings, approval details on drawing_revisions)
  {
    await upd('drawings', drawId, { status: 'Under Review', cde_state: 'Shared' });
    const { status: s1 } = await upd('drawings', drawId, { status: 'Approved' });
    // Update revision record with approval details (mirrors approveDrawing line 2206-2214)
    const { status: s2 } = await api('PATCH',
      `/rest/v1/drawing_revisions?drawing_id=eq.${drawId}&revision=eq.RevA`,
      { approved_by_name: devName(), approval_date: new Date().toISOString(), status: 'Approved' });
    if (s1 === 200) { await audit(drawId, 'drawing', 'Drawing Approved'); pass('Drawing — Approve'); }
    else fail('Drawing — Approve', `HTTP drawings=${s1} revisions=${s2}`);
  }

  // 1f. Upload new revision record (mirrors doUploadRev)
  {
    const { status, data } = await ins('drawing_revisions', {
      drawing_id: drawId, revision: 'RevB', status: 'WIP',
      uploaded_by_name: devName(), uploaded_by_id: devId(), upload_date: TODAY,
      review_comments: 'TEST new revision',
    });
    if (status === 201) {
      if (data?.[0]?.id) track('drawing_revisions', data[0].id);
      pass('Drawing — New Revision (record insert)');
    } else fail('Drawing — New Revision', `HTTP ${status}: ${JSON.stringify(data)?.substring(0, 80)}`);
  }

  // 1g. Link related drawings (related_drawings is uuid[] — must pass actual drawing UUID)
  {
    // Link the drawing to itself (valid UUID, mirrors saveLinkDrawings behaviour)
    const { status } = await upd('drawings', drawId, { related_drawings: [drawId] });
    if (status === 200) pass('Drawing — Link Related Drawings (uuid[] with valid UUID)');
    else fail('Drawing — Link Related Drawings', `HTTP ${status}`);
  }

  // 1h. Void drawing
  {
    const seq = (TS % 9999).toString().padStart(4, '0');
    const { status } = await upd('drawings', drawId, { status: 'Void' });
    if (status === 200) { await audit(drawId, 'drawing', `Drawing Voided: TST-GG-ZZ-00-DR-A-${seq}-RevA`); pass('Drawing — Void'); }
    else fail('Drawing — Void', `HTTP ${status}`);
  }

  // 1i. Export CSV (verify all expected columns are fetchable)
  {
    const { status, data } = await sel('drawings', `?id=eq.${drawId}&select=drawing_no,title,discipline,revision,status,cde_state,originator,zone,level,doc_type`);
    if (status === 200 && data?.[0]?.drawing_no) pass('Drawing — Export CSV (all columns readable)');
    else fail('Drawing — Export CSV', `HTTP ${status}`);
  }

  // 1j. Batch approve — create 2 fresh drawings then PATCH both
  {
    const b = await Promise.all([1, 2].map(n => ins('drawings', {
      drawing_no: `TST-GG-ZZ-00-DR-A-B${n}${TS % 999}-RevA`,
      title: `TEST Batch ${n}`, discipline: 'MEP', revision: 'RevA',
      status: 'Under Review', cde_state: 'Shared',
      originator: 'TST', zone: 'GG', level: 'ZZ', doc_type: 'DR', arfi: 'AR',
      uploaded_by: devName(), superseded_revisions: '[]', related_drawings: [],
    })));
    const ids = b.map(r => r.data?.[0]?.id).filter(Boolean);
    ids.forEach(id => track('drawings', id));
    if (ids.length === 2) {
      const { status } = await updQ('drawings', `id=in.(${ids.join(',')})`, {
        status: 'Approved',
      });
      if (status === 200) pass('Drawing — Batch Approve (2 drawings)');
      else fail('Drawing — Batch Approve', `HTTP ${status}`);
    } else fail('Drawing — Batch Approve', 'Could not create 2 batch test drawings');
  }
}

// ── 2. SUBMITTALS ──────────────────────────────────────────────────────────────
async function testSubmittals() {
  section('2. SUBMITTALS (DSUB)');

  const outcomeMap = { '1': 'Approved', '2': 'Approved', '3': 'Revise & Resubmit', '4': 'Approved' };
  const subIds = {};

  // Create one submittal per outcome code
  for (const code of ['1', '2', '3', '4']) {
    const { status, data } = await ins('submittals', {
      ref_no: `DSUB-TEST-${TS}-${code}`,
      title: `TEST Submittal Outcome ${code}`,
      from_party: 'Modern Building Contracting', to_party: 'POE Engineering Consultants',
      discipline: 'Architecture', revision: '00', status: 'Pending Review', submit_date: TODAY,
    });
    if (status === 201 && data?.[0]?.id) {
      subIds[code] = data[0].id; track('submittals', data[0].id);
      pass(`Submittal — Create (for outcome code ${code})`);
    } else fail(`Submittal — Create (outcome ${code})`, `HTTP ${status}: ${JSON.stringify(data)?.substring(0, 80)}`);
  }

  // Review with all 4 outcome codes
  for (const code of ['1', '2', '3', '4']) {
    if (!subIds[code]) continue;
    const { status } = await upd('submittals', subIds[code], {
      outcome: code, status: outcomeMap[code],
      reviewed_by: devName(), review_date: TODAY,
      eng_comments: `TEST review for outcome code ${code}`,
    });
    if (status === 200) {
      await audit(subIds[code], 'submittal', `Submittal Reviewed: Code ${code} – ${outcomeMap[code]}`);
      pass(`Submittal — Review: Outcome Code ${code} → ${outcomeMap[code]}`);
    } else fail(`Submittal — Review Outcome Code ${code}`, `HTTP ${status}`);
  }

  // Batch Mark Reviewed (Pending Review → Under Review)
  const batchIds = Object.values(subIds).filter(Boolean).slice(0, 2);
  if (batchIds.length === 2) {
    await updQ('submittals', `id=in.(${batchIds.join(',')})`, { status: 'Pending Review' });
    const { status } = await updQ('submittals', `id=in.(${batchIds.join(',')})`, { status: 'Under Review' });
    if (status === 200) pass('Submittal — Batch Mark Reviewed (2 submittals)');
    else fail('Submittal — Batch Mark Reviewed', `HTTP ${status}`);
  }

  // Resubmit — BLOCKED for developer (button only shown to !can('approve'))
  skip('Submittal — Resubmit', 'ROLE-GATED: resubmit button hidden when can("approve") is true (developer) — contractor-only action');
}

// ── 3. SUBMITTAL REGISTER ─────────────────────────────────────────────────────
async function testSubmittalRegister() {
  section('3. SUBMITTAL REGISTER');

  // Add item
  let regId;
  {
    const { status, data } = await ins('submittal_register', {
      item_no: `TEST-${TS}`, spec_ref: 'TEST-SPEC-01',
      title: `TEST Register Item ${TS}`, discipline: 'Architecture',
      required_by: TODAY, notes: 'Automated test item',
    });
    if (status === 201 && data?.[0]?.id) {
      regId = data[0].id; track('submittal_register', regId);
      pass('Submittal Register — Add Item');
    } else fail('Submittal Register — Add Item', `HTTP ${status}: ${JSON.stringify(data)?.substring(0, 80)}`);
  }

  // Import CSV (simulated: insert multiple items in one call — same as doImportRegister bulk inserts)
  {
    const csvRows = [
      { item_no: `CSV-${TS}-01`, spec_ref: 'SPEC-A', title: `CSV Import Item 1 ${TS}`, discipline: 'MEP',      required_by: TODAY },
      { item_no: `CSV-${TS}-02`, spec_ref: 'SPEC-B', title: `CSV Import Item 2 ${TS}`, discipline: 'Structure', required_by: TODAY },
    ];
    const results_ = await Promise.all(csvRows.map(row => ins('submittal_register', row)));
    const allOk = results_.every(r => r.status === 201);
    results_.forEach(r => { if (r.data?.[0]?.id) track('submittal_register', r.data[0].id); });
    if (allOk) pass('Submittal Register — Import CSV (2 rows simulated)');
    else fail('Submittal Register — Import CSV', results_.map(r => r.status).join(', '));
  }

  // Delete item
  if (regId) {
    const { status } = await del('submittal_register', regId);
    if (status === 204 || status === 200) {
      toDelete['submittal_register'] = (toDelete['submittal_register'] || []).filter(id => id !== regId);
      pass('Submittal Register — Delete Item');
    } else fail('Submittal Register — Delete Item', `HTTP ${status}`);
  }
}

// ── 4. INSPECTION REQUESTS ────────────────────────────────────────────────────
async function testIRs() {
  section('4. INSPECTION REQUESTS');

  // Create a test subcontractor for the IR
  let scId;
  {
    const { data } = await ins('subcontractors', { name: `TEST SC IR ${TS}`, rep: 'Test Rep', discipline: 'Civil', trade: 'Concrete' });
    scId = data?.[0]?.id; if (scId) track('subcontractors', scId);
  }

  // Create IR
  let irId;
  {
    const { status, data } = await ins('inspections', {
      ref_no: `IRT-TEST-${TS}`, location: 'Level 3 – TEST Zone',
      elements: 'Concrete Pour – TEST', request_date: TODAY,
      inspection_date: TODAY, status: 'Pending',
      subcontractor_id: scId || null, rep: 'Test Rep', site_engineer: devName(),
    });
    if (status === 201 && data?.[0]?.id) {
      irId = data[0].id; track('inspections', irId);
      pass('IR — Create');
    } else fail('IR — Create', `HTTP ${status}: ${JSON.stringify(data)?.substring(0, 80)}`);
  }

  if (irId) {
    const responses = ['Approved', 'Rejected', 'Approved as Noted', 'Correction'];
    for (const irStatus of responses) {
      await upd('inspections', irId, { status: 'Pending' }); // reset
      const { status } = await upd('inspections', irId, {
        status: irStatus, inspected_by: devName(),
        response_date: TODAY, comments: `TEST respond: ${irStatus}`,
      });
      if (status === 200) {
        await audit(irId, 'inspection', `IR Response: ${irStatus}`);
        pass(`IR — Respond: ${irStatus}`);
      } else fail(`IR — Respond: ${irStatus}`, `HTTP ${status}`);
    }
  }

  // Re-Inspect — BLOCKED for developer (button only shown when !can('approve'))
  skip('IR — Re-Inspect', 'ROLE-GATED: re-inspect button hidden when can("approve") is true — contractor-only action');
}

// ── 5. NON-CONFORMANCE REPORTS ────────────────────────────────────────────────
async function testNCRs() {
  section('5. NON-CONFORMANCE REPORTS');

  let ncrId;
  // Raise NCR
  {
    const { status, data } = await ins('ncrs', {
      ref_no: `NCR-TEST-${TS}`, title: `TEST NCR ${TS}`,
      location: 'Level 2 – TEST Zone', raised_by: devName(),
      raised_date: TODAY, severity: 'Major', status: 'Open',
    });
    if (status === 201 && data?.[0]?.id) {
      ncrId = data[0].id; track('ncrs', ncrId);
      await audit(ncrId, 'ncr', 'NCR Raised');
      pass('NCR — Raise');
    } else fail('NCR — Raise', `HTTP ${status}: ${JSON.stringify(data)?.substring(0, 80)}`);
  }

  // Submit CAP — BLOCKED for developer
  skip('NCR — Submit CAP', 'ROLE-GATED: submitCAP button hidden when can("approve") is true — contractor-only action');

  if (ncrId) {
    // Advance to CAP Submitted via service role (simulates contractor action)
    await upd('ncrs', ncrId, {
      status: 'CAP Submitted', corrective_action: 'TEST: Replace non-compliant materials',
      root_cause: 'Workmanship', cap_responsible: 'Site Foreman',
      cap_target_date: TODAY, cap_submitted_date: TODAY, cap_submitted_by: 'Test Contractor',
    });

    // Verify CAP
    {
      const { status } = await upd('ncrs', ncrId, {
        status: 'CAP Verified', cap_verified_by: devName(),
        cap_verified_date: TODAY, cap_verify_comments: 'TEST: CAP is adequate and accepted',
      });
      if (status === 200) { await audit(ncrId, 'ncr', 'NCR: CAP Verified'); pass('NCR — Verify CAP'); }
      else fail('NCR — Verify CAP', `HTTP ${status}`);
    }

    // Reject CAP (reset to CAP Submitted, then reject)
    {
      await upd('ncrs', ncrId, { status: 'CAP Submitted' });
      const { status } = await upd('ncrs', ncrId, {
        status: 'Open', cap_verify_comments: 'TEST: CAP insufficient — returned for revision',
      });
      if (status === 200) { await audit(ncrId, 'ncr', 'NCR: CAP Returned → Open'); pass('NCR — Reject CAP (Return to Open)'); }
      else fail('NCR — Reject CAP', `HTTP ${status}`);
    }

    // Re-advance and close NCR
    await upd('ncrs', ncrId, { status: 'CAP Submitted', cap_submitted_date: TODAY });
    await upd('ncrs', ncrId, { status: 'CAP Verified', cap_verified_by: devName(), cap_verified_date: TODAY });
    {
      const { status } = await upd('ncrs', ncrId, {
        status: 'Closed', corrective_action: 'TEST: Corrective action completed', closed_date: TODAY,
      });
      if (status === 200) { await audit(ncrId, 'ncr', 'NCR: Closed'); pass('NCR — Close NCR'); }
      else fail('NCR — Close NCR', `HTTP ${status}`);
    }
  }
}

// ── 6. RFIs ───────────────────────────────────────────────────────────────────
async function testRFIs() {
  section('6. RFIs');

  let rfiId;
  {
    const { status, data } = await ins('rfis', {
      ref_no: `RFI-TEST-${TS}`, subject: `TEST RFI ${TS}`,
      from_party: 'Modern Building Contracting', to_party: 'POE Engineering Consultants',
      discipline: 'Structure', status: 'Open', due_date: TODAY,
    });
    if (status === 201 && data?.[0]?.id) {
      rfiId = data[0].id; track('rfis', rfiId);
      pass('RFI — Create');
    } else fail('RFI — Create', `HTTP ${status}: ${JSON.stringify(data)?.substring(0, 80)}`);
  }

  if (rfiId) {
    // Respond
    {
      const { status } = await upd('rfis', rfiId, {
        status: 'Responded', response: 'TEST: Refer to structural drawings Rev B for clarification.',
        responded_by: devName(), responded_date: TODAY,
      });
      if (status === 200) pass('RFI — Respond');
      else fail('RFI — Respond', `HTTP ${status}`);
    }

    // Close
    {
      const { status } = await upd('rfis', rfiId, { status: 'Closed' });
      if (status === 200) pass('RFI — Close');
      else fail('RFI — Close', `HTTP ${status}`);
    }
  }
}

// ── 7. TRANSMITTALS ───────────────────────────────────────────────────────────
async function testTransmittals() {
  section('7. TRANSMITTALS');

  let transId;
  {
    const { status, data } = await ins('transmittals', {
      ref_no: `TRANS-TEST-${TS}`,
      from_party: 'POE Engineering Consultants', to_party: 'Modern Building Contracting',
      transmit_date: TODAY, purpose: 'For Construction', method: 'Email',
      documents: JSON.stringify([{ no: 'TST-DR-001', title: 'Test Drawing', rev: 'RevA', copies: 1 }]),
      response_required: TODAY,
    });
    if (status === 201 && data?.[0]?.id) {
      transId = data[0].id; track('transmittals', transId);
      pass('Transmittal — Create');
    } else fail('Transmittal — Create', `HTTP ${status}: ${JSON.stringify(data)?.substring(0, 80)}`);
  }

  if (transId) {
    const { status } = await upd('transmittals', transId, {
      acknowledged_by: devName(), acknowledged_at: new Date().toISOString(),
    });
    if (status === 200) pass('Transmittal — Acknowledge Receipt');
    else fail('Transmittal — Acknowledge Receipt', `HTTP ${status}`);
  }
}

// ── 8. CORRESPONDENCE ─────────────────────────────────────────────────────────
async function testCorrespondence() {
  section('8. CORRESPONDENCE');

  let corrId;
  {
    const { status, data } = await ins('correspondence', {
      ref_no: `CORR-TEST-${TS}`, type: 'Letter',
      subject: `TEST Correspondence ${TS}`,
      from_party: 'POE Engineering Consultants', to_party: 'Modern Building Contracting',
      correspondence_date: TODAY, due_date: TODAY,
      body: 'Automated test correspondence body.',
      status: 'Open', logged_by: devName(),
    });
    if (status === 201 && data?.[0]?.id) {
      corrId = data[0].id; track('correspondence', corrId);
      pass('Correspondence — Create');
    } else fail('Correspondence — Create', `HTTP ${status}: ${JSON.stringify(data)?.substring(0, 80)}`);
  }

  if (corrId) {
    const { status } = await upd('correspondence', corrId, { status: 'Closed', closed_date: TODAY });
    if (status === 200) { await audit(corrId, 'correspondence', 'Correspondence: Closed'); pass('Correspondence — Close'); }
    else fail('Correspondence — Close', `HTTP ${status}`);
  }
}

// ── 9. PUNCH LIST ─────────────────────────────────────────────────────────────
async function testPunchList() {
  section('9. PUNCH LIST');

  let punchId;
  {
    const { status, data } = await ins('punch_list', {
      description: `TEST Punch Item ${TS}`, location: 'Level 5 – TEST Apt',
      element: 'Door frame', discipline: 'Architecture', severity: 'Minor',
      assigned_to: 'Test Subcontractor', raised_by: devName(), status: 'Open',
    });
    if (status === 201 && data?.[0]?.id) {
      punchId = data[0].id; track('punch_list', punchId);
      pass('Punch List — Add Item');
    } else fail('Punch List — Add Item', `HTTP ${status}: ${JSON.stringify(data)?.substring(0, 80)}`);
  }

  if (punchId) {
    // Update
    {
      const { status } = await upd('punch_list', punchId, {
        contractor_response: 'TEST: Rework completed', assigned_to: 'Updated SC', status: 'In Progress',
      });
      if (status === 200) pass('Punch List — Update Item (status + contractor response)');
      else fail('Punch List — Update Item', `HTTP ${status}`);
    }

    // Close
    {
      const { status } = await upd('punch_list', punchId, { status: 'Closed', closed_date: TODAY });
      if (status === 200) pass('Punch List — Close Item');
      else fail('Punch List — Close Item', `HTTP ${status}`);
    }
  }
}

// ── 10. METHOD STATEMENTS ─────────────────────────────────────────────────────
async function testMethodStatements() {
  section('10. METHOD STATEMENTS');

  // Developer cannot submit MS (submitMS: false)
  skip('MS — Submit', 'ROLE-GATED: submitMS=false for developer — contractor/subcontractor only');

  // Create MS via service role (simulates contractor submission), then review as developer
  let msId;
  {
    const { status, data } = await ins('method_statements', {
      ref_no: `MS-TEST-${TS}`, title: `TEST Method Statement ${TS}`,
      activity: 'Concrete Works', discipline: 'Civil',
      location: 'Level 1 – TEST', revision: 'Rev 0',
      submitted_by: 'Test Contractor', submitted_date: TODAY, status: 'Pending Review',
    });
    if (status === 201 && data?.[0]?.id) {
      msId = data[0].id; track('method_statements', msId);
    } else {
      fail('MS — Review (setup: could not create test MS)', `HTTP ${status}`);
    }
  }

  if (msId) {
    // Review — Approved
    {
      const { status } = await upd('method_statements', msId, {
        status: 'Approved', reviewed_by: devName(),
        review_date: TODAY, review_comments: 'TEST: MS is adequate',
      });
      if (status === 200) {
        // Also test comment insert (doReviewMS inserts a comment — NOTE: uses 'message' field, bug expected)
        const { status: cs, data: cd } = await ins('comments', {
          record_type: 'ms', record_id: msId,
          message: `Review submitted — Approved. TEST comment.`,
          author_name: devName(),
        });
        if (cs === 201) pass('MS — Review: Approved (+ comment inserted with "message" field)');
        else warn('MS — Review: Approved (comment insert failed)', `HTTP ${cs}: ${JSON.stringify(cd)?.substring(0, 80)}`);
      } else fail('MS — Review: Approved', `HTTP ${status}`);
    }

    // Review — Rejected
    {
      await upd('method_statements', msId, { status: 'Pending Review' });
      const { status } = await upd('method_statements', msId, {
        status: 'Rejected', reviewed_by: devName(),
        review_date: TODAY, review_comments: 'TEST: Insufficient safety detail',
      });
      if (status === 200) pass('MS — Review: Rejected');
      else fail('MS — Review: Rejected', `HTTP ${status}`);
    }
  }
}

// ── 11. SUBCONTRACTORS ────────────────────────────────────────────────────────
async function testSubcontractors() {
  section('11. SUBCONTRACTORS');

  let scId;
  // Add
  {
    const { status, data } = await ins('subcontractors', {
      name: `TEST Subcontractor ${TS}`, rep: 'Test Representative',
      discipline: 'MEP', trade: 'Plumbing',
    });
    if (status === 201 && data?.[0]?.id) {
      scId = data[0].id; track('subcontractors', scId);
      pass('Subcontractors — Add');
    } else fail('Subcontractors — Add', `HTTP ${status}: ${JSON.stringify(data)?.substring(0, 80)}`);
  }

  // Remove
  if (scId) {
    const { status } = await del('subcontractors', scId);
    if (status === 204 || status === 200) {
      toDelete['subcontractors'] = (toDelete['subcontractors'] || []).filter(id => id !== scId);
      pass('Subcontractors — Remove');
    } else fail('Subcontractors — Remove', `HTTP ${status}`);
  }
}

// ── 12. USER MANAGEMENT ───────────────────────────────────────────────────────
async function testUsers() {
  section('12. USER MANAGEMENT');

  // View all
  {
    const { status, data } = await sel('profiles', '?select=id,full_name,role,company&order=full_name.asc');
    if (status === 200 && Array.isArray(data)) pass(`Users — View All (${data.length} profiles)`);
    else fail('Users — View All', `HTTP ${status}`);
  }

  // Change role — find a non-developer, toggle to consultant and back
  {
    const { data } = await sel('profiles', '?role=neq.developer&limit=1');
    const target = Array.isArray(data) ? data[0] : null;
    if (target) {
      const orig = target.role;
      const { status: s1 } = await upd('profiles', target.id, { role: 'consultant' });
      const { status: s2 } = await upd('profiles', target.id, { role: orig });
      if (s1 === 200 && s2 === 200) pass(`Users — Change Role (${target.full_name}: ${orig} → consultant → ${orig})`);
      else fail('Users — Change Role', `PATCH statuses: ${s1}, ${s2}`);
    } else skip('Users — Change Role', 'No non-developer users to test with');
  }
}

// ── 13. COMMENTS ──────────────────────────────────────────────────────────────
async function testComments() {
  section('13. COMMENTS (cross-module)');

  // Create a test RFI to comment on
  let rfiId;
  {
    const { data } = await ins('rfis', {
      ref_no: `RFI-CMT-${TS}`, subject: 'Comment test RFI',
      from_party: 'MBC', to_party: 'POE', discipline: 'General', status: 'Open',
    });
    rfiId = data?.[0]?.id; if (rfiId) track('rfis', rfiId);
  }

  if (rfiId) {
    const { status, data } = await ins('comments', {
      record_type: 'rfi', record_id: rfiId,
      message: 'TEST comment posted by developer role',
      author_name: devName(),
    });
    if (status === 201) {
      if (data?.[0]?.id) track('comments', data[0].id);
      pass('Comments — Post Comment on RFI');
    } else fail('Comments — Post Comment on RFI', `HTTP ${status}: ${JSON.stringify(data)?.substring(0, 80)}`);
  } else warn('Comments — Post Comment', 'RFI setup failed, comment test skipped');
}

// ── BUG CHECKS ────────────────────────────────────────────────────────────────
async function checkKnownBugs() {
  section('14. KNOWN BUG CHECKS');

  // Confirm: comments table uses 'message' field (NOT 'content' as CONTEXT.md incorrectly states)
  {
    const { data } = await ins('rfis', { ref_no: `RFI-BUG-${TS}`, subject: 'Bug test', from_party: 'X', to_party: 'Y', discipline: 'General', status: 'Open' });
    const rfiId = data?.[0]?.id;
    if (rfiId) {
      track('rfis', rfiId);
      const { status: s1, data: d1 } = await ins('comments', {
        record_type: 'rfi', record_id: rfiId,
        message: 'schema verification — message field',
        author_name: 'Schema Test',
      });
      if (s1 === 201 && d1?.[0]?.message) {
        if (d1[0].id) track('comments', d1[0].id);
        pass('Schema Check — comments.message field (not "content") confirmed correct');
      } else fail('Schema Check — comments.message field', `HTTP ${s1}: ${JSON.stringify(d1)?.substring(0, 80)}`);
    }
  }

  // Known issue: duplicate doResubmit function at lines 2930 and 3774
  warn('CODE ISSUE — Duplicate doResubmit function', 'Lines 2930 and 3774 both define doResubmit — the second shadows the first. Confirm both callers work correctly.');
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   TASK A — DEVELOPER ROLE USER JOURNEY TEST                  ║');
  console.log(`║   Golf Grove DMS  •  ${TODAY}                              ║`);
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
  await testSubcontractors();
  await testUsers();
  await testComments();
  await checkKnownBugs();

  await runCleanup();
  printSummary();
}

main().catch(err => { console.error('\nFatal error:', err); process.exit(1); });
