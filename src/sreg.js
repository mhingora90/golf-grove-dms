// ─── SUBMITTAL REGISTER ───────────────────────────────────────────
async function renderSubmittalRegister() {
  const {data} = await sb.from('submittal_register').select('*').eq('project_id',currentProject.id).order('spec_ref',{ascending:true});
  const rows = data||[];
  const {data:subs} = await sb.from('submittals').select('ref_no,title,status,outcome');
  const subsAll = subs||[];
  const required = rows.length;
  const submitted = rows.filter(r=>{
    if(!r.title) return false;
    const key = r.title.toLowerCase().substring(0,15);
    return subsAll.some(s=>s.title.toLowerCase().includes(key));
  }).length;
  const approved = rows.filter(r=>subsAll.some(s=>s.outcome==='1'||s.outcome==='2')).length;
  document.getElementById('content').innerHTML = `
  <div class="module-bar">
    <div class="module-stat"><div class="module-stat-val">${required}</div><div class="module-stat-label">Required</div></div>
    <div class="module-stat"><div class="module-stat-val ${submitted<required?'warn':''}">${submitted}</div><div class="module-stat-label">Submitted</div></div>
    <div class="module-stat"><div class="module-stat-val">${approved}</div><div class="module-stat-label">Approved</div></div>
    <div class="module-stat"><div class="module-stat-val ${(required-submitted)>0?'danger':''}">${required-submitted}</div><div class="module-stat-label">Outstanding</div></div>
  </div>
  <div class="fbar">
    <select class="filter-sel" onchange="filt('sreg','discipline',this.value)">
      <option value="All">All Disciplines</option>
      <option>Architecture</option><option>Structure</option><option>MEP</option><option>Civil</option><option>Firefighting</option>
    </select>
    <span style="flex:1"></span>
    ${can('manageRegister')?`<button class="btn btn-sm btn-primary" onclick="addRegisterItem()">+ Add Item</button>
    <button class="btn btn-sm" onclick="importRegisterCSV()">Import CSV</button>`:''}
  </div>
  ${rows.length===0?`
  <div style="text-align:center;padding:60px 20px;background:var(--bg2);border:0.5px solid var(--border);border-radius:12px">
    <div style="font-size:32px;margin-bottom:12px;opacity:.3">📋</div>
    <div style="font-size:14px;font-weight:500;color:var(--charcoal);margin-bottom:6px">Submittal Register is empty</div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:20px">Add required submittals manually or import from a CSV.<br>You can also share your project specification and I can parse the required submittals for you.</div>
    ${can('manageRegister')?`<button class="btn btn-primary" style="margin-right:8px" onclick="addRegisterItem()">+ Add Item</button>
    <button class="btn" onclick="importRegisterCSV()">Import CSV</button>`:''}
  </div>`:`
  <div class="card"><div class="tw"><table>
    <tr><th>Item No.</th><th>Description</th><th>Spec Ref</th><th>Discipline</th><th>Required By</th><th>Status</th><th>Actions</th></tr>
    ${rows.map(r=>{
      const linked = subsAll.filter(s=>s.title.toLowerCase().includes((r.title||'').toLowerCase().substring(0,15)));
      const hasApproved = linked.some(s=>s.outcome==='1'||s.outcome==='2');
      const hasSubmitted = linked.length>0;
      const today = new Date().toISOString().split('T')[0];
      const isOverdue = r.required_by&&r.required_by<today&&!hasApproved;
      const regStatus = hasApproved?'approved':hasSubmitted?'submitted':isOverdue?'overdue':'required';
      const regLabel = {approved:'Approved',submitted:'Submitted',overdue:'Overdue',required:'Required'};
      return `<tr class="sreg-row" data-discipline="${r.discipline||''}">
        <td class="mono">${r.item_no||'—'}</td>
        <td style="font-weight:500;color:var(--charcoal)">${r.title||'—'}</td>
        <td style="font-size:10px;color:var(--text2)">${r.spec_ref||'—'}</td>
        <td style="font-size:11px;color:var(--text2)">${r.discipline||'—'}</td>
        <td style="font-size:10px;color:${isOverdue?'var(--red)':'var(--text3)'}">${r.required_by||'—'}</td>
        <td><span class="reg-badge reg-${regStatus}">${regLabel[regStatus]}</span></td>
        <td><div style="display:flex;gap:4px">
          ${can('manageRegister')?`<button class="btn btn-sm btn-danger" onclick="deleteRegisterItem('${r.id}')">Remove</button>`:''}
        </div></td>
      </tr>`;
    }).join('')}
  </table></div></div>`}`;
}

function addRegisterItem() {
  openModal('Add to Submittal Register', `
    <div class="frow">
      <div class="form-group"><label class="form-label-dark">Item No.</label>
        <input type="text" class="form-control" id="sri-no" placeholder="e.g. SUB-001" />
      </div>
      <div class="form-group"><label class="form-label-dark">Spec Reference</label>
        <input type="text" class="form-control" id="sri-spec" placeholder="e.g. §03.30.00" />
      </div>
    </div>
    <div class="form-group"><label class="form-label-dark">Description / Title <span style="color:var(--red)">*</span></label>
      <input type="text" class="form-control" id="sri-title" placeholder="e.g. Concrete Mix Design – Grade C40" />
    </div>
    <div class="frow">
      <div class="form-group"><label class="form-label-dark">Discipline</label>
        <select class="form-control" id="sri-disc">
          <option>Architecture</option><option>Structure</option><option>MEP</option>
          <option>Civil</option><option>Firefighting</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label-dark">Required By</label>
        <input type="date" class="form-control" id="sri-date" />
      </div>
    </div>
    <div class="form-group"><label class="form-label-dark">Notes</label>
      <input type="text" class="form-control" id="sri-notes" placeholder="Any additional notes" />
    </div>`,
    `<button class="btn btn-primary" onclick="doAddRegisterItem()">Add to Register</button>
     <button class="btn" onclick="closeModal()">Cancel</button>`);
}

async function doAddRegisterItem() {
  const title = document.getElementById('sri-title')?.value;
  if(!title){toast('Description is required','error');return;}
  const {error} = await sb.from('submittal_register').insert({project_id:currentProject.id,
    item_no: document.getElementById('sri-no')?.value||null,
    spec_ref: document.getElementById('sri-spec')?.value||null,
    title,
    discipline: document.getElementById('sri-disc')?.value||null,
    required_by: document.getElementById('sri-date')?.value||null,
    notes: document.getElementById('sri-notes')?.value||null,
  });
  if(error){toast('Error: '+error.message,'error');return;}
  toast('Item added to register','success');
  closeModal(); renderSubmittalRegister();
}

async function deleteRegisterItem(id) {
  if(!await confirmModal('Remove this item from the register?')) return;
  const {error} = await sb.from('submittal_register').delete().eq('id',id);
  if(error){toast('Error: '+error.message,'error');return;}
  toast('Item removed','info');
  renderSubmittalRegister();
}

function importRegisterCSV() {
  openModal('Import Submittal Register from CSV', `
    <div style="background:var(--bg3);border-radius:8px;padding:12px 14px;margin-bottom:12px">
      <div style="font-size:11px;color:var(--text2);margin-bottom:6px">Required columns: <code>item_no, title, spec_ref, discipline, required_by</code></div>
      <div style="font-size:11px;color:var(--text3)">Optional: <code>notes</code></div>
    </div>
    <div class="upload-zone" style="padding:20px;text-align:center"
      onclick="document.getElementById('sreg-csv').click()"
      ondragover="event.preventDefault();this.classList.add('dragging')"
      ondragleave="this.classList.remove('dragging')"
      ondrop="event.preventDefault();this.classList.remove('dragging');handleRegisterDrop(event)">
      <div style="font-size:20px;margin-bottom:6px;opacity:.5">📄</div>
      <div class="upload-zone-text">Click to select CSV or drag & drop</div>
    </div>
    <input type="file" id="sreg-csv" accept=".csv" style="display:none" onchange="parseRegisterCSV(event)" />
    <div id="sreg-preview" style="margin-top:10px"></div>`,
    `<button class="btn btn-primary" id="sreg-import-btn" onclick="doImportRegister()" style="display:none">Import Items</button>
     <button class="btn" onclick="closeModal()">Cancel</button>`);
}

let registerImportData = [];
function handleRegisterDrop(e) {
  const f = e.dataTransfer.files[0];
  if(f) parseRegisterCSVFile(f);
}
function parseRegisterCSV(e) { parseRegisterCSVFile(e.target.files[0]); }
function parseRegisterCSVFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const lines = e.target.result.split('\n').filter(l=>l.trim());
    const headers = lines[0].split(',').map(h=>h.trim().toLowerCase().replace(/"/g,''));
    registerImportData = lines.slice(1).map(line=>{
      const vals = line.split(',').map(v=>v.trim().replace(/^"|"$/g,''));
      const obj = {};
      headers.forEach((h,i)=>obj[h]=vals[i]||'');
      return obj;
    }).filter(r=>r.title||r.description);
    document.getElementById('sreg-preview').innerHTML = `<div style="font-size:11px;color:var(--green);margin-bottom:6px">${registerImportData.length} items ready to import</div>`;
    document.getElementById('sreg-import-btn').style.display='';
  };
  reader.readAsText(file);
}
async function doImportRegister() {
  if(!registerImportData.length){toast('No data to import','error');return;}
  let ok=0,fail=0;
  for(const r of registerImportData) {
    const {error} = await sb.from('submittal_register').insert({project_id:currentProject.id,
      item_no:r.item_no||null, spec_ref:r.spec_ref||null,
      title:r.title||r.description, discipline:r.discipline||null,
      required_by:r.required_by||null, notes:r.notes||null,
    });
    error?fail++:ok++;
  }
  toast(`Imported ${ok} items${fail?', '+fail+' failed':''}`, fail?'error':'success');
  closeModal(); renderSubmittalRegister();
}
