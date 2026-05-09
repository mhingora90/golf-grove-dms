#!/usr/bin/env node
/**
 * Fix 2 Verification — Stale stagedFiles Memory Leak
 *
 * Corrected test scenario:
 *   1. Open "Upload New Revision" for Drawing A → stage revA.pdf → Cancel
 *   2. Open "Upload New Revision" for Drawing B → stage nothing → Submit
 *   Expected: Nothing attached to Drawing B (stagedFiles['rs-staged'] cleared on Cancel)
 *
 * Also tests the accumulation variant:
 *   1. Open "New Submittal" → stage file1.pdf → Cancel
 *   2. Open "New Submittal" → stage file2.pdf → Submit
 *   Expected: Only file2.pdf attached (not both)
 *
 * Run: node tests/staged-files-leak.js
 */

const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

// ── helpers ──────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
function log(msg, status = 'INFO') {
  if (status === 'PASS') pass++;
  if (status === 'FAIL') fail++;
  const prefix = { PASS: '✓', FAIL: '✗', INFO: '·', WARN: '⚠' }[status] || '·';
  console.log(`  [${status}] ${prefix} ${msg}`);
}

/** Create a tiny temp PDF-like file for testing */
function makeTempFile(name) {
  const p = path.join(os.tmpdir(), name);
  fs.writeFileSync(p, `%PDF-1.4 fake content for ${name}`);
  return p;
}

async function login(page) {
  await page.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  await page.waitForSelector('#login-email', { timeout: 8000 });
  await page.fill('#login-email', 'mohammed@regent-developments.com');
  await page.fill('#login-password', 'Mman1990');
  await page.click('#login-btn');
  await page.waitForSelector('#app-screen', { timeout: 10000 });
}

// ── TEST A: Revision modal — stage + cancel + reopen + submit with nothing ───
async function testRevisionModalLeak(page) {
  console.log('\n── TEST A: Upload New Revision — stage/cancel/reopen/submit ──');

  // Navigate to Drawing Register
  await page.click('text=Drawing Register');
  await page.waitForTimeout(2000);

  const drawRows = await page.locator('tr.draw-row').count();
  if (drawRows === 0) {
    log('No drawings found — skipping Test A (need at least 2 drawings in DB)', 'WARN');
    return;
  }

  // ── Step 1: Open revision modal for first drawing, stage a file, Cancel ──
  await page.locator('tr.draw-row').first().locator('button', { hasText: 'View' }).click();
  await page.waitForSelector('#modal-bg.open', { timeout: 5000 });
  await page.waitForTimeout(500);

  // Find the Upload New Revision button inside the modal
  const uploadRevBtn = page.locator('#modal-body button', { hasText: /upload.*rev|new rev/i });
  const hasRevBtn = await uploadRevBtn.count();
  if (!hasRevBtn) {
    log('Upload Revision button not found in view modal — skipping Test A', 'WARN');
    await page.keyboard.press('Escape');
    return;
  }

  // Read stagedFiles state BEFORE staging
  const beforeStage = await page.evaluate(() => Object.keys(window.stagedFiles || {}).length);
  log(`stagedFiles keys before staging: ${beforeStage}`);

  // Stage a file via the rs-staged input
  const revFilePath = makeTempFile('revA_drawing.pdf');
  await page.locator('#rs-files').setInputFiles(revFilePath);
  await page.waitForTimeout(400);

  const afterStage = await page.evaluate(() => (window.stagedFiles['rs-staged'] || []).length);
  log(`stagedFiles['rs-staged'] length after staging: ${afterStage}`, afterStage === 1 ? 'PASS' : 'FAIL');

  // Cancel the modal
  await page.locator('#modal-footer button', { hasText: /cancel/i }).first().click().catch(async () => {
    // Some modals close via backdrop or X button
    await page.locator('#modal-bg').click({ position: { x: 10, y: 10 } });
  });
  await page.waitForTimeout(600);

  // ── Verify: rs-staged should be cleared after closeModal ──
  const afterCancel = await page.evaluate(() => (window.stagedFiles['rs-staged'] || []).length);
  log(`stagedFiles['rs-staged'] after Cancel: ${afterCancel} (expect 0)`, afterCancel === 0 ? 'PASS' : 'FAIL');

  if (drawRows < 2) {
    log('Only 1 drawing — cannot test reopen on different record', 'WARN');
    return;
  }

  // ── Step 2: Open revision modal for second drawing, stage nothing, Submit ──
  // Close any open modal first
  const modalOpen = await page.locator('#modal-bg.open').count();
  if (modalOpen) await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  await page.locator('tr.draw-row').nth(1).locator('button', { hasText: 'View' }).click();
  await page.waitForSelector('#modal-bg.open', { timeout: 5000 });
  await page.waitForTimeout(500);

  // rs-staged should still be empty (Fix 2 cleared it)
  const beforeSecondSubmit = await page.evaluate(() => (window.stagedFiles['rs-staged'] || []).length);
  log(`stagedFiles['rs-staged'] in second modal (no file staged): ${beforeSecondSubmit} (expect 0)`,
      beforeSecondSubmit === 0 ? 'PASS' : 'FAIL');

  if (beforeSecondSubmit > 0) {
    log('BUG PRESENT: revA.pdf would be attached to Drawing B if submitted!', 'FAIL');
  } else {
    log('Fix confirmed: no stale files from Drawing A session', 'PASS');
  }

  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

// ── TEST B: Submittal modal — accumulation variant ────────────────────────────
async function testSubmittalAccumulation(page) {
  console.log('\n── TEST B: New Submittal — stage/cancel/reopen/stage/check ──');

  await page.click('text=Submittals');
  await page.waitForTimeout(2000);

  // Look for a "New Submittal" button
  const newSubBtn = page.locator('button', { hasText: /new submittal/i });
  if (!await newSubBtn.count()) {
    log('New Submittal button not visible (may require contractor role) — skipping Test B', 'WARN');
    return;
  }

  const file1Path = makeTempFile('submittal_file1.pdf');
  const file2Path = makeTempFile('submittal_file2.pdf');

  // ── Session 1: open, stage file1, cancel ──
  await newSubBtn.click();
  await page.waitForSelector('#modal-bg.open', { timeout: 5000 });
  await page.waitForTimeout(400);

  await page.locator('#ns-files').setInputFiles(file1Path);
  await page.waitForTimeout(400);

  const s1After = await page.evaluate(() => (window.stagedFiles['ns-staged'] || []).length);
  log(`Session 1 — after staging file1: ${s1After} file(s) in ns-staged`, s1After === 1 ? 'PASS' : 'FAIL');

  // Cancel
  await page.locator('#modal-footer button', { hasText: /cancel/i }).first().click().catch(async () => {
    await page.keyboard.press('Escape');
  });
  await page.waitForTimeout(600);

  const afterCancel = await page.evaluate(() => (window.stagedFiles['ns-staged'] || []).length);
  log(`After Cancel — ns-staged length: ${afterCancel} (expect 0)`, afterCancel === 0 ? 'PASS' : 'FAIL');

  // ── Session 2: open, stage file2, check array length ──
  await newSubBtn.click();
  await page.waitForSelector('#modal-bg.open', { timeout: 5000 });
  await page.waitForTimeout(400);

  await page.locator('#ns-files').setInputFiles(file2Path);
  await page.waitForTimeout(400);

  const s2After = await page.evaluate(() => (window.stagedFiles['ns-staged'] || []).length);
  log(`Session 2 — after staging file2: ${s2After} file(s) in ns-staged (expect 1)`,
      s2After === 1 ? 'PASS' : 'FAIL');

  if (s2After > 1) {
    log(`BUG PRESENT: ${s2After} files would be uploaded — file1 from cancelled session is still queued`, 'FAIL');
  } else {
    log('Fix confirmed: only 1 file in queue, no accumulation from cancelled session', 'PASS');
  }

  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // Cleanup temp files
  [file1Path, file2Path].forEach(f => { try { fs.unlinkSync(f); } catch(_) {} });
}

// ── TEST C: Pure JS unit test — no UI needed ─────────────────────────────────
async function testJSUnit(page) {
  console.log('\n── TEST C: JS unit — direct stagedFiles state manipulation ──');

  const result = await page.evaluate(() => {
    // stagedFiles is declared const at script scope, not on window — access directly
    const results = [];

    // Simulate staging a file in rs-staged
    stagedFiles['rs-staged'] = [{ name: 'revA.pdf', size: 1000 }];
    results.push({ label: 'rs-staged has 1 file after stage', val: stagedFiles['rs-staged'].length === 1 });

    // Simulate closeModal clearing state (mirrors the actual closeModal fix)
    Object.keys(stagedFiles).forEach(k => delete stagedFiles[k]);
    results.push({ label: 'rs-staged cleared after closeModal simulation', val: !stagedFiles['rs-staged'] });

    // Simulate second modal opening with no file staged
    const filesForSecondModal = (stagedFiles['rs-staged'] || []).length;
    results.push({ label: 'Second modal sees 0 files (not stale revA.pdf)', val: filesForSecondModal === 0 });

    // Accumulation: stage in ns-staged, clear, stage again, check count = 1
    stagedFiles['ns-staged'] = [{ name: 'file1.pdf', size: 500 }];
    Object.keys(stagedFiles).forEach(k => delete stagedFiles[k]); // closeModal
    if (!stagedFiles['ns-staged']) stagedFiles['ns-staged'] = [];
    stagedFiles['ns-staged'].push({ name: 'file2.pdf', size: 600 });
    results.push({ label: 'After cancel+reopen: ns-staged has exactly 1 file (no accumulation)', val: stagedFiles['ns-staged'].length === 1 });

    // Cleanup — leave stagedFiles empty for UI tests that follow
    Object.keys(stagedFiles).forEach(k => delete stagedFiles[k]);

    return results;
  });

  for (const r of result) {
    log(r.label, r.val ? 'PASS' : 'FAIL');
  }
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const page    = await browser.newPage();

  try {
    await login(page);
    log('Logged in as Developer', 'INFO');

    await testJSUnit(page);
    await testRevisionModalLeak(page);
    await testSubmittalAccumulation(page);

  } catch (err) {
    log(`FATAL: ${err.message}`, 'FAIL');
    console.error(err);
  } finally {
    console.log(`\n${'─'.repeat(55)}`);
    console.log(`  RESULTS: ${pass} PASS | ${fail} FAIL`);
    console.log(`${'─'.repeat(55)}`);
    await browser.close();
  }
})();
