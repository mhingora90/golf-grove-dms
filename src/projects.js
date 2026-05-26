
function openNewProject() {
  const body = `<label style="font-size:11px;font-weight:600;color:var(--text2);display:block;margin-bottom:6px">Project name</label><input id="new-proj-name" class="reg-search" placeholder="e.g. Palm Grove Tower" style="width:100%">`;
  const footer = `<button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="doNewProject()">Create</button>`;
  openModal('New Project', body, footer);
  setTimeout(() => document.getElementById('new-proj-name')?.focus(), 50);
}

async function doNewProject() {
  const nameEl = document.getElementById('new-proj-name');
  const name = nameEl?.value.trim();
  if (!name) { toast('Enter a project name', 'warning'); return; }

  const { data: proj, error } = await sb.from('projects')
    .insert({ name, created_by: currentUser.id })
    .select('id, name')
    .single();
  if (error) { toast('Error: ' + error.message, 'error'); return; }

  await sb.from('project_users').insert({ project_id: proj.id, user_id: currentUser.id });
  userProjects.push({ id: proj.id, name: proj.name });
  closeModal();
  toast('Project created', 'success');
  renderProjectGrid();
}

async function openManageUsers(projectId, projectName) {
  const [{ data: allProfiles }, { data: assigned }] = await Promise.all([
    sb.from('profiles').select('id, full_name, role, email').order('full_name'),
    sb.from('project_users').select('user_id').eq('project_id', projectId),
  ]);

  const assignedIds = new Set((assigned || []).map(r => r.user_id));

  let rows = '';
  (allProfiles || []).forEach(p => {
    const checked = assignedIds.has(p.id) ? 'checked' : '';
    const displayName = (p.full_name || p.email || p.id).replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const roleText = (p.role || '').replace(/</g,'&lt;');
    rows += `<label style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:0.5px solid var(--border);cursor:pointer;font-size:13px"><input type="checkbox" data-uid="${p.id}" ${checked} style="accent-color:var(--sand)"><span style="flex:1">${displayName}</span><span style="font-size:10px;color:var(--text3)">${roleText}</span></label>`;
  });

  if (!allProfiles?.length) {
    rows = `<p style="color:var(--text2)">No profiles found.</p>`;
  }

  const body = `<div id="manage-users-list" style="max-height:60vh;overflow-y:auto">${rows}</div>`;
  const footer = `<button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="doManageUsers('${projectId}')">Save</button>`;
  openModal('Users \u2014 ' + projectName, body, footer);
}

async function doManageUsers(projectId) {
  const checkboxes = document.querySelectorAll('#modal-body input[type=checkbox][data-uid]');
  const nowChecked  = new Set([...checkboxes].filter(c => c.checked).map(c => c.dataset.uid));

  const { data: existing } = await sb.from('project_users').select('user_id').eq('project_id', projectId);
  const wasAssigned = new Set((existing || []).map(r => r.user_id));

  const toAdd    = [...nowChecked].filter(id => !wasAssigned.has(id));
  const toRemove = [...wasAssigned].filter(id => !nowChecked.has(id));

  if (toRemove.includes(currentUser.id)) {
    toast('Cannot remove yourself from the project', 'warning');
    return;
  }

  const ops = [];
  if (toAdd.length)    ops.push(sb.from('project_users').insert(toAdd.map(uid => ({ project_id: projectId, user_id: uid }))));
  if (toRemove.length) ops.push(sb.from('project_users').delete().eq('project_id', projectId).in('user_id', toRemove));

  if (ops.length) {
    const results = await Promise.all(ops);
    const err = results.find(r => r.error);
    if (err) { toast('Error: ' + err.error.message, 'error'); return; }
  }

  closeModal();
  toast('Users updated', 'success');
  renderProjectGrid();
}

async function deleteProject(projectId, projectName) {
  if (!confirm(`Delete project "${projectName}"?\n\nAll data in this project (drawings, RFIs, NCRs, etc.) will be permanently deleted.`)) return;
  const { error } = await sb.from('projects').delete().eq('id', projectId);
  if (error) { toast('Delete failed: ' + error.message, 'error'); return; }
  userProjects = userProjects.filter(p => p.id !== projectId);
  toast(`Project "${projectName}" deleted`, 'success');
  renderProjectGrid();
}

function setCurrentProject(project) {
  currentProject = project;
  localStorage.setItem('lastProjectId', project.id);
  document.getElementById('project-screen').style.display = 'none';
  document.getElementById('app-screen').style.display     = 'flex';
  document.getElementById('psw-name').textContent         = project.name;
  document.getElementById('psw-wrap').style.display       = '';
  document.getElementById('tb-proj-div').style.display    = '';
  const sbName = document.getElementById('sb-proj-name');
  if(sbName) sbName.textContent = project.name;

  const hash = location.hash.replace('#', '');
  const validPages = ['dash','draw','sub','sreg','ir','ncr','rfi','trans','corr','punch','ms','subs','users','ipc','boq','finance','usetup','ureg','srev','crm','crm-home'];
  const roleDefault = (currentProfile?.role === 'admin' || currentProfile?.role === 'sales') ? 'crm-home' : 'dash';
  const defaultPage = validPages.includes(hash) ? hash : roleDefault;
  nav(defaultPage, document.getElementById('n-' + defaultPage));
}

function returnToProjects() {
  currentProject = null;
  localStorage.removeItem('lastProjectId');
  closeProjectDropdown();
  renderProjectGrid();
}

function buildProjectDropdown() {
  const dd = document.getElementById('psw-dd');
  dd.textContent = '';

  userProjects.forEach(p => {
    const isActive = p.id === currentProject?.id;
    const item = document.createElement('div');
    item.className = 'psw-item' + (isActive ? ' active' : '');
    item.onclick = () => switchProject({ id: p.id, name: p.name });

    const dot = document.createElement('div');
    dot.className = 'psw-idot ' + (isActive ? 'on' : 'off');

    const label = document.createElement('span');
    label.textContent = p.name;

    item.appendChild(dot);
    item.appendChild(label);

    if (isActive) {
      const check = document.createElement('span');
      check.className = 'psw-check';
      check.textContent = '\u2713';
      item.appendChild(check);
    }
    dd.appendChild(item);
  });

  const divider1 = document.createElement('div');
  divider1.className = 'psw-div';
  dd.appendChild(divider1);

  const allLink = document.createElement('div');
  allLink.className = 'psw-all';
  allLink.textContent = '\u2190 All Projects';
  allLink.onclick = returnToProjects;
  dd.appendChild(allLink);

  if (currentProfile?.role === 'developer') {
    const divider2 = document.createElement('div');
    divider2.className = 'psw-div';
    dd.appendChild(divider2);

    const newLink = document.createElement('div');
    newLink.className = 'psw-new';
    newLink.textContent = '+ New Project';
    newLink.onclick = () => { closeProjectDropdown(); openNewProject(); };
    dd.appendChild(newLink);
  }
}

function toggleProjectDropdown() {
  const dd = document.getElementById('psw-dd');
  if (dd.classList.contains('open')) {
    dd.classList.remove('open');
  } else {
    buildProjectDropdown();
    dd.classList.add('open');
  }
}

function closeProjectDropdown() {
  document.getElementById('psw-dd')?.classList.remove('open');
}

function switchProject(project) {
  currentProject = project;
  window._selectedContractId = null;
  window._selectedIPCContractId = null;
  document.getElementById('psw-name').textContent = project.name;
  const sbName = document.getElementById('sb-proj-name');
  if(sbName) sbName.textContent = project.name;
  closeProjectDropdown();
  render();
}

// ─── PROJECT GRID ─────────────────────────────────────────────────
async function renderProjectGrid() {
  document.getElementById('auth-screen').style.display    = 'none';
  document.getElementById('app-screen').style.display     = 'none';
  document.getElementById('project-screen').style.display = 'flex';
  document.getElementById('psw-wrap').style.display       = 'none';
  document.getElementById('tb-proj-div').style.display    = 'none';

  const isDev = currentProfile?.role === 'developer';
  if (isDev) document.getElementById('proj-new-btn').style.display = '';

  const grid = document.getElementById('proj-grid');
  grid.textContent = '';
  const loadDiv = document.createElement('div');
  loadDiv.className = 'loading';
  loadDiv.textContent = 'Loading projects...';
  grid.appendChild(loadDiv);

  const { data: projects, error } = await sb.from('projects').select('*').order('created_at');
  if (error) {
    grid.textContent = '';
    const errP = document.createElement('p');
    errP.style.cssText = 'color:var(--red);padding:24px';
    errP.textContent = 'Failed to load projects.';
    grid.appendChild(errP);
    return;
  }
  userProjects = projects.map(p => ({ id: p.id, name: p.name }));

  const { data: puRows } = await sb.from('project_users').select('project_id, user_id');
  const countByProject = {};
  (puRows || []).forEach(r => {
    countByProject[r.project_id] = (countByProject[r.project_id] || 0) + 1;
  });

  grid.textContent = '';

  projects.forEach(p => {
    const n = countByProject[p.id] || 0;
    const card = document.createElement('div');
    card.className = 'pc';
    card.onclick = () => setCurrentProject({ id: p.id, name: p.name });

    const top = document.createElement('div');
    top.className = 'pc-top';

    const icon = document.createElement('div');
    icon.className = 'pc-icon';
    icon.textContent = '\u{1F3D7}';

    const name = document.createElement('div');
    name.className = 'pc-name';
    name.textContent = p.name;

    const status = document.createElement('div');
    status.className = 'pc-status';
    status.textContent = 'Active';

    top.appendChild(icon);
    top.appendChild(name);
    top.appendChild(status);

    const bot = document.createElement('div');
    bot.className = 'pc-bot';

    const ustack = document.createElement('div');
    ustack.className = 'pc-ustack';
    const chip = document.createElement('div');
    chip.className = 'pc-uchip';
    chip.textContent = String(n);
    ustack.appendChild(chip);
    bot.appendChild(ustack);

    if (isDev) {
      const mgr = document.createElement('span');
      mgr.className = 'pc-mgr';
      mgr.textContent = 'Manage users';
      mgr.onclick = e => { e.stopPropagation(); openManageUsers(p.id, p.name); };
      bot.appendChild(mgr);

      const del = document.createElement('span');
      del.className = 'pc-del';
      del.textContent = 'Delete';
      del.onclick = e => { e.stopPropagation(); deleteProject(p.id, p.name); };
      bot.appendChild(del);
    }

    card.appendChild(top);
    card.appendChild(bot);
    grid.appendChild(card);
  });

  if (isDev) {
    const newCard = document.createElement('div');
    newCard.className = 'pc-new';
    newCard.onclick = openNewProject;
    const ni = document.createElement('div');
    ni.className = 'pc-new-icon';
    ni.textContent = '+';
    const nl = document.createElement('div');
    nl.className = 'pc-new-label';
    nl.textContent = 'New Project';
    newCard.appendChild(ni);
    newCard.appendChild(nl);
    grid.appendChild(newCard);
  }
}
