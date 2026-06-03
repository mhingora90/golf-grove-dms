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