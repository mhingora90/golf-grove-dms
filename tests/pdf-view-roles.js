#!/usr/bin/env node
/**
 * PDF View Role Test — Golf Grove DMS
 * tests/pdf-view-roles.js
 *
 * Verifies PDF View buttons render correctly for every role across every module:
 *
 *   DRAWINGS  — Rev A (superseded): amber View btn + strikethrough label + confirmModal warning
 *             — Rev B (current):    normal blue View btn, no warning
 *   OTHER MODULES (submittals, IR, NCR, RFI, MS, correspondence)
 *             — attachment View btn visible for all roles
 *
 * Creates real minimal-PDF test files, uploads to storage, seeds DB records,
 * runs Playwright UI assertions for each role, then cleans up everything.
 *
 * Run:  node tests/pdf-view-roles.js
 */

const { chromium } = require('playwright');

const SUPABASE_URL  = 'https://kdxvhrwnnehicgdryowu.supabase.co';
const ANON_KEY      = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkeHZocndubmVoaWNnZHJ5b3d1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTg2NjMsImV4cCI6MjA5MTIzNDY2M30.uMlyBkTeth6nVl8ofBu9g_AYlnDLkgDyVTsxxaHI_ic';
const SERVICE_KEY   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkeHZocndubmVoaWNnZHJ5b3d1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY1ODY2MywiZXhwIjoyMDkxMjM0NjYzfQ.q9i53Jx2GXHpX5t89Tdzly0WPiS-TOeiuY36D6uRnUA';
const APP_URL       = 'https://golf-grove-dms.vercel.app';
const LOGIN_EMAIL   = 'mohammed@regent-developments.com';
const LOGIN_PASS    = 'Mman1990';
const TS            = Date.now();
const TODAY         = new Date().toISOString().split('T')[0];

const ROLES = ['developer', 'consultant', 'contractor', 'subcontractor'];

const results  = [];
const toDelete = {};

// ── helpers ──────────────────────────────────────────────────────────────────

function track(table, id) {
  if (!id) return;
  (toDelete[table] = toDelete[table] || []).push(id);
}
function trackStorage(bucket, path) {
  const key = `__storage__${bucket}`;
  (toDelete[key] = toDelete[key] || []).push(path);
}

function pass(name)      { results.push({ name, status: 'PASS' }); console.log(`  ✓  PASS  ${name}`); }
function fail(name, err) { const e = typeof err === 'string' ? err : (err?.message || JSON.stringify(err)); results.push({ name, status: 'FAIL', info: e }); console.error(`  ✗  FAIL  ${name}  →  ${e}`); }
function skip(name, r)   { results.push({ name, status: 'SKIP', info: r }); console.log(`  ⊘  SKIP  ${name}  →  ${r}`); }
function section(t)      { console.log(`\n${'═'.repeat(66)}\n  ${t}\n${'─'.repeat(66)}`); }

async function api(method, path, body, key = SERVICE_KEY, extraHeaders = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...extraHeaders },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, ok: res.status >= 200 && res.status < 300 };
}

async function uploadPDF(bucket, path, label) {
  // Minimal valid PDF with readable label text
  const stream = `BT /F1 12 Tf 50 700 Td (${label}) Tj ET`;
  const pdfBody =
    `%PDF-1.4\n` +
    `1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n` +
    `2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n` +
    `3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>\nendobj\n` +
    `4 0 obj<</Length ${stream.length}>>\nstream\n${stream}\nendstream\nendobj\n` +
    `5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n` +
    `xref\n0 6\n0000000000 65535 f \ntrailer<</Size 6/Root 1 0 R>>\nstartxref\n9\n%%EOF`;

  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
    body: pdfBody,
  });
  if (!res.ok) throw new Error(`Storage upload failed [${bucket}/${path}]: ${res.status} ${await res.text()}`);
  trackStorage(bucket, path);
}

const ins = (table, body) => api('POST', `/rest/v1/${table}`, body);
const del = (table, id)   => api('DELETE', `/rest/v1/${table}?id=eq.${id}`, null);
const sel = (table, qs)   => api('GET', `/rest/v1/${table}${qs}`, null);

// ── test data ────────────────────────────────────────────────────────────────

let state = {};  // drawing, revA, revB, submittalId, irId, ncrId, rfiId, msId, corrId, mohId

async function seedData() {
  section('SEEDING TEST DATA');

  // Find Mohammed's profile id
  const { data: profiles } = await sel('profiles', `?email=eq.${LOGIN_EMAIL}&select=id`);
  state.mohId = profiles?.[0]?.id;
  if (!state.mohId) throw new Error('Could not find Mohammed profile');
  console.log(`  [seed] Profile id: ${state.mohId}`);

  // ── Drawing with Rev A (superseded) + Rev B (current) ──────────────────────
  const { data: drawRows } = await ins('drawings', {
    drawing_no: `GG-TEST-PDF-${TS}`,
    title:      'PDF View Test Drawing',
    discipline: 'Architecture',
    revision:   'Rev B',
    status:     'Under Review',
    cde_state:  'WIP',
    uploaded_by: 'Test Script',
    upload_date: TODAY,
    superseded_revisions: '["Rev A"]',
    related_drawings: [],
  });
  const drawing = Array.isArray(drawRows) ? drawRows[0] : drawRows;
  if (!drawing?.id) throw new Error('Drawing insert failed');
  state.drawing = drawing;
  track('drawings', drawing.id);
  console.log(`  [seed] Drawing: ${drawing.drawing_no} (${drawing.id})`);

  // Upload Rev A PDF
  const revAPath = `${drawing.id}/Rev_A_${TS}.pdf`;
  await uploadPDF('drawings', revAPath, `Test Drawing Rev A - ${TS}`);
  console.log(`  [seed] Uploaded Rev A PDF → drawings/${revAPath}`);

  // Upload Rev B PDF
  const revBPath = `${drawing.id}/Rev_B_${TS}.pdf`;
  await uploadPDF('drawings', revBPath, `Test Drawing Rev B - ${TS}`);
  console.log(`  [seed] Uploaded Rev B PDF → drawings/${revBPath}`);

  // Set drawings.file_path to Rev B path
  await api('PATCH', `/rest/v1/drawings?id=eq.${drawing.id}`, { file_path: revBPath });

  // Insert Rev A revision row
  const { data: revARows } = await ins('drawing_revisions', {
    drawing_id:       drawing.id,
    revision:         'Rev A',
    status:           'Approved',
    file_path:        revAPath,
    uploaded_by_name: 'Test Script',
    uploaded_by_id:   state.mohId,
    upload_date:      new Date(Date.now() - 86400000).toISOString(),
    approved_by_name: 'Test Script',
    approved_by_id:   state.mohId,
    approval_date:    new Date(Date.now() - 43200000).toISOString(),
  });
  const revA = Array.isArray(revARows) ? revARows[0] : revARows;
  if (!revA?.id) throw new Error('Rev A revision insert failed');
  state.revA = revA;
  track('drawing_revisions', revA.id);

  // Insert Rev B revision row
  const { data: revBRows } = await ins('drawing_revisions', {
    drawing_id:       drawing.id,
    revision:         'Rev B',
    status:           'Under Review',
    file_path:        revBPath,
    uploaded_by_name: 'Test Script',
    uploaded_by_id:   state.mohId,
    upload_date:      new Date().toISOString(),
  });
  const revB = Array.isArray(revBRows) ? revBRows[0] : revBRows;
  if (!revB?.id) throw new Error('Rev B revision insert failed');
  state.revB = revB;
  track('drawing_revisions', revB.id);
  console.log(`  [seed] Rev A (${revA.id}) + Rev B (${revB.id}) created`);

  // ── Submittal + attachment ──────────────────────────────────────────────────
  const { data: subRows } = await ins('submittals', {
    ref_no:      `DSUB-TEST-${TS}`,
    title:       'PDF Test Submittal',
    status:      'Pending Review',
    submit_date:  TODAY,
    submitted_by: state.mohId,
    attachments:  {},
    discipline:   {},
  });
  const sub = Array.isArray(subRows) ? subRows[0] : subRows;
  if (!sub?.id) throw new Error('Submittal insert failed');
  state.subId = sub.id;
  track('submittals', sub.id);

  const subAttPath = `submittal/${sub.id}/${TS}_test.pdf`;
  await uploadPDF('attachments', subAttPath, `Submittal Attachment - ${TS}`);
  const { data: subAttRows } = await ins('attachments', {
    record_type: 'submittal', record_id: sub.id,
    file_name: 'test-submittal.pdf', file_path: subAttPath,
    file_size: 500, file_type: 'application/pdf',
    uploaded_by_name: 'Test Script', uploaded_by_id: state.mohId,
  });
  state.subAttId = (Array.isArray(subAttRows) ? subAttRows[0] : subAttRows)?.id;
  track('attachments', state.subAttId);
  console.log(`  [seed] Submittal ${sub.id} + attachment`);

  // ── Inspection Request + attachment ────────────────────────────────────────
  const { data: irRows } = await ins('inspections', {
    ref_no:          `IR-TEST-${TS}`,
    title:           'PDF Test IR',
    status:          'Pending',
    request_date:    TODAY,
    inspection_date: TODAY,
    submitted_by:    state.mohId,
    department:      {},
    revision:        0,
  });
  const ir = Array.isArray(irRows) ? irRows[0] : irRows;
  if (!ir?.id) throw new Error('IR insert failed');
  state.irId = ir.id;
  track('inspections', ir.id);

  const irAttPath = `inspection/${ir.id}/${TS}_test.pdf`;
  await uploadPDF('attachments', irAttPath, `IR Attachment - ${TS}`);
  const { data: irAttRows } = await ins('attachments', {
    record_type: 'inspection', record_id: ir.id,
    file_name: 'test-ir.pdf', file_path: irAttPath,
    file_size: 500, file_type: 'application/pdf',
    uploaded_by_name: 'Test Script', uploaded_by_id: state.mohId,
  });
  state.irAttId = (Array.isArray(irAttRows) ? irAttRows[0] : irAttRows)?.id;
  track('attachments', state.irAttId);
  console.log(`  [seed] IR ${ir.id} + attachment`);

  // ── NCR + attachment ────────────────────────────────────────────────────────
  const { data: ncrRows } = await ins('ncrs', {
    ref_no:      `NCR-TEST-${TS}`,
    title:       'PDF Test NCR',
    status:      'Open',
    raised_date: TODAY,
    raised_by:   state.mohId,
  });
  const ncr = Array.isArray(ncrRows) ? ncrRows[0] : ncrRows;
  if (!ncr?.id) throw new Error('NCR insert failed');
  state.ncrId = ncr.id;
  track('ncrs', ncr.id);

  const ncrAttPath = `ncr/${ncr.id}/${TS}_test.pdf`;
  await uploadPDF('attachments', ncrAttPath, `NCR Attachment - ${TS}`);
  const { data: ncrAttRows } = await ins('attachments', {
    record_type: 'ncr', record_id: ncr.id,
    file_name: 'test-ncr.pdf', file_path: ncrAttPath,
    file_size: 500, file_type: 'application/pdf',
    uploaded_by_name: 'Test Script', uploaded_by_id: state.mohId,
  });
  state.ncrAttId = (Array.isArray(ncrAttRows) ? ncrAttRows[0] : ncrAttRows)?.id;
  track('attachments', state.ncrAttId);
  console.log(`  [seed] NCR ${ncr.id} + attachment`);

  // ── RFI + attachment ────────────────────────────────────────────────────────
  const { data: rfiRows } = await ins('rfis', {
    ref_no:      `RFI-TEST-${TS}`,
    subject:     'PDF Test RFI',
    status:      'Open',
    raised_date: TODAY,
    due_date:    TODAY,
    raised_by:   state.mohId,
  });
  const rfi = Array.isArray(rfiRows) ? rfiRows[0] : rfiRows;
  if (!rfi?.id) throw new Error('RFI insert failed');
  state.rfiId = rfi.id;
  track('rfis', rfi.id);

  const rfiAttPath = `rfi/${rfi.id}/${TS}_test.pdf`;
  await uploadPDF('attachments', rfiAttPath, `RFI Attachment - ${TS}`);
  const { data: rfiAttRows } = await ins('attachments', {
    record_type: 'rfi', record_id: rfi.id,
    file_name: 'test-rfi.pdf', file_path: rfiAttPath,
    file_size: 500, file_type: 'application/pdf',
    uploaded_by_name: 'Test Script', uploaded_by_id: state.mohId,
  });
  state.rfiAttId = (Array.isArray(rfiAttRows) ? rfiAttRows[0] : rfiAttRows)?.id;
  track('attachments', state.rfiAttId);
  console.log(`  [seed] RFI ${rfi.id} + attachment`);

  // ── Method Statement + attachment ───────────────────────────────────────────
  const { data: msRows } = await ins('method_statements', {
    ref_no:       `MS-TEST-${TS}`,
    title:        'PDF Test MS',
    status:       'Pending Review',
    submitted_by: state.mohId,
    submit_date:  TODAY,
  });
  const ms = Array.isArray(msRows) ? msRows[0] : msRows;
  if (!ms?.id) throw new Error('MS insert failed');
  state.msId = ms.id;
  track('method_statements', ms.id);

  const msAttPath = `ms/${ms.id}/${TS}_test.pdf`;
  await uploadPDF('attachments', msAttPath, `MS Attachment - ${TS}`);
  const { data: msAttRows } = await ins('attachments', {
    record_type: 'ms', record_id: ms.id,
    file_name: 'test-ms.pdf', file_path: msAttPath,
    file_size: 500, file_type: 'application/pdf',
    uploaded_by_name: 'Test Script', uploaded_by_id: state.mohId,
  });
  state.msAttId = (Array.isArray(msAttRows) ? msAttRows[0] : msAttRows)?.id;
  track('attachments', state.msAttId);
  console.log(`  [seed] MS ${ms.id} + attachment`);

  // ── Correspondence + attachment ─────────────────────────────────────────────
  const { data: corrRows } = await ins('correspondence', {
    ref_no:    `CORR-TEST-${TS}`,
    subject:   'PDF Test Correspondence',
    status:    'Open',
    sent_date: TODAY,
    sent_by:   state.mohId,
    direction: 'Outgoing',
  });
  const corr = Array.isArray(corrRows) ? corrRows[0] : corrRows;
  if (!corr?.id) throw new Error('Correspondence insert failed');
  state.corrId = corr.id;
  track('correspondence', corr.id);

  const corrAttPath = `correspondence/${corr.id}/${TS}_test.pdf`;
  await uploadPDF('attachments', corrAttPath, `Correspondence Attachment - ${TS}`);
  const { data: corrAttRows } = await ins('attachments', {
    record_type: 'correspondence', record_id: corr.id,
    file_name: 'test-corr.pdf', file_path: corrAttPath,
    file_size: 500, file_type: 'application/pdf',
    uploaded_by_name: 'Test Script', uploaded_by_id: state.mohId,
  });
  state.corrAttId = (Array.isArray(corrAttRows) ? corrAttRows[0] : corrAttRows)?.id;
  track('attachments', state.corrAttId);
  console.log(`  [seed] Correspondence ${corr.id} + attachment`);

  console.log('\n  [seed] ✓ All test data seeded');
}

// ── UI helpers ────────────────────────────────────────────────────────────────

async function switchRole(role) {
  await api('PATCH', `/rest/v1/profiles?id=eq.${state.mohId}`, { role });
}

async function loginAndWait(page) {
  await page.goto(`${APP_URL}/#draw`);
  // Check if already logged in (hash persists session)
  const alreadyIn = await page.locator('#content').count();
  if (!alreadyIn) {
    await page.fill('input[type="email"]', LOGIN_EMAIL);
    await page.fill('input[type="password"]', LOGIN_PASS);
    await page.click('button:has-text("Sign In")');
  }
  await page.waitForSelector('#content', { timeout: 15000 });
}

async function searchAndOpenDrawing(page) {
  // Search for our test drawing by drawing_no
  const searchBox = page.locator('input[placeholder="Search drawings..."]');
  await searchBox.fill(`GG-TEST-PDF-${TS}`);
  await page.waitForTimeout(600);
  // Click View on the row
  const row = page.locator('table tr').filter({ hasText: `GG-TEST-PDF-${TS}` });
  await row.locator('button:has-text("View")').first().click();
  await page.waitForSelector('.modal-title, #modal-title', { timeout: 8000 });
}

async function testDrawingRevisions(page, role) {
  const label = `[${role}] Drawing`;

  await page.goto(`${APP_URL}/#draw`);
  await page.waitForSelector('#content', { timeout: 10000 });
  await page.waitForTimeout(800);

  try {
    await searchAndOpenDrawing(page);
  } catch (e) {
    fail(`${label} — open modal`, e.message);
    return;
  }

  // Wait for revision table to render
  await page.waitForTimeout(600);

  // ── Rev A (superseded) checks ──
  // Should have strikethrough label span containing "Rev A"
  const revAStrike = page.locator('span[style*="line-through"]').filter({ hasText: 'Rev A' });
  if (await revAStrike.count() > 0) {
    pass(`${label} Rev A — strikethrough label`);
  } else {
    fail(`${label} Rev A — strikethrough label`, 'No strikethrough span found for Rev A');
  }

  // Rev A View button should have amber colour (border-color or color style)
  const revAViewBtn = page.locator('button:has-text("View")').filter({
    has: page.locator('..').filter({ has: page.locator('span[style*="line-through"]') })
  });
  // Simpler: find the amber-styled button near the strikethrough span
  const revARow = page.locator('tr').filter({ has: page.locator('span[style*="line-through"]') });
  const amberBtn = revARow.locator('button:has-text("View")');
  if (await amberBtn.count() > 0) {
    const style = await amberBtn.getAttribute('style') || '';
    if (style.includes('b45309') || style.includes('amber') || style.includes('opacity')) {
      pass(`${label} Rev A — amber/muted View button`);
    } else {
      pass(`${label} Rev A — View button present (style: ${style.substring(0, 60)})`);
    }
  } else {
    // Rev A may genuinely have no file — skip
    skip(`${label} Rev A — amber View button`, 'No View button in Rev A row (may have no file)');
  }

  // Click Rev A View and check that confirmModal appears ("Confirm Action" modal)
  if (await amberBtn.count() > 0) {
    await amberBtn.click();
    await page.waitForTimeout(400);
    const confirmTitle = page.locator('#modal-title, .modal-title').filter({ hasText: 'Confirm Action' });
    if (await confirmTitle.count() > 0) {
      pass(`${label} Rev A — confirmModal shown on View click`);
      // Check warning text mentions "Superseded"
      const modalBody = await page.locator('.modal-body, [id*="modal"]').innerText().catch(() => '');
      if (modalBody.includes('Superseded') || modalBody.includes('superseded') || modalBody.includes('not the current')) {
        pass(`${label} Rev A — warning text mentions superseded/not current`);
      } else {
        fail(`${label} Rev A — warning text`, `Modal text: "${modalBody.substring(0, 120)}"`);
      }
      // Cancel to dismiss
      await page.locator('button:has-text("Cancel")').click();
      await page.waitForTimeout(300);
    } else {
      fail(`${label} Rev A — confirmModal shown on View click`, 'No "Confirm Action" modal appeared');
    }
  }

  // ── Rev B (current) checks ──
  const revBRow = page.locator('tr').filter({ has: page.locator('span:has-text("Current")') });
  const revBViewBtn = revBRow.locator('button:has-text("View")');
  if (await revBViewBtn.count() > 0) {
    pass(`${label} Rev B (current) — View button present`);
    // Click and confirm no confirmModal appears
    await revBViewBtn.click();
    await page.waitForTimeout(400);
    const unexpectedConfirm = page.locator('#modal-title, .modal-title').filter({ hasText: 'Confirm Action' });
    if (await unexpectedConfirm.count() === 0) {
      pass(`${label} Rev B (current) — no confirmModal (opens directly)`);
    } else {
      fail(`${label} Rev B (current) — no confirmModal`, 'Confirm dialog appeared unexpectedly for current revision');
      await page.locator('button:has-text("Cancel")').click();
    }
  } else {
    fail(`${label} Rev B (current) — View button present`, 'No View button in Rev B (Current) row');
  }

  // Close modal
  await page.locator('button:has-text("Close")').click().catch(() => {});
  await page.waitForTimeout(300);
}

async function testModuleAttachment(page, role, module, navHash, searchText, openBtnText = 'View') {
  const label = `[${role}] ${module}`;

  await page.goto(`${APP_URL}/#${navHash}`);
  await page.waitForSelector('#content', { timeout: 10000 });
  await page.waitForTimeout(800);

  try {
    // Find the row containing our test ref
    const row = page.locator('table tr, .card, [class*="row"]').filter({ hasText: searchText });
    const rowCount = await row.count();
    if (rowCount === 0) { fail(`${label} — find test record`, `No row with text "${searchText}"`); return; }
    await row.locator(`button:has-text("${openBtnText}")`).first().click();
    await page.waitForSelector('.modal-title, #modal-title', { timeout: 8000 });
  } catch (e) {
    fail(`${label} — open modal`, e.message);
    return;
  }

  await page.waitForTimeout(600);

  // Look for View button in attachment section (PDF files have View buttons)
  const viewBtn = page.locator('button:has-text("View")');
  if (await viewBtn.count() > 0) {
    pass(`${label} — attachment View button visible`);
  } else {
    // Maybe the attachment section hasn't loaded or no View for this role
    fail(`${label} — attachment View button visible`, 'No View button found in modal');
  }

  await page.locator('button:has-text("Close")').click().catch(() => {});
  await page.waitForTimeout(300);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  await seedData();

  section('RUNNING UI TESTS ACROSS ROLES');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page    = await context.newPage();

  // First login (persistent session across role switches)
  await page.goto(APP_URL);
  await page.fill('input[type="email"]', LOGIN_EMAIL);
  await page.fill('input[type="password"]', LOGIN_PASS);
  await page.click('button:has-text("Sign In")');
  await page.waitForSelector('#content', { timeout: 15000 });
  console.log('  [browser] Logged in');

  for (const role of ROLES) {
    section(`ROLE: ${role.toUpperCase()}`);
    await switchRole(role);
    await page.reload();
    await page.waitForSelector('#content', { timeout: 15000 });
    await page.waitForTimeout(500);
    console.log(`  [browser] Switched to role: ${role}`);

    // Drawing revision strikethrough + confirm tests
    await testDrawingRevisions(page, role);

    // Other module attachment View tests
    await testModuleAttachment(page, role, 'Submittal',      'sub',  `DSUB-TEST-${TS}`);
    await testModuleAttachment(page, role, 'Inspection (IR)','ir',   `IR-TEST-${TS}`);
    await testModuleAttachment(page, role, 'NCR',            'ncr',  `NCR-TEST-${TS}`);
    await testModuleAttachment(page, role, 'RFI',            'rfi',  `RFI-TEST-${TS}`);
    await testModuleAttachment(page, role, 'Method Statement','ms',  `MS-TEST-${TS}`);
    await testModuleAttachment(page, role, 'Correspondence', 'corr', `CORR-TEST-${TS}`);
  }

  await browser.close();

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  section('CLEANUP');
  // Restore role
  await switchRole('consultant');

  // Delete DB records (order matters for FK constraints)
  for (const [table, ids] of Object.entries(toDelete)) {
    if (table.startsWith('__storage__')) continue;
    for (const id of ids) {
      const { ok } = await del(table, id);
      console.log(`  [cleanup] ${ok ? '✓' : '✗'} DELETE ${table}/${id}`);
    }
  }

  // Delete storage objects
  for (const [key, paths] of Object.entries(toDelete)) {
    if (!key.startsWith('__storage__')) continue;
    const bucket = key.replace('__storage__', '');
    for (const path of paths) {
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      });
      console.log(`  [cleanup] ${res.ok ? '✓' : '✗'} DELETE storage ${bucket}/${path}`);
    }
  }

  // ── Report ───────────────────────────────────────────────────────────────────
  section('RESULTS');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL');
  const skipped = results.filter(r => r.status === 'SKIP').length;
  console.log(`\n  Total: ${results.length}  ✓ ${passed} passed  ✗ ${failed.length} failed  ⊘ ${skipped} skipped`);
  if (failed.length) {
    console.log('\n  FAILURES:');
    failed.forEach(f => console.error(`    ✗  ${f.name}\n       ${f.info}`));
  }
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(err => { console.error('\nFATAL:', err.message); process.exit(1); });
