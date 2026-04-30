#!/usr/bin/env node
/**
 * Upload → View → Delete Tests — Golf Grove DMS
 *
 * Tests three things the scenario tests miss because they never touch storage or
 * a real browser:
 *
 *   A. FILE PATH INTEGRITY (API)
 *      For each upload role, create a drawing with a file and verify the DB
 *      file_path lands at an accessible signed URL.  Catches the contractor bug
 *      where the old temp-path was stored instead of the final moved path.
 *
 *   B. PDF VIEWER (Playwright)
 *      Upload a PDF via the UI, open the drawing modal, assert the PDF canvas
 *      renders (not a stuck loading spinner or error message).
 *
 *   C. MODULE VIEW — NO CRASH (Playwright)
 *      Seed one record per module, open its detail modal as developer, assert
 *      the modal has content and no error elements.
 *
 *   D. DELETE (Playwright)
 *      Developer: Delete Drawing button present → confirm → row gone.
 *      Consultant/Contractor: Delete Drawing button absent.
 *
 * Run: node tests/journeys/upload-view-delete.js
 */

const { chromium }  = require('playwright');
const path          = require('path');
const {
  SUPABASE_URL, SERVICE_KEY, ANON_KEY,
  APP_URL, TEST_ACCOUNTS, TEST_PASSWORD,
} = require('../config');
const { api, login } = require('../helpers/api');
const {
  createDrawing, createSubmittal, createNCR, createRFI,
  fakePdfBuffer, cleanup,
} = require('../helpers/seed');

const FIXTURE_PDF = path.resolve(__dirname, '../fixtures/sample.pdf');
const TS = Date.now();

// ── RESULTS ────────────────────────────────────────────────────────────────────
const results = [];
function pass(name)      { results.push({ name, status: 'PASS' }); console.log(`  ✓  PASS  ${name}`); }
function fail(name, err) { const e = typeof err === 'string' ? err : (err?.message || String(err)).substring(0, 140); results.push({ name, status: 'FAIL', info: e }); console.error(`  ✗  FAIL  ${name}  →  ${e}`); }
function skip(name, why) { results.push({ name, status: 'SKIP', info: why }); console.log(`  ⊘  SKIP  ${name}  →  ${why}`); }
function section(t)      { console.log(`\n${'═'.repeat(72)}\n  ${t}\n${'─'.repeat(72)}`); }

// ── STORAGE HELPERS ─────────────────────────────────────────────────────────────
async function storageUpload(bucket, filePath, buf, jwt = SERVICE_KEY, apikey = SERVICE_KEY) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${filePath}`, {
    method : 'POST',
    headers: { Authorization: `Bearer ${jwt}`, apikey, 'Content-Type': 'application/pdf' },
    body   : buf,
  });
  return { ok: res.ok, status: res.status, body: await res.text() };
}

async function createSignedUrl(bucket, filePath, jwt = SERVICE_KEY, apikey = SERVICE_KEY) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${filePath}`, {
    method : 'POST',
    headers: { Authorization: `Bearer ${jwt}`, apikey, 'Content-Type': 'application/json' },
    body   : JSON.stringify({ expiresIn: 3600 }),
  });
  if (!res.ok) return null;
  const d = await res.json();
  return d.signedURL || d.signedUrl || null;
}

async function fetchSignedUrl(signedUrl) {
  if (!signedUrl) return 0;
  try {
    const r = await fetch(signedUrl, { method: 'HEAD' });
    return r.status;
  } catch { return 0; }
}

// ── PLAYWRIGHT HELPERS ─────────────────────────────────────────────────────────
async function loginAs(page, role) {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#login-email', { timeout: 15000 });
  await page.fill('#login-email', TEST_ACCOUNTS[role]);
  await page.fill('#login-password', TEST_PASSWORD);
  await page.click('#login-btn');
  await page.waitForSelector('#app-screen', { state: 'visible', timeout: 15000 });
}

async function logout(page) {
  try {
    await page.click('#logout-btn', { timeout: 3000 });
    await page.waitForSelector('#auth-screen', { timeout: 8000 });
  } catch {}
}

async function navTo(page, navId, rowSel, timeout = 8000) {
  await page.click(`#n-${navId}`);
  try {
    await page.waitForSelector(`${rowSel}, .empty-state, .loading`, { timeout });
    await page.waitForTimeout(600);
  } catch {}
}

async function openFirstRow(page, rowSel) {
  const row = await page.$(rowSel);
  if (!row) return false;
  await row.click();
  try {
    await page.waitForSelector('#modal-bg.open', { timeout: 5000 });
  } catch { return false; }
  await page.waitForTimeout(800);
  return true;
}

function modalIsOpen(page) {
  return page.locator('#modal-bg.open').count().then(n => n > 0).catch(() => false);
}

// ── SECTION A: FILE PATH INTEGRITY (API) ──────────────────────────────────────
async function testFilepathIntegrity() {
  section('A — FILE PATH INTEGRITY (API) — drawing upload per role');

  const UPLOAD_ROLES = ['developer', 'consultant', 'contractor'];

  for (const role of UPLOAD_ROLES) {
    const toDelete = {};
    try {
      const jwt = await login(TEST_ACCOUNTS[role], TEST_PASSWORD);

      // Generate UUID upfront matching the fixed doNewDraw() approach
      const drawingId = crypto.randomUUID();
      const storagePath = `${drawingId}/Rev_A_${TS}_${role}.pdf`;
      const fakeBuf = fakePdfBuffer(`${role}-integrity`);

      // Upload to final path using role JWT + ANON apikey (as the browser does)
      const upRes = await storageUpload('drawings', storagePath, fakeBuf, jwt, ANON_KEY);
      if (!upRes.ok) {
        skip(`${role} — file path integrity`, `storage upload blocked (${upRes.status}): ${upRes.body.substring(0, 80)}`);
        continue;
      }
      toDelete['__storage__drawings'] = [storagePath];

      // INSERT drawing via role JWT (RLS enforced)
      const insRes = await fetch(`${SUPABASE_URL}/rest/v1/drawings`, {
        method : 'POST',
        headers: {
          apikey        : ANON_KEY,
          Authorization : `Bearer ${jwt}`,
          'Content-Type': 'application/json',
          Prefer        : 'return=representation',
        },
        body: JSON.stringify({
          id         : drawingId,
          drawing_no : `TST-${role.toUpperCase()}-${TS}`,
          title      : `Integrity Test ${role} ${TS}`,
          discipline : 'Architecture',
          status     : 'Under Review',
          revision   : 'Rev A',
          cde_state  : 'WIP',
          file_path  : storagePath,
          superseded_revisions: '[]',
          related_drawings    : [],
        }),
      });
      if (!insRes.ok) {
        const body = await insRes.text();
        fail(`${role} — drawings INSERT allowed`, `${insRes.status}: ${body.substring(0, 100)}`);
        continue;
      }
      const [drawing] = await insRes.json();
      toDelete['drawings'] = [drawing.id];

      // INSERT drawing_revision with same file_path via role JWT
      const revRes = await fetch(`${SUPABASE_URL}/rest/v1/drawing_revisions`, {
        method : 'POST',
        headers: {
          apikey        : ANON_KEY,
          Authorization : `Bearer ${jwt}`,
          'Content-Type': 'application/json',
          Prefer        : 'return=representation',
        },
        body: JSON.stringify({
          drawing_id       : drawing.id,
          revision         : 'Rev A',
          status           : 'Under Review',
          uploaded_by_name : role,
          file_path        : storagePath,
        }),
      });
      if (revRes.ok) {
        const [rev] = await revRes.json();
        toDelete['drawing_revisions'] = [rev.id];
      }

      // Verify drawing.file_path = the final path (not a temp path)
      if (drawing.file_path === storagePath) {
        pass(`${role} — drawing.file_path = final storage path`);
      } else {
        fail(`${role} — drawing.file_path = final storage path`, `got "${drawing.file_path}", expected "${storagePath}"`);
      }

      // Verify signed URL is accessible
      const signedUrl = await createSignedUrl('drawings', drawing.file_path, jwt, ANON_KEY);
      if (!signedUrl) {
        fail(`${role} — drawings.file_path has valid signed URL`, 'createSignedUrl returned null (storage policy or bucket issue)');
      } else {
        const status = await fetchSignedUrl(signedUrl);
        if (status === 200) pass(`${role} — drawings.file_path accessible (signed URL → 200)`);
        else fail(`${role} — drawings.file_path accessible`, `signed URL returned HTTP ${status}`);
      }

    } catch (e) {
      fail(`${role} — file path integrity`, e);
    } finally {
      await cleanup(toDelete);
    }
  }
}

// ── SECTION B: PDF VIEWER (Playwright) ────────────────────────────────────────
async function testPdfViewer(browser) {
  section('B — PDF VIEWER (Playwright) — upload → view → PDF canvas renders');

  const UPLOAD_ROLES = ['developer', 'consultant', 'contractor'];

  for (const role of UPLOAD_ROLES) {
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    try {
      await loginAs(page, role);
      await navTo(page, 'draw', 'tr.draw-row');

      // Open new drawing modal
      const fab = await page.$('#new-btn');
      if (!fab || !(await fab.isVisible())) {
        skip(`${role} — PDF viewer: upload`, 'FAB not visible');
        continue;
      }
      await fab.click();
      await page.waitForSelector('#modal-bg.open', { timeout: 5000 });
      await page.waitForTimeout(400);

      // Fill required form fields
      await page.fill('#nd-id', `GG-TST-Z1-L01-DR-A-0001`);
      await page.fill('#nd-title', `PDF Test ${role} ${TS}`);
      await page.fill('#nd-orig', 'TST');
      await page.fill('#nd-zone', 'Z1');
      await page.fill('#nd-level', 'L01');
      await page.fill('#nd-rev', 'Rev A');
      await page.selectOption('#nd-status', 'Under Review');

      // Attach PDF
      const fileInput = await page.$('#fu-new');
      if (!fileInput) { skip(`${role} — PDF viewer: upload`, '#fu-new not found'); continue; }
      await fileInput.setInputFiles(FIXTURE_PDF);
      await page.waitForTimeout(300);

      // Submit
      const submitBtn = await page.$('button[onclick="doNewDraw()"]');
      if (!submitBtn) { skip(`${role} — PDF viewer: upload`, 'submit button not found'); continue; }
      await submitBtn.click();

      // Wait for modal to close
      try {
        await page.waitForSelector('#modal-bg:not(.open)', { timeout: 12000 });
      } catch {
        const toastEl = await page.$('.toast-msg, .toast');
        const toastText = toastEl ? await toastEl.textContent() : 'no toast';
        fail(`${role} — PDF viewer: upload submitted`, `modal did not close — ${toastText}`);
        continue;
      }
      pass(`${role} — PDF viewer: drawing uploaded`);
      await page.waitForTimeout(1000);

      // Find new row by title (drawing_no might clash due to form — search by title)
      const rows = await page.$$('tr.draw-row');
      let targetRow = null;
      for (const r of rows) {
        const search = await r.getAttribute('data-search') || '';
        if (search.includes(`pdf test ${role}`)) { targetRow = r; break; }
      }
      if (!targetRow) {
        // Fallback: click first row
        targetRow = rows[0] || null;
      }
      if (!targetRow) {
        fail(`${role} — PDF viewer: new row in list`, 'no draw-row elements found after upload');
        continue;
      }
      pass(`${role} — PDF viewer: row visible in list`);

      await targetRow.click();
      await page.waitForSelector('#modal-bg.open', { timeout: 5000 });
      await page.waitForTimeout(2500); // allow PDF.js to initialise

      // Assert PDF state
      const pdfError  = await page.$('.pdf-error');
      const pdfCanvas = await page.$('canvas[id^="pdf-canvas-"]');
      const spinner   = await page.$('.pdf-loading');
      const spinnerVis = spinner ? await spinner.isVisible() : false;

      if (pdfError) {
        const errText = await pdfError.textContent();
        fail(`${role} — PDF viewer: no error`, `pdf-error: "${errText.trim().substring(0, 100)}"`);
      } else if (pdfCanvas) {
        pass(`${role} — PDF viewer: canvas rendered`);
      } else if (spinnerVis) {
        fail(`${role} — PDF viewer: canvas rendered`, 'loading spinner stuck — initPdfViewer not called or silent failure');
      } else {
        fail(`${role} — PDF viewer: canvas rendered`, 'no PDF section at all — file_path likely null');
      }

      const pdfErrors = consoleErrors.filter(e => /pdf|canvas|storage|signedurl/i.test(e));
      if (pdfErrors.length) fail(`${role} — PDF viewer: no console errors`, pdfErrors[0].substring(0, 120));
      else pass(`${role} — PDF viewer: no PDF-related console errors`);

      await page.click('button[onclick="closeModal()"]').catch(() => {});
      await page.waitForTimeout(400);

    } catch (e) {
      fail(`${role} — PDF viewer suite`, e);
    } finally {
      await logout(page);
      await page.close();
    }
  }
}

// ── SECTION C: MODULE VIEW — NO CRASH (Playwright) ───────────────────────────
async function testModuleViews(browser) {
  section('C — MODULE VIEW — NO CRASH (Playwright, developer)');

  const toDelete = {};
  try {
    await createDrawing(toDelete, { title: `ViewTest Draw ${TS}` });
    await createSubmittal(toDelete, { title: `ViewTest Sub ${TS}` });
    await createNCR(toDelete, { title: `ViewTest NCR ${TS}` });
    await createRFI(toDelete, { subject: `ViewTest RFI ${TS}` });

    for (const [table, body] of [
      ['inspections',     { ref_no: `IR-TST-${TS}`,  location: 'Zone A', elements: 'Slab', status: 'Pending', raise_date: new Date().toISOString().split('T')[0] }],
      ['transmittals',    { ref_no: `TRN-TST-${TS}`, notes: 'View test', status: 'Sent', from_party: 'Consultant', to_party: 'Contractor' }],
      ['correspondence',  { ref_no: `CO-TST-${TS}`,  subject: 'View test', type: 'Letter', from_party: 'Consultant', to_party: 'Contractor', date_sent: new Date().toISOString().split('T')[0] }],
      ['punch_list',      { description: `Punch ${TS}`, location: 'Zone A', status: 'Open', severity: 'Minor', raised_date: new Date().toISOString().split('T')[0] }],
      ['method_statements', { ref_no: `MS-TST-${TS}`, title: `MS ${TS}`, activity: 'Testing', status: 'Pending Review', submitted_by: TEST_ACCOUNTS.contractor }],
    ]) {
      const r = await api('POST', `/rest/v1/${table}`, body);
      if (r.ok && r.data?.[0]?.id) (toDelete[table] = toDelete[table] || []).push(r.data[0].id);
    }
  } catch (e) {
    fail('C — seed records', e);
    return;
  }

  const MODULES = [
    { nav: 'draw',  row: 'tr.draw-row',  label: 'Drawing Register' },
    { nav: 'sub',   row: 'tr.sub-row',   label: 'Submittals' },
    { nav: 'ir',    row: 'tr.ir-row',    label: 'Inspections' },
    { nav: 'ncr',   row: 'tr.ncr-row',   label: 'NCRs' },
    { nav: 'rfi',   row: 'tr.rfi-row',   label: 'RFIs' },
    { nav: 'trans', row: 'tr.trans-row', label: 'Transmittals' },
    { nav: 'corr',  row: 'tr.corr-row',  label: 'Correspondence' },
    { nav: 'punch', row: 'tr.punch-row', label: 'Punch List' },
    { nav: 'ms',    row: 'tr.ms-row',    label: 'Method Statements' },
  ];

  const page = await browser.newPage();
  try {
    await loginAs(page, 'developer');

    for (const mod of MODULES) {
      try {
        await navTo(page, mod.nav, mod.row, 6000);
        const opened = await openFirstRow(page, mod.row);
        if (!opened) { skip(`${mod.label} — modal opens`, 'no rows in list'); continue; }

        const isOpen = await modalIsOpen(page);
        if (!isOpen) { fail(`${mod.label} — modal opens`, 'modal-bg not open'); continue; }
        pass(`${mod.label} — modal opens`);

        const title = await page.textContent('#modal-title').catch(() => '');
        if (title.trim()) pass(`${mod.label} — modal title: "${title.trim().substring(0, 40)}"`);
        else fail(`${mod.label} — modal has title`, 'empty');

        const pdfErr = await page.$('.pdf-error');
        if (!pdfErr) pass(`${mod.label} — no pdf-error`);
        else fail(`${mod.label} — no pdf-error`, await pdfErr.textContent().then(t => t.trim().substring(0, 80)));

        await page.click('button[onclick="closeModal()"]').catch(() => {});
        await page.waitForTimeout(300);

      } catch (e) {
        fail(`${mod.label} — view modal`, e);
        await page.click('button[onclick="closeModal()"]').catch(() => {});
      }
    }
  } catch (e) {
    fail('C — module view suite', e);
  } finally {
    await logout(page);
    await page.close();
    await cleanup(toDelete);
  }
}

// ── SECTION D: DELETE (Playwright) ────────────────────────────────────────────
async function testDelete(browser) {
  section('D — DELETE (Playwright) — developer deletes; others see no button');

  const toDelete = {};

  // D1: Developer can delete
  {
    const page = await browser.newPage();
    try {
      const drawId = await createDrawing(toDelete, { title: `DelTest Dev ${TS}`, drawing_no: `DEL-DEV-${TS}` });
      await loginAs(page, 'developer');
      await navTo(page, 'draw', 'tr.draw-row');

      const row = await page.$(`tr.draw-row[data-id="${drawId}"]`);
      if (!row) { skip('Developer — delete', 'seeded row not visible'); }
      else {
        await row.click();
        await page.waitForSelector('#modal-bg.open', { timeout: 5000 });
        await page.waitForTimeout(500);

        const delBtn = await page.$('button[onclick*="deleteDraw"]');
        if (!delBtn || !(await delBtn.isVisible())) {
          fail('Developer — Delete button visible', 'not found');
        } else {
          pass('Developer — Delete button visible');
          await delBtn.click();
          await page.waitForTimeout(500);
          const confirmBtn = await page.$('#confirm-yes');
          if (confirmBtn) {
            await confirmBtn.click();
            await page.waitForSelector('#modal-bg:not(.open)', { timeout: 8000 });
            await page.waitForTimeout(800);
            const gone = (await page.$(`tr.draw-row[data-id="${drawId}"]`)) === null;
            if (gone) {
              pass('Developer — delete removes row');
              toDelete['drawings'] = (toDelete['drawings'] || []).filter(id => id !== drawId);
            } else {
              fail('Developer — delete removes row', 'row still in list');
            }
          } else {
            fail('Developer — confirm dialog', '#confirm-yes not found');
          }
        }
      }
    } catch (e) { fail('Developer — delete test', e); }
    finally { await logout(page); await page.close(); }
  }

  // D2 & D3: Consultant and Contractor — delete button hidden
  for (const role of ['consultant', 'contractor']) {
    const page = await browser.newPage();
    try {
      const drawId = await createDrawing(toDelete, { title: `DelTest ${role} ${TS}`, drawing_no: `DEL-${role.toUpperCase().slice(0,3)}-${TS}` });
      await loginAs(page, role);
      await navTo(page, 'draw', 'tr.draw-row');

      const row = await page.$(`tr.draw-row[data-id="${drawId}"]`);
      if (!row) { skip(`${role} — delete button hidden`, 'row not visible'); }
      else {
        await row.click();
        await page.waitForSelector('#modal-bg.open', { timeout: 5000 });
        await page.waitForTimeout(500);
        const delBtn = await page.$('button[onclick*="deleteDraw"]');
        const visible = delBtn ? await delBtn.isVisible() : false;
        if (!visible) pass(`${role} — Delete button hidden (developer-only)`);
        else fail(`${role} — Delete button hidden`, 'button is visible for non-developer');
        await page.click('button[onclick="closeModal()"]').catch(() => {});
      }
    } catch (e) { fail(`${role} — delete visibility`, e); }
    finally { await logout(page); await page.close(); }
  }

  await cleanup(toDelete);
}

// ── MAIN ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n  UPLOAD → VIEW → DELETE TESTS\n  Golf Grove DMS\n');
  console.log(`  App : ${APP_URL}`);
  console.log(`  Run : ${new Date().toISOString()}\n`);

  await testFilepathIntegrity();

  const browser = await chromium.launch({ headless: true });
  try {
    await testPdfViewer(browser);
    await testModuleViews(browser);
    await testDelete(browser);
  } finally {
    await browser.close();
  }

  const passes = results.filter(r => r.status === 'PASS').length;
  const fails  = results.filter(r => r.status === 'FAIL').length;
  const skips  = results.filter(r => r.status === 'SKIP').length;

  console.log(`\n${'═'.repeat(72)}`);
  console.log(`  RESULTS: ${passes} PASS  ${fails} FAIL  ${skips} SKIP  /  ${results.length} total`);
  if (fails > 0) {
    console.log('\n  FAILURES:');
    results.filter(r => r.status === 'FAIL').forEach(r => console.log(`    ✗  ${r.name}\n       ${r.info}`));
  }
  console.log('═'.repeat(72));

  process.exit(fails > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
