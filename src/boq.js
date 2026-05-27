// ─── BOQ SETUP ────────────────────────────────────────────────────

async function renderBOQ() {
  const [{data:contractsRaw},{data:bills,error:billsErr},{data:items,error:itemsErr}] = await Promise.all([
    sb.from('contracts').select('*').eq('project_id',currentProject.id).order('sort_order').order('created_at'),
    sb.from('boq_bills').select('*').eq('project_id',currentProject.id).order('sort_order').order('created_at'),
    sb.from('boq_items').select('*').order('sort_order').order('created_at')
  ]);
  if(billsErr||itemsErr) {
    document.getElementById('content').innerHTML = `<div class="empty-state" style="padding:48px;text-align:center;color:var(--red)">Failed to load BOQ: ${(billsErr||itemsErr).message}</div>`;
    return;
  }
  const contractList = contractsRaw||[];
  const allBills = bills||[];
  const allItems = items||[];

  // Auto-select first contract if needed
  if(!window._selectedContractId || !contractList.find(c=>c.id===window._selectedContractId)) {
    window._selectedContractId = contractList[0]?.id || null;
  }

  const selectedContract = contractList.find(c=>c.id===window._selectedContractId) || null;

  // Per-contract totals for tabs
  const contractTotals = {};
  contractList.forEach(c => {
    const cBillIds = new Set(allBills.filter(b=>b.contract_id===c.id).map(b=>b.id));
    contractTotals[c.id] = allItems.filter(i=>cBillIds.has(i.bill_id)).reduce((s,i)=>s+(+i.total||0),0);
  });

  // Bills + items for selected contract
  const billList = allBills
    .filter(b => window._selectedContractId ? b.contract_id===window._selectedContractId : !b.contract_id)
    .sort((a,b)=>(+a.bill_no||0)-(+b.bill_no||0)||a.bill_no.localeCompare(b.bill_no));
  const billIds = new Set(billList.map(b=>b.id));
  const itemList = allItems.filter(i=>billIds.has(i.bill_id));
  const grandTotal = itemList.reduce((s,i)=>s+(+i.total||0),0);
  const editMode = window._boqEditMode || false;

  const CONTRACT_TYPE_LABELS = {main:'Main Contract',enabling_works:'Enabling Works',specialist:'Specialist',other:'Other'};

  // Contract tabs
  const contractTabsHTML = `<div style="display:flex;align-items:center;gap:6px;margin-bottom:14px;flex-wrap:wrap">
    ${contractList.map(c=>`
      <button onclick="selectBOQContract('${c.id}')" style="padding:5px 14px;border-radius:6px;border:0.5px solid ${c.id===window._selectedContractId?'var(--sand)':'var(--border2)'};background:${c.id===window._selectedContractId?'var(--sand)':'var(--bg3)'};color:${c.id===window._selectedContractId?'#fff':'var(--charcoal)'};font-size:12px;font-family:inherit;cursor:pointer;font-weight:${c.id===window._selectedContractId?'600':'400'}">
        ${esc(c.name)}<span style="font-size:10px;opacity:.75;margin-left:5px">${fmtAED(contractTotals[c.id]||0)}</span>
      </button>`).join('')}
    ${can('manageRegister')?`<button onclick="openAddContract()" style="padding:5px 12px;border-radius:6px;border:0.5px dashed var(--border2);background:none;font-size:12px;font-family:inherit;cursor:pointer;color:var(--text2)">+ Contract</button>`:''}
  </div>`;

  const billBreakdown = billList.map(b => {
    const bt = itemList.filter(i=>i.bill_id===b.id).reduce((s,i)=>s+(+i.total||0),0);
    return {b, bt, pct: grandTotal ? bt/grandTotal*100 : 0};
  });

  const boqChipsHTML = billList.length ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
    <label style="font-size:11px;color:var(--text2);white-space:nowrap">Filter by Bill:</label>
    <select class="form-control" style="width:auto;max-width:280px;padding:4px 8px;font-size:12px" onchange="filtBOQ(this.value)">
      <option value="all">All Bills</option>
      ${billList.map(b=>`<option value="${b.id}">${esc(b.bill_no)}. ${esc(b.title)}</option>`).join('')}
    </select>
  </div>` : '';

  const billsHTML = billList.length ? billList.map(b=>{
    const bItems = itemList.filter(i=>i.bill_id===b.id);
    const billTotal = bItems.reduce((s,i)=>s+(+i.total||0),0);
    const itemsHTML = bItems.map(it=>{
      if(!editMode) {
        return `<tr data-id="${it.id}" data-bill-id="${b.id}">
          <td class="mono" style="width:80px">${esc(it.item_no)}</td>
          <td>${esc(it.description)}</td>
          <td style="text-align:right;width:70px">${(+it.qty).toLocaleString()}</td>
          <td style="width:60px;color:var(--text2)">${esc(it.unit)}</td>
          <td style="text-align:right;width:90px">${fmtAED(it.rate)}</td>
          <td style="text-align:right;width:110px;font-weight:500">${it.total>0?fmtAED(it.total):'<span style="color:var(--text3);font-size:10px">Rate only</span>'}</td>
        </tr>`;
      }
      return `<tr data-id="${it.id}" data-bill-id="${b.id}">
        <td><input class="form-control boq-edit" data-field="item_no" data-id="${it.id}" value="${esc(it.item_no)}" style="width:75px;padding:3px 5px;font-size:11px" /></td>
        <td><input class="form-control boq-edit" data-field="description" data-id="${it.id}" value="${esc(it.description)}" style="width:100%;padding:3px 5px;font-size:11px" /></td>
        <td><input type="number" class="form-control boq-edit" data-field="qty" data-id="${it.id}" value="${+it.qty}" style="width:65px;padding:3px 5px;font-size:11px;text-align:right" onchange="recalcBOQRow(this)" /></td>
        <td><input class="form-control boq-edit" data-field="unit" data-id="${it.id}" value="${esc(it.unit)}" style="width:55px;padding:3px 5px;font-size:11px" /></td>
        <td><input type="number" class="form-control boq-edit" data-field="rate" data-id="${it.id}" value="${+it.rate}" style="width:85px;padding:3px 5px;font-size:11px;text-align:right" onchange="recalcBOQRow(this)" /></td>
        <td style="text-align:right;width:110px;font-weight:500;font-variant-numeric:tabular-nums" data-total="${it.id}">${fmtAED(it.total)}</td>
        <td style="width:30px"><button class="btn btn-danger" style="padding:2px 6px;font-size:11px" onclick="deleteBOQItem('${it.id}')">&times;</button></td>
      </tr>`;
    }).join('');
    const addBtn = editMode ? `<tr data-bill-id="${b.id}"><td colspan="${7}"><button class="btn" style="font-size:11px;padding:3px 10px" onclick="addBOQItem('${b.id}')">+ Add Item</button></td></tr>` : '';
    return `
    <tr class="boq-bill-header" data-bill-id="${b.id}"><td colspan="${editMode?6:5}" style="padding:8px 14px">${esc(b.bill_no)}. ${esc(b.title)}</td><td style="text-align:right;padding:8px 14px">${fmtAED(billTotal)}</td></tr>
    ${itemsHTML}${addBtn}`;
  }).join('') : `<tr><td colspan="6" class="empty-state">${contractList.length?'No bills in this contract yet. Use Import Excel or Add Bill.':'No contracts yet. Click + Contract to create one.'}</td></tr>`;

  document.getElementById('content').innerHTML = `
  ${contractTabsHTML}
  ${selectedContract ? `<div style="font-size:11px;color:var(--text2);margin-bottom:12px;padding:8px 12px;background:var(--bg3);border-radius:6px;display:flex;gap:16px;flex-wrap:wrap">
    <span><strong>Contractor:</strong> ${esc(selectedContract.contractor||'—')}</span>
    <span><strong>Type:</strong> ${CONTRACT_TYPE_LABELS[selectedContract.contract_type]||selectedContract.contract_type}</span>
    ${selectedContract.award_date?`<span><strong>Awarded:</strong> ${new Date(selectedContract.award_date).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</span>`:''}
    <span><strong>Contract Value:</strong> ${fmtAED(selectedContract.contract_value)}</span>
  </div>` : ''}
  <div class="fbar" style="margin-bottom:14px">
    ${can('manageRegister') && window._selectedContractId ? '<button class="btn btn-primary" onclick="openImportBOQ()">Import Excel</button>' : ''}
    ${can('manageRegister') && billList.length ? `<button class="btn ${editMode?'btn-success':''}" onclick="toggleBOQEdit()" style="margin-left:6px">${editMode?'Save Changes':'Edit'}</button>` : ''}
    ${editMode ? '<button class="btn" onclick="openAddBill()" style="margin-left:6px">+ Add Bill</button>' : ''}
    ${can('manageRegister') && billList.length ? '<button class="btn btn-danger" onclick="replaceBOQ()" style="margin-left:6px">Replace Contract BOQ</button>' : ''}
    ${editMode ? '<button class="btn" onclick="cancelBOQEdit()" style="margin-left:6px">Cancel</button>' : ''}
  </div>
  ${billList.length ? `
  <div class="module-bar">
    <div class="module-stat" style="flex:1;min-width:180px">
      <div class="module-stat-val" style="font-size:16px;font-family:'SF Mono',Monaco,monospace;color:var(--sand)">${fmtAED(grandTotal)}</div>
      <div class="module-stat-label">Contract Sum</div>
    </div>
    <div class="module-stat"><div class="module-stat-val">${billList.length}</div><div class="module-stat-label">Bills</div></div>
    <div class="module-stat"><div class="module-stat-val">${itemList.length}</div><div class="module-stat-label">Line Items</div></div>
  </div>
  <div class="card" style="margin-bottom:14px">
    <div style="padding:14px 18px">
      <div style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">Bill Breakdown</div>
      ${billBreakdown.map(({b,bt,pct})=>`
      <div style="display:flex;align-items:center;gap:10px;padding:5px 0;border-bottom:0.5px solid var(--border)">
        <span style="font-size:12px;color:var(--text2);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(b.bill_no+'. '+b.title)}">${esc(b.bill_no)}. ${esc(b.title)}</span>
        <div style="width:120px;height:4px;background:var(--bg3);border-radius:2px;flex-shrink:0">
          <div style="width:${Math.min(pct,100).toFixed(1)}%;height:100%;background:var(--sand-light);border-radius:2px"></div>
        </div>
        <span style="font-variant-numeric:tabular-nums;font-size:11px;color:var(--charcoal);min-width:120px;text-align:right">${fmtAED(bt)}</span>
        <span style="font-size:10px;color:var(--text3);min-width:36px;text-align:right">${pct.toFixed(1)}%</span>
      </div>`).join('')}
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0 2px">
        <span style="font-size:12px;font-weight:600;flex:1">Contract Sum</span>
        <div style="width:120px;flex-shrink:0"></div>
        <span style="font-variant-numeric:tabular-nums;font-size:12px;font-weight:600;color:var(--charcoal);min-width:120px;text-align:right">${fmtAED(grandTotal)}</span>
        <span style="font-size:10px;color:var(--text3);min-width:36px;text-align:right">100%</span>
      </div>
    </div>
  </div>` : ''}
  ${boqChipsHTML}
  <div class="card"><div class="tw"><table>
    <tr><th>Item No.</th><th>Description</th><th style="text-align:right">Qty</th><th>Unit</th><th style="text-align:right">Rate (AED)</th><th style="text-align:right">Total (AED)</th>${editMode?'<th></th>':''}</tr>
    ${billsHTML}
    ${billList.length ? `<tr class="boq-grand-total"><td colspan="${editMode?6:5}" style="padding:10px 14px">CONTRACT SUM</td><td style="text-align:right;padding:10px 14px">${fmtAED(grandTotal)}</td></tr>` : ''}
  </table></div></div>`;
}

function selectBOQContract(id) {
  window._selectedContractId = id;
  window._boqEditMode = false;
  render();
}

function openAddContract() {
  openModal('New Contract', `
    <div class="form-group"><label class="form-label-dark">Contract Name</label>
      <input type="text" class="form-control" id="nc-name" placeholder="e.g. Main Contract" /></div>
    <div class="form-group"><label class="form-label-dark">Contractor</label>
      <input type="text" class="form-control" id="nc-contractor" placeholder="e.g. XYZ Contracting LLC" /></div>
    <div class="frow">
      <div class="form-group" style="flex:1"><label class="form-label-dark">Contract Type</label>
        <select class="form-control" id="nc-type">
          <option value="main">Main Contract</option>
          <option value="enabling_works">Enabling Works</option>
          <option value="specialist">Specialist</option>
          <option value="other">Other</option>
        </select></div>
      <div class="form-group" style="width:160px"><label class="form-label-dark">Award Date</label>
        <input type="date" class="form-control" id="nc-date" /></div>
    </div>
    <div class="form-group"><label class="form-label-dark">Contract Value (AED)</label>
      <input type="number" class="form-control" id="nc-value" placeholder="0" /></div>`,
    `<button class="btn btn-primary" onclick="doAddContract()">Create Contract</button>
     <button class="btn" onclick="closeModal()">Cancel</button>`);
}

async function doAddContract() {
  const name = document.getElementById('nc-name')?.value.trim();
  if(!name) { toast('Contract name required','error'); return; }
  const {data,error} = await sb.from('contracts').insert({
    project_id: currentProject.id,
    name,
    contractor: document.getElementById('nc-contractor')?.value.trim()||null,
    contract_type: document.getElementById('nc-type')?.value||'main',
    award_date: document.getElementById('nc-date')?.value||null,
    contract_value: +document.getElementById('nc-value')?.value||0,
    sort_order: 99
  }).select('id').single();
  if(error) { toast('Error: '+error.message,'error'); return; }
  window._selectedContractId = data.id;
  toast(`Contract "${name}" created`,'success');
  closeModal(); render();
}

function recalcBOQRow(input) {
  const tr = input.closest('tr');
  const inputs = tr.querySelectorAll('.boq-edit');
  let qty = 0, rate = 0;
  inputs.forEach(inp => {
    if(inp.dataset.field==='qty') qty = +inp.value||0;
    if(inp.dataset.field==='rate') rate = +inp.value||0;
  });
  const total = qty * rate;
  const totalCell = tr.querySelector(`[data-total="${input.dataset.id}"]`);
  if(totalCell) totalCell.textContent = fmtAED(total);
}

async function deleteBOQItem(id) {
  const ok = await confirmModal('Delete this BOQ item?');
  if(!ok) return;
  const {error} = await sb.from('boq_items').delete().eq('id',id);
  if(error) { toast('Error: '+error.message,'error'); return; }
  toast('Item deleted','success'); render();
}

async function savePendingBOQEdits() {
  const updates = [];
  document.querySelectorAll('tr[data-id]').forEach(tr => {
    const id = tr.dataset.id;
    if(!id) return;
    const inputs = tr.querySelectorAll('.boq-edit');
    if(!inputs.length) return;
    const fields = {};
    inputs.forEach(inp => {
      if(inp.dataset.field==='qty'||inp.dataset.field==='rate') fields[inp.dataset.field] = +inp.value||0;
      else fields[inp.dataset.field] = inp.value.trim();
    });
    if(fields.description && fields.item_no) {
      fields.total = (fields.qty||0) * (fields.rate||0);
      updates.push(sb.from('boq_items').update(fields).eq('id',id));
    }
  });
  if(updates.length) await Promise.allSettled(updates);
}

async function addBOQItem(billId) {
  const {data:bills} = await sb.from('boq_bills').select('*').eq('id',billId).single();
  if(!bills) { toast('Bill not found','error'); return; }
  const [{data:lastBillItem},{data:globalMax}] = await Promise.all([
    sb.from('boq_items').select('item_no').eq('bill_id',billId).order('sort_order',{ascending:false}).limit(1),
    sb.from('boq_items').select('sort_order').order('sort_order',{ascending:false}).limit(1)
  ]);
  let nextNo = '1';
  if(lastBillItem?.[0]?.item_no) {
    const m = lastBillItem[0].item_no.match(/^(\d+)$/);
    if(m) nextNo = String(parseInt(m[1])+1);
  }
  const nextSortOrder = ((globalMax?.[0]?.sort_order)??-1) + 1;
  await savePendingBOQEdits();
  const {error} = await sb.from('boq_items').insert({
    bill_id: billId, item_no: nextNo, description: 'New item', qty: 0, unit: 'Item', rate: 0, total: 0,
    sort_order: nextSortOrder
  });
  if(error) { toast('Error: '+error.message,'error'); return; }
  toast('Item added','success'); render();
}

async function toggleBOQEdit() {
  if(window._boqEditMode) {
    // Collect data FIRST (before DOM is destroyed by re-render)
    const rows = document.querySelectorAll('tr[data-id]');
    const updates = [];
    rows.forEach(tr => {
      const id = tr.dataset.id;
      if(!id) return;
      const inputs = tr.querySelectorAll('.boq-edit');
      if(!inputs.length) return;
      const fields = {};
      inputs.forEach(inp => {
        const field = inp.dataset.field;
        if(field==='qty'||field==='rate') fields[field] = +inp.value||0;
        else fields[field] = inp.value.trim();
      });
      if(fields.description && fields.item_no) {
        fields.total = (fields.qty||0) * (fields.rate||0);
        updates.push(sb.from('boq_items').update(fields).eq('id',id));
      }
    });
    // Exit edit mode immediately
    window._boqEditMode = false;
    render();
    // Save in parallel after UI re-renders
    const results = await Promise.allSettled(updates);
    const saved = results.filter(r => r.status==='fulfilled' && !r.value?.error).length;
    const failed = results.length - saved;
    if(failed) toast('Saved '+saved+', '+failed+' failed','warning');
    else if(saved) toast('Saved '+saved+' items','success');
  } else {
    window._boqEditMode = true;
    render();
  }
}

function cancelBOQEdit() {
  window._boqEditMode = false;
  render();
}

async function openImportBOQ() {
  openModal('Import BOQ from Excel', `
    <p style="font-size:12px;color:var(--text2);line-height:1.6">Upload an Excel file (.xlsx) with columns in this order:<br>
    <span class="mono" style="font-size:11px">Bill No | Bill Title | Item No | Description | Qty | Unit | Rate</span><br>
    One row per line item. Rows with the same Bill No are grouped under one bill.</p>
    <div class="form-group">
      <label class="form-label-dark">Excel File (.xlsx)</label>
      <input type="file" class="form-control" id="boq-file" accept=".xlsx,.xls" onchange="previewBOQ(this)" />
    </div>
    <div id="boq-preview"></div>`,
    `<button class="btn btn-primary" id="boq-import-btn" onclick="doImportBOQ()" style="display:none">Import</button>
     <button class="btn" onclick="closeModal()">Cancel</button>`);
}

function previewBOQ(input) {
  const file = input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, {type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
      const dataRows = rows.filter(r=>r[0]!==undefined && r[0]!=='');
      const isHeader = typeof dataRows[0]?.[0]==='string' && isNaN(dataRows[0]?.[0]);
      const data = isHeader ? dataRows.slice(1) : dataRows;
      // Validate minimum column count: bill_no, bill_title, item_no, description, qty, unit, rate = 7
      const shortRows = data.filter(r=>r.length < 7);
      if(shortRows.length > 0) {
        document.getElementById('boq-preview').textContent = `Column mismatch: ${shortRows.length} row(s) have fewer than 7 columns. Expected: Bill No, Bill Title, Item No, Description, Qty, Unit, Rate.`;
        return;
      }
      window._boqImportData = data;
      const previewRows = data.slice(0,10).map(r=>`<tr>
        <td class="mono">${esc(String(r[0]??''))}</td><td>${esc(String(r[1]??''))}</td><td class="mono">${esc(String(r[2]??''))}</td>
        <td>${esc(String(r[3]??''))}</td><td style="text-align:right">${esc(String(r[4]??''))}</td><td>${esc(String(r[5]??''))}</td>
        <td style="text-align:right">${(+r[6]||0).toLocaleString()}</td></tr>`).join('');
      const previewEl = document.getElementById('boq-preview');
      previewEl.innerHTML = `
        <p style="font-size:11px;color:var(--text3);margin-top:8px">Preview (first 10 rows of ${data.length} total):</p>
        <div class="tw" style="max-height:220px;overflow-y:auto;margin-top:6px"><table>
          <tr><th>Bill No</th><th>Bill Title</th><th>Item No</th><th>Description</th><th>Qty</th><th>Unit</th><th>Rate</th></tr>
          ${previewRows}
        </table></div>`;
      document.getElementById('boq-import-btn').style.display = '';
    } catch(err) {
      document.getElementById('boq-preview').textContent = 'Could not parse file: ' + err.message;
    }
  };
  reader.readAsArrayBuffer(file);
}

async function doImportBOQ() {
  const data = window._boqImportData;
  if(!data?.length) { toast('No data to import','error'); return; }
  const btn = document.getElementById('boq-import-btn');
  if(btn) btn.disabled = true;

  const billMap = {};
  data.forEach(r => {
    const billNo = String(r[0]||'').trim();
    const billTitle = String(r[1]||'').trim();
    if(billNo && !billMap[billNo]) billMap[billNo] = {
      bill_no:billNo, title:billTitle,
      project_id: currentProject.id,
      contract_id: window._selectedContractId||null,
      sort_order:Object.keys(billMap).length
    };
  });

  const {data:insertedBills, error:billErr} = await sb.from('boq_bills').insert(Object.values(billMap)).select('id,bill_no');
  if(billErr) { toast('Error inserting bills: '+billErr.message,'error'); if(btn) btn.disabled=false; return; }

  const billIdMap = {};
  (insertedBills||[]).forEach(b => billIdMap[b.bill_no] = b.id);

  // Guard: verify every bill_no in the data resolved to an ID
  const unresolvedBills = [...new Set(data.map(r=>String(r[0]||'').trim()))].filter(bn=>bn && !billIdMap[bn]);
  if(unresolvedBills.length) {
    toast(`Import failed — could not resolve bill IDs for: ${unresolvedBills.join(', ')}`, 'error');
    if(btn) btn.disabled=false; return;
  }

  const items = data.map((r,idx) => ({
    bill_id: billIdMap[String(r[0]||'').trim()],
    item_no: String(r[2]||'').trim(),
    description: String(r[3]||'').trim(),
    qty: +r[4]||0,
    unit: String(r[5]||'').trim(),
    rate: +r[6]||0,
    total: (+r[4]||0) * (+r[6]||0),
    sort_order: idx
  })).filter(i=>i.bill_id && i.item_no);

  if(!items.length) { toast('No valid items found to import — check Bill No and Item No columns','error'); if(btn) btn.disabled=false; return; }

  const {error:itemErr} = await sb.from('boq_items').insert(items);
  if(itemErr) { toast('Error inserting items: '+itemErr.message,'error'); if(btn) btn.disabled=false; return; }

  toast(`Imported ${Object.keys(billMap).length} bills, ${items.length} items`,'success');
  closeModal(); render();
}

async function replaceBOQ() {
  if(!window._selectedContractId) { toast('Select a contract first','error'); return; }
  const {count} = await sb.from('payment_certificates').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id);
  if(count > 0) { toast('Cannot replace BOQ — payment certificates exist against this project BOQ','error'); return; }
  const ok = await confirmModal('This will permanently delete all bills and items for this contract. This cannot be undone. Continue?');
  if(!ok) return;
  const {data:cBills} = await sb.from('boq_bills').select('id').eq('contract_id',window._selectedContractId);
  if(cBills?.length) {
    await sb.from('boq_items').delete().in('bill_id', cBills.map(b=>b.id));
    await sb.from('boq_bills').delete().eq('contract_id',window._selectedContractId);
  }
  toast('Contract BOQ cleared — ready for re-import','success');
  openImportBOQ();
}

function openAddBill() {
  openModal('Add New Bill', `
    <div class="frow">
      <div class="form-group" style="width:100px">
        <label class="form-label-dark">Bill No.</label>
        <input type="text" class="form-control" id="new-bill-no" placeholder="e.g. 3" />
      </div>
      <div class="form-group" style="flex:1">
        <label class="form-label-dark">Bill Title</label>
        <input type="text" class="form-control" id="new-bill-title" placeholder="e.g. Superstructure" />
      </div>
    </div>`,
    `<button class="btn btn-primary" onclick="doAddBill()">Add Bill</button>
     <button class="btn" onclick="closeModal()">Cancel</button>`);
}

async function doAddBill() {
  const billNo = document.getElementById('new-bill-no').value.trim();
  const title  = document.getElementById('new-bill-title').value.trim();
  if(!billNo || !title) { toast('Bill No. and Title are required','error'); return; }
  const {data:existing} = await sb.from('boq_bills').select('sort_order').order('sort_order',{ascending:false}).limit(1);
  const sortOrder = ((existing?.[0]?.sort_order)??-1) + 1;
  const {error} = await sb.from('boq_bills').insert({project_id:currentProject.id, contract_id:window._selectedContractId||null, bill_no:billNo, title, sort_order:sortOrder});
  if(error) { toast('Error adding bill: '+error.message,'error'); return; }
  await savePendingBOQEdits();
  toast(`Bill ${billNo} added`,'success'); closeModal(); render();
}

