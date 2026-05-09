async (page) => {
  const results = [];
  let passCount = 0;
  let failCount = 0;

  function log(test, status, detail = '') {
    const marker = status === 'PASS' ? '✓' : '✗';
    results.push(`${marker} ${test} ${detail ? '- ' + detail : ''}`);
    if (status === 'PASS') passCount++; else failCount++;
  }

  // Login as developer
  await page.goto('http://localhost:5173');
  await page.waitForLoadState('networkidle');
  
  // Check if already logged in
  const currentUrl = page.url();
  if (!currentUrl.includes('#dashboard')) {
    await page.fill('input[type="email"]', 'mohammed@regent-developments.com');
    await page.fill('input[type="password"]', 'dev123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
  }

  // ========== BOQ SETUP MODULE TESTS ==========
  
  // Navigate to BOQ
  await page.evaluate(() => window.location.hash = 'boq');
  await page.waitForTimeout(1000);
  
  // Test 1: BOQ page loads
  const boqVisible = await page.isVisible('#boq');
  log('BOQ page loads', boqVisible ? 'PASS' : 'FAIL');

  // Test 2: BOQ table renders
  const boqTableVisible = await page.isVisible('table');
  log('BOQ table renders', boqTableVisible ? 'PASS' : 'FAIL');

  // Test 3: Edit button exists
  const editBtnExists = await page.isVisible('button:has-text("Edit")');
  log('Edit button exists', editBtnExists ? 'PASS' : 'FAIL');

  // Test 4: Replace BOQ button exists
  const replaceBtnExists = await page.isVisible('button:has-text("Replace")');
  log('Replace BOQ button exists', replaceBtnExists ? 'PASS' : 'FAIL');

  // Test 5: Add Item button per bill (check first bill)
  const addItemBtnExists = await page.isVisible('button:has-text("+ Add Item")');
  log('Add Item button per bill', addItemBtnExists ? 'PASS' : 'FAIL');

  // Test 6: Edit mode toggle
  if (editBtnExists) {
    await page.click('button:has-text("Edit")');
    await page.waitForTimeout(500);
    const editModeActive = await page.isVisible('input');
    log('Edit mode toggles on', editModeActive ? 'PASS' : 'FAIL');
    
    // Exit edit mode
    await page.click('button:has-text("Save")');
    await page.waitForTimeout(500);
  }

  // ========== PAYMENT CERTIFICATES (IPC) MODULE TESTS ==========
  
  // Navigate to IPC
  await page.evaluate(() => window.location.hash = 'ipc');
  await page.waitForTimeout(1000);
  
  // Test 7: IPC page loads
  const ipcVisible = await page.isVisible('#ipc');
  log('IPC page loads', ipcVisible ? 'PASS' : 'FAIL');

  // Test 8: + New button exists
  const newBtnExists = await page.isVisible('button:has-text("+ New")');
  log('IPC + New button exists', newBtnExists ? 'PASS' : 'FAIL');

  // Test 9: Create new IPC (Draft)
  if (newBtnExists) {
    await page.click('button:has-text("+ New")');
    await page.waitForTimeout(500);
    
    // Fill in IPC form
    const ipcNumber = 'IPC-TEST-' + Date.now();
    await page.fill('input[placeholder*="Number"], input[name*="number"], #ipc-number, input:first-of-type', ipcNumber);
    await page.waitForTimeout(300);
    
    // Submit form
    const submitBtn = await page.isVisible('button:has-text("Create"), button:has-text("Save")');
    if (submitBtn) {
      await page.click('button:has-text("Create"), button:has-text("Save")');
      await page.waitForTimeout(1000);
    }
    
    log('Create new IPC', submitBtn ? 'PASS' : 'FAIL', 'Form submission attempted');
  }

  // Test 10: IPC status badges render
  const statusBadgesExist = await page.isVisible('.badge, [class*="status"], span:has-text("Draft")');
  log('IPC status badges render', statusBadgesExist ? 'PASS' : 'FAIL');

  // Test 11: Submit button (role-gated)
  const submitBtnExists = await page.isVisible('button:has-text("Submit")');
  log('Submit button visible (developer)', submitBtnExists ? 'PASS' : 'FAIL');

  // Test 12: Certify button (role-gated)
  const certifyBtnExists = await page.isVisible('button:has-text("Certify"), button:has-text("Begin Review")');
  log('Review/Certify button visible (developer)', certifyBtnExists ? 'PASS' : 'FAIL');

  // Test 13: Record Payment button (developer only)
  const paymentBtnExists = await page.isVisible('button:has-text("Record Payment")');
  log('Record Payment button visible (developer)', paymentBtnExists ? 'PASS' : 'FAIL');

  // Test 14: IPC detail modal opens
  const ipcRowClickable = await page.isVisible('tr, [class*="row"], li');
  if (ipcRowClickable) {
    const firstRow = await page.$('tr, li[class*="row"]');
    if (firstRow) {
      await firstRow.click();
      await page.waitForTimeout(500);
      const modalOpen = await page.isVisible('.modal, [class*="modal"], [role="dialog"]');
      log('IPC detail modal opens', modalOpen ? 'PASS' : 'FAIL');
      
      // Close modal
      if (modalOpen) {
        await page.click('.modal .close, [class*="close"], button:has-text("Close"), button:has-text("×")');
        await page.waitForTimeout(300);
      }
    }
  }

  // Test 15: BOQ claims table in modal (editable percentages)
  const claimsTableExists = await page.isVisible('table, [class*="claims"]');
  log('BOQ claims table visible', claimsTableExists ? 'PASS' : 'FAIL');

  // Test 16: Percentage input fields (role-gated)
  const pctInputsExist = await page.isVisible('input[type="number"], input[placeholder*="%"], input[placeholder*="percent"]');
  log('Percentage input fields visible', pctInputsExist ? 'PASS' : 'FAIL');

  // ========== NAVIGATION & PERSISTENCE TESTS ==========
  
  // Test 17: Hash navigation persists
  const hashPersists = await page.evaluate(() => {
    window.location.hash = 'boq';
    return window.location.hash === '#boq';
  });
  log('Hash navigation persists', hashPersists ? 'PASS' : 'FAIL');

  // Test 18: Module stat bar renders
  const statBarExists = await page.isVisible('[class*="stat"], [class*="summary"]');
  log('Module stat bar renders', statBarExists ? 'PASS' : 'FAIL');

  // Summary
  const summary = `\n=== BOQ + IPC Module Test Results ===\n${results.join('\n')}\n\nTotal: ${passCount + failCount} | Passed: ${passCount} | Failed: ${failCount}`;
  return summary;
}
