
// ─── NAVIGATION ──────────────────────────────────────────────────
const PAGE_TITLES = {dash:'Dashboard',draw:'Drawing Register',sub:'Submittals (DSUB)',sreg:'Submittal Register',ir:'Inspection Requests',ncr:'Non-Conformance Reports',rfi:'RFI Register',trans:'Transmittal Log',corr:'Correspondence Register',punch:'Punch List / Defects',subs:'Subcontractors',users:'User Management',ms:'Method Statements',ipc:'Payment Certificates',boq:'BOQ Setup',finance:'Finance Overview',reports:'Reports','reports-finance':'Finance Report','reports-quality':'Quality & Site Report','reports-sales':'Sales & CRM Report','reports-docs':'Document Control Report',usetup:'Unit Setup',ureg:'Unit Register',srev:'Sales Revenue',crm:'CRM — Leads','crm-home':'CRM Home','crm-notifications':'CRM Notifications'};

// pages that share a sidebar nav-item with another page
const NAV_ITEM_FOR = {'reports-finance':'reports','reports-quality':'reports','reports-sales':'reports','reports-docs':'reports'};
function navItemId(page) { return NAV_ITEM_FOR[page] || page; }
function basePageFromHash() {
  const h = location.hash.replace('#','');
  return h.split('/')[0];
}

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
  // Persist page in URL hash for refresh recovery — preserve sub-route when
  // navigating to the same base page (e.g. reports → reports-finance/2026-05)
  const currentBase = basePageFromHash();
  if (currentBase !== page) history.replaceState(null,'','#'+page);
  render(true);
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

// ─── RENDER CACHE (show cached HTML instantly, refresh in background) ───
const _pageCache = {};
const _PAGE_CACHE_TTL = 60_000;

function _cacheKey() { return currentPage + '_' + (currentProject?.id || ''); }

async function _execRender(page) {
  if(page==='dash') await renderDash();
  else if(page==='draw') await renderDrawings();
  else if(page==='sub') await renderSubmittals();
  else if(page==='sreg') await renderSubmittalRegister();
  else if(page==='corr') await renderCorrespondence();
  else if(page==='punch') await renderPunchList();
  else if(page==='ir') await renderInspections();
  else if(page==='ncr') await renderNCRs();
  else if(page==='rfi') await renderRFIs();
  else if(page==='trans') await renderTransmittals();
  else if(page==='subs') await renderSubcontractors();
  else if(page==='ms') await renderMS();
  else if(page==='users') await renderUsers();
  else if(page==='ipc') await renderIPC();
  else if(page==='boq') await renderBOQ();
  else if(page==='finance') await renderFinance();
  else if(page==='usetup') await renderUnitSetup();
  else if(page==='ureg') await renderUnitRegister();
  else if(page==='srev') await renderSalesRevenue();
  else if(page==='crm') { resetCRM(); await renderCRM(); }
  else if(page==='crm-home') await renderCRMHome();
  else if(page==='crm-notifications') await renderCrmNotifications();
  else if(page==='reports') await renderReports();
  else if(page==='reports-finance') {
    const parts = location.hash.replace('#','').split('/');
    const now = new Date();
    let year = now.getFullYear(), month = now.getMonth() + 1;
    if (parts[1]) {
      const [y,m] = parts[1].split('-').map(Number);
      if (y && m >= 1 && m <= 12) { year = y; month = m; }
    }
    await renderFinanceReport(year, month);
  }
  else if(page==='reports-quality') {
    const parts = location.hash.replace('#','').split('/');
    const now = new Date();
    let year = now.getFullYear(), month = now.getMonth() + 1;
    if (parts[1]) {
      const [y,m] = parts[1].split('-').map(Number);
      if (y && m >= 1 && m <= 12) { year = y; month = m; }
    }
    await renderQualityReport(year, month);
  }
  else if(page==='reports-sales') {
    const parts = location.hash.replace('#','').split('/');
    const now = new Date();
    let year = now.getFullYear(), month = now.getMonth() + 1;
    if (parts[1]) {
      const [y,m] = parts[1].split('-').map(Number);
      if (y && m >= 1 && m <= 12) { year = y; month = m; }
    }
    await renderSalesReport(year, month);
  }
  else if(page==='reports-docs') {
    const parts = location.hash.replace('#','').split('/');
    const now = new Date();
    let year = now.getFullYear(), month = now.getMonth() + 1;
    if (parts[1]) {
      const [y,m] = parts[1].split('-').map(Number);
      if (y && m >= 1 && m <= 12) { year = y; month = m; }
    }
    await renderDocsReport(year, month);
  }
}

// ─── RENDER ───────────────────────────────────────────────────────
// fromNav=true  → use cache (nav click); fromNav=false → bust cache (post-mutation)
async function render(fromNav = false) {
  const el = document.getElementById('content');
  const key = _cacheKey();
  if (!fromNav) delete _pageCache[key];
  const cached = _pageCache[key];
  const now = Date.now();

  if (cached && (now - cached.ts) < _PAGE_CACHE_TTL) {
    // Show cached content instantly, refresh silently in background
    el.innerHTML = cached.html;
    const page = currentPage;
    _execRender(page).then(() => {
      if (currentPage === page) _pageCache[_cacheKey()] = { html: el.innerHTML, ts: Date.now() };
    }).catch(() => {});
  } else {
    el.innerHTML = '<div class="loading"><div class="spinner"></div>Loading...</div>';
    const page = currentPage;
    await _execRender(page);
    if (currentPage === page) _pageCache[key] = { html: el.innerHTML, ts: Date.now() };
  }
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
