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

  // Make sure we're on CRM with no active filters
  await page.click('#n-crm');
  await page.waitForTimeout(1000);

  // Reset all filters first
  const stageEl = await page.$('#crm-stage-sel');
  if (stageEl) { await page.selectOption('#crm-stage-sel', ''); }
  const sourceEl = await page.$('#crm-source-sel');
  if (sourceEl) { await page.selectOption('#crm-source-sel', ''); }
  await page.waitForTimeout(500);

  const totalRows = await page.evaluate(() => document.querySelectorAll('tbody tr').length);
  console.log('Total rows after reset:', totalRows);

  // CRM-12: Click lead row - modal opens
  const firstRow = await page.$('tbody tr');
  if (!firstRow) {
    fail('CRM-12 Click lead row opens modal', 'No rows in table');
    fail('CRM-13 Modal stage dropdown', 'depends on CRM-12');
    fail('CRM-14 Modal assigned to field', 'depends on CRM-12');
    fail('CRM-15 Modal notes + add note button', 'depends on CRM-12');
    fail('CRM-16 Modal close button', 'depends on CRM-12');
  } else {
    await firstRow.click();
    await page.waitForTimeout(1500);

    const modalInfo = await page.evaluate(() => {
      const modal = document.querySelector('.modal, [class*="modal"], [id*="modal"], dialog, .overlay, .lead-modal');
      if (!modal) return { found: false };
      const style = window.getComputedStyle(modal);
      return {
        found: true,
        display: style.display,
        visibility: style.visibility,
        text: modal.textContent.replace(/\s+/g,' ').trim().substring(0,200)
      };
    });
    console.log('Modal info:', JSON.stringify(modalInfo));

    if (modalInfo.found && modalInfo.display !== 'none' && modalInfo.visibility !== 'hidden') {
      pass('CRM-12 Click lead row opens modal', modalInfo.text.substring(0,100));
    } else {
      fail('CRM-12 Click lead row opens modal', 'Modal not visible. found='+modalInfo.found+' display='+modalInfo.display);
    }

    // CRM-13: Modal stage dropdown
    const stageDropdownInfo = await page.evaluate(() => {
      const modal = document.querySelector('.modal, [class*="modal"], [id*="modal"], dialog, .overlay, .lead-modal');
      if (!modal) return null;
      const sel = modal.querySelector('select, [class*="stage"]');
      return sel ? { tag: sel.tagName, type: sel.type, options: sel.tagName === 'SELECT' ? Array.from(sel.options).map(o=>o.value).filter(v=>v) : [] } : null;
    });
    console.log('Modal stage dropdown:', JSON.stringify(stageDropdownInfo));

    // Check for any select in modal
    const modalSelects = await page.evaluate(() => {
      const modal = document.querySelector('.modal, [class*="modal"], [id*="modal"], dialog, .overlay, .lead-modal');
      if (!modal) return [];
      return Array.from(modal.querySelectorAll('select')).map(s => ({
        id: s.id, name: s.name, options: Array.from(s.options).map(o=>o.value)
      }));
    });
    console.log('Modal selects:', JSON.stringify(modalSelects));

    if (!modalSelects.length) fail('CRM-13 Modal stage dropdown', 'No select in modal');
    else {
      const stageSelect = modalSelects.find(s => /stage/i.test(s.id + s.name)) || modalSelects[0];
      const validOpts = stageSelect.options.filter(v => v);
      if (validOpts.length) {
        // Try changing stage
        const beforeErrors = jsErrors.length;
        await page.selectOption('#' + stageSelect.id || 'select', validOpts[0]);
        await page.waitForTimeout(600);
        const afterErrors = jsErrors.length;
        if (afterErrors > beforeErrors) fail('CRM-13 Modal stage dropdown', 'JS error on change: '+jsErrors[jsErrors.length-1]);
        else pass('CRM-13 Modal stage dropdown', 'Changed to "'+validOpts[0]+'" no errors');
      } else fail('CRM-13 Modal stage dropdown', 'No valid options');
    }

    // CRM-14: Assigned To field
    const assignedField = await page.evaluate(() => {
      const modal = document.querySelector('.modal, [class*="modal"], [id*="modal"], dialog, .overlay, .lead-modal');
      if (!modal) return null;
      const fields = Array.from(modal.querySelectorAll('input, select, textarea')).filter(el =>
        /assign/i.test(el.id + el.name + el.placeholder + el.className)
      );
      return fields.map(f => ({ tag: f.tagName, id: f.id, name: f.name, type: f.type }));
    });
    console.log('Assigned fields in modal:', JSON.stringify(assignedField));
    if (!assignedField || !assignedField.length) {
      // Maybe it's a select with assigned
      const allFields = await page.evaluate(() => {
        const modal = document.querySelector('.modal, [class*="modal"], [id*="modal"], dialog, .overlay, .lead-modal');
        if (!modal) return [];
        return Array.from(modal.querySelectorAll('input, select, textarea')).map(f => ({
          tag: f.tagName, id: f.id, name: f.name, type: f.type, placeholder: f.placeholder
        }));
      });
      console.log('All modal fields:', JSON.stringify(allFields));
      const hasAssigned = allFields.some(f => /assign|user|agent/i.test(f.id+f.name+f.placeholder));
      if (hasAssigned) pass('CRM-14 Modal assigned to field', 'Found assigned field');
      else skip('CRM-14 Modal assigned to field', 'No assigned field visible in modal');
    } else {
      pass('CRM-14 Modal assigned to field', JSON.stringify(assignedField[0]));
    }

    // CRM-15: Notes textarea + Add Note button
    const notesInfo = await page.evaluate(() => {
      const modal = document.querySelector('.modal, [class*="modal"], [id*="modal"], dialog, .overlay, .lead-modal');
      if (!modal) return { textarea: false, addBtn: false };
      const textarea = modal.querySelector('textarea');
      const addBtn = Array.from(modal.querySelectorAll('button, .btn')).find(b => /add.*note|note/i.test(b.textContent));
      return {
        textarea: !!textarea,
        textareaId: textarea?.id || 'no-id',
        addBtn: !!addBtn,
        addBtnText: addBtn?.textContent.trim() || ''
      };
    });
    console.log('Notes info:', JSON.stringify(notesInfo));
    if (notesInfo.textarea && notesInfo.addBtn) {
      pass('CRM-15 Notes textarea + Add Note button', 'textarea id='+notesInfo.textareaId+' btn="'+notesInfo.addBtnText+'"');
    } else if (notesInfo.textarea) {
      fail('CRM-15 Notes textarea + Add Note button', 'Textarea found but no Add Note button');
    } else {
      fail('CRM-15 Notes textarea + Add Note button', 'No textarea found in modal');
    }

    // CRM-16: Close button closes modal
    const closeBtn = await page.evaluate(() => {
      const modal = document.querySelector('.modal, [class*="modal"], [id*="modal"], dialog, .overlay, .lead-modal');
      if (!modal) return null;
      const btn = Array.from(modal.querySelectorAll('button, .btn, .close, [class*="close"]')).find(b =>
        /close|cancel|dismiss|✕|×|x/i.test(b.textContent.trim()) || /close/i.test(b.className)
      );
      return btn ? { found: true, text: btn.textContent.trim(), id: btn.id, cls: btn.className.substring(0,40) } : { found: false };
    });
    console.log('Close button:', JSON.stringify(closeBtn));
    if (!closeBtn || !closeBtn.found) {
      fail('CRM-16 Modal close button', 'No close button found');
    } else {
      // Click close
      await page.evaluate(() => {
        const modal = document.querySelector('.modal, [class*="modal"], [id*="modal"], dialog, .overlay, .lead-modal');
        if (!modal) return;
        const btns = Array.from(modal.querySelectorAll('button, .btn, .close, [class*="close"]'));
        const btn = btns.find(b => /close|cancel|dismiss|✕|×/i.test(b.textContent.trim()) || /close/i.test(b.className));
        if (btn) btn.click();
      });
      await page.waitForTimeout(800);
      const modalVisible = await page.evaluate(() => {
        const modal = document.querySelector('.modal, [class*="modal"], [id*="modal"], dialog, .overlay, .lead-modal');
        if (!modal) return false;
        const s = window.getComputedStyle(modal);
        return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
      });
      if (!modalVisible) pass('CRM-16 Modal close button', 'Modal closed successfully');
      else fail('CRM-16 Modal close button', 'Modal still visible after close click');
    }
  }

  // CRM-17: + Add Lead button
  await page.waitForTimeout(500);
  const addLeadBtn = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button, .btn, a')).find(b =>
      /add.*lead|\+.*lead|new.*lead/i.test(b.textContent)
    );
    return btn ? { found: true, text: btn.textContent.trim(), id: btn.id, cls: btn.className.substring(0,60) } : { found: false };
  });
  console.log('Add Lead button:', JSON.stringify(addLeadBtn));

  if (!addLeadBtn.found) {
    fail('CRM-17 Add Lead button opens modal', 'No Add Lead button found');
  } else {
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button, .btn, a')).find(b =>
        /add.*lead|\+.*lead|new.*lead/i.test(b.textContent)
      );
      if (btn) btn.click();
    });
    await page.waitForTimeout(1000);

    const addModalInfo = await page.evaluate(() => {
      const modals = document.querySelectorAll('.modal, [class*="modal"], [id*="modal"], dialog, .overlay');
      const visibleModal = Array.from(modals).find(m => {
        const s = window.getComputedStyle(m);
        return s.display !== 'none' && s.visibility !== 'hidden';
      });
      if (!visibleModal) return { found: false };
      const inputs = Array.from(visibleModal.querySelectorAll('input, textarea, select'));
      return {
        found: true,
        text: visibleModal.textContent.replace(/\s+/g,' ').trim().substring(0,150),
        inputCount: inputs.length,
        inputs: inputs.map(i => ({ tag: i.tagName, id: i.id, name: i.name, placeholder: i.placeholder })).slice(0,8)
      };
    });
    console.log('Add Lead modal:', JSON.stringify(addModalInfo, null, 2));

    if (!addModalInfo.found) {
      fail('CRM-17 Add Lead button opens modal', 'No modal appeared');
    } else {
      pass('CRM-17a Add Lead modal opens', addModalInfo.text.substring(0,80));

      // Fill name + phone and submit
      const nameInput = addModalInfo.inputs.find(i => /name/i.test(i.id+i.name+i.placeholder));
      const phoneInput = addModalInfo.inputs.find(i => /phone|tel|mobile/i.test(i.id+i.name+i.placeholder+i.type));

      console.log('Name input:', nameInput, '| Phone input:', phoneInput);

      if (nameInput) {
        const selector = nameInput.id ? '#'+nameInput.id : 'input[name="'+nameInput.name+'"]';
        await page.fill(selector, 'Smoke Test Lead');
      }
      if (phoneInput) {
        const selector = phoneInput.id ? '#'+phoneInput.id : 'input[name="'+phoneInput.name+'"]';
        await page.fill(selector, '+971501234567');
      }
      await page.waitForTimeout(300);

      // Find submit button
      const submitBtn = await page.evaluate(() => {
        const modals = document.querySelectorAll('.modal, [class*="modal"], [id*="modal"], dialog, .overlay');
        const visibleModal = Array.from(modals).find(m => {
          const s = window.getComputedStyle(m);
          return s.display !== 'none' && s.visibility !== 'hidden';
        });
        if (!visibleModal) return null;
        const btn = Array.from(visibleModal.querySelectorAll('button, input[type="submit"]')).find(b =>
          /submit|save|add|create/i.test(b.textContent + b.value)
        );
        return btn ? { id: btn.id, text: btn.textContent.trim() } : null;
      });
      console.log('Submit button:', JSON.stringify(submitBtn));

      if (submitBtn) {
        const beforeErrors = jsErrors.length;
        await page.evaluate(btnId => {
          if (btnId) {
            const btn = document.getElementById(btnId);
            if (btn) btn.click();
          } else {
            const modals = document.querySelectorAll('.modal, [class*="modal"], [id*="modal"], dialog, .overlay');
            const visibleModal = Array.from(modals).find(m => {
              const s = window.getComputedStyle(m);
              return s.display !== 'none' && s.visibility !== 'hidden';
            });
            if (!visibleModal) return;
            const btn = Array.from(visibleModal.querySelectorAll('button')).find(b =>
              /submit|save|add|create/i.test(b.textContent)
            );
            if (btn) btn.click();
          }
        }, submitBtn.id || null);
        await page.waitForTimeout(1500);
        const afterErrors = jsErrors.length;
        const newRows = await page.evaluate(() => document.querySelectorAll('tbody tr').length);
        if (afterErrors > beforeErrors) fail('CRM-17b Add Lead submit', 'JS error: '+jsErrors.slice(beforeErrors).join('; '));
        else pass('CRM-17b Add Lead submit', 'Submitted, rows now='+newRows);
      } else {
        skip('CRM-17b Add Lead submit', 'No submit button found in form');
        // Close modal
        await page.evaluate(() => {
          const modals = document.querySelectorAll('.modal, [class*="modal"], [id*="modal"], dialog, .overlay');
          const visibleModal = Array.from(modals).find(m => {
            const s = window.getComputedStyle(m);
            return s.display !== 'none' && s.visibility !== 'hidden';
          });
          if (!visibleModal) return;
          const btn = Array.from(visibleModal.querySelectorAll('button')).find(b => /close|cancel|✕/i.test(b.textContent));
          if (btn) btn.click();
        });
      }
    }
  }

  // CRM-18: Nav badge shows count
  const badgeInfo = await page.evaluate(() => {
    const badge = document.querySelector('#nb-crm');
    return badge ? { found: true, text: badge.textContent.trim(), display: window.getComputedStyle(badge).display } : { found: false };
  });
  console.log('CRM badge:', JSON.stringify(badgeInfo));
  if (!badgeInfo.found) fail('CRM-18 Nav badge shows count', 'No #nb-crm element');
  else {
    const count = parseInt(badgeInfo.text, 10);
    if (!isNaN(count) && count >= 0) pass('CRM-18 Nav badge shows count', 'Badge text="'+badgeInfo.text+'"');
    else fail('CRM-18 Nav badge shows count', 'Badge text="'+badgeInfo.text+'" is not a number');
  }

  console.log('\n=== CRM Tests 12-18 Results ===');
  R.forEach(r => console.log(r.s.padEnd(4)+' | '+r.id+' | '+r.detail));
  console.log('JS errors collected:', jsErrors.length === 0 ? 'NONE' : jsErrors.join(' | '));
  await browser.close();
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
