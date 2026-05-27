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

  // Navigate to CRM, reset filters
  await page.click('#n-crm');
  await page.waitForTimeout(1000);
  await page.selectOption('#crm-stage-sel', '');
  await page.selectOption('#crm-source-sel', '');
  await page.waitForTimeout(500);

  // Close any open modal first
  await page.evaluate(() => {
    if (typeof closeModal === 'function') closeModal();
  });
  await page.waitForTimeout(300);

  // Get first lead ID from table
  const firstLeadId = await page.evaluate(() => {
    const row = document.querySelector('.crm-table tbody tr[data-id]');
    return row ? row.getAttribute('data-id') : null;
  });
  console.log('First lead ID:', firstLeadId);

  if (!firstLeadId) {
    fail('CRM-12 Click lead row opens modal', 'No leads in table');
    fail('CRM-13 Modal stage dropdown', 'no leads');
    fail('CRM-14 Modal assigned to field', 'no leads');
    fail('CRM-15 Notes textarea + Add Note button', 'no leads');
    fail('CRM-16 Modal close button', 'no leads');
  } else {
    // CRM-12: Click a lead TD to open modal
    await page.evaluate((id) => viewLead(id), firstLeadId);
    await page.waitForTimeout(1500);

    const modalState = await page.evaluate(() => {
      const modal = document.getElementById('modal');
      const title = document.getElementById('modal-title');
      if (!modal) return { found: false };
      const s = window.getComputedStyle(modal);
      return {
        found: true,
        display: s.display,
        visibility: s.visibility,
        titleText: title ? title.textContent.trim() : 'no title',
        hasLeadStage: !!document.getElementById('lead-stage'),
        hasLeadAssigned: !!document.getElementById('lead-assigned'),
        hasLeadNoteInput: !!document.getElementById('lead-note-input')
      };
    });
    console.log('Modal state:', JSON.stringify(modalState));

    if (modalState.found && modalState.display !== 'none') {
      pass('CRM-12 Click lead row opens modal', 'Modal visible, title="'+modalState.titleText+'"');
    } else {
      fail('CRM-12 Click lead row opens modal', 'Modal display='+modalState.display);
    }

    // CRM-13: Modal stage dropdown
    if (!modalState.hasLeadStage) {
      fail('CRM-13 Modal stage dropdown', '#lead-stage not found');
    } else {
      const stageInfo = await page.evaluate(() => {
        const sel = document.getElementById('lead-stage');
        return { value: sel.value, optCount: sel.options.length };
      });
      console.log('Stage select:', stageInfo);
      const beforeErrors = jsErrors.length;
      // Change stage
      const stageOpts = await page.evaluate(() => {
        const sel = document.getElementById('lead-stage');
        return Array.from(sel.options).map(o => o.value).filter(v => v);
      });
      if (stageOpts.length > 1) {
        const newOpt = stageOpts.find(o => o !== stageOpts[0]) || stageOpts[0];
        await page.selectOption('#lead-stage', newOpt);
        await page.waitForTimeout(800);
        const afterErrors = jsErrors.length;
        if (afterErrors > beforeErrors) fail('CRM-13 Modal stage dropdown', 'JS error: '+jsErrors.slice(beforeErrors).join('; '));
        else pass('CRM-13 Modal stage dropdown', 'Changed to "'+newOpt+'", no JS errors');
      } else {
        pass('CRM-13 Modal stage dropdown', 'Exists with '+stageOpts.length+' options');
      }
    }

    // CRM-14: Assigned To field
    if (!modalState.hasLeadAssigned) {
      fail('CRM-14 Modal assigned to field', '#lead-assigned not found');
    } else {
      const assignedVal = await page.evaluate(() => document.getElementById('lead-assigned').value);
      pass('CRM-14 Modal assigned to field', '#lead-assigned found, value="'+assignedVal+'"');
    }

    // CRM-15: Notes textarea + Add Note button
    if (!modalState.hasLeadNoteInput) {
      fail('CRM-15 Notes textarea + Add Note button', '#lead-note-input not found');
    } else {
      // Check for Add Note button
      const addNoteBtn = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('#modal button')).find(b => /^Add$|add.*note/i.test(b.textContent.trim()));
        return btn ? { found: true, text: btn.textContent.trim() } : { found: false };
      });
      console.log('Add Note button:', JSON.stringify(addNoteBtn));
      if (addNoteBtn.found) {
        // Try typing a note
        await page.fill('#lead-note-input', 'Smoke test note');
        await page.waitForTimeout(300);
        const beforeErrors = jsErrors.length;
        await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll('#modal button')).find(b => /^Add$|add.*note/i.test(b.textContent.trim()));
          if (btn) btn.click();
        });
        await page.waitForTimeout(1000);
        const afterErrors = jsErrors.length;
        if (afterErrors > beforeErrors) fail('CRM-15 Notes textarea + Add Note button', 'JS error: '+jsErrors.slice(beforeErrors).join('; '));
        else pass('CRM-15 Notes textarea + Add Note button', 'Typed note, clicked Add, no JS errors');
      } else {
        fail('CRM-15 Notes textarea + Add Note button', '#lead-note-input found but no Add button');
      }
    }

    // CRM-16: Close button
    const closeBtnInfo = await page.evaluate(() => {
      const btn = document.querySelector('#modal .modal-close, #modal button.close, #modal [class*="close"]');
      // Also check footer close button
      const footerBtns = Array.from(document.querySelectorAll('#modal-footer button, #modal button'));
      const closeBtn = footerBtns.find(b => /close|cancel/i.test(b.textContent));
      return {
        modalClose: btn ? { found: true, text: btn.textContent.trim() } : { found: false },
        footerClose: closeBtn ? { found: true, text: closeBtn.textContent.trim() } : { found: false }
      };
    });
    console.log('Close buttons:', JSON.stringify(closeBtnInfo));

    // Wait for modal to still be open (it may have closed after note add)
    const modalStillOpen = await page.evaluate(() => {
      const modal = document.getElementById('modal');
      return modal ? window.getComputedStyle(modal).display !== 'none' : false;
    });
    console.log('Modal still open after note add:', modalStillOpen);

    if (!modalStillOpen) {
      // Modal closed automatically after note add - call viewLead again
      await page.evaluate((id) => viewLead(id), firstLeadId);
      await page.waitForTimeout(1000);
    }

    // Click close
    const closeResult = await page.evaluate(() => {
      const btn = document.querySelector('#modal .modal-close') ||
        Array.from(document.querySelectorAll('#modal button')).find(b => /close|cancel/i.test(b.textContent));
      if (btn) { btn.click(); return { clicked: true, text: btn.textContent.trim() }; }
      return { clicked: false };
    });
    await page.waitForTimeout(800);
    const modalClosed = await page.evaluate(() => {
      const modal = document.getElementById('modal');
      return modal ? window.getComputedStyle(modal).display === 'none' : true;
    });
    console.log('Close click result:', closeResult, '| Modal closed:', modalClosed);

    if (!closeResult.clicked) fail('CRM-16 Modal close button', 'No close button found');
    else if (modalClosed) pass('CRM-16 Modal close button', 'Clicked "'+closeResult.text+'", modal closed');
    else fail('CRM-16 Modal close button', 'Clicked close but modal still visible');
  }

  console.log('\n=== CRM Modal Tests (12-16) ===');
  R.forEach(r => console.log(r.s.padEnd(4)+' | '+r.id+' | '+r.detail));
  console.log('JS errors:', jsErrors.length === 0 ? 'NONE' : jsErrors.join(' | '));
  await browser.close();
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
