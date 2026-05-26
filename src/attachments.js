// ─── ATTACHMENTS ──────────────────────────────────────────────────
async function loadAttachments(recordType, recordId) {
  const {data} = await sb.from('attachments').select('*')
    .eq('record_type', recordType).eq('record_id', recordId)
    .order('created_at', {ascending:true});
  return data||[];
}

function formatFileSize(bytes) {
  if(!bytes) return '—';
  if(bytes < 1024) return bytes+'B';
  if(bytes < 1024*1024) return Math.round(bytes/1024)+'KB';
  return (bytes/(1024*1024)).toFixed(1)+'MB';
}

function fileIcon(type) {
  if(!type) return '📎';
  if(type.includes('pdf')) return '📄';
  if(type.includes('image')) return '🖼';
  if(type.includes('dwg')||type.includes('dxf')||type.includes('autocad')) return '📐';
  if(type.includes('sheet')||type.includes('excel')||type.includes('csv')) return '📊';
  if(type.includes('word')||type.includes('doc')) return '📝';
  if(type.includes('zip')||type.includes('rar')) return '🗜';
  return '📎';
}

function attachmentSectionHTML(recordType, recordId, attachments) {
  const canDel = can('upload')||can('submit');
  return `<div class="detail-section" style="margin-top:14px">
    <div id="att-count-${recordId}" class="detail-label" style="margin-bottom:10px">Attachments (${attachments.length})</div>
    <div id="att-list-${recordId}" style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px">
      ${attachments.length ? attachments.map(a=>`
        <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg3);border-radius:6px;border:0.5px solid var(--border)">
          <span style="font-size:16px">${fileIcon(a.file_type)}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.file_name}</div>
            <div style="font-size:10px;color:var(--text3)">${formatFileSize(a.file_size)} · Uploaded by ${a.uploaded_by_name||'—'} · ${a.created_at?new Date(a.created_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):'—'}</div>
          </div>
          ${a.file_name.toLowerCase().endsWith('.pdf')||a.file_type?.includes('pdf')?`<button class="btn btn-sm" onclick="viewAttachmentPDF('${a.id}','${a.file_path}','${a.file_name.replace(/'/g,'')}')">View</button>`:''}
          <button class="btn btn-sm" onclick="downloadAttachment('${a.file_path}','${a.file_name}')">Download</button>
          ${canDel&&a.uploaded_by_id===currentUser?.id?`<button class="btn btn-sm btn-danger" onclick="deleteAttachment('${a.id}','${a.file_path}','${recordType}','${recordId}')">Remove</button>`:''}
        </div>`).join('') : '<div style="font-size:11px;color:var(--text3);padding:4px">No attachments yet.</div>'}
    </div>
    <div class="upload-zone" style="padding:16px" onclick="document.getElementById('att-upload-${recordId}').click()"
      ondragover="event.preventDefault();this.classList.add('dragging')"
      ondragleave="this.classList.remove('dragging')"
      ondrop="handleAttDrop(event,'${recordType}','${recordId}')">
      <div style="font-size:13px;color:var(--text2)">Click to attach a file or drag & drop</div>
      <div style="font-size:11px;color:var(--text3);margin-top:3px">PDF, DWG, DXF, Images, Word, Excel, ZIP — max 50MB</div>
      <div class="upload-progress" id="att-prog-${recordId}" style="display:none;margin-top:8px"><div class="upload-progress-bar" id="att-progb-${recordId}" style="width:0%"></div></div>
    </div>
    <input type="file" id="att-upload-${recordId}" style="display:none" multiple
      onchange="handleAttUpload(event,'${recordType}','${recordId}')" />
  </div>`;
}

async function handleAttDrop(event, recordType, recordId) {
  event.preventDefault();
  event.currentTarget.classList.remove('dragging');
  const files = Array.from(event.dataTransfer.files);
  await uploadAttachments(files, recordType, recordId);
}

async function handleAttUpload(event, recordType, recordId) {
  const files = Array.from(event.target.files);
  await uploadAttachments(files, recordType, recordId);
}

async function uploadAttachments(files, recordType, recordId) {
  if(!files.length) return;
  const prog = document.getElementById('att-prog-'+recordId);
  const progb = document.getElementById('att-progb-'+recordId);
  if(prog) prog.style.display='';
  let uploaded = 0;
  for(const file of files) {
    if(file.size > 50*1024*1024) { toast(`${file.name} exceeds 50MB limit`,'error'); continue; }
    const path = `${recordType}/${recordId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
    const {error} = await sb.storage.from('attachments').upload(path, file, {upsert:false});
    if(error) { toast(`Upload failed: ${file.name}`,'error'); continue; }
    await sb.from('attachments').insert({
      record_type: recordType,
      record_id: recordId,
      file_name: file.name,
      file_path: path,
      file_size: file.size,
      file_type: file.type,
      uploaded_by_name: currentProfile?.full_name||currentUser?.email,
      uploaded_by_id: currentUser?.id
    });
    uploaded++;
    if(progb) progb.style.width = Math.round((uploaded/files.length)*100)+'%';
  }
  if(prog) setTimeout(()=>prog.style.display='none', 600);
  if(uploaded > 0) toast(`${uploaded} file${uploaded>1?'s':''} attached`,'success');
  // Refresh attachment list in modal
  const atts = await loadAttachments(recordType, recordId);
  refreshAttList(recordType, recordId, atts);
}

function refreshAttList(recordType, recordId, atts) {
  const countEl = document.getElementById('att-count-'+recordId);
  if(countEl) countEl.textContent = `Attachments (${atts.length})`;
  const list = document.getElementById('att-list-'+recordId);
  if(!list) return;
  const canDel = can('upload')||can('submit');
  list.innerHTML = atts.length ? atts.map(a=>`
    <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg3);border-radius:6px;border:0.5px solid var(--border)">
      <span style="font-size:16px">${fileIcon(a.file_type)}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.file_name}</div>
        <div style="font-size:10px;color:var(--text3)">${formatFileSize(a.file_size)} · ${a.uploaded_by_name||'—'} · ${a.created_at?new Date(a.created_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):'—'}</div>
      </div>
      ${(a.file_name?.toLowerCase().endsWith('.pdf')||a.file_type?.includes('pdf'))?`<button class="btn btn-sm" onclick="viewAttachmentPDF('${a.id}','${a.file_path}','${a.file_name}')">View</button>`:''}
      <button class="btn btn-sm" onclick="downloadAttachment('${a.file_path}','${a.file_name}')">Download</button>
      ${canDel&&a.uploaded_by_id===currentUser?.id?`<button class="btn btn-sm btn-danger" onclick="deleteAttachment('${a.id}','${a.file_path}','${recordType}','${recordId}')">Remove</button>`:''}
    </div>`).join('') : '<div style="font-size:11px;color:var(--text3);padding:4px">No attachments yet.</div>';
}

async function downloadAttachment(path, name) {
  const {data, error} = await sb.storage.from('attachments').createSignedUrl(path, 300);
  if(error||!data?.signedUrl) { toast('Could not generate download link','error'); return; }
  const a = document.createElement('a');
  a.href = data.signedUrl; a.download = name; a.target = '_blank';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

async function deleteAttachment(attId, path, recordType, recordId) {
  if(!await confirmModal('Remove this attachment?')) return;
  await sb.storage.from('attachments').remove([path]);
  await sb.from('attachments').delete().eq('id', attId);
  toast('Attachment removed','info');
  const atts = await loadAttachments(recordType, recordId);
  refreshAttList(recordType, recordId, atts);
}

// ─── STAGED FILES HELPER ──────────────────────────────────────────
const stagedFiles = {};

function stageFiles(fileList, stagingId) {
  if(!stagedFiles[stagingId]) stagedFiles[stagingId] = [];
  for(const f of Array.from(fileList)) {
    if(f.size > 50*1024*1024) { toast(`${f.name} exceeds 50MB — file skipped`,'error'); continue; }
    stagedFiles[stagingId].push(f);
  }
  renderStagedFiles(stagingId);
}

function renderStagedFiles(stagingId) {
  const el = document.getElementById(stagingId);
  if(!el) return;
  const files = stagedFiles[stagingId]||[];
  el.innerHTML = files.map((f,i)=>`
    <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg3);border-radius:6px;border:0.5px solid var(--border)">
      <span style="font-size:13px">${fileIcon(f.type)}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:11px;font-weight:500;color:var(--color-text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.name}</div>
        <div style="font-size:10px;color:var(--color-text-tertiary)">${formatFileSize(f.size)}</div>
      </div>
      <button class="btn btn-sm" style="color:var(--color-text-danger);border-color:var(--color-border-danger);padding:2px 7px" onclick="removeStagedFile('${stagingId}',${i})">✕</button>
    </div>`).join('');
}

function removeStagedFile(stagingId, idx) {
  if(stagedFiles[stagingId]) stagedFiles[stagingId].splice(idx,1);
  renderStagedFiles(stagingId);
}

async function uploadStagedFiles(stagingId, recordType, recordId) {
  const files = stagedFiles[stagingId]||[];
  if(!files.length) return;
  await uploadAttachments(files, recordType, recordId);
  delete stagedFiles[stagingId];
}


// ─── DRAWING REVIEW PANEL ─────────────────────────────────────────
function drawingReviewPanelHTML(drawingId) {
  return `<div class="detail-section" style="margin-top:14px">
    <div class="detail-label" style="margin-bottom:10px;color:var(--color-text-warning)">Review & Outcome — Consultant Action Required</div>
    <div style="display:flex;flex-direction:column;gap:10px;background:var(--bg3);border:.5px solid var(--border2);border-radius:var(--radius);padding:13px">
      <div style="font-size:11px;color:var(--text2)">Select outcome for this revision:</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px" id="review-opts-${drawingId}">
        <div onclick="selectReviewCode(this,'1','${drawingId}')" style="display:flex;align-items:flex-start;gap:8px;padding:9px 11px;border-radius:6px;border:.5px solid var(--border2);cursor:pointer;background:var(--bg2);transition:.12s">
          <div id="rc1-${drawingId}" style="width:13px;height:13px;border-radius:50%;border:1.5px solid var(--border2);flex-shrink:0;margin-top:1px"></div>
          <div><div style="font-size:11px;font-weight:500;color:var(--color-text-primary)">(1) Approved</div><div style="font-size:10px;color:var(--text2)">Work may proceed</div></div>
        </div>
        <div onclick="selectReviewCode(this,'2','${drawingId}')" style="display:flex;align-items:flex-start;gap:8px;padding:9px 11px;border-radius:6px;border:.5px solid var(--border2);cursor:pointer;background:var(--bg2);transition:.12s">
          <div id="rc2-${drawingId}" style="width:13px;height:13px;border-radius:50%;border:1.5px solid var(--border2);flex-shrink:0;margin-top:1px"></div>
          <div><div style="font-size:11px;font-weight:500;color:var(--color-text-primary)">(2) Approved with comments</div><div style="font-size:10px;color:var(--text2)">Proceed, incorporate comments</div></div>
        </div>
        <div onclick="selectReviewCode(this,'3','${drawingId}')" style="display:flex;align-items:flex-start;gap:8px;padding:9px 11px;border-radius:6px;border:.5px solid var(--border2);cursor:pointer;background:var(--bg2);transition:.12s">
          <div id="rc3-${drawingId}" style="width:13px;height:13px;border-radius:50%;border:1.5px solid var(--border2);flex-shrink:0;margin-top:1px"></div>
          <div><div style="font-size:11px;font-weight:500;color:var(--color-text-primary)">(3) Revise & resubmit</div><div style="font-size:10px;color:var(--text2)">Work may not proceed</div></div>
        </div>
        <div onclick="selectReviewCode(this,'4','${drawingId}')" style="display:flex;align-items:flex-start;gap:8px;padding:9px 11px;border-radius:6px;border:.5px solid var(--border2);cursor:pointer;background:var(--bg2);transition:.12s">
          <div id="rc4-${drawingId}" style="width:13px;height:13px;border-radius:50%;border:1.5px solid var(--border2);flex-shrink:0;margin-top:1px"></div>
          <div><div style="font-size:11px;font-weight:500;color:var(--color-text-primary)">(4) Review not required</div><div style="font-size:10px;color:var(--text2)">Work may proceed</div></div>
        </div>
      </div>
      <input type="hidden" id="review-code-${drawingId}" value="" />
      <div class="frow">
        <div class="form-group"><label class="form-label-dark">Resident Engineer — Name <span style="color:var(--color-text-danger)">*</span></label>
          <input type="text" class="form-control" id="review-eng-${drawingId}" placeholder="Enter engineer full name" /></div>
        <div class="form-group"><label class="form-label-dark">Review Date</label>
          <input type="date" class="form-control" id="review-date-${drawingId}" value="${new Date().toISOString().split('T')[0]}" /></div>
      </div>
      <div class="form-group"><label class="form-label-dark">Review Comments</label>
        <textarea class="form-control" id="review-comments-${drawingId}" placeholder="Enter formal review comments..." style="min-height:80px"></textarea></div>
      <div class="form-group"><label class="form-label-dark">Upload Marked-Up Drawing (optional)</label>
        <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--bg2);border:.5px solid var(--border2);border-radius:var(--radius);cursor:pointer"
          onclick="document.getElementById('markup-upload-${drawingId}').click()"
          ondragover="event.preventDefault();this.style.borderColor='var(--blue)'"
          ondragleave="this.style.borderColor='var(--border2)'"
          ondrop="event.preventDefault();this.style.borderColor='var(--border2)';handleMarkupDrop(event,'${drawingId}')">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="flex-shrink:0"><path d="M8 2v8M5 5l3-3 3 3" stroke="var(--text2)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 11v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="var(--text2)" stroke-width="1.3" stroke-linecap="round"/></svg>
          <span style="font-size:12px;color:var(--text2)">Upload marked-up PDF — your comments/redlines on the drawing</span>
        </div>
        <input type="file" id="markup-upload-${drawingId}" accept=".pdf,.dwg,.dxf" style="display:none" onchange="stageMarkup(event,'${drawingId}')" />
        <div id="markup-staged-${drawingId}" style="margin-top:6px"></div>
      </div>
    </div>
  </div>`;
}

let markupFiles = {};
function stageMarkup(event, drawingId) {
  const f = event.target.files[0];
  if(!f) return;
  markupFiles[drawingId] = f;
  document.getElementById('markup-staged-'+drawingId).innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg3);border-radius:6px;border:0.5px solid var(--border);margin-top:4px">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="1" width="10" height="13" rx="1" stroke="var(--color-text-info)" stroke-width="1.3"/></svg>
      <div style="flex:1;font-size:11px;color:var(--color-text-primary)">${f.name}</div>
      <div style="font-size:10px;color:var(--color-text-tertiary)">${formatFileSize(f.size)}</div>
      <button class="btn btn-sm" style="color:var(--color-text-danger);font-size:10px;padding:2px 6px" onclick="delete markupFiles['${drawingId}'];document.getElementById('markup-staged-${drawingId}').innerHTML=''">✕</button>
    </div>`;
}
function handleMarkupDrop(event, drawingId) {
  const f = event.dataTransfer.files[0];
  if(f) { markupFiles[drawingId]=f; stageMarkup({target:{files:[f]}},drawingId); }
}

function selectReviewCode(el, code, drawingId) {
  const statusMap = {'1':'Approved','2':'Approved with Comments','3':'Revise & Resubmit','4':'Review Not Required'};
  const colorMap = {'1':'var(--color-text-success)','2':'var(--color-text-warning)','3':'var(--color-text-danger)','4':'var(--color-text-info)'};
  const bgMap = {'1':'var(--color-background-success)','2':'var(--color-background-warning)','3':'var(--color-background-danger)','4':'var(--color-background-info)'};
  const borderMap = {'1':'var(--color-border-success)','2':'var(--color-border-warning)','3':'var(--color-border-danger)','4':'var(--blue)'};
  // Reset all
  document.querySelectorAll(`#review-opts-${drawingId} > div`).forEach(d=>{
    d.style.background='var(--bg2)';
    d.style.borderColor='var(--border2)';
    const dot=d.querySelector('div');
    if(dot){dot.style.background='transparent';dot.style.borderColor='var(--border2)';}
  });
  // Highlight selected
  el.style.background=bgMap[code];
  el.style.borderColor=borderMap[code];
  const dot=el.querySelector('div');
  if(dot){dot.style.background=colorMap[code];dot.style.borderColor=colorMap[code];}
  document.getElementById('review-code-'+drawingId).value=code;
}

async function submitDrawingReview(drawingId) {
  const code = document.getElementById('review-code-'+drawingId)?.value;
  const eng = document.getElementById('review-eng-'+drawingId)?.value?.trim();
  const comments = document.getElementById('review-comments-'+drawingId)?.value;
  const reviewDate = document.getElementById('review-date-'+drawingId)?.value;
  if(!code){toast('Please select a review outcome (1–4)','error');return;}
  if(!eng){toast("Please enter the Resident Engineer's name",'error');return;}
  const statusMap={'1':'Approved','2':'Approved with Comments','3':'Revise & Resubmit','4':'Review Not Required'};
  const newStatus = statusMap[code];
  // Update drawing status
  await sb.from('drawings').update({status:newStatus}).eq('id',drawingId);
  // Update drawing_revisions record with approval info
  const {data:d} = await sb.from('drawings').select('revision').eq('id',drawingId).single();
  await sb.from('drawing_revisions').update({
    approved_by_name:eng,
    approved_by_id:currentUser?.id,
    approval_date:new Date().toISOString(),
    status:newStatus
  }).eq('drawing_id',drawingId).eq('revision',d?.revision||'');
  // Post comment with review outcome
  const outcomeText = `Review submitted — Code (${code}): ${newStatus}.${comments?' Comments: '+comments:''}`;
  await sb.from('comments').insert({
    record_type:'drawing', record_id:drawingId,
    author_name:eng,
    author_role:currentProfile?.role||'consultant',
    message:outcomeText
  });
  // Upload marked-up drawing as attachment if provided
  const markupFile = markupFiles[drawingId];
  if(markupFile) {
    toast('Uploading marked-up drawing...','info');
    const path = `drawing/${drawingId}/markup_${Date.now()}_${markupFile.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
    const {error:upErr} = await sb.storage.from('attachments').upload(path, markupFile, {upsert:false});
    if(!upErr) {
      await sb.from('attachments').insert({
        record_type:'drawing', record_id:drawingId,
        file_name:`[MARKUP] ${markupFile.name}`,
        file_path:path, file_size:markupFile.size,
        file_type:markupFile.type,
        uploaded_by_name:eng,
        uploaded_by_id:currentUser?.id
      });
    }
    delete markupFiles[drawingId];
  }
  // Auto-generate transmittal for Approved / Approved with Comments
  if(code==='1'||code==='2') {
    const {data:drawing} = await sb.from('drawings').select('drawing_no,title,revision').eq('id',drawingId).single();
    if(drawing) {
      const trnRef = 'TRN-AUTO-'+Date.now().toString().slice(-6);
      await sb.from('transmittals').insert({project_id:currentProject.id,
        ref_no: trnRef,
        from_party: 'POE (Consultant)',
        to_party: 'MBC (Main Contractor)',
        transmit_date: new Date().toISOString().split('T')[0],
        purpose: code==='1'?'For Construction':'For Construction (Approved with Comments)',
        method: 'Portal',
        documents: JSON.stringify([{no:drawing.drawing_no,title:drawing.title,rev:drawing.revision,copies:1}]),
        notes: `Auto-generated on drawing approval. Review Code (${code}) by ${eng}.${comments?' Comments: '+comments:''}`
      });
      toast(`Drawing approved — transmittal ${trnRef} auto-generated`,'success');
    }
  } else {
    toast(`Drawing review submitted — Code (${code}): ${newStatus}`,'success');
  }
  closeModal(); render();
}


// ─── PDF.JS VIEWER ENGINE ──────────────────────────────────────────
const pdfState = {};

// Set PDF.js worker
if(typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

async function initPdfViewer(viewerId, url, filename) {
  if(typeof pdfjsLib === 'undefined') {
    const el = document.getElementById('pdf-loading-'+viewerId);
    if(el) el.innerHTML = '<div class="pdf-error">PDF.js not loaded. Try refreshing.</div>';
    return;
  }
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  pdfState[viewerId] = {
    url, filename: filename||'document.pdf',
    page: 1, totalPages: 0,
    scale: 1.0, fitWidth: true,
    doc: null, rendering: false
  };

  try {
    const loadTask = pdfjsLib.getDocument({url, cMapUrl:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',cMapPacked:true});
    const doc = await loadTask.promise;
    pdfState[viewerId].doc = doc;
    pdfState[viewerId].totalPages = doc.numPages;
    await pdfRenderPage(viewerId);
    pdfUpdateToolbar(viewerId);
  } catch(err) {
    const el = document.getElementById('pdf-loading-'+viewerId);
    if(el) el.innerHTML = `<div class="pdf-error">Could not load PDF.<br>${err.message}<br><br><small>Try "Open in Tab" above.</small></div>`;
    console.error('PDF load error:', err);
  }
}

async function pdfRenderPage(viewerId) {
  const state = pdfState[viewerId];
  if(!state||!state.doc||state.rendering) return;
  state.rendering = true;

  const wrap = document.getElementById('pdf-wrap-'+viewerId);
  if(!wrap) { state.rendering=false; return; }

  const page = await state.doc.getPage(state.page);
  const wrapWidth = wrap.clientWidth - 40;

  let scale = state.scale;
  if(state.fitWidth) {
    const unscaledVp = page.getViewport({scale:1});
    scale = wrapWidth / unscaledVp.width;
    state.scale = scale;
    state.fitWidth = false;
  }

  const viewport = page.getViewport({scale});

  // Create or reuse canvas
  let canvas = document.getElementById('pdf-canvas-'+viewerId);
  if(!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'pdf-canvas-'+viewerId;
    // Remove loading state
    const loading = document.getElementById('pdf-loading-'+viewerId);
    if(loading) loading.remove();
    wrap.appendChild(canvas);
  }

  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.style.width = viewport.width + 'px';
  canvas.style.maxWidth = '100%';

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  await page.render({canvasContext:ctx, viewport}).promise;
  state.rendering = false;
  pdfUpdateToolbar(viewerId);
}

function pdfUpdateToolbar(viewerId) {
  const state = pdfState[viewerId];
  if(!state) return;
  const info = document.getElementById('pdf-pageinfo-'+viewerId);
  const zoom = document.getElementById('pdf-zoom-'+viewerId);
  const prev = document.getElementById('pdf-prev-'+viewerId);
  const next = document.getElementById('pdf-next-'+viewerId);
  if(info) info.textContent = `${state.page} / ${state.totalPages}`;
  if(zoom) zoom.textContent = Math.round(state.scale*100)+'%';
  if(prev) prev.disabled = state.page <= 1;
  if(next) next.disabled = state.page >= state.totalPages;
}

async function pdfPrevPage(viewerId) {
  const s = pdfState[viewerId]; if(!s||s.page<=1) return;
  s.page--; await pdfRenderPage(viewerId);
}
async function pdfNextPage(viewerId) {
  const s = pdfState[viewerId]; if(!s||s.page>=s.totalPages) return;
  s.page++; await pdfRenderPage(viewerId);
}
async function pdfZoomIn(viewerId) {
  const s = pdfState[viewerId]; if(!s) return;
  s.scale = Math.min(s.scale*1.25, 4); await pdfRenderPage(viewerId);
}
async function pdfZoomOut(viewerId) {
  const s = pdfState[viewerId]; if(!s) return;
  s.scale = Math.max(s.scale/1.25, 0.25); await pdfRenderPage(viewerId);
}
async function pdfFitWidth(viewerId) {
  const s = pdfState[viewerId]; if(!s||!s.doc) return;
  const wrap = document.getElementById('pdf-wrap-'+viewerId);
  if(!wrap) return;
  const page = await s.doc.getPage(s.page);
  const vp = page.getViewport({scale:1});
  s.scale = (wrap.clientWidth-40)/vp.width;
  await pdfRenderPage(viewerId);
}
async function pdfFitPage(viewerId) {
  const s = pdfState[viewerId]; if(!s||!s.doc) return;
  const wrap = document.getElementById('pdf-wrap-'+viewerId);
  if(!wrap) return;
  const page = await s.doc.getPage(s.page);
  const vp = page.getViewport({scale:1});
  const scaleW = (wrap.clientWidth-40)/vp.width;
  const scaleH = (wrap.clientHeight-40)/vp.height;
  s.scale = Math.min(scaleW, scaleH);
  await pdfRenderPage(viewerId);
}

// Keyboard navigation for PDF viewer
document.addEventListener('keydown', (e) => {
  const viewers = Object.keys(pdfState);
  if(!viewers.length) return;
  const id = viewers[viewers.length-1];
  if(e.key==='ArrowRight'||e.key==='ArrowDown') { e.preventDefault(); pdfNextPage(id); }
  if(e.key==='ArrowLeft'||e.key==='ArrowUp') { e.preventDefault(); pdfPrevPage(id); }
  if(e.key==='+'||e.key==='=') pdfZoomIn(id);
  if(e.key==='-') pdfZoomOut(id);
});

// PDF.js worker is set on init - no modal wrapper needed


// ─── VIEW REVISION PDF ────────────────────────────────────────────
async function viewRevisionPDF(filePath, revision, isSuperseded, currentRev) {
  if(isSuperseded) {
    const proceed = await confirmModal(`⚠️ <strong>Superseded Revision</strong><br><br><strong>${revision}</strong> is not the current revision — the latest is <strong>${currentRev}</strong>.<br><br>This file should not be used on site. View for reference only?`);
    if(!proceed) return;
  }
  const {data, error} = await sb.storage.from('drawings').createSignedUrl(filePath, 3600);
  if(error||!data?.signedUrl) { toast('Could not load PDF — storage error','error'); return; }
  window.open(data.signedUrl, '_blank');
}

// ─── VIEW ATTACHMENT PDF ──────────────────────────────────────────
async function viewAttachmentPDF(attId, filePath, fileName) {
  const {data, error} = await sb.storage.from('attachments').createSignedUrl(filePath, 3600);
  if(error||!data?.signedUrl) { toast('Could not load PDF','error'); return; }
  const viewerId = 'att-'+attId;
  openModal(fileName, `
    <div class="pdf-viewer" id="pdfv-${viewerId}" style="min-height:500px">
      <div class="pdf-toolbar">
        <button onclick="pdfPrevPage('${viewerId}')" id="pdf-prev-${viewerId}">◀ Prev</button>
        <span class="pdf-page-info" id="pdf-pageinfo-${viewerId}">— / —</span>
        <button onclick="pdfNextPage('${viewerId}')" id="pdf-next-${viewerId}">Next ▶</button>
        <span style="width:1px;background:#555;height:16px;margin:0 4px"></span>
        <button onclick="pdfZoomOut('${viewerId}')">− Zoom</button>
        <span class="pdf-zoom-info" id="pdf-zoom-${viewerId}">100%</span>
        <button onclick="pdfZoomIn('${viewerId}')">+ Zoom</button>
        <button onclick="pdfFitWidth('${viewerId}')">Fit Width</button>
        <button onclick="pdfFitPage('${viewerId}')">Fit Page</button>
        <span style="width:1px;background:#555;height:16px;margin:0 4px"></span>
        <button onclick="window.open('${data.signedUrl}','_blank')">Open in Tab</button>
        <span class="pdf-title">${fileName}</span>
      </div>
      <div class="pdf-canvas-wrap" id="pdf-wrap-${viewerId}" style="max-height:70vh">
        <div class="pdf-loading" id="pdf-loading-${viewerId}">
          <div style="width:24px;height:24px;border:2px solid #555;border-top-color:#aaa;border-radius:50%;animation:spin 1s linear infinite"></div>
          <span>Loading PDF…</span>
        </div>
      </div>
    </div>`,
    `<button class="btn" onclick="downloadAttachment('${filePath}','${fileName}')">Download</button>
     <button class="btn" onclick="closeModal()">Close</button>`, true);
  setTimeout(()=>initPdfViewer(viewerId, data.signedUrl, fileName), 200);
}

// ─── PDF EXPORT ───────────────────────────────────────────────────
function printDoc(elementId, filename) {
  const el = document.getElementById(elementId);
  if(!el) { toast('Nothing to export','error'); return; }
  const opt = {
    margin: [10, 10, 10, 10],
    filename: filename||'document.pdf',
    image: { type:'jpeg', quality:0.98 },
    html2canvas: { scale:2, useCORS:true, backgroundColor:'#ffffff' },
    jsPDF: { unit:'mm', format:'a4', orientation:'portrait' }
  };
  toast('Generating PDF...','info');
  html2pdf().set(opt).from(el).save().then(()=>toast('PDF downloaded','success'));
}

