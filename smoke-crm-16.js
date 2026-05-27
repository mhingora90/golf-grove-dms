const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:56972');
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0];
  const jsErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') jsErrors.push(msg.text()); });
  page.on('pageerror', err => jsErrors.push('PAGEERROR: ' + err.message));

  // Get first real lead
  await page.click('#n-crm');
  await page.waitForTimeout(800);
  await page.evaluate(() => { if (typeof closeModal === 'function') closeModal(); });
  await page.selectOption('#crm-stage-sel', '');
  await page.selectOption('#crm-source-sel', '');
  await page.waitForTimeout(400);

  const firstLeadId = await page.evaluate(() => {
    const rows = document.querySelectorAll('.crm-table tbody tr[data-id]');
    for (const row of rows) {
      const name = row.querySelector('td:nth-child(2)');
      if (name && !name.textContent.includes('Smoke Test')) return row.getAttribute('data-id');
    }
    return rows[0] ? rows[0].getAttribute('data-id') : null;
  });

  // Open modal
  await page.evaluate((id) => viewLead(id), firstLeadId);
  await page.waitForTimeout(1500);

  // Check modal-bg state
  const modalBgBefore = await page.evaluate(() => {
    const bg = document.getElementById('modal-bg');
    return { classes: bg ? bg.className : 'not found', display: bg ? window.getComputedStyle(bg).display : 'n/a' };
  });
  console.log('modal-bg before close:', JSON.stringify(modalBgBefore));

  // Click the × close button
  const closeClicked = await page.evaluate(() => {
    const btn = document.querySelector('.modal-close');
    if (btn) { btn.click(); return btn.textContent.trim(); }
    // Try calling closeModal directly
    if (typeof closeModal === 'function') { closeModal(); return 'closeModal()'; }
    return null;
  });
  await page.waitForTimeout(600);

  const modalBgAfter = await page.evaluate(() => {
    const bg = document.getElementById('modal-bg');
    return { classes: bg ? bg.className : 'not found', display: bg ? window.getComputedStyle(bg).display : 'n/a' };
  });
  console.log('Clicked:', closeClicked, '| modal-bg after:', JSON.stringify(modalBgAfter));

  const isClosed = !modalBgAfter.classes.includes('open');
  console.log('Modal closed:', isClosed);
  console.log(isClosed ? 'PASS  CRM-16 Modal close button' : 'FAIL  CRM-16 Modal close button | modal-bg still has class "open"');
  console.log('JS errors:', jsErrors.length === 0 ? 'NONE' : jsErrors.join(' | '));
  await browser.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
