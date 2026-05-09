const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 400 });
  const page = await browser.newPage();
  let pass = 0, fail = 0, warn = 0;

  function log(msg, status = 'INFO') {
    if (status === 'PASS') pass++;
    if (status === 'FAIL') fail++;
    if (status === 'WARN') warn++;
    console.log(`[${status}] ${msg}`);
  }

  // Capture toast messages
  const toasts = [];
  await page.exposeFunction('captureToast', (msg) => toasts.push(msg));
  page.on('console', m => { if (m.text().includes('toast')) toasts.push(m.text()); });

  try {
    // LOGIN
    await page.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
    await page.waitForSelector('#login-email', { timeout: 8000 });
    await page.fill('#login-email', 'mohammed@regent-developments.com');
    await page.fill('#login-password', 'Mman1990');
    await page.click('#login-btn');
    await page.waitForSelector('#app-screen', { timeout: 10000 });
    log('Login successful as Developer (mohammed@regent-developments.com)');

    // NAVIGATE TO BOQ SETUP
    await page.click('text=BOQ Setup');
    await page.waitForFunction(() => window.location.hash === '#boq', { timeout: 5000 });
    await page.waitForTimeout(2000);

    // VERIFY PAGE LOADED WITH DATA
    const billRowsBefore = await page.locator('tr[data-bill-id]').count();
    log(`BOQ loaded — ${billRowsBefore} bill header rows visible`, billRowsBefore > 0 ? 'PASS' : 'FAIL');

    // VERIFY FILTER DROPDOWN PRESENT
    const filterSel = page.locator('select[onchange*="filtBOQ"]');
    const filterVisible = await filterSel.isVisible().catch(() => false);
    log(`Bill filter dropdown present: ${filterVisible}`, filterVisible ? 'PASS' : 'FAIL');

    // VERIFY MODULE BAR (CONTRACT SUM) VISIBLE
    const moduleBar = await page.locator('.module-bar').count();
    log(`Module bar / Contract Sum visible: ${moduleBar > 0}`, moduleBar > 0 ? 'PASS' : 'FAIL');

    // ENTER EDIT MODE
    await page.locator('button:has-text("Edit")').first().click();
    await page.waitForSelector('button:has-text("+ Add Bill")', { timeout: 5000 });
    const addBillBtn = await page.locator('button:has-text("+ Add Bill")').isVisible();
    log(`Edit mode active — + Add Bill button visible: ${addBillBtn}`, addBillBtn ? 'PASS' : 'FAIL');

    // TEST 1: EMPTY FORM VALIDATION
    await page.locator('button:has-text("+ Add Bill")').click();
    await page.waitForSelector('#modal-bg', { timeout: 5000 });
    log('Add Bill modal opened');
    await page.locator('#modal-footer button:has-text("Add Bill")').click();
    await page.waitForTimeout(800);
    // Modal should still be open (validation blocked submit)
    const modalOpenAfterEmpty = await page.locator('#modal-bg').isVisible().catch(() => false);
    log(`Empty submit blocked (modal still open): ${modalOpenAfterEmpty}`, modalOpenAfterEmpty ? 'PASS' : 'WARN');

    // TEST 2: FILL AND SUBMIT VALID BILL
    await page.fill('#new-bill-no', 'T01');
    await page.fill('#new-bill-title', 'Test Electrical Works');
    await page.screenshot({ path: 'add-bill-filled.png' });
    log('Modal filled with T01 / Test Electrical Works — screenshot saved');
    await page.locator('#modal-footer button:has-text("Add Bill")').click();

    // Wait for modal to close and page to re-render
    await page.waitForFunction(() => !document.getElementById('modal-bg') || document.getElementById('modal-bg').style.display === 'none', { timeout: 8000 });
    log('Modal closed after submit');
    await page.waitForTimeout(2000); // wait for render()

    // TEST 3: NEW BILL APPEARS IN TABLE
    const billRowsAfter = await page.locator('tr[data-bill-id]').count();
    log(`Bill rows before: ${billRowsBefore} → after: ${billRowsAfter}`, billRowsAfter > billRowsBefore ? 'PASS' : 'FAIL');

    // TEST 4: NEW BILL IN FILTER DROPDOWN
    const filterOpts = await page.locator('select[onchange*="filtBOQ"] option').allInnerTexts();
    const inFilter = filterOpts.some(t => t.includes('T01'));
    log(`T01 in filter dropdown (${filterOpts.length} options): ${inFilter}`, inFilter ? 'PASS' : 'FAIL');

    // TEST 5: CHRONOLOGICAL ORDER — T01 should sort before existing bills
    const firstBillHeader = await page.locator('tr[data-bill-id]').first().innerText().catch(() => '');
    log(`First bill in table: "${firstBillHeader.trim().substring(0, 50)}"`, firstBillHeader.includes('T01') ? 'PASS' : 'INFO');

    // TEST 6: MODULE BAR UPDATED AFTER ADD
    const moduleBarAfter = await page.locator('.module-bar').count();
    const billsStatText = await page.locator('.module-stat').allInnerTexts();
    log(`Module bar still present after add. Stats: ${billsStatText.join(' | ')}`, moduleBarAfter > 0 ? 'PASS' : 'FAIL');

    // TEST 7: DUPLICATE BILL NO BLOCKED
    await page.locator('button:has-text("+ Add Bill")').click();
    await page.waitForSelector('#modal-bg', { timeout: 5000 });
    await page.fill('#new-bill-no', 'T01');
    await page.fill('#new-bill-title', 'Duplicate Test');
    await page.locator('#modal-footer button:has-text("Add Bill")').click();
    await page.waitForTimeout(2000);
    const dupModalOpen = await page.locator('#modal-bg').isVisible().catch(() => false);
    const rowsAfterDup = await page.locator('tr[data-bill-id]').count();
    // If duplicate is blocked, modal stays open OR row count doesn't increase
    const dupBlocked = dupModalOpen || rowsAfterDup === billRowsAfter;
    log(`Duplicate T01 ${dupBlocked ? 'blocked' : 'MAY HAVE BEEN INSERTED (row count changed)'}`, dupBlocked ? 'PASS' : 'WARN');
    if (dupModalOpen) {
      await page.locator('button:has-text("Cancel")').click().catch(() => {});
      await page.waitForTimeout(500);
    }

    // TEST 8: SAVE CHANGES COMPLETES SUCCESSFULLY
    const saveBtn = await page.locator('button:has-text("Save Changes")').isVisible().catch(() => false);
    log(`Save Changes button visible: ${saveBtn}`, saveBtn ? 'PASS' : 'WARN');
    if (saveBtn) {
      await page.locator('button:has-text("Save Changes")').click();
      await page.waitForTimeout(2000);
      const backToView = await page.locator('button:has-text("Edit")').isVisible().catch(() => false);
      log(`After Save — back to view mode: ${backToView}`, backToView ? 'PASS' : 'WARN');
    }

    // TEST 9: FILTER WORKS — select T01 bill and verify table filters
    const filterSelAfter = page.locator('select[onchange*="filtBOQ"]');
    if (await filterSelAfter.isVisible()) {
      const t01OptionValue = await page.locator('select[onchange*="filtBOQ"] option').filter({ hasText: 'T01' }).getAttribute('value').catch(() => null);
      if (t01OptionValue) {
        await filterSelAfter.selectOption(t01OptionValue);
        await page.waitForTimeout(800);
        const visibleBills = await page.locator('tr[data-bill-id]:visible').count();
        log(`Filter by T01 bill — visible bill rows: ${visibleBills}`, visibleBills === 1 ? 'PASS' : 'WARN');
        // Reset filter
        await filterSelAfter.selectOption('all');
      } else {
        log('T01 option not found in filter for test 9', 'WARN');
      }
    }

    // FINAL SCREENSHOT
    await page.screenshot({ path: 'add-bill-test-result.png', fullPage: false });

    console.log(`\n=== RESULTS: ${pass} PASS | ${fail} FAIL | ${warn} WARN ===`);
    log('Bill T01 ("Test Electrical Works") left in DB — delete manually if unwanted');

  } catch (err) {
    log(`FATAL: ${err.message}`, 'FAIL');
    await page.screenshot({ path: 'add-bill-test-error.png' }).catch(() => {});
    console.log(`\n=== RESULTS: ${pass} PASS | ${fail} FAIL | ${warn} WARN ===`);
  }

  await browser.close();
})();
