
// ─── NAVIGATION ──────────────────────────────────────────────────
const PAGE_TITLES = {dash:'Dashboard',draw:'Drawing Register',sub:'Submittals (DSUB)',sreg:'Submittal Register',ir:'Inspection Requests',ncr:'Non-Conformance Reports',rfi:'RFI Register',trans:'Transmittal Log',corr:'Correspondence Register',punch:'Punch List / Defects',subs:'Subcontractors',users:'User Management',ms:'Method Statements',ipc:'Payment Certificates',boq:'BOQ Setup',finance:'Finance Overview',usetup:'Unit Setup',ureg:'Unit Register',srev:'Sales Revenue',crm:'CRM — Leads','crm-home':'CRM Home'};

function canCreateOnPage(page) {
  if(page==='draw') return can('upload');
  if(page==='sub') return can('submit');
  if(page==='ir') return can('submit');
  if(page==='ncr') return can('raise');
  if(page==='rfi') return true;
  if(page==='trans') return true;
  if(page==='ms') return can('submitMS');
  if(page==='sreg') return can('manageRegister');
  if(page==='corr') return can('approve');
  if(page==='punch') return can('approve');
  if(page==='subs') return can('manageSubs');
  if(page==='users') return can('manageUsers');
  if(page==='ipc') return can('submit') || currentProfile?.role==='developer';
  if(page==='boq') return can('manageRegister');
  if(page==='usetup') return currentProfile?.role==='developer';
  return false;
}

function toggleMobileNav() {
  document.getElementById('app-screen').classList.toggle('nav-open');
}
function closeMobileNav() {
  document.getElementById('app-screen').classList.remove('nav-open');
}

function nav(page, el, opts) {
  closeMobileNav();
  currentPage = page;
  navFilter = opts?.filter || null;
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  if(el) el.classList.add('active');
  document.getElementById('page-title').textContent = PAGE_TITLES[page]||page;
  const fab = document.getElementById('new-btn');
  if(fab) fab.style.display = canCreateOnPage(page) ? '' : 'none';
  // Persist page in URL hash for refresh recovery
  history.replaceState(null,'','#'+page);
  render();
}

// ─── ROLE PERMISSIONS ─────────────────────────────────────────────
function can(action) {
  const role = currentProfile?.role;
  const perms = {
    developer:    {approve:true, upload:true, raise:true, submit:true, manageUsers:true, manageSubs:true, submitMS:false, manageRegister:true, delete_drawing:true},
    admin:        {approve:false,upload:false,raise:false,submit:false,manageUsers:false,manageSubs:false,submitMS:false,manageRegister:false},
    consultant:   {approve:true, upload:true, raise:true, submit:true, manageUsers:false,manageSubs:false,submitMS:false,manageRegister:true},
    contractor:   {approve:false,upload:true, raise:false,submit:true, manageUsers:false,manageSubs:true, submitMS:true, manageRegister:false},
    subcontractor:{approve:false,upload:false,raise:false,submit:true, manageUsers:false,manageSubs:false,submitMS:true, manageRegister:false},
  };
  return perms[role]?.[action]||false;
}

// ─── RENDER ───────────────────────────────────────────────────────
async function render() {
  const el = document.getElementById('content');
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Loading...</div>';
  if(currentPage==='dash') await renderDash();
  else if(currentPage==='draw') await renderDrawings();
  else if(currentPage==='sub') await renderSubmittals();
  else if(currentPage==='sreg') await renderSubmittalRegister();
  else if(currentPage==='corr') await renderCorrespondence();
  else if(currentPage==='punch') await renderPunchList();
  else if(currentPage==='ir') await renderInspections();
  else if(currentPage==='ncr') await renderNCRs();
  else if(currentPage==='rfi') await renderRFIs();
  else if(currentPage==='trans') await renderTransmittals();
  else if(currentPage==='subs') await renderSubcontractors();
  else if(currentPage==='ms') await renderMS();
  else if(currentPage==='users') await renderUsers();
  else if(currentPage==='ipc') await renderIPC();
  else if(currentPage==='boq') await renderBOQ();
  else if(currentPage==='finance') await renderFinance();
  else if(currentPage==='usetup') await renderUnitSetup();
  else if(currentPage==='ureg') await renderUnitRegister();
  else if(currentPage==='srev') await renderSalesRevenue();
  else if(currentPage==='crm') { resetCRM(); await renderCRM(); }
  else if(currentPage==='crm-home') await renderCRMHome();
  await updateBadges();
}

async function updateBadges() {
  const [{count:cs},{count:ci},{count:cn},{count:cr}] = await Promise.all([
    sb.from('submittals').select('*',{count:'exact',head:true}).eq('project_id',currentProject.id).eq('status','Pending Review'),
    sb.from('inspections').select('*',{count:'exact',head:true}).eq('project_id',currentProject.id).eq('status','Pending'),
    sb.from('ncrs').select('*',{count:'exact',head:true}).eq('project_id',currentProject.id).eq('status','Open'),
    sb.from('rfis').select('*',{count:'exact',head:true}).eq('project_id',currentProject.id).eq('status','Open'),
  ]);
  function setBadge(id, n) {
    const el = document.getElementById(id);
    if(!el) return;
    el.textContent = n||0;
    el.style.display = (n||0) > 0 ? '' : 'none';
  }
  setBadge('nb-sub', cs);
  setBadge('nb-ir', ci);
  setBadge('nb-ncr', cn);
  setBadge('nb-rfi', cr);
}
