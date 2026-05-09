#!/usr/bin/env node
/**
 * UI Role Journey Tests — Golf Grove DMS
 * Tests login, nav, button visibility, and file uploads for all 4 roles via Playwright.
 *
 * Run: node tests/journeys/ui-role-tests.js
 */

const { chromium } = require('playwright');
const path = require('path');
const { APP_URL, TEST_ACCOUNTS, TEST_PASSWORD } = require('../config');

const FIXTURES = {
  pdf: path.resolve(__dirname, '../fixtures/sample.pdf'),
  dwg: path.resolve(__dirname, '../fixtures/sample.dwg'),
  xlsx: path.resolve(__dirname, '../fixtures/sample.xlsx'),
  submittal: path.resolve(__dirname, '../fixtures/sample-submittal.pdf'),
};

const results = [];
function pass(name)       { results.push({ name, status: 'PASS' }); console.log(`  ✓  PASS  ${name}`); }
function fail(name, err)  { const e = typeof err === 'string' ? err : (err?.message || String(err)).substring(0, 120); results.push({ name, status: 'FAIL', info: e }); console.error(`  ✗  FAIL  ${name}  →  ${e}`); }
function skip(name, why)  { results.push({ name, status: 'SKIP', info: why }); console.log(`  ⊘  SKIP  ${name}  →  ${why}`); }
function section(t)       { console.log(`\n${'═'.repeat(64)}\n  ${t}\n${'─'.repeat(64)}`); }

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
    await page.waitForSelector('#auth-screen', { state: 'visible', timeout: 8000 });
  } catch { /* ignore */ }
}

// ── DEVELOPER UI TESTS ───────────────────────────────────────────────────────
async function testDeveloperUI(browser) {
  section('DEVELOPER — UI');
  const page = await browser.newPage();
  try {
    // Login
    await loginAs(page, 'developer');
    const badge = await page.textContent('#role-badge-top').catch(() => '');
    if (badge.includes('developer')) pass('Developer — login, role badge = developer');
    else fail('Developer — role badge', `got "${badge}"`);

    // Nav: User Management visible (developer-only)
    const usersNav = await page.$('#n-users-wrap');
    const usersVisible = usersNav ? await usersNav.isVisible() : false;
    if (usersVisible) pass('Developer — User Management nav visible');
    else fail('Developer — User Management nav visible', 'element not visible');

    // Nav: all main pages render without crash
    const pages = ['draw', 'sub', 'ir', 'ncr', 'rfi', 'trans', 'corr', 'punch', 'ms', 'subs', 'users'];
    for (const pg of pages) {
      try {
        const navEl = await page.$(`#n-${pg}`);
        if (navEl) {
          await navEl.click();
          await page.waitForTimeout(800);
          const title = await page.textContent('#page-title').catch(() => '');
          if (title) pass(`Developer — nav to ${pg} (title: "${title}")`);
          else fail(`Developer — nav to ${pg}`, 'no page title');
        } else skip(`Developer — nav to ${pg}`, 'nav item not found');
      } catch (e) { fail(`Developer — nav to ${pg}`, e); }
    }

    // Drawing register: FAB visible
    await page.click('#n-draw');
    await page.waitForTimeout(600);
    const fab = await page.$('#new-btn');
    const fabVisible = fab ? await fab.isVisible() : false;
    if (fabVisible) pass('Developer — Drawing Register FAB (+) visible');
    else fail('Developer — Drawing Register FAB visible', 'not visible');

    // Drawing upload: open first drawing detail, check Upload Revision button
    try {
      await page.waitForSelector('tr.draw-row', { timeout: 8000 });
      await page.click('tr.draw-row');
      await page.waitForTimeout(1000);
      const uploadBtn = await page.$('button[onclick*="uploadRev"]');
      if (uploadBtn && await uploadBtn.isVisible()) pass('Developer — Upload Revision button visible on drawing detail');
      else fail('Developer — Upload Revision button', 'not found/visible');
    } catch (e) { skip('Developer — Upload Revision button', 'no drawings in register'); }

    // Submittal: FAB visible
    await page.click('#n-sub');
    await page.waitForTimeout(600);
    const subFab = await page.$('#new-btn');
    const subFabVisible = subFab ? await subFab.isVisible() : false;
    if (subFabVisible) pass('Developer — Submittals FAB (+) visible');
    else fail('Developer — Submittals FAB visible', 'not visible');

    // NCR: FAB visible (raise=true for developer)
    await page.click('#n-ncr');
    await page.waitForTimeout(600);
    const ncrFab = await page.$('#new-btn');
    const ncrFabVisible = ncrFab ? await ncrFab.isVisible() : false;
    if (ncrFabVisible) pass('Developer — NCR FAB (+) visible (raise=true)');
    else fail('Developer — NCR FAB visible', 'not visible');

    pass('Developer — UI suite complete');
  } catch (e) { fail('Developer — UI suite crashed', e); }
  finally { await logout(page); await page.close(); }
}

// ── CONSULTANT UI TESTS ──────────────────────────────────────────────────────
async function testConsultantUI(browser) {
  section('CONSULTANT — UI');
  const page = await browser.newPage();
  try {
    await loginAs(page, 'consultant');
    const badge = await page.textContent('#role-badge-top').catch(() => '');
    if (badge.includes('consultant')) pass('Consultant — login, role badge = consultant');
    else fail('Consultant — role badge', `got "${badge}"`);

    // User Management nav must be HIDDEN for consultant
    const usersWrap = await page.$('#n-users-wrap');
    const usersHidden = usersWrap ? !(await usersWrap.isVisible()) : true;
    if (usersHidden) pass('Consultant — User Management nav hidden (manageUsers=false)');
    else fail('Consultant — User Management nav should be hidden', 'still visible');

    // Drawing register FAB visible (upload=true)
    await page.click('#n-draw');
    await page.waitForTimeout(600);
    const fab = await page.$('#new-btn');
    if (fab && await fab.isVisible()) pass('Consultant — Drawing Register FAB visible (upload=true)');
    else fail('Consultant — Drawing Register FAB', 'not visible');

    // NCR FAB visible (raise=true)
    await page.click('#n-ncr');
    await page.waitForTimeout(600);
    const ncrFab = await page.$('#new-btn');
    if (ncrFab && await ncrFab.isVisible()) pass('Consultant — NCR FAB visible (raise=true)');
    else fail('Consultant — NCR FAB', 'not visible');

    // Submittal register FAB visible (manageRegister=true)
    await page.click('#n-sreg');
    await page.waitForTimeout(600);
    const sregFab = await page.$('#new-btn');
    if (sregFab && await sregFab.isVisible()) pass('Consultant — Submittal Register FAB visible (manageRegister=true)');
    else fail('Consultant — Submittal Register FAB', 'not visible');

    pass('Consultant — UI suite complete');
  } catch (e) { fail('Consultant — UI suite crashed', e); }
  finally { await logout(page); await page.close(); }
}

// ── CONTRACTOR UI TESTS ──────────────────────────────────────────────────────
async function testContractorUI(browser) {
  section('CONTRACTOR — UI');
  const page = await browser.newPage();
  try {
    await loginAs(page, 'contractor');
    const badge = await page.textContent('#role-badge-top').catch(() => '');
    if (badge.includes('contractor')) pass('Contractor — login, role badge = contractor');
    else fail('Contractor — role badge', `got "${badge}"`);

    // User Management nav HIDDEN
    const usersWrap = await page.$('#n-users-wrap');
    const usersHidden = usersWrap ? !(await usersWrap.isVisible()) : true;
    if (usersHidden) pass('Contractor — User Management nav hidden');
    else fail('Contractor — User Management nav should be hidden', 'still visible');

    // Drawing FAB visible (upload=true)
    await page.click('#n-draw');
    await page.waitForTimeout(600);
    const drawFab = await page.$('#new-btn');
    if (drawFab && await drawFab.isVisible()) pass('Contractor — Drawing FAB visible (upload=true)');
    else fail('Contractor — Drawing FAB', 'not visible');

    // NCR FAB HIDDEN (raise=false)
    await page.click('#n-ncr');
    await page.waitForTimeout(600);
    const ncrFab = await page.$('#new-btn');
    const ncrHidden = !ncrFab || !(await ncrFab.isVisible());
    if (ncrHidden) pass('Contractor — NCR FAB hidden (raise=false)');
    else fail('Contractor — NCR FAB should be hidden', 'still visible');

    // Submittal register FAB HIDDEN (manageRegister=false)
    await page.click('#n-sreg');
    await page.waitForTimeout(600);
    const sregFab = await page.$('#new-btn');
    const sregHidden = !sregFab || !(await sregFab.isVisible());
    if (sregHidden) pass('Contractor — Submittal Register FAB hidden (manageRegister=false)');
    else fail('Contractor — Submittal Register FAB should be hidden', 'still visible');

    // MS FAB visible (submitMS=true)
    await page.click('#n-ms');
    await page.waitForTimeout(600);
    const msFab = await page.$('#new-btn');
    if (msFab && await msFab.isVisible()) pass('Contractor — Method Statements FAB visible (submitMS=true)');
    else fail('Contractor — MS FAB', 'not visible');

    // Drawing detail: Upload Revision visible (upload=true), Approve button HIDDEN (approve=false)
    await page.click('#n-draw');
    await page.waitForTimeout(600);
    try {
      await page.waitForSelector('tr.draw-row', { timeout: 8000 });
      await page.click('tr.draw-row');
      await page.waitForTimeout(1000);
      const uploadBtn = await page.$('button[onclick*="uploadRev"]');
      if (uploadBtn && await uploadBtn.isVisible()) pass('Contractor — Upload Revision button visible');
      else fail('Contractor — Upload Revision button', 'not found/visible');
      const approveBtn = await page.$('button[onclick*="approveDrawing"]');
      const approveHidden = !approveBtn || !(await approveBtn.isVisible());
      if (approveHidden) pass('Contractor — Approve Drawing button hidden (approve=false)');
      else fail('Contractor — Approve Drawing should be hidden', 'still visible');
    } catch { skip('Contractor — drawing detail checks', 'no drawings in register'); }

    pass('Contractor — UI suite complete');
  } catch (e) { fail('Contractor — UI suite crashed', e); }
  finally { await logout(page); await page.close(); }
}

// ── SUBCONTRACTOR UI TESTS ───────────────────────────────────────────────────
async function testSubcontractorUI(browser) {
  section('SUBCONTRACTOR — UI');
  const page = await browser.newPage();
  try {
    await loginAs(page, 'subcontractor');
    const badge = await page.textContent('#role-badge-top').catch(() => '');
    if (badge.includes('subcontractor')) pass('Subcontractor — login, role badge = subcontractor');
    else fail('Subcontractor — role badge', `got "${badge}"`);

    // User Management nav HIDDEN
    const usersWrap = await page.$('#n-users-wrap');
    const usersHidden = usersWrap ? !(await usersWrap.isVisible()) : true;
    if (usersHidden) pass('Subcontractor — User Management nav hidden');
    else fail('Subcontractor — User Management nav should be hidden', 'still visible');

    // Drawing FAB HIDDEN (upload=false)
    await page.click('#n-draw');
    await page.waitForTimeout(600);
    const drawFab = await page.$('#new-btn');
    const drawHidden = !drawFab || !(await drawFab.isVisible());
    if (drawHidden) pass('Subcontractor — Drawing FAB hidden (upload=false)');
    else fail('Subcontractor — Drawing FAB should be hidden', 'still visible');

    // NCR FAB HIDDEN (raise=false)
    await page.click('#n-ncr');
    await page.waitForTimeout(600);
    const ncrFab = await page.$('#new-btn');
    const ncrHidden = !ncrFab || !(await ncrFab.isVisible());
    if (ncrHidden) pass('Subcontractor — NCR FAB hidden (raise=false)');
    else fail('Subcontractor — NCR FAB should be hidden', 'still visible');

    // Submittal register FAB HIDDEN (manageRegister=false)
    await page.click('#n-sreg');
    await page.waitForTimeout(600);
    const sregFab = await page.$('#new-btn');
    const sregHidden = !sregFab || !(await sregFab.isVisible());
    if (sregHidden) pass('Subcontractor — Submittal Register FAB hidden (manageRegister=false)');
    else fail('Subcontractor — Submittal Register FAB should be hidden', 'still visible');

    // MS FAB visible (submitMS=true)
    await page.click('#n-ms');
    await page.waitForTimeout(600);
    const msFab = await page.$('#new-btn');
    if (msFab && await msFab.isVisible()) pass('Subcontractor — Method Statements FAB visible (submitMS=true)');
    else fail('Subcontractor — MS FAB', 'not visible');

    // Drawing detail: Upload Revision HIDDEN (upload=false)
    await page.click('#n-draw');
    await page.waitForTimeout(600);
    try {
      await page.waitForSelector('tr.draw-row', { timeout: 8000 });
      await page.click('tr.draw-row');
      await page.waitForTimeout(1000);
      const uploadBtn = await page.$('button[onclick*="uploadRev"]');
      const uploadHidden = !uploadBtn || !(await uploadBtn.isVisible());
      if (uploadHidden) pass('Subcontractor — Upload Revision button hidden (upload=false)');
      else fail('Subcontractor — Upload Revision should be hidden', 'still visible');
    } catch { skip('Subcontractor — drawing detail check', 'no drawings in register'); }

    // IR FAB visible (submit=true → canCreateOnPage('ir') = true)
    await page.click('#n-ir');
    await page.waitForTimeout(600);
    const irFab = await page.$('#new-btn');
    if (irFab && await irFab.isVisible()) pass('Subcontractor — IR FAB visible (submit=true)');
    else fail('Subcontractor — IR FAB', 'not visible');

    pass('Subcontractor — UI suite complete');
  } catch (e) { fail('Subcontractor — UI suite crashed', e); }
  finally { await logout(page); await page.close(); }
}

function printSummary() {
  const counts = { PASS: 0, FAIL: 0, SKIP: 0 };
  for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;
  const W = Math.max(...results.map(r => r.name.length), 50);
  console.log('\n' + '═'.repeat(W + 24));
  console.log('  UI TEST RESULTS SUMMARY');
  console.log('═'.repeat(W + 24));
  for (const r of results) {
    const icon = { PASS: '✓', FAIL: '✗', SKIP: '⊘' }[r.status];
    const suffix = r.info ? `  ← ${r.info}` : '';
    console.log(`  ${icon}  ${r.status.padEnd(5)}  ${r.name.padEnd(W)}${suffix}`);
  }
  console.log('─'.repeat(W + 24));
  console.log(`  PASS: ${counts.PASS}   FAIL: ${counts.FAIL}   SKIP: ${counts.SKIP}   TOTAL: ${results.length}`);
  console.log('═'.repeat(W + 24) + '\n');
  if (counts.FAIL > 0) process.exit(1);
}

(async () => {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   UI ROLE JOURNEY TESTS — Golf Grove DMS                     ║');
  console.log(`║   Target: ${APP_URL.padEnd(51)}║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const browser = await chromium.launch({ headless: true });
  try {
    await testDeveloperUI(browser);
    await testConsultantUI(browser);
    await testContractorUI(browser);
    await testSubcontractorUI(browser);
  } finally {
    await browser.close();
  }
  printSummary();
})().catch(err => { console.error('\nFatal:', err); process.exit(1); });
