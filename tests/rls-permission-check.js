#!/usr/bin/env node
/**
 * RLS Permission Check — Golf Grove DMS
 * tests/rls-permission-check.js
 *
 * Verifies that role-gating is enforced at the DATABASE layer (Supabase RLS),
 * not just hidden in the UI via can().
 *
 * Tests the 4 actions that were SKIPPED in developer-journey.js because they are
 * contractor/subcontractor-only in the UI. This script checks whether a developer
 * can bypass the UI and call those APIs directly.
 *
 * REQUIRES: DEV_EMAIL + DEV_PASSWORD (real developer credentials for JWT auth).
 * The service role key bypasses RLS entirely — it cannot be used to test RLS.
 *
 * Run:
 *   DEV_EMAIL=you@email.com DEV_PASSWORD=pass node tests/rls-permission-check.js
 */

const SUPABASE_URL = 'https://kdxvhrwnnehicgdryowu.supabase.co';
const ANON_KEY    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkeHZocndubmVoaWNnZHJ5b3d1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTg2NjMsImV4cCI6MjA5MTIzNDY2M30.uMlyBkTeth6nVl8ofBu9g_AYlnDLkgDyVTsxxaHI_ic';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkeHZocndubmVoaWNnZHJ5b3d1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY1ODY2MywiZXhwIjoyMDkxMjM0NjYzfQ.q9i53Jx2GXHpX5t89Tdzly0WPiS-TOeiuY36D6uRnUA';

const TODAY = new Date().toISOString().split('T')[0];
const TS    = Date.now();

const results  = [];
const toDelete = {};

function track(table, id) {
  if (!id) return;
  if (!toDelete[table]) toDelete[table] = [];
  toDelete[table].push(id);
}

// A "PASS" here means the action was CORRECTLY BLOCKED (security good).
// A "FAIL" means the action was NOT blocked — RLS is missing, security gap.
function blocked(name)     { results.push({ name, status: 'PASS', info: 'Correctly blocked at DB layer' }); console.log(`  ✓  BLOCKED (secure)  ${name}`); }
function allowed(name, note) { results.push({ name, status: 'FAIL', info: 'NOT blocked — RLS gap: '+note }); console.error(`  ✗  ALLOWED (gap)     ${name}  →  ${note}`); }
function skip(name, reason) { results.push({ name, status: 'SKIP', info: reason }); console.log(`  ⊘  SKIP              ${name}  →  ${reason}`); }
function section(t)         { console.log(`\n${'═'.repeat(64)}\n  ${t}\n${'─'.repeat(64)}`); }

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function apiAs(method, path, body, jwt) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, ok: res.status >= 200 && res.status < 300 };
}

// Service role (bypasses RLS) — only for setup/teardown
async function svc(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

const svcGet = (table, qs = '') => svc('GET', `/rest/v1/${table}${qs}`, null);
const svcIns = (table, body)    => svc('POST', `/rest/v1/${table}`, body);
const svcDel = (table, id)      => svc('DELETE', `/rest/v1/${table}?id=eq.${id}`, null);

// ── Auth ──────────────────────────────────────────────────────────────────────

let devJWT = null;

async function signInAsDeveloper() {
  const email = process.env.DEV_EMAIL;
  const pass_ = process.env.DEV_PASSWORD;

  if (!email || !pass_) {
    console.error('\n[FATAL] This script requires DEV_EMAIL and DEV_PASSWORD environment variables.');
    console.error('  These must be real credentials for a developer-role user.');
    console.error('  The service role key cannot be used — it bypasses RLS entirely.\n');
    console.error('  Run: DEV_EMAIL=you@email.com DEV_PASSWORD=pass node tests/rls-permission-check.js\n');
    process.exit(1);
  }

  const { status, data } = await apiAs('POST', '/auth/v1/token?grant_type=password',
    { email, password: pass_ }, ANON_KEY);

  if (status !== 200 || !data.access_token) {
    console.error(`[FATAL] Sign-in failed: ${data?.error_description || data?.error || status}`);
    process.exit(1);
  }

  devJWT = data.access_token;
  console.log(`[auth] ✓ Signed in as ${email} (developer role)`);
  console.log('[auth] Using real JWT — RLS will be enforced\n');
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

async function runCleanup() {
  console.log('\n── Cleanup ─────────────────────────────────────────────────');
  for (const [table, ids] of Object.entries(toDelete)) {
    for (const id of ids) await svcDel(table, id);
    if (ids.length) console.log(`  ${table}: removed ${ids.length} test record(s)`);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

function printSummary() {
  const pass_ = results.filter(r => r.status === 'PASS').length; // correctly blocked
  const fail_ = results.filter(r => r.status === 'FAIL').length; // security gaps
  const skip_ = results.filter(r => r.status === 'SKIP').length;

  const W = Math.max(...results.map(r => r.name.length), 50);
  console.log('\n' + '═'.repeat(W + 28));
  console.log('  RLS PERMISSION CHECK SUMMARY');
  console.log('  PASS = correctly blocked at DB  |  FAIL = security gap (action allowed when it should be blocked)');
  console.log('═'.repeat(W + 28));
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✓' : r.status === 'FAIL' ? '✗' : '⊘';
    const label = r.status === 'PASS' ? 'BLOCKED' : r.status === 'FAIL' ? 'ALLOWED!' : 'SKIP   ';
    console.log(`  ${icon}  ${label}  ${r.name.padEnd(W)}  ${r.info||''}`);
  }
  console.log('─'.repeat(W + 28));
  console.log(`  Correctly blocked: ${pass_}   Security gaps (FAIL): ${fail_}   Skipped: ${skip_}`);
  if (fail_ > 0) {
    console.log('\n  ⚠ SECURITY GAPS FOUND — RLS does not enforce role restrictions at the DB layer.');
    console.log('  These actions are only hidden in the UI (can() check) but not server-enforced.');
    console.log('  Fix: add Supabase RLS policies that check profiles.role before allowing writes.');
  } else if (pass_ > 0) {
    console.log('\n  ✓ All tested actions are correctly blocked at the DB layer.');
  }
  console.log('═'.repeat(W + 28) + '\n');
  // Exit 1 if security gaps (FAILs) found
  process.exit(fail_ > 0 ? 1 : 0);
}

// ════════════════════════════════════════════════════════════════════════════
// SKIP CLARIFICATIONS (what was skipped and why)
// ════════════════════════════════════════════════════════════════════════════

/**
 * All 4 SKIPs in developer-journey.js were type (a): test intentionally didn't
 * attempt the action at the API level. The can() check is client-side JS only.
 * This script checks if RLS actually enforces these at the database level.
 *
 * Skip 1: Submittal — Resubmit
 *   Action: Insert a new submittal with parent_id linking to a "Revise & Resubmit" parent
 *   UI gate: !can('approve') && status==='Revise & Resubmit' (developer has approve:true)
 *   RLS test: Developer JWT → POST to submittals with parent_id
 *
 * Skip 2: IR — Re-Inspect
 *   Action: Insert a new inspection with parent_ir_id (re-inspect after rejection)
 *   UI gate: !can('approve') && status==='Rejected'
 *   RLS test: Developer JWT → POST to inspections with parent_ir_id
 *
 * Skip 3: NCR — Submit CAP
 *   Action: PATCH ncrs → status:'CAP Submitted' with corrective_action
 *   UI gate: !can('approve') && status==='Open'
 *   RLS test: Developer JWT → PATCH ncrs
 *
 * Skip 4: MS — Submit
 *   Action: POST to method_statements (can('submitMS')=false for developer)
 *   UI gate: can('submitMS') check
 *   RLS test: Developer JWT → POST to method_statements
 */

// ════════════════════════════════════════════════════════════════════════════
// TEST CHECKS
// ════════════════════════════════════════════════════════════════════════════

async function testSkip1_SubmittalResubmit() {
  section('Skip 1: Submittal Resubmit — Developer should not be able to resubmit');

  // Setup: create a submittal in "Revise & Resubmit" state via service role
  let parentId;
  {
    const { data } = await svcIns('submittals', {
      ref_no: `PERM-TEST-SUB-${TS}`, title: 'Permission test submittal',
      from_party: 'MBC', to_party: 'POE', discipline: 'Architecture',
      revision: '00', status: 'Revise & Resubmit', submit_date: TODAY,
    });
    parentId = data?.[0]?.id;
    if (parentId) track('submittals', parentId);
  }

  if (!parentId) { skip('Submittal Resubmit RLS check', 'Setup failed'); return; }

  // Attempt: developer JWT tries to insert a resubmission
  const { status, data } = await apiAs('POST', '/rest/v1/submittals', {
    ref_no: `PERM-TEST-SUB-${TS}-R1`, title: 'Permission test resubmission',
    from_party: 'MBC', to_party: 'POE', discipline: 'Architecture',
    revision: '01', status: 'Pending Review', submit_date: TODAY,
    parent_id: parentId,
  }, devJWT);

  if (status === 201 && data?.[0]?.id) {
    track('submittals', data[0].id);
    allowed('Submittal Resubmit — Developer bypassed RLS', `INSERT succeeded (HTTP 201) — any authenticated user can resubmit. Only UI-gated.`);
  } else if (status === 403 || status === 401) {
    blocked('Submittal Resubmit — Blocked at DB layer (403/401)');
  } else if (status === 400) {
    // Might be an RLS violation wrapped as 400
    const msg = typeof data === 'object' ? JSON.stringify(data) : String(data);
    if (msg.includes('RLS') || msg.includes('policy') || msg.includes('permission')) {
      blocked(`Submittal Resubmit — Blocked at DB layer (400: ${msg.substring(0,80)})`);
    } else {
      allowed('Submittal Resubmit — DB returned 400 (not RLS)', `HTTP 400 but not an RLS error: ${msg.substring(0,80)}`);
    }
  } else {
    allowed('Submittal Resubmit — unexpected response', `HTTP ${status}: ${JSON.stringify(data)?.substring(0,80)}`);
  }
}

async function testSkip2_IRReInspect() {
  section('Skip 2: IR Re-Inspect — Developer should not be able to re-inspect a rejected IR');

  // Setup: create a rejected IR via service role
  let irId;
  {
    const { data } = await svcIns('inspections', {
      ref_no: `PERM-TEST-IR-${TS}`, location: 'TEST Zone',
      elements: 'Permission test IR', request_date: TODAY,
      inspection_date: TODAY, status: 'Rejected',
      site_engineer: 'Test Engineer',
    });
    irId = data?.[0]?.id;
    if (irId) track('inspections', irId);
  }

  if (!irId) { skip('IR Re-Inspect RLS check', 'Setup failed'); return; }

  // Attempt: developer JWT tries to insert a re-inspection
  const { status, data } = await apiAs('POST', '/rest/v1/inspections', {
    ref_no: `PERM-TEST-IR-${TS}-R1`, location: 'TEST Zone',
    elements: 'Re-inspection of permission test IR',
    request_date: TODAY, inspection_date: TODAY, status: 'Pending',
    parent_ir_id: irId, site_engineer: 'Test Engineer',
  }, devJWT);

  if (status === 201 && data?.[0]?.id) {
    track('inspections', data[0].id);
    allowed('IR Re-Inspect — Developer bypassed RLS', `INSERT succeeded (HTTP 201) — any authenticated user can re-inspect. Only UI-gated.`);
  } else if (status === 403 || status === 401) {
    blocked('IR Re-Inspect — Blocked at DB layer (403/401)');
  } else {
    const msg = JSON.stringify(data)?.substring(0, 80);
    allowed('IR Re-Inspect — unexpected response', `HTTP ${status}: ${msg}`);
  }
}

async function testSkip3_NCRSubmitCAP() {
  section('Skip 3: NCR Submit CAP — Developer should not be able to submit a CAP');

  // Setup: create an Open NCR via service role
  let ncrId;
  {
    const { data } = await svcIns('ncrs', {
      ref_no: `PERM-TEST-NCR-${TS}`, title: 'Permission test NCR',
      location: 'TEST', raised_by: 'Test', raised_date: TODAY,
      severity: 'Major', status: 'Open',
    });
    ncrId = data?.[0]?.id;
    if (ncrId) track('ncrs', ncrId);
  }

  if (!ncrId) { skip('NCR Submit CAP RLS check', 'Setup failed'); return; }

  // Attempt: developer JWT tries to submit CAP (PATCH status to 'CAP Submitted')
  const { status, data } = await apiAs('PATCH', `/rest/v1/ncrs?id=eq.${ncrId}`, {
    status: 'CAP Submitted',
    corrective_action: 'Permission test CAP',
    cap_submitted_date: TODAY,
    cap_submitted_by: 'Developer (bypassing UI)',
  }, devJWT);

  if (status === 200) {
    allowed('NCR Submit CAP — Developer bypassed RLS', `PATCH succeeded (HTTP 200) — developer can submit CAP directly. Only UI-gated.`);
  } else if (status === 403 || status === 401) {
    blocked('NCR Submit CAP — Blocked at DB layer (403/401)');
  } else {
    const msg = JSON.stringify(data)?.substring(0, 80);
    allowed('NCR Submit CAP — unexpected response', `HTTP ${status}: ${msg}`);
  }
}

async function testSkip4_MSSubmit() {
  section('Skip 4: MS Submit — Developer (submitMS=false) should not be able to submit MS');

  // Attempt: developer JWT tries to insert a method statement
  const { status, data } = await apiAs('POST', '/rest/v1/method_statements', {
    ref_no: `PERM-TEST-MS-${TS}`, title: `Permission test MS ${TS}`,
    activity: 'Concrete Works', discipline: 'Civil',
    location: 'TEST', revision: 'Rev 0',
    submitted_by: 'Developer (bypassing UI)', submitted_date: TODAY, status: 'Pending Review',
  }, devJWT);

  if (status === 201 && data?.[0]?.id) {
    track('method_statements', data[0].id);
    allowed('MS Submit — Developer bypassed RLS', `INSERT succeeded (HTTP 201) — developer can submit MS directly despite submitMS=false. Only UI-gated.`);
  } else if (status === 403 || status === 401) {
    blocked('MS Submit — Blocked at DB layer (403/401)');
  } else {
    const msg = JSON.stringify(data)?.substring(0, 80);
    allowed('MS Submit — unexpected response', `HTTP ${status}: ${msg}`);
  }
}

// ── Bonus: also verify non-developer roles cannot do developer-only actions ──

async function testDevOnlyActionsFromOtherRoles() {
  section('Bonus: Developer-Only Actions — RLS check from other roles (requires separate user JWTs)');

  console.log('  Note: Full cross-role testing requires separate sign-ins for consultant/contractor/subcontractor.');
  console.log('  This requires creating test accounts with those roles and signing in separately.');
  console.log('  Skipping — flag for manual verification or extend this script with CONSULTANT_EMAIL etc.\n');

  const devOnlyActions = [
    'User Management (Change Role) — only developer has manageUsers:true',
    'Drawing Approve — only approve:true roles (developer, consultant)',
    'NCR Verify/Reject CAP — only approve:true roles',
    'Submittal Review — only approve:true roles',
  ];

  for (const action of devOnlyActions) {
    skip(action, 'Cross-role JWT not available — add CONSULTANT_EMAIL/PASSWORD etc. to test');
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║   RLS PERMISSION CHECK — Golf Grove DMS                        ║');
  console.log(`║   ${new Date().toISOString().split('T')[0]}  •  Tests 4 skipped role-gated actions           ║`);
  console.log('║   PASS = action correctly blocked  |  FAIL = security gap       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  await signInAsDeveloper();

  await testSkip1_SubmittalResubmit();
  await testSkip2_IRReInspect();
  await testSkip3_NCRSubmitCAP();
  await testSkip4_MSSubmit();
  await testDevOnlyActionsFromOtherRoles();

  await runCleanup();
  printSummary();
}

main().catch(err => { console.error('\nFatal:', err); process.exit(1); });
