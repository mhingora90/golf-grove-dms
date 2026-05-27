// helpers.js — shared utility functions (badges, modals, toast, bulk selection, format)

// ─── BADGE & FORMAT HELPERS ───

function cdeBadge(state) {
  const map = {
    'WIP':    {cls:'cde-wip',    label:'WIP'},
    'Shared': {cls:'cde-shared', label:'Shared'},
    'Published':{cls:'cde-published',label:'Published'},
    'Archived':{cls:'cde-archived',label:'Archived'},
    'Superseded':{cls:'cde-superseded',label:'Superseded'},
  };
  const s = map[state]||{cls:'cde-wip',label:state||'WIP'};
  return `<span class="cde-badge ${s.cls}">${s.label}</span>`;
}

function poiBadge(code) {
  const map = {
    'S0':['poi-s0','S0 – Work in Progress'],
    'S1':['poi-s1','S1 – For Coordination'],
    'S2':['poi-s2','S2 – For Information'],
    'S3':['poi-s3','S3 – For Review & Comment'],
    'S4':['poi-s4','S4 – For Construction'],
    'S5':['poi-s5','S5 – As Constructed'],
    'S6':['poi-s6','S6 – Post-Construction'],
    'S7':['poi-s7','S7 – Archived'],
  };
  if(!code) return '';
  const [cls,label] = map[code]||['poi-s0',code];
  return `<span class="poi-badge ${cls}">${label}</span>`;
}

function corrTypeBadge(type) {
  const map = {
    'Site Instruction':     'corr-instruction',
    'Letter':               'corr-letter',
    'Variation Order':      'corr-variation',
    'Extension of Time':    'corr-eot',
    'RFI Response':         'corr-rfi',
    'General Correspondence':'corr-general',
  };
  return `<span class="corr-type ${map[type]||'corr-general'}">${type||'General'}</span>`;
}

function validateDrawingNumber(num) {
  if(!num) return {valid:false, msg:'Drawing number is required'};
  const parts = num.split('-');
  // Format: GG-[ORIGINATOR]-[VOLUME]-[LEVEL]-[TYPE]-[ROLE]-[NUMBER]-[REV]
  if(parts[0]?.toUpperCase() !== 'GG')
    return {valid:false, msg:'Segment 1 (Project) must be "GG"'};
  if(parts.length < 8)
    return {valid:false, msg:`Expected format: GG-Originator-Volume-Level-Type-Role-Number-Rev (8 segments), got ${parts.length}`};
  if(!parts[1])
    return {valid:false, msg:'Segment 2 (Originator) is empty'};
  if(!parts[2])
    return {valid:false, msg:'Segment 3 (Volume/Zone) is empty'};
  if(!parts[3])
    return {valid:false, msg:'Segment 4 (Level) is empty'};
  if(!parts[4])
    return {valid:false, msg:'Segment 5 (Type) is empty'};
  if(!parts[5])
    return {valid:false, msg:'Segment 6 (Role) is empty'};
  if(!/^\d{4}$/.test(parts[6]))
    return {valid:false, msg:'Segment 7 (Number) must be exactly 4 digits (e.g. 0001)'};
  return {valid:true, msg:''};
}

function enforceRevisionScheme(currentStatus, revision) {
  // Alphabetical for pre-construction (Under Review / Revise & Resubmit)
  // Numerical for construction (Issued for Construction / Approved)
  const isIFC = currentStatus === 'Issued for Construction' || currentStatus === 'Approved';
  const hasAlpha = /^[A-Z]$|^Rev [A-Z]$|^[Rr]ev[A-Z]$/i.test(revision?.trim()||'');
  const hasNum = /^[0-9]+$|^Rev [0-9]+$|^[Rr]ev[0-9]+$/i.test(revision?.trim()||'');
  if(isIFC && hasAlpha) return {warn:true, msg:'IFC drawings should use numerical revisions (1, 2, 3). Alphabetical revisions are for pre-construction only.'};
  if(!isIFC && hasNum) return {warn:true, msg:'Pre-construction drawings should use alphabetical revisions (A, B, C). Numerical revisions are for IFC drawings.'};
  return {warn:false, msg:''};
}

function cdeStepperHTML(currentState, drawingId) {
  const steps = ['WIP','Shared','Published','Archived'];
  const role = currentProfile?.role;
  const transitions = {
    'WIP':       ['contractor','developer'],
    'Shared':    ['consultant','developer'],
    'Published': ['developer'],
    'Archived':  [],
  };
  const currentIdx = steps.indexOf(currentState);
  return '<div class="cde-stepper">' + steps.map((step, i) => {
    const isDone = i < currentIdx;
    const isActive = i === currentIdx;
    const isNext = i === currentIdx + 1;
    const canTransition = isNext && transitions[currentState]?.includes(role);
    const cls = isDone ? 'done' : isActive ? 'active' : canTransition ? 'clickable' : '';
    const arrow = i < steps.length - 1 ? '<span class="cde-arrow">›</span>' : '';
    const clickFn = canTransition ? `onclick="advanceCDE('${drawingId}','${step}')"` : '';
    return `<div class="cde-step ${cls}" ${clickFn} title="${canTransition?'Click to advance to '+step:step}">${step}</div>${arrow}`;
  }).join('') + '</div>';
}

function sbadge(s) {
  if(!s) return '<span class="badge badge-neutral">—</span>';
  // Normalise to title case for case-insensitive matching
  const norm = String(s).toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
  const m={
    'Approved':'badge-success','Issued For Construction':'badge-success','Passed':'badge-success',
    'Closed':'badge-success','Approved As Noted':'badge-success',
    'Under Review':'badge-info','Pending Review':'badge-info','Pending':'badge-info','Responded':'badge-info',
    'Cap Verified':'badge-info',
    'Revise & Resubmit':'badge-warning','Correction':'badge-warning','Open':'badge-warning','High':'badge-warning',
    'Rejected':'badge-danger','Major':'badge-danger','Critical':'badge-danger',
    'Normal':'badge-neutral','Minor':'badge-neutral','Void':'badge-danger','Cancelled':'badge-danger',
    'Draft':'badge-neutral','Submitted':'badge-info','Under Review':'badge-warning','Certified':'badge-success','Paid':'badge-success','Part Paid':'badge-warning',
  };
  return `<span class="badge ${m[norm]||'badge-neutral'}">${s}</span>`;
}

// ─── BULK SELECTION UTILITIES ───

// ─── SHARED BULK EXPORT CSV ───────────────────────────────────────
async function bulkExportCSV(table, columns, filename) {
  const {data} = await sb.from(table).select(columns);
  if(!data||!data.length){toast('No data to export','error');return;}
  const headers = Object.keys(data[0]);
  const csv = [headers.join(','),...data.map(r=>headers.map(h=>{
    const v = r[h]; return typeof v==='object'?'"'+JSON.stringify(v).replace(/"/g,'""')+'"':'"'+(v||'').toString().replace(/"/g,'""')+'"';
  }).join(','))].join('\n');
  const blob = new Blob([csv],{type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=filename; a.click();
  URL.revokeObjectURL(url);
  toast(`Exported ${data.length} records to ${filename}`,'success');
}
// ─── GENERIC SELECTION HELPERS ────────────────────────────────────
// ─── GENERIC SELECTION HELPERS ────────────────────────────────────
function selectAllRows(prefix, set, barId, countId) {
  const cb = document.getElementById(prefix+'-select-all');
  const checked = cb?.checked||false;
  document.querySelectorAll('.'+prefix+'-row').forEach(r=>{
    if(r.style.display==='none') return;
    const rowCb = document.getElementById(prefix+'cb-'+r.dataset.id);
    if(rowCb&&!rowCb.disabled){rowCb.checked=checked; if(checked) set.add(r.dataset.id); else set.delete(r.dataset.id);}
  });
  updateBulkBar(set, barId, countId, prefix);
}
function toggleRowSelect(id, set, prefix, barId, countId) {
  if(set.has(id)) set.delete(id); else set.add(id);
  updateBulkBar(set, barId, countId, prefix);
}
function clearSelection(set, prefix, barId, countId) {
  set.clear();
  document.querySelectorAll('.'+prefix+'-row input.row-cb').forEach(cb=>cb.checked=false);
  const sa = document.getElementById(prefix+'-select-all'); if(sa){sa.checked=false;sa.indeterminate=false;}
  updateBulkBar(set, barId, countId, prefix);
}
function updateBulkBar(set, barId, countId, prefix) {
  const n = set.size;
  const bar = document.getElementById(barId);
  const cnt = document.getElementById(countId);
  if(!bar) return;
  if(cnt) cnt.textContent = n+' selected';
  bar.style.transform = n>0?'translateY(0)':'translateY(100%)';
  const sa = document.getElementById(prefix+'-select-all');
  if(sa){
    const visible = [...document.querySelectorAll('.'+prefix+'-row')].filter(r=>r.style.display!=='none'&&!document.getElementById(prefix+'cb-'+r.dataset.id)?.disabled);
    sa.indeterminate = n>0&&n<visible.length;
    sa.checked = n>0&&n>=visible.length;
  }
}
async function bulkDelete(table, set, prefix, barId, countId) {
  const ids = [...set];
  if (!ids.length) return;
  if (!confirm(`Delete ${ids.length} record(s)? This cannot be undone.`)) return;
  const { error } = await sb.from(table).delete().in('id', ids);
  if (error) { toast('Delete failed: ' + error.message, 'error'); return; }
  toast('Deleted ' + ids.length + ' record(s)', 'success');
  clearSelection(set, prefix, barId, countId);
  switch(currentPage) {
    case 'ms': await renderMS(); break;
    case 'sub': await renderSubmittals(); break;
    case 'ir': await renderInspections(); break;
    case 'ncr': await renderNCRs(); break;
    case 'rfi': await renderRFIs(); break;
    case 'trans': await renderTransmittals(); break;
    case 'corr': await renderCorrespondence(); break;
    case 'punch': await renderPunchList(); break;
    default: break;
  }
}
function clearDrawSelection() {}

// ─── MODAL HELPERS ────────────────────────────────────────────────
function openModal(title, body, footer, wide) {
  _modalDirty = false;
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = body;
  document.getElementById('modal-footer').innerHTML = footer;
  document.getElementById('modal').classList.toggle('wide', !!wide);
  document.getElementById('modal-bg').classList.add('open');
  document.getElementById('modal-body').scrollTop = 0;
  if(window.Motion) {
    window.Motion.animate('#modal', {opacity:[0,1], y:[-10,0], scale:[.97,1]}, {duration:.2, easing:'ease-out'});
  }
}
let _modalDirty = false;
function setModalDirty(){ _modalDirty = true; }
function closeModal(){
  if(_modalDirty && !confirm('You have unsaved changes. Close anyway?')) return;
  _modalDirty = false;
  document.getElementById('modal-bg').classList.remove('open');
  const cb = window._onModalClose; window._onModalClose = null; if(cb) cb();
  // FIX 2: Clear all staged file state on modal close to prevent files from a
  // previous modal session being silently attached to a different record.
  // uploadStagedFiles() deletes its key on success; we clear any remaining keys
  // here to handle the case where the user staged files but cancelled.
  Object.keys(stagedFiles).forEach(k => delete stagedFiles[k]);
  Object.keys(markupFiles).forEach(k => delete markupFiles[k]);
}
function closeBg(e){if(e.target===document.getElementById('modal-bg'))closeModal();}

// ─── CONFIRM MODAL (replaces window.confirm, returns Promise) ────
function confirmModal(msg) {
  return new Promise(resolve=>{
    openModal('Confirm Action', `<div style="font-size:14px;color:var(--text);line-height:1.5;padding:8px 0">${msg}</div>`,
      `<button class="btn btn-primary" id="confirm-yes">Confirm</button><button class="btn btn-danger" onclick="window._confirmResolve(false)">Cancel</button>`);
    window._confirmResolve = (v)=>{ closeModal(); resolve(v); };
    document.getElementById('confirm-yes').onclick = ()=>{ closeModal(); resolve(true); };
  });
}

// ─── FORM VALIDATION ─────────────────────────────────────────────
function validateForm(fields) {
  // fields: array of {id, label, required}
  let firstErr = null, allValid = true;
  fields.forEach(f=>{
    const el = document.getElementById(f.id);
    if(!el) return;
    const errEl = document.getElementById(f.id+'-err');
    el.classList.remove('err');
    if(errEl) errEl.classList.remove('visible');
    if(f.required && !el.value.trim()){
      allValid = false;
      el.classList.add('err');
      if(errEl){errEl.textContent=f.label+' is required';errEl.classList.add('visible');}
      if(!firstErr) firstErr = el;
    }
  });
  if(firstErr) firstErr.focus();
  return allValid;
}

// ─── TOAST ────────────────────────────────────────────────────────
function toast(msg, type='info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = {success:'✓',error:'✕',info:'ℹ',warning:'⚠'};
  const durations = {success:3000,error:6000,info:0,warning:4000};
  el.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ'}</span><span class="toast-msg">${msg}</span><button class="toast-close" onclick="this.parentElement.remove()">×</button>`;
  document.getElementById('toasts').appendChild(el);
  const dur = durations[type]||3500;
  if(dur > 0) setTimeout(()=>{ if(el.parentElement) el.remove(); }, dur);
}

// ─── FORMAT HELPERS ───

function esc(s) {
  return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtAED(n) {
  return 'AED ' + (+n||0).toLocaleString('en-AE',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function showBarTip(e,text) {
  let t=document.getElementById('bar-tip');
  if(!t){t=document.createElement('div');t.id='bar-tip';t.style.cssText='position:fixed;pointer-events:none;background:#2A2420;color:#F5F0E8;font-size:11px;padding:5px 10px;border-radius:5px;white-space:nowrap;z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,.25);display:none';document.body.appendChild(t);}
  t.textContent=text;t.style.display='block';moveBarTip(e);
}
function moveBarTip(e) {
  const t=document.getElementById('bar-tip');if(!t||t.style.display==='none')return;
  t.style.left=(e.clientX+12)+'px';t.style.top=(e.clientY-28)+'px';
}
function hideBarTip() {
  const t=document.getElementById('bar-tip');if(t)t.style.display='none';
}
function fmtCompact(n) {
  const v = +n||0;
  if(v>=1e9) return 'AED '+(v/1e9).toFixed(2)+'B';
  if(v>=1e6) return 'AED '+(v/1e6).toFixed(2)+'M';
  if(v>=1e3) return 'AED '+(v/1e3).toFixed(1)+'K';
  return fmtAED(v);
}

// ─── PAGE FILTER STATE ───

const _pageFilters = {};
