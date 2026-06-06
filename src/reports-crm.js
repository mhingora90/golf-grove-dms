// REPORTS — CRM Activity Report
// Date-range filterable view of customer interactions (calls, meetings, etc.)
// across the current project. Includes both lead-side and customer-side activity.

function _openCrmReport() {
  const now = new Date();
  const to = _crmFmtDateISO(now);
  const fromD = new Date(now);
  fromD.setDate(fromD.getDate() - 29);
  const from = _crmFmtDateISO(fromD);
  renderCrmReport(from, to);
}

function _crmFmtDateISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function _crmFmtDateDisplay(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return d + '/' + m + '/' + y;
}

const _CRM_METHODS = ['call','whatsapp','email','sms','in_person','meeting','site_visit','note','task'];
const _CRM_METHOD_LABEL = {
  call:'Call', whatsapp:'WhatsApp', email:'Email', sms:'SMS',
  in_person:'In Person', meeting:'Meeting', site_visit:'Site Visit',
  note:'Note', task:'Task',
};
const _CRM_METHOD_COLOR = {
  call:'var(--green)', whatsapp:'#25D366', email:'var(--blue)', sms:'#7B68EE',
  in_person:'var(--sand)', meeting:'var(--amber)', site_visit:'#C97A1F',
  note:'var(--text3)', task:'var(--charcoal)',
};

async function _fetchCrmActivityData(projectId, fromISO, toISO) {
  const fromTs = fromISO + 'T00:00:00Z';
  const toTs   = toISO   + 'T23:59:59Z';

  const [leads, customers] = await Promise.all([
    sb.from('crm_leads').select('id, name').eq('project_id', projectId),
    sb.from('customers').select('id, name').eq('project_id', projectId),
  ]);
  const leadIds = (leads.data || []).map(l => l.id);
  const customerIds = (customers.data || []).map(c => c.id);

  // Fetch activities in two queries (one for leads, one for customers) since
  // RLS allows reading all activities but we want only this project's scope.
  const acts = [];
  if (leadIds.length) {
    const { data } = await sb.from('crm_lead_activities')
      .select('id, lead_id, customer_id, method, contacted_at, body, author_name')
      .in('lead_id', leadIds)
      .gte('contacted_at', fromTs)
      .lte('contacted_at', toTs)
      .order('contacted_at', { ascending: false });
    (data || []).forEach(a => acts.push(a));
  }
  if (customerIds.length) {
    const { data } = await sb.from('crm_lead_activities')
      .select('id, lead_id, customer_id, method, contacted_at, body, author_name')
      .in('customer_id', customerIds)
      .gte('contacted_at', fromTs)
      .lte('contacted_at', toTs)
      .order('contacted_at', { ascending: false });
    (data || []).forEach(a => acts.push(a));
  }

  // Build lookup maps for name display
  const leadMap = {};
  (leads.data || []).forEach(l => leadMap[l.id] = l.name);
  const customerMap = {};
  (customers.data || []).forEach(c => customerMap[c.id] = c.name);

  // Sort merged activities desc by contacted_at
  acts.sort((a, b) => new Date(b.contacted_at) - new Date(a.contacted_at));

  return { acts, leadMap, customerMap, leadIds, customerIds };
}

function _crmCalcStats(data, fromISO, toISO) {
  const { acts, leadMap, customerMap } = data;

  const total = acts.length;

  const methodCounts = {};
  _CRM_METHODS.forEach(m => methodCounts[m] = 0);
  acts.forEach(a => { if (methodCounts[a.method] !== undefined) methodCounts[a.method]++; });

  const uniqueLeads = new Set(acts.filter(a => a.lead_id).map(a => a.lead_id));
  const uniqueCustomers = new Set(acts.filter(a => a.customer_id).map(a => a.customer_id));

  const authorCounts = {};
  acts.forEach(a => {
    const name = a.author_name || 'Unknown';
    authorCounts[name] = (authorCounts[name] || 0) + 1;
  });
  const topAuthors = Object.entries(authorCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Daily series
  const dayMap = {};
  const from = new Date(fromISO + 'T00:00:00Z');
  const to   = new Date(toISO   + 'T00:00:00Z');
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    dayMap[_crmFmtDateISO(d)] = 0;
  }
  acts.forEach(a => {
    const iso = _crmFmtDateISO(new Date(a.contacted_at));
    if (dayMap[iso] !== undefined) dayMap[iso]++;
  });
  const dailyRows = Object.entries(dayMap).map(([iso, count]) => ({ iso, count }));

  const subjectCounts = {};
  acts.forEach(a => {
    let label = null;
    if (a.customer_id && customerMap[a.customer_id]) label = customerMap[a.customer_id] + ' \u2022 customer';
    else if (a.lead_id && leadMap[a.lead_id])        label = leadMap[a.lead_id] + ' \u2022 lead';
    if (!label) return;
    subjectCounts[label] = (subjectCounts[label] || 0) + 1;
  });
  const topSubjects = Object.entries(subjectCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return { total, methodCounts, uniqueLeads: uniqueLeads.size, uniqueCustomers: uniqueCustomers.size, topAuthors, dailyRows, topSubjects };
}

async function renderCrmReport(fromISO, toISO) {
  const hash = '#reports-crm/' + fromISO + '_' + toISO;
  if (location.hash !== hash) history.replaceState(null, '', hash);
  currentPage = 'reports-crm';
  document.getElementById('page-title').textContent = PAGE_TITLES['reports-crm'];
  const el = document.getElementById('content');
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Loading...</div>';

  const data = await _fetchCrmActivityData(currentProject.id, fromISO, toISO);
  const stats = _crmCalcStats(data, fromISO, toISO);

  const container = document.createElement('div');
  container.id = 'crm-report-container';
  container.style.cssText = 'padding-bottom:32px';
  container.innerHTML = _crmBuildHTML(stats, data, fromISO, toISO);
  el.innerHTML = '';
  el.appendChild(container);
}

function _crmBuildHTML(stats, data, fromISO, toISO) {
  const projName = (currentProject && currentProject.name) ? currentProject.name : '';
  const fromVal = "document.getElementById('rpt-crm-from').value";
  const toVal   = "document.getElementById('rpt-crm-to').value";

  const header = [
    '<div style="padding:20px 24px 0;display:flex;flex-direction:column;gap:14px">',
    '<div style="display:flex;align-items:center;gap:6px">',
    '<a href="#" onclick="nav(\'reports\', document.getElementById(\'n-reports\'));return false" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:500;color:var(--text3);text-decoration:none;padding:4px 8px;border-radius:6px;background:var(--bg3);border:0.5px solid var(--border)">',
    '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8 2L4 6l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'All Reports</a>',
    '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="#B4A88C" stroke-width="1.2" stroke-linecap="round"/></svg>',
    '<span style="font-size:11px;color:var(--text2);font-weight:500">CRM Activity Report</span>',
    '</div>',
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">',
    '<div>',
    '<h1 style="margin:0 0 2px;font-size:18px;font-weight:600;color:var(--charcoal);letter-spacing:-.3px">CRM Activity Report</h1>',
    '<div style="font-size:12px;color:var(--text3)">' + esc(projName) + '</div>',
    '</div>',
    '<button class="btn btn-sm btn-secondary" style="flex-shrink:0;margin-top:2px" onclick="exportCrmReportPDF(\'' + fromISO + '\',\'' + toISO + '\')">',
    '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="margin-right:4px"><path d="M6 2v6M3 6l3 3 3-3M2 10h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'Export PDF</button>',
    '</div>',
    '<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--bg3);border:0.5px solid var(--border);border-radius:8px;flex-wrap:wrap">',
    '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1.5" y="2.5" width="10" height="9" rx="1.5" stroke="#B4A88C" stroke-width="1.1"/><path d="M4 1.5v2M9 1.5v2M1.5 5.5h10" stroke="#B4A88C" stroke-width="1.1" stroke-linecap="round"/></svg>',
    '<span style="font-size:11px;font-weight:500;color:var(--text2)">From</span>',
    '<input id="rpt-crm-from" type="date" class="filter-sel" value="' + fromISO + '" onchange="renderCrmReport(this.value,' + toVal + ')" style="padding:4px 8px">',
    '<span style="font-size:11px;font-weight:500;color:var(--text2)">To</span>',
    '<input id="rpt-crm-to"   type="date" class="filter-sel" value="' + toISO + '"   onchange="renderCrmReport(' + fromVal + ', this.value)" style="padding:4px 8px">',
    '<div style="display:flex;gap:4px;margin-left:6px">',
    _crmPresetBtn('7d', 'Last 7 days'),
    _crmPresetBtn('30d', 'Last 30 days'),
    _crmPresetBtn('90d', 'Last 90 days'),
    _crmPresetBtn('mtd', 'MTD'),
    _crmPresetBtn('ytd', 'YTD'),
    '</div>',
    '<span style="margin-left:auto;font-size:10px;color:var(--text3)">Generated ' + new Date().toLocaleDateString('en-GB') + '</span>',
    '</div>',
    '</div>',
  ].join('');

  const sections = [
    '<div style="padding:0 24px;display:flex;flex-direction:column;gap:16px;margin-top:16px">',
    _crmSummary(stats, fromISO, toISO),
    _crmHeadKPIs(stats),
    _crmMethodBreakdown(stats),
    _crmDailyChart(stats),
    _crmTopRow(stats),
    _crmActivityTable(data),
    '</div>',
  ].join('');

  return header + sections;
}

function _crmPresetBtn(key, label) {
  return '<button class="btn btn-sm btn-secondary" style="font-size:10px;padding:3px 8px" onclick="_crmApplyPreset(\'' + key + '\')">' + label + '</button>';
}

function _crmApplyPreset(key) {
  const now = new Date();
  const to = _crmFmtDateISO(now);
  let from = to;
  if (key === '7d')  { const d = new Date(now); d.setDate(d.getDate() - 6); from = _crmFmtDateISO(d); }
  if (key === '30d') { const d = new Date(now); d.setDate(d.getDate() - 29); from = _crmFmtDateISO(d); }
  if (key === '90d') { const d = new Date(now); d.setDate(d.getDate() - 89); from = _crmFmtDateISO(d); }
  if (key === 'mtd') { const d = new Date(now.getFullYear(), now.getMonth(), 1); from = _crmFmtDateISO(d); }
  if (key === 'ytd') { const d = new Date(now.getFullYear(), 0, 1); from = _crmFmtDateISO(d); }
  renderCrmReport(from, to);
}

function _crmSummary(stats, fromISO, toISO) {
  const { total, uniqueCustomers, uniqueLeads } = stats;
  return [
    '<div style="background:#E0EAF5;border-left:3px solid #2B6CB0;border-radius:0 8px 8px 0;padding:14px 18px">',
    '<div style="color:#2B6CB0;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px">Executive Summary</div>',
    '<p style="color:var(--charcoal);font-size:13px;line-height:1.75;margin:0">',
    'From <strong>' + _crmFmtDateDisplay(fromISO) + '</strong> to <strong>' + _crmFmtDateDisplay(toISO) + '</strong>, the team logged ',
    '<strong>' + total + ' interaction' + (total === 1 ? '' : 's') + '</strong> across ',
    '<strong>' + uniqueCustomers + ' customer' + (uniqueCustomers === 1 ? '' : 's') + '</strong> and ',
    '<strong>' + uniqueLeads + ' lead' + (uniqueLeads === 1 ? '' : 's') + '</strong>.',
    '</p></div>',
  ].join('');
}

function _crmHeadKPIs(stats) {
  const { total, methodCounts, uniqueCustomers, uniqueLeads } = stats;
  const calls = methodCounts.call || 0;
  const meetings = (methodCounts.meeting || 0) + (methodCounts.in_person || 0) + (methodCounts.site_visit || 0);
  const messages = (methodCounts.whatsapp || 0) + (methodCounts.sms || 0) + (methodCounts.email || 0);
  return [
    '<div>',
    '<div style="color:var(--text3);font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">Period Totals</div>',
    '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px">',
    _kpiTile('Total Interactions', String(total),            'var(--charcoal)', ''),
    _kpiTile('Calls',              String(calls),            'var(--green)',    ''),
    _kpiTile('Messages',           String(messages),         'var(--blue)',     ''),
    _kpiTile('Meetings & Visits',  String(meetings),         'var(--amber)',    ''),
    _kpiTile('Customers Contacted',String(uniqueCustomers),  'var(--sand)',     ''),
    _kpiTile('Leads Contacted',    String(uniqueLeads),      'var(--text2)',    ''),
    '</div></div>',
  ].join('');
}

function _crmMethodBreakdown(stats) {
  const { methodCounts, total } = stats;
  const max = Math.max(1, ..._CRM_METHODS.map(m => methodCounts[m] || 0));
  const rows = _CRM_METHODS.filter(m => methodCounts[m] > 0).map(m => {
    const n = methodCounts[m];
    const widthPct = (n / max) * 100;
    const sharePct = total > 0 ? Math.round((n / total) * 100) : 0;
    return [
      '<div style="display:flex;align-items:center;gap:10px;font-size:11px">',
      '<div style="width:100px;color:var(--charcoal);font-weight:500">' + _CRM_METHOD_LABEL[m] + '</div>',
      '<div style="flex:1;height:18px;background:var(--bg3);border-radius:6px;overflow:hidden">',
      '<div style="width:' + widthPct + '%;height:100%;background:' + _CRM_METHOD_COLOR[m] + '"></div>',
      '</div>',
      '<div style="width:48px;text-align:right;color:var(--charcoal);font-variant-numeric:tabular-nums;font-weight:600">' + n + '</div>',
      '<div style="width:36px;text-align:right;color:var(--text3);font-size:10px">' + sharePct + '%</div>',
      '</div>',
    ].join('');
  }).join('');
  const body = rows || '<div style="text-align:center;color:var(--text3);font-size:12px;padding:24px 0">No interactions in this period.</div>';
  return [
    '<div class="card" style="padding:14px">',
    '<div style="font-size:12px;font-weight:600;color:var(--charcoal);margin-bottom:12px">Interaction Method Breakdown</div>',
    '<div style="display:flex;flex-direction:column;gap:8px">' + body + '</div>',
    '</div>',
  ].join('');
}

function _crmDailyChart(stats) {
  const days = stats.dailyRows;
  const maxVal = Math.max(1, ...days.map(d => d.count));
  const W = 640, H = 160, PAD_L = 28, PAD_B = 26, PAD_T = 10, PAD_R = 8;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const stepX = days.length > 1 ? innerW / (days.length - 1) : innerW;

  const pts = days.map((d, i) => {
    const x = PAD_L + stepX * i;
    const y = PAD_T + innerH - (d.count / maxVal) * innerH;
    return [x, y];
  });
  const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = path + ' L ' + pts[pts.length - 1][0].toFixed(1) + ' ' + (PAD_T + innerH) + ' L ' + pts[0][0].toFixed(1) + ' ' + (PAD_T + innerH) + ' Z';

  const ticks = [0, Math.ceil(maxVal/2), maxVal];
  const yAxis = ticks.map(t => {
    const y = PAD_T + innerH - (t / maxVal) * innerH;
    return [
      '<line x1="' + PAD_L + '" y1="' + y + '" x2="' + (W - PAD_R) + '" y2="' + y + '" stroke="var(--border)" stroke-width="0.4" stroke-dasharray="2,2"/>',
      '<text x="' + (PAD_L - 4) + '" y="' + (y + 3) + '" text-anchor="end" font-size="9" fill="var(--text3)">' + t + '</text>',
    ].join('');
  }).join('');

  const showEvery = Math.max(1, Math.floor(days.length / 8));
  const xLabels = days.map((d, i) => {
    if (i % showEvery !== 0 && i !== days.length - 1) return '';
    const x = PAD_L + stepX * i;
    const [, m, dd] = d.iso.split('-');
    return '<text x="' + x + '" y="' + (H - 8) + '" text-anchor="middle" font-size="9" fill="var(--text3)">' + dd + '/' + m + '</text>';
  }).join('');

  return [
    '<div class="card" style="padding:14px">',
    '<div style="font-size:12px;font-weight:600;color:var(--charcoal);margin-bottom:10px">Daily Activity Volume</div>',
    '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block">',
    yAxis,
    '<path d="' + area + '" fill="rgba(43,108,176,0.12)"/>',
    '<path d="' + path + '" stroke="#2B6CB0" stroke-width="1.6" fill="none" stroke-linejoin="round"/>',
    xLabels,
    '</svg>',
    '</div>',
  ].join('');
}

function _crmTopRow(stats) {
  return [
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">',
    _crmTopAuthors(stats),
    _crmTopSubjects(stats),
    '</div>',
  ].join('');
}

function _crmTopAuthors(stats) {
  const rows = stats.topAuthors;
  let body;
  if (!rows.length) {
    body = '<tr><td colspan="2" style="padding:18px;text-align:center;color:var(--text3);font-size:12px">No activity recorded.</td></tr>';
  } else {
    body = rows.map(r => [
      '<tr style="border-bottom:0.5px solid var(--border)">',
      '<td style="padding:8px 10px;color:var(--charcoal)">' + esc(r.name) + '</td>',
      '<td style="padding:8px 10px;text-align:right;color:var(--charcoal);font-weight:600;font-variant-numeric:tabular-nums">' + r.count + '</td>',
      '</tr>',
    ].join('')).join('');
  }
  return [
    '<div class="card" style="padding:0;overflow:hidden">',
    '<div style="padding:12px 14px;font-size:12px;font-weight:600;color:var(--charcoal);border-bottom:0.5px solid var(--border)">Top Performers</div>',
    '<table style="width:100%;border-collapse:collapse;font-size:12px">',
    '<thead><tr style="background:var(--bg3);border-bottom:0.5px solid var(--border)">',
    '<th style="text-align:left;padding:8px 10px;font-weight:500;color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:.05em">Author</th>',
    '<th style="text-align:right;padding:8px 10px;font-weight:500;color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:.05em">Interactions</th>',
    '</tr></thead>',
    '<tbody>' + body + '</tbody>',
    '</table></div>',
  ].join('');
}

function _crmTopSubjects(stats) {
  const rows = stats.topSubjects;
  let body;
  if (!rows.length) {
    body = '<tr><td colspan="2" style="padding:18px;text-align:center;color:var(--text3);font-size:12px">No subjects yet.</td></tr>';
  } else {
    body = rows.map(r => [
      '<tr style="border-bottom:0.5px solid var(--border)">',
      '<td style="padding:8px 10px;color:var(--charcoal)">' + esc(r.name) + '</td>',
      '<td style="padding:8px 10px;text-align:right;color:var(--charcoal);font-weight:600;font-variant-numeric:tabular-nums">' + r.count + '</td>',
      '</tr>',
    ].join('')).join('');
  }
  return [
    '<div class="card" style="padding:0;overflow:hidden">',
    '<div style="padding:12px 14px;font-size:12px;font-weight:600;color:var(--charcoal);border-bottom:0.5px solid var(--border)">Most Contacted</div>',
    '<table style="width:100%;border-collapse:collapse;font-size:12px">',
    '<thead><tr style="background:var(--bg3);border-bottom:0.5px solid var(--border)">',
    '<th style="text-align:left;padding:8px 10px;font-weight:500;color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:.05em">Customer / Lead</th>',
    '<th style="text-align:right;padding:8px 10px;font-weight:500;color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:.05em">Touches</th>',
    '</tr></thead>',
    '<tbody>' + body + '</tbody>',
    '</table></div>',
  ].join('');
}

function _crmActivityTable(data) {
  const { acts, leadMap, customerMap } = data;
  const recent = acts.slice(0, 50);
  let body;
  if (!recent.length) {
    body = '<tr><td colspan="5" style="padding:18px;text-align:center;color:var(--text3);font-size:12px">No activities in this period.</td></tr>';
  } else {
    body = recent.map(a => {
      const subjName = a.customer_id ? (customerMap[a.customer_id] || '\u2014') : (leadMap[a.lead_id] || '\u2014');
      const subjType = a.customer_id ? 'customer' : 'lead';
      const onclick = a.customer_id
        ? 'Customers.openProfile(\'' + a.customer_id + '\')'
        : 'viewLead(\'' + a.lead_id + '\')';
      const dt = new Date(a.contacted_at);
      const dateStr = dt.toLocaleDateString('en-GB') + ' ' + dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const methodChip = '<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:' + _CRM_METHOD_COLOR[a.method] + ';color:#fff;font-size:10px;font-weight:500">' + (_CRM_METHOD_LABEL[a.method] || a.method) + '</span>';
      const bodyText = (a.body || '').replace(/\s+/g, ' ').slice(0, 110);
      return [
        '<tr style="border-bottom:0.5px solid var(--border);cursor:pointer" onclick="' + onclick + '">',
        '<td style="padding:8px 10px;color:var(--text2);white-space:nowrap;font-variant-numeric:tabular-nums">' + dateStr + '</td>',
        '<td style="padding:8px 10px">' + methodChip + '</td>',
        '<td style="padding:8px 10px;color:var(--charcoal);font-weight:500">' + esc(subjName) + ' <span style="color:var(--text3);font-weight:400;font-size:10px">\u2022 ' + subjType + '</span></td>',
        '<td style="padding:8px 10px;color:var(--text2)">' + esc(a.author_name || '') + '</td>',
        '<td style="padding:8px 10px;color:var(--text2);font-size:11px">' + esc(bodyText) + '</td>',
        '</tr>',
      ].join('');
    }).join('');
  }
  const footer = acts.length > 50
    ? '<div style="padding:10px 12px;font-size:10px;color:var(--text3);background:var(--bg3);border-top:0.5px solid var(--border)">Showing 50 of ' + acts.length + '. Refine the date range to see more detail.</div>'
    : '';
  return [
    '<div>',
    '<div style="color:var(--text3);font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">Activity Log</div>',
    '<div style="background:var(--bg2);border:0.5px solid var(--border);border-radius:8px;overflow:hidden">',
    '<table style="width:100%;border-collapse:collapse;font-size:12px;color:var(--charcoal)">',
    '<thead><tr style="background:var(--bg3);border-bottom:0.5px solid var(--border)">',
    '<th style="text-align:left;padding:8px 10px;font-weight:500;color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:.05em">When</th>',
    '<th style="text-align:left;padding:8px 10px;font-weight:500;color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:.05em">Method</th>',
    '<th style="text-align:left;padding:8px 10px;font-weight:500;color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:.05em">Customer / Lead</th>',
    '<th style="text-align:left;padding:8px 10px;font-weight:500;color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:.05em">Author</th>',
    '<th style="text-align:left;padding:8px 10px;font-weight:500;color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:.05em">Note</th>',
    '</tr></thead>',
    '<tbody>' + body + '</tbody>',
    '</table>',
    footer,
    '</div></div>',
  ].join('');
}

async function exportCrmReportPDF(fromISO, toISO) {
  const el = document.getElementById('crm-report-container');
  if (!el) { toast('No report to export', 'warning'); return; }
  if (typeof html2pdf === 'undefined') { toast('PDF library not loaded', 'error'); return; }
  const projSlug = (currentProject?.name || 'Project').replace(/[^A-Za-z0-9]+/g, '_');
  const filename = 'CRM_Activity_' + projSlug + '_' + fromISO + '_to_' + toISO + '.pdf';
  toast('Generating PDF...', 'info');
  try {
    await html2pdf().set({
      filename: filename,
      margin: [10, 10, 10, 10],
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, backgroundColor: '#FFFEFB' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    }).from(el).save();
    toast('PDF downloaded', 'success');
  } catch (e) {
    toast('PDF export failed: ' + e.message, 'error');
  }
}
