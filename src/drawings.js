let drawFilters = {disc:'All', status:'All', cde:'All', poi:'All'};
let selectedDrawings = new Set();
let selectedSubmittals = new Set();
let selectedIRs = new Set();
let selectedNCRs = new Set();
let selectedRFIs = new Set();
let selectedTransmittals = new Set();
let selectedCorrespondence = new Set();
let selectedMS = new Set();
let selectedPunch = new Set();
let navFilter = null;

async function logAudit(document_id, document_type, action) {
  const {error} = await sb.from('document_audit_log').insert({
    document_id,
    document_type,
    action,
    performed_by_name: currentProfile?.full_name || currentUser?.email || 'Unknown',
    performed_by_id: currentUser?.id,
  });
  if(error) { console.error('[audit_log] insert failed:', document_type, action, error); return false; }
  return true;
}
function filtDraw(field, val) {
  drawFilters[field] = val;
  document.querySelectorAll('.draw-row').forEach(r=>{
    const discOk = drawFilters.disc==='All'||(r.dataset.disc||'')=== drawFilters.disc;
    const statOk = drawFilters.status==='All'||(r.dataset.status||'')=== drawFilters.status;
    const cdeOk  = drawFilters.cde==='All'||(r.dataset.cde||'WIP')=== drawFilters.cde;
    const poiOk  = drawFilters.poi==='All'||(r.dataset.poi||'')=== drawFilters.poi;
    const visible = discOk&&statOk&&cdeOk&&poiOk;
    r.style.display=visible?'':'none';
    if(!visible&&r.dataset.id) {
      selectedDrawings.delete(r.dataset.id);
      const cb = document.getElementById('dcb-'+r.dataset.id);
      if(cb) cb.checked=false;
    }
  });
  updateDrawBulkBar();
}

function filt(page, field, val) {
  if(!_pageFilters[page]) _pageFilters[page] = {};
  _pageFilters[page][field] = val;
  const rowClass = {sub:'.sub-row',ir:'.ir-row',ncr:'.ncr-row',rfi:'.rfi-row',ms:'.ms-row',trans:'.trans-row',corr:'.corr-row',punch:'.punch-row',sreg:'.sreg-row'}[page];
  const fs = _pageFilters[page];
  document.querySelectorAll(rowClass).forEach(r=>{
    let vis = true;
    for(const [f,v] of Object.entries(fs)){
      if(!v||v==='All') continue;
      if(v==='Overdue'){if(r.dataset.overdue!=='1'){vis=false;break;}continue;}
      if((r.dataset[f]||'')!==v){vis=false;break;}
    }
    r.style.display=vis?'':'none';
  });
}
// FIX 1: Search respects active filter state without coupling to it.
// srch-hide is toggled purely on text match; filter visibility (style.display)
// is owned exclusively by filt()/filtDraw(). CSS combines both:
// a row is hidden if it has srch-hide OR style.display:none.
// Previously, searchReg read style.display to copy filter state into srch-hide,
// causing rows to remain permanently hidden after the filter was later cleared.
function searchReg(page, q) {
  q = q.trim().toLowerCase();
  const cls = {draw:'.draw-row',sub:'.sub-row',ir:'.ir-row',ncr:'.ncr-row',rfi:'.rfi-row',trans:'.trans-row',corr:'.corr-row',punch:'.punch-row',ms:'.ms-row'}[page];
  if(!cls) return;
  const rows = document.querySelectorAll(cls);
  rows.forEach(r=>{
    // Toggle srch-hide based solely on whether the row matches the search text.
    // Do NOT read or write style.display here — that is the filter's responsibility.
    r.classList.toggle('srch-hide', q !== '' && !(r.dataset.search||'').includes(q));
  });
  // Count rows visible under BOTH search and filter for the empty-state row.
  const vis = [...rows].filter(r=>!r.classList.contains('srch-hide') && r.style.display!=='none').length;
  const el=document.getElementById('srch-empty-'+page);
  if(el){el.style.display=(vis===0&&q)?'':'none';if(vis===0&&q)el.querySelector('td').textContent=`No results for "${q}"`;}
}
function filtBOQ(billId) {
  document.querySelectorAll('#content [data-bill-id]').forEach(r=>{
    r.style.display = billId==='all' || r.dataset.billId===billId ? '' : 'none';
  });
}
function filtIPC(billId) {
  document.querySelectorAll('.modal-body [data-bill-id]').forEach(r=>{
    r.style.display = billId==='all' || r.dataset.billId===billId ? '' : 'none';
  });
}

// ─── BULK DRAWING IMPORT ───────────────────────────────────────────
function openBulkImport() {
  openModal('Bulk Drawing Import', `
    <div style="display:flex;flex-direction:column;gap:14px">
      <div style="background:var(--bg3);border:.5px solid var(--border2);border-radius:var(--radius);padding:12px 14px">
        <div style="font-size:12px;font-weight:500;color:var(--color-text-primary);margin-bottom:6px">Step 1 — Download the CSV template</div>
        <div style="font-size:11px;color:var(--text2);margin-bottom:10px">Fill in drawing details for all drawings you want to register. Leave file_path blank — you can upload PDFs after import.</div>
        <button class="btn" style="font-size:11px" onclick="downloadBulkTemplate()">Download CSV Template</button>
      </div>
      <div style="background:var(--bg3);border:.5px solid var(--border2);border-radius:var(--radius);padding:12px 14px">
        <div style="font-size:12px;font-weight:500;color:var(--color-text-primary);margin-bottom:6px">Step 2 — Upload completed CSV</div>
        <div style="font-size:11px;color:var(--text2);margin-bottom:10px">Required columns: drawing_no, title, discipline, revision, status. Optional: description, uploaded_by.</div>
        <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--bg2);border:.5px solid var(--border2);border-radius:var(--radius);cursor:pointer" onclick="document.getElementById('bulk-csv').click()" ondragover="event.preventDefault();this.style.borderColor='var(--blue)'" ondragleave="this.style.borderColor='var(--border2)'" ondrop="event.preventDefault();this.style.borderColor='var(--border2)';handleBulkDrop(event)">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="flex-shrink:0"><path d="M8 2v8M5 5l3-3 3 3" stroke="var(--text2)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 11v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="var(--text2)" stroke-width="1.3" stroke-linecap="round"/></svg>
          <span style="font-size:12px;color:var(--text2)">Click to select CSV file or drag & drop</span>
        </div>
        <input type="file" id="bulk-csv" accept=".csv" style="display:none" onchange="parseBulkCSV(event)" />
      </div>
      <div id="bulk-preview" style="display:none">
        <div style="font-size:12px;font-weight:500;color:var(--color-text-primary);margin-bottom:8px" id="bulk-preview-label"></div>
        <div class="tw" style="overflow-x:auto;border:.5px solid var(--border);border-radius:var(--radius)">
          <table style="width:100%;border-collapse:collapse;font-size:11px" id="bulk-preview-table"></table>
        </div>
        <div id="bulk-errors" style="margin-top:8px;font-size:11px;color:var(--color-text-danger)"></div>
      </div>
    </div>`,
    `<button class="btn btn-primary" id="bulk-submit-btn" style="display:none" onclick="doBulkImport()">Import Drawings</button>
     <button class="btn" onclick="closeModal()">Cancel</button>`);
}

function downloadBulkTemplate() {
  const headers = ['drawing_no','title','discipline','revision','status','description','uploaded_by'];
  const examples = [
    ['DWG-A-001','Ground Floor Plan – Architecture','Architecture','Rev A','Under Review','Ground floor architectural plan','POE'],
    ['DWG-S-001','Foundation Detail – Grid A','Structure','Rev A','Under Review','Structural foundation detail','POE'],
    ['DWG-M-001','HVAC Layout – Level 3','MEP','Rev A','Under Review','Mechanical ventilation layout','MEP Consultant'],
    ['DWG-E-001','Electrical Single Line Diagram','MEP','Rev A','Under Review','Main electrical distribution','MEP Consultant'],
    ['DWG-P-001','Plumbing Isometric – Core 1','MEP','Rev A','Under Review','Plumbing riser diagram','MEP Consultant'],
  ];
  const csvContent = [headers, ...examples].map(r=>r.map(v=>`"${v}"`).join(',')).join('\n');
  const blob = new Blob([csvContent], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'GolfGrove_Drawing_Register_Template.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  toast('Template downloaded','success');
}

let bulkRows = [];

function handleBulkDrop(event) {
  const file = event.dataTransfer.files[0];
  if(file) parseBulkCSV({target:{files:[file]}});
}

// FIX 3: Robust state-machine CSV line parser.
// The previous regex (/(".*?"|[^,]+)(?=,|$)/g) had two failure modes:
//   1. Commas inside quoted strings (e.g. "Concrete, Grade C40") shifted all
//      subsequent columns, silently corrupting quantities, rates, and status fields.
//   2. Empty fields between consecutive commas were dropped entirely, also
//      shifting subsequent columns.
// This parser processes one character at a time, respecting RFC 4180 quoting
// rules including doubled-quote escaping (""). It correctly handles:
//   - Commas within quoted fields
//   - Empty fields (consecutive commas)
//   - Escaped quotes ("")
//   - Leading/trailing spaces stripped from unquoted fields
function parseCSVLine(line) {
  const fields = [];
  let i = 0;
  while(i <= line.length) {
    if(i === line.length) { fields.push(''); break; }
    if(line[i] === '"') {
      // Quoted field: consume until closing unescaped quote
      let field = '';
      i++; // skip opening quote
      while(i < line.length) {
        if(line[i] === '"') {
          if(line[i+1] === '"') { field += '"'; i += 2; } // escaped ""
          else { i++; break; } // closing quote
        } else {
          field += line[i++];
        }
      }
      fields.push(field);
      if(line[i] === ',') i++; // skip delimiter after closing quote
    } else {
      // Unquoted field: read until next comma or end of line
      const end = line.indexOf(',', i);
      if(end === -1) {
        fields.push(line.slice(i).trim());
        break;
      } else {
        fields.push(line.slice(i, end).trim());
        i = end + 1;
      }
    }
  }
  return fields;
}

function parseBulkCSV(event) {
  const file = event.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const lines = text.split(/\r?\n/).filter(l=>l.trim());
    if(lines.length < 2) { toast('CSV must have a header row and at least one data row','error'); return; }
    // Use parseCSVLine for header row too so quoted column names work correctly
    const headers = parseCSVLine(lines[0]).map(h=>h.toLowerCase());
    const reqFields = ['drawing_no','title','discipline'];
    const missing = reqFields.filter(f=>!headers.includes(f));
    if(missing.length) { toast('Missing required columns: '+missing.join(', '),'error'); return; }
    bulkRows = [];
    const errors = [];
    for(let i=1;i<lines.length;i++) {
      // Use the quote-aware parser; values are already stripped of outer quotes
      const vals = parseCSVLine(lines[i]);
      const row = {};
      headers.forEach((h,j)=>{ row[h]=(vals[j]||'').trim(); });
      if(!row.drawing_no){errors.push(`Row ${i+1}: drawing_no is required`);continue;}
      if(!row.title){errors.push(`Row ${i+1}: title is required`);continue;}
      row.revision = row.revision||'Rev A';
      row.status = row.status||'Under Review';
      bulkRows.push(row);
    }
    // Show preview
    const preview = document.getElementById('bulk-preview');
    const label = document.getElementById('bulk-preview-label');
    const table = document.getElementById('bulk-preview-table');
    const errDiv = document.getElementById('bulk-errors');
    const btn = document.getElementById('bulk-submit-btn');
    preview.style.display='';
    label.textContent = `${bulkRows.length} drawing${bulkRows.length!==1?'s':''} ready to import${errors.length?' — '+errors.length+' rows skipped due to errors':''}`;
    table.innerHTML = `<tr style="background:var(--bg3)">${['Drawing No.','Title','Discipline','Revision','Status','Uploaded By'].map(h=>`<th style="padding:7px 10px;font-size:10px;text-align:left;border-bottom:.5px solid var(--border);white-space:nowrap">${h}</th>`).join('')}</tr>`
      + bulkRows.slice(0,10).map(r=>`<tr style="border-bottom:.5px solid var(--border)">${[r.drawing_no,r.title,r.discipline,r.revision,r.status,r.uploaded_by||'—'].map(v=>`<td style="padding:7px 10px;font-size:11px;white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis">${v}</td>`).join('')}</tr>`).join('')
      + (bulkRows.length>10?`<tr><td colspan="6" style="padding:7px 10px;font-size:11px;color:var(--color-text-tertiary)">…and ${bulkRows.length-10} more rows</td></tr>`:'');
    errDiv.innerHTML = errors.map(e=>`<div>⚠ ${e}</div>`).join('');
    if(btn) btn.style.display = bulkRows.length?'':'none';
  };
  reader.readAsText(file);
}

async function doBulkImport() {
  if(!bulkRows.length){toast('No rows to import','error');return;}
  const btn = document.getElementById('bulk-submit-btn');
  if(btn){btn.disabled=true;btn.textContent='Importing…';}
  // Validate all rows first, collect valid ones
  const validRows = [];
  let failed = 0;
  for(const row of bulkRows) {
    const numCheck = validateDrawingNumber(row.drawing_no);
    if(!numCheck.valid){
      failed++;
      console.error('Import skipped:', row.drawing_no, numCheck.msg);
      continue;
    }
    validRows.push({
      drawing_no:row.drawing_no,
      title:row.title,
      discipline:row.discipline,
      revision:row.revision||'Rev A',
      status:row.status||'Under Review',
      description:row.description||null,
      uploaded_by:row.uploaded_by||currentProfile?.full_name||'Import',
    });
  }
  // Batch insert all valid rows in a single call, selecting back IDs
  let imported = 0;
  if(validRows.length) {
    const {data:inserted, error} = await sb.from('drawings').insert(validRows).select('id,revision,status');
    if(error){
      failed += validRows.length;
      console.error('Batch import error:', error.message);
    } else {
      imported = inserted.length;
      // Create initial drawing_revisions entries for each imported drawing
      const name = currentProfile?.full_name||currentUser?.email||'Import';
      const revRows = (inserted||[]).map(d=>({
        drawing_id:d.id,
        revision:d.revision,
        status:d.status,
        uploaded_by_name:name,
        uploaded_by_id:currentUser?.id||null,
      }));
      if(revRows.length) {
        const {error:revErr} = await sb.from('drawing_revisions').insert(revRows);
        if(revErr){
          console.error('[bulk import] revision history insert failed:', revErr.message);
          // Rollback: delete orphaned drawing rows
          const ids = inserted.map(d=>d.id);
          await sb.from('drawings').delete().in('id', ids);
          toast('Revision history insert failed — imported drawings rolled back','error');
          if(btn){btn.disabled=false;btn.textContent='Import Drawings';}
          render();
          return;
        }
      }
    }
  }
  if(btn){btn.disabled=false;btn.textContent='Import Drawings';}
  toast(`Imported ${imported} drawing${imported!==1?'s':''}${failed?' — '+failed+' failed':''}`, imported?'success':'error');
  if(imported>0){bulkRows=[];closeModal();render();}
}


// ─── BULK SELECTION ───────────────────────────────────────────────
function toggleDrawSelect(id, cb) {
  if(cb.checked) selectedDrawings.add(id); else selectedDrawings.delete(id);
  updateDrawBulkBar();
}
function toggleSubSelect(id, cb) {
  if(cb.checked) selectedSubmittals.add(id); else selectedSubmittals.delete(id);
  updateSubBulkBar();
}
function selectAllDrawings(cb) {
  document.querySelectorAll('.draw-row').forEach(r=>{
    if(r.style.display==='none') return;
    const rowCb = document.getElementById('dcb-'+r.dataset.id);
    if(rowCb&&!rowCb.disabled){rowCb.checked=cb.checked; if(cb.checked) selectedDrawings.add(r.dataset.id); else selectedDrawings.delete(r.dataset.id);}
  });
  updateDrawBulkBar();
}
function selectAllSubmittals(cb) {
  document.querySelectorAll('.sub-row').forEach(r=>{
    if(r.style.display==='none') return;
    const rowCb = document.getElementById('scb-'+r.dataset.id);
    if(rowCb&&!rowCb.disabled){rowCb.checked=cb.checked; if(cb.checked) selectedSubmittals.add(r.dataset.id); else selectedSubmittals.delete(r.dataset.id);}
  });
  updateSubBulkBar();
}
function updateDrawBulkBar() {
  const n = selectedDrawings.size;
  const bar = document.getElementById('bulk-bar-draw');
  const cnt = document.getElementById('draw-sel-count');
  if(!bar) return;
  if(cnt) cnt.textContent = n+' selected';
  bar.style.transform = n>0?'translateY(0)':'translateY(100%)';
  const sa = document.getElementById('draw-select-all');
  if(sa){
    const visible = [...document.querySelectorAll('.draw-row')].filter(r=>r.style.display!=='none'&&!document.getElementById('dcb-'+r.dataset.id)?.disabled);
    sa.indeterminate = n>0&&n<visible.length;
    sa.checked = n>0&&n>=visible.length;
  }
}
function updateSubBulkBar() {
  const n = selectedSubmittals.size;
  const bar = document.getElementById('bulk-bar-sub');
  const cnt = document.getElementById('sub-sel-count');
  if(!bar) return;
  if(cnt) cnt.textContent = n+' selected';
  bar.style.transform = n>0?'translateY(0)':'translateY(100%)';
  const sa = document.getElementById('sub-select-all');
  if(sa){
    const visible = [...document.querySelectorAll('.sub-row')].filter(r=>r.style.display!=='none'&&!document.getElementById('scb-'+r.dataset.id)?.disabled);
    sa.indeterminate = n>0&&n<visible.length;
    sa.checked = n>0&&n>=visible.length;
  }
}
function clearDrawSelection() {
  selectedDrawings.clear();
  document.querySelectorAll('.draw-row input.row-cb').forEach(cb=>cb.checked=false);
  const sa = document.getElementById('draw-select-all'); if(sa){sa.checked=false;sa.indeterminate=false;}
  updateDrawBulkBar();
}
function clearSubSelection() {
  selectedSubmittals.clear();
  document.querySelectorAll('.sub-row input.row-cb').forEach(cb=>cb.checked=false);
  const sa = document.getElementById('sub-select-all'); if(sa){sa.checked=false;sa.indeterminate=false;}
  updateSubBulkBar();
}
function batchDrawAction(action) {
  const ids = [...selectedDrawings];
  if(!ids.length) return;
  const labels = {approve:'Approve',advanceCDE:'Advance CDE',export:'Export',delete:'Delete'};
  const isDanger = action==='delete';
  const bodyHtml = isDanger
    ? `<p style="font-size:14px;color:var(--text)">Permanently delete <strong>${ids.length}</strong> selected drawing${ids.length!==1?'s':''}? This cannot be undone.</p>`
    : `<p style="font-size:14px;color:var(--text)">Apply <strong>${labels[action]||action}</strong> to <strong>${ids.length}</strong> selected drawing${ids.length!==1?'s':''}?</p>`;
  openModal(`Confirm Bulk Action`, bodyHtml,
    `<button class="btn ${isDanger?'btn-danger':'btn-success'}" onclick="closeModal();doBatchDrawAction('${action}')">${isDanger?'Delete':'Confirm'}</button>
     <button class="btn" onclick="closeModal()">Cancel</button>`);
}
function batchSubAction(action) {
  const ids = [...selectedSubmittals];
  if(!ids.length) return;
  const labels = {review:'Mark Reviewed',transmit:'Transmit'};
  const bodyHtml = `<p style="font-size:14px;color:var(--text)">Apply <strong>${labels[action]||action}</strong> to <strong>${ids.length}</strong> selected submittal${ids.length!==1?'s':''}?</p>`;
  openModal(`Confirm Bulk Action`, bodyHtml,
    `<button class="btn btn-success" onclick="closeModal();doBatchSubAction('${action}')">Confirm</button>
     <button class="btn" onclick="closeModal()">Cancel</button>`);
}
async function doBatchDrawAction(action) {
  const ids = [...selectedDrawings];
  if(action==='export') {
    toast(`Exported ${ids.length} drawing${ids.length!==1?'s':''}`, 'success');
    clearDrawSelection();
    return;
  }
  if(action==='delete') {
    // Delete revisions first — FK drawing_revisions.drawing_id → drawings.id
    const {error: revErr} = await sb.from('drawing_revisions').delete().in('drawing_id', ids);
    if(revErr){toast('Bulk delete failed (revisions): '+revErr.message,'error');return;}
    const {error} = await sb.from('drawings').delete().in('id', ids);
    if(error){toast('Bulk delete failed: '+error.message,'error');return;}
    await logAudit(ids[0], 'drawing', `Bulk delete — ${ids.length} drawing${ids.length!==1?'s':''} removed`);
    toast(`Deleted ${ids.length} drawing${ids.length!==1?'s':''}`, 'success');
    clearDrawSelection();
    renderDrawings();
    return;
  }
  if(action==='approve') {
    const {error} = await sb.from('drawings').update({status:'Approved'}).in('id', ids);
    if(error){toast('Batch approve failed: '+error.message,'error');return;}
    const user = (await sb.auth.getUser()).data?.user;
    if(!user){toast('Session expired — please refresh','error');return;}
    const name = user?.user_metadata?.full_name||user?.email||'Unknown';
    await sb.from('document_audit_log').insert(ids.map(id=>({document_id:id,document_type:'drawing',action:'Approved (bulk)',performed_by_name:name,performed_by_id:user.id})));
    toast(`Approved ${ids.length} drawing${ids.length!==1?'s':''}`, 'success');
  }
  if(action==='advanceCDE') {
    const cdeOrder = ['WIP','Shared','Published','Archived'];
    const role = currentProfile?.role;
    const allowedTransitions = {
      'WIP':       ['contractor','developer'],
      'Shared':    ['consultant','developer'],
      'Published': ['developer'],
    };
    const {data:draws} = await sb.from('drawings').select('id,cde_state').eq('project_id',currentProject.id).in('id', ids);
    const updates = (draws||[]).map(d=>{
      const idx = cdeOrder.indexOf(d.cde_state||'WIP');
      const next = idx>=0&&idx<cdeOrder.length-1?cdeOrder[idx+1]:d.cde_state;
      // Role gate
      if(!allowedTransitions[d.cde_state]?.includes(role)){
        console.warn('[batch CDE] skipped', d.id, d.cde_state, '→', next, '— role', role, 'not permitted');
        return null;
      }
      return {id:d.id, cde_state:next};
    }).filter(Boolean);
    let failed=0;
    for(const u of updates){
      const {error}=await sb.from('drawings').update({cde_state:u.cde_state}).eq('id',u.id);
      if(error) failed++;
      else await logAudit(u.id, 'drawing', 'CDE State Change → '+u.cde_state+' (bulk)');
    }
    const skipped = (draws||[]).length - updates.length;
    const msg = `CDE advanced for ${updates.length} drawing${updates.length!==1?'s':''}${failed?' — '+failed+' error(s)':''}${skipped?' — '+skipped+' skipped (no permission)':''}`;
    const toastType = failed?'error':updates.length?'success':'info';
    toast(msg, toastType);
  }
  clearDrawSelection();
  renderDrawings();
}
async function doBatchSubAction(action) {
  const ids = [...selectedSubmittals];
  if(action==='transmit') {
    toast(`Transmittal created for ${ids.length} submittal${ids.length!==1?'s':''}`, 'success');
    clearSubSelection();
    return;
  }
  if(action==='review') {
    const role = currentProfile?.role;
    if(role !== 'consultant' && role !== 'developer') {
      toast('Only consultants and developers can bulk-approve submittals','error'); return;
    }
    const {error} = await sb.from('submittals').update({status:'Approved',outcome:'1'}).in('id', ids);
    if(error){toast('Batch review failed: '+error.message,'error');return;}
    const user = (await sb.auth.getUser()).data?.user;
    if(!user){toast('Session expired — please refresh','error');return;}
    const name = user?.user_metadata?.full_name||user?.email||'Unknown';
    const {error:auditErr} = await sb.from('document_audit_log').insert(ids.map(id=>({document_id:id,document_type:'submittal',action:'Submittal Reviewed: Code 1 \u2013 Approved (bulk)',performed_by_name:name,performed_by_id:user.id})));
    if(auditErr) {
      await sb.from('submittals').update({status:'Pending Review',outcome:null}).in('id', ids);
      toast('Batch approval reverted — audit log failed. Please try again.','error'); return;
    }
    toast(`Marked ${ids.length} submittal${ids.length!==1?'s':''} as Approved`, 'success');
  }
  clearSubSelection();
  renderSubmittals();
}

// ─── DRAWINGS ─────────────────────────────────────────────────────
async function renderDrawings() {
  selectedDrawings = new Set();
  const {data} = await sb.from('drawings').select('*').eq('project_id',currentProject.id).order('drawing_no',{ascending:true});
  const rows = data||[];
  const total = rows.length;
  const published = rows.filter(r=>r.cde_state==='Published').length;
  const underReview = rows.filter(r=>r.status==='Under Review').length;
  const wip = rows.filter(r=>r.cde_state==='WIP').length;
  document.getElementById('content').innerHTML = `
  <div class="module-bar">
    <div class="module-stat"><div class="module-stat-val">${total}</div><div class="module-stat-label">Total</div></div>
    <div class="module-stat"><div class="module-stat-val">${published}</div><div class="module-stat-label">Published</div></div>
    <div class="module-stat"><div class="module-stat-val">${underReview}</div><div class="module-stat-label">Under Review</div></div>
    <div class="module-stat"><div class="module-stat-val">${wip}</div><div class="module-stat-label">WIP</div></div>
  </div>
  <div class="fbar" style="margin-bottom:12px">
    <select class="filter-sel" onchange="filtDraw('disc',this.value)">
      <option value="All">All Disciplines</option>
      <option>Architecture</option><option>Structure</option><option>MEP</option><option>Civil</option><option>General</option><option>Interior Design</option>
    </select>
    <select class="filter-sel" onchange="filtDraw('status',this.value)">
      <option value="All">All Statuses</option>
      <option>Under Review</option><option>Approved</option><option>Issued for Construction</option><option>Revise &amp; Resubmit</option>
    </select>
    <select class="filter-sel" onchange="filtDraw('cde',this.value)">
      <option value="All">All CDE States</option>
      <option>WIP</option><option>Shared</option><option>Published</option><option>Archived</option><option>Superseded</option>
    </select>
    <select class="filter-sel" onchange="filtDraw('poi',this.value)">
      <option value="All">All POI</option>
      <option>S0</option><option>S1</option><option>S2</option><option>S3</option><option>S4</option><option>S5</option>
    </select>
    <input type="text" class="reg-search" style="margin-left:auto" placeholder="Search drawings..." oninput="searchReg('draw',this.value)" />
    <button class="btn btn-sm" onclick="exportDrawingRegister()">Export Register</button>
    ${can('upload')?`<button class="btn btn-sm" style="font-size:11px" onclick="openBulkImport()">Bulk Import</button>`:''}
  </div>
  <div class="card"><div class="tw"><table>
    <tr>
      <th style="width:32px;text-align:center"><input type="checkbox" id="draw-select-all" onchange="selectAllDrawings(this)" /></th>
      <th>Drawing No.</th><th>Title</th><th>Discipline</th><th>Rev</th><th>CDE State</th><th>Review Status</th><th>Actions</th>
    </tr>
    ${rows.length?rows.map(d=>`<tr class="draw-row" data-disc="${d.discipline||''}" data-status="${d.status||''}" data-cde="${d.cde_state||'WIP'}" data-poi="${d.poi_code||''}" data-id="${d.id}" data-search="${[d.drawing_no,d.title,d.discipline,d.originator].filter(Boolean).join(' ').replace(/"/g,' ').toLowerCase()}">
      <td style="text-align:center"><input type="checkbox" class="row-cb" id="dcb-${d.id}" ${d.cde_state==='Superseded'||d.status==='Void'?'disabled':''} onchange="toggleDrawSelect('${d.id}',this)" /></td>
      <td class="mono" style="${d.cde_state==='Superseded'||d.status==='Void'?'opacity:.5;text-decoration:line-through':''}">${d.drawing_no}</td>
      <td style="color:var(--blue);cursor:pointer;${d.cde_state==='Superseded'||d.status==='Void'?'opacity:.5':''}" onclick="viewDraw('${d.id}')">${d.title}${d.cde_state==='Superseded'?'<span style="font-size:9px;color:var(--text3);margin-left:6px">superseded</span>':''}${d.status==='Void'?'<span style="font-size:9px;color:var(--red);margin-left:6px">void</span>':''}</td>
      <td style="color:var(--text2);font-size:11px">${d.discipline||'—'}</td>
      <td><span class="rev-chip">${d.revision||'Rev A'}</span></td>
      <td>${cdeBadge(d.cde_state||'WIP')}</td>
      <td>${sbadge(d.status)}</td>
      <td><div style="display:flex;gap:4px">
        <button class="btn btn-sm" onclick="viewDraw('${d.id}')">View</button>
        ${can('upload')&&d.status!=='Void'?`<button class="btn btn-sm" onclick="uploadRev('${d.id}')">New Rev</button>`:''}
        ${can('approve')&&d.status==='Under Review'?`<button class="btn btn-sm btn-success" onclick="viewDraw('${d.id}')">Review</button>`:''}
        ${can('approve')&&d.status!=='Void'?`<button class="btn btn-sm btn-danger" onclick="voidDrawing('${d.id}',${JSON.stringify(d.drawing_no)})">Void</button>`:''}
      </div></td>
    </tr>`).join(''):'<tr><td colspan="8" class="empty-state">No drawings yet. Upload the first one.</td></tr>'}
    <tr id="srch-empty-draw" style="display:none"><td colspan="8" class="empty-state"></td></tr>
  </table>
  <div class="record-footer">Showing ${rows.length} record${rows.length!==1?'s':''}</div>
  </div></div>
  <div id="bulk-bar-draw" class="bulk-bar">
    <div class="bulk-bar-inner">
      <span id="draw-sel-count" class="bulk-bar-count">0 selected</span>
      ${can('approve')?`<button class="btn btn-sm btn-success" onclick="batchDrawAction('approve')">Approve Selected</button>`:''}
      ${can('approve')?`<button class="btn btn-sm" onclick="batchDrawAction('advanceCDE')">Advance CDE</button>`:''}
      <button class="btn btn-sm" onclick="batchDrawAction('export')">Export Selected</button>
      ${can('delete_drawing')?`<button class="btn btn-sm btn-danger" onclick="batchDrawAction('delete')">Delete Selected</button>`:''}
      <button class="btn btn-sm" style="margin-left:auto" onclick="clearDrawSelection()">Clear</button>
    </div>
  </div>`;
}

function updateDocNum() {
  const orig  = (document.getElementById('nd-orig')?.value||'——').toUpperCase();
  const zone  = (document.getElementById('nd-zone')?.value||'——').toUpperCase();
  const level = (document.getElementById('nd-level')?.value||'——').toUpperCase();
  const type  = document.getElementById('nd-type')?.value||'DR';
  const role  = (document.getElementById('nd-role')?.value||'——').toUpperCase();
  const seq   = (document.getElementById('nd-num')?.value||'——').padStart(4,'0');
  const rev   = (document.getElementById('nd-rev')?.value||'RevA').replace(/\s/g,'');
  const el = document.getElementById('nd-preview');
  if(el) el.textContent = `GG-${orig}-${zone}-${level}-${type}-${role}-${seq}-${rev}`;
}

async function advanceCDE(id, newState) {
  const transitions = {
    'WIP':       {to:['Shared'],    roles:['contractor','developer']},
    'Shared':    {to:['Published'],  roles:['consultant','developer']},
    'Published': {to:['Archived'],   roles:['developer']},
  };
  const role = currentProfile?.role;

  // Fetch drawing to get current state
  const {data:drawings, error:fetchErr} = await sb.from('drawings').select('cde_state,drawing_no').eq('id', id).maybeSingle();
  if(fetchErr||!drawings){toast('Drawing not found or already deleted','error');return;}
  const currentState = drawings.cde_state;

  // Validate transition exists
  const rule = transitions[currentState];
  if(!rule||!rule.to.includes(newState)){toast('Invalid CDE transition','error');return;}

  // Role gate
  if(!rule.roles.includes(role)){
    toast('Insufficient permissions to advance '+currentState+' \u2192 '+newState,'error');
    return;
  }

  const stateLabels = {
    'Shared':    'Share this drawing with the consultant for review?',
    'Published': 'Publish this drawing as approved and ready for use on site?',
    'Archived':  'Archive this drawing? It will be marked as superseded.',
  };
  const label = stateLabels[newState]||'Advance to '+newState+'?';
  if(!await confirmModal(label)) return;
  const {error} = await sb.from('drawings').update({cde_state: newState}).eq('id', id);
  if(error){toast('Error: '+error.message,'error');return;}
  const audited = await logAudit(id, 'drawing', 'CDE State Change \u2192 ' + newState);
  if(!audited) {
    await sb.from('drawings').update({cde_state: currentState}).eq('id', id);
    toast('State change reverted — audit log failed. Please try again.','error');
    return;
  }
  toast('Document advanced to ' + newState, 'success');
  closeModal();
  renderDrawings();
}

// ─── SUBMITTALS ───────────────────────────────────────────────────
async function renderSubmittals() {
  selectedSubmittals = new Set();
  const {data} = await sb.from('submittals').select('*').eq('project_id',currentProject.id).order('created_at',{ascending:false});
  const rows = data||[];
  const today = new Date().toISOString().split('T')[0];
  const open = rows.filter(r=>r.status==='Pending Review').length;
  const overdue = rows.filter(r=>r.due_date&&r.due_date<today&&r.status==='Pending Review').length;
  const approved = rows.filter(r=>r.status==='Approved'||r.outcome==='1'||r.outcome==='2').length;
  const thisWeek = rows.filter(r=>{const d=new Date(r.created_at);const now=new Date();return (now-d)<7*86400000;}).length;
  // Get register count for required vs submitted
  const {count:regCount} = await sb.from('submittal_register').select('*',{count:'exact',head:true});
  const subOverdueFilter = navFilter==='overdue'; navFilter=null;
  document.getElementById('content').innerHTML = `
  <div class="module-bar">
    <div class="module-stat"><div class="module-stat-val ${open>0?'warn':''}">${open}</div><div class="module-stat-label">Pending Review</div></div>
    <div class="module-stat"><div class="module-stat-val ${overdue>0?'danger':''}">${overdue}</div><div class="module-stat-label">Overdue</div></div>
    <div class="module-stat"><div class="module-stat-val">${approved}</div><div class="module-stat-label">Approved</div></div>
    <div class="module-stat"><div class="module-stat-val">${thisWeek}</div><div class="module-stat-label">This Week</div></div>
    ${regCount?`<div class="module-stat"><div class="module-stat-val">${rows.length}<span style="font-size:14px;color:var(--text3)">/${regCount}</span></div><div class="module-stat-label">vs Register</div></div>`:''}
  </div>
  <div class="fbar">
    <select class="filter-sel" onchange="filt('sub','status',this.value)" id="sub-status-sel">
      <option value="All">All Statuses</option>
      <option>Pending Review</option><option>Approved</option><option>Revise &amp; Resubmit</option><option>Rejected</option><option value="Overdue">Overdue</option>
    </select>
    <input type="text" class="reg-search" style="margin-left:auto" placeholder="Search submittals..." oninput="searchReg('sub',this.value)" />
  </div>
  <div class="card"><div class="tw"><table>
    <tr><th style="width:32px"><input type="checkbox" id="sub-select-all" onchange="selectAllSubmittals(this)" /></th><th>Ref No.</th><th>Title</th><th>From</th><th>Date</th><th>Due</th><th>Status</th><th>Outcome</th><th>Rev</th><th>Actions</th></tr>
    ${rows.length?rows.map(s=>{
      const isOverdue = s.due_date&&s.due_date<today&&s.status==='Pending Review';
      const isSoon = !isOverdue&&s.due_date&&s.status==='Pending Review'&&(new Date(s.due_date)-new Date(today))<=3*86400000;
      const nonSelectable = s.status==='Approved'||s.status==='Rejected';
      return `<tr class="sub-row" data-id="${s.id}" data-status="${s.status}" data-overdue="${isOverdue?'1':'0'}" data-search="${[s.ref_no,s.title,s.from_party,s.to_party].filter(Boolean).join(' ').replace(/"/g,' ').toLowerCase()}" style="${isOverdue?'background:var(--red-bg);border-left:2px solid var(--red)':isSoon?'border-left:2px solid var(--amber)':''}">
        <td><input type="checkbox" class="row-cb" id="scb-${s.id}" ${nonSelectable?'disabled':''} onchange="toggleSubSelect('${s.id}',this)" /></td>
        <td class="mono">${s.ref_no}${s.parent_id?'<span style="font-size:9px;color:var(--amber);margin-left:4px">↻</span>':''}</td>
        <td style="color:var(--blue);cursor:pointer" onclick="viewSub('${s.id}')">${s.title}</td>
        <td style="color:var(--text2)">${s.from_party||'—'}</td>
        <td style="color:var(--text3);font-size:10px">${s.submit_date||'—'}</td>
        <td>${overdueTag(s.due_date)}</td>
        <td>${sbadge(s.status)}</td>
        <td style="font-size:11px;font-weight:500;color:var(--charcoal)">${s.outcome?`(${s.outcome})`:'-'}</td>
        <td><span class="rev-chip">${s.revision||'1'}</span></td>
        <td><div style="display:flex;gap:4px">
          <button class="btn btn-sm" onclick="viewSub('${s.id}')">View</button>
          ${can('approve')&&s.status==='Pending Review'?`<button class="btn btn-sm btn-success" onclick="reviewSub('${s.id}')">Review</button>`:''}
          ${!can('approve')&&s.status==='Revise & Resubmit'?`<button class="btn btn-sm" onclick="resubmitSub('${s.id}')">Resubmit</button>`:''}
        </div></td>
      </tr>`;
    }).join(''):'<tr><td colspan="10" class="empty-state">No submittals yet.</td></tr>'}
    <tr id="srch-empty-sub" style="display:none"><td colspan="10" class="empty-state"></td></tr>
  </table>
  <div class="record-footer">Showing ${rows.length} record${rows.length!==1?'s':''}</div>
  </div></div>
  <div id="bulk-bar-sub" class="bulk-bar">
    <div class="bulk-bar-inner">
      <span id="sub-sel-count" class="bulk-bar-count">0 selected</span>
      ${can('approve')?`<button class="btn btn-sm btn-success" onclick="batchSubAction('review')">Mark Reviewed</button>`:''}
      <button class="btn btn-sm" onclick="batchSubAction('transmit')">Transmit Selected</button>
      ${currentProfile?.role==='developer'?`<button class="btn btn-sm btn-danger" onclick="bulkDelete('submittals',selectedSubmittals,'sub','bulk-bar-sub','sub-sel-count')">Delete Selected</button>`:''}
      <button class="btn btn-sm" style="margin-left:auto" onclick="clearSubSelection()">Clear</button>
    </div>
  </div>`;
  if(subOverdueFilter) {
    const sel = document.getElementById('sub-status-sel');
    if(sel) { sel.value='Overdue'; filt('sub','status','Overdue'); }
  }
}

async function deleteDraw(id, drawingNo) {
  const ok = await confirmModal(`Permanently delete drawing <strong>${drawingNo}</strong> and all its revision history? This cannot be undone.`);
  if(!ok) return;
  const {data:revs} = await sb.from('drawing_revisions').select('file_path').eq('drawing_id',id);
  const {data:draw} = await sb.from('drawings').select('file_path').eq('id',id).single();
  // Delete revision storage files
  if(revs?.length) {
    const paths = revs.map(r=>r.file_path).filter(Boolean);
    if(paths.length) await sb.storage.from('drawings').remove(paths);
  }
  // Delete drawing storage file if not already covered by revisions
  if(draw?.file_path && !revs?.some(r=>r.file_path===draw.file_path)) {
    await sb.storage.from('drawings').remove([draw.file_path]);
  }
  await sb.from('drawing_revisions').delete().eq('drawing_id',id);
  const {error} = await sb.from('drawings').delete().eq('id',id);
  if(error){toast('Delete failed — '+error.message,'error');return;}
  toast(`Drawing ${drawingNo} deleted`,'success');
  closeModal(); render();
}

// ─── VIEW MODALS ──────────────────────────────────────────────────
async function viewDraw(id) {
  const [{data:d},{data:revs},atts] = await Promise.all([
    sb.from('drawings').select('*').eq('id',id).single(),
    sb.from('drawing_revisions').select('*').eq('drawing_id',id).order('upload_date',{ascending:true}),
    loadAttachments('drawing',id)
  ]);
  if(!d) return;
  let pdfHtml = '';
  let pdfUrl = null;
  if(d.file_path) {
    const {data:urlData} = await sb.storage.from('drawings').createSignedUrl(d.file_path, 3600);
    if(urlData?.signedUrl) {
      pdfUrl = urlData.signedUrl;
      pdfHtml = `<div class="detail-section"><div class="detail-label" style="margin-bottom:8px">Drawing File</div>
        <div class="pdf-viewer" id="pdfv-${id}">
          <div class="pdf-toolbar">
            <button onclick="pdfPrevPage('${id}')" id="pdf-prev-${id}">◀ Prev</button>
            <span class="pdf-page-info" id="pdf-pageinfo-${id}">— / —</span>
            <button onclick="pdfNextPage('${id}')" id="pdf-next-${id}">Next ▶</button>
            <span style="width:1px;background:#555;height:16px;margin:0 4px"></span>
            <button onclick="pdfZoomOut('${id}')">− Zoom</button>
            <span class="pdf-zoom-info" id="pdf-zoom-${id}">100%</span>
            <button onclick="pdfZoomIn('${id}')">+ Zoom</button>
            <button onclick="pdfFitWidth('${id}')">Fit Width</button>
            <button onclick="pdfFitPage('${id}')">Fit Page</button>
            <span style="width:1px;background:#555;height:16px;margin:0 4px"></span>
            <button onclick="window.open('${urlData.signedUrl}','_blank')">Open in Tab</button>
            <span class="pdf-title">${d.drawing_no} – ${d.title} (${d.revision})</span>
          </div>
          <div class="pdf-canvas-wrap" id="pdf-wrap-${id}">
            <div class="pdf-loading" id="pdf-loading-${id}">
              <div style="width:24px;height:24px;border:2px solid #555;border-top-color:#aaa;border-radius:50%;animation:spin 1s linear infinite"></div>
              <span>Loading PDF…</span>
            </div>
          </div>
        </div></div>`;
    }
  }
  const revRows = revs||[];
  const revTableHTML = revRows.length ? `
    <div class="detail-section">
      <div class="detail-label" style="margin-bottom:10px">Full Revision History & Audit Trail</div>
      <div class="tw" style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <tr style="background:var(--bg3)">
            <th style="text-align:left;padding:7px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text3);border-bottom:1px solid var(--border);white-space:nowrap">Revision</th>
            <th style="text-align:left;padding:7px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text3);border-bottom:1px solid var(--border);white-space:nowrap">Status</th>
            <th style="text-align:left;padding:7px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text3);border-bottom:1px solid var(--border);white-space:nowrap">Uploaded By</th>
            <th style="text-align:left;padding:7px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text3);border-bottom:1px solid var(--border);white-space:nowrap">Upload Date</th>
            <th style="text-align:left;padding:7px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text3);border-bottom:1px solid var(--border);white-space:nowrap">Approved By</th>
            <th style="text-align:left;padding:7px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text3);border-bottom:1px solid var(--border);white-space:nowrap">Approval Date</th>
            <th style="text-align:left;padding:7px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text3);border-bottom:1px solid var(--border);white-space:nowrap">Review Comments</th>
            <th style="text-align:left;padding:7px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text3);border-bottom:1px solid var(--border);white-space:nowrap">File</th>
          </tr>
          ${revRows.map((r,i)=>{
            const isCurrent = i===revRows.length-1;
            const bg = isCurrent?'background:var(--blue-bg)':'';
            const uploadDate = r.upload_date?new Date(r.upload_date).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):'—';
            const approvalDate = r.approval_date?new Date(r.approval_date).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):'—';
            return `<tr style="${bg};border-bottom:1px solid var(--border)">
              <td style="padding:7px 10px">
                <div style="display:flex;align-items:center;gap:6px">
                  <span class="rev-chip" style="${isCurrent?'background:var(--blue-bg);color:var(--blue-light);border-color:var(--blue)':''}">${r.revision}</span>
                  ${isCurrent?'<span style="font-size:9px;color:var(--blue-light)">Current</span>':'<span style="font-size:9px;color:var(--text3)">Superseded</span>'}
                </div>
              </td>
              <td style="padding:7px 10px">${sbadge(r.status||'—')}</td>
              <td style="padding:7px 10px">
                <div style="font-weight:500;color:var(--text)">${r.uploaded_by_name||'—'}</div>
              </td>
              <td style="padding:7px 10px;color:var(--text2)">${uploadDate}</td>
              <td style="padding:7px 10px">
                ${r.approved_by_name?`<div style="font-weight:500;color:var(--green-light)">${r.approved_by_name}</div>`:'<span style="color:var(--text3)">—</span>'}
              </td>
              <td style="padding:7px 10px;color:var(--text2)">${r.approved_by_name?approvalDate:'—'}</td>
              <td style="padding:7px 10px;font-size:11px;color:var(--text2);max-width:200px">${r.review_comments||'<span style="color:var(--text3)">—</span>'}</td>
              <td style="padding:7px 10px">${(()=>{
                const fp = r.file_path||(isCurrent?d.file_path:null);
                if(!fp) return '<span style="color:var(--text3);font-size:10px">—</span>';
                if(isCurrent) return `<button class="btn btn-sm" onclick="viewRevisionPDF('${fp}','${r.revision}',false)">View</button>`;
                const currentRev = revRows[revRows.length-1].revision;
                return `<span style="display:flex;align-items:center;gap:5px"><span style="font-size:10px;color:var(--text3);text-decoration:line-through">${r.revision}</span><button class="btn btn-sm" style="opacity:.65;border-color:var(--amber,#b45309);color:var(--amber,#b45309)" onclick="viewRevisionPDF('${fp}','${r.revision}',true,'${currentRev}')">View</button></span>`;
              })()}</td>
            </tr>`;
          }).join('')}
        </table>
      </div>
    </div>` : `<div class="detail-section"><div class="detail-label" style="margin-bottom:8px">Revision History</div>
      <div style="font-size:11px;color:var(--text3);padding:8px">No revision history yet — history is tracked from this update onwards.</div></div>`;
    const {data:_relSubs} = await sb.from('submittals').select('ref_no,title,status').eq('related_drawing',d.drawing_no);
  const _relSubsHTML = _relSubs&&_relSubs.length?`<div class="detail-section"><div class="detail-label" style="margin-bottom:6px">Linked Submittals</div>${_relSubs.map(s=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:var(--bg3);border-radius:4px;margin-bottom:4px;border:.5px solid var(--border)"><div><span style="font-size:11px;font-weight:500;color:var(--blue-light)">${s.ref_no}</span><span style="font-size:11px;color:var(--text2);margin-left:8px">${s.title}</span></div>${sbadge(s.status)}</div>`).join('')}</div>`:'';
  openModal(`${d.drawing_no} – ${d.title}`, `
    ${d.cde_state==='Superseded'?`<div class="superseded-banner">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="flex-shrink:0"><path d="M8 2L14 13H2L8 2z" stroke="#854F0B" stroke-width="1.3" stroke-linejoin="round"/><line x1="8" y1="7" x2="8" y2="10" stroke="#854F0B" stroke-width="1.3" stroke-linecap="round"/><circle cx="8" cy="11.5" r=".6" fill="#854F0B"/></svg>
      This drawing has been superseded. A newer revision is current. Do not use on site.
    </div>`:''}
    <div style="margin-bottom:14px">
      <div class="detail-label" style="margin-bottom:6px">CDE Lifecycle</div>
      ${cdeStepperHTML(d.cde_state||'WIP', d.id)}
    </div>
    <div class="detail-grid">
      <div class="detail-item"><div class="detail-label">Discipline</div><div class="detail-value">${d.discipline||'—'}</div></div>
      <div class="detail-item"><div class="detail-label">Current Revision</div><div class="detail-value"><span class="rev-chip">${d.revision}</span></div></div>
      <div class="detail-item"><div class="detail-label">Review Status</div><div class="detail-value">${sbadge(d.status)}</div></div>
      <div class="detail-item"><div class="detail-label">CDE State</div><div class="detail-value">${cdeBadge(d.cde_state||'WIP')}</div></div>
      <div class="detail-item"><div class="detail-label">Originator</div><div class="detail-value">${d.originator||'—'}</div></div>
      <div class="detail-item"><div class="detail-label">Zone / Level</div><div class="detail-value">${[d.zone,d.level].filter(Boolean).join(' / ')||'—'}</div></div>
      <div class="detail-item"><div class="detail-label">Type</div><div class="detail-value">${d.doc_type||'—'}</div></div>
      <div class="detail-item"><div class="detail-label">Purpose of Issue</div><div class="detail-value">${d.poi_code?poiBadge(d.poi_code):'—'}</div></div>
      <div class="detail-item"><div class="detail-label">AR / FI</div><div class="detail-value">${d.arfi?`<span class="arfi-${(d.arfi||'').toLowerCase()}">${d.arfi}</span>`:'—'}</div></div>
      <div class="detail-item"><div class="detail-label">Uploaded</div><div class="detail-value">${d.created_at?d.created_at.split('T')[0]:'—'}</div></div>
    </div>
    ${d.status==='Void'?'<div class="void-banner"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="flex-shrink:0"><circle cx="8" cy="8" r="6" stroke="#A32D2D" stroke-width="1.3"/><line x1="5" y1="5" x2="11" y2="11" stroke="#A32D2D" stroke-width="1.3"/></svg> This drawing has been voided and is no longer applicable. Do not use for construction.</div>':''}
    ${_relSubsHTML}
    ${revTableHTML}
    ${pdfHtml}`,
    `${can('upload')&&d.status!=='Void'?`<button class="btn btn-primary" onclick="uploadRev('${id}')">Upload New Revision</button>`:''}
     ${can('approve')&&d.status==='Under Review'?`<button class="btn btn-success" onclick="approveDrawing('${id}')">Approve</button>`:''}
     ${can('approve')&&d.status!=='Void'?`<button class="btn" onclick="voidDrawing('${id}','${d.drawing_no}')">Void Drawing</button>`:''}
     ${d.cde_state==='Superseded'?'<span style="font-size:11px;color:var(--amber);padding:0 8px">⚠ Superseded — download with caution</span>':''}
     <button class="btn" onclick="linkDrawings('${id}','${d.drawing_no}')">Link Drawings</button>
     ${currentProfile?.role==='developer'?`<button class="btn btn-danger" onclick="deleteDraw('${id}','${d.drawing_no}')">Delete Drawing</button>`:''}
     <button class="btn" onclick="closeModal()">Close</button>`, true);
  if(pdfUrl) setTimeout(()=>initPdfViewer(id, pdfUrl, `${d.drawing_no} – ${d.title} (${d.revision})`), 200);
}

async function viewSub(id) {
  const [{data:s},comments,atts] = await Promise.all([
    sb.from('submittals').select('*').eq('id',id).single(),
    loadComments('submittal',id),
    loadAttachments('submittal',id)
  ]);
  if(!s) return;
  // Load parent if this is a resubmission
  let parentInfo = '';
  if(s.parent_id) {
    const {data:parent} = await sb.from('submittals').select('ref_no,title,outcome,status').eq('id',s.parent_id).single();
    if(parent) parentInfo = `<div style="background:var(--bg3);border-radius:6px;padding:8px 12px;font-size:11px;color:var(--text2);margin-bottom:4px">Resubmission of: <span style="color:var(--text);font-weight:500">${parent.ref_no} – ${parent.title}</span> (${parent.outcome?'Code '+parent.outcome:parent.status})</div>`;
  }
  const att = typeof s.attachments==='object'?s.attachments:{};
  const disc = typeof s.discipline==='object'?s.discipline:{};
  function cb(v){return `<span class="dsub-cb ${v?'dsub-checked':''}"></span>`;}
  const dsub = `<div class="dsub-preview">
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;border:1px solid #ccc;margin-bottom:8px">
      <div style="padding:8px;border-right:1px solid #ccc;font-size:13px;font-weight:700;color:#00008B">POE<br><span style="font-size:9px;font-weight:400;color:#000">ENGINEERING CONSULTANTS</span></div>
      <div style="padding:8px;border-right:1px solid #ccc;text-align:center;font-size:18px;font-style:italic;color:#00008B">regent<br><span style="font-size:9px;font-weight:400;color:#000">DEVELOPMENTS</span></div>
      <div style="padding:6px;text-align:right;font-size:9px">${PROJECT.contractor}<br>Tel.: 04-2344445</div>
    </div>
    <div class="tw"><table><tr><td colspan="4" style="text-align:center;font-weight:700;font-size:12px;text-decoration:underline;color:#00008B">DOCUMENT SUBMITTAL APPROVAL REQUEST (DSUB)</td></tr>
    <tr><td style="font-weight:700;width:22%">Reference No.:</td><td style="color:#8B0000;font-weight:700" colspan="2">${s.ref_no}</td><td style="text-align:right"><b>Date:</b> <span style="color:#8B0000;font-weight:700">${s.submit_date||''}</span></td></tr>
    <tr><td style="font-weight:700">Project Description:</td><td colspan="3">${PROJECT.name}</td></tr>
    <tr><td style="font-weight:700">Client's Name:</td><td colspan="3" style="font-weight:700">${PROJECT.client}</td></tr>
    <tr><td style="font-weight:700">Plot No:</td><td colspan="3">${PROJECT.plot}</td></tr>
    <tr><td style="font-weight:700">Location:</td><td colspan="3" style="font-weight:700;text-transform:uppercase">${PROJECT.location.toUpperCase()}, DUBAI, UAE</td></tr>
    <tr><td style="font-weight:700">Consultant:</td><td colspan="3" style="font-weight:700;text-transform:uppercase">${PROJECT.consultant.toUpperCase()}</td></tr>
    <tr><td style="font-weight:700">Contractor:</td><td colspan="3" style="font-weight:700;text-transform:uppercase">${PROJECT.contractor.toUpperCase()}</td></tr>
    <tr><td style="font-weight:700">TO: ${s.to_party||'POE'}</td><td colspan="3" style="font-weight:700">FROM: &nbsp;&nbsp; ${s.from_party||'MBC'}</td></tr>
    <tr><td colspan="4" style="font-weight:700">DESCRIPTION:</td></tr>
    <tr><td style="font-weight:700">Title:</td><td colspan="3">${s.title}</td></tr>
    <tr><td colspan="2" style="padding:6px"><b>Attachments:</b><br>
      ${cb(att.samples)} Samples &nbsp; ${cb(att.brochure)} Original Brochure<br>
      ${cb(att.drawings)} Drawings &nbsp; ${cb(att.sketches)} Sketches<br>
      ${cb(att.others)} Others: ${att.othersText||''}
    </td><td colspan="2" style="padding:6px"><b>Discipline:</b><br>
      ${cb(disc.civil)} Civil/Structural &nbsp; ${cb(disc.mech)} Mechanical &nbsp; ${cb(disc.elv)} ELV/IT<br>
      ${cb(disc.specs)} Specification &nbsp; ${cb(disc.arch)} Architectural &nbsp; ${cb(disc.elec)} Electrical<br>
      ${cb(disc.others)} Others: ${disc.othersText||''}
    </td></tr>
    <tr><td colspan="4" style="font-weight:700;background:#f5f5f5">Engineer's Comments and Recommendations:</td></tr>
    <tr><td colspan="4" style="font-size:10px;color:#555">(Please continue in a separate sheet if necessary).</td></tr>
    <tr><td colspan="4" style="padding:12px;min-height:80px;color:${s.eng_comments?'#00008B':'#ccc'}">${s.eng_comments||'—'}</td></tr>
    <tr><td colspan="2" style="padding:8px">${cb(s.outcome==='1')} (1) – Approved. Work may proceed</td>
        <td colspan="2" style="padding:8px">${cb(s.outcome==='2')} (2) – Approved With Comments. Work may proceed subject to incorporation of comments indicated.</td></tr>
    <tr><td colspan="2" style="padding:8px">${cb(s.outcome==='3')} (3) - Revise and resubmit. Work may not proceed</td>
        <td colspan="2" style="padding:8px">${cb(s.outcome==='4')} (4) - Review not Required. Work may proceed</td></tr>
    <tr><td colspan="2" style="padding:8px;color:#00008B;font-size:12px">${s.reviewed_by?`Eng : ${s.reviewed_by}`:''}</td>
        <td colspan="2" style="padding:8px;text-align:right;font-weight:700">Resident Engineer &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Date</td></tr>
    </table></div><div style="margin-top:8px;font-size:9px;color:#888">POE/SUP-DSAR-004 Rev 002 | Issue date: 01/10/2018</div></div>`;
  const dsubWrapped = `<div id='dsub-print-${id}'>${parentInfo}${dsub}</div>`;
  openModal(`DSUB – ${s.ref_no}`, dsubWrapped+attachmentSectionHTML('submittal',id,atts)+commentThreadHTML('submittal',id,comments),
    `${can('approve')&&s.status==='Pending Review'?`<button class="btn btn-success" onclick="reviewSub('${id}')">Review & Respond</button>`:''}
     ${can('submit')&&!can('approve')&&s.status==='Revise & Resubmit'?`<button class="btn btn-primary" onclick="createResubmission('${id}')">Create Resubmission</button>`:''}
     ${s.due_date?`<span style="font-size:11px;padding:4px 8px">${overdueTag(s.due_date)}</span>`:''}
     <button class="btn" onclick="viewAuditTrail('submittal','${id}','${s.ref_no}')">View Audit Trail</button>
     <button class="btn" onclick="printDoc('dsub-print-${id}','DSUB_${s.ref_no}.pdf')">Download PDF</button>
     <button class="btn" onclick="closeModal()">Close</button>`, true);
}

// ─── DRAWING ACTIONS ──────────────────────────────────────────────
async function voidDrawing(id, drawingNo) {
  if(!await confirmModal('Void drawing <b>'+drawingNo+'</b>? This cannot be undone — the drawing will be flagged as no longer applicable.')) return;
  const {error} = await sb.from('drawings').update({
    status:'Void', cde_state:'Archived'
  }).eq('id',id);
  if(error){toast('Error: '+error.message,'error');return;}
  await logAudit(id, 'drawing', 'Drawing Voided: ' + drawingNo);
  toast('Drawing '+drawingNo+' has been voided','info');
  closeModal(); renderDrawings();
}

async function linkDrawings(id, drawingNo) {
  const {data:all} = await sb.from('drawings').select('id,drawing_no,title,discipline').eq('project_id',currentProject.id).order('drawing_no').neq('id',id);
  const {data:current} = await sb.from('drawings').select('related_drawings').eq('id',id).single();
  const linked = current?.related_drawings||[];
  openModal('Link Related Drawings – '+drawingNo, `
    <div style="font-size:11px;color:var(--text3);margin-bottom:10px">Select drawings that cross-reference this drawing</div>
    <div style="border:0.5px solid var(--border);border-radius:8px;overflow:hidden;max-height:300px;overflow-y:auto">
      ${(all||[]).map(d=>`<label style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:0.5px solid var(--border);cursor:pointer;font-size:11px">
        <input type="checkbox" value="${d.id}" ${linked.includes(d.id)?'checked':''} style="accent-color:var(--sand)">
        <span class="mono" style="color:var(--sand);flex-shrink:0">${d.drawing_no}</span>
        <span style="color:var(--charcoal)">${d.title}</span>
        <span style="color:var(--text3);font-size:10px;margin-left:auto">${d.discipline||''}</span>
      </label>`).join('')}
    </div>`,
    `<button class="btn btn-primary" onclick="saveLinkDrawings('${id}')">Save Links</button>
     <button class="btn" onclick="closeModal()">Cancel</button>`);
}

async function saveLinkDrawings(id) {
  const checked = [...document.querySelectorAll('#modal-body input[type=checkbox]:checked')].map(c=>c.value);
  const {error} = await sb.from('drawings').update({related_drawings:checked}).eq('id',id);
  if(error){toast('Error saving links','error');return;}
  toast('Drawing links saved','success');
  closeModal(); viewDraw(id);
}

function exportDrawingRegister() {
  // Export as formatted CSV then trigger download
  sb.from('drawings').select('*').eq('project_id',currentProject.id).order('drawing_no',{ascending:true}).then(({data})=>{
    const rows = data||[];
    const headers = ['Drawing No.','Title','Discipline','Revision','POI Code','CDE State','Review Status','Originator','Zone','Level','Type','Uploaded By','Date'];
    const csvRows = [headers.join(',')];
    rows.forEach(d=>{
      csvRows.push([
        '"'+(d.drawing_no||'')+'"',
        '"'+(d.title||'').replace(/"/g,"''")+'"',
        d.discipline||'',
        d.revision||'',
        d.poi_code||'',
        d.cde_state||'WIP',
        d.status||'',
        d.originator||'',
        d.zone||'',
        d.level||'',
        d.doc_type||'',
        '"'+(d.uploaded_by||'')+'"',
        d.created_at?d.created_at.split('T')[0]:'',
      ].join(','));
    });
    const csv = csvRows.join('\n');
    const blob = new Blob([csv],{type:'text/csv'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'GolfGrove_Drawing_Register_'+new Date().toISOString().split('T')[0]+'.csv';
    a.click();
    toast('Drawing register exported','success');
  });
}

// ─── ACTIONS ──────────────────────────────────────────────────────
async function approveDrawing(id) {
  const role = currentProfile?.role;
  if(role !== 'consultant' && role !== 'developer') {
    toast('Only consultants and developers can approve drawings','error'); return;
  }
  const {data:d} = await sb.from('drawings').select('revision,status').eq('id',id).maybeSingle();
  if(!d){toast('Drawing not found','error');return;}
  const prevStatus = d.status;
  const {error} = await sb.from('drawings').update({status:'Approved'}).eq('id',id);
  if(error){toast('Error: '+error.message,'error');return;}
  const audited = await logAudit(id, 'drawing', 'Drawing Approved');
  if(!audited) {
    await sb.from('drawings').update({status: prevStatus}).eq('id', id);
    toast('Approval reverted — audit log failed. Please try again.','error');
    return;
  }
  // Update revision record with approval details
  const {error:revErr} = await sb.from('drawing_revisions')
    .update({
      approved_by_name:currentProfile?.full_name||currentUser?.email,
      approved_by_id:currentUser?.id,
      approval_date:new Date().toISOString(),
      status:'Approved'
    })
    .eq('drawing_id',id)
    .eq('revision',d.revision);
  if(revErr){toast('Drawing approved but revision record update failed','warning');}
  toast('Drawing approved','success'); closeModal(); render();
}

function reviewSub(id) {
  openModal(`Review Submittal – ${id}`, `
    <div class="form-group"><label class="form-label-dark">Engineer's Comments</label><textarea class="form-control" id="sc-${id}" placeholder="Enter comments..." style="min-height:100px"></textarea></div>
    <div class="form-group"><label class="form-label-dark">Outcome Code</label>
      <select class="form-control" id="so-${id}">
        <option value="1">(1) Approved – Work may proceed</option>
        <option value="2">(2) Approved With Comments – Work may proceed</option>
        <option value="3" selected>(3) Revise and resubmit – Work may not proceed</option>
        <option value="4">(4) Review not Required – Work may proceed</option>
      </select>
    </div>
    <div class="frow">
      <div class="form-group"><label class="form-label-dark">Resident Engineer – Name <span style="color:var(--color-text-danger)">*</span></label><input type="text" class="form-control" id="sre-${id}" placeholder="Enter engineer's full name" /></div>
      <div class="form-group"><label class="form-label-dark">Date</label><input type="date" class="form-control" id="srd-${id}" value="${new Date().toISOString().split('T')[0]}" /></div>
    </div>
    <div style="font-size:11px;color:var(--color-text-tertiary);padding:6px 0">This name will appear on the DSUB form as the signing Resident Engineer.</div>`,
    `<button class="btn btn-primary" onclick="doReviewSub('${id}')">Submit Review</button><button class="btn" onclick="closeModal()">Cancel</button>`);
}

async function doReviewSub(id) {
  const oc = document.getElementById('so-'+id).value;
  const engName = document.getElementById('sre-'+id)?.value?.trim();
  if(!engName){toast("Please enter the Resident Engineer's name",'error');return;}
  const statusMap = {'1':'Approved','2':'Approved','3':'Revise & Resubmit','4':'Approved'};
  await sb.from('submittals').update({
    eng_comments: document.getElementById('sc-'+id).value,
    outcome: oc,
    status: statusMap[oc],
    reviewed_by: engName,
    review_date: document.getElementById('srd-'+id)?.value||new Date().toISOString().split('T')[0]
  }).eq('id',id);
  await logAudit(id, 'submittal', 'Submittal Reviewed: Code ' + oc + ' \u2013 ' + statusMap[oc]);
  toast('Submittal reviewed','success'); closeModal(); render();

function uploadRev(id) {
  openModal(`Upload New Revision`, `
    <div class="frow">
      <div class="form-group"><label class="form-label-dark">New Revision</label><input type="text" class="form-control" id="nr-${id}" placeholder="e.g. Rev D" /><div id="nr-err-${id}" style="display:none;color:var(--red);font-size:11px;margin-top:4px"></div></div>
      <div class="form-group"><label class="form-label-dark">Status</label>
        <select class="form-control" id="rs-${id}"><option>Under Review</option><option>Issued for Construction</option></select>
      </div>
    </div>
    <div class="form-group"><label class="form-label-dark">Upload PDF File</label>
      <div class="upload-zone" id="uz-${id}" onclick="document.getElementById('fu-${id}').click()" ondragover="event.preventDefault();this.classList.add('dragging')" ondragleave="this.classList.remove('dragging')" ondrop="handleDrop(event,'${id}')">
        <div style="font-size:24px">📄</div>
        <div class="upload-zone-text">Click to select or drag & drop PDF</div>
        <div class="upload-zone-sub">PDF files only</div>
        <div class="upload-progress" id="up-${id}" style="display:none"><div class="upload-progress-bar" id="upb-${id}" style="width:0%"></div></div>
      </div>
      <input type="file" id="fu-${id}" accept=".pdf" style="display:none" onchange="handleFileSelect(event,'${id}')" />
      <div id="file-name-${id}" style="font-size:11px;color:var(--text2);margin-top:6px"></div>
    </div>`,
    `<button class="btn btn-primary" onclick="doUploadRev('${id}')">Upload & Supersede</button><button class="btn" onclick="closeModal()">Cancel</button>`);
}

let selectedFiles = {};
function handleFileSelect(event, id) {
  const f = event.target.files[0];
  if(f){selectedFiles[id]=f;document.getElementById('file-name-'+id).textContent=`Selected: ${f.name}`;}
}
function handleDrop(event, id) {
  event.preventDefault();
  document.getElementById('uz-'+id).classList.remove('dragging');
  const f = event.dataTransfer.files[0];
  if(f&&f.type==='application/pdf'){selectedFiles[id]=f;document.getElementById('file-name-'+id).textContent=`Selected: ${f.name}`;}
}

async function doUploadRev(id) {
  const newRev = document.getElementById('nr-'+id).value;
  const newStatus = document.getElementById('rs-'+id).value;
  const file = selectedFiles[id];
  if(!newRev){toast('Please enter a revision number','error');return;}
  // Hard block on revision scheme mismatch
  const revCheck = enforceRevisionScheme(newStatus, newRev);
  if(revCheck.warn){toast(revCheck.msg,'error');return;}
  const {data:d} = await sb.from('drawings').select('revision,superseded_revisions,file_path,status').eq('id',id).maybeSingle();
  if(!d){toast('Drawing not found','error');return;}
  let supers = JSON.parse(d.superseded_revisions||'[]');
  const errEl = document.getElementById('nr-err-'+id);
  const isDupe = newRev.trim() === d.revision?.trim() || supers.includes(newRev.trim());
  if(isDupe) {
    if(errEl){ errEl.textContent = `Revision "${newRev}" already exists. Use a new revision identifier.`; errEl.style.display=''; }
    return;
  }
  if(errEl) errEl.style.display='none';
  supers.push(d.revision);
  let filePath = null;
  if(file) {
    const path = `${id}/${newRev.replace(/\s/g,'_')}_${Date.now()}.pdf`;
    document.getElementById('up-'+id).style.display='';
    document.getElementById('upb-'+id).style.width='50%';
    const {error} = await sb.storage.from('drawings').upload(path, file, {upsert:true});
    document.getElementById('upb-'+id).style.width='100%';
    if(error){toast('Storage upload failed — '+error.message,'error');return;}
    filePath = path;
  }
  const update = {revision:newRev,status:newStatus,superseded_revisions:JSON.stringify(supers)};
  if(filePath) update.file_path = filePath;
  const prevData = {revision:d.revision, status:d.status, superseded_revisions:d.superseded_revisions, file_path:d.file_path};
  const {error:updErr} = await sb.from('drawings').update(update).eq('id',id);
  if(updErr){toast('Error updating drawing: '+updErr.message,'error');return;}
  // Backfill file_path on the previous revision row so it remains viewable
  if(d.file_path) {
    await sb.from('drawing_revisions')
      .update({file_path:d.file_path})
      .eq('drawing_id',id).eq('revision',d.revision).is('file_path',null);
  }
  // Log revision event — wrapped to prevent orphaned drawing state
  const {error:revErr} = await sb.from('drawing_revisions').insert({
    drawing_id:id,
    revision:newRev,
    status:newStatus,
    uploaded_by_name:currentProfile?.full_name||currentUser?.email,
    uploaded_by_id:currentUser?.id,
    file_path:filePath||d.file_path,
    notes:document.getElementById('rd-'+id)?.value||''
  });
  if(revErr) {
    await sb.from('drawings').update(prevData).eq('id',id);
    toast('Revision audit entry failed — drawing state rolled back','error');
    closeModal(); render();
    return;
  }
  await logAudit(id, 'drawing', 'New Revision Uploaded: '+newRev);
  delete selectedFiles[id];
  toast('Revision uploaded successfully','success'); closeModal(); render();
}

// ─── LIVE DRAWING NUMBER VALIDATION ──────────────────────────────
function validateDrawingNumberLive() {
  const el = document.getElementById('nd-id');
  if(!el) return;
  let msgEl = document.getElementById('nd-id-err');
  if(!msgEl){msgEl=document.createElement('div');msgEl.id='nd-id-err';msgEl.className='form-err';el.parentElement.appendChild(msgEl);}
  const v = el.value.trim();
  if(!v){msgEl.classList.remove('visible');el.classList.remove('err');return;}
  const r = validateDrawingNumber(v);
  if(!r.valid){el.classList.add('err');msgEl.textContent='⚠ '+r.msg;msgEl.classList.add('visible');}
  else{el.classList.remove('err');msgEl.classList.remove('visible');}
}

async function doNewDraw() {
  const idEl = document.getElementById('nd-id');
  const titleEl = document.getElementById('nd-title');
  const id = idEl.value.trim();
  const title = titleEl.value.trim();
  // E4/E5: Inline error highlighting
  idEl.classList.remove('err'); document.getElementById('nd-id-err')?.classList.remove('visible');
  titleEl.classList.remove('err'); document.getElementById('nd-title-err')?.classList.remove('visible');
  if(!id||!title){
    if(!id){idEl.classList.add('err');const e=document.getElementById('nd-id-err');if(e){e.textContent='Drawing number is required';e.classList.add('visible');}}
    if(!title){titleEl.classList.add('err');const e=document.getElementById('nd-title-err');if(e){e.textContent='Title is required';e.classList.add('visible');}}
    toast('Please fill in all required fields','error');
    return;
  }
  const orig  = document.getElementById('nd-orig')?.value?.trim();
  const zone  = document.getElementById('nd-zone')?.value?.trim();
  const level = document.getElementById('nd-level')?.value?.trim();
  if(!orig||!zone||!level){toast('Originator, Zone, and Level are required','error');return;}
  // Validate drawing number format
  const numCheck = validateDrawingNumber(id);
  const numWarnEl = document.getElementById('nd-num-warn');
  if(!numCheck.valid){
    if(numWarnEl){ numWarnEl.textContent = numCheck.msg; numWarnEl.style.display=''; }
    return;
  }
  if(numWarnEl) numWarnEl.style.display='none';
  // Revision scheme warning
  const revWarn = enforceRevisionScheme(document.getElementById('nd-status')?.value, document.getElementById('nd-rev')?.value);
  if(revWarn.warn) {
    const warnEl = document.getElementById('nd-rev-warn');
    if(warnEl){ warnEl.textContent = revWarn.msg; warnEl.style.display=''; }
    return;
  }
  // Generate UUID upfront so storage path matches DB id — no move or update needed after insert.
  // This ensures all roles (including contractor who cannot UPDATE drawings) get a correct file_path.
  const drawingId = crypto.randomUUID();
  const file = selectedFiles['new'];
  let filePath = null;
  if(file) {
    const storagePath = `${drawingId}/Rev_A_${Date.now()}.pdf`;
    const {error:upErr} = await sb.storage.from('drawings').upload(storagePath, file, {upsert:false});
    if(upErr){toast('Storage upload failed — '+upErr.message,'error');return;}
    filePath = storagePath;
  }
  const {data:inserted,error} = await sb.from('drawings').insert({project_id:currentProject.id,
    id:drawingId,
    drawing_no:id,title,discipline:document.getElementById('nd-disc').value,
    revision:document.getElementById('nd-rev').value,
    status:document.getElementById('nd-status').value,
    poi_code:document.getElementById('nd-poi')?.value||null,
    arfi:document.getElementById('nd-arfi')?.value||'AR',
    cde_state:'WIP',
    originator:document.getElementById('nd-orig')?.value||null,
    zone:document.getElementById('nd-zone')?.value||null,
    level:document.getElementById('nd-level')?.value||null,
    doc_type:document.getElementById('nd-type')?.value||'DR',
    uploaded_by:currentProfile?.full_name||currentUser?.email,
    file_path:filePath,
    superseded_revisions:'[]',
    related_drawings:[]
  }).select().single();
  delete selectedFiles['new'];
  if(error){toast('Error creating drawing: '+error.message,'error');return;}
  // Log initial revision event — wrapped to delete orphaned drawing on failure
  if(inserted) {
    const {error:revErr} = await sb.from('drawing_revisions').insert({
      drawing_id:inserted.id,
      revision:document.getElementById('nd-rev').value||'Rev A',
      status:document.getElementById('nd-status').value,
      uploaded_by_name:currentProfile?.full_name||currentUser?.email,
      uploaded_by_id:currentUser?.id,
      file_path:filePath
    });
    if(revErr){
      await sb.from('drawings').delete().eq('id',inserted.id);
      toast('Drawing created but revision audit failed — drawing deleted','error');
      closeModal(); render();
      return;
    }
    await uploadStagedFiles('nd-staged','drawing',inserted.id);
    await logAudit(inserted.id, 'drawing', 'Drawing Uploaded: '+inserted.drawing_no);
  }
  toast('Drawing uploaded','success'); closeModal(); render();
}

async function doNewSub() {
  const ref = document.getElementById('ns-id').value;
  const title = document.getElementById('ns-title').value;
  if(!ref||!title){toast('Reference number and title are required','error');return;}
  const {data:newSub,error} = await sb.from('submittals').insert({project_id:currentProject.id,
    ref_no:ref,title,
    from_party:document.getElementById('ns-from').value,
    to_party:document.getElementById('ns-to').value,
    submit_date:document.getElementById('ns-date').value,
    status:'Pending Review',
    attachments:{samples:document.getElementById('ns-samp').checked,brochure:document.getElementById('ns-broc').checked,drawings:document.getElementById('ns-draw').checked,sketches:document.getElementById('ns-sket').checked,others:document.getElementById('ns-oth').checked},
    discipline:{civil:document.getElementById('ns-civil').checked,mech:document.getElementById('ns-mech').checked,elv:document.getElementById('ns-elv').checked,specs:document.getElementById('ns-dspec').checked,arch:document.getElementById('ns-arch').checked,elec:document.getElementById('ns-elec').checked},
    revision:'Rev 000',
    due_date:document.getElementById('ns-due')?.value||null,
    related_drawing:document.getElementById('ns-drawing')?.value||null
  }).select().single();
  if(error){toast('Error: '+error.message,'error');return;}
  if(newSub?.id) {
    await uploadStagedFiles('ns-staged','submittal',newSub.id);
    await logAudit(newSub.id, 'submittal', 'Submittal Created: '+newSub.ref_no);
  }
  toast('Submittal created','success'); closeModal(); render();
}