// ─── CRM ──────────────────────────────────────────────────────────
const CRM_STAGES = [
  {key:'new_lead',             label:'New Lead',          color:'var(--amber)'},
  {key:'contacted_responded',  label:'Contacted',         color:'var(--blue)'},
  {key:'contacted_no_response',label:'No Response',       color:'var(--text3)'},
  {key:'site_visit',           label:'Site Visit',        color:'var(--green)'},
  {key:'follow_up',            label:'Follow-Up',         color:'var(--sand)'},
  {key:'closed_won',           label:'Closed Won',        color:'var(--green)'},
  {key:'closed_lost',          label:'Closed Lost',       color:'var(--red)'},
];

let crmSearch = "", crmStage = "", crmSource = "", crmAssigned = "";
let crmDateFrom = "", crmDateTo = "";
let crmSortCol = "created_at", crmSortAsc = false;
let crmPage = 0;
let crmSelected = new Set();
const CRM_PER_PAGE = 25;
let _crmProjectMembers = [];
let crmSearchTimer = null;

// ─── CRM HOME DASHBOARD ───────────────────────────────────────────
async function renderCRMHome() {
  initCrmNotifications();
  const pid = currentProject.id;
  const now = new Date();
  const todayStr = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
  const localDateStr = (dt) => { const d=new Date(dt); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Monday of current week
  const dow = now.getDay(); // 0=Sun
  const diffToMon = (dow === 0) ? -6 : 1 - dow;
  const weekStart = new Date(now); weekStart.setDate(now.getDate() + diffToMon); weekStart.setHours(0,0,0,0);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 4); weekEnd.setHours(23,59,59,999);

  const [
    { data: openTasks },
    { data: allLeads },
    { data: recentActs },
  ] = await Promise.all([
    sb.from('crm_lead_activities')
      .select('id,lead_id,method,body,due_at,completed,contacted_at,assigned_to,assigned_to_name,crm_leads!inner(id,name,stage,project_id)')
      .eq('crm_leads.project_id', pid)
      .eq('method', 'task')
      .eq('completed', false)
      .not('due_at', 'is', null)
      .or(`assigned_to.eq.${currentUser.id},and(assigned_to.is.null,author_id.eq.${currentUser.id})`)
      .order('due_at', { ascending: true }),
    sb.from('crm_leads')
      .select('id,name,stage,last_contacted_at,created_at,assigned_to')
      .eq('project_id', pid)
      .not('stage', 'in', '(closed_won,closed_lost)'),
    sb.from('crm_lead_activities')
      .select('id,lead_id,method,body,contacted_at,author_name,crm_leads!inner(id,name,project_id)')
      .eq('crm_leads.project_id', pid)
      .order('contacted_at', { ascending: false })
      .limit(10),
  ]);

  const tasks = openTasks || [];
  const leads = allLeads || [];
  const acts = recentActs || [];

  // Partition tasks
  const overdue = tasks.filter(t => t.due_at < now.toISOString());
  const dueToday = tasks.filter(t => localDateStr(t.due_at) === todayStr);
  // This week (Mon–Fri)
  const weekTasks = tasks.filter(t => t.due_at >= weekStart.toISOString() && t.due_at <= weekEnd.toISOString());

  // Won this month (need closed_won leads — query separately)
  const { count: wonCount } = await sb.from('crm_leads').select('*',{count:'exact',head:true})
    .eq('project_id', pid).eq('stage','closed_won').gte('updated_at', monthStart);

  // Leads with no open task: leads whose id doesn't appear in openTasks
  const leadsWithTask = new Set(tasks.map(t => t.lead_id));
  const noTaskLeads = leads.filter(l => !leadsWithTask.has(l.id));

  // Going cold: last_contacted_at > 7 days ago (or null + created > 7d)
  const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(now.getDate() - 7);
  const goingCold = leads.filter(l => {
    const ref = l.last_contacted_at || l.created_at;
    return ref && new Date(ref) < sevenDaysAgo;
  }).sort((a,b) => {
    const ra = a.last_contacted_at || a.created_at;
    const rb = b.last_contacted_at || b.created_at;
    return new Date(ra) - new Date(rb);
  });

  // My assigned leads
  const myName = currentProfile?.full_name;
  const myLeads = myName ? leads.filter(l => l.assigned_to === myName) : [];

  // Pipeline counts from all-stages (including closed)
  const { data: allStageRows } = await sb.from('crm_leads').select('stage').eq('project_id', pid);
  const stageMap = {};
  (allStageRows||[]).forEach(r => { stageMap[r.stage] = (stageMap[r.stage]||0)+1; });
  const maxStageCount = Math.max(1, ...Object.values(stageMap));

  // ── Helpers ──
  const dayName = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB',{weekday:'short'});
  };
  const timeAgo = (iso) => {
    if (!iso) return '';
    const diff = Math.floor((now - new Date(iso)) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff/60)+'m ago';
    if (diff < 86400) return Math.floor(diff/3600)+'h ago';
    return Math.floor(diff/86400)+'d ago';
  };
  const daysSince = (iso) => {
    if (!iso) return '?';
    return Math.floor((now - new Date(iso)) / 86400000);
  };
  const stageBadge = (stage) => {
    const s = CRM_STAGES.find(x=>x.key===stage);
    return s ? `<span class="stage-badge" style="background:${s.color}22;color:${s.color};border:0.5px solid ${s.color}55;font-size:10px;padding:1px 7px;border-radius:4px;white-space:nowrap">${esc(s.label)}</span>` : '';
  };
  const methodIcon = (m) => {
    const icons = {call:'📞',whatsapp:'💬',email:'📧',meeting:'🤝',site_visit:'📍',note:'📝',task:'✅'};
    return icons[m]||'📋';
  };
  const openLeadBtn = (leadId) =>
    `<button class="ch-open-btn" onclick="nav('crm',document.getElementById('n-crm'));setTimeout(()=>viewLead('${esc(leadId)}'),400)">Open</button>`;

  // ── Week day columns ──
  const weekDays = [];
  for(let i=0;i<5;i++){
    const d = new Date(weekStart); d.setDate(weekStart.getDate()+i);
    const ds = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    const isToday = ds === todayStr;
    const ct = weekTasks.filter(t=>localDateStr(t.due_at)===ds).length;
    const isPast = d < now && !isToday;
    weekDays.push(`
      <div class="ch-day${isToday?' today':''}">
        <div class="ch-day-lbl">${d.toLocaleDateString('en-GB',{weekday:'short'})}</div>
        <div class="ch-day-ct${ct>0?(isPast?' overdue-day':' has-tasks'):''}">${ct}</div>
        <div style="font-size:9px;color:var(--text3)">${d.getDate()}/${d.getMonth()+1}</div>
      </div>`);
  }

  // ── Overdue rows ──
  const overdueRows = overdue.slice(0,8).map(t => {
    const lead = t.crm_leads;
    const name = lead?.name || 'Unknown';
    const stage = lead?.stage || '';
    const daysOver = Math.floor((now - new Date(t.due_at)) / 86400000);
    return `<tr class="overdue-row">
      <td style="font-weight:500;color:var(--charcoal)">${esc(name)}</td>
      <td style="color:var(--text2)">${esc(t.body||'Task')}</td>
      <td>${stageBadge(stage)}</td>
      <td><span class="ch-overdue-age">${daysOver}d overdue</span></td>
      <td>${openLeadBtn(t.lead_id)}</td>
    </tr>`;
  }).join('');

  // ── Due today rows ──
  const todayRows = dueToday.slice(0,8).map(t => {
    const lead = t.crm_leads;
    const name = lead?.name || 'Unknown';
    const time = t.due_at ? new Date(t.due_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : '';
    return `<div class="ch-task-row">
      <div class="ch-task-icon">${methodIcon('task')}</div>
      <div class="ch-task-body">
        <div class="ch-task-lead">${esc(name)}</div>
        <div class="ch-task-desc">${esc(t.body||'Task')}${time?' · '+time:''}</div>
      </div>
      ${openLeadBtn(t.lead_id)}
    </div>`;
  }).join('');

  // ── Going cold rows ──
  const coldRows = goingCold.slice(0,6).map(l => {
    const ref = l.last_contacted_at || l.created_at;
    const days = daysSince(ref);
    return `<div class="ch-cold-row">
      <div style="flex:1;font-weight:500;color:var(--charcoal)">${esc(l.name||'Unknown')}</div>
      ${stageBadge(l.stage)}
      <span class="ch-cold-days">${days}d no contact</span>
      ${openLeadBtn(l.id)}
    </div>`;
  }).join('');

  // ── Pipeline rows ──
  const pipeRows = CRM_STAGES.map(s => {
    const ct = stageMap[s.key]||0;
    const pct = Math.round((ct/maxStageCount)*100);
    return `<div class="ch-pipe-row">
      <div class="ch-pipe-label" title="${esc(s.label)}">${esc(s.label)}</div>
      <div class="ch-pipe-bar-wrap"><div class="ch-pipe-bar-fill" style="width:${pct}%;background:${s.color}"></div></div>
      <div class="ch-pipe-ct">${ct}</div>
    </div>`;
  }).join('');

  // ── My assigned leads rows ──
  const myLeadRows = myLeads.slice(0,10).map(l => {
    const hasTask = leadsWithTask.has(l.id);
    return `<div class="ch-notask-row">
      <div style="flex:1;font-weight:500;color:var(--charcoal)">${esc(l.name||'Unknown')}</div>
      ${stageBadge(l.stage)}
      ${hasTask?'':'<span style="font-size:10px;color:var(--amber);font-weight:500">no task</span>'}
      ${openLeadBtn(l.id)}
    </div>`;
  }).join('');
  const myLeadsMore = myLeads.length > 10
    ? `<div class="ch-more-link" onclick="nav('crm',document.getElementById('n-crm'))">+${myLeads.length-10} more →</div>` : '';

  // ── No task set rows ──
  const noTaskRows = noTaskLeads.slice(0,8).map(l =>
    `<div class="ch-notask-row">
      <div style="flex:1;font-weight:500;color:var(--charcoal)">${esc(l.name||'Unknown')}</div>
      ${stageBadge(l.stage)}
      ${openLeadBtn(l.id)}
    </div>`
  ).join('');
  const noTaskMore = noTaskLeads.length > 8
    ? `<div class="ch-more-link" onclick="nav('crm',document.getElementById('n-crm'))">+${noTaskLeads.length-8} more — View Leads →</div>` : '';

  // ── Recent activity rows ──
  const actRows = acts.slice(0,8).map(a => {
    const lead = a.crm_leads;
    return `<div class="ch-activity-row">
      <div class="ch-act-icon">${methodIcon(a.method)}</div>
      <div class="ch-act-body">
        <div class="ch-act-lead">${esc(lead?.name||'Unknown')}</div>
        <div class="ch-act-desc">${esc(a.body||a.method||'')}</div>
      </div>
      <div class="ch-act-time">${timeAgo(a.contacted_at)}</div>
    </div>`;
  }).join('');

  document.getElementById('content').innerHTML = `
  <div class="crm-home">
    <!-- KPI ROW -->
    <div class="crm-home-kpi">
      <div class="kpi-tile kpi-warn">
        <div class="kpi-val warn">${overdue.length}</div>
        <div class="kpi-lbl">Overdue Tasks</div>
      </div>
      <div class="kpi-tile">
        <div class="kpi-val">${dueToday.length}</div>
        <div class="kpi-lbl">Due Today</div>
      </div>
      <div class="kpi-tile">
        <div class="kpi-val blue">${leads.length}</div>
        <div class="kpi-lbl">Active Leads</div>
      </div>
      <div class="kpi-tile kpi-green">
        <div class="kpi-val green">${wonCount||0}</div>
        <div class="kpi-lbl">Won This Month</div>
      </div>
      <div class="kpi-tile">
        <div class="kpi-val">${noTaskLeads.length}</div>
        <div class="kpi-lbl">No Task Set</div>
      </div>
    </div>

    <!-- BODY -->
    <div class="crm-home-body">

      <!-- LEFT -->
      <div class="crm-home-left">

        <!-- NEEDS YOUR ATTENTION SLOT -->
        <div id="ch-attn-slot"></div>

        <!-- OVERDUE -->
        <div class="ch-card">
          <div class="ch-card-head warn-head">
            <span class="ch-card-title warn">⚠ Overdue Tasks</span>
            ${overdue.length>0?`<span class="ch-badge">${overdue.length}</span>`:''}
          </div>
          ${overdue.length===0
            ? '<div class="ch-empty">No overdue tasks</div>'
            : `<div class="tw"><table class="ch-table"><tbody>${overdueRows}</tbody></table></div>
               ${overdue.length>8?`<div class="ch-more-link">+${overdue.length-8} more</div>`:''}`
          }
        </div>

        <!-- DUE TODAY -->
        <div class="ch-card">
          <div class="ch-card-head">
            <span class="ch-card-title">Due Today</span>
            ${dueToday.length>0?`<span class="ch-badge" style="background:var(--bg3);color:var(--text2)">${dueToday.length}</span>`:''}
          </div>
          ${dueToday.length===0
            ? '<div class="ch-empty">Nothing due today</div>'
            : todayRows
          }
        </div>

        <!-- THIS WEEK -->
        <div class="ch-card">
          <div class="ch-card-head">
            <span class="ch-card-title">This Week</span>
          </div>
          <div class="ch-week-bar">${weekDays.join('')}</div>
        </div>

        <!-- GOING COLD -->
        <div class="ch-card">
          <div class="ch-card-head">
            <span class="ch-card-title">Going Cold</span>
            <span style="font-size:10px;color:var(--text3)">No contact in 7+ days</span>
          </div>
          ${goingCold.length===0
            ? '<div class="ch-empty">All leads contacted recently</div>'
            : coldRows + (goingCold.length>6?`<div class="ch-more-link">+${goingCold.length-6} more</div>`:'')
          }
        </div>

      </div>

      <!-- RIGHT SIDEBAR -->
      <div class="crm-home-right">

        <!-- MY LEADS -->
        <div class="ch-card">
          <div class="ch-card-head">
            <span class="ch-card-title">My Leads</span>
            ${myLeads.length>0?`<span class="ch-badge" style="background:var(--blue);color:#fff">${myLeads.length}</span>`:''}
          </div>
          ${myLeads.length===0
            ? `<div class="ch-empty">No leads assigned to ${esc(myName||'you')}</div>`
            : myLeadRows + myLeadsMore
          }
        </div>

        <!-- PIPELINE -->
        <div class="ch-card">
          <div class="ch-card-head">
            <span class="ch-card-title">Pipeline</span>
            <button class="ch-add-task-btn" onclick="nav('crm',document.getElementById('n-crm'))">View All →</button>
          </div>
          ${pipeRows}
        </div>

        <!-- NO TASK SET -->
        <div class="ch-card">
          <div class="ch-card-head">
            <span class="ch-card-title">No Task Set</span>
            ${noTaskLeads.length>0?`<span class="ch-badge" style="background:var(--bg3);color:var(--text2)">${noTaskLeads.length}</span>`:''}
          </div>
          ${noTaskLeads.length===0
            ? '<div class="ch-empty">All active leads have tasks</div>'
            : noTaskRows + noTaskMore
          }
        </div>

        <!-- RECENT ACTIVITY -->
        <div class="ch-card">
          <div class="ch-card-head">
            <span class="ch-card-title">Recent Activity</span>
          </div>
          ${acts.length===0
            ? '<div class="ch-empty">No recent activity</div>'
            : actRows
          }
        </div>

      </div>
    </div>
  </div>`;

  _crmNotifRefreshHomeWidget();
}

async function renderCRM() {
  initCrmNotifications();
  let q = sb.from("crm_leads").select("*", { count: "exact" });
  q = q.eq("project_id", currentProject.id);
  if (crmSearch) { const s = crmSearch.replace(/,/g, ""); q = q.or(`name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`); }
  if (crmStage)    q = q.eq("stage", crmStage);
  if (crmSource)   q = q.eq("source", crmSource);
  if (crmAssigned) q = q.eq("assigned_to", crmAssigned);
  if (crmDateFrom) q = q.gte("created_at", crmDateFrom);
  if (crmDateTo)   q = q.lte("created_at", crmDateTo + "T23:59:59");
  q = q.order(crmSortCol, { ascending: crmSortAsc });
  q = q.range(crmPage * CRM_PER_PAGE, crmPage * CRM_PER_PAGE + CRM_PER_PAGE - 1);
  const { data: leads, count, error } = await q;
  if (error) {
    document.getElementById("content").innerHTML = `<div class="empty-state">Error: ${esc(error.message)}</div>`;
    return;
  }

  // Nav badge: total unfiltered count
  const { count: total } = await sb.from("crm_leads").select("*", { count: "exact", head: true }).eq("project_id", currentProject.id);
  const nb = document.getElementById("nb-crm");
  if (nb) nb.textContent = total || 0;

  // Stage pill counts: all leads (no filters)
  const { data: stageRows } = await sb.from("crm_leads").select("stage").eq("project_id", currentProject.id);
  const stageMap = {};
  (stageRows || []).forEach(r => { stageMap[r.stage] = (stageMap[r.stage] || 0) + 1; });
  const totalAll = (stageRows || []).length;

  const totalPages = Math.ceil((count || 0) / CRM_PER_PAGE);
  document.getElementById("content").innerHTML = crmHTML(leads || [], count || 0, stageMap, totalAll, totalPages);

  // Refocus search after re-render if it was active
  if (crmSearch) {
    const s = document.getElementById("crm-search");
    if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
  }

  // Populate assigned dropdown with live distinct values
  const { data: assigneeRows } = await sb.from("crm_leads").select("assigned_to").eq("project_id", currentProject.id).not("assigned_to", "is", null);
  const unique = [...new Set((assigneeRows || []).map(r => r.assigned_to).filter(Boolean))].sort();
  const sel = document.getElementById("crm-assigned-sel");
  if (sel) {
    sel.innerHTML = `<option value="">Assigned: All</option>` +
      unique.map(a => `<option value="${esc(a)}"${crmAssigned === a ? " selected" : ""}>${esc(a)}</option>`).join("");
  }
}

function crmHTML(leads, count, stageMap, totalAll, totalPages) {
  const from = crmPage * CRM_PER_PAGE + 1;
  const to = Math.min((crmPage + 1) * CRM_PER_PAGE, count);
  const allOnPage = leads.length > 0 && leads.every(l => crmSelected.has(l.id));

  const toolbar = `
    <div class="crm-toolbar">
      <input id="crm-search" class="reg-search" placeholder="Search name, email, phone\u2026"
        value="${esc(crmSearch)}" oninput="crmOnSearch(this.value)" style="min-width:200px">
      <span class="crm-toolbar-sep"></span>
      <select class="filter-sel" id="crm-stage-sel" onchange="crmSetFilter('stage',this.value)">
        <option value="">Stage: All</option>
        ${CRM_STAGES.map(s => `<option value="${esc(s.key)}"${crmStage === s.key ? " selected" : ""}>${esc(s.label)}</option>`).join("")}
      </select>
      <select class="filter-sel" id="crm-source-sel" onchange="crmSetFilter('source',this.value)">
        <option value="">Source: All</option>
        ${{"meta_ads":"Meta Ads","website":"Website","referral":"Referral","walk_in":"Walk-In","other":"Other"} && Object.entries({"meta_ads":"Meta Ads","website":"Website","referral":"Referral","walk_in":"Walk-In","other":"Other"}).map(([v,l]) =>
          `<option value="${v}"${crmSource === v ? " selected" : ""}>${l}</option>`).join("")}
      </select>
      <select class="filter-sel" id="crm-assigned-sel" onchange="crmSetFilter('assigned',this.value)">
        <option value="">Assigned: All</option>
      </select>
      <span class="crm-toolbar-sep"></span>
      <label style="font-size:10px;color:var(--text3);font-weight:600;white-space:nowrap;display:flex;align-items:center;gap:4px">From <input type="date" class="crm-date-input" id="crm-date-from" value="${esc(crmDateFrom)}"
        onchange="crmSetFilter('dateFrom',this.value)" oninput="crmSetFilter('dateFrom',this.value)" style="min-width:120px" aria-label="Created from date"></label>
      <label style="font-size:10px;color:var(--text3);font-weight:600;white-space:nowrap;display:flex;align-items:center;gap:4px">To <input type="date" class="crm-date-input" id="crm-date-to" value="${esc(crmDateTo)}"
        onchange="crmSetFilter('dateTo',this.value)" oninput="crmSetFilter('dateTo',this.value)" style="min-width:120px" aria-label="Created to date"></label>
      ${(crmDateFrom || crmDateTo) ? '<button class="btn" onclick="crmClearDates()" style="padding:3px 8px;font-size:11px;line-height:1" title="Clear date filter">\u00d7 Dates</button>' : ''}
      <button class="btn" onclick="crmExportExcel()" title="Export visible leads + activity log to Excel" style="margin-left:auto">↓ Export Excel</button>
      <button class="btn" id="crm-sync-btn" onclick="crmSyncMetaLeads()" title="Pull new Meta leads from Google Sheet into CRM">\u21bb Sync</button>
      <button class="btn btn-primary" onclick="openAddLead()">+ Add Lead</button>
    </div>`;

  const pills = `
    <div class="crm-stage-pills">
      <button class="crm-pill${!crmStage ? " active" : ""}" onclick="crmSetFilter('stage','')">
        All <span class="pill-ct">${totalAll}</span>
      </button>
      ${CRM_STAGES.map(s => `
        <button class="crm-pill${crmStage === s.key ? " active" : ""}" data-stage="${esc(s.key)}" onclick="crmSetFilter('stage','${esc(s.key)}')">
          ${esc(s.label)} <span class="pill-ct">${stageMap[s.key] || 0}</span>
        </button>`).join("")}
    </div>`;

  const bulkBar = `
    <div id="crm-bulk-bar" class="crm-bulk-bar" style="${crmSelected.size > 0 ? '' : 'display:none'}">
      <span id="crm-bulk-count" class="bulk-count">${crmSelected.size} lead${crmSelected.size > 1 ? "s" : ""} selected</span>
      <button class="btn" onclick="crmBulkMoveStage()">Move stage\u2026</button>
      <button class="btn" onclick="crmBulkAssign()">Assign to\u2026</button>
      <button class="btn btn-danger" onclick="crmBulkDelete()">Delete</button>
      <span style="margin-left:auto;cursor:pointer;color:var(--text3)" onclick="crmClearSelection()">\u2715 Clear</span>
    </div>`;

  const thead = `<tr>
    <th class="no-sort" style="width:32px">
      <input type="checkbox" ${allOnPage ? "checked" : ""} onchange="crmToggleAll(this.checked)">
    </th>
    ${crmTh("name","Name")}
    ${crmTh("company_name","Company")}
    <th class="no-sort">Email</th>
    <th class="no-sort">Phone</th>
    <th class="no-sort">Budget</th>
    <th class="no-sort">Prop. Type</th>
    ${crmTh("stage","Stage")}
    ${crmTh("assigned_to","Assigned")}
    ${crmTh("created_at","Age")}
    <th class="no-sort"></th>
  </tr>`;

  const rows = leads.length
    ? leads.map(l => crmRow(l)).join("")
    : `<tr><td colspan="11" style="text-align:center;padding:40px;color:var(--text3)">No leads found</td></tr>`;

  const pageButtons = totalPages <= 1 ? "" : Array.from({ length: totalPages }, (_, i) =>
    `<button class="crm-page-btn${i === crmPage ? " active" : ""}" onclick="crmSetPage(${i})">${i + 1}</button>`
  ).join("");

  const footer = `
    <div class="crm-footer">
      <span>Showing <strong>${count > 0 ? from : 0}\u2013${to}</strong> of <strong>${count}</strong> leads</span>
      <div class="crm-page-btns">
        <button class="crm-page-btn" onclick="crmSetPage(${crmPage - 1})" ${crmPage === 0 ? "disabled" : ""} aria-label="Previous page">\u2190</button>
        ${pageButtons}
        <button class="crm-page-btn" onclick="crmSetPage(${crmPage + 1})" ${crmPage >= totalPages - 1 ? "disabled" : ""} aria-label="Next page">\u2192</button>
      </div>
      <span>25 per page</span>
    </div>`;

  const wonCount  = stageMap["closed_won"]  || 0;
  const lostCount = stageMap["closed_lost"] || 0;
  const activeCount = totalAll - wonCount - lostCount;
  const summaryBar = `
    <div class="crm-summary crm-summary-wrap"><div class="module-bar" style="padding:16px 16px 16px;margin-bottom:0;gap:12px">
      <div class="module-stat cs-total" style="cursor:pointer" onclick="crmSetFilter('stage','')">
        <div class="module-stat-val">${totalAll}</div>
        <div class="module-stat-label">Total Leads</div>
      </div>
      <div class="module-stat cs-new" style="cursor:pointer" onclick="crmSetFilter('stage','new_lead')">
        <div class="module-stat-val ${(stageMap['new_lead']||0)>0?'warn':''}">${stageMap["new_lead"]||0}</div>
        <div class="module-stat-label">New</div>
      </div>
      <div class="module-stat cs-contacted" style="cursor:pointer" onclick="crmSetFilter('stage','contacted_responded')">
        <div class="module-stat-val">${stageMap["contacted_responded"]||0}</div>
        <div class="module-stat-label">Contacted</div>
      </div>
      <div class="module-stat cs-visit" style="cursor:pointer" onclick="crmSetFilter('stage','site_visit')">
        <div class="module-stat-val">${stageMap["site_visit"]||0}</div>
        <div class="module-stat-label">Site Visit</div>
      </div>
      <div class="module-stat cs-followup" style="cursor:pointer" onclick="crmSetFilter('stage','follow_up')">
        <div class="module-stat-val ${(stageMap['follow_up']||0)>0?'warn':''}">${stageMap["follow_up"]||0}</div>
        <div class="module-stat-label">Follow-Up</div>
      </div>
      <div class="module-stat cs-won" style="cursor:pointer" onclick="crmSetFilter('stage','closed_won')">
        <div class="module-stat-val" style="color:var(--green)">${wonCount}</div>
        <div class="module-stat-label">Closed Won</div>
      </div>
      <div class="module-stat cs-lost" style="cursor:pointer" onclick="crmSetFilter('stage','closed_lost')">
        <div class="module-stat-val ${lostCount>0?'danger':''}">${lostCount}</div>
        <div class="module-stat-label">Closed Lost</div>
      </div>
      <div class="module-stat cs-active">
        <div class="module-stat-val">${activeCount}</div>
        <div class="module-stat-label">Active Pipeline</div>
      </div>
    </div></div>`;

  return summaryBar + toolbar + pills + bulkBar +
    `<div class="tw"><table class="crm-table">${thead}<tbody>${rows}</tbody></table></div>` +
    footer;
}

function crmTh(col, label) {
  const active = crmSortCol === col;
  const arrow = active ? (crmSortAsc ? " \u2191" : " \u2193") : "";
  return `<th class="${active ? "crm-sort-active" : ""}" onclick="crmSetSort('${col}')">${esc(label)}${arrow}</th>`;
}

function crmRow(lead) {
  const checked = crmSelected.has(lead.id);
  const stageClass = {
    new_lead: "badge-warning",
    contacted_responded: "badge-info",
    contacted_no_response: "badge-neutral",
    site_visit: "badge-success",
    follow_up: "badge-warning",
    closed_won: "badge-success",
    closed_lost: "badge-danger"
  }[lead.stage] || "badge-neutral";
  const stageLabel = CRM_STAGES.find(s => s.key === lead.stage)?.label || esc(lead.stage || "--");
  const company = lead.company_name ? esc(lead.company_name) : `<span class="crm-muted">\u2014</span>`;
  const assigned = lead.assigned_to ? esc(lead.assigned_to) : `<span class="crm-muted">\u2014</span>`;
  const ratingDot = lead.rating ? {'hot':'🔴','warm':'🟡','cold':'🔵'}[lead.rating]||'' : '';
  return `
    <tr class="${checked ? "crm-checked" : ""}" data-id="${lead.id}" data-stage="${lead.stage || ''}">
      <td onclick="crmToggleRow('${lead.id}',event)" style="width:32px">
        <input type="checkbox" ${checked ? "checked" : ""}>
      </td>
      <td onclick="viewLead('${lead.id}')" style="font-weight:600">${ratingDot?`<span title="${lead.rating}" style="margin-right:4px">${ratingDot}</span>`:''}${esc(lead.name || "—")}</td>
      <td onclick="viewLead('${lead.id}')">${company}</td>
      <td onclick="viewLead('${lead.id}')" class="crm-muted">${esc(lead.email || "—")}</td>
      <td onclick="viewLead('${lead.id}')" class="crm-muted">${esc((lead.phone || '').replace(/^p:/,'') || '--')}</td>
      <td onclick="viewLead('${lead.id}')" class="crm-muted">${esc(fmtLeadField(lead.created_time))}</td>
      <td onclick="viewLead('${lead.id}')" class="crm-muted">${esc(fmtLeadField(lead.ad_id || lead.property_types))}</td>
      <td onclick="viewLead('${lead.id}')"><span class="badge ${stageClass}">${stageLabel}</span></td>
      <td onclick="viewLead('${lead.id}')" class="crm-muted">${assigned}</td>
      <td onclick="viewLead('${lead.id}')" class="crm-muted">${timeAgo(lead.created_at)}</td>
      <td class="crm-action" onclick="viewLead('${lead.id}')">View \u2192</td>
    </tr>`;
}


function resetCRM() {
  crmSearch = ""; crmStage = ""; crmSource = ""; crmAssigned = "";
  crmDateFrom = ""; crmDateTo = "";
  crmSortCol = "created_at"; crmSortAsc = false;
  crmPage = 0; crmSelected.clear();
}

function crmClearDates() {
  crmDateFrom = ""; crmDateTo = "";
  crmPage = 0; crmSelected.clear();
  renderCRM();
}

function crmOnSearch(val) {
  clearTimeout(crmSearchTimer);
  crmSearchTimer = setTimeout(() => {
    crmSearch = val.trim();
    crmPage = 0; crmSelected.clear();
    renderCRM();
  }, 350);
}

function crmSetFilter(field, val) {
  if (field === "stage")    crmStage    = val;
  if (field === "source")   crmSource   = val;
  if (field === "assigned") crmAssigned = val;
  if (field === "dateFrom") crmDateFrom = val;
  if (field === "dateTo")   crmDateTo   = val;
  crmPage = 0; crmSelected.clear();
  renderCRM();
}

function crmSetSort(col) {
  if (crmSortCol === col) {
    crmSortAsc = !crmSortAsc;
  } else {
    crmSortCol = col;
    crmSortAsc = col !== "created_at";
  }
  crmPage = 0; crmSelected.clear();
  renderCRM();
}

function crmSetPage(p) {
  crmPage = p;
  crmSelected.clear();
  renderCRM();
}

function crmUpdateBulkBar() {
  const bar = document.getElementById("crm-bulk-bar");
  const ct  = document.getElementById("crm-bulk-count");
  if (!bar) return;
  const n = crmSelected.size;
  bar.style.display = n > 0 ? "" : "none";
  if (ct) ct.textContent = n + " lead" + (n > 1 ? "s" : "") + " selected";
  const hdr = document.querySelector(".crm-table thead input[type=checkbox]");
  if (hdr) {
    const rows = document.querySelectorAll(".crm-table tbody tr[data-id]");
    hdr.checked = rows.length > 0 && [...rows].every(tr => crmSelected.has(tr.dataset.id));
  }
}

function crmToggleRow(id, event) {
  event.stopPropagation();
  if (crmSelected.has(id)) {
    crmSelected.delete(id);
  } else {
    crmSelected.add(id);
  }
  const tr = document.querySelector(`.crm-table tbody tr[data-id="${id}"]`);
  if (tr) {
    tr.classList.toggle("crm-checked", crmSelected.has(id));
    const cb = tr.querySelector("input[type=checkbox]");
    if (cb) cb.checked = crmSelected.has(id);
  }
  crmUpdateBulkBar();
}

function crmToggleAll(checked) {
  const rows = document.querySelectorAll(".crm-table tbody tr[data-id]");
  rows.forEach(tr => {
    const id = tr.dataset.id;
    if (checked) { crmSelected.add(id); } else { crmSelected.delete(id); }
    tr.classList.toggle("crm-checked", checked);
    const cb = tr.querySelector("input[type=checkbox]");
    if (cb) cb.checked = checked;
  });
  crmUpdateBulkBar();
}

function crmClearSelection() {
  crmSelected.clear();
  document.querySelectorAll(".crm-table tbody tr[data-id]").forEach(tr => {
    tr.classList.remove("crm-checked");
    const cb = tr.querySelector("input[type=checkbox]");
    if (cb) cb.checked = false;
  });
  crmUpdateBulkBar();
}

function crmBulkMoveStage() {
  const opts = CRM_STAGES.map(s => `<option value="${esc(s.key)}">${esc(s.label)}</option>`).join("");
  openModal(`<div class="modal-header"><h2>Move ${crmSelected.size} leads to stage</h2></div>
    <div class="modal-body">
      <select id="bulk-stage-sel" class="filter-sel" style="width:100%">${opts}</select>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="crmBulkMoveStageConfirm()">Move</button>
    </div>`);
}

async function crmBulkMoveStageConfirm() {
  const stage = document.getElementById("bulk-stage-sel")?.value;
  if (!stage) return;
  const ids = [...crmSelected];
  const { error } = await sb.from("crm_leads").update({ stage }).in("id", ids);
  if (error) { toast("Error: " + error.message, "error"); return; }
  toast(`${ids.length} leads moved`, "success");
  closeModal();
  crmSelected.clear();
  renderCRM();
}

function crmBulkAssign() {
  openModal(`<div class="modal-header"><h2>Assign ${crmSelected.size} leads</h2></div>
    <div class="modal-body">
      <input id="bulk-assign-input" class="reg-search" placeholder="Assignee name…" style="width:100%">
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="crmBulkAssignConfirm()">Assign</button>
    </div>`);
}

async function crmBulkAssignConfirm() {
  const assigned_to = document.getElementById("bulk-assign-input")?.value.trim();
  if (!assigned_to) return;
  const ids = [...crmSelected];
  const { error } = await sb.from("crm_leads").update({ assigned_to }).in("id", ids);
  if (error) { toast("Error: " + error.message, "error"); return; }
  toast(`${ids.length} leads assigned to ${esc(assigned_to)}`, "success");
  closeModal();
  crmSelected.clear();
  renderCRM();
}

async function crmBulkDelete() {
  const ids = [...crmSelected];
  if (!confirm(`Delete ${ids.length} lead${ids.length > 1 ? "s" : ""}? This cannot be undone.`)) return;
  const { error } = await sb.from("crm_leads").delete().in("id", ids);
  if (error) { toast("Error: " + error.message, "error"); return; }
  toast(`${ids.length} leads deleted`, "success");
  crmSelected.clear();
  renderCRM();
}



const ACT_METHODS = {
  call:       {icon:'📞', label:'Call'},
  whatsapp:   {icon:'💬', label:'WhatsApp'},
  email:      {icon:'✉️', label:'Email'},
  meeting:    {icon:'🤝', label:'Meeting'},
  site_visit: {icon:'🏠', label:'Site Visit'},
  note:       {icon:'📝', label:'Note'},
  task:       {icon:'✅', label:'Task'},
};

const RATING_META = {
  hot:  {label:'🔴 Hot',  cls:'rating-hot'},
  warm: {label:'🟡 Warm', cls:'rating-warm'},
  cold: {label:'🔵 Cold', cls:'rating-cold'},
};

function _nowLocal() { return new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16); }
function _tomorrowLocal() { return new Date(Date.now()+86400000-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16); }

function onActMethodChange() {
  const method = document.getElementById('act-method')?.value;
  const lbl = document.getElementById('act-dt-label');
  const dt = document.getElementById('act-contacted-at');
  const assigneeRow = document.getElementById('act-assignee-row');
  if(!lbl||!dt) return;
  if(method==='task') {
    lbl.textContent='Due by'; dt.value=_tomorrowLocal();
    if(assigneeRow) assigneeRow.style.display='';
  } else {
    lbl.textContent='Contact time'; dt.value=_nowLocal();
    if(assigneeRow) assigneeRow.style.display='none';
  }
}

function filterActFeed(type) {
  document.querySelectorAll('.act-filter-btn').forEach(b=>b.classList.toggle('active',b.dataset.filter===type));
  let anyTask=false, anyPast=false;
  document.querySelectorAll('#act-feed .act-item').forEach(item=>{
    const m = item.dataset.method;
    let show = type==='all'
      || (type==='calls' && m==='call')
      || (type==='emails' && m==='email')
      || (type==='tasks' && m==='task')
      || (type==='other' && ['whatsapp','meeting','site_visit','note'].includes(m));
    item.style.display = show ? '' : 'none';
    if(show && m==='task') anyTask=true;
    if(show && m!=='task') anyPast=true;
  });
  const th = document.getElementById('act-hdr-tasks');
  const ph = document.getElementById('act-hdr-past');
  if(th) th.style.display = anyTask ? '' : 'none';
  if(ph) ph.style.display = anyPast ? '' : 'none';
}

let _crmReplyTo = null;

function startActReply(actId, bodyText) {
  _crmReplyTo = actId;
  const banner = document.getElementById('act-reply-banner');
  const preview = document.getElementById('act-reply-preview');
  if(banner) banner.classList.add('open');
  if(preview) preview.textContent = bodyText.length>70 ? bodyText.slice(0,70)+'…' : bodyText;
  document.getElementById('act-body')?.focus();
}

function cancelActReply() {
  _crmReplyTo = null;
  document.getElementById('act-reply-banner')?.classList.remove('open');
}

function quickSchedule(method) {
  const sel = document.getElementById('act-method');
  if(sel) sel.value = 'task';
  onActMethodChange();
  const body = document.getElementById('act-body');
  if(body) { body.placeholder = `Notes for scheduled ${ACT_METHODS[method]?.label||method}…`; body.focus(); }
  const dt = document.getElementById('act-contacted-at');
  if(dt) dt.value = _tomorrowLocal();
  // Pre-fill body hint; overwrite if empty or still a quick-schedule placeholder
  const hint = `Follow-up ${ACT_METHODS[method]?.label||method}`;
  if(body && (!body.value || body.value.startsWith('Follow-up '))) body.value = hint;
  // Select all so user can just type over it
  body?.select();
}

function _renderActItem(a, leadId, now, isThreaded=false) {
  const m = ACT_METHODS[a.method]||ACT_METHODS.note;
  const isTask = a.method==='task';
  const overdue = isTask && !a.completed && a.due_at && new Date(a.due_at)<now;
  const cls = ['act-item', overdue?'act-overdue':'', a.completed?'act-completed':'', isThreaded?'act-threaded':''].filter(Boolean).join(' ');
  const dateStr = isTask && a.due_at
    ? new Date(a.due_at).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})
    : new Date(a.contacted_at).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const overdueTag = overdue ? `<span class="act-overdue-tag">Overdue</span>` : '';
  const doneBtn = isTask && !a.completed
    ? `<button class="act-done-btn" onclick="completeTask('${a.id}','${leadId}')">✓ Done</button>` : '';
  const replyBtn = !isThreaded
    ? `<button class="act-reply-btn" style="margin-left:6px" onclick="startActReply('${a.id}',this.closest('.act-item').querySelector('.act-body').textContent)">↩ Reply</button>` : '';
  return `<div id="act-${esc(a.id)}" class="${cls}" data-method="${esc(a.method)}">
    <div class="act-meta">
      <span>${m.icon}</span><span class="act-badge">${m.label}</span>
      <span>·</span><span>${esc(a.author_name)}</span>
      <span>·</span><span>${isTask?'Due: ':''}<b>${dateStr}</b></span>
      ${overdueTag}${doneBtn}${replyBtn}
    </div>
    <div class="act-body">${_crmRenderMentionedText(a.body || '')}</div>
  </div>`;
}

function _buildFeedHtml(acts, leadId) {
  const now = new Date();
  const replyMap = {};
  const topLevel = [];
  (acts||[]).forEach(a => {
    if(a.parent_id) { (replyMap[a.parent_id]=replyMap[a.parent_id]||[]).push(a); }
    else topLevel.push(a);
  });
  const renderWithReplies = (a, threaded=false) =>
    _renderActItem(a, leadId, now, threaded) +
    (replyMap[a.id]||[]).sort((x,y)=>new Date(x.contacted_at)-new Date(y.contacted_at))
      .map(r=>_renderActItem(r, leadId, now, true)).join('');

  const tasks = topLevel.filter(a=>a.method==='task'&&!a.completed).sort((a,b)=>new Date(a.due_at||0)-new Date(b.due_at||0));
  const past  = topLevel.filter(a=>a.method!=='task'||a.completed).sort((a,b)=>new Date(a.contacted_at)-new Date(b.contacted_at));
  let html = '';
  if(tasks.length) { html += `<div class="act-section-hdr" id="act-hdr-tasks">📋 Tasks</div>`+tasks.map(a=>renderWithReplies(a)).join(''); }
  if(past.length)  { html += `<div class="act-section-hdr" id="act-hdr-past">Past Activity</div>`+past.map(a=>renderWithReplies(a)).join(''); }
  return html || '<div style="color:var(--text3);font-size:12px;padding:4px 0">No activity yet</div>';
}

async function viewLead(id) {
  const [{data:lead,error}, {data:acts}, {data:puRows}] = await Promise.all([
    sb.from('crm_leads').select('*').eq('id',id).maybeSingle(),
    sb.from('crm_lead_activities').select('*').eq('lead_id',id).order('contacted_at',{ascending:true}),
    sb.from('project_users').select('user_id').eq('project_id',currentProject.id),
  ]);
  if(error||!lead) { toast('Lead not found','error'); return; }
  const puIds = (puRows||[]).map(r=>r.user_id).filter(Boolean);
  const {data:memberProfiles} = puIds.length
    ? await sb.from('profiles').select('id,full_name').in('id',puIds)
    : {data:[]};
  _crmProjectMembers = memberProfiles||[];

  const stageOpts = CRM_STAGES.map(s=>`<option value="${esc(s.key)}"${lead.stage===s.key?'selected':''}>${esc(s.label)}</option>`).join('');
  const ratingBadge = lead.rating ? `<span class="${RATING_META[lead.rating].cls}" style="margin-left:6px;font-size:12px">${RATING_META[lead.rating].label}</span>` : '';
  const ratingBtns = Object.entries(RATING_META).map(([k,v])=>
    `<button class="rating-btn${lead.rating===k?' active':''}" data-val="${k}" onclick="setLeadRating('${lead.id}','${k}')">${v.label}</button>`
  ).join('');

  const feedHtml = _buildFeedHtml(acts, id);

  const methodOpts = Object.entries(ACT_METHODS).map(([k,v])=>`<option value="${k}"${k==='note'?' selected':''}>${v.icon} ${v.label}</option>`).join('');
  const convertBtn = lead.stage!=='closed_won'
    ? `<button class="btn btn-primary" onclick="openConvertLead('${lead.id}')">Convert Lead</button>`
    : `<span style="font-size:12px;color:#22c55e;font-weight:600">✓ Converted</span>`;

  openModal('Lead — '+esc(lead.name)+ratingBadge, `
    <div class="detail-grid">
      <div class="detail-item"><div class="detail-label">Name</div><div class="detail-value">${esc(lead.name)}</div></div>
      <div class="detail-item"><div class="detail-label">First Name</div><div class="detail-value">${esc(lead.first_name||'—')}</div></div>
      <div class="detail-item"><div class="detail-label">Email</div><div class="detail-value">${esc(lead.email||'—')}</div></div>
      <div class="detail-item"><div class="detail-label">Phone</div><div class="detail-value">${esc(lead.phone||'—')}</div></div>
      <div class="detail-item"><div class="detail-label">Company</div><div class="detail-value">${esc(lead.company_name||'—')}</div></div>
      <div class="detail-item"><div class="detail-label">Broker Type</div><div class="detail-value">${esc(lead.broker_type||'—')}</div></div>
      <div class="detail-item"><div class="detail-label">Budget</div><div class="detail-value">${esc(fmtLeadField(lead.budget_range||lead.created_time))}</div></div>
      <div class="detail-item"><div class="detail-label">Property Type</div><div class="detail-value">${esc(fmtLeadField(lead.property_types||lead.ad_id))}</div></div>
      <div class="detail-item"><div class="detail-label">Availability</div><div class="detail-value">${esc(lead.availability||'—')}</div></div>
      <div class="detail-item"><div class="detail-label">Source</div><div class="detail-value">${esc(({'meta_ads':'Meta Ads','website':'Website','referral':'Referral','walk_in':'Walk-In','other':'Other'})[lead.source]||lead.source||'—')}</div></div>
      <div class="detail-item"><div class="detail-label">Meta Lead ID</div><div class="detail-value mono">${esc(lead.meta_lead_id||'—')}</div></div>
      <div class="detail-item"><div class="detail-label">Created</div><div class="detail-value">${new Date(lead.created_at).toLocaleString('en-GB')}</div></div>
    </div>
    <div class="lead-controls-grid">
      <div class="form-group" style="margin-bottom:0"><label class="form-label-dark">Stage</label>
        <select class="form-control" id="lead-stage" onchange="updateLeadStage('${lead.id}')">${stageOpts}</select>
      </div>
      <div class="form-group" style="margin-bottom:0"><label class="form-label-dark">Assigned To</label>
        <select class="form-control" id="lead-assigned" onchange="updateLeadAssigned('${lead.id}')">
          <option value="">— Unassigned —</option>
          ${_crmProjectMembers.map(p=>`<option value="${esc(p.full_name||p.id)}"${lead.assigned_to===(p.full_name||p.id)?'selected':''}>${esc(p.full_name||p.id)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="margin-bottom:0;grid-column:1/-1"><label class="form-label-dark">Rating</label>
        <div class="rating-group">${ratingBtns}</div>
      </div>
    </div>
    <div style="margin-top:16px">
      <div style="font-size:11px;font-weight:600;color:var(--charcoal);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Activity</div>
      <div class="act-filter-bar">
        <button class="act-filter-btn active" data-filter="all" onclick="filterActFeed('all')">All</button>
        <button class="act-filter-btn" data-filter="tasks" onclick="filterActFeed('tasks')">Tasks</button>
        <button class="act-filter-btn" data-filter="calls" onclick="filterActFeed('calls')">Calls</button>
        <button class="act-filter-btn" data-filter="emails" onclick="filterActFeed('emails')">Emails</button>
        <button class="act-filter-btn" data-filter="other" onclick="filterActFeed('other')">Other</button>
      </div>
      <div class="act-feed" id="act-feed">${feedHtml}</div>
      <div style="display:flex;gap:6px;margin-bottom:8px">
        <button class="act-quick-btn" onclick="quickSchedule('call')">📞 Schedule Call</button>
        <button class="act-quick-btn" onclick="quickSchedule('whatsapp')">💬 Schedule WhatsApp</button>
        <button class="act-quick-btn" onclick="quickSchedule('meeting')">🤝 Schedule Meeting</button>
      </div>
      <div class="act-reply-banner" id="act-reply-banner">
        <span style="flex-shrink:0">↩ Replying to:</span>
        <span id="act-reply-preview" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-style:italic"></span>
        <button onclick="cancelActReply()" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:16px;line-height:1;padding:0 2px">×</button>
      </div>
      <div class="act-input-row">
        <select class="form-control" id="act-method" onchange="onActMethodChange()">${methodOpts}</select>
        <div><div class="act-dt-label" id="act-dt-label">Contact time</div><input type="datetime-local" class="form-control" id="act-contacted-at" value="${_nowLocal()}"/></div>
        <input type="text" class="form-control" id="act-body" placeholder="Add activity note…" onkeydown="if(event.key==='Enter')addLeadActivity('${lead.id}')"/>
        <button class="btn btn-primary" onclick="addLeadActivity('${lead.id}')">Add</button>
      </div>
      <div id="act-assignee-row" style="display:none;margin-top:6px">
        <select class="form-control" id="act-assignee" style="font-size:12px">
          <option value="">Assign task to: ${esc(currentProfile?.full_name||'me')} (default)</option>
          ${_crmProjectMembers.map(p=>`<option value="${esc(p.id)}" data-name="${esc(p.full_name||p.id)}">${esc(p.full_name||p.id)}</option>`).join('')}
        </select>
      </div>
    </div>`,
    `${convertBtn}<button class="btn btn-danger" onclick="deleteLead('${lead.id}')">Delete</button><button class="btn" onclick="closeModal()">Close</button>`,
    true);
  setTimeout(()=>{ const f=document.getElementById('act-feed'); if(f) f.scrollTop=f.scrollHeight; },60);
  setTimeout(() => {
    const inputEl = document.getElementById('act-body');
    if (inputEl && !inputEl.dataset.atWired) _crmAtInit(inputEl);
  }, 80);
}

async function updateLeadStage(id) {
  const stage = document.getElementById('lead-stage').value;
  const {error} = await sb.from('crm_leads').update({stage,updated_at:new Date().toISOString()}).eq('id',id);
  if(error) { toast('Error: '+error.message,'error'); return; }
  toast('Lead moved to '+CRM_STAGES.find(s=>s.key===stage)?.label,'success'); closeModal(); renderCRM();
}

async function setLeadRating(id, value) {
  const already = document.querySelector(`.rating-btn.active[data-val="${value}"]`);
  const newRating = already ? null : value;
  const {error} = await sb.from('crm_leads').update({rating:newRating,updated_at:new Date().toISOString()}).eq('id',id);
  if(error) { toast('Error: '+error.message,'error'); return; }
  document.querySelectorAll('.rating-btn').forEach(b=>b.classList.toggle('active', !already && b.dataset.val===value));
}

async function updateLeadAssigned(id) {
  const assigned = document.getElementById('lead-assigned').value.trim();
  const {error} = await sb.from('crm_leads').update({assigned_to:assigned,updated_at:new Date().toISOString()}).eq('id',id);
  if(error) { toast('Error: '+error.message,'error'); return; }
  toast('Assigned to '+assigned,'success');
}

async function addLeadActivity(id) {
  const body = document.getElementById('act-body')?.value?.trim();
  const method = document.getElementById('act-method')?.value||'note';
  const dateVal = document.getElementById('act-contacted-at')?.value;
  if(!body) return;
  const isTask = method==='task';
  const authorName = currentProfile?.full_name || currentUser?.email || 'Unknown';
  const parentId = _crmReplyTo||null;
  _crmReplyTo = null;
  let assignedToId = null, assignedToName = null;
  if(isTask) {
    const assigneeSel = document.getElementById('act-assignee');
    if(assigneeSel?.value) {
      assignedToId = assigneeSel.value;
      assignedToName = assigneeSel.options[assigneeSel.selectedIndex]?.dataset?.name || null;
    } else {
      assignedToId = currentUser?.id;
      assignedToName = authorName;
    }
  }
  const mentions = (_crmAtState?.chosen || []).map(c => c.id);
  const {error} = await sb.from('crm_lead_activities').insert({
    lead_id: id,
    author_id: currentUser?.id,
    author_name: authorName,
    method,
    contacted_at: isTask ? new Date().toISOString() : (dateVal ? new Date(dateVal).toISOString() : new Date().toISOString()),
    due_at: isTask && dateVal ? new Date(dateVal).toISOString() : null,
    body,
    completed: false,
    parent_id: parentId,
    assigned_to: assignedToId,
    assigned_to_name: assignedToName,
    mentions,
  });
  if(error) {
    _crmReplyTo=parentId;
    if ((error.message || '').includes('crm_activities_mentions_max_10')) {
      toast('Maximum 10 mentions per comment', 'error');
    } else {
      toast('Error: '+error.message,'error');
    }
    return;
  }
  if (_crmAtState) _crmAtState.chosen = [];
  if(!isTask) await sb.from('crm_leads').update({last_contacted_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',id);
  viewLead(id);
}

async function completeTask(actId, leadId) {
  const {error} = await sb.from('crm_lead_activities').update({completed:true}).eq('id',actId);
  if(error) { toast('Error: '+error.message,'error'); return; }
  toast('Task done','success');
  viewLead(leadId);
}

async function openConvertLead(leadId) {
  const {data:units} = await sb.from('units').select('id,unit_no,unit_type,floor,listed_price')
    .eq('project_id',currentProject.id).order('floor').order('unit_no');
  const unitIds = (units||[]).map(u=>u.id);
  const {data:sales} = unitIds.length
    ? await sb.from('unit_sales').select('unit_id').in('unit_id', unitIds)
    : {data:[]};
  const soldIds = new Set((sales||[]).map(s=>s.unit_id));
  const available = (units||[]).filter(u=>!soldIds.has(u.id));
  if(!available.length) { toast('No available units in this project','warning'); return; }
  openModal('Convert Lead', `
    <p style="font-size:13px;color:var(--text2);margin-bottom:14px">Link lead to a unit. Stage will be set to <strong>Closed Won</strong>.</p>
    <div class="form-group"><label class="form-label-dark">Select Unit</label>
      <select class="form-control" id="convert-unit-id">
        <option value="">Select unit…</option>
        ${available.map(u=>`<option value="${u.id}">Unit ${esc(u.unit_no)} · ${esc(u.unit_type)} · Floor ${u.floor} · AED ${fmtAED(u.listed_price)}</option>`).join('')}
      </select>
    </div>`,
    `<button class="btn btn-primary" onclick="doConvertLead('${leadId}')">Convert & Close Won</button><button class="btn" onclick="viewLead('${leadId}')">Back</button>`);
}

async function doConvertLead(leadId) {
  const unitId = document.getElementById('convert-unit-id')?.value;
  if(!unitId) { toast('Select a unit','error'); return; }
  const {error} = await sb.from('crm_leads').update({stage:'closed_won',converted_unit_id:unitId,updated_at:new Date().toISOString()}).eq('id',leadId);
  if(error) { toast('Error: '+error.message,'error'); return; }
  toast('Lead converted — Closed Won','success');
  closeModal(); renderCRM();
}

async function deleteLead(id) {
  if(!confirm('Delete this lead? This cannot be undone.')) return;
  const {error} = await sb.from('crm_leads').delete().eq('id',id);
  if(error) { toast('Error: '+error.message,'error'); return; }
  toast('Lead deleted','success'); closeModal(); renderCRM();
}

function openAddLead() {
  openModal('Add Lead', `
    <div class="form-group"><label class="form-label-dark" for="lead-name">Full Name *</label><input type="text" class="form-control" id="lead-name" aria-required="true" required/></div>
    <div class="frow">
      <div class="form-group"><label class="form-label-dark" for="lead-email">Email</label><input type="email" class="form-control" id="lead-email"/></div>
      <div class="form-group"><label class="form-label-dark" for="lead-phone">Phone</label><input type="tel" class="form-control" id="lead-phone"/></div>
    </div>
    <div class="form-group"><label class="form-label-dark" for="lead-source">Source</label>
      <select class="form-control" id="lead-source">
        <option value="meta_ads">Meta Ads</option><option value="website">Website</option><option value="referral">Referral</option><option value="walk_in">Walk-In</option><option value="other">Other</option>
      </select>
    </div>`,
    `<button class="btn btn-primary" onclick="doAddLead()">Add Lead</button>
     <button class="btn" onclick="closeModal()">Cancel</button>`);
}

async function doAddLead() {
  const name = document.getElementById('lead-name').value.trim();
  const email = document.getElementById('lead-email').value.trim();
  const phone = document.getElementById('lead-phone').value.trim();
  const source = document.getElementById('lead-source').value;
  if(!name) { toast('Name is required','error'); return; }
  if(!email && !phone) { toast('Add at least an email or phone so the lead can be contacted','warning'); }
  const {error} = await sb.from('crm_leads').insert({project_id:currentProject.id,name,email:email||null,phone:phone||null,source});
  if(error) { toast('Error: '+error.message,'error'); return; }
  toast('Lead added','success'); closeModal(); renderCRM();
}

function fmtLeadField(v) {
  if (!v) return '—';
  return v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/Aed /g, 'AED ');
}

function timeAgo(dateStr) {
  const diff = Date.now()-new Date(dateStr).getTime();
  const mins = Math.floor(diff/60000);
  if(mins<1) return 'Just now';
  if(mins<60) return mins+'m ago';
  const hrs = Math.floor(mins/60);
  if(hrs<24) return hrs+'h ago';
  const days = Math.floor(hrs/24);
  if(days<7) return days+'d ago';
  return new Date(dateStr).toLocaleDateString('en-GB');
}

// ─── EXPORT TO EXCEL ──────────────────────────────────────────────
async function crmExportExcel() {
  toast('Preparing export…', 'info');

  // Fetch all leads matching current filters (no pagination)
  let q = sb.from('crm_leads').select('*').eq('project_id', currentProject.id);
  if (crmSearch) { const s = crmSearch.replace(/,/g,''); q = q.or(`name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`); }
  if (crmStage)    q = q.eq('stage', crmStage);
  if (crmSource)   q = q.eq('source', crmSource);
  if (crmAssigned) q = q.eq('assigned_to', crmAssigned);
  if (crmDateFrom) q = q.gte('created_at', crmDateFrom);
  if (crmDateTo)   q = q.lte('created_at', crmDateTo + 'T23:59:59');
  q = q.order(crmSortCol, { ascending: crmSortAsc });
  const { data: leads, error } = await q;
  if (error) { toast('Export failed: ' + error.message, 'error'); return; }
  if (!leads || !leads.length) { toast('No leads to export', 'warning'); return; }

  // Fetch all activities for these leads in one query
  const leadIds = leads.map(l => l.id);
  const { data: activities } = await sb.from('crm_lead_activities')
    .select('lead_id,method,body,contacted_at,author_name,completed,due_at')
    .in('lead_id', leadIds)
    .order('contacted_at', { ascending: true });

  // Group activities by lead_id
  const actMap = {};
  (activities || []).forEach(a => {
    if (!actMap[a.lead_id]) actMap[a.lead_id] = [];
    actMap[a.lead_id].push(a);
  });

  const stageLabel = key => CRM_STAGES.find(s => s.key === key)?.label || key || '—';
  const sourceLabel = s => ({ meta_ads:'Meta Ads', website:'Website', referral:'Referral', walk_in:'Walk-In', other:'Other' }[s] || s || '—');
  const fmt = v => v ? new Date(v).toLocaleDateString('en-GB') : '';
  const fmtMethod = m => ({ call:'📞 Call', email:'✉ Email', whatsapp:'💬 WhatsApp', meeting:'🤝 Meeting', note:'📝 Note', task:'✓ Task' }[m] || m || '');

  // Build rows — one row per lead, activities as timestamped log in one cell
  const rows = leads.map(lead => {
    const acts = actMap[lead.id] || [];
    const actLog = acts.map(a => {
      const date = a.contacted_at ? new Date(a.contacted_at).toLocaleDateString('en-GB') : (a.due_at ? new Date(a.due_at).toLocaleDateString('en-GB') : '');
      const status = a.completed === false ? ' [Pending]' : '';
      return `[${date}] ${fmtMethod(a.method)}${a.author_name ? ' — ' + a.author_name : ''}${status}: ${a.body || ''}`;
    }).join('\n');

    return {
      'Name':           lead.name || '',
      'Email':          lead.email || '',
      'Phone':          lead.phone || '',
      'Stage':          stageLabel(lead.stage),
      'Source':         sourceLabel(lead.source),
      'Rating':         lead.rating ? '★'.repeat(lead.rating) : '',
      'Assigned To':    lead.assigned_to || '',
      'Budget Range':   lead.budget_range || '',
      'Property Types': lead.property_types || '',
      'Broker Type':    lead.broker_type || '',
      'Company':        lead.company_name || '',
      'Created':        fmt(lead.created_at),
      'Last Contacted': fmt(lead.last_contacted_at),
      'Activities (#)': acts.length,
      'Notes & Activity Log': actLog,
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);

  // Column widths
  ws['!cols'] = [
    {wch:25},{wch:28},{wch:18},{wch:16},{wch:14},{wch:8},{wch:20},
    {wch:16},{wch:20},{wch:14},{wch:20},{wch:12},{wch:14},{wch:12},{wch:60},
  ];

  // Wrap text on the activity log column
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let R = 1; R <= range.e.r; R++) {
    const cell = ws[XLSX.utils.encode_cell({r:R, c:14})];
    if (cell) cell.s = { alignment: { wrapText: true, vertical: 'top' } };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Leads');

  const project = currentProject?.name?.replace(/[^a-zA-Z0-9_-]/g,'_') || 'Leads';
  const date = new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, `CRM_Leads_${project}_${date}.xlsx`);
  toast(`Exported ${leads.length} leads`, 'success');
}

// ─── Manual sync of Meta leads from Google Sheet ─────────────────
async function crmSyncMetaLeads() {
  const btn = document.getElementById('crm-sync-btn');
  if (btn) { btn.disabled = true; btn.textContent = '\u21bb Syncing\u2026'; }
  try {
    const { data: { session } } = await sb.auth.getSession();
    const token = session?.access_token;
    if (!token) { toast('Not signed in', 'error'); return; }
    const res = await fetch('/api/sync-meta-leads', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(`Sync failed: ${body.error || res.status}`, 'error');
      return;
    }
    const { inserted = 0, duplicates = 0, errors = 0 } = body;
    if (errors > 0) {
      toast(`Sync done with ${errors} error(s) — ${inserted} new, ${duplicates} existing`, 'error');
    } else if (inserted > 0) {
      toast(`Synced ${inserted} new lead${inserted > 1 ? 's' : ''} (${duplicates} already in CRM)`, 'success');
    } else {
      toast(`Up to date — no new leads (${duplicates} checked)`, 'success');
    }
    if (typeof renderCRM === 'function') await renderCRM();
  } catch (e) {
    toast(`Sync error: ${e.message}`, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '\u21bb Sync'; }
  }
}

// ─── CRM NOTIFICATIONS ────────────────────────────────────────────
const _crmNotifState = {
  rows: [],
  unread: 0,
  loaded: false,
  channel: null,
  pageOffset: 0,
};

async function initCrmNotifications() {
  if (_crmNotifState.channel) return;
  if (!currentUser?.id) return;
  const r = currentProfile?.role;
  if (r !== 'developer' && r !== 'sales' && r !== 'admin') return;
  await _crmNotifFetchInitial();
  _crmNotifSubscribe();
  _crmNotifMountBell();
}

async function _crmNotifFetchInitial() {
  const { data, error } = await sb
    .from('crm_notifications')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('read_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) { console.warn('[crm-notif] fetch:', error); return; }
  _crmNotifState.rows = data || [];
  _crmNotifState.unread = (data || []).filter(r => !r.read_at).length;
  _crmNotifState.loaded = true;
  // Populate lead-name cache
  const leadIds = [...new Set(_crmNotifState.rows.map(r => r.lead_id))];
  if (leadIds.length) {
    const { data: leads } = await sb.from('crm_leads').select('id,name').in('id', leadIds);
    window._crmLeadNameCache = window._crmLeadNameCache || {};
    (leads || []).forEach(l => { window._crmLeadNameCache[l.id] = l.name; });
  }
  _crmNotifRenderBell();
}

function _crmNotifSubscribe() {
  if (_crmNotifState.channel) return;
  _crmNotifState.channel = sb
    .channel(`crm-notifs-${currentUser.id}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'crm_notifications',
      filter: `user_id=eq.${currentUser.id}`,
    }, async ({ new: row }) => {
      if (!window._crmLeadNameCache?.[row.lead_id]) {
        const { data: l } = await sb.from('crm_leads').select('id,name').eq('id', row.lead_id).maybeSingle();
        if (l) { window._crmLeadNameCache = window._crmLeadNameCache || {}; window._crmLeadNameCache[l.id] = l.name; }
      }
      _crmNotifState.rows.unshift(row);
      if (!row.read_at) _crmNotifState.unread++;
      _crmNotifRenderBell();
      _crmNotifRenderDropdown();
      _crmNotifRefreshHomeWidget?.();
      _crmNotifRefreshInboxIfActive?.();
    })
    .subscribe();
}

function _crmNotifMountBell() {
  const root = document.getElementById('crm-bell-root');
  if (!root) return;
  root.style.display = '';
  root.innerHTML = `
    <div class="crm-bell" id="crm-bell-btn" title="Notifications" onclick="toggleCrmBellDropdown(event)">
      🔔
      <div class="crm-bell-dot" id="crm-bell-dot" style="display:none">0</div>
    </div>
    <div class="crm-bell-dropdown hidden" id="crm-bell-dropdown"></div>
  `;
  _crmNotifRenderBell();
}

function _crmNotifRenderBell() {
  const dot = document.getElementById('crm-bell-dot');
  if (!dot) return;
  const n = _crmNotifState.unread;
  if (n <= 0) { dot.style.display = 'none'; return; }
  dot.style.display = '';
  dot.textContent = n > 99 ? '99+' : String(n);
}

function toggleCrmBellDropdown(ev) {
  ev?.stopPropagation();
  const dd = document.getElementById('crm-bell-dropdown');
  if (!dd) return;
  const opening = dd.classList.contains('hidden');
  dd.classList.toggle('hidden');
  if (opening) {
    _crmNotifRenderDropdown();
    _crmNotifMarkRead(_crmNotifState.rows.slice(0, 10).filter(r => !r.read_at).map(r => r.id));
  }
}

document.addEventListener('click', (e) => {
  const dd = document.getElementById('crm-bell-dropdown');
  if (!dd || dd.classList.contains('hidden')) return;
  if (e.target.closest('#crm-bell-dropdown') || e.target.closest('#crm-bell-btn')) return;
  dd.classList.add('hidden');
});

function _crmNotifRenderDropdown() {
  const dd = document.getElementById('crm-bell-dropdown');
  if (!dd) return;
  const top10 = _crmNotifState.rows.slice(0, 10);
  const body = top10.length
    ? top10.map(_crmNotifRowHtml).join('')
    : '<div style="padding:24px;text-align:center;color:#9ca3af;font-size:13px">No notifications</div>';
  dd.innerHTML = `
    <div class="head">
      <span class="title">Notifications</span>
      <span class="markall" onclick="crmMarkAllNotifsRead()">Mark all read</span>
    </div>
    ${body}
    <div class="foot" onclick="nav('crm-notifications', document.getElementById('n-crm-notifications'))">View all notifications →</div>
  `;
}

function _crmNotifRowHtml(r) {
  const initials = (r.actor_name || '?').split(/\s+/).slice(0,2).map(s => s[0]||'').join('').toUpperCase();
  const pillCls  = r.type === 'reply' ? 'pill reply' : 'pill';
  const verb     = r.type === 'reply' ? 'replied to your comment on' : 'mentioned you on';
  const leadLabel = (window._crmLeadNameCache && window._crmLeadNameCache[r.lead_id]) || 'Lead';
  return `<div class="crm-notif ${r.read_at ? '' : 'unread'}"
    onclick="crmOpenNotif('${r.id}','${r.lead_id}','${r.activity_id}')">
    <div class="avatar">${esc(initials)}</div>
    <div class="body">
      <div class="meta"><strong>${esc(r.actor_name)}</strong> ${verb} <strong>${esc(leadLabel)}</strong><span class="${pillCls}">${r.type}</span></div>
      <div class="snippet">${_crmRenderMentionedText(r.snippet)}</div>
      <div class="time">${_crmRelTime(r.created_at)}</div>
    </div>
  </div>`;
}

function _crmRelTime(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s/60) + ' min ago';
  if (s < 86400) return Math.floor(s/3600) + ' h ago';
  if (s < 7*86400) return Math.floor(s/86400) + ' d ago';
  return new Date(iso).toLocaleDateString('en-GB');
}

function _crmRenderMentionedText(text) {
  return esc(text || '').replace(/@\[([^\]]+)\]\(([0-9a-f-]+)\)/g,
    (_, name) => `<span class="act-mention-chip">@${esc(name)}</span>`);
}

async function crmOpenNotif(notifId, leadId, activityId) {
  await _crmNotifMarkRead([notifId]);
  document.getElementById('crm-bell-dropdown')?.classList.add('hidden');
  await viewLead(leadId);
  setTimeout(() => {
    const el = document.getElementById(`act-${activityId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.outline = '2px solid #2563eb';
      setTimeout(() => { el.style.outline = ''; }, 1500);
    }
  }, 200);
}

async function _crmNotifMarkRead(ids) {
  if (!ids || !ids.length) return;
  const now = new Date().toISOString();
  const { error } = await sb.from('crm_notifications')
    .update({ read_at: now })
    .in('id', ids).is('read_at', null);
  if (error) { console.warn('[crm-notif] mark read:', error); return; }
  ids.forEach(id => {
    const r = _crmNotifState.rows.find(x => x.id === id);
    if (r && !r.read_at) { r.read_at = now; _crmNotifState.unread = Math.max(0, _crmNotifState.unread - 1); }
  });
  _crmNotifRenderBell();
  _crmNotifRefreshHomeWidget?.();
}

async function crmMarkAllNotifsRead() {
  const now = new Date().toISOString();
  const { error } = await sb.from('crm_notifications')
    .update({ read_at: now })
    .eq('user_id', currentUser.id).is('read_at', null);
  if (error) { toast('Error: '+error.message,'error'); return; }
  _crmNotifState.rows.forEach(r => { if (!r.read_at) r.read_at = now; });
  _crmNotifState.unread = 0;
  _crmNotifRenderBell();
  _crmNotifRenderDropdown();
  _crmNotifRefreshHomeWidget?.();
  _crmNotifRefreshInboxIfActive?.();
  toast('All notifications marked read','success');
}

function _crmNotifRefreshHomeWidget() {
  const slot = document.getElementById('ch-attn-slot');
  if (!slot) return;
  const unread = _crmNotifState.rows.filter(r => !r.read_at).slice(0, 5);
  if (!unread.length) { slot.innerHTML = ''; return; }
  slot.innerHTML = `
    <div class="ch-attn">
      <div class="ch-attn-hdr">
        🔔 Needs your attention
        <span class="ch-attn-badge">${_crmNotifState.unread}</span>
        <span class="ch-attn-markall" onclick="crmMarkAllNotifsRead()">Mark all read</span>
      </div>
      ${unread.map(_crmAttnRowHtml).join('')}
      ${_crmNotifState.unread > 5
        ? `<div style="text-align:center;padding-top:8px"><a href="#" onclick="nav('crm-notifications',document.getElementById('n-crm-notifications'));return false">+${_crmNotifState.unread - 5} more</a></div>`
        : ''}
    </div>
  `;
  _crmNotifMarkRead(unread.map(r => r.id));
}

function _crmAttnRowHtml(r) {
  const initials = (r.actor_name || '?').split(/\s+/).slice(0,2).map(s => s[0]||'').join('').toUpperCase();
  const verb = r.type === 'reply' ? 'replied' : 'mentioned you';
  const leadLabel = (window._crmLeadNameCache && window._crmLeadNameCache[r.lead_id]) || 'Lead';
  return `<div class="ch-attn-row" onclick="crmOpenNotif('${r.id}','${r.lead_id}','${r.activity_id}')">
    <div class="crm-notif"><div class="avatar">${esc(initials)}</div></div>
    <div style="flex:1">
      <div class="lead">${esc(leadLabel)}</div>
      <div class="meta">${esc(r.actor_name)} ${verb} · ${_crmRelTime(r.created_at)}</div>
      <div class="snippet">"${_crmRenderMentionedText(r.snippet)}"</div>
    </div>
    <div class="open">Open →</div>
  </div>`;
}

let _crmInboxTab = 'all';

async function renderCrmNotifications() {
  await initCrmNotifications();
  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <h2>Notifications</h2>
      <button class="btn" id="crm-notif-mark-all">Mark all read</button>
    </div>
    <div class="notif-tabs">
      <button class="notif-tab" data-tab="all">All</button>
      <button class="notif-tab" data-tab="mention">Mentions</button>
      <button class="notif-tab" data-tab="reply">Replies</button>
      <button class="notif-tab" data-tab="unread">Unread</button>
    </div>
    <div class="notif-list" id="crm-notif-list"></div>
    <div id="crm-notif-loadmore" style="text-align:center;padding:12px;display:none">
      <button class="btn">Load more</button>
    </div>`;
  document.querySelectorAll('.notif-tab').forEach(btn => {
    btn.onclick = () => { _crmInboxTab = btn.dataset.tab; _crmInboxRender(); _crmInboxSyncTabsActive(); };
    btn.classList.toggle('active', btn.dataset.tab === _crmInboxTab);
  });
  const mark = document.getElementById('crm-notif-mark-all');
  if (mark) mark.onclick = crmMarkAllNotifsRead;
  const loadMoreBox = document.getElementById('crm-notif-loadmore');
  if (loadMoreBox) {
    loadMoreBox.style.display = _crmNotifState.rows.length >= 50 ? '' : 'none';
    loadMoreBox.querySelector('button').onclick = _crmInboxLoadMore;
  }
  _crmInboxRender();
}

function _crmInboxSyncTabsActive() {
  document.querySelectorAll('.notif-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === _crmInboxTab);
  });
}

function _crmInboxRender() {
  const list = document.getElementById('crm-notif-list');
  if (!list) return;
  let rows = _crmNotifState.rows;
  if (_crmInboxTab === 'mention')      rows = rows.filter(r => r.type === 'mention');
  else if (_crmInboxTab === 'reply')   rows = rows.filter(r => r.type === 'reply');
  else if (_crmInboxTab === 'unread')  rows = rows.filter(r => !r.read_at);
  if (!rows.length) {
    list.innerHTML = '<div style="padding:32px;text-align:center;color:#9ca3af">Nothing here</div>';
    return;
  }
  list.innerHTML = rows.map(_crmNotifRowHtml).join('');
  const unreadIds = rows.filter(r => !r.read_at).map(r => r.id);
  if (unreadIds.length) _crmNotifMarkRead(unreadIds);
}

function _crmNotifRefreshInboxIfActive() {
  if (typeof currentPage !== 'undefined' && currentPage === 'crm-notifications') _crmInboxRender();
}

async function _crmInboxLoadMore() {
  const offset = _crmNotifState.rows.length;
  const { data } = await sb.from('crm_notifications')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('read_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false })
    .range(offset, offset + 49);
  if (!data?.length) {
    const box = document.getElementById('crm-notif-loadmore');
    if (box) box.style.display = 'none';
    return;
  }
  _crmNotifState.rows.push(...data);
  const newLeadIds = [...new Set(data.map(r => r.lead_id))]
    .filter(id => !(window._crmLeadNameCache && window._crmLeadNameCache[id]));
  if (newLeadIds.length) {
    const { data: leads } = await sb.from('crm_leads').select('id,name').in('id', newLeadIds);
    window._crmLeadNameCache = window._crmLeadNameCache || {};
    (leads||[]).forEach(l => { window._crmLeadNameCache[l.id] = l.name; });
  }
  _crmInboxRender();
  const box = document.getElementById('crm-notif-loadmore');
  if (box) box.style.display = data.length >= 50 ? '' : 'none';
}

window.renderCrmNotifications = renderCrmNotifications;

// ─── CRM @MENTION AUTOCOMPLETE ────────────────────────────────────
let _crmMentionPool = null;
async function _crmGetMentionPool() {
  if (_crmMentionPool) return _crmMentionPool;
  const { data } = await sb.from('profiles')
    .select('id, full_name, role')
    .in('role', ['developer', 'sales', 'admin'])
    .neq('id', currentUser?.id || '00000000-0000-0000-0000-000000000000')
    .order('full_name');
  _crmMentionPool = data || [];
  return _crmMentionPool;
}

let _crmAtState = { active: false, anchorStart: -1, query: '', idx: 0, items: [], chosen: [] };

function _crmAtInit(inputEl) {
  if (!inputEl) return;
  inputEl.dataset.atWired = '1';
  _crmAtState.chosen = [];
  inputEl.addEventListener('input', (e) => _crmAtOnInput(inputEl, e));
  inputEl.addEventListener('keydown', (e) => _crmAtOnKeyDown(inputEl, e));
  inputEl.addEventListener('blur', () => setTimeout(_crmAtClose, 150));
}

async function _crmAtOnInput(inputEl) {
  const val = inputEl.value;
  const caret = inputEl.selectionStart || val.length;
  let i = caret - 1;
  while (i >= 0 && /[A-Za-z0-9_]/.test(val[i])) i--;
  if (i < 0 || val[i] !== '@' || (i > 0 && /\w/.test(val[i-1]))) { _crmAtClose(); return; }
  const query = val.slice(i + 1, caret).toLowerCase();
  _crmAtState.active = true;
  _crmAtState.anchorStart = i;
  _crmAtState.query = query;
  const pool = await _crmGetMentionPool();
  _crmAtState.items = pool.filter(p => (p.full_name||'').toLowerCase().includes(query)).slice(0, 8);
  _crmAtState.idx = 0;
  _crmAtRender(inputEl);
}

function _crmAtRender(inputEl) {
  let pop = document.getElementById('crm-at-popup');
  if (!pop) {
    pop = document.createElement('div');
    pop.id = 'crm-at-popup';
    pop.className = 'crm-at-popup';
    document.body.appendChild(pop);
  }
  if (!_crmAtState.items.length) { _crmAtClose(); return; }
  pop.innerHTML = _crmAtState.items.map((p, i) => `
    <div class="crm-at-item ${i === _crmAtState.idx ? 'active' : ''}"
         onmousedown="event.preventDefault(); _crmAtPick(${i})">
      <span>${esc(p.full_name || p.id)}</span><span class="role">${esc(p.role||'')}</span>
    </div>
  `).join('');
  const rect = inputEl.getBoundingClientRect();
  pop.style.left = rect.left + 'px';
  pop.style.top = (rect.bottom + 4 + window.scrollY) + 'px';
  pop.style.display = '';
}

function _crmAtClose() {
  _crmAtState.active = false;
  const pop = document.getElementById('crm-at-popup');
  if (pop) pop.style.display = 'none';
}

function _crmAtOnKeyDown(inputEl, e) {
  if (!_crmAtState.active) return;
  if (e.key === 'ArrowDown') { e.preventDefault();
    _crmAtState.idx = (_crmAtState.idx + 1) % _crmAtState.items.length; _crmAtRender(inputEl); }
  else if (e.key === 'ArrowUp') { e.preventDefault();
    _crmAtState.idx = (_crmAtState.idx - 1 + _crmAtState.items.length) % _crmAtState.items.length; _crmAtRender(inputEl); }
  else if (e.key === 'Enter') { e.preventDefault(); _crmAtPick(_crmAtState.idx); }
  else if (e.key === 'Escape') { _crmAtClose(); }
}

window._crmAtPick = function(idx) {
  const inputEl = document.getElementById('act-body');
  if (!inputEl) return;
  const item = _crmAtState.items[idx];
  if (!item) return;
  const before = inputEl.value.slice(0, _crmAtState.anchorStart);
  const after  = inputEl.value.slice(inputEl.selectionStart || inputEl.value.length);
  const marker = `@[${item.full_name || item.id}](${item.id}) `;
  inputEl.value = before + marker + after;
  inputEl.focus();
  const caret = (before + marker).length;
  inputEl.setSelectionRange(caret, caret);
  if (!_crmAtState.chosen.find(c => c.id === item.id)) _crmAtState.chosen.push(item);
  _crmAtClose();
};

