// ─── SUBCONTRACTORS ───────────────────────────────────────────────
async function renderSubcontractors() {
  const {data} = await sb.from('subcontractors').select('*').eq('project_id',currentProject.id).order('created_at',{ascending:false});
  const rows = data||[];
  document.getElementById('content').innerHTML = `
  <div class="card"><div class="tw"><table>
    <tr><th>Company Name</th><th>Trade / Scope</th><th>Discipline</th><th>Representative</th><th>Actions</th></tr>
    ${rows.length?rows.map(s=>`<tr>
      <td style="font-weight:500">${s.name}</td>
      <td style="color:var(--text2)">${s.trade||'—'}</td>
      <td><span class="badge badge-info">${s.discipline||'—'}</span></td>
      <td style="color:var(--text2)">${s.rep||'—'}</td>
      <td>${can('manageSubs')?`<button class="btn btn-sm btn-danger" onclick="removeSub('${s.id}')">Remove</button>`:'—'}</td>
    </tr>`).join(''):'<tr><td colspan="5" class="empty-state">No subcontractors registered yet.</td></tr>'}
  </table></div></div>`;
}

// ─── USER MANAGEMENT ──────────────────────────────────────────────
const ROLE_ADMIN_EMAIL = 'mohammed@regent-developments.com';

async function renderUsers() {
  if(!can('manageUsers')){
    const el = document.getElementById('content');
    el.textContent = '';
    const card = document.createElement('div');
    card.className = 'card';
    const msg = document.createElement('div');
    msg.className = 'empty-state';
    msg.textContent = 'Access Restricted — User Management is only available to developers.';
    card.appendChild(msg);
    el.appendChild(card);
    return;
  }
  const isAdmin = currentUser?.email === ROLE_ADMIN_EMAIL;
  const {data} = await sb.from('profiles').select('*').order('created_at',{ascending:false});
  const rows = data||[];
  const pending = rows.filter(u => u.role === 'pending');
  const active  = rows.filter(u => u.role !== 'pending');

  const pendingSection = pending.length ? `
  <div class="card" style="border-left:3px solid #f59e0b;margin-bottom:16px">
    <div style="padding:14px 18px 10px;font-weight:600;font-size:13px;display:flex;align-items:center;gap:8px">
      <span style="background:#f59e0b;color:#fff;border-radius:10px;padding:1px 8px;font-size:11px">${pending.length}</span>
      Pending Approvals
    </div>
    <div class="tw"><table>
      <tr><th>Name</th><th>Email</th><th>Company</th><th>Requested Role</th><th>Registered</th>${isAdmin?'<th>Actions</th>':''}</tr>
      ${pending.map(u=>`<tr>
        <td style="font-weight:500">${esc(u.full_name||'—')}</td>
        <td style="color:var(--text2);font-size:11px">${esc(u.email||'—')}</td>
        <td style="color:var(--text2)">${esc(u.company||'—')}</td>
        <td><span class="role-badge role-${esc(u.requested_role||'contractor')}">${esc(u.requested_role||'—')}</span></td>
        <td style="color:var(--text2);font-size:11px">${new Date(u.created_at).toLocaleDateString('en-GB')}</td>
        ${isAdmin?`<td style="display:flex;gap:6px;padding:6px 0">
          <button class="btn btn-sm btn-primary" onclick="approveUser('${u.id}','${esc(u.requested_role||'contractor')}','${esc(u.full_name||'')}')">Approve</button>
          <button class="btn btn-sm" style="color:#ef4444" onclick="denyUser('${u.id}','${esc(u.full_name||u.email||'')}')">Deny</button>
        </td>`:''}
      </tr>`).join('')}
    </table></div>
  </div>` : '';

  const activeSection = `
  <div class="card"><div class="tw"><table>
    <tr><th>Name</th><th>Email</th><th>Role</th><th>Company</th>${isAdmin?'<th>Actions</th>':''}</tr>
    ${active.length?active.map(u=>`<tr>
      <td style="font-weight:500">${esc(u.full_name||'—')}</td>
      <td style="color:var(--text2);font-size:11px">${esc(u.email||'—')}</td>
      <td><span class="role-badge role-${u.role||'contractor'}">${u.role||'—'}</span></td>
      <td style="color:var(--text2)">${esc(u.company||'—')}</td>
      ${isAdmin?`<td><button class="btn btn-sm" onclick="editUserRole('${u.id}','${u.role}','${esc(u.full_name||'')}')">Change Role</button></td>`:''}
    </tr>`).join(''):'<tr><td colspan="5" class="empty-state">No active users.</td></tr>'}
  </table></div></div>`;

  document.getElementById('content').innerHTML = pendingSection + activeSection;
}

async function approveUser(uid, requestedRole, name) {
  if(currentUser?.email !== ROLE_ADMIN_EMAIL){ toast('Not authorised','error'); return; }
  const {data: projects} = await sb.from('projects').select('id,name').order('name');
  const allProjects = projects || [];
  openModal(`Approve – ${esc(name)}`, `
    <div class="form-group">
      <label class="form-label-dark">Role</label>
      <select class="form-control" id="approve-role">
        ${['developer','sales','admin','consultant','contractor','subcontractor'].map(r=>`<option value="${r}" ${r===requestedRole?'selected':''}>${r}</option>`).join('')}
      </select>
    </div>
    <div class="form-group" style="margin-top:14px">
      <label class="form-label-dark">Assign to Projects</label>
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:6px;max-height:200px;overflow-y:auto">
        ${allProjects.length
          ? allProjects.map(p=>`<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px">
              <input type="checkbox" data-pid="${p.id}" style="cursor:pointer"> ${esc(p.name)}
            </label>`).join('')
          : '<span style="color:var(--text3);font-size:12px">No projects found.</span>'}
      </div>
    </div>`,
    `<button class="btn btn-primary" onclick="doApproveUser('${uid}','${esc(name)}')">Approve &amp; Assign</button>
     <button class="btn" onclick="closeModal()">Cancel</button>`);
}

async function doApproveUser(uid, name) {
  if(currentUser?.email !== ROLE_ADMIN_EMAIL){ toast('Not authorised','error'); return; }
  const role = document.getElementById('approve-role').value;
  const checked = [...document.querySelectorAll('#modal-body input[type=checkbox][data-pid]:checked')];
  const projectIds = checked.map(c => c.dataset.pid);

  const {error} = await sb.from('profiles').update({role}).eq('id', uid);
  if(error){ toast('Role update failed: '+error.message,'error'); return; }

  if(projectIds.length) {
    const {error: e2} = await sb.from('project_users').insert(projectIds.map(pid=>({project_id:pid, user_id:uid})));
    if(e2){ toast('Project assign failed: '+e2.message,'error'); return; }
  }

  await logAudit(uid, 'user', `approved as ${role}`);
  toast(`${esc(name)||'User'} approved as ${role}${projectIds.length?' and assigned to '+projectIds.length+' project(s)':''}`, 'success');
  closeModal(); render();
}

async function denyUser(uid, name) {
  if(currentUser?.email !== ROLE_ADMIN_EMAIL){ toast('Not authorised','error'); return; }
  const ok = await confirmModal(`Deny and remove <strong>${esc(name)}</strong>? Their account will be deleted.`);
  if(!ok) return;
  await logAudit(uid, 'user', `denied and removed`);
  await sb.from('profiles').delete().eq('id', uid);
  toast(`${esc(name)||'User'} removed`,'success');
  closeModal(); render();
}

async function editUserRole(uid, currentRole, name) {
  if(currentUser?.email !== ROLE_ADMIN_EMAIL){ toast('Not authorised','error'); return; }
  openModal(`Change Role – ${esc(name)}`, `
    <div class="form-group">
      <label class="form-label-dark">Role</label>
      <select class="form-control" id="new-role">
        ${['developer','sales','admin','consultant','contractor','subcontractor'].map(r=>`<option value="${r}" ${r===currentRole?'selected':''}>${r}</option>`).join('')}
      </select>
    </div>`,
    `<button class="btn btn-primary" onclick="doChangeRole('${uid}')">Update Role</button>
     <button class="btn" onclick="closeModal()">Cancel</button>`);
}

async function doChangeRole(uid) {
  if(currentUser?.email !== ROLE_ADMIN_EMAIL){ toast('Not authorised','error'); return; }
  const role = document.getElementById('new-role').value;
  const {error} = await sb.from('profiles').update({role}).eq('id',uid);
  if(error){ toast('Error: '+error.message,'error'); return; }
  await logAudit(uid, 'user', `role changed to ${role}`);
  toast('Role updated','success'); closeModal(); render();
}


async function removeSub(id) {
  if(!await confirmModal('Remove this subcontractor?')) return;
  const {error} = await sb.from('subcontractors').delete().eq('id',id);
  if(error){toast('Error: '+error.message,'error');return;}
  toast('Subcontractor removed','info'); render();
}
