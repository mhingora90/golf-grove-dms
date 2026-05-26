// ─── METHOD STATEMENTS ───────────────────────────────────────────────
async function renderMS() {
  selectedMS = new Set();
  const {data} = await sb.from('method_statements').select('*').eq('project_id',currentProject.id).order('created_at',{ascending:false});
  const rows = data||[];
  const pending = rows.filter(r=>r.status==='Pending Review').length;
  const underReview = rows.filter(r=>r.status==='Under Review').length;
  const approved = rows.filter(r=>r.status==='Approved').length;
  const rejected = rows.filter(r=>r.status==='Rejected').length;
  document.getElementById('content').innerHTML = `
  <div class="module-bar">
    <div class="module-stat"><div class="module-stat-val ${pending>0?'warn':''}">${pending}</div><div class="module-stat-label">Pending Review</div></div>
    <div class="module-stat"><div class="module-stat-val">${underReview}</div><div class="module-stat-label">Under Review</div></div>
    <div class="module-stat"><div class="module-stat-val">${approved}</div><div class="module-stat-label">Approved</div></div>
    <div class="module-stat"><div class="module-stat-val ${rejected>0?'danger':''}">${rejected}</div><div class="module-stat-label">Rejected</div></div>
  </div>
  <div class="fbar">
    <select class="filter-sel" onchange="filt('ms','status',this.value)">
      <option value="All">All Statuses</option>
      <option>Pending Review</option><option>Under Review</option><option>Approved</option><option>Revise &amp; Resubmit</option><option>Rejected</option>
    </select>
    <input type="text" class="reg-search" style="margin-left:auto" placeholder="Search method statements..." oninput="searchReg('ms',this.value)" />
  </div>
  <div class="card"><div class="tw"><table>
    <tr>
      <th style="width:32px;text-align:center"><input type="checkbox" id="ms-select-all" onchange="selectAllRows('ms',selectedMS,'bulk-bar-ms','ms-sel-count')" /></th>
      <th>Ref No.</th><th>Title / Activity</th><th>Discipline</th><th>Location</th><th>Rev</th><th>Submitted By</th><th>Date</th><th>Status</th><th>Actions</th>
    </tr>
    ${rows.length?rows.map(m=>`<tr class="ms-row" data-status="${m.status||''}" data-search="${[m.ref_no,m.title,m.activity].filter(Boolean).join(' ').replace(/"/g,' ').toLowerCase()}" data-id="${m.id}">
      <td style="text-align:center"><input type="checkbox" class="row-cb" id="mscb-${m.id}" onchange="toggleRowSelect('${m.id}',selectedMS,'ms','bulk-bar-ms','ms-sel-count')" /></td>
      <td class="mono">${m.ref_no}</td>
      <td><div style="font-weight:500;color:var(--blue);cursor:pointer" onclick="viewMS('${m.id}')">${m.title}</div><div style="font-size:10px;color:var(--text3)">${m.activity||''}</div></td>
      <td style="color:var(--text2)">${m.discipline||'—'}</td>
      <td style="color:var(--text2);font-size:11px">${m.location||'—'}</td>
      <td><span class="rev-chip">${m.revision||'Rev 0'}</span></td>
      <td style="font-size:11px;color:var(--text2)">${m.submitted_by||'—'}</td>
      <td style="font-size:10px;color:var(--text3)">${m.submitted_date||'—'}</td>
      <td>${sbadge(m.status)}</td>
      <td><div style="display:flex;gap:4px">
        <button class="btn btn-sm" onclick="viewMS('${m.id}')">View</button>
        ${can('approve')&&m.status==='Pending Review'?`<button class="btn btn-sm btn-primary" onclick="viewMS('${m.id}')">Review</button>`:''}
      </div></td>
    </tr>`).join(''):`<tr><td colspan="10" class="empty-state">No method statements submitted yet</td></tr>`}
    <tr id="srch-empty-ms" style="display:none"><td colspan="10" class="empty-state"></td></tr>
  </table>
  <div class="record-footer">Showing ${rows.length} record${rows.length!==1?'s':''}</div>
  </div></div>
  <div id="bulk-bar-ms" class="bulk-bar">
    <div class="bulk-bar-inner">
      <span id="ms-sel-count" class="bulk-bar-count">0 selected</span>
      <button class="btn btn-sm" onclick="bulkExportCSV('method_statements','*','method_statements.csv')">Export Selected</button>
      ${can('approve')?`<button class="btn btn-sm btn-success" onclick="doBatchMSApprove()">Approve Selected</button>`:''}
      ${currentProfile?.role==='developer'?`<button class="btn btn-sm btn-danger" onclick="bulkDelete('method_statements',selectedMS,'ms','bulk-bar-ms','ms-sel-count')">Delete Selected</button>`:''}
      <button class="btn btn-sm" style="margin-left:auto" onclick="clearSelection(selectedMS,'ms','bulk-bar-ms','ms-sel-count')">Clear</button>
    </div>
  </div>`;
}

async function doBatchMSApprove() {
  const ids = [...selectedMS];
  if(!ids.length) return;
  const {error} = await sb.from('method_statements').update({status:'Approved',outcome:'1'}).in('id',ids);
  if(error){toast('Error: '+error.message,'error');return;}
  toast(`Approved ${ids.length} method statement${ids.length!==1?'s':''}`,'success');
  clearSelection(selectedMS,'ms','bulk-bar-ms','ms-sel-count');
  renderMS();
}

async function viewMS(id) {
  const [{data:m},comments,atts] = await Promise.all([
    sb.from('method_statements').select('*').eq('id',id).single(),
    loadComments('ms',id),
    loadAttachments('ms',id)
  ]);
  if(!m) return;
  const msDoc = `<div id="ms-print-${m.id}" style="background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;font-size:10.5px;padding:18px">
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;border:.7px solid #aaa;margin-bottom:8px">
      <div style="padding:8px;border-right:.7px solid #aaa"><div style="font-size:14px;font-weight:700;color:#00008B">POE</div><div style="font-size:9px">ENGINEERING CONSULTANTS</div></div>
      <div style="padding:8px;border-right:.7px solid #aaa;text-align:center"><div style="font-size:18px;font-style:italic;color:#00008B">regent</div><div style="font-size:9px">DEVELOPMENTS</div></div>
      <div style="padding:6px;text-align:right;font-size:9px">Modern Building Contracting L.L.C<br>Tel.: 04-2344445</div>
    </div>
    <div style="text-align:center;font-weight:700;font-size:12px;text-decoration:underline;padding:5px;border:.7px solid #888;margin-bottom:0;color:#000">METHOD STATEMENT REVIEW</div>
    <div class="tw"><table style="width:100%;border-collapse:collapse;color:#000">
      <tr>
        <td style="border:.7px solid #888;padding:4px 7px;font-weight:700;width:25%">MS Ref No.:</td>
        <td style="border:.7px solid #888;padding:4px 7px;color:#8B0000;font-weight:700">${m.ref_no}</td>
        <td style="border:.7px solid #888;padding:4px 7px;font-weight:700;width:20%">Revision:</td>
        <td style="border:.7px solid #888;padding:4px 7px;font-weight:700">${m.revision||'Rev 0'}</td>
      </tr>
      <tr>
        <td style="border:.7px solid #888;padding:4px 7px;font-weight:700">Project:</td>
        <td colspan="3" style="border:.7px solid #888;padding:4px 7px">Golf Grove – Residential Building (B+G+P+7+Roof) – Plot 6850752</td>
      </tr>
      <tr>
        <td style="border:.7px solid #888;padding:4px 7px;font-weight:700">Title:</td>
        <td colspan="3" style="border:.7px solid #888;padding:4px 7px;font-weight:700">${m.title}</td>
      </tr>
      <tr>
        <td style="border:.7px solid #888;padding:4px 7px;font-weight:700">Activity:</td>
        <td style="border:.7px solid #888;padding:4px 7px">${m.activity||'—'}</td>
        <td style="border:.7px solid #888;padding:4px 7px;font-weight:700">Discipline:</td>
        <td style="border:.7px solid #888;padding:4px 7px">${m.discipline||'—'}</td>
      </tr>
      <tr>
        <td style="border:.7px solid #888;padding:4px 7px;font-weight:700">Location:</td>
        <td style="border:.7px solid #888;padding:4px 7px">${m.location||'—'}</td>
        <td style="border:.7px solid #888;padding:4px 7px;font-weight:700">Submitted By:</td>
        <td style="border:.7px solid #888;padding:4px 7px">${m.submitted_by||'—'}</td>
      </tr>
      <tr>
        <td style="border:.7px solid #888;padding:4px 7px;font-weight:700">Submitted Date:</td>
        <td style="border:.7px solid #888;padding:4px 7px">${m.submitted_date||'—'}</td>
        <td style="border:.7px solid #888;padding:4px 7px;font-weight:700">Status:</td>
        <td style="border:.7px solid #888;padding:4px 7px">${m.status}</td>
      </tr>
      <tr><td colspan="4" style="border:.7px solid #888;padding:4px 7px;font-weight:700;background:#f5f5f5">Consultant Review Comments:</td></tr>
      <tr><td colspan="4" style="border:.7px solid #888;padding:10px 7px;min-height:60px">${m.review_comments||'Pending review.'}</td></tr>
      <tr>
        <td style="border:.7px solid #888;padding:4px 7px;font-weight:700">Review Outcome:</td>
        <td colspan="3" style="border:.7px solid #888;padding:4px 7px;font-weight:700;color:${m.status==='Approved'?'#1a5e1a':m.status==='Rejected'?'#8B0000':'#555'}">${m.status}</td>
      </tr>
    </table></div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;margin-top:10px">
      <div style="border:.7px solid #888;padding:8px;text-align:center;font-size:10px"><b>Submitted By (Contractor)</b><br><br><br>Signature: ___________<br>Name: ${m.submitted_by||'___________'}<br>Date: ${m.submitted_date||'___________'}</div>
      <div style="border:.7px solid #888;padding:8px;text-align:center;font-size:10px"><b>Reviewed By (Consultant)</b><br><br><br>Signature: ___________<br>Name: ${m.reviewed_by||'___________'}<br>Date: ${m.review_date||'___________'}</div>
      <div style="border:.7px solid #888;padding:8px;text-align:center;font-size:10px"><b>Noted By (Developer)</b><br><br><br>Signature: ___________<br>Name: ___________<br>Date: ___________</div>
    </div>
    <div style="margin-top:8px;font-size:9px;color:#888;display:flex;justify-content:space-between">
      <span>Golf Grove DMS | Regent Developments | ${m.ref_no}</span><span>Page 1 of 1</span>
    </div>
  </div>`;
  const reviewSection = can('approve')&&(m.status==='Pending Review'||m.status==='Under Review')?`<div class="detail-section" style="margin-top:14px">
    <div class="detail-label" style="margin-bottom:10px;color:var(--color-text-warning)">Review — Consultant Action Required</div>
    <div style="display:flex;flex-direction:column;gap:10px;background:var(--bg3);border:.5px solid var(--border2);border-radius:var(--radius);padding:13px">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        ${['Approved','Revise & Resubmit','Rejected'].map(s=>`<div onclick="this.parentElement.querySelectorAll('div').forEach(d=>d.style.fontWeight='400');this.style.fontWeight='600';document.getElementById('ms-outcome-${m.id}').value='${s}'" style="padding:8px 10px;border-radius:6px;border:.5px solid var(--border2);cursor:pointer;font-size:11px;text-align:center;background:var(--bg2)">${s}</div>`).join('')}
      </div>
      <input type="hidden" id="ms-outcome-${m.id}" value="" />
      <div class="frow">
        <div class="form-group"><label class="form-label-dark">Resident Engineer — Name <span style="color:var(--color-text-danger)">*</span></label><input type="text" class="form-control" id="ms-eng-${m.id}" placeholder="Enter engineer full name" /></div>
        <div class="form-group"><label class="form-label-dark">Review Date</label><input type="date" class="form-control" id="ms-date-${m.id}" value="${new Date().toISOString().split('T')[0]}" /></div>
      </div>
      <div class="form-group"><label class="form-label-dark">Review Comments</label><textarea class="form-control" id="ms-comments-${m.id}" placeholder="Enter review comments..." style="min-height:80px"></textarea></div>
    </div>
  </div>`:'';
  openModal(`${m.ref_no} – ${m.title}`, msDoc+reviewSection+attachmentSectionHTML('ms',m.id,atts)+commentThreadHTML('ms',m.id,comments),
    `${can('approve')&&(m.status==='Pending Review'||m.status==='Under Review')?`<button class="btn btn-success" onclick="doReviewMS('${m.id}')">Submit Review</button>`:''}
     <button class="btn" onclick="printDoc('ms-print-${m.id}','MS_${m.ref_no}.pdf')">Download PDF</button>
     <button class="btn" onclick="closeModal()">Close</button>`, true);
}

async function doReviewMS(id) {
  const outcome = document.getElementById('ms-outcome-'+id)?.value;
  const eng = document.getElementById('ms-eng-'+id)?.value?.trim();
  const comments = document.getElementById('ms-comments-'+id)?.value;
  const date = document.getElementById('ms-date-'+id)?.value;
  if(!outcome){toast('Please select a review outcome','error');return;}
  if(!eng){toast("Please enter the Resident Engineer's name",'error');return;}
  await sb.from('method_statements').update({
    status:outcome, reviewed_by:eng,
    review_date:date, review_comments:comments
  }).eq('id',id);
  await sb.from('comments').insert({
    record_type:'ms', record_id:id,
    author_name:eng, author_role:currentProfile?.role||'consultant',
    message:`Review submitted — ${outcome}.${comments?' Comments: '+comments:''}`
  });
  await logAudit(id, 'method_statement', 'MS Reviewed: '+outcome);
  toast(`Method statement ${outcome.toLowerCase()}`,'success');
  closeModal(); render();
}

function openNewMS() {
  openModal('Submit Method Statement', `
    <div class="frow">
      <div class="form-group"><label class="form-label-dark">Reference No.</label><input type="text" class="form-control" id="ms-ref" placeholder="MS-MBC-001 (auto-generated if blank)" /></div>
      <div class="form-group"><label class="form-label-dark">Revision</label><input type="text" class="form-control" id="ms-rev" value="Rev 0" /></div>
    </div>
    <div class="form-group"><label class="form-label-dark">Title <span style="color:var(--red)">*</span></label><input type="text" class="form-control" id="ms-title" placeholder="e.g. Excavation and Backfilling Method Statement" /></div>
    <div class="frow">
      <div class="form-group"><label class="form-label-dark">Activity</label><input type="text" class="form-control" id="ms-activity" placeholder="e.g. Structural works" /></div>
      <div class="form-group"><label class="form-label-dark">Discipline</label>
        <select class="form-control" id="ms-disc">
          <option>Civil</option><option>Structural</option><option>MEP</option>
          <option>Architectural</option><option>Electrical</option><option>Mechanical</option>
        </select>
      </div>
    </div>
    <div class="frow">
      <div class="form-group"><label class="form-label-dark">Location</label><input type="text" class="form-control" id="ms-loc" placeholder="e.g. Level 3 – Columns" /></div>
      <div class="form-group"><label class="form-label-dark">Submitted Date</label><input type="date" class="form-control" id="ms-submitdate" value="${new Date().toISOString().split('T')[0]}" /></div>
    </div>
    <div class="form-group"><label class="form-label-dark">Submitted By</label><input type="text" class="form-control" id="ms-by" value="${currentProfile?.full_name||''}" /></div>
    <div class="form-group"><label class="form-label-dark">Attachments (optional)</label>
      <div class="upload-zone" style="padding:14px 16px;display:flex;align-items:center;gap:10px;text-align:left" onclick="document.getElementById('ms-files').click()" ondragover="event.preventDefault();this.classList.add('dragging')" ondragleave="this.classList.remove('dragging')" ondrop="event.preventDefault();this.classList.remove('dragging');stageFiles(event.dataTransfer.files,'ms-staged')"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;opacity:.6"><path d="M8 2v8M5 5l3-3 3 3" stroke="var(--text2)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 11v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="var(--text2)" stroke-width="1.3" stroke-linecap="round"/></svg><span style="font-size:12px;color:var(--text2)">Click to attach or drag &amp; drop — PDF, DWG, Images, Word, Excel (max 50MB)</span></div>
      <input type="file" id="ms-files" multiple style="display:none" onchange="stageFiles(this.files,'ms-staged')" />
      <div id="ms-staged" style="display:flex;flex-direction:column;gap:4px;margin-top:6px"></div>
    </div>`,
    `<button class="btn btn-primary" onclick="doNewMS()">Submit Method Statement</button><button class="btn" onclick="closeModal()">Cancel</button>`);
}

async function doNewMS() {
  const title = document.getElementById('ms-title')?.value?.trim();
  if(!title){toast('Please enter a title','error');return;}
  const refNo = 'MS-MBC-'+(Date.now()%10000).toString().padStart(3,'0');
  const {data:newMS,error} = await sb.from('method_statements').insert({project_id:currentProject.id,
    ref_no:document.getElementById('ms-ref')?.value||refNo, title,
    activity:document.getElementById('ms-activity')?.value,
    discipline:document.getElementById('ms-disc')?.value,
    location:document.getElementById('ms-loc')?.value,
    revision:document.getElementById('ms-rev')?.value||'Rev 0',
    submitted_by:document.getElementById('ms-by')?.value||currentProfile?.full_name,
    submitted_date:document.getElementById('ms-submitdate')?.value||new Date().toISOString().split('T')[0],
    status:'Pending Review'
  }).select().single();
  if(error){toast('Error: '+error.message,'error');return;}
  if(newMS?.id) {
    await uploadStagedFiles('ms-staged','ms',newMS.id);
    await logAudit(newMS.id, 'method_statement', 'MS Submitted: '+newMS.title);
  }
  toast('Method statement submitted','success'); closeModal(); render();
}

