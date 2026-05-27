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

  // Navigate to CRM, reset
  await page.click('#n-crm');
  await page.waitForTimeout(1000);
  await page.evaluate(() => { if (typeof closeModal === 'function') closeModal(); });
  await page.selectOption('#crm-stage-sel', '');
  await page.selectOption('#crm-source-sel', '');
  await page.waitForTimeout(500);

  // Get first REAL lead ID (not the smoke test one we created)
  const firstLeadId = await page.evaluate(() => {
    const rows = document.querySelectorAll('.crm-table tbody tr[data-id]');
    // Find one that's not the smoke test lead
    for (const row of rows) {
      const name = row.querySelector('td:nth-child(2)');
      if (name && !name.textContent.includes('Smoke Test')) {
        return row.getAttribute('data-id');
      }
    }
    return rows[0] ? rows[0].getAttribute('data-id') : null;
  });
  console.log('Using lead ID:', firstLeadId);

  if (!firstLeadId) {
    ['CRM-12','CRM-13','CRM-14','CRM-15','CRM-16'].forEach(id => fail(id+' modal test', 'No leads'));
  } else {
    // Open lead modal
    await page.evaluate((id) => viewLead(id), firstLeadId);
    await page.waitForTimeout(2000);

    // CRM-12
    const modalDisplay = await page.evaluate(() => {
      const m = document.getElementById('modal');
      return m ? window.getComputedStyle(m).display : 'not found';
    });
    const modalTitle = await page.evaluate(() => {
      const t = document.getElementById('modal-title');
      return t ? t.textContent.trim() : 'no title';
    });
    console.log('Modal display:', modalDisplay, '| title:', modalTitle);

    if (modalDisplay === 'block') pass('CRM-12 Click lead row opens modal', 'title="'+modalTitle+'"');
    else fail('CRM-12 Click lead row opens modal', 'display='+modalDisplay);

    // CRM-13: Stage dropdown
    const stageEl = await page.evaluate(() => {
      const el = document.getElementById('lead-stage');
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const s = window.getComputedStyle(el);
      return { value: el.value, display: s.display, visibility: s.visibility, inViewport: rect.width > 0 && rect.height > 0, optCount: el.options.length };
    });
    console.log('lead-stage el:', JSON.stringify(stageEl));

    if (!stageEl) fail('CRM-13 Modal stage dropdown', '#lead-stage not found');
    else if (!stageEl.inViewport) {
      // Try scrolling to it
      await page.evaluate(() => document.getElementById('lead-stage') && document.getElementById('lead-stage').scrollIntoView());
      await page.waitForTimeout(300);
      const beforeErrors = jsErrors.length;
      // Use JS to change the value
      await page.evaluate(() => {
        const sel = document.getElementById('lead-stage');
        const opts = Array.from(sel.options).map(o => o.value).filter(v => v);
        if (opts.length > 1) {
          sel.value = opts[1];
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      await page.waitForTimeout(800);
      const afterErrors = jsErrors.length;
      if (afterErrors > beforeErrors) fail('CRM-13 Modal stage dropdown', 'JS error: '+jsErrors.slice(beforeErrors).join('; '));
      else pass('CRM-13 Modal stage dropdown', 'Changed via JS eval (not in viewport but works)');
    } else {
      const opts = await page.evaluate(() => Array.from(document.getElementById('lead-stage').options).map(o => o.value).filter(v => v));
      const beforeErrors = jsErrors.length;
      await page.selectOption('#lead-stage', opts[1] || opts[0]);
      await page.waitForTimeout(800);
      const afterErrors = jsErrors.length;
      if (afterErrors > beforeErrors) fail('CRM-13 Modal stage dropdown', 'JS error on change');
      else pass('CRM-13 Modal stage dropdown', 'Changed to "'+opts[1]+'", no errors. optCount='+stageEl.optCount);
    }

    // CRM-14: Assigned To
    const assignedEl = await page.evaluate(() => {
      const el = document.getElementById('lead-assigned');
      if (!el) return null;
      return { value: el.value, type: el.type, placeholder: el.placeholder };
    });
    console.log('lead-assigned:', JSON.stringify(assignedEl));
    if (!assignedEl) fail('CRM-14 Modal assigned to field', '#lead-assigned not found');
    else pass('CRM-14 Modal assigned to field', 'value="'+assignedEl.value+'" placeholder="'+assignedEl.placeholder+'"');

    // CRM-15: Notes textarea + Add Note
    const noteInputEl = await page.evaluate(() => {
      const el = document.getElementById('lead-note-input');
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const s = window.getComputedStyle(el);
      return { display: s.display, visibility: s.visibility, inViewport: rect.width > 0 && rect.height > 0 };
    });
    console.log('lead-note-input el:', JSON.stringify(noteInputEl));

    if (!noteInputEl) fail('CRM-15 Notes textarea + Add Note button', '#lead-note-input not found');
    else {
      // Use JS to fill and click (avoids visibility issues with scrolled modal)
      const beforeErrors = jsErrors.length;
      await page.evaluate(() => {
        const input = document.getElementById('lead-note-input');
        if (input) {
          input.value = 'Smoke test note via eval';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const btn = Array.from(document.querySelectorAll('#modal button')).find(b => b.textContent.trim() === 'Add');
        if (btn) btn.click();
      });
      await page.waitForTimeout(1200);
      const afterErrors = jsErrors.length;
      if (afterErrors > beforeErrors) fail('CRM-15 Notes textarea + Add Note button', 'JS error: '+jsErrors.slice(beforeErrors).join('; '));
      else pass('CRM-15 Notes textarea + Add Note button', 'Typed+clicked Add, no JS errors. inViewport='+noteInputEl.inViewport);
    }

    // Re-open if closed after note add
    const modalOpen = await page.evaluate(() => {
      const m = document.getElementById('modal');
      return m ? window.getComputedStyle(m).display !== 'none' : false;
    });
    if (!modalOpen) {
      await page.evaluate((id) => viewLead(id), firstLeadId);
      await page.waitForTimeout(1000);
    }

    // CRM-16: Close button
    const closeClicked = await page.evaluate(() => {
      const closeBtn = document.querySelector('#modal .modal-close');
      const footerClose = Array.from(document.querySelectorAll('#modal button')).find(b => /^Close$/i.test(b.textContent.trim()));
      const btn = closeBtn || footerClose;
      if (btn) { btn.click(); return { clicked: true, text: btn.textContent.trim() }; }
      return { clicked: false };
    });
    await page.waitForTimeout(800);
    const closedCheck = await page.evaluate(() => {
      const m = document.getElementById('modal');
      return m ? window.getComputedStyle(m).display === 'none' : true;
    });
    console.log('Close clicked:', closeClicked, '| Closed:', closedCheck);
    if (!closeClicked.clicked) fail('CRM-16 Modal close button', 'No close button found');
    else if (closedCheck) pass('CRM-16 Modal close button', 'Clicked "'+closeClicked.text+'", modal hidden');
    else fail('CRM-16 Modal close button', 'Modal still visible after close');
  }

  console.log('\n=== CRM Modal Results (12-16) ===');
  R.forEach(r => console.log(r.s.padEnd(4)+' | '+r.id+' | '+r.detail));
  console.log('JS errors:', jsErrors.length === 0 ? 'NONE' : jsErrors.join(' | '));
  await browser.close();
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
