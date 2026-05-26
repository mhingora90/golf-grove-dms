// ─── COMMENT THREAD ───────────────────────────────────────────────
async function loadComments(recordType, recordId) {
  const {data} = await sb.from('comments').select('*').eq('record_type',recordType).eq('record_id',recordId).order('created_at',{ascending:true});
  return data||[];
}

function commentThreadHTML(recordType, recordId, comments) {
  const roleColors = {developer:'#a78bfa',consultant:'var(--blue-light)',contractor:'var(--amber-light)',subcontractor:'var(--green-light)'};
  return `<div class="detail-section">
    <div class="detail-label" style="margin-bottom:10px">Comments & Correspondence</div>
    <div id="comment-list-${recordId}" style="display:flex;flex-direction:column;gap:8px;max-height:220px;overflow-y:auto;margin-bottom:10px">
      ${comments.length?comments.map(c=>`
        <div style="background:var(--bg3);border-radius:6px;padding:8px 10px;border-left:3px solid ${roleColors[c.author_role]||'var(--border2)'}">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span style="font-size:11px;font-weight:500;color:${roleColors[c.author_role]||'var(--text2)'}">${c.author_name||'Unknown'} <span style="font-weight:400;color:var(--text3)">(${c.author_role||'user'})</span></span>
            <span style="font-size:10px;color:var(--text3)">${c.created_at?new Date(c.created_at).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'—'}</span>
          </div>
          <div style="font-size:12px;color:var(--text);line-height:1.5">${c.message}</div>
        </div>`).join(''):'<div style="font-size:11px;color:var(--text3);text-align:center;padding:12px">No comments yet.</div>'}
    </div>
    <div style="display:flex;gap:8px">
      <input type="text" class="form-control" id="comment-input-${recordId}" placeholder="Add a comment..." style="flex:1" onkeydown="if(event.key==='Enter')postComment('${recordType}','${recordId}')" />
      <button class="btn btn-primary" onclick="postComment('${recordType}','${recordId}')">Post</button>
    </div>
  </div>`;
}

async function postComment(recordType, recordId) {
  const input = document.getElementById('comment-input-'+recordId);
  const msg = input?.value?.trim();
  if(!msg) return;
  await sb.from('comments').insert({
    record_type:recordType, record_id:recordId,
    author_name:currentProfile?.full_name||currentUser?.email,
    author_role:currentProfile?.role||'user',
    message:msg
  });
  input.value='';
  const comments = await loadComments(recordType, recordId);
  const list = document.getElementById('comment-list-'+recordId);
  if(list) {
    const roleColors = {developer:'#a78bfa',consultant:'var(--blue-light)',contractor:'var(--amber-light)',subcontractor:'var(--green-light)'};
    list.innerHTML = comments.map(c=>`
      <div style="background:var(--bg3);border-radius:6px;padding:8px 10px;border-left:3px solid ${roleColors[c.author_role]||'var(--border2)'}">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span style="font-size:11px;font-weight:500;color:${roleColors[c.author_role]||'var(--text2)'}">${c.author_name||'Unknown'} <span style="font-weight:400;color:var(--text3)">(${c.author_role||'user'})</span></span>
          <span style="font-size:10px;color:var(--text3)">${c.created_at?new Date(c.created_at).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'—'}</span>
        </div>
        <div style="font-size:12px;color:var(--text);line-height:1.5">${c.message}</div>
      </div>`).join('');
    list.scrollTop = list.scrollHeight;
  }
}
