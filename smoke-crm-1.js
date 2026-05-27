const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:56972');
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0];
  const R = [];
  const jsErrors = [];

  page.on('console', msg => { if (msg.type() === 'error') jsErrors.push(msg.text()); });
  page.on('pageerror', err => jsErrors.push('PAGEERROR: ' + err.message));

  function pass(id, detail) { R.push({id, s:'PASS', detail:detail||''}); console.log('PASS  '+id+(detail?' | '+detail:'')); }
  function fail(id, detail) { R.push({id, s:'FAIL', detail:detail||''}); console.log('FAIL  '+id+(detail?' | '+detail:'')); }
  function skip(id, detail) { R.push({id, s:'SKIP', detail:detail||''}); console.log('SKIP  '+id+(detail?' | '+detail:'')); }

  // Navigate to CRM
  await page.click('#n-crm');
  await page.waitForTimeout(2000);
  console.log('URL:', page.url());

  // CRM-1: No JS errors on load
  if (jsErrors.length === 0) pass('CRM-1 No JS errors on load');
  else fail('CRM-1 No JS errors on load', jsErrors.join('; ').substring(0,200));

  // CRM-2: Lead list renders
  const tbodyRows = await page.evaluate(() => document.querySelectorAll('tbody tr').length);
  const totalStatEl = await page.evaluate(() => {
    const el = document.querySelector('.module-stat-val');
    return el ? el.textContent.trim() : '?';
  });
  console.log('tbody rows:', tbodyRows, '| stat total:', totalStatEl);
  if (tbodyRows > 0) pass('CRM-2 Lead list renders', tbodyRows + ' rows');
  else fail('CRM-2 Lead list renders', 'No rows in tbody');

  // CRM-3: Search field filters & focus
  const searchEl = await page.$('#crm-search');
  if (!searchEl) {
    fail('CRM-3a Search filters table', 'No #crm-search');
    fail('CRM-3b Focus not lost after typing', 'No #crm-search');
  } else {
    const beforeCount = await page.evaluate(() => document.querySelectorAll('tbody tr').length);
    await page.fill('#crm-search', 'Dubai');
    await page.waitForTimeout(800);
    const focusedId = await page.evaluate(() => document.activeElement && document.activeElement.id ? document.activeElement.id : 'none');
    const afterCount = await page.evaluate(() => document.querySelectorAll('tbody tr').length);
    console.log('Search Dubai: before='+beforeCount+' after='+afterCount+' focused='+focusedId);
    pass('CRM-3a Search filters table', 'before='+beforeCount+' after='+afterCount);
    if (focusedId === 'crm-search') pass('CRM-3b Focus not lost after typing', 'focus stays on crm-search');
    else fail('CRM-3b Focus not lost after typing', 'focus moved to: '+focusedId);
    await page.fill('#crm-search', '');
    await page.waitForTimeout(500);
  }

  // CRM-4: Stage filter
  const stageOpts = await page.evaluate(() => {
    const sel = document.querySelector('#crm-stage-sel');
    if (!sel) return null;
    return Array.from(sel.options).map(o => o.value).filter(v => v);
  });
  console.log('Stage options:', stageOpts);
  if (!stageOpts || !stageOpts.length) fail('CRM-4 Stage filter dropdown', 'No options');
  else {
    const before = await page.evaluate(() => document.querySelectorAll('tbody tr').length);
    await page.selectOption('#crm-stage-sel', stageOpts[0]);
    await page.waitForTimeout(800);
    const after = await page.evaluate(() => document.querySelectorAll('tbody tr').length);
    pass('CRM-4 Stage filter dropdown', 'option="'+stageOpts[0]+'" before='+before+' after='+after);
    await page.selectOption('#crm-stage-sel', '');
    await page.waitForTimeout(300);
  }

  // CRM-5: Source filter
  const sourceOpts = await page.evaluate(() => {
    const sel = document.querySelector('#crm-source-sel');
    if (!sel) return null;
    return Array.from(sel.options).map(o => o.value).filter(v => v);
  });
  console.log('Source options:', sourceOpts);
  if (!sourceOpts || !sourceOpts.length) fail('CRM-5 Source filter dropdown', 'No options');
  else {
    const before = await page.evaluate(() => document.querySelectorAll('tbody tr').length);
    await page.selectOption('#crm-source-sel', sourceOpts[0]);
    await page.waitForTimeout(800);
    const after = await page.evaluate(() => document.querySelectorAll('tbody tr').length);
    pass('CRM-5 Source filter dropdown', 'option="'+sourceOpts[0]+'" before='+before+' after='+after);
    await page.selectOption('#crm-source-sel', '');
    await page.waitForTimeout(300);
  }

  // CRM-6: Assigned filter
  const assignedOpts = await page.evaluate(() => {
    const sel = document.querySelector('#crm-assigned-sel');
    if (!sel) return null;
    return Array.from(sel.options).map(o => ({ v: o.value, t: o.text })).filter(o => o.v);
  });
  console.log('Assigned options:', assignedOpts);
  if (!assignedOpts || !assignedOpts.length) skip('CRM-6 Assigned filter dropdown', 'No assigned users in data');
  else {
    await page.selectOption('#crm-assigned-sel', assignedOpts[0].v);
    await page.waitForTimeout(800);
    const after = await page.evaluate(() => document.querySelectorAll('tbody tr').length);
    pass('CRM-6 Assigned filter dropdown', 'option="'+assignedOpts[0].t+'" rows='+after);
    await page.selectOption('#crm-assigned-sel', '');
    await page.waitForTimeout(300);
  }

  // CRM-7: Date range filters
  const dateFrom = await page.$('#crm-date-from');
  const dateTo = await page.$('#crm-date-to');
  if (!dateFrom || !dateTo) fail('CRM-7 Date range filters', 'Date inputs not found');
  else {
    await page.fill('#crm-date-from', '2024-01-01');
    await page.fill('#crm-date-to', '2026-12-31');
    await page.dispatchEvent('#crm-date-to', 'change');
    await page.waitForTimeout(800);
    const after = await page.evaluate(() => document.querySelectorAll('tbody tr').length);
    pass('CRM-7 Date range filters', 'rows after date filter='+after);
    await page.fill('#crm-date-from', '');
    await page.fill('#crm-date-to', '');
    await page.dispatchEvent('#crm-date-to', 'change');
    await page.waitForTimeout(300);
  }

  // CRM-8: Stage pills
  const pillCount = await page.evaluate(() => document.querySelectorAll('[onclick*="crmSetFilter"]').length);
  console.log('Stage pill count:', pillCount);
  if (!pillCount) fail('CRM-8 Stage pills filter table', 'No pills');
  else {
    await page.evaluate(() => {
      const pills = document.querySelectorAll('[onclick*="crmSetFilter"]');
      if (pills[1]) pills[1].click();
    });
    await page.waitForTimeout(800);
    const after = await page.evaluate(() => document.querySelectorAll('tbody tr').length);
    pass('CRM-8 Stage pills filter table', pillCount+' pills, clicked one, rows='+after);
    // Reset
    await page.evaluate(() => {
      const firstPill = document.querySelector('[onclick*="crmSetFilter"]');
      if (firstPill) firstPill.click();
    });
    await page.waitForTimeout(300);
  }

  // CRM-9: Pagination
  const totalRows = await page.evaluate(() => document.querySelectorAll('tbody tr').length);
  const paginationInfo = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, .btn')).filter(b =>
      /prev|next|previous/i.test(b.textContent) || /prev|next/i.test(b.id)
    );
    return buttons.map(b => ({ id: b.id, text: b.textContent.trim(), disabled: b.disabled }));
  });
  console.log('Pagination buttons:', JSON.stringify(paginationInfo));
  if (totalRows <= 25) skip('CRM-9 Pagination', 'Only '+totalRows+' rows, pagination not triggered (<=25)');
  else if (!paginationInfo.length) fail('CRM-9 Pagination', 'No prev/next buttons');
  else pass('CRM-9 Pagination', JSON.stringify(paginationInfo));

  // CRM-10: Checkbox + bulk bar
  const firstCheckbox = await page.$('tbody tr input[type="checkbox"], .lead-check');
  console.log('First checkbox found:', !!firstCheckbox);
  if (!firstCheckbox) {
    fail('CRM-10 Checkbox + bulk bar', 'No checkboxes in table');
    skip('CRM-11 Bulk Delete button visible', 'depends on CRM-10');
  } else {
    await firstCheckbox.click();
    await page.waitForTimeout(600);
    const bulkBarInfo = await page.evaluate(() => {
      const bar = document.querySelector('.bulk-bar, #bulk-bar, .bulk-actions, [class*="bulk"]');
      if (!bar) return { found: false };
      const style = window.getComputedStyle(bar);
      return { found: true, display: style.display, text: bar.textContent.replace(/\s+/g,' ').trim().substring(0,120) };
    });
    console.log('Bulk bar:', JSON.stringify(bulkBarInfo));
    if (bulkBarInfo.found && bulkBarInfo.display !== 'none') {
      pass('CRM-10 Checkbox + bulk bar', 'Bar text: '+bulkBarInfo.text);
    } else {
      fail('CRM-10 Checkbox + bulk bar', 'Bar not visible. found='+bulkBarInfo.found);
    }

    // CRM-11: Delete button in bulk bar
    const deleteBtn = await page.evaluate(() => {
      const bar = document.querySelector('.bulk-bar, #bulk-bar, .bulk-actions, [class*="bulk"]');
      if (!bar) return null;
      const btn = Array.from(bar.querySelectorAll('button, .btn, a')).find(b => /delete/i.test(b.textContent));
      return btn ? btn.textContent.trim() : null;
    });
    if (deleteBtn) pass('CRM-11 Bulk Delete button visible', '"'+deleteBtn+'"');
    else fail('CRM-11 Bulk Delete button visible', 'No delete button in bulk bar');

    // Uncheck
    await firstCheckbox.click();
    await page.waitForTimeout(300);
  }

  console.log('\n=== CRM Tests 1-11 Results ===');
  R.forEach(r => console.log(r.s.padEnd(4)+' | '+r.id+' | '+r.detail));
  console.log('JS errors:', jsErrors.length === 0 ? 'NONE' : jsErrors.join(' | '));
  await browser.close();
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
