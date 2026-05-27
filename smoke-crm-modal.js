const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:56972');
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0];
  const jsErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') jsErrors.push(msg.text()); });
  page.on('pageerror', err => jsErrors.push('PAGEERROR: ' + err.message));

  // Make sure we're on CRM
  await page.click('#n-crm');
  await page.waitForTimeout(1000);

  // Reset filters
  await page.selectOption('#crm-stage-sel', '');
  await page.selectOption('#crm-source-sel', '');
  await page.waitForTimeout(500);

  const totalRows = await page.evaluate(() => document.querySelectorAll('tbody tr').length);
  console.log('Total rows:', totalRows);

  // Before clicking, dump all modals/overlays
  const beforeModals = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.modal, [class*="modal"], dialog, [class*="overlay"], [class*="panel"], [class*="drawer"], [class*="slide"]'))
      .map(m => ({
        id: m.id,
        cls: m.className.substring(0,80),
        display: window.getComputedStyle(m).display,
        visibility: window.getComputedStyle(m).visibility,
        text: m.textContent.replace(/\s+/g,' ').trim().substring(0,60)
      }));
  });
  console.log('Before click modals:', JSON.stringify(beforeModals, null, 2));

  // Click first row
  const firstRow = await page.$('tbody tr');
  if (firstRow) {
    const rowText = await firstRow.textContent();
    console.log('Clicking row:', rowText.replace(/\s+/g,' ').trim().substring(0,80));
    await firstRow.click();
    await page.waitForTimeout(2000);

    // After click, dump all modals/overlays again
    const afterModals = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.modal, [class*="modal"], dialog, [class*="overlay"], [class*="panel"], [class*="drawer"], [class*="slide"], [class*="detail"], [class*="lead"]'))
        .map(m => ({
          id: m.id,
          cls: m.className.substring(0,80),
          display: window.getComputedStyle(m).display,
          visibility: window.getComputedStyle(m).visibility,
          opacity: window.getComputedStyle(m).opacity,
          text: m.textContent.replace(/\s+/g,' ').trim().substring(0,100)
        }));
    });
    console.log('After click modals:', JSON.stringify(afterModals, null, 2));

    // Check URL hash
    console.log('URL:', page.url());

    // Check if any overlay/panel became visible
    const visibleOverlays = afterModals.filter(m => m.display !== 'none' && m.visibility !== 'hidden' && m.opacity !== '0');
    console.log('Visible overlays:', JSON.stringify(visibleOverlays, null, 2));

    // Check specific crm-detail or lead-detail containers
    const detailPanel = await page.evaluate(() => {
      const candidates = document.querySelectorAll('[id*="detail"], [id*="view"], [class*="detail"], [class*="lead-view"], [class*="side"], [class*="panel"]');
      return Array.from(candidates).map(el => ({
        id: el.id,
        cls: el.className.substring(0,80),
        display: window.getComputedStyle(el).display,
        text: el.textContent.replace(/\s+/g,' ').trim().substring(0,150)
      })).filter(el => el.display !== 'none');
    });
    console.log('Detail panels visible:', JSON.stringify(detailPanel, null, 2));

    // Dump full document body looking for what changed
    const bodyDump = await page.evaluate(() => document.body.innerHTML.substring(0, 2000));
    console.log('Body HTML excerpt (0-2000):', bodyDump.substring(1500, 2000));
  }

  console.log('JS errors:', jsErrors.length === 0 ? 'NONE' : jsErrors.join(' | '));
  await browser.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
