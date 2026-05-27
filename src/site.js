// ─── SITE MODULES: Inspections, NCRs, RFIs, Transmittals, Correspondence, Punch List ───

// ─── HELPERS (site-scoped) ─────────────────────────────────────────
function isOverdue(dateStr) {
  if(!dateStr) return false;
  return new Date(dateStr) < new Date(new Date().toISOString().split('T')[0]);
}
function overdueTag(dateStr) {
  if(!dateStr) return '<span style="color:var(--text3);font-size:10px">—</span>';
  const d = new Date(dateStr);
  const today = new Date(new Date().toISOString().split('T')[0]);
  const diff = Math.ceil((d - today) / (1000*60*60*24));
  if(diff < 0) return `<span style="color:var(--red-light);font-size:10px;font-weight:500">⚠ ${dateStr} (${Math.abs(diff)}d overdue)</span>`;
  if(diff <= 3) return `<span style="color:var(--amber-light);font-size:10px">${dateStr} (${diff}d left)</span>`;
  return `<span style="color:var(--text3);font-size:10px">${dateStr}</span>`;
}


// ─── INSPECTIONS ──────────────────────────────────────────────────
async function renderInspections() {
  const {data} = await sb.from('inspections').select('*, subcontractors(name)').eq('project_id',currentProject.id).order('created_at',{ascending:false});
  const rows = data||[];
  const today = new Date(); const todayStr = today.toISOString().split('T')[0];
  const pending = rows.filter(r=>r.status==='Pending').length;
  const overdue = rows.filter(r=>r.due_date&&r.due_date<todayStr&&r.status==='Pending').length;
  const responded = rows.filter(r=>['Approved','Approved as Noted','Correction','Rejected'].includes(r.status)).length;
  const thisWeek = rows.filter(r=>{const d=new Date(r.created_at);return (today-d)<7*86400000;}).length;
  function slaTag(row) {
    if(row.status!=='Pending'||!row.created_at) return '';
    const age = Math.floor((today - new Date(row.created_at)) / 86400000);
    if(age<=1) return '<span class="ncr-age fresh">Day '+age+'</span>';
    if(age<=5) return '<span class="ncr-age warning">Day '+age+' / 5</span>';
    return '<span class="ncr-age overdue">'+age+' days overdue</span>';
  }
  const irOverdueFilter = navFilter==='overdue'; navFilter=null;
  document.getElementById('content').innerHTML = `
  <div class="module-bar">
    <div class="module-stat"><div class="module-stat-val ${pending>0?'warn':''}">${pending}</div><div class="module-stat-label">Pending</div></div>
    <div class="module-stat"><div class="module-stat-val ${overdue>0?'danger':''}">${overdue}</div><div class="module-stat-label">SLA Overdue</div></div>
    <div class="module-stat"><div class="module-stat-val">${responded}</div><div class="module-stat-label">Responded</div></div>
    <div class="module-stat"><div class="module-stat-val">${thisWeek}</div><div class="module-stat-label">This Week</div></div>
  </div>
  <div class="fbar">
    <select class="filter-sel" onchange="filt('ir','status',this.value)" id="ir-status-sel">
      <option value="All">All Statuses</option>
      <option>Pending</option><option>Approved</option><option>Approved as Noted</option><option>Correction</option><option>Rejected</option><option>Re-Inspection</option><option value="Overdue">Overdue</option>
    </select>
    <input type="text" class="reg-search" style="margin-left:auto" placeholder="Search inspections..." oninput="searchReg('ir',this.value)" />
  </div>
  <div class="card"><div class="tw"><table>
    <tr>
      <th style="width:32px;text-align:center"><input type="checkbox" id="ir-select-all" onchange="selectAllRows('ir',selectedIRs,'bulk-bar-ir','ir-sel-count')" /></th>
      <th>Ref No.</th><th>Rev</th><th>Elements</th><th>Location</th><th>Due Date</th><th>SLA</th><th>Checklist</th><th>Status</th><th>Actions</th>
    </tr>
    ${rows.length?rows.map(i=>{
      const hasChecklist = i.checklist&&Object.keys(i.checklist||{}).length>0;
      const ckTotal = hasChecklist?Object.keys(i.checklist).length:0;
      const ckPassed = hasChecklist?Object.values(i.checklist).filter(v=>v==='pass').length:0;
      const irIsOverdue = i.due_date&&i.due_date<todayStr&&i.status==='Pending';
      const irIsSoon = !irIsOverdue&&i.due_date&&i.status==='Pending'&&(new Date(i.due_date)-today)<=3*86400000;
      return `<tr class="ir-row" data-status="${i.status}" data-overdue="${irIsOverdue?'1':'0'}" data-id="${i.id}" data-search="${[i.ref_no,i.location,i.elements].filter(Boolean).join(' ').replace(/"/g,' ').toLowerCase()}" style="${irIsOverdue?'border-left:2px solid var(--red)':irIsSoon?'border-left:2px solid var(--amber)':''}">
        <td style="text-align:center"><input type="checkbox" class="row-cb" id="ircb-${i.id}" onchange="toggleRowSelect('${i.id}',selectedIRs,'ir','bulk-bar-ir','ir-sel-count')" /></td>
        <td class="mono">${i.ref_no}${i.parent_ir_id?'<span style="font-size:9px;color:var(--amber);margin-left:4px">↻</span>':''}</td>
        <td><span class="rev-chip">R${i.revision||'00'}</span></td>
        <td style="color:var(--blue);cursor:pointer;max-width:180px" onclick="viewIR('${i.id}')">${(i.elements||'').substring(0,45)}${(i.elements||'').length>45?'…':''}</td>
        <td style="color:var(--text2);font-size:10px">${i.location||'—'}</td>
        <td>${overdueTag(i.due_date)}</td>
        <td>${slaTag(i)}</td>
        <td style="font-size:10px;color:var(--text2)">${hasChecklist?ckPassed+'/'+ckTotal+' pass':'—'}</td>
        <td>${sbadge(i.status)}</td>
        <td><div style="display:flex;gap:4px">
          <button class="btn btn-sm" onclick="viewIR('${i.id}')">View</button>
          ${can('approve')&&i.status==='Pending'?`<button class="btn btn-sm btn-primary" onclick="respondIR('${i.id}')">Respond</button>`:''}
          ${!can('approve')&&i.status==='Rejected'?`<button class="btn btn-sm" onclick="reInspect('${i.id}')">Re-Inspect</button>`:''}
        </div></td>
      </tr>`;
    }).join(''):'<tr><td colspan="10" class="empty-state">No inspection requests yet.</td></tr>'}
    <tr id="srch-empty-ir" style="display:none"><td colspan="10" class="empty-state"></td></tr>
  </table>
  <div class="record-footer">Showing ${rows.length} record${rows.length!==1?'s':''}</div>
  </div></div>
  <div id="bulk-bar-ir" class="bulk-bar">
    <div class="bulk-bar-inner">
      <span id="ir-sel-count" class="bulk-bar-count">0 selected</span>
      <button class="btn btn-sm" onclick="bulkExportCSV('inspections','*','inspections.csv')">Export Selected</button>
      ${currentProfile?.role==='developer'?`<button class="btn btn-sm btn-danger" onclick="bulkDelete('inspections',selectedIRs,'ir','bulk-bar-ir','ir-sel-count')">Delete Selected</button>`:''}
      <button class="btn btn-sm" style="margin-left:auto" onclick="clearSelection(selectedIRs,'ir','bulk-bar-ir','ir-sel-count')">Clear</button>
    </div>
  </div>`;
  if(irOverdueFilter) {
    filt('ir','status','Overdue');
  }
}


// ─── NCRs ─────────────────────────────────────────────────────────
async function renderNCRs() {
  const {data} = await sb.from('ncrs').select('*').eq('project_id',currentProject.id).order('created_at',{ascending:false});
  const rows = data||[];
  const today = new Date(); const todayStr = today.toISOString().split('T')[0];
  const open = rows.filter(r=>r.status==='Open').length;
  const capPending = rows.filter(r=>r.status==='CAP Submitted').length;
  const overdue = rows.filter(r=>{
    if(r.status==='Closed'||!r.raised_date) return false;
    return Math.floor((today-new Date(r.raised_date))/86400000)>30;
  }).length;
  const closed = rows.filter(r=>r.status==='Closed').length;
  const ncrOverdueFilter = navFilter==='overdue'; navFilter=null;
  function ageTag(row) {
    if(row.status==='Closed') return '';
    if(!row.raised_date) return '';
    const age = Math.floor((today - new Date(row.raised_date)) / 86400000);
    const cls = age<=7?'fresh':age<=14?'warning':'overdue';
    return `<span class="ncr-age ${cls}">${age}d</span>`;
  }
  document.getElementById('content').innerHTML = `
  <div class="module-bar">
    <div class="module-stat"><div class="module-stat-val ${open>0?'danger':''}">${open}</div><div class="module-stat-label">Open</div></div>
    <div class="module-stat"><div class="module-stat-val ${capPending>0?'warn':''}">${capPending}</div><div class="module-stat-label">CAP Pending</div></div>
    <div class="module-stat"><div class="module-stat-val ${overdue>0?'danger':''}">${overdue}</div><div class="module-stat-label">&gt;30 Days</div></div>
    <div class="module-stat"><div class="module-stat-val">${closed}</div><div class="module-stat-label">Closed</div></div>
  </div>
  <div class="fbar">
    <select class="filter-sel" onchange="filt('ncr','status',this.value)" id="ncr-status-sel">
      <option value="All">All Statuses</option>
      <option>Open</option><option>CAP Submitted</option><option>CAP Verified</option><option>Closed</option><option value="Overdue">Overdue (&gt;30d)</option>
    </select>
    <select class="filter-sel" onchange="filt('ncr','root_cause',this.value)">
      <option value="All">All Root Causes</option>
      <option>Design Error</option><option>Material Non-compliance</option><option>Workmanship</option><option>Coordination Failure</option>
    </select>
    <input type="text" class="reg-search" style="margin-left:auto" placeholder="Search NCRs..." oninput="searchReg('ncr',this.value)" />
  </div>
  <div class="card"><div class="tw"><table>
    <tr>
      <th style="width:32px;text-align:center"><input type="checkbox" id="ncr-select-all" onchange="selectAllRows('ncr',selectedNCRs,'bulk-bar-ncr','ncr-sel-count')" /></th>
      <th>Ref</th><th>Title</th><th>Root Cause</th><th>Location</th><th>Age</th><th>Severity</th><th>CAP</th><th>Status</th><th>Actions</th>
    </tr>
    ${rows.length?rows.map(n=>{
      const ncrAge = n.raised_date?Math.floor((today-new Date(n.raised_date))/86400000):0;
      const ncrIsOverdue = n.status!=='Closed'&&ncrAge>30;
      const ncrIsSoon = !ncrIsOverdue&&n.status!=='Closed'&&ncrAge>14;
      return `<tr class="ncr-row" data-status="${n.status}" data-root_cause="${n.root_cause||''}" data-overdue="${ncrIsOverdue?'1':'0'}" data-id="${n.id}" data-search="${[n.ref_no,n.title,n.location].filter(Boolean).join(' ').replace(/"/g,' ').toLowerCase()}" style="${ncrIsOverdue?'border-left:2px solid var(--red)':ncrIsSoon?'border-left:2px solid var(--amber)':''}">
      <td style="text-align:center"><input type="checkbox" class="row-cb" id="ncrcb-${n.id}" onchange="toggleRowSelect('${n.id}',selectedNCRs,'ncr','bulk-bar-ncr','ncr-sel-count')" /></td>
      <td class="mono">${n.ref_no}</td>
      <td style="color:var(--blue);cursor:pointer" onclick="viewNCR('${n.id}')">${n.title}</td>
      <td style="font-size:10px;color:var(--text2)">${n.root_cause||'—'}</td>
      <td style="color:var(--text2);font-size:10px">${n.location||'—'}</td>
      <td>${ageTag(n)}</td>
      <td>${sbadge(n.severity)}</td>
      <td style="font-size:10px">${n.cap_submitted_date?'<span style="color:var(--green)">Submitted</span>':'<span style="color:var(--text3)">Pending</span>'}</td>
      <td>${sbadge(n.status)}</td>
      <td><div style="display:flex;gap:4px">
        <button class="btn btn-sm" onclick="viewNCR('${n.id}')">View</button>
        ${!can('approve')&&n.status==='Open'?`<button class="btn btn-sm btn-success" onclick="submitCAP('${n.id}')">Submit CAP</button>`:''}
        ${can('approve')&&n.status==='CAP Submitted'?`<button class="btn btn-sm btn-success" onclick="verifyCAP('${n.id}')">Verify CAP</button>`:''}
        ${can('approve')&&n.status==='CAP Verified'?`<button class="btn btn-sm" onclick="closeNCR('${n.id}')">Close</button>`:''}
      </div></td>
    </tr>`;}).join(''):'<tr><td colspan="10" class="empty-state">No NCRs raised.</td></tr>'}
    <tr id="srch-empty-ncr" style="display:none"><td colspan="10" class="empty-state"></td></tr>
  </table>
  <div class="record-footer">Showing ${rows.length} record${rows.length!==1?'s':''}</div>
  </div></div>
  <div id="bulk-bar-ncr" class="bulk-bar">
    <div class="bulk-bar-inner">
      <span id="ncr-sel-count" class="bulk-bar-count">0 selected</span>
      <button class="btn btn-sm" onclick="bulkExportCSV('ncrs','*','ncrs.csv')">Export Selected</button>
      ${currentProfile?.role==='developer'?`<button class="btn btn-sm btn-danger" onclick="bulkDelete('ncrs',selectedNCRs,'ncr','bulk-bar-ncr','ncr-sel-count')">Delete Selected</button>`:''}
      <button class="btn btn-sm" style="margin-left:auto" onclick="clearSelection(selectedNCRs,'ncr','bulk-bar-ncr','ncr-sel-count')">Clear</button>
    </div>
  </div>`;
  if(ncrOverdueFilter) {
    filt('ncr','status','Overdue');
  }
}

async function viewIR(id) {
  const [{data:i},comments,atts] = await Promise.all([
    sb.from('inspections').select('*, subcontractors(name,rep)').eq('id',id).single(),
    loadComments('inspection',id),
    loadAttachments('inspection',id)
  ]);
  if(!i) return;
  const dept = typeof i.department==='object'?i.department:{};
  function cb(v){return `<span class="ir-cb ${v?'ir-checked':''}"></span>`;}
  const scName = i.subcontractors?.name||PROJECT.contractor;
  const scRep = i.subcontractors?.rep||i.rep||'—';
  const irHTML = `<div class="ir-preview">
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;border:1px solid #888;margin-bottom:0">
      <div style="border-right:1px solid #888;padding:6px;font-size:10px;font-weight:700">Client<br><span style="font-style:italic;color:#00008B;font-weight:400">regent DEVELOPMENTS</span></div>
      <div style="border-right:1px solid #888;padding:6px;font-size:10px;font-weight:700">Consultant<br><span style="font-weight:400;font-size:9px">POE ENGINEERING CONSULTANTS</span></div>
      <div style="border-right:1px solid #888;padding:6px;font-size:10px;font-weight:700">Main Contractor<br><span style="font-weight:400;font-size:9px">${PROJECT.contractor}</span></div>
      <div style="padding:6px;font-size:10px;font-weight:700">Enabling Contractor<br><span style="font-weight:400;font-size:9px">${scName}</span></div>
    </div>
    <div style="text-align:center;font-size:15px;font-weight:700;margin:8px 0">WORK INSPECTION REQUEST</div>
    <div class="tw"><table>
      <tr><td style="font-weight:700;font-size:10px;width:32%">Project: ${PROJECT.name}</td><td style="font-size:10px">Ref. No: <b>${i.ref_no}</b></td><td style="font-size:10px">Rev. No: <b>${i.revision||'00'}</b></td></tr>
      <tr><td style="font-size:10px">Plot No.: <b>${i.plot||PROJECT.plot}</b></td><td style="font-size:10px">Location: <b>${i.location||'—'}</b></td><td style="font-size:10px">City: <b>${i.city||PROJECT.city}</b></td></tr>
      <tr><td colspan="3" style="font-size:10px"><b>Enabling Contractor: ${scName}</b></td></tr>
      <tr><td colspan="3" style="font-size:10px"><b>Contractor's Representative On Site:</b> ${scRep}</td></tr>
      <tr><td colspan="3" style="padding:6px"><b style="font-size:10px">Department:</b><br>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;font-size:10px;gap:3px;margin-top:3px">
          <div>${cb(dept.arch)} Architectural</div><div>${cb(dept.elec)} Electrical</div><div>${cb(dept.fire)} Firefighting</div>
          <div>${cb(dept.plumb)} Plumbing</div><div>${cb(dept.structural)} Structural</div><div>${cb(dept.mep)} MEP</div>
          <div>${cb(dept.civil)} Civil</div>
        </div></td></tr>
      <tr><td colspan="3" style="font-weight:700;font-size:10px">Element(s) To Be Inspected:</td></tr>
      <tr><td colspan="3" style="font-size:11px;padding:8px">${i.elements||'—'}<br><br><span style="font-size:9px;color:#555">We hereby as the main contractor confirm that the work has been checked completed to comply with the specification and drawings and ready for inspection.</span></td></tr>
      <tr><td colspan="2" style="font-weight:700;font-size:10px">Request For Inspection Any Time After: ${i.inspection_time||'8:00am'}</td><td style="font-weight:700;font-size:10px;text-align:right">On: ${i.inspection_date||'—'}</td></tr>
      <tr><td style="font-size:10px"><b>Enabling Contractor:</b> ${scRep}</td><td style="font-size:10px">Signature: ___________</td><td style="font-size:10px">Date: ${i.request_date||'—'}</td></tr>
      <tr><td style="font-size:10px"><b>Resident Engineer's Name:</b></td><td style="font-size:10px">Signature: ___________</td><td style="font-size:10px">Date: ___________</td></tr>
      <tr><td style="font-size:10px"><b>Site Contractor Engineer:</b> ${i.site_engineer||'—'}</td><td colspan="2" style="font-size:10px">Signature: ___________ &nbsp; Date: ___________</td></tr>
      <tr><td colspan="3" style="text-align:center;font-weight:700;font-size:10px;background:#f5f5f5">Below portion for Pioneers of Experts Engineering Consultants (POE) use only</td></tr>
      <tr><td colspan="3" style="padding:6px;font-size:10px"><b>Status:</b> &nbsp;
        ${cb(i.status==='Approved')} Approved &nbsp;&nbsp;
        ${cb(i.status==='Approved as Noted')} Approved as noted &nbsp;&nbsp;
        ${cb(i.status==='Correction')} Correction &nbsp;&nbsp;
        ${cb(i.status==='Rejected')} Rejected
      </td></tr>
      <tr><td colspan="3" style="padding:8px;font-size:10px;min-height:60px"><b>Comments:</b><br>${i.comments||'&nbsp;<br>&nbsp;<br>&nbsp;'}</td></tr>
      <tr><td style="font-weight:700;font-size:10px;text-decoration:underline">Inspected By</td><td style="font-weight:700;font-size:10px;text-decoration:underline">Resident Engineer</td><td style="font-weight:700;font-size:10px;text-decoration:underline">Handed Over To</td></tr>
      <tr><td style="font-size:10px">Signature: ___________</td><td style="font-size:10px">Signature: ___________</td><td style="font-size:10px">Signature: ___________</td></tr>
      <tr><td style="font-size:10px">Name: ${i.inspected_by||'___________'}</td><td style="font-size:10px">Name: ___________</td><td style="font-size:10px">Name: ___________</td></tr>
      <tr><td style="font-size:10px">Date: ___________</td><td style="font-size:10px">Date: ${i.response_date||'___________'}</td><td style="font-size:10px">Date: ___________</td></tr>
    </table></div>
    <div style="text-align:center;font-size:9px;margin-top:6px;color:#777">This form is to be handed 24 hours prior the inspection requested time</div>
  </div>`;
  // Checklist section
  const ckData = i.checklist||{};
  const ckItems = Object.keys(ckData);
  const ckHTML = ckItems.length ? `
    <div class="detail-section">
      <div class="detail-label" style="margin-bottom:8px">Inspection Checklist</div>
      <div style="border:0.5px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:8px">
        ${ckItems.map(item=>`<div class="checklist-item">
          <div class="checklist-label">${item}</div>
          <span class="ck-btn ${ckData[item]==='pass'?'pass':ckData[item]==='fail'?'fail':ckData[item]==='na'?'na':''}">${ckData[item]==='pass'?'Pass':ckData[item]==='fail'?'Fail':ckData[item]==='na'?'N/A':'Pending'}</span>
        </div>`).join('')}
      </div>
      ${i.checklist_notes?`<div style="font-size:11px;color:var(--text2);padding:6px 0"><b>Notes:</b> ${i.checklist_notes}</div>`:''}
    </div>` : `<div class="detail-section">
      <div class="detail-label" style="margin-bottom:6px">Inspection Checklist</div>
      <div style="font-size:11px;color:var(--text3)">No checklist recorded yet.</div>
    </div>`;
  const parentInfo = i.parent_ir_id?`<div style="background:var(--amber-bg);border:0.5px solid #FAC775;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:11px;color:var(--amber)">Re-inspection — linked to original IR</div>`:'';
  const irWrapped = parentInfo+`<div id='ir-print-${id}'>${irHTML}</div>`+ckHTML+attachmentSectionHTML('inspection',id,atts);
  // Checklist template selector
  const ckSelector = `<select id="ck-tmpl-${id}" class="form-control" style="font-size:11px;padding:4px 8px;width:auto">
    ${Object.keys(IR_TEMPLATES).map(t=>`<option>${t}</option>`).join('')}
  </select>`;
  openModal(`IR – ${i.ref_no} Rev.${i.revision||'00'}`, irWrapped,
    `${can('approve')&&i.status==='Pending'?`<button class="btn btn-success" onclick="respondIR('${id}')">Record Response</button>`:''}
     ${ckSelector}
     <button class="btn" onclick="openChecklistModal('${id}',document.getElementById('ck-tmpl-${id}').value)">Fill Checklist</button>
     <button class="btn" onclick="viewAuditTrail('inspection','${id}','${i.ref_no}')">View Audit Trail</button>
     <button class="btn" onclick="printDoc('ir-print-${id}','IR_${i.ref_no}.pdf')">Download PDF</button>
     <button class="btn" onclick="closeModal()">Close</button>`, true);
}

async function viewNCR(id) {
  const [{data:n},comments,atts] = await Promise.all([
    sb.from('ncrs').select('*').eq('id',id).single(),
    loadComments('ncr',id),
    loadAttachments('ncr',id)
  ]);
  if(!n) return;
  const cb = (checked) => `<span style="display:inline-block;width:11px;height:11px;border:1.2px solid #333;margin-right:3px;vertical-align:middle;text-align:center;font-size:9px;line-height:11px;font-weight:700">${checked?'&#10005;':''}</span>`;
  const ncrDoc = `<div id="ncr-print-${n.id}" style="background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;font-size:10.5px;padding:18px">
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;border:.7px solid #aaa;margin-bottom:8px">
      <div style="padding:8px;border-right:.7px solid #aaa"><div style="font-size:14px;font-weight:700;color:#00008B">POE</div><div style="font-size:9px">ENGINEERING CONSULTANTS</div></div>
      <div style="padding:8px;border-right:.7px solid #aaa;text-align:center"><div style="font-size:18px;font-style:italic;color:#00008B">regent</div><div style="font-size:9px">DEVELOPMENTS</div></div>
      <div style="padding:6px;text-align:right;font-size:9px">Modern Building Contracting L.L.C<br>Tel.: 04-2344445</div>
    </div>
    <div style="text-align:center;font-weight:700;font-size:12px;text-decoration:underline;padding:5px;border:.7px solid #888;margin-bottom:0;color:#000">NON-CONFORMANCE REPORT (NCR)</div>
    <div class="tw"><table style="width:100%;border-collapse:collapse;color:#000">
      <tr>
        <td style="border:.7px solid #888;padding:4px 7px;font-weight:700;width:25%">NCR Ref No.:</td>
        <td style="border:.7px solid #888;padding:4px 7px;color:#8B0000;font-weight:700">${n.ref_no}</td>
        <td style="border:.7px solid #888;padding:4px 7px;font-weight:700;width:20%">Date Raised:</td>
        <td style="border:.7px solid #888;padding:4px 7px;color:#8B0000;font-weight:700">${n.raised_date||'—'}</td>
      </tr>
      <tr>
        <td style="border:.7px solid #888;padding:4px 7px;font-weight:700">Project:</td>
        <td colspan="3" style="border:.7px solid #888;padding:4px 7px">Golf Grove – Residential Building (B+G+P+7+Roof) – Plot 6850752</td>
      </tr>
      <tr>
        <td style="border:.7px solid #888;padding:4px 7px;font-weight:700">Raised By:</td>
        <td style="border:.7px solid #888;padding:4px 7px">${n.raised_by||'—'}</td>
        <td style="border:.7px solid #888;padding:4px 7px;font-weight:700">Location:</td>
        <td style="border:.7px solid #888;padding:4px 7px">${n.location||'—'}</td>
      </tr>
      <tr>
        <td style="border:.7px solid #888;padding:4px 7px;font-weight:700">Severity:</td>
        <td colspan="3" style="border:.7px solid #888;padding:4px 7px">
          ${cb(n.severity==='Major')} <b style="${n.severity==='Major'?'color:#8B0000':''}">Major</b> &nbsp;&nbsp;&nbsp;
          ${cb(n.severity==='Minor')} Minor
        </td>
      </tr>
      <tr><td colspan="4" style="border:.7px solid #888;padding:4px 7px;font-weight:700;background:#f5f5f5">Description of Non-Conformance:</td></tr>
      <tr><td colspan="4" style="border:.7px solid #888;padding:10px 7px;min-height:60px">${n.cause||'—'}</td></tr>
      <tr><td colspan="4" style="border:.7px solid #888;padding:4px 7px;font-weight:700;background:#f5f5f5">Corrective Action / Contractor Response:</td></tr>
      <tr><td colspan="4" style="border:.7px solid #888;padding:10px 7px;min-height:40px">${n.corrective_action||'Pending contractor response.'}</td></tr>
      <tr>
        <td style="border:.7px solid #888;padding:4px 7px;font-weight:700">Status:</td>
        <td colspan="3" style="border:.7px solid #888;padding:4px 7px">
          ${cb(n.status==='Open')} <b style="${n.status==='Open'?'color:#8B0000':''}">Open</b> &nbsp;&nbsp;&nbsp;
          ${cb(n.status==='Closed')} <b style="${n.status==='Closed'?'color:#1a5e1a':''}">Closed</b> &nbsp;&nbsp;&nbsp;
          Date Closed: ${n.closed_date||'___________'}
        </td>
      </tr>
    </table></div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;margin-top:10px">
      <div style="border:.7px solid #888;padding:8px;text-align:center;font-size:10px"><b>Raised By (Consultant)</b><br><br><br>Signature: ___________<br>Name: ${n.raised_by||'___________'}<br>Date: ${n.raised_date||'___________'}</div>
      <div style="border:.7px solid #888;padding:8px;text-align:center;font-size:10px"><b>Acknowledged By (Contractor)</b><br><br><br>Signature: ___________<br>Name: ___________<br>Date: ___________</div>
      <div style="border:.7px solid #888;padding:8px;text-align:center;font-size:10px"><b>Closed By (Consultant)</b><br><br><br>Signature: ___________<br>Name: ${n.closed_by||'___________'}<br>Date: ${n.closed_date||'___________'}</div>
    </div>
    <div style="margin-top:8px;font-size:9px;color:#888;display:flex;justify-content:space-between">
      <span>Golf Grove DMS | Regent Developments | ${n.ref_no}</span><span>Page 1 of 1</span>
    </div>
  </div>`;
  // CAP workflow status display
  const capSection = `<div class="detail-section" style="margin-top:12px">
    <div class="detail-label" style="margin-bottom:8px">NCR Workflow</div>
    <div class="workflow-step ${n.raised_date?'done':'pending'}"><span>✓</span> NCR Raised ${n.raised_date?'on '+n.raised_date:''}</div>
    <div class="workflow-step ${n.cap_submitted_date?'done':n.status==='Open'?'active':'pending'}"><span>${n.cap_submitted_date?'✓':'→'}</span> CAP Submission ${n.cap_submitted_date?'by '+n.cap_submitted_by+' on '+n.cap_submitted_date:'— awaiting contractor'}</div>
    ${n.corrective_action&&n.cap_submitted_date?`<div style="background:var(--bg3);border-radius:6px;padding:8px 12px;margin:-2px 0 4px 24px;font-size:11px;color:var(--text2)">${n.corrective_action}</div>`:''}
    <div class="workflow-step ${n.cap_verified_date?'done':n.status==='CAP Submitted'?'active':'pending'}"><span>${n.cap_verified_date?'✓':'○'}</span> CAP Verified ${n.cap_verified_date?'by '+n.cap_verified_by+' on '+n.cap_verified_date:'— awaiting consultant'}</div>
    <div class="workflow-step ${n.status==='Closed'?'done':'pending'}"><span>${n.status==='Closed'?'✓':'○'}</span> NCR Closed ${n.closed_date?'on '+n.closed_date:''}</div>
  </div>`;
  const closeSection = can('approve')&&n.status==='Open'?`<div class="detail-section" style="margin-top:14px">
    <div class="form-group" style="margin-bottom:10px"><label class="form-label-dark">Corrective Action Taken</label><textarea class="form-control" id="ncr-ca-${n.id}" placeholder="Describe corrective action taken..." style="min-height:70px"></textarea></div>
    <div class="frow">
      <div class="form-group"><label class="form-label-dark">Closed By – Engineer Name <span style="color:var(--color-text-danger)">*</span></label><input type="text" class="form-control" id="ncr-eng-${n.id}" placeholder="Enter engineer's full name" /></div>
      <div class="form-group"><label class="form-label-dark">Closing Date</label><input type="date" class="form-control" id="ncr-dt-${n.id}" value="${new Date().toISOString().split('T')[0]}" /></div>
    </div>
  </div>`:'';
  openModal(`${n.ref_no} – ${n.title}`, ncrDoc+capSection+closeSection+attachmentSectionHTML('ncr',n.id,atts)+commentThreadHTML('ncr',n.id,comments),
    `${can('approve')&&n.status==='Open'?`<button class="btn btn-success" onclick="doCloseNCR('${n.id}')">Close NCR</button>`:''}
     <button class="btn" onclick="viewAuditTrail('ncr','${n.id}','${n.ref_no}')">View Audit Trail</button>
     <button class="btn" onclick="printDoc('ncr-print-${n.id}','NCR_${n.ref_no}.pdf')">Download PDF</button>
     <button class="btn" onclick="closeModal()">Close</button>`, true);
}

function respondIR(id) {
  openModal(`Record Inspection Response – ${id}`, `
    <div class="form-group"><label class="form-label-dark">Status</label>
      <select class="form-control" id="ir-st-${id}">
        <option value="Approved">Approved</option>
        <option value="Approved as Noted">Approved as noted</option>
        <option value="Correction">Correction</option>
        <option value="Rejected">Rejected</option>
      </select>
    </div>
    <div class="form-group"><label class="form-label-dark">Comments</label><textarea class="form-control" id="ir-cm-${id}" placeholder="Enter inspection findings and comments..." style="min-height:100px"></textarea></div>
    <div class="frow">
      <div class="form-group"><label class="form-label-dark">Resident Engineer – Name <span style="color:var(--color-text-danger)">*</span></label><input type="text" class="form-control" id="ir-ib-${id}" placeholder="Enter engineer's full name" /></div>
      <div class="form-group"><label class="form-label-dark">Response Date</label><input type="date" class="form-control" id="ir-dt-${id}" value="${new Date().toISOString().split('T')[0]}" /></div>
    </div>
    <div style="font-size:11px;color:var(--color-text-tertiary);padding:6px 0">This name will appear on the IR form as the signing Resident Engineer.</div>`,
    `<button class="btn btn-primary" onclick="doRespondIR('${id}')">Submit Response</button><button class="btn" onclick="closeModal()">Cancel</button>`);
}

async function doRespondIR(id) {
  const engName = document.getElementById('ir-ib-'+id)?.value?.trim();
  if(!engName){toast("Please enter the Resident Engineer's name",'error');return;}
  const irStatus = document.getElementById('ir-st-'+id).value;
  await sb.from('inspections').update({
    status: irStatus,
    comments: document.getElementById('ir-cm-'+id).value,
    inspected_by: engName,
    response_date: document.getElementById('ir-dt-'+id).value,
  }).eq('id',id);
  await logAudit(id, 'inspection', 'IR Response: ' + irStatus);
  toast('Inspection response recorded','success'); closeModal(); render();
}

async function doCloseNCR(id) {
  const role = currentProfile?.role;
  if(role !== 'consultant' && role !== 'developer') {
    toast('Only consultants and developers can close NCRs','error'); return;
  }
  const ca = document.getElementById('ncr-ca-'+id);
  const {error} = await sb.from('ncrs').update({
    status:'Closed',
    corrective_action: ca?ca.value:'Corrective action completed.',
    closed_date: new Date().toISOString().split('T')[0]
  }).eq('id',id);
  if(error){toast('Error: '+error.message,'error');return;}
  const audited = await logAudit(id, 'ncr', 'NCR: Closed');
  if(!audited) {
    await sb.from('ncrs').update({status:'Open', closed_date:null}).eq('id',id);
    toast('NCR closure reverted — audit log failed. Please try again.','error');
    return;
  }
  toast('NCR closed','success'); closeModal(); render();
}

// ─── NEW IR FORM ──────────────────────────────────────────────────
async function openNewIR() {
  const {data:scs} = await sb.from('subcontractors').select('*').eq('project_id',currentProject.id);
  const scOpts = (scs||[]).map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  openModal('New Work Inspection Request', `
    <div class="frow3">
      <div class="form-group"><label class="form-label-dark">Ref No.</label><input type="text" class="form-control" id="ni-id" placeholder="MBC-IR-001" /></div>
      <div class="form-group"><label class="form-label-dark">Rev No.</label><input type="text" class="form-control" id="ni-rev" value="00" /></div>
      <div class="form-group"><label class="form-label-dark">Inspection Time</label><input type="text" class="form-control" id="ni-time" value="8:00am" /></div>
    </div>
    <div class="frow">
      <div class="form-group"><label class="form-label-dark">Subcontractor</label><select class="form-control" id="ni-sc"><option value="">Main Contractor (MBC)</option>${scOpts}</select></div>
      <div class="form-group"><label class="form-label-dark">Inspection Date</label><input type="text" class="form-control" id="ni-date" placeholder="e.g. 10APR 2026" /></div>
    </div>
    <div class="form-group"><label class="form-label-dark">Response Due Date</label><input type="date" class="form-control" id="ni-due" /></div>
    <div class="frow">
    </div>
    <div class="form-group"><label class="form-label-dark">Location</label><input type="text" class="form-control" id="ni-loc" placeholder="e.g. Level 4 – Grid C-E" /></div>
    <div class="form-group"><label class="form-label-dark">Elements to be Inspected</label><textarea class="form-control" id="ni-elem" placeholder="Describe the work elements to be inspected..." style="min-height:80px"></textarea></div>
    <div class="form-group"><label class="form-label-dark">Department</label>
      <div class="checkbox-grid">
        <label><input type="checkbox" id="ni-arch"> Architectural</label>
        <label><input type="checkbox" id="ni-elec"> Electrical</label>
        <label><input type="checkbox" id="ni-fire"> Firefighting</label>
        <label><input type="checkbox" id="ni-plumb"> Plumbing</label>
        <label><input type="checkbox" id="ni-struct"> Structural</label>
        <label><input type="checkbox" id="ni-mep"> MEP</label>
        <label><input type="checkbox" id="ni-civil"> Civil</label>
      </div>
    </div>
    <div class="frow">
      <div class="form-group"><label class="form-label-dark">Contractor's Rep on Site</label><input type="text" class="form-control" id="ni-rep" placeholder="Name" /></div>
      <div class="form-group"><label class="form-label-dark">Site Engineer</label><input type="text" class="form-control" id="ni-eng" placeholder="Name" /></div>
    </div>
    <div class="form-group"><label class="form-label-dark">Request Date</label><input type="text" class="form-control" id="ni-reqdate" placeholder="${new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}).toUpperCase()}" /></div>
    <div class="form-group"><label class="form-label-dark">Attachments (optional)</label>
      <div class="upload-zone" style="padding:14px 16px;display:flex;align-items:center;gap:10px;text-align:left" onclick="document.getElementById('ni-files').click()" ondragover="event.preventDefault();this.classList.add('dragging')" ondragleave="this.classList.remove('dragging')" ondrop="event.preventDefault();this.classList.remove('dragging');stageFiles(event.dataTransfer.files,'ni-staged')"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;opacity:.6"><path d="M8 2v8M5 5l3-3 3 3" stroke="var(--text2)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 11v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="var(--text2)" stroke-width="1.3" stroke-linecap="round"/></svg><span style="font-size:12px;color:var(--text2)">Click to attach or drag & drop — PDF, DWG, Images, Word, Excel (max 50MB)</span></div>
      <input type="file" id="ni-files" multiple style="display:none" onchange="stageFiles(this.files,'ni-staged')" />
      <div id="ni-staged" style="display:flex;flex-direction:column;gap:4px;margin-top:6px"></div>
    </div>`,
    `<button class="btn btn-primary" onclick="doNewIR()">Create Inspection Request</button><button class="btn" onclick="closeModal()">Cancel</button>`);
}
async function doNewIR() {
  const ref = document.getElementById('ni-id').value;
  const elem = document.getElementById('ni-elem').value;
  if(!ref||!elem){toast('Ref number and elements are required','error');return;}
  const scId = document.getElementById('ni-sc').value||null;
  const {data:sc} = scId?await sb.from('subcontractors').select('rep').eq('id',scId).single():{data:null};
  const {data:newIR,error} = await sb.from('inspections').insert({project_id:currentProject.id,
    ref_no:ref,revision:document.getElementById('ni-rev').value,
    plot:PROJECT.plot,location:document.getElementById('ni-loc').value,
    city:PROJECT.city,subcontractor_id:scId||null,
    rep:sc?.rep||document.getElementById('ni-rep').value,
    site_engineer:document.getElementById('ni-eng').value,
    department:{arch:document.getElementById('ni-arch').checked,elec:document.getElementById('ni-elec').checked,fire:document.getElementById('ni-fire').checked,plumb:document.getElementById('ni-plumb').checked,structural:document.getElementById('ni-struct').checked,mep:document.getElementById('ni-mep').checked,civil:document.getElementById('ni-civil').checked},
    elements:elem,
    inspection_time:document.getElementById('ni-time').value,
    inspection_date:document.getElementById('ni-date').value,
    request_date:document.getElementById('ni-reqdate').value,
    status:'Pending',
    due_date:document.getElementById('ni-due')?.value||null
  }).select().single();
  if(error){toast('Error: '+error.message,'error');return;}
  if(newIR?.id) {
    await uploadStagedFiles('ni-staged','inspection',newIR.id);
    await logAudit(newIR.id, 'inspection', 'IR Raised: '+ref);
  }
  toast('Inspection request created','success'); closeModal(); render();
}


// ─── NEW NCR FORM ─────────────────────────────────────────────────
function openNewNCR() {
  openModal('Raise NCR', `
    <div class="form-group"><label class="form-label-dark">Title</label><input type="text" class="form-control" id="nn-title" placeholder="Brief description of non-conformance" /></div>
    <div class="frow">
      <div class="form-group"><label class="form-label-dark">Location</label><input type="text" class="form-control" id="nn-loc" placeholder="e.g. Level 3 – Column B2" /></div>
      <div class="form-group"><label class="form-label-dark">Severity</label><select class="form-control" id="nn-sev"><option>Minor</option><option>Major</option></select></div>
    </div>
    <div class="frow">
      <div class="form-group"><label class="form-label-dark">Root Cause</label>
        <select class="form-control" id="nn-rc">
          <option value="">Select root cause...</option>
          <option>Design Error</option><option>Material Non-compliance</option>
          <option>Workmanship</option><option>Coordination Failure</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label-dark">Linked Drawing (optional)</label>
        <input type="text" class="form-control" id="nn-draw" placeholder="e.g. DWG-S-042" />
      </div>
    </div>
    <div class="form-group"><label class="form-label-dark">Description / Cause</label><textarea class="form-control" id="nn-cause" placeholder="Describe the non-conformance..." style="min-height:80px"></textarea></div>
    <div class="form-group"><label class="form-label-dark">Attachments (optional)</label>
      <div class="upload-zone" style="padding:14px 16px;display:flex;align-items:center;gap:10px;text-align:left" onclick="document.getElementById('nn-files').click()" ondragover="event.preventDefault();this.classList.add('dragging')" ondragleave="this.classList.remove('dragging')" ondrop="event.preventDefault();this.classList.remove('dragging');stageFiles(event.dataTransfer.files,'nn-staged')"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;opacity:.6"><path d="M8 2v8M5 5l3-3 3 3" stroke="var(--text2)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 11v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="var(--text2)" stroke-width="1.3" stroke-linecap="round"/></svg><span style="font-size:12px;color:var(--text2)">Click to attach or drag & drop — PDF, DWG, Images, Word, Excel (max 50MB)</span></div>
      <input type="file" id="nn-files" multiple style="display:none" onchange="stageFiles(this.files,'nn-staged')" />
      <div id="nn-staged" style="display:flex;flex-direction:column;gap:4px;margin-top:6px"></div>
    </div>`,
    `<button class="btn btn-primary" onclick="doNewNCR()">Raise NCR</button><button class="btn" onclick="closeModal()">Cancel</button>`);
}
async function doNewNCR() {
  const title = document.getElementById('nn-title').value;
  if(!title){toast('Title is required','error');return;}
  console.log('[NCR] insert attempted, title:', title);
  const {data:newNCR,error} = await sb.from('ncrs').insert({project_id:currentProject.id,
    ref_no:'NCR-'+(Date.now()%10000).toString().padStart(3,'0'),
    title,location:document.getElementById('nn-loc').value,
    raised_by:currentProfile?.full_name||'Unknown',
    raised_date:new Date().toISOString().split('T')[0],
    severity:document.getElementById('nn-sev').value,
    root_cause:document.getElementById('nn-rc')?.value||null,
    linked_drawing:document.getElementById('nn-draw')?.value||null,
    status:'Open',
    cause:document.getElementById('nn-cause').value
  }).select().single();
  console.log('[NCR] insert result — data:', newNCR, 'error:', error);
  if(error){toast('Error: '+error.message,'error');return;}
  if(newNCR?.id) {
    await uploadStagedFiles('nn-staged','ncr',newNCR.id);
    await logAudit(newNCR.id, 'ncr', 'NCR Raised');
  } else {
    console.warn('[NCR] newNCR.id missing — logAudit skipped. newNCR was:', newNCR);
  }
  toast('NCR raised','success'); closeModal(); render();
}

// ─── CAP WORKFLOW ─────────────────────────────────────────────────
function submitCAP(id) {
  openModal('Submit Corrective Action Plan', `
    <div class="workflow-step done"><span>✓</span> NCR Raised</div>
    <div class="workflow-step active"><span>→</span> CAP Submission (current step)</div>
    <div class="workflow-step pending"><span>○</span> CAP Verification by Consultant</div>
    <div class="workflow-step pending"><span>○</span> NCR Closure</div>
    <div class="form-group" style="margin-top:14px"><label class="form-label-dark">Root Cause Classification</label>
      <select class="form-control" id="cap-rc-${id}">
        <option value="">Select root cause...</option>
        <option>Design Error</option><option>Material Non-compliance</option>
        <option>Workmanship</option><option>Coordination Failure</option>
      </select>
    </div>
    <div class="form-group"><label class="form-label-dark">Corrective Action Description <span style="color:var(--red)">*</span></label>
      <textarea class="form-control" id="cap-desc-${id}" placeholder="Describe the corrective action taken or planned..." style="min-height:90px"></textarea>
    </div>
    <div class="frow">
      <div class="form-group"><label class="form-label-dark">Responsible Person</label>
        <input type="text" class="form-control" id="cap-person-${id}" placeholder="Name" value="${currentProfile?.full_name||''}" />
      </div>
      <div class="form-group"><label class="form-label-dark">Target Completion Date</label>
        <input type="date" class="form-control" id="cap-date-${id}" />
      </div>
    </div>`,
    `<button class="btn btn-primary" onclick="doSubmitCAP('${id}')">Submit CAP</button>
     <button class="btn" onclick="closeModal()">Cancel</button>`);
}

async function doSubmitCAP(id) {
  const desc = document.getElementById('cap-desc-'+id)?.value;
  if(!desc){toast('Corrective action description is required','error');return;}
  const {error} = await sb.from('ncrs').update({
    status:'CAP Submitted',
    corrective_action: desc,
    root_cause: document.getElementById('cap-rc-'+id)?.value||null,
    cap_responsible: document.getElementById('cap-person-'+id)?.value||null,
    cap_target_date: document.getElementById('cap-date-'+id)?.value||null,
    cap_submitted_date: new Date().toISOString().split('T')[0],
    cap_submitted_by: currentProfile?.full_name||currentUser?.email,
  }).eq('id',id);
  if(error){toast('Error: '+error.message,'error');return;}
  await logAudit(id, 'ncr', 'NCR: Open \u2192 CAP Submitted');
  toast('CAP submitted for consultant verification','success');
  closeModal(); render();
}

async function verifyCAP(id) {
  const {data:n} = await sb.from('ncrs').select('corrective_action,cap_responsible,cap_target_date,root_cause').eq('id',id).single();
  openModal('Verify Corrective Action Plan', `
    <div class="workflow-step done"><span>✓</span> NCR Raised</div>
    <div class="workflow-step done"><span>✓</span> CAP Submitted by Contractor</div>
    <div class="workflow-step active"><span>→</span> CAP Verification (current step)</div>
    <div class="workflow-step pending"><span>○</span> NCR Closure</div>
    <div style="background:var(--bg3);border-radius:8px;padding:12px 14px;margin:12px 0">
      <div class="detail-label" style="margin-bottom:6px">Submitted CAP</div>
      <div style="font-size:12px;color:var(--charcoal)">${n?.corrective_action||'—'}</div>
      ${n?.root_cause?`<div style="margin-top:6px;font-size:11px;color:var(--text2)">Root Cause: ${n.root_cause}</div>`:''}
      ${n?.cap_responsible?`<div style="font-size:11px;color:var(--text2)">Responsible: ${n.cap_responsible}</div>`:''}
    </div>
    <div class="form-group"><label class="form-label-dark">Verification Comments</label>
      <textarea class="form-control" id="cap-verify-${id}" placeholder="Comments on CAP adequacy..." style="min-height:70px"></textarea>
    </div>`,
    `<button class="btn btn-primary" onclick="doVerifyCAP('${id}')">Verify & Approve CAP</button>
     <button class="btn btn-danger" onclick="doRejectCAP('${id}')">Return to Contractor</button>
     <button class="btn" onclick="closeModal()">Cancel</button>`);
}

async function doVerifyCAP(id) {
  const {error} = await sb.from('ncrs').update({
    status:'CAP Verified',
    cap_verified_by: currentProfile?.full_name||currentUser?.email,
    cap_verified_date: new Date().toISOString().split('T')[0],
    cap_verify_comments: document.getElementById('cap-verify-'+id)?.value||null,
  }).eq('id',id);
  if(error){toast('Error: '+error.message,'error');return;}
  await logAudit(id, 'ncr', 'NCR: CAP Verified');
  toast('CAP verified — NCR ready to close','success');
  closeModal(); render();
}

async function doRejectCAP(id) {
  const {error} = await sb.from('ncrs').update({
    status:'Open',
    cap_verify_comments: document.getElementById('cap-verify-'+id)?.value||'CAP returned for revision.',
  }).eq('id',id);
  if(error){toast('Error','error');return;}
  await logAudit(id, 'ncr', 'NCR: CAP Returned \u2192 Open');
  toast('CAP returned to contractor for revision','info');
  closeModal(); render();
}

// ─── RE-INSPECTION ────────────────────────────────────────────────
async function reInspect(parentId) {
  const {data:parent} = await sb.from('inspections').select('*').eq('id',parentId).single();
  if(!parent) return;
  openModal('Request Re-Inspection', `
    <div style="background:var(--amber-bg);border:0.5px solid #FAC775;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:11px;color:var(--amber)">
      Re-inspection of: <b>${parent.ref_no}</b> — ${(parent.elements||'').substring(0,60)}
    </div>
    <div class="frow">
      <div class="form-group"><label class="form-label-dark">New Ref No.</label>
        <input type="text" class="form-control" id="ri-ref" value="${parent.ref_no}-R1" />
      </div>
      <div class="form-group"><label class="form-label-dark">Inspection Date</label>
        <input type="text" class="form-control" id="ri-date" placeholder="e.g. 20 APR 2026" />
      </div>
    </div>
    <div class="form-group"><label class="form-label-dark">Changes Made / Corrective Works</label>
      <textarea class="form-control" id="ri-changes" placeholder="Describe what was corrected since the original inspection..." style="min-height:80px"></textarea>
    </div>`,
    `<button class="btn btn-primary" onclick="doReInspect('${parentId}')">Submit Re-Inspection Request</button>
     <button class="btn" onclick="closeModal()">Cancel</button>`);
}

async function doReInspect(parentId) {
  const {data:parent} = await sb.from('inspections').select('*').eq('id',parentId).single();
  const ref = document.getElementById('ri-ref')?.value;
  if(!ref){toast('Ref number required','error');return;}
  const {error} = await sb.from('inspections').insert({project_id:currentProject.id,
    ...parent, id:undefined, created_at:undefined,
    ref_no:ref,
    parent_ir_id:parentId,
    inspection_date:document.getElementById('ri-date')?.value||null,
    elements:(document.getElementById('ri-changes')?.value||'')+' [Re-inspection of '+parent.ref_no+']',
    status:'Pending',
    revision:String(parseInt(parent.revision||0)+1).padStart(2,'0'),
    request_date:new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}).toUpperCase(),
  });
  if(error){toast('Error: '+error.message,'error');return;}
  await logAudit(parentId, 'inspection', 'Re-Inspection Requested: '+ref);
  toast('Re-inspection request submitted','success');
  closeModal(); render();
}

// ─── RESUBMIT SUBMITTAL ───────────────────────────────────────────
async function resubmitSub(parentId) {
  const {data:parent} = await sb.from('submittals').select('*').eq('id',parentId).single();
  if(!parent) return;
  const nextRev = (parseInt(parent.revision||1)+1);
  openModal('Resubmit Document', `
    <div style="background:var(--amber-bg);border:0.5px solid #FAC775;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:11px;color:var(--amber)">
      Resubmission of: <b>${parent.ref_no}</b> Rev.${parent.revision||1}
    </div>
    <div class="rev-chain">
      <div class="rev-chain-item ${parent.outcome==='1'||parent.outcome==='2'?'approved':parent.outcome==='3'||parent.outcome==='4'?'rejected':''}">Rev.${parent.revision||1}</div>
      <div class="rev-chain-arrow">›</div>
      <div class="rev-chain-item current">Rev.${nextRev} (new)</div>
    </div>
    <div class="form-group"><label class="form-label-dark">Changes from Previous Submission</label>
      <textarea class="form-control" id="rs-changes" placeholder="Describe what was changed in response to reviewer comments..." style="min-height:80px"></textarea>
    </div>
    <div class="form-group"><label class="form-label-dark">Attachments</label>
      <div class="upload-zone" style="padding:14px 16px;display:flex;align-items:center;gap:10px;text-align:left"
        onclick="document.getElementById('rs-files').click()"
        ondragover="event.preventDefault();this.classList.add('dragging')"
        ondragleave="this.classList.remove('dragging')"
        ondrop="event.preventDefault();this.classList.remove('dragging');stageFiles(event.dataTransfer.files,'rs-staged')">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;opacity:.6"><path d="M8 2v8M5 5l3-3 3 3" stroke="var(--text2)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 11v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="var(--text2)" stroke-width="1.3" stroke-linecap="round"/></svg>
        <span style="font-size:12px;color:var(--text2)">Attach revised documents — PDF, DWG, Images (max 50MB)</span>
      </div>
      <input type="file" id="rs-files" multiple style="display:none" onchange="stageFiles(this.files,'rs-staged')" />
      <div id="rs-staged" style="display:flex;flex-direction:column;gap:4px;margin-top:6px"></div>
    </div>`,
    `<button class="btn btn-primary" onclick="doResubmitList('${parentId}',${nextRev})">Submit Revision ${nextRev}</button>
     <button class="btn" onclick="closeModal()">Cancel</button>`);
}

async function doResubmitList(parentId, nextRev) {
  const {data:parent} = await sb.from('submittals').select('*').eq('id',parentId).single();
  const changes = document.getElementById('rs-changes')?.value||'';
  const {data:newSub,error} = await sb.from('submittals').insert({project_id:currentProject.id,
    ref_no:parent.ref_no+'-R'+nextRev,
    title:parent.title,
    from_party:parent.from_party,
    to_party:parent.to_party,
    discipline:parent.discipline,
    revision:nextRev,
    parent_id:parentId,
    submit_date:new Date().toISOString().split('T')[0],
    status:'Pending Review',
    changes_description:changes,
  }).select().single();
  if(error){toast('Error: '+error.message,'error');return;}
  if(newSub?.id) {
    await uploadStagedFiles('rs-staged','submittal',newSub.id);
    await logAudit(parentId, 'submittal', 'Resubmission Created: Rev '+nextRev);
  }
  toast('Resubmission created','success');
  closeModal(); render();
}

// ─── INSPECTION CHECKLISTS ────────────────────────────────────────
const IR_TEMPLATES = {
  'Concrete Pour':['Formwork dimensions and alignment verified','Rebar cover maintained (min 30mm)','Rebar spacing and diameter confirmed','Laps and splices to drawing','Construction joints approved','No debris in formwork','Concrete mix design approved','Slump test performed and recorded','Cube samples cast','Pour sequence agreed'],
  'Rebar':['Bar diameter and grade confirmed','Spacing to drawing','Lap length minimum 40Ø','Cover blocks correct type and spacing','Hooks and bends to BS8666','Dowels correctly positioned','No excess rust or contamination','Approved shop drawing on site'],
  'Waterproofing':['Surface preparation approved — dry and clean','Primer applied and cured','Membrane type as specified','Laps minimum 100mm','Corner and upstand details correct','Protective screed specified','No punctures or holidays','Mock-up approved'],
  'Formwork':['Propping layout approved','Soffit level checked','Panel joints sealed','Release agent applied','Openings and inserts confirmed','Stability bracing in place','Camber if required'],
  'MEP':['Sleeves and inserts correct position','Pipe gradient verified','Support spacing to specification','Material certification on site','Pressure test witnessed','Insulation type approved','Electrical containment earthed'],
};

function openChecklistModal(irId, template) {
  const items = IR_TEMPLATES[template]||IR_TEMPLATES['Concrete Pour'];
  openModal('Inspection Checklist – '+template, `
    <div style="font-size:11px;color:var(--text3);margin-bottom:10px">Mark each item as Pass, Fail, or N/A</div>
    <div style="border:0.5px solid var(--border);border-radius:8px;overflow:hidden">
      ${items.map((item,i)=>`
        <div class="checklist-item" id="ck-row-${irId}-${i}">
          <div class="checklist-label">${item}</div>
          <div class="checklist-btns">
            <button class="ck-btn" onclick="setCK('${irId}',${i},'pass',this)">Pass</button>
            <button class="ck-btn" onclick="setCK('${irId}',${i},'fail',this)">Fail</button>
            <button class="ck-btn" onclick="setCK('${irId}',${i},'na',this)">N/A</button>
          </div>
        </div>`).join('')}
    </div>
    <div style="margin-top:10px">
      <div class="form-group"><label class="form-label-dark">Additional Observations</label>
        <textarea class="form-control" id="ck-notes-${irId}" placeholder="Any additional notes..." style="min-height:60px"></textarea>
      </div>
    </div>`,
    `<button class="btn btn-primary" onclick="saveChecklist('${irId}',${JSON.stringify(items).replace(/'/g,"\'")})">Save Checklist</button>
     <button class="btn" onclick="closeModal()">Cancel</button>`);
}

let ckState = {};
function setCK(irId, idx, val, btn) {
  if(!ckState[irId]) ckState[irId] = {};
  ckState[irId][idx] = val;
  const row = document.getElementById('ck-row-'+irId+'-'+idx);
  row.querySelectorAll('.ck-btn').forEach(b=>{b.className='ck-btn';});
  btn.className = 'ck-btn '+val;
}

async function saveChecklist(irId, items) {
  const cl = ckState[irId]||{};
  const result = {};
  items.forEach((item,i)=>result[item]=cl[i]||'pending');
  const notes = document.getElementById('ck-notes-'+irId)?.value||'';
  const {error} = await sb.from('inspections').update({
    checklist:result,
    checklist_notes:notes,
  }).eq('id',irId);
  if(error){toast('Error saving checklist','error');return;}
  toast('Checklist saved','success');
  closeModal();
  viewIR(irId);
}

// ─── RFI REGISTER ─────────────────────────────────────────────────
async function renderRFIs() {
  selectedRFIs = new Set();
  const today = new Date().toISOString().split('T')[0];
  const {data} = await sb.from('rfis').select('*').eq('project_id',currentProject.id).order('created_at',{ascending:false});
  const rows = data||[];
  const rfiOverdueFilter = navFilter==='overdue'; navFilter=null;
  const open = rows.filter(r=>r.status==='Open').length;
  const responded = rows.filter(r=>r.status==='Responded').length;
  const closed = rows.filter(r=>r.status==='Closed').length;
  const overdue = rows.filter(r=>r.due_date&&r.due_date<today&&r.status==='Open').length;
  document.getElementById('content').innerHTML = `
  <div class="module-bar">
    <div class="module-stat"><div class="module-stat-val ${open>0?'warn':''}">${open}</div><div class="module-stat-label">Open</div></div>
    <div class="module-stat"><div class="module-stat-val">${responded}</div><div class="module-stat-label">Responded</div></div>
    <div class="module-stat"><div class="module-stat-val">${closed}</div><div class="module-stat-label">Closed</div></div>
    <div class="module-stat"><div class="module-stat-val ${overdue>0?'danger':''}">${overdue}</div><div class="module-stat-label">Overdue</div></div>
  </div>
  <div class="fbar">
    <select class="filter-sel" onchange="filt('rfi','status',this.value)" id="rfi-status-sel">
      <option value="All">All Statuses</option>
      <option>Open</option><option>Responded</option><option>Closed</option><option value="Overdue">Overdue</option>
    </select>
    <select class="filter-sel" onchange="filt('rfi','priority',this.value)">
      <option value="All">All Priorities</option>
      <option>Normal</option><option>Urgent</option>
    </select>
    <input type="text" class="reg-search" style="margin-left:auto" placeholder="Search RFIs..." oninput="searchReg('rfi',this.value)" />
  </div>
  <div class="card"><div class="tw"><table>
    <tr>
      <th style="width:32px;text-align:center"><input type="checkbox" id="rfi-select-all" onchange="selectAllRows('rfi',selectedRFIs,'bulk-bar-rfi','rfi-sel-count')" /></th>
      <th>Ref No.</th><th>Subject</th><th>Drawing Ref</th><th>Raised By</th><th>Priority</th><th>Due Date</th><th>Status</th><th>Actions</th>
    </tr>
    ${rows.length?rows.map(r=>{
      const rfiIsOverdue = r.due_date&&r.due_date<today&&r.status==='Open';
      const rfiIsSoon = !rfiIsOverdue&&r.due_date&&r.status==='Open'&&(new Date(r.due_date)-new Date(today))<=3*86400000;
      return `<tr class="rfi-row" data-status="${r.status}" data-priority="${r.priority||'Normal'}" data-overdue="${rfiIsOverdue?'1':'0'}" data-id="${r.id}" data-search="${[r.ref_no,r.subject].filter(Boolean).join(' ').replace(/"/g,' ').toLowerCase()}" style="${rfiIsOverdue?'border-left:2px solid var(--red)':rfiIsSoon?'border-left:2px solid var(--amber)':''}">
      <td style="text-align:center"><input type="checkbox" class="row-cb" id="rficb-${r.id}" onchange="toggleRowSelect('${r.id}',selectedRFIs,'rfi','bulk-bar-rfi','rfi-sel-count')" /></td>
      <td class="mono">${r.ref_no}</td>
      <td style="color:var(--blue-light);cursor:pointer" onclick="viewRFI('${r.id}')">${r.subject}</td>
      <td style="color:var(--text2);font-size:10px">${r.drawing_ref||'—'}</td>
      <td style="color:var(--text2);font-size:10px">${r.raised_by||'—'}</td>
      <td>${sbadge(r.priority||'Normal')}</td>
      <td>${overdueTag(r.due_date)}</td>
      <td>${sbadge(r.status)}</td>
      <td><div style="display:flex;gap:4px">
        <button class="btn btn-sm" onclick="viewRFI('${r.id}')">View</button>
        ${can('approve')&&r.status==='Open'?`<button class="btn btn-sm btn-primary" onclick="respondRFI('${r.id}')">Respond</button>`:''}
      </div></td>
    </tr>`;}).join(''):'<tr><td colspan="9" class="empty-state">No RFIs raised yet.</td></tr>'}
    <tr id="srch-empty-rfi" style="display:none"><td colspan="9" class="empty-state"></td></tr>
  </table>
  <div class="record-footer">Showing ${rows.length} record${rows.length!==1?'s':''}</div>
  </div></div>
  <div id="bulk-bar-rfi" class="bulk-bar">
    <div class="bulk-bar-inner">
      <span id="rfi-sel-count" class="bulk-bar-count">0 selected</span>
      <button class="btn btn-sm" onclick="bulkExportCSV('rfis','*','rfis.csv')">Export Selected</button>
      ${currentProfile?.role==='developer'?`<button class="btn btn-sm btn-danger" onclick="bulkDelete('rfis',selectedRFIs,'rfi','bulk-bar-rfi','rfi-sel-count')">Delete Selected</button>`:''}
      <button class="btn btn-sm" style="margin-left:auto" onclick="clearSelection(selectedRFIs,'rfi','bulk-bar-rfi','rfi-sel-count')">Clear</button>
    </div>
  </div>`;
  if(rfiOverdueFilter) {
    filt('rfi','status','Overdue');
  }
}

async function viewRFI(id) {
  const [{data:r},comments,atts] = await Promise.all([
    sb.from('rfis').select('*').eq('id',id).single(),
    loadComments('rfi',id),
    loadAttachments('rfi',id)
  ]);
  if(!r) return;
  openModal(`${r.ref_no} – ${r.subject}`,`
    <div class="detail-grid">
      <div class="detail-item"><div class="detail-label">Status</div><div class="detail-value">${sbadge(r.status)}</div></div>
      <div class="detail-item"><div class="detail-label">Priority</div><div class="detail-value">${sbadge(r.priority||'Normal')}</div></div>
      <div class="detail-item"><div class="detail-label">Raised By</div><div class="detail-value">${r.raised_by||'—'}</div></div>
      <div class="detail-item"><div class="detail-label">Assigned To</div><div class="detail-value">${r.assigned_to||'—'}</div></div>
      <div class="detail-item"><div class="detail-label">Drawing Ref</div><div class="detail-value">${r.drawing_ref||'—'}</div></div>
      <div class="detail-item"><div class="detail-label">Due Date</div><div class="detail-value">${overdueTag(r.due_date)}</div></div>
    </div>
    <div class="detail-section"><div class="detail-label" style="margin-bottom:4px">Question / Description</div><div style="font-size:12px;line-height:1.6;color:var(--text)">${r.question||'—'}</div></div>
    ${r.response?`<div class="detail-section"><div class="detail-label" style="margin-bottom:4px">Response <span style="color:var(--text3);font-size:10px">– ${r.responded_by||''} on ${r.responded_date||''}</span></div><div style="font-size:12px;line-height:1.6;color:var(--green-light)">${r.response}</div></div>`:''}
    ${commentThreadHTML('rfi',id,comments)}`,
    `${can('approve')&&r.status==='Open'?`<button class="btn btn-success" onclick="respondRFI('${id}')">Respond</button>`:''}
     ${can('approve')&&r.status==='Responded'?`<button class="btn btn-sm" onclick="closeRFI('${id}')">Close RFI</button>`:''}
     <button class="btn" onclick="printDoc('rfi-print-${id}','RFI_${r.ref_no}.pdf')">Download PDF</button>
     <button class="btn" onclick="closeModal()">Close</button>`, true);
  setTimeout(()=>{
    const mb=document.getElementById('modal-body');
    if(mb){const d=document.createElement('div');d.innerHTML=attachmentSectionHTML('rfi',id,atts);
    const cs=mb.querySelector('[id^="comment-list-"]')?.closest('.detail-section');
    if(cs)mb.insertBefore(d.firstChild,cs);else mb.appendChild(d.firstChild);}
  },50);
}

function respondRFI(id) {
  openModal('Respond to RFI',`
    <div class="form-group"><label class="form-label-dark">Response</label><textarea class="form-control" id="rfi-resp-${id}" placeholder="Enter your formal response..." style="min-height:120px"></textarea></div>
    <div class="frow">
      <div class="form-group"><label class="form-label-dark">Responded By – Name <span style="color:var(--color-text-danger)">*</span></label><input type="text" class="form-control" id="rfi-by-${id}" placeholder="Enter engineer's full name" /></div>
      <div class="form-group"><label class="form-label-dark">Date</label><input type="date" class="form-control" id="rfi-dt-${id}" value="${new Date().toISOString().split('T')[0]}" /></div>
    </div>
    <div style="font-size:11px;color:var(--color-text-tertiary);padding:6px 0">This name will appear on the RFI response as the signing engineer.</div>`,
    `<button class="btn btn-primary" onclick="doRespondRFI('${id}')">Submit Response</button><button class="btn" onclick="closeModal()">Cancel</button>`);
}

async function doRespondRFI(id) {
  const resp = document.getElementById('rfi-resp-'+id)?.value;
  const engName = document.getElementById('rfi-by-'+id)?.value?.trim();
  if(!resp){toast('Please enter a response','error');return;}
  if(!engName){toast("Please enter the responding engineer's name",'error');return;}
  const {error} = await sb.from('rfis').update({
    status:'Responded', response:resp,
    responded_by:engName,
    responded_date:document.getElementById('rfi-dt-'+id)?.value
  }).eq('id',id);
  if(error){toast('Error: '+error.message,'error');return;}
  await logAudit(id, 'rfi', 'RFI Responded');
  toast('RFI response submitted','success'); closeModal(); render();
}

async function closeRFI(id) {
  const {error} = await sb.from('rfis').update({status:'Closed'}).eq('id',id);
  if(error){toast('Error: '+error.message,'error');return;}
  await logAudit(id, 'rfi', 'RFI Closed');
  toast('RFI closed','success'); closeModal(); render();
}

// ─── TRANSMITTAL LOG ──────────────────────────────────────────────
async function renderTransmittals() {
  selectedTransmittals = new Set();
  const {data} = await sb.from('transmittals').select('*').eq('project_id',currentProject.id).order('created_at',{ascending:false});
  const rows = data||[];
  const total = rows.length;
  const acknowledged = rows.filter(r=>r.acknowledged_at).length;
  const pending = total - acknowledged;
  document.getElementById('content').innerHTML = `
  <div class="module-bar">
    <div class="module-stat"><div class="module-stat-val">${total}</div><div class="module-stat-label">Total</div></div>
    <div class="module-stat"><div class="module-stat-val">${acknowledged}</div><div class="module-stat-label">Acknowledged</div></div>
    <div class="module-stat"><div class="module-stat-val ${pending>0?'warn':''}">${pending}</div><div class="module-stat-label">Pending Ack</div></div>
  </div>
  <div class="fbar">
    <select class="filter-sel" onchange="filt('trans','status',this.value)">
      <option value="All">All Statuses</option>
      <option>Acknowledged</option><option value="Pending">Pending Ack</option>
    </select>
    <input type="text" class="reg-search" style="margin-left:auto" placeholder="Search transmittals..." oninput="searchReg('trans',this.value)" />
  </div>
  <div class="card"><div class="tw"><table>
    <tr>
      <th style="width:32px;text-align:center"><input type="checkbox" id="trans-select-all" onchange="selectAllRows('trans',selectedTransmittals,'bulk-bar-trans','trans-sel-count')" /></th>
      <th>Ref No.</th><th>From</th><th>To</th><th>Date</th><th>Purpose</th><th>Method</th><th>Documents</th><th>Actions</th>
    </tr>
    ${rows.length?rows.map(t=>{
      const ackStatus = t.acknowledged_at?'Acknowledged':'Pending';
      return `<tr class="trans-row" data-status="${ackStatus}" data-search="${[t.ref_no,t.notes].filter(Boolean).join(' ').replace(/"/g,' ').toLowerCase()}" data-id="${t.id}">
      <td style="text-align:center"><input type="checkbox" class="row-cb" id="transcb-${t.id}" onchange="toggleRowSelect('${t.id}',selectedTransmittals,'trans','bulk-bar-trans','trans-sel-count')" /></td>
      <td class="mono">${t.ref_no}</td>
      <td style="color:var(--text2)">${t.from_party||'—'}</td>
      <td style="color:var(--text2)">${t.to_party||'—'}</td>
      <td style="color:var(--text3);font-size:10px">${t.transmit_date||'—'}</td>
      <td style="font-size:11px">${t.purpose||'—'}</td>
      <td><span class="badge badge-neutral">${t.method||'Email'}</span></td>
      <td style="color:var(--text3);font-size:10px">${Array.isArray(t.documents)?t.documents.length+' doc(s)':typeof t.documents==='string'?JSON.parse(t.documents||'[]').length+' doc(s)':'—'}</td>
      <td><button class="btn btn-sm" onclick="viewTransmittal('${t.id}')">View</button></td>
    </tr>`}).join(''):'<tr><td colspan="9" class="empty-state">No transmittals created yet.</td></tr>'}
    <tr id="srch-empty-trans" style="display:none"><td colspan="9" class="empty-state"></td></tr>
  </table>
  <div class="record-footer">Showing ${rows.length} record${rows.length!==1?'s':''}</div>
  </div></div>
  <div id="bulk-bar-trans" class="bulk-bar">
    <div class="bulk-bar-inner">
      <span id="trans-sel-count" class="bulk-bar-count">0 selected</span>
      <button class="btn btn-sm" onclick="bulkExportCSV('transmittals','*','transmittals.csv')">Export Selected</button>
      ${currentProfile?.role==='developer'?`<button class="btn btn-sm btn-danger" onclick="bulkDelete('transmittals',selectedTransmittals,'trans','bulk-bar-trans','trans-sel-count')">Delete Selected</button>`:''}
      <button class="btn btn-sm" style="margin-left:auto" onclick="clearSelection(selectedTransmittals,'trans','bulk-bar-trans','trans-sel-count')">Clear</button>
    </div>
  </div>`;
}

async function viewTransmittal(id) {
  const [{data:t},comments] = await Promise.all([
    sb.from('transmittals').select('*').eq('id',id).single(),
    loadComments('transmittal',id)
  ]);
  if(!t) return;
  const docs = Array.isArray(t.documents)?t.documents:(typeof t.documents==='string'?JSON.parse(t.documents||'[]'):[]);
  const transHTML = `<div style="background:#fff;color:#000;font-family:Arial,sans-serif;font-size:11px;padding:16px;border-radius:6px">
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;border:1px solid #ccc;margin-bottom:8px">
      <div style="padding:8px;border-right:1px solid #ccc;font-size:13px;font-weight:700;color:#00008B">POE<br><span style="font-size:9px;font-weight:400;color:#000">ENGINEERING CONSULTANTS</span></div>
      <div style="padding:8px;border-right:1px solid #ccc;text-align:center;font-size:18px;font-style:italic;color:#00008B">regent<br><span style="font-size:9px;font-weight:400;color:#000">DEVELOPMENTS</span></div>
      <div style="padding:6px;text-align:right;font-size:9px">Modern Building Contracting L.L.C</div>
    </div>
    <div style="text-align:center;font-weight:700;font-size:13px;text-decoration:underline;color:#00008B;margin-bottom:8px">DOCUMENT TRANSMITTAL</div>
    <div class="tw"><table style="width:100%;border-collapse:collapse;margin-bottom:8px">
      <tr><td style="border:.7px solid #888;padding:4px 6px;font-weight:700;width:25%">Transmittal Ref:</td><td style="border:.7px solid #888;padding:4px 6px;color:#8B0000;font-weight:700" colspan="3">${t.ref_no}</td></tr>
      <tr><td style="border:.7px solid #888;padding:4px 6px;font-weight:700">Project:</td><td style="border:.7px solid #888;padding:4px 6px" colspan="3">Golf Grove – Residential Building (B+G+P+7+Roof)</td></tr>
      <tr><td style="border:.7px solid #888;padding:4px 6px;font-weight:700">From:</td><td style="border:.7px solid #888;padding:4px 6px">${t.from_party||'—'}</td><td style="border:.7px solid #888;padding:4px 6px;font-weight:700">To:</td><td style="border:.7px solid #888;padding:4px 6px">${t.to_party||'—'}</td></tr>
      <tr><td style="border:.7px solid #888;padding:4px 6px;font-weight:700">Date:</td><td style="border:.7px solid #888;padding:4px 6px">${t.transmit_date||'—'}</td><td style="border:.7px solid #888;padding:4px 6px;font-weight:700">Method:</td><td style="border:.7px solid #888;padding:4px 6px">${t.method||'Email'}</td></tr>
      <tr><td style="border:.7px solid #888;padding:4px 6px;font-weight:700">Purpose:</td><td style="border:.7px solid #888;padding:4px 6px" colspan="3">${t.purpose||'—'}</td></tr>
    </table></div>
    <div class="tw"><table style="width:100%;border-collapse:collapse">
      <tr style="background:#f5f5f5"><th style="border:.7px solid #888;padding:5px 7px;text-align:left">#</th><th style="border:.7px solid #888;padding:5px 7px;text-align:left">Document No.</th><th style="border:.7px solid #888;padding:5px 7px;text-align:left">Title</th><th style="border:.7px solid #888;padding:5px 7px;text-align:left">Revision</th><th style="border:.7px solid #888;padding:5px 7px;text-align:left">Copies</th></tr>
      ${docs.length?docs.map((d,i)=>`<tr><td style="border:.7px solid #888;padding:4px 7px">${i+1}</td><td style="border:.7px solid #888;padding:4px 7px">${d.no||'—'}</td><td style="border:.7px solid #888;padding:4px 7px">${d.title||'—'}</td><td style="border:.7px solid #888;padding:4px 7px">${d.rev||'—'}</td><td style="border:.7px solid #888;padding:4px 7px">${d.copies||1}</td></tr>`).join(''):'<tr><td colspan="5" style="padding:8px;text-align:center;color:#999;border:.7px solid #888">No documents listed</td></tr>'}
    </table></div>
    ${t.notes?`<div style="margin-top:8px;padding:6px;border:.7px solid #888;font-size:10px"><strong>Notes:</strong> ${t.notes}</div>`:''}
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;margin-top:12px">
      <div style="border:.7px solid #888;padding:8px;text-align:center;font-size:10px"><strong>Prepared By</strong><br><br>Signature: ___________<br>Name: ___________<br>Date: ___________</div>
      <div style="border:.7px solid #888;padding:8px;text-align:center;font-size:10px"><strong>Checked By</strong><br><br>Signature: ___________<br>Name: ___________<br>Date: ___________</div>
      <div style="border:.7px solid #888;padding:8px;text-align:center;font-size:10px"><strong>Received By</strong><br><br>Signature: ___________<br>Name: ___________<br>Date: ___________</div>
    </div>
  </div>`;
  const transWrapped = `<div id='trans-print-${id}'>${transHTML}</div>`;
  const ackSection = `<div style="margin-top:12px;background:var(--bg3);border-radius:8px;padding:12px 14px">
    <div class="detail-label" style="margin-bottom:8px">Acknowledgement Status</div>
    ${t.acknowledged_at?
      `<div style="color:var(--green);font-size:11px;font-weight:500">✓ Acknowledged by ${t.acknowledged_by} on ${new Date(t.acknowledged_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</div>`:
      `<div style="color:var(--amber);font-size:11px">Pending recipient acknowledgement</div>`}
    ${t.response_required?`<div style="font-size:11px;color:var(--text2);margin-top:4px">Response required by: <b>${t.response_required}</b></div>`:''} 
  </div>`;
  openModal(`Transmittal – ${t.ref_no}`,transWrapped+ackSection+commentThreadHTML('transmittal',id,comments),
    `${!t.acknowledged_at&&can('submit')?`<button class="btn btn-primary" onclick="acknowledgeTransmittal('${id}')">Acknowledge Receipt</button>`:''}
     <button class="btn" onclick="printDoc('trans-print-${id}','Transmittal_${t.ref_no}.pdf')">Download PDF</button>
     <button class="btn" onclick="closeModal()">Close</button>`, true);
}

// ─── TRANSMITTAL ACKNOWLEDGEMENT ─────────────────────────────────
async function acknowledgeTransmittal(id) {
  const {error} = await sb.from('transmittals').update({
    acknowledged_by: currentProfile?.full_name||currentUser?.email,
    acknowledged_at: new Date().toISOString(),
  }).eq('id',id);
  if(error){toast('Error: '+error.message,'error');return;}
  await logAudit(id, 'transmittal', 'Transmittal Acknowledged');
  toast('Transmittal acknowledged','success');
  closeModal(); render();
}

// ─── CORRESPONDENCE REGISTER ──────────────────────────────────────
async function renderCorrespondence() {
  selectedCorrespondence = new Set();
  const {data} = await sb.from('correspondence').select('*').eq('project_id',currentProject.id).order('created_at',{ascending:false});
  const rows = data||[];
  const today = new Date().toISOString().split('T')[0];
  const open = rows.filter(r=>r.status==='Open').length;
  const overdue = rows.filter(r=>r.due_date&&r.due_date<today&&r.status==='Open').length;
  document.getElementById('content').innerHTML = `
  <div class="module-bar">
    <div class="module-stat"><div class="module-stat-val">${rows.length}</div><div class="module-stat-label">Total</div></div>
    <div class="module-stat"><div class="module-stat-val ${open>0?'warn':''}">${open}</div><div class="module-stat-label">Open</div></div>
    <div class="module-stat"><div class="module-stat-val ${overdue>0?'danger':''}">${overdue}</div><div class="module-stat-label">Overdue</div></div>
    <div class="module-stat"><div class="module-stat-val">${rows.filter(r=>r.status==='Closed').length}</div><div class="module-stat-label">Closed</div></div>
  </div>
  <div class="fbar">
    <select class="filter-sel" onchange="filt('corr','type',this.value)">
      <option value="All">All Types</option>
      <option>Site Instruction</option><option>Letter</option><option>Variation Order</option><option>Extension of Time</option><option>RFI Response</option><option>General Correspondence</option>
    </select>
    <input type="text" class="reg-search" style="margin-left:auto" placeholder="Search correspondence..." oninput="searchReg('corr',this.value)" />
  </div>
  <div class="card"><div class="tw"><table>
    <tr>
      <th style="width:32px;text-align:center"><input type="checkbox" id="corr-select-all" onchange="selectAllRows('corr',selectedCorrespondence,'bulk-bar-corr','corr-sel-count')" /></th>
      <th>Ref No.</th><th>Type</th><th>Subject</th><th>From</th><th>To</th><th>Date</th><th>Due</th><th>Status</th><th>Actions</th>
    </tr>
    ${rows.length?rows.map(c=>{
      const isOverdue = c.due_date&&c.due_date<today&&c.status==='Open';
      return `<tr class="corr-row" data-type="${c.type||''}" data-search="${[c.ref_no,c.subject].filter(Boolean).join(' ').replace(/"/g,' ').toLowerCase()}" data-id="${c.id}" style="${isOverdue?'background:var(--red-bg)':''}">
        <td style="text-align:center"><input type="checkbox" class="row-cb" id="corrcb-${c.id}" onchange="toggleRowSelect('${c.id}',selectedCorrespondence,'corr','bulk-bar-corr','corr-sel-count')" /></td>
        <td class="mono">${c.ref_no||'—'}</td>
        <td>${corrTypeBadge(c.type)}</td>
        <td style="color:var(--blue);cursor:pointer;max-width:200px" onclick="viewCorrespondence('${c.id}')">${c.subject||'—'}</td>
        <td style="font-size:11px;color:var(--text2)">${c.from_party||'—'}</td>
        <td style="font-size:11px;color:var(--text2)">${c.to_party||'—'}</td>
        <td style="font-size:10px;color:var(--text3)">${c.correspondence_date||'—'}</td>
        <td style="font-size:10px;color:${isOverdue?'var(--red)':'var(--text3)'}">${c.due_date||'—'}</td>
        <td>${sbadge(c.status||'Open')}</td>
        <td><button class="btn btn-sm" onclick="viewCorrespondence('${c.id}')">View</button></td>
      </tr>`;
    }).join(''):'<tr><td colspan="10" class="empty-state">No correspondence logged yet.</td></tr>'}
    <tr id="srch-empty-corr" style="display:none"><td colspan="10" class="empty-state"></td></tr>
  </table>
  <div class="record-footer">Showing ${rows.length} record${rows.length!==1?'s':''}</div>
  </div></div>
  <div id="bulk-bar-corr" class="bulk-bar">
    <div class="bulk-bar-inner">
      <span id="corr-sel-count" class="bulk-bar-count">0 selected</span>
      <button class="btn btn-sm" onclick="bulkExportCSV('correspondence','*','correspondence.csv')">Export Selected</button>
      ${currentProfile?.role==='developer'?`<button class="btn btn-sm btn-danger" onclick="bulkDelete('correspondence',selectedCorrespondence,'corr','bulk-bar-corr','corr-sel-count')">Delete Selected</button>`:''}
      <button class="btn btn-sm" style="margin-left:auto" onclick="clearSelection(selectedCorrespondence,'corr','bulk-bar-corr','corr-sel-count')">Clear</button>
    </div>
  </div>`;
}

async function viewCorrespondence(id) {
  const [{data:c},comments,atts] = await Promise.all([
    sb.from('correspondence').select('*').eq('id',id).single(),
    loadComments('correspondence',id),
    loadAttachments('correspondence',id)
  ]);
  if(!c) return;
  openModal(`${c.ref_no} – ${c.subject}`, `
    <div class="detail-grid">
      <div class="detail-item"><div class="detail-label">Type</div><div class="detail-value">${corrTypeBadge(c.type)}</div></div>
      <div class="detail-item"><div class="detail-label">Status</div><div class="detail-value">${sbadge(c.status||'Open')}</div></div>
      <div class="detail-item"><div class="detail-label">From</div><div class="detail-value">${c.from_party||'—'}</div></div>
      <div class="detail-item"><div class="detail-label">To</div><div class="detail-value">${c.to_party||'—'}</div></div>
      <div class="detail-item"><div class="detail-label">Date</div><div class="detail-value">${c.correspondence_date||'—'}</div></div>
      <div class="detail-item"><div class="detail-label">Response Due</div><div class="detail-value">${c.due_date||'—'}</div></div>
    </div>
    ${c.body?`<div class="detail-section"><div class="detail-label" style="margin-bottom:6px">Content</div><div style="font-size:12px;color:var(--charcoal);line-height:1.6;white-space:pre-wrap">${c.body}</div></div>`:''}
    ${attachmentSectionHTML('correspondence',id,atts)}
    ${commentThreadHTML('correspondence',id,comments)}`,
    `${c.status==='Open'&&can('approve')?`<button class="btn btn-primary" onclick="closeCorrespondence('${id}')">Mark Closed</button>`:''}
     <button class="btn" onclick="closeModal()">Close</button>`, true);
}

async function closeCorrespondence(id) {
  const {error} = await sb.from('correspondence').update({status:'Closed',closed_date:new Date().toISOString().split('T')[0]}).eq('id',id);
  if(error){toast('Error: '+error.message,'error');return;}
  await logAudit(id, 'correspondence', 'Correspondence: Closed');
  toast('Correspondence closed','success'); closeModal(); render();
}

async function viewAuditTrail(documentType, recordId, label) {
  const {data:logs} = await sb.from('document_audit_log')
    .select('action,performed_by_name,created_at')
    .eq('document_id', recordId)
    .order('created_at', {ascending: true});
  const rows = logs && logs.length
    ? logs.map(l => `
        <div style="display:flex;gap:12px;padding:10px 0;border-bottom:0.5px solid var(--border)">
          <div style="min-width:140px;font-size:11px;color:var(--text2);flex-shrink:0">${new Date(l.created_at).toLocaleString()}</div>
          <div style="flex:1">
            <div style="font-size:12px;font-weight:500;color:var(--text)">${l.action}</div>
            <div style="font-size:11px;color:var(--text2);margin-top:2px">${l.performed_by_name}</div>
          </div>
        </div>`).join('')
    : `<div style="color:var(--text3);font-size:12px;padding:16px 0;text-align:center">No audit entries recorded for this ${documentType}.</div>`;
  openModal(`Audit Trail \u2013 ${label}`,
    `<div style="font-size:11px;color:var(--text2);margin-bottom:10px">All recorded actions for this ${documentType}, oldest first.</div>${rows}`,
    `<button class="btn" onclick="closeModal()">Close</button>`);
}

async function openNewCorrespondence() {
  openModal('Log Correspondence', `
    <div class="frow">
      <div class="form-group"><label class="form-label-dark">Ref No. <span style="color:var(--red)">*</span></label>
        <input type="text" class="form-control" id="nc-ref" placeholder="e.g. SI-001 or LTR-042" />
      </div>
      <div class="form-group"><label class="form-label-dark">Type</label>
        <select class="form-control" id="nc-type">
          <option>Site Instruction</option><option>Letter</option><option>Variation Order</option>
          <option>Extension of Time</option><option>RFI Response</option><option>General Correspondence</option>
        </select>
      </div>
    </div>
    <div class="form-group"><label class="form-label-dark">Subject <span style="color:var(--red)">*</span></label>
      <input type="text" class="form-control" id="nc-subject" placeholder="Brief subject line" />
    </div>
    <div class="frow">
      <div class="form-group"><label class="form-label-dark">From</label>
        <select class="form-control" id="nc-from"><option>POE</option><option>MBC</option><option>Regent</option></select>
      </div>
      <div class="form-group"><label class="form-label-dark">To</label>
        <select class="form-control" id="nc-to"><option>MBC</option><option>POE</option><option>Regent</option></select>
      </div>
    </div>
    <div class="frow">
      <div class="form-group"><label class="form-label-dark">Correspondence Date</label>
        <input type="date" class="form-control" id="nc-date" value="${new Date().toISOString().split('T')[0]}" />
      </div>
      <div class="form-group"><label class="form-label-dark">Response Due</label>
        <input type="date" class="form-control" id="nc-due" />
      </div>
    </div>
    <div class="form-group"><label class="form-label-dark">Content / Body</label>
      <textarea class="form-control" id="nc-body" placeholder="Paste or type the correspondence content..." style="min-height:100px"></textarea>
    </div>
    <div class="form-group"><label class="form-label-dark">Attachments (optional)</label>
      <div class="upload-zone" style="padding:14px 16px;display:flex;align-items:center;gap:10px;text-align:left"
        onclick="document.getElementById('nc-files').click()"
        ondragover="event.preventDefault();this.classList.add('dragging')"
        ondragleave="this.classList.remove('dragging')"
        ondrop="event.preventDefault();this.classList.remove('dragging');stageFiles(event.dataTransfer.files,'nc-staged')">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;opacity:.6"><path d="M8 2v8M5 5l3-3 3 3" stroke="var(--text2)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 11v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="var(--text2)" stroke-width="1.3" stroke-linecap="round"/></svg>
        <span style="font-size:12px;color:var(--text2)">Attach original correspondence — PDF, Images, Word (max 50MB)</span>
      </div>
      <input type="file" id="nc-files" multiple style="display:none" onchange="stageFiles(this.files,'nc-staged')" />
      <div id="nc-staged" style="display:flex;flex-direction:column;gap:4px;margin-top:6px"></div>
    </div>`,
    `<button class="btn btn-primary" onclick="doNewCorrespondence()">Log Correspondence</button>
     <button class="btn" onclick="closeModal()">Cancel</button>`);
}

async function doNewCorrespondence() {
  const ref = document.getElementById('nc-ref')?.value;
  const subject = document.getElementById('nc-subject')?.value;
  if(!ref||!subject){toast('Ref and subject are required','error');return;}
  const {data:newCorr,error} = await sb.from('correspondence').insert({project_id:currentProject.id,
    ref_no:ref, type:document.getElementById('nc-type')?.value,
    subject, from_party:document.getElementById('nc-from')?.value,
    to_party:document.getElementById('nc-to')?.value,
    correspondence_date:document.getElementById('nc-date')?.value,
    due_date:document.getElementById('nc-due')?.value||null,
    body:document.getElementById('nc-body')?.value||null,
    status:'Open',
    logged_by:currentProfile?.full_name||currentUser?.email,
  }).select().single();
  if(error){toast('Error: '+error.message,'error');return;}
  if(newCorr?.id) {
    await uploadStagedFiles('nc-staged','correspondence',newCorr.id);
    await logAudit(newCorr.id, 'correspondence', 'Correspondence Created: '+newCorr.ref_no);
  }
  toast('Correspondence logged','success'); closeModal(); render();
}

// ─── PUNCH LIST ───────────────────────────────────────────────────
async function renderPunchList() {
  selectedPunch = new Set();
  const {data} = await sb.from('punch_list').select('*').eq('project_id',currentProject.id).order('created_at',{ascending:false});
  const rows = data||[];
  const open = rows.filter(r=>r.status==='Open').length;
  const inProgress = rows.filter(r=>r.status==='In Progress').length;
  const closed = rows.filter(r=>r.status==='Closed').length;
  document.getElementById('content').innerHTML = `
  <div class="module-bar">
    <div class="module-stat"><div class="module-stat-val ${open>0?'danger':''}">${open}</div><div class="module-stat-label">Open</div></div>
    <div class="module-stat"><div class="module-stat-val ${inProgress>0?'warn':''}">${inProgress}</div><div class="module-stat-label">In Progress</div></div>
    <div class="module-stat"><div class="module-stat-val">${closed}</div><div class="module-stat-label">Closed</div></div>
    <div class="module-stat"><div class="module-stat-val">${rows.length}</div><div class="module-stat-label">Total Items</div></div>
  </div>
  <div class="fbar">
    <select class="filter-sel" onchange="filt('punch','status',this.value)">
      <option value="All">All Statuses</option>
      <option>Open</option><option>In Progress</option><option>Closed</option>
    </select>
    <select class="filter-sel" onchange="filt('punch','severity',this.value)">
      <option value="All">All Severities</option>
      <option>Minor</option><option>Major</option><option>Critical</option>
    </select>
    <input type="text" class="reg-search" style="margin-left:auto" placeholder="Search punch list..." oninput="searchReg('punch',this.value)" />
  </div>
  <div class="card"><div class="tw"><table>
    <tr>
      <th style="width:32px;text-align:center"><input type="checkbox" id="punch-select-all" onchange="selectAllRows('punch',selectedPunch,'bulk-bar-punch','punch-sel-count')" /></th>
      <th>#</th><th>Description</th><th>Location</th><th>Discipline</th><th>Raised By</th><th>Assigned To</th><th>Severity</th><th>Status</th><th>Actions</th>
    </tr>
    ${rows.length?rows.map((p,idx)=>`<tr class="punch-row" data-status="${p.status||''}" data-severity="${p.severity||''}" data-search="${[p.description,p.location].filter(Boolean).join(' ').replace(/"/g,' ').toLowerCase()}" data-id="${p.id}">
      <td style="text-align:center"><input type="checkbox" class="row-cb" id="punchcb-${p.id}" onchange="toggleRowSelect('${p.id}',selectedPunch,'punch','bulk-bar-punch','punch-sel-count')" /></td>
      <td class="mono" style="font-size:10px">${String(idx+1).padStart(3,'0')}</td>
      <td style="color:var(--blue);cursor:pointer;max-width:200px" onclick="viewPunchItem('${p.id}')">${p.description||'—'}</td>
      <td><div style="font-size:11px;color:var(--charcoal)">${p.location||'—'}</div><div class="punch-loc">${p.element||''}</div></td>
      <td style="font-size:11px;color:var(--text2)">${p.discipline||'—'}</td>
      <td style="font-size:10px;color:var(--text2)">${p.raised_by||'—'}</td>
      <td style="font-size:10px;color:var(--text2)">${p.assigned_to||'—'}</td>
      <td>${sbadge(p.severity||'Minor')}</td>
      <td>${sbadge(p.status||'Open')}</td>
      <td><div style="display:flex;gap:4px">
        <button class="btn btn-sm" onclick="viewPunchItem('${p.id}')">View</button>
        ${p.status!=='Closed'&&can('approve')?`<button class="btn btn-sm btn-danger" onclick="closePunchItem('${p.id}')">Close</button>`:''}
      </div></td>
    </tr>`).join(''):'<tr><td colspan="10" class="empty-state">No punch list items. Items are typically raised during snagging and handover inspections.</td></tr>'}
    <tr id="srch-empty-punch" style="display:none"><td colspan="10" class="empty-state"></td></tr>
  </table>
  <div class="record-footer">Showing ${rows.length} record${rows.length!==1?'s':''}</div>
  </div></div>
  <div id="bulk-bar-punch" class="bulk-bar">
    <div class="bulk-bar-inner">
      <span id="punch-sel-count" class="bulk-bar-count">0 selected</span>
      <button class="btn btn-sm" onclick="bulkExportCSV('punch_list','*','punch_list.csv')">Export Selected</button>
      ${can('approve')?`<button class="btn btn-sm btn-success" onclick="doBatchPunchClose()">Bulk Close</button>`:''}
      ${currentProfile?.role==='developer'?`<button class="btn btn-sm btn-danger" onclick="bulkDelete('punch_list',selectedPunch,'punch','bulk-bar-punch','punch-sel-count')">Delete Selected</button>`:''}
      <button class="btn btn-sm" style="margin-left:auto" onclick="clearSelection(selectedPunch,'punch','bulk-bar-punch','punch-sel-count')">Clear</button>
    </div>
  </div>`;
}

async function doBatchPunchClose() {
  const ids = [...selectedPunch];
  if(!ids.length) return;
  const {error} = await sb.from('punch_list').update({status:'Closed',closed_date:new Date().toISOString().split('T')[0]}).in('id',ids);
  if(error){toast('Error: '+error.message,'error');return;}
  toast(`Closed ${ids.length} punch item${ids.length!==1?'s':''}`,'success');
  clearSelection(selectedPunch,'punch','bulk-bar-punch','punch-sel-count');
  renderPunchList();
}

async function viewPunchItem(id) {
  const [{data:p},comments,atts] = await Promise.all([
    sb.from('punch_list').select('*').eq('id',id).single(),
    loadComments('punch',id),
    loadAttachments('punch',id)
  ]);
  if(!p) return;
  openModal(`Punch Item – ${p.description?.substring(0,40)}`, `
    <div class="detail-grid">
      <div class="detail-item"><div class="detail-label">Location</div><div class="detail-value">${p.location||'—'}</div></div>
      <div class="detail-item"><div class="detail-label">Element</div><div class="detail-value">${p.element||'—'}</div></div>
      <div class="detail-item"><div class="detail-label">Discipline</div><div class="detail-value">${p.discipline||'—'}</div></div>
      <div class="detail-item"><div class="detail-label">Severity</div><div class="detail-value">${sbadge(p.severity)}</div></div>
      <div class="detail-item"><div class="detail-label">Raised By</div><div class="detail-value">${p.raised_by||'—'}</div></div>
      <div class="detail-item"><div class="detail-label">Assigned To</div><div class="detail-value">${p.assigned_to||'—'}</div></div>
      <div class="detail-item"><div class="detail-label">Status</div><div class="detail-value">${sbadge(p.status)}</div></div>
      <div class="detail-item"><div class="detail-label">Date Raised</div><div class="detail-value">${p.created_at?p.created_at.split('T')[0]:'—'}</div></div>
    </div>
    ${p.description?`<div class="detail-section"><div class="detail-label" style="margin-bottom:6px">Description</div><div style="font-size:12px;color:var(--charcoal)">${p.description}</div></div>`:''}
    ${p.status!=='Closed'?`<div class="detail-section">
      <div class="form-group"><label class="form-label-dark">Contractor Response / Action Taken</label>
        <textarea class="form-control" id="punch-response-${id}" placeholder="Describe action taken..." style="min-height:70px">${p.contractor_response||''}</textarea>
      </div>
      <div class="frow">
        <div class="form-group"><label class="form-label-dark">Assigned To</label>
          <input type="text" class="form-control" id="punch-assign-${id}" value="${p.assigned_to||''}" placeholder="Subcontractor / Person responsible" />
        </div>
        <div class="form-group"><label class="form-label-dark">Status</label>
          <select class="form-control" id="punch-status-${id}">
            <option ${p.status==='Open'?'selected':''}>Open</option>
            <option ${p.status==='In Progress'?'selected':''}>In Progress</option>
            ${can('approve')?`<option ${p.status==='Closed'?'selected':''}>Closed</option>`:''}
          </select>
        </div>
      </div>
    </div>`:''}
    ${attachmentSectionHTML('punch',id,atts)}
    ${commentThreadHTML('punch',id,comments)}`,
    `${p.status!=='Closed'?`<button class="btn btn-primary" onclick="updatePunchItem('${id}')">Update</button>`:''}
     <button class="btn" onclick="closeModal()">Close</button>`, true);
}

async function updatePunchItem(id) {
  const newStatus = document.getElementById('punch-status-'+id)?.value||'Open';
  const {error} = await sb.from('punch_list').update({
    contractor_response: document.getElementById('punch-response-'+id)?.value||null,
    assigned_to: document.getElementById('punch-assign-'+id)?.value||null,
    status: newStatus,
    closed_date: newStatus==='Closed'?new Date().toISOString().split('T')[0]:null,
  }).eq('id',id);
  if(error){toast('Error','error');return;}
  await logAudit(id, 'punch_list', 'Punch Item Updated: '+newStatus);
  toast('Punch item updated','success'); closeModal(); render();
}

async function closePunchItem(id) {
  const {error} = await sb.from('punch_list').update({status:'Closed',closed_date:new Date().toISOString().split('T')[0]}).eq('id',id);
  if(error){toast('Error: '+error.message,'error');return;}
  await logAudit(id, 'punch_list', 'Punch Item Closed');
  toast('Item closed','success'); render();
}

async function openNewPunchItem() {
  openModal('Add Punch List Item', `
    <div class="form-group"><label class="form-label-dark">Description <span style="color:var(--red)">*</span></label>
      <textarea class="form-control" id="np-desc" placeholder="Describe the defect or incomplete work item..." style="min-height:70px"></textarea>
    </div>
    <div class="frow">
      <div class="form-group"><label class="form-label-dark">Location</label>
        <input type="text" class="form-control" id="np-loc" placeholder="e.g. Level 4 – Apartment 401" />
      </div>
      <div class="form-group"><label class="form-label-dark">Element</label>
        <input type="text" class="form-control" id="np-elem" placeholder="e.g. Door frame, Window seal" />
      </div>
    </div>
    <div class="frow">
      <div class="form-group"><label class="form-label-dark">Discipline</label>
        <select class="form-control" id="np-disc">
          <option>Architecture</option><option>Structure</option><option>MEP</option>
          <option>Civil</option><option>Firefighting</option><option>Finishing</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label-dark">Severity</label>
        <select class="form-control" id="np-sev"><option>Minor</option><option>Major</option><option>Critical</option></select>
      </div>
    </div>
    <div class="form-group"><label class="form-label-dark">Assigned To (optional)</label>
      <input type="text" class="form-control" id="np-assign" placeholder="Subcontractor responsible" />
    </div>
    <div class="form-group"><label class="form-label-dark">Photo Attachments</label>
      <div class="upload-zone" style="padding:14px 16px;display:flex;align-items:center;gap:10px;text-align:left"
        onclick="document.getElementById('np-files').click()"
        ondragover="event.preventDefault();this.classList.add('dragging')"
        ondragleave="this.classList.remove('dragging')"
        ondrop="event.preventDefault();this.classList.remove('dragging');stageFiles(event.dataTransfer.files,'np-staged')">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;opacity:.6"><path d="M8 2v8M5 5l3-3 3 3" stroke="var(--text2)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 11v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="var(--text2)" stroke-width="1.3" stroke-linecap="round"/></svg>
        <span style="font-size:12px;color:var(--text2)">Attach site photos — images and PDFs (max 50MB)</span>
      </div>
      <input type="file" id="np-files" multiple accept="image/*,.pdf" style="display:none" onchange="stageFiles(this.files,'np-staged')" />
      <div id="np-staged" style="display:flex;flex-direction:column;gap:4px;margin-top:6px"></div>
    </div>`,
    `<button class="btn btn-primary" onclick="doNewPunchItem()">Add to Punch List</button>
     <button class="btn" onclick="closeModal()">Cancel</button>`);
}

async function doNewPunchItem() {
  const desc = document.getElementById('np-desc')?.value;
  if(!desc){toast('Description is required','error');return;}
  const {data:newPunch,error} = await sb.from('punch_list').insert({project_id:currentProject.id,
    description:desc,
    location:document.getElementById('np-loc')?.value||null,
    element:document.getElementById('np-elem')?.value||null,
    discipline:document.getElementById('np-disc')?.value||null,
    severity:document.getElementById('np-sev')?.value||'Minor',
    assigned_to:document.getElementById('np-assign')?.value||null,
    raised_by:currentProfile?.full_name||currentUser?.email,
    status:'Open',
  }).select().single();
  if(error){toast('Error: '+error.message,'error');return;}
  if(newPunch?.id) {
    await uploadStagedFiles('np-staged','punch',newPunch.id);
    await logAudit(newPunch.id, 'punch_list', 'Punch Item Created');
  }
  toast('Punch list item added','success'); closeModal(); render();
}

// ─── RESUBMISSION ─────────────────────────────────────────────────
async function createResubmission(parentId) {
  const {data:parent} = await sb.from('submittals').select('*').eq('id',parentId).single();
  if(!parent) return;
  const newRevNo = (parent.revision_no||0)+1;
  const newRefNo = parent.ref_no.replace(/Rev \d+|Rev_\d+/,'').trim() + ` Rev ${String(newRevNo).padStart(3,'0')}`;
  openModal(`Resubmit – ${parent.ref_no}`,`
    <div style="background:var(--bg3);border-radius:6px;padding:10px 12px;margin-bottom:4px;font-size:11px;color:var(--text2)">
      Resubmitting against: <span style="color:var(--text);font-weight:500">${parent.ref_no} – ${parent.title}</span><br>
      Previous outcome: ${sbadge(parent.outcome?'Code ('+parent.outcome+')':parent.status)}
    </div>
    <div class="frow">
      <div class="form-group"><label class="form-label-dark">New Reference No.</label><input type="text" class="form-control" id="rs-ref" value="${newRefNo}" /></div>
      <div class="form-group"><label class="form-label-dark">Revision No.</label><input type="text" class="form-control" id="rs-revno" value="Rev ${String(newRevNo).padStart(3,'0')}" readonly /></div>
    </div>
    <div class="form-group"><label class="form-label-dark">Changes Made (describe what was revised)</label><textarea class="form-control" id="rs-changes" placeholder="Describe the changes made in this resubmission..." style="min-height:80px"></textarea></div>
    <div class="frow">
      <div class="form-group"><label class="form-label-dark">New Due Date</label><input type="date" class="form-control" id="rs-due" /></div>
      <div class="form-group"><label class="form-label-dark">From</label><input type="text" class="form-control" id="rs-from" value="${parent.from_party||'MBC'}" /></div>
    </div>`,
    `<button class="btn btn-primary" onclick="doResubmitDetail('${parentId}','${newRevNo}')">Create Resubmission</button><button class="btn" onclick="closeModal()">Cancel</button>`);
}

async function doResubmitDetail(parentId, revNo) {
  const {data:parent} = await sb.from('submittals').select('*').eq('id',parentId).single();
  const changes = document.getElementById('rs-changes')?.value||'';
  const {error} = await sb.from('submittals').insert({project_id:currentProject.id,
    ref_no: document.getElementById('rs-ref')?.value,
    revision_no: parseInt(revNo),
    title: parent.title,
    from_party: document.getElementById('rs-from')?.value||parent.from_party,
    to_party: parent.to_party,
    submit_date: new Date().toISOString().split('T')[0],
    due_date: document.getElementById('rs-due')?.value||null,
    status:'Pending Review',
    attachments: parent.attachments,
    discipline: parent.discipline,
    parent_id: parentId,
    revision: `Rev ${String(revNo).padStart(3,'0')}`,
    eng_comments:'', outcome:'', reviewed_by:'', review_date:null
  });
  if(error){toast('Error: '+error.message,'error');return;}
  // Update parent status to awaiting resubmission — already captured in new rev
  if(changes) {
    await sb.from('comments').insert({
      record_type:'submittal', record_id:parentId,
      author_name:currentProfile?.full_name||'System',
      author_role:currentProfile?.role||'contractor',
      message:`Resubmission Rev ${revNo} created. Changes: ${changes}`
    });
  }
  await logAudit(parentId, 'submittal', 'Resubmission Created: Rev '+revNo);
  toast('Resubmission created','success'); closeModal(); render();
}

// ─── NEW ITEM FORMS – RFI & TRANSMITTAL ───────────────────────────
async function openNewRFI() {
  const {data:draws} = await sb.from('drawings').select('drawing_no,title').eq('project_id',currentProject.id).order('drawing_no');
  openModal('New RFI',`
    <div class="frow">
      <div class="form-group"><label class="form-label-dark">RFI Ref No.</label><input type="text" class="form-control" id="nr-id" placeholder="RFI-001" /></div>
      <div class="form-group"><label class="form-label-dark">Priority</label>
        <select class="form-control" id="nr-pri"><option>Normal</option><option>High</option><option>Urgent</option></select>
      </div>
    </div>
    <div class="form-group"><label class="form-label-dark">Subject</label><input type="text" class="form-control" id="nr-subj" placeholder="Brief subject of the RFI" /></div>
    <div class="frow">
      <div class="form-group"><label class="form-label-dark">Drawing Reference</label>
        <select class="form-control" id="nr-draw"><option value="">— None —</option>${(draws||[]).map(d=>`<option value="${d.drawing_no}">${d.drawing_no} – ${d.title}</option>`).join('')}</select>
      </div>
      <div class="form-group"><label class="form-label-dark">Due Date</label><input type="date" class="form-control" id="nr-due" /></div>
    </div>
    <div class="form-group"><label class="form-label-dark">Assigned To</label>
      <select class="form-control" id="nr-assign">
        <option value="POE">POE (Consultant)</option>
        <option value="Regent">Regent (Developer)</option>
        <option value="MBC">MBC (Main Contractor)</option>
      </select>
    </div>
    <div class="form-group"><label class="form-label-dark">Question / Description</label><textarea class="form-control" id="nr-q" placeholder="Describe the information being requested..." style="min-height:100px"></textarea></div>`,
    `<button class="btn btn-primary" onclick="doNewRFI()">Raise RFI</button><button class="btn" onclick="closeModal()">Cancel</button>`);
}

async function doNewRFI() {
  const ref = document.getElementById('nr-id')?.value;
  const subj = document.getElementById('nr-subj')?.value;
  if(!ref||!subj){toast('Ref number and subject are required','error');return;}
  const {data:newRFI,error} = await sb.from('rfis').insert({project_id:currentProject.id,
    ref_no:ref, subject:subj,
    drawing_ref:document.getElementById('nr-draw')?.value||null,
    raised_by:currentProfile?.full_name||currentUser?.email,
    assigned_to:document.getElementById('nr-assign')?.value,
    priority:document.getElementById('nr-pri')?.value||'Normal',
    due_date:document.getElementById('nr-due')?.value||null,
    question:document.getElementById('nr-q')?.value,
    status:'Open'
  }).select().single();
  if(error){toast('Error: '+error.message,'error');return;}
  if(newRFI?.id) await logAudit(newRFI.id, 'rfi', 'RFI Raised: '+ref);
  toast('RFI raised','success'); closeModal(); render();
}

async function openNewTransmittal() {
  const {data:draws} = await sb.from('drawings').select('drawing_no,title,revision').eq('project_id',currentProject.id).order('drawing_no');
  openModal('New Transmittal',`
    <div class="frow">
      <div class="form-group"><label class="form-label-dark">Transmittal Ref</label><input type="text" class="form-control" id="nt-ref" placeholder="TRN-001" /></div>
      <div class="form-group"><label class="form-label-dark">Date</label><input type="date" class="form-control" id="nt-date" value="${new Date().toISOString().split('T')[0]}" /></div>
    </div>
    <div class="frow">
      <div class="form-group"><label class="form-label-dark">From</label>
        <select class="form-control" id="nt-from"><option>POE</option><option>MBC</option><option>Regent</option></select>
      </div>
      <div class="form-group"><label class="form-label-dark">To</label>
        <select class="form-control" id="nt-to"><option>MBC</option><option>POE</option><option>Regent</option></select>
      </div>
    </div>
    <div class="frow">
      <div class="form-group"><label class="form-label-dark">Purpose</label>
        <select class="form-control" id="nt-purpose">
          <option>For Construction</option><option>For Review and Comment</option><option>For Approval</option>
          <option>For Information</option><option>For Record</option><option>As Built</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label-dark">Method</label>
        <select class="form-control" id="nt-method"><option>Email</option><option>Portal</option><option>Hand Delivery</option><option>Courier</option></select>
      </div>
    </div>
    <div class="form-group"><label class="form-label-dark">Documents to Transmit</label>
      <div style="background:var(--bg3);border-radius:6px;max-height:180px;overflow-y:auto;border:1px solid var(--border)">
        ${(draws||[]).map((d,i)=>`<label style="display:flex;align-items:center;gap:8px;padding:6px 10px;cursor:pointer;border-bottom:1px solid var(--border);font-size:11px">
          <input type="checkbox" id="tdoc-${i}" data-no="${d.drawing_no}" data-title="${d.title}" data-rev="${d.revision||'Rev A'}" style="accent-color:var(--blue)">
          <span style="color:var(--text2)">${d.drawing_no}</span> – ${d.title} <span class="rev-chip" style="margin-left:auto">${d.revision||'Rev A'}</span>
        </label>`).join('')}
        ${!draws?.length?'<div style="padding:12px;color:var(--text3);font-size:11px;text-align:center">No drawings in register yet</div>':''}
      </div>
    </div>
    <div class="frow">
      <div class="form-group"><label class="form-label-dark">Response Required By</label>
        <input type="date" class="form-control" id="nt-response-date" />
      </div>
      <div class="form-group"><label class="form-label-dark">Notes</label>
        <textarea class="form-control" id="nt-notes" placeholder="Any additional notes..." style="min-height:50px"></textarea>
      </div>
    </div>`,
    `<button class="btn btn-primary" onclick="doNewTransmittal(${draws?.length||0})">Create Transmittal</button><button class="btn" onclick="closeModal()">Cancel</button>`);
}

async function doNewTransmittal(drawCount) {
  const ref = document.getElementById('nt-ref')?.value;
  if(!ref){toast('Transmittal ref is required','error');return;}
  const docs = [];
  for(let i=0;i<drawCount;i++){
    const cb = document.getElementById('tdoc-'+i);
    if(cb?.checked) docs.push({no:cb.dataset.no,title:cb.dataset.title,rev:cb.dataset.rev,copies:1});
  }
  const {data:newTrans,error} = await sb.from('transmittals').insert({project_id:currentProject.id,
    ref_no:ref,
    from_party:document.getElementById('nt-from')?.value,
    to_party:document.getElementById('nt-to')?.value,
    transmit_date:document.getElementById('nt-date')?.value,
    purpose:document.getElementById('nt-purpose')?.value,
    method:document.getElementById('nt-method')?.value,
    documents:JSON.stringify(docs),
    notes:document.getElementById('nt-notes')?.value||'',
    response_required:document.getElementById('nt-response-date')?.value||null
  }).select('id').single();
  if(error){toast('Error: '+error.message,'error');return;}
  if(newTrans?.id) await logAudit(newTrans.id, 'transmittal', 'Transmittal Created: '+ref);
  toast('Transmittal created','success'); closeModal(); render();
}


// ─── NEW ITEM FORMS ───────────────────────────────────────────────
async function openNew() {
  if(currentPage==='usetup') { openAddUnitForm(); return; }
  const {data:scs} = await sb.from('subcontractors').select('*');
  const scOpts = (scs||[]).map(s=>`<option value="${s.id}">${s.name}</option>`).join('');

  if(currentPage==='draw' && can('upload')) {
    openModal('Upload New Drawing', `
      <div style="background:var(--bg3);border-radius:8px;padding:12px 14px;margin-bottom:4px">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">ISO 19650 Document Number</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr 1fr 1fr;gap:8px;margin-bottom:8px">
          <div class="form-group"><label class="form-label-dark" title="Required per ISO 19650-2 §5.3.2">Originator <span style="color:var(--red)">*</span></label><input type="text" class="form-control" id="nd-orig" value="MBC" oninput="updateDocNum()" /></div>
          <div class="form-group"><label class="form-label-dark" title="Volume or Zone reference">Zone <span style="color:var(--red)">*</span></label><input type="text" class="form-control" id="nd-zone" placeholder="B1" oninput="updateDocNum()" /></div>
          <div class="form-group"><label class="form-label-dark">Level <span style="color:var(--red)">*</span></label><input type="text" class="form-control" id="nd-level" placeholder="L04" oninput="updateDocNum()" /></div>
          <div class="form-group"><label class="form-label-dark">Type</label>
            <select class="form-control" id="nd-type" onchange="updateDocNum()">
              <option value="DR">DR – Drawing</option>
              <option value="SP">SP – Specification</option>
              <option value="CA">CA – Calculation</option>
              <option value="MS">MS – Method Statement</option>
            </select>
          </div>
          <div class="form-group"><label class="form-label-dark" title="Role code e.g. A=Architect, S=Structural">Role <span style="color:var(--red)">*</span></label><input type="text" class="form-control" id="nd-role" placeholder="A" oninput="updateDocNum()" /></div>
          <div class="form-group"><label class="form-label-dark" title="4-digit sequence number">Number <span style="color:var(--red)">*</span></label><input type="text" class="form-control" id="nd-num" placeholder="0001" maxlength="4" oninput="updateDocNum()" /></div>
          <div class="form-group"><label class="form-label-dark">Revision <span style="color:var(--red)">*</span></label><input type="text" class="form-control" id="nd-rev" value="Rev A" oninput="updateDocNum();checkRevScheme()" /></div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="font-size:10px;color:var(--text3)">Generated No.:</div>
          <div id="nd-preview" style="font-family:var(--font-mono);font-size:11px;font-weight:500;color:var(--sand);background:var(--bg2);padding:4px 10px;border-radius:6px;border:0.5px solid var(--border2)">GG-MBC-——-——-DR-——-——-RevA</div>
          <button type="button" class="btn btn-sm" onclick="document.getElementById('nd-id').value=document.getElementById('nd-preview').textContent;validateDrawingNumberLive()" style="font-size:10px">Use this</button>
        </div>
      </div>
      <div class="frow">
        <div class="form-group"><label class="form-label-dark">Drawing No. <span style="color:var(--text3);font-size:9px">(or use generated above)</span></label><input type="text" class="form-control" id="nd-id" placeholder="e.g. GG-MBC-B1-L04-DR-RevA" onblur="validateDrawingNumberLive()" /><div id="nd-id-err" class="form-err"></div></div>
      </div>
      <div class="form-group"><label class="form-label-dark">Title</label><input type="text" class="form-control" id="nd-title" placeholder="Drawing title" /><div id="nd-title-err" class="form-err"></div></div>
      <div class="frow">
        <div class="form-group"><label class="form-label-dark">Discipline</label>
          <select class="form-control" id="nd-disc"><option>Architecture</option><option>Structure</option><option>MEP</option><option>Civil</option><option>General</option><option>Interior Design</option></select>
        </div>
        <div class="form-group"><label class="form-label-dark">Review Status</label>
          <select class="form-control" id="nd-status" onchange="checkRevScheme()"><option>Under Review</option><option>Issued for Construction</option><option>Approved</option></select>
        </div>
      </div>
      <div class="frow">
        <div class="form-group"><label class="form-label-dark" title="ISO 19650 Purpose of Issue code">Purpose of Issue (POI)</label>
          <select class="form-control" id="nd-poi">
            <option value="">— Select —</option>
            <option value="S0">S0 – Work in Progress</option>
            <option value="S1">S1 – Suitable for Coordination</option>
            <option value="S2">S2 – Suitable for Information</option>
            <option value="S3">S3 – Suitable for Review & Comment</option>
            <option value="S4">S4 – Suitable for Construction</option>
            <option value="S5">S5 – As Constructed</option>
          </select>
        </div>
        <div class="form-group"><label class="form-label-dark">AR / FI Classification</label>
          <select class="form-control" id="nd-arfi">
            <option value="AR">AR – Action Required</option>
            <option value="FI">FI – For Information Only</option>
          </select>
        </div>
      </div>
      <div id="nd-rev-warn" style="display:none;background:var(--amber-bg);border:0.5px solid #FAC775;border-radius:6px;padding:7px 12px;font-size:11px;color:var(--amber);margin-top:-4px"></div>
      <div id="nd-num-warn" style="display:none;background:var(--amber-bg);border:0.5px solid #FAC775;border-radius:6px;padding:7px 12px;font-size:11px;color:var(--amber);margin-top:-4px"></div>
      <div class="form-group"><label class="form-label-dark">Upload PDF File</label>
        <div class="upload-zone" id="uz-new" onclick="document.getElementById('fu-new').click()" ondragover="event.preventDefault();this.classList.add('dragging')" ondragleave="this.classList.remove('dragging')" ondrop="handleDrop(event,'new')">
          <div style="font-size:24px">📄</div>
          <div class="upload-zone-text">Click to select or drag & drop PDF</div>
          <div class="upload-zone-sub">PDF, DWG files accepted</div>
        </div>
        <input type="file" id="fu-new" accept=".pdf,.dwg" style="display:none" onchange="handleFileSelect(event,'new')" />
        <div id="file-name-new" style="font-size:11px;color:var(--text2);margin-top:6px"></div>
      </div>
      <div class="form-group"><label class="form-label-dark">Additional Attachments (optional)</label>
        <div class="upload-zone" style="padding:14px 16px;display:flex;align-items:center;gap:10px;text-align:left" onclick="document.getElementById('nd-extra-files').click()" ondragover="event.preventDefault();this.classList.add('dragging')" ondragleave="this.classList.remove('dragging')" ondrop="event.preventDefault();this.classList.remove('dragging');stageFiles(event.dataTransfer.files,'nd-staged')"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;opacity:.6"><path d="M8 2v8M5 5l3-3 3 3" stroke="var(--text2)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 11v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="var(--text2)" stroke-width="1.3" stroke-linecap="round"/></svg><span style="font-size:12px;color:var(--text2)">Attach supporting documents — specs, calculations, references (max 50MB each)</span></div>
        <input type="file" id="nd-extra-files" multiple style="display:none" onchange="stageFiles(this.files,'nd-staged')" />
        <div id="nd-staged" style="display:flex;flex-direction:column;gap:4px;margin-top:6px"></div>
      </div>`,
      `<button class="btn btn-primary" onclick="doNewDraw()">Upload Drawing</button><button class="btn" onclick="closeModal()">Cancel</button>`);

  } else if(currentPage==='sub' && can('submit')) {
    const {data:draws} = await sb.from('drawings').select('drawing_no,title').eq('project_id',currentProject.id).order('drawing_no');
    openModal('New Document Submittal (DSUB)', `
      <div class="frow">
        <div class="form-group"><label class="form-label-dark">Reference No.</label><input type="text" class="form-control" id="ns-id" placeholder="MBC-POE-DT-P454-25-0XX" /></div>
        <div class="form-group"><label class="form-label-dark">Date</label><input type="date" class="form-control" id="ns-date" value="${new Date().toISOString().split('T')[0]}" /></div>
      </div>
      <div class="form-group"><label class="form-label-dark">Document Title</label><input type="text" class="form-control" id="ns-title" placeholder="e.g. Structural Shop Drawings – Level 3" /></div>
      <div class="frow">
        <div class="form-group"><label class="form-label-dark">From</label><select class="form-control" id="ns-from"><option value="MBC">MBC (Main Contractor)</option>${(scs||[]).map(s=>`<option value="${s.name}">${s.name}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label-dark">To</label><select class="form-control" id="ns-to"><option value="POE">POE (Consultant)</option><option value="Regent">Regent (Developer)</option></select></div>
      </div>
      <div class="frow">
        <div class="form-group"><label class="form-label-dark">Response Due Date</label><input type="date" class="form-control" id="ns-due" /></div>
        <div class="form-group"><label class="form-label-dark">Related Drawing (optional)</label>
          <select class="form-control" id="ns-drawing">
            <option value="">— None —</option>
            ${(draws||[]).map(d=>`<option value="${d.drawing_no}">${d.drawing_no} – ${d.title}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="frow">
      </div>
      <div class="form-group"><label class="form-label-dark">Attachments</label>
        <div class="checkbox-grid">
          <label><input type="checkbox" id="ns-samp"> Samples</label>
          <label><input type="checkbox" id="ns-broc"> Original Brochure</label>
          <label><input type="checkbox" id="ns-draw"> Drawings</label>
          <label><input type="checkbox" id="ns-sket"> Sketches</label>
          <label><input type="checkbox" id="ns-spec"> Specification</label>
          <label><input type="checkbox" id="ns-oth"> Others</label>
        </div>
      </div>
      <div class="form-group"><label class="form-label-dark">Discipline</label>
        <div class="checkbox-grid">
          <label><input type="checkbox" id="ns-civil"> Civil / Structural</label>
          <label><input type="checkbox" id="ns-mech"> Mechanical</label>
          <label><input type="checkbox" id="ns-elv"> ELV / IT</label>
          <label><input type="checkbox" id="ns-dspec"> Specification</label>
          <label><input type="checkbox" id="ns-arch"> Architectural</label>
          <label><input type="checkbox" id="ns-elec"> Electrical</label>
        </div>
      </div>
      <div class="form-group"><label class="form-label-dark">Attachments (optional)</label>
        <div class="upload-zone" style="padding:14px 16px;display:flex;align-items:center;gap:10px;text-align:left" onclick="document.getElementById('ns-files').click()" ondragover="event.preventDefault();this.classList.add('dragging')" ondragleave="this.classList.remove('dragging')" ondrop="event.preventDefault();this.classList.remove('dragging');stageFiles(event.dataTransfer.files,'ns-staged')"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;opacity:.6"><path d="M8 2v8M5 5l3-3 3 3" stroke="var(--text2)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 11v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="var(--text2)" stroke-width="1.3" stroke-linecap="round"/></svg><span style="font-size:12px;color:var(--text2)">Click to attach or drag & drop files — PDF, DWG, Images, Word, Excel (max 50MB)</span></div>
        <input type="file" id="ns-files" multiple style="display:none" onchange="stageFiles(this.files,'ns-staged')" />
        <div id="ns-staged" style="display:flex;flex-direction:column;gap:4px;margin-top:6px"></div>
      </div>`,
      `<button class="btn btn-primary" onclick="doNewSub()">Create Submittal</button><button class="btn" onclick="closeModal()">Cancel</button>`);

  } else if(currentPage==='ir' && can('submit')) {
    openNewIR();

  } else if(currentPage==='ncr' && can('raise')) {
    openNewNCR();

  } else if(currentPage==='rfi') {
    openNewRFI();
  } else if(currentPage==='trans') {
    openNewTransmittal();
  } else if(currentPage==='ms' && can('submitMS')) {
    openNewMS();
  } else if(currentPage==='sreg' && can('manageRegister')) {
    addRegisterItem();
  } else if(currentPage==='corr' && can('approve')) {
    openNewCorrespondence();
  } else if(currentPage==='punch' && can('approve')) {
    openNewPunchItem();
  } else if(currentPage==='ipc' && (can('submit') || currentProfile?.role==='developer')) {
    openNewIPC();
  } else if(currentPage==='boq' && can('manageRegister')) {
    openImportBOQ();
  } else if(currentPage==='subs' && can('manageSubs')) {
    openModal('Add Subcontractor', `
      <div class="form-group"><label class="form-label-dark">Company Name</label><input type="text" class="form-control" id="nsc-name" placeholder="Full legal company name" /></div>
      <div class="frow">
        <div class="form-group"><label class="form-label-dark">Representative</label><input type="text" class="form-control" id="nsc-rep" placeholder="e.g. Eng. Ahmed Hassan" /></div>
        <div class="form-group"><label class="form-label-dark">Discipline</label>
          <select class="form-control" id="nsc-disc"><option>MEP</option><option>Civil</option><option>Structural</option><option>Electrical</option><option>Architectural</option><option>Firefighting</option></select>
        </div>
      </div>
      <div class="form-group"><label class="form-label-dark">Trade / Scope</label><input type="text" class="form-control" id="nsc-trade" placeholder="e.g. Mechanical / Electrical / Plumbing" /></div>`,
      `<button class="btn btn-primary" onclick="doNewSubcontractor()">Add Subcontractor</button><button class="btn" onclick="closeModal()">Cancel</button>`);
  } else {
    openModal('Access Restricted', `<div class="empty-state">Your current role does not have permission to create items on this page.</div>`,
      `<button class="btn" onclick="closeModal()">Close</button>`);
  }
}

function checkRevScheme() {
  const status = document.getElementById('nd-status')?.value||'';
  const rev = document.getElementById('nd-rev')?.value||'';
  const result = enforceRevisionScheme(status, rev);
  const el = document.getElementById('nd-rev-warn');
  if(el){ el.style.display = result.warn?'':'none'; el.textContent = result.msg; }
}


async function doNewSubcontractor() {
  const name = document.getElementById('nsc-name').value;
  if(!name){toast('Company name is required','error');return;}
  const {error} = await sb.from('subcontractors').insert({project_id:currentProject.id,
    name,rep:document.getElementById('nsc-rep').value,
    discipline:document.getElementById('nsc-disc').value,
    trade:document.getElementById('nsc-trade').value
  });
  if(error){toast('Error: '+error.message,'error');return;}
  toast('Subcontractor added','success'); closeModal(); render();
}


document.addEventListener('click', function(e) {
  if (!e.target.closest('.psw-wrap')) closeProjectDropdown();
});
