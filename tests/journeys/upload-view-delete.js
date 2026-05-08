#!/usr/bin/env node
'use strict';

const { chromium }   = require('playwright');
const path           = require('path');
const { randomUUID } = require('crypto');
const {
  SUPABASE_URL, SERVICE_KEY, ANON_KEY,
  APP_URL, TEST_ACCOUNTS, TEST_PASSWORD,
} = require('../config');
const { api, login } = require('../helpers/api');

const PDF_FIXTURE = path.resolve(__dirname, '../fixtures/sample.pdf');
const TS          = Date.now();

const results  = [];
const toDelete = {};
function track(table, id)    { if (!id) return; (toDelete[table] = toDelete[table] || []).push(id); }
function trackSt(bucket, fp) { const k = '__storage__' + bucket; (toDelete[k] = toDelete[k] || []).push(fp); }
function pass(name)          { results.push({ name, status:'PASS' }); console.log('  \u2713  PASS  ' + name); }
function fail(name, err)     { const e = typeof err === 'string' ? err : (err && err.message ? err.message : String(err)).substring(0,150); results.push({ name, status:'FAIL', info:e }); console.error('  \u2717  FAIL  ' + name + '  \u2192  ' + e); }
function skip(name, why)     { results.push({ name, status:'SKIP', info:why }); console.log('  \u2298  SKIP  ' + name + '  \u2192  ' + why); }
function section(t)          { console.log('\n' + '='.repeat(68) + '\n  ' + t + '\n' + '-'.repeat(68)); }

async function loginAs(page, role) {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#login-email', { timeout: 15000 });
  await page.fill('#login-email', TEST_ACCOUNTS[role]);
  await page.fill('#login-password', TEST_PASSWORD);
  await page.click('#login-btn');
  await page.waitForSelector('#app-screen', { state: 'visible', timeout: 20000 });
}

async function logout(page) {
  try {
    await page.click('#logout-btn', { timeout: 3000 });
    await page.waitForSelector('#auth-screen', { state: 'visible', timeout: 8000 });
  } catch (e) { /* ignore */ }
}

async function navTo(page, id) {
  // Ensure no modal is blocking before nav click
  try { await page.waitForSelector('#modal-bg.open', { state: 'hidden', timeout: 2000 }); } catch { /* ignore */ }
  await page.click('#n-' + id, { force: true });
  // Wait for content to render — network idle ensures data fetches complete
  try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch { /* ignore */ }
  await page.waitForTimeout(500);
}

async function storagePut(bucket, filePath, jwt) {
  const buf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\nxref\n0 0\ntrailer<</Size 1/Root 1 0 R>>\nstartxref\n0\n%%EOF');
  return fetch(SUPABASE_URL + '/storage/v1/object/' + bucket + '/' + filePath, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + jwt, apikey: ANON_KEY, 'Content-Type': 'application/pdf' },
    body: buf,
  });
}

async function verifySignedUrl(bucket, filePath) {
  const signRes = await fetch(SUPABASE_URL + '/storage/v1/object/sign/' + bucket + '/' + filePath, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + SERVICE_KEY, apikey: SERVICE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 60 }),
  });
  if (!signRes.ok) return { ok: false, status: signRes.status, detail: 'sign endpoint failed' };
  const body = await signRes.json();
  const signedURL = body.signedURL || body.signedUrl;
  if (!signedURL) return { ok: false, status: 0, detail: 'no signedURL in response' };
  const fileRes = await fetch(SUPABASE_URL + '/storage/v1' + signedURL);
  return { ok: fileRes.ok, status: fileRes.status };
}

async function seedDrawingWithFile(role) {
  const jwt    = await login(TEST_ACCOUNTS[role], TEST_PASSWORD);
  const drawId = randomUUID();
  const fp     = drawId + '/Rev_A_' + TS + '.pdf';
  const upRes  = await storagePut('drawings', fp, jwt);
  if (!upRes.ok) return { err: 'storage PUT ' + upRes.status + ': ' + await upRes.text() };
  trackSt('drawings', fp);
  const dbRes = await api('POST', '/rest/v1/drawings', {
    id: drawId,
    drawing_no: 'TST-UVD-' + role + '-' + TS,
    title: 'UVD Test ' + role,
    discipline: 'Architecture',
    status: 'Under Review',
    revision: 'Rev A',
    cde_state: 'WIP',
    file_path: fp,
    superseded_revisions: '[]',
    related_drawings: [],
  });
  if (!dbRes.ok) return { err: 'drawing insert: ' + JSON.stringify(dbRes.data) };
  track('drawings', drawId);
  const revRes = await api('POST', '/rest/v1/drawing_revisions', {
    drawing_id: drawId, revision: 'Rev A', status: 'Under Review', file_path: fp,
  });
  if (!revRes.ok) return { err: 'revision insert: ' + JSON.stringify(revRes.data) };
  track('drawing_revisions', revRes.data[0].id);
  return { drawId, fp, jwt };
}

// =============================================================================
// SECTION 1 — File Path Integrity
// =============================================================================
async function testFilepathIntegrity() {
  section('1 — FILE PATH INTEGRITY (API, no browser)');
  for (const role of ['developer', 'consultant', 'contractor']) {
    const seed = await seedDrawingWithFile(role);
    if (seed.err) { fail(role + ' — seed drawing+file', seed.err); continue; }
    pass(role + ' — storage upload succeeds');
    pass(role + ' — drawing + revision inserted');
    const check = await verifySignedUrl('drawings', seed.fp);
    if (check.ok) pass(role + ' — signed URL accessible (HTTP ' + check.status + ')');
    else          fail(role + ' — signed URL accessible', 'HTTP ' + check.status + ' — ' + (check.detail || 'file not found'));
  }
}

// =============================================================================
// SECTION 2 — Drawing Upload via UI, View, PDF Canvas
// =============================================================================
async function testDrawingUploadView(browser) {
  section('2 — DRAWING UPLOAD via UI -> VIEW -> PDF RENDERS (Playwright)');
  for (const role of ['developer', 'consultant', 'contractor']) {
    const page = await browser.newPage();
    const consoleErrors2 = [];
    const failedRequests = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors2.push(m.text()); });
    page.on('response', async res => {
      if (res.status() >= 400) {
        try {
          const body = await res.text();
          failedRequests.push({ url: res.url(), status: res.status(), body: body.substring(0, 200) });
        } catch { failedRequests.push({ url: res.url(), status: res.status(), body: '(unreadable)' }); }
      }
    });
    try {
      await loginAs(page, role);
      await navTo(page, 'draw');
      const fab = await page.$('#new-btn');
      if (!fab || !(await fab.isVisible())) {
        skip(role + ' — drawing upload (no FAB)', 'upload=false for role');
        await page.close();
        continue;
      }
      await fab.click();
      await page.waitForSelector('#nd-title', { timeout: 5000 });

      const num4   = String(TS % 10000).padStart(4, '0');
      const suffix = { developer: 'RD', consultant: 'RC', contractor: 'RT' }[role] || 'RX';
      const drawNo = 'GG-TST-Z1-L1-DR-A-' + num4 + '-' + suffix;
      await page.fill('#nd-id',    drawNo);
      await page.fill('#nd-title', 'UVD PDF Test ' + role);
      await page.fill('#nd-orig',  'TST');
      await page.fill('#nd-zone',  'Z1');
      await page.fill('#nd-level', 'L1');
      await page.selectOption('#nd-status', 'Under Review');
      await page.setInputFiles('#fu-new', PDF_FIXTURE);
      await page.waitForTimeout(400);

      await page.locator('button[onclick="doNewDraw()"]').click();
      // Capture any toast messages shown
      let toastText = '';
      const toastHandle = page.locator('.toast, [class*="toast"], [id*="toast"]').first();
      try {
        await page.waitForSelector('#modal-bg.open', { state: 'hidden', timeout: 45000 });
        pass(role + ' — drawing uploaded via UI');
      } catch (e) {
        const w  = await page.$('#nd-num-warn');
        const rw = await page.$('#nd-rev-warn');
        const wt = (w  ? await w.textContent()  : '') + ' ' + (rw ? await rw.textContent() : '');
        try { toastText = await toastHandle.textContent({ timeout: 500 }); } catch { /* no toast */ }
        const consErrs = [];
        page.on('console', m => { if (m.type() === 'error') consErrs.push(m.text()); });
        const reqInfo = failedRequests.map(r => r.status + ' ' + r.url.split('/').slice(-2).join('/') + ' → ' + r.body.substring(0, 80)).join(' | ');
        fail(role + ' — drawing uploaded via UI', 'modal did not close. warn="' + wt.trim() + '" toast="' + toastText.trim() + '" reqs=[' + reqInfo + ']');
        await page.close();
        continue;
      }

      await page.waitForTimeout(800);
      const searchVal = 'uvd pdf test ' + role.toLowerCase();
      const row = page.locator('tr.draw-row[data-search*="' + searchVal + '"]');
      if (await row.count() === 0) {
        fail(role + ' — new row in list', 'not found');
        await page.close();
        continue;
      }
      pass(role + ' — new drawing row in list');

      // Click View button inside the row (clicking <tr> doesn't trigger <td onclick>)
      const viewBtn2 = row.first().locator('button.btn-sm').first();
      if (await viewBtn2.count() > 0) await viewBtn2.click();
      else await row.first().locator('td[onclick*="viewDraw"]').click();
      await page.waitForSelector('#modal-bg.open', { timeout: 6000 });
      pass(role + ' — drawing detail modal opens');

      try {
        await page.waitForSelector('canvas[id^="pdf-canvas"]', { timeout: 9000 });
        pass(role + ' — PDF canvas rendered');
      } catch (e) {
        const errEl  = await page.$('.pdf-error');
        const errTxt = errEl ? await errEl.textContent() : '';
        fail(role + ' — PDF canvas rendered', errTxt || 'spinner hung — initPdfViewer not called?');
      }

      const pdfErr = await page.$('.pdf-error');
      if (!pdfErr) pass(role + ' — no pdf-error element');
      else         fail(role + ' — no pdf-error element', await pdfErr.textContent());

      try { await page.click('.modal-close', { timeout: 3000 }); } catch { /* ignore */ }
      try { await page.waitForSelector('#modal-bg.open', { state: 'hidden', timeout: 3000 }); } catch { /* ignore */ }
    } catch (e) {
      fail(role + ' — upload/view suite', e);
    } finally {
      await logout(page);
      await page.close();
    }
  }
}

// =============================================================================
// SECTION 3 — Delete Permissions
// =============================================================================
async function testDeletePermissions(browser) {
  section('3 — DELETE PERMISSIONS (Playwright)');
  const seed = await seedDrawingWithFile('developer');
  if (seed.err) { fail('seed drawing for delete tests', seed.err); return; }
  const { drawId } = seed;

  // consultant/contractor checked first so drawing still exists for them; developer deletes last
  for (const role of ['consultant', 'contractor', 'developer']) {
    const page = await browser.newPage();
    try {
      await loginAs(page, role);
      // Wait for dashboard to settle before navigating
      try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch { /* ignore */ }
      await navTo(page, 'draw');
      // Explicitly wait for at least one draw-row to confirm render completed
      try { await page.waitForSelector('tr.draw-row', { timeout: 8000 }); } catch { /* ignore */ }
      const row = page.locator('tr.draw-row[data-id="' + drawId + '"]');
      if (await row.count() === 0) {
        const totalRows = await page.locator('tr.draw-row').count();
        skip(role + ' — delete button visibility', 'row not found (total rows=' + totalRows + ')');
        await page.close();
        continue;
      }
      // Click View button (or title cell) to open modal
      const viewBtn = row.locator('button.btn-sm').first();
      if (await viewBtn.count() > 0) await viewBtn.click();
      else await row.click();
      await page.waitForSelector('#modal-bg.open', { timeout: 6000 });

      const delBtn    = page.locator('button[onclick*="deleteDraw"]');
      const delVisible = await delBtn.count() > 0 && await delBtn.isVisible();

      if (role === 'developer') {
        if (delVisible) {
          pass('developer — Delete Drawing button visible');
          await delBtn.click();
          await page.waitForSelector('#modal-bg.open', { timeout: 4000 });
          await page.click('#confirm-yes');
          await page.waitForSelector('#modal-bg.open', { state: 'hidden', timeout: 8000 });
          await page.waitForTimeout(600);
          const gone = await page.locator('tr.draw-row[data-id="' + drawId + '"]').count() === 0;
          if (gone) {
            pass('developer — drawing deleted, row gone from list');
            if (toDelete['drawings']) toDelete['drawings'] = toDelete['drawings'].filter(id => id !== drawId);
          } else {
            fail('developer — drawing deleted', 'row still visible after delete');
          }
        } else {
          fail('developer — Delete Drawing button visible', 'button not found or not visible');
        }
      } else {
        if (!delVisible) pass(role + ' — Delete Drawing button correctly hidden');
        else             fail(role + ' — Delete Drawing button hidden', 'button is visible — should not be');
        try { await page.click('.modal-close', { timeout: 3000 }); } catch { /* ignore */ }
        try { await page.waitForSelector('#modal-bg.open', { state: 'hidden', timeout: 3000 }); } catch { /* ignore */ }
      }
    } catch (e) {
      fail(role + ' — delete permission test', e);
    } finally {
      await logout(page);
      await page.close();
    }
  }
}

// =============================================================================
// SECTION 4 — Module View (no crash)
// =============================================================================
async function testModuleView(browser) {
  section('4 — MODULE VIEW — NO CRASH (Playwright, developer)');
  const TODAY = new Date().toISOString().split('T')[0];

  const seedOps = [
    ['submittals',       { ref_no: 'SUB-UVD-' + TS, title: 'UVD Sub',  discipline: 'Architecture', status: 'Pending Review', submit_date: TODAY, from_party: 'Contractor', to_party: 'Consultant' }],
    ['inspections',      { ref_no: 'IR-UVD-'  + TS, location: 'L1',    elements: 'Concrete',       status: 'Pending',        request_date: TODAY }],
    ['ncrs',             { ref_no: 'NCR-UVD-' + TS, title: 'UVD NCR',  status: 'Open',             severity: 'Minor' }],
    ['rfis',             { ref_no: 'RFI-UVD-' + TS, subject: 'UVD RFI',status: 'Open',             from_party: 'Contractor', to_party: 'Consultant', priority: 'Normal' }],
    ['transmittals',     { ref_no: 'TRN-UVD-' + TS, notes: 'UVD Trn',  transmit_date: TODAY,       from_party: 'Consultant', to_party: 'Contractor' }],
    ['correspondence',   { ref_no: 'COR-UVD-' + TS, subject: 'UVD Cor',type: 'Letter',             status: 'Open',           correspondence_date: TODAY, from_party: 'Consultant', to_party: 'Contractor' }],
    ['punch_list',       { description: 'UVD Punch', location: 'L1',    status: 'Open',             severity: 'Minor' }],
    ['method_statements',{ ref_no: 'MS-UVD-'  + TS, title: 'UVD MS',   activity: 'Concrete',       status: 'Pending Review', submitted_date: TODAY }],
  ];

  const seeds = {};
  for (const [table, body] of seedOps) {
    const r = await api('POST', '/rest/v1/' + table, body);
    if (r.ok && r.data && r.data[0] && r.data[0].id) {
      seeds[table] = r.data[0].id;
      track(table, r.data[0].id);
    } else {
      console.warn('  WARNING seed ' + table + ': ' + JSON.stringify(r.data).substring(0, 80));
    }
  }

  const MODULES = [
    { nav:'sub',   table:'submittals',        row:'.sub-row',   label:'Submittals' },
    { nav:'ir',    table:'inspections',       row:'.ir-row',    label:'Inspections' },
    { nav:'ncr',   table:'ncrs',              row:'.ncr-row',   label:'NCRs' },
    { nav:'rfi',   table:'rfis',              row:'.rfi-row',   label:'RFIs' },
    { nav:'trans', table:'transmittals',      row:'.trans-row', label:'Transmittals' },
    { nav:'corr',  table:'correspondence',    row:'.corr-row',  label:'Correspondence' },
    { nav:'punch', table:'punch_list',        row:'.punch-row', label:'Punch List' },
    { nav:'ms',    table:'method_statements', row:'.ms-row',    label:'Method Statements' },
  ];

  const page = await browser.newPage();
  try {
    await loginAs(page, 'developer');
    // Let dashboard fully settle (its async queries fire on login)
    try { await page.waitForLoadState('networkidle', { timeout: 10000 }); } catch { /* ignore */ }
    for (const mod of MODULES) {
      const seedId = seeds[mod.table];
      if (!seedId) { skip(mod.label + ' — view modal', 'seed failed'); continue; }
      try {
        await navTo(page, mod.nav);
        // Wait for at least one row to confirm render completed
        try { await page.waitForSelector(mod.row, { timeout: 6000 }); } catch { /* module might be empty */ }
        const rowEl = page.locator(mod.row + '[data-id="' + seedId + '"]');
        if (await rowEl.count() === 0) {
          const totalRows = await page.locator(mod.row).count();
          fail(mod.label + ' — seeded row in list', '[data-id="' + seedId + '"] not found (total=' + totalRows + ')');
          continue;
        }
        // Click the View button inside the row (more reliable than clicking tr directly)
        const viewBtn = rowEl.locator('button.btn-sm').first();
        if (await viewBtn.count() > 0) await viewBtn.click();
        else await rowEl.click(); // fallback: click tr (works when onclick is on a td)
        await page.waitForSelector('#modal-bg.open', { timeout: 8000 });
        pass(mod.label + ' — modal opens');
        const pdfErr = await page.$('.pdf-error');
        if (!pdfErr) pass(mod.label + ' — no pdf-error');
        else         fail(mod.label + ' — no pdf-error', await pdfErr.textContent());
        const bodyTxt = await page.locator('#modal-body').textContent();
        if (bodyTxt && bodyTxt.trim().length > 20) pass(mod.label + ' — modal body has content');
        else fail(mod.label + ' — modal body has content', '"' + (bodyTxt || '').substring(0, 50) + '"');
        try { await page.click('.modal-close', { timeout: 3000 }); } catch { /* ignore */ }
        await page.waitForSelector('#modal-bg.open', { state: 'hidden', timeout: 5000 });
        await page.waitForTimeout(300);
      } catch (e) {
        fail(mod.label + ' — modal view', e);
        try { await page.click('.modal-close', { timeout: 2000 }); } catch { /* ignore */ }
        try { await page.waitForSelector('#modal-bg.open', { state: 'hidden', timeout: 3000 }); } catch { /* ignore */ }
        await page.waitForTimeout(300);
      }
    }
  } catch (e) {
    fail('module view suite crashed', e);
  } finally {
    await logout(page);
    await page.close();
  }
}

// =============================================================================
// SECTION 5 — Attachment Upload / Signed URL / Delete (all modules)
// =============================================================================
async function testAttachmentWorkflow(browser) {
  section('5 — ATTACHMENT UPLOAD → SIGNED URL → DELETE (Playwright, developer)');
  const TODAY = new Date().toISOString().split('T')[0];
  const TS5   = Date.now();

  const MODS = [
    { nav:'sub',   table:'submittals',        row:'.sub-row',    recordType:'submittal',      label:'Submittals',
      seed:{ ref_no:'ATT-SUB-'+TS5, title:'ATT Sub', discipline:'Architecture', status:'Pending Review', submit_date:TODAY, from_party:'Contractor', to_party:'Consultant' } },
    { nav:'ir',    table:'inspections',       row:'.ir-row',     recordType:'inspection',     label:'Inspections',
      seed:{ ref_no:'ATT-IR-'+TS5, location:'L1', elements:'Concrete', status:'Pending', request_date:TODAY } },
    { nav:'ncr',   table:'ncrs',              row:'.ncr-row',    recordType:'ncr',            label:'NCRs',
      seed:{ ref_no:'ATT-NCR-'+TS5, title:'ATT NCR', status:'Open', severity:'Minor' } },
    { nav:'rfi',   table:'rfis',              row:'.rfi-row',    recordType:'rfi',            label:'RFIs',
      seed:{ ref_no:'ATT-RFI-'+TS5, subject:'ATT RFI', status:'Open', from_party:'Contractor', to_party:'Consultant', priority:'Normal' } },
    { nav:'corr',  table:'correspondence',    row:'.corr-row',   recordType:'correspondence', label:'Correspondence',
      seed:{ ref_no:'ATT-COR-'+TS5, subject:'ATT Cor', type:'Letter', status:'Open', correspondence_date:TODAY, from_party:'Consultant', to_party:'Contractor' } },
    { nav:'punch', table:'punch_list',        row:'.punch-row',  recordType:'punch',          label:'Punch List',
      seed:{ description:'ATT Punch', location:'L1', status:'Open', severity:'Minor' } },
    { nav:'ms',    table:'method_statements', row:'.ms-row',     recordType:'ms',             label:'Method Statements',
      seed:{ ref_no:'ATT-MS-'+TS5, title:'ATT MS', activity:'Concrete', status:'Pending Review', submitted_date:TODAY } },
  ];

  // Seed all records via service-role API
  const seeds = {};
  for (const mod of MODS) {
    const r = await api('POST', '/rest/v1/' + mod.table, mod.seed);
    if (r.ok && r.data?.[0]?.id) {
      seeds[mod.table] = r.data[0].id;
      track(mod.table, r.data[0].id);
    } else {
      console.warn('  WARNING seed ' + mod.table + ': ' + JSON.stringify(r.data).substring(0, 80));
    }
  }

  const fakePdf = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj ' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj ' +
    '3 0 obj<</Type/Page/MediaBox[0 0 612 792]>>endobj\n' +
    'xref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n' +
    'trailer<</Size 4/Root 1 0 R>>\nstartxref\n%%EOF'
  );

  const page = await browser.newPage();
  try {
    await loginAs(page, 'developer');
    try { await page.waitForLoadState('networkidle', { timeout: 10000 }); } catch { /* ignore */ }

    for (const mod of MODS) {
      const recordId = seeds[mod.table];
      if (!recordId) { skip(mod.label + ' — attachment workflow', 'seed failed'); continue; }

      try {
        await navTo(page, mod.nav);
        try { await page.waitForSelector(mod.row, { timeout: 6000 }); } catch { /* ignore */ }

        const rowEl = page.locator(mod.row + '[data-id="' + recordId + '"]');
        if (await rowEl.count() === 0) {
          skip(mod.label + ' — attachment workflow', 'seeded row not found');
          continue;
        }

        // Open detail modal
        const viewBtn = rowEl.locator('button.btn-sm').first();
        if (await viewBtn.count() > 0) await viewBtn.click();
        else await rowEl.click();
        await page.waitForSelector('#modal-bg.open', { timeout: 8000 });

        // Confirm attachment upload input exists
        const uploadInput = page.locator('#att-upload-' + recordId);
        if (await uploadInput.count() === 0) {
          fail(mod.label + ' — attachment upload input present', '#att-upload-' + recordId + ' not found');
          try { await page.click('.modal-close', { timeout: 2000 }); } catch { /* ignore */ }
          try { await page.waitForSelector('#modal-bg.open', { state: 'hidden', timeout: 3000 }); } catch { /* ignore */ }
          continue;
        }
        pass(mod.label + ' — attachment upload input present');

        // Trigger upload via fake PDF buffer
        await uploadInput.setInputFiles({ name: 'test-att.pdf', mimeType: 'application/pdf', buffer: fakePdf });

        // Wait for Remove button — confirms storage upload + DB insert + refreshAttList completed
        let removeBtn;
        try {
          await page.waitForSelector('#att-list-' + recordId + ' button[onclick*="deleteAttachment"]', { timeout: 20000 });
          removeBtn = page.locator('#att-list-' + recordId + ' button[onclick*="deleteAttachment"]').first();
          pass(mod.label + ' — attachment uploaded (Remove button appeared)');
        } catch {
          fail(mod.label + ' — attachment uploaded', 'Remove button did not appear after 20s');
          try { await page.click('.modal-close', { timeout: 2000 }); } catch { /* ignore */ }
          try { await page.waitForSelector('#modal-bg.open', { state: 'hidden', timeout: 3000 }); } catch { /* ignore */ }
          continue;
        }

        // Extract file_path from onclick: deleteAttachment('attId','file/path','type','recordId')
        const onclickAttr = await removeBtn.getAttribute('onclick') || '';
        const pathMatch   = onclickAttr.match(/deleteAttachment\('[^']+','([^']+)'/);
        const filePath    = pathMatch ? pathMatch[1] : null;

        if (filePath) {
          const signCheck = await verifySignedUrl('attachments', filePath);
          if (signCheck.ok) pass(mod.label + ' — signed URL accessible (HTTP ' + signCheck.status + ')');
          else              fail(mod.label + ' — signed URL accessible', 'HTTP ' + signCheck.status + (signCheck.detail ? ' — ' + signCheck.detail : ''));
          trackSt('attachments', filePath);  // track for cleanup if delete test fails
        } else {
          fail(mod.label + ' — extract file_path from onclick', 'onclick="' + onclickAttr.substring(0, 100) + '"');
        }

        // Click Remove → confirmModal replaces body → click #confirm-yes
        await removeBtn.click();
        await page.waitForSelector('#confirm-yes', { timeout: 5000 });
        await page.click('#confirm-yes');

        // toast('Attachment removed', 'info') appears after delete
        // Use waitForFunction to avoid catching the still-visible upload success toast
        try {
          await page.waitForFunction(
            () => [...document.querySelectorAll('.toast')].some(el => el.textContent.toLowerCase().includes('attachment removed')),
            { timeout: 12000 }
          );
          pass(mod.label + ' — attachment deleted (toast confirmed)');
        } catch {
          const toastTxt = await page.locator('.toast').first().textContent().catch(() => '');
          fail(mod.label + ' — attachment deleted', 'no "Attachment removed" toast — visible: "' + toastTxt.substring(0, 60) + '"');
        }

        // confirmModal replaced body; close modal
        try { await page.click('.modal-close', { timeout: 3000 }); } catch { /* ignore */ }
        try { await page.waitForSelector('#modal-bg.open', { state: 'hidden', timeout: 5000 }); } catch { /* ignore */ }
        await page.waitForTimeout(300);

      } catch (e) {
        fail(mod.label + ' — attachment workflow', e);
        try { await page.click('.modal-close', { timeout: 2000 }); } catch { /* ignore */ }
        try { await page.waitForSelector('#modal-bg.open', { state: 'hidden', timeout: 3000 }); } catch { /* ignore */ }
        await page.waitForTimeout(300);
      }
    }
  } catch (e) {
    fail('attachment workflow suite crashed', e);
  } finally {
    await logout(page);
    await page.close();
  }
}

// =============================================================================
// Cleanup
// =============================================================================
async function doCleanup() {
  console.log('\n-- Cleanup --');
  for (const [key, paths] of Object.entries(toDelete)) {
    if (!key.startsWith('__storage__')) continue;
    const bucket = key.replace('__storage__', '');
    const res = await fetch(SUPABASE_URL + '/storage/v1/object/' + bucket, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + SERVICE_KEY, apikey: SERVICE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: paths }),
    });
    if (!res.ok) console.warn('  cleanup storage ' + bucket + ':', await res.text());
    else console.log('  deleted ' + paths.length + ' file(s) from ' + bucket);
  }
  const ORDER = ['drawing_revisions','drawings','submittals','inspections','ncrs','rfis','transmittals','correspondence','punch_list','method_statements'];
  for (const table of ORDER) {
    const ids = toDelete[table];
    if (!ids || !ids.length) continue;
    const r = await api('DELETE', '/rest/v1/' + table + '?id=in.(' + ids.join(',') + ')', undefined);
    if (!r.ok) console.warn('  cleanup ' + table + ':', r.data);
    else console.log('  deleted ' + ids.length + ' row(s) from ' + table);
  }
}

// =============================================================================
// Main
// =============================================================================
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    await testFilepathIntegrity();
    await testDrawingUploadView(browser);
    await testDeletePermissions(browser);
    await testModuleView(browser);
    await testAttachmentWorkflow(browser);
  } finally {
    await browser.close();
    await doCleanup();
  }

  const p = results.filter(r => r.status === 'PASS').length;
  const f = results.filter(r => r.status === 'FAIL').length;
  const s = results.filter(r => r.status === 'SKIP').length;
  console.log('\n' + '='.repeat(68));
  console.log('  RESULTS: ' + p + ' PASS  ' + f + ' FAIL  ' + s + ' SKIP  (' + results.length + ' total)');
  if (f > 0) {
    console.log('\n  FAILURES:');
    results.filter(r => r.status === 'FAIL').forEach(r => console.error('    x  ' + r.name + '\n       ' + r.info));
  }
  console.log('='.repeat(68));
  process.exit(f > 0 ? 1 : 0);
})();
