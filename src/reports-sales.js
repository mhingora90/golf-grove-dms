// REPORTS — Sales & CRM

function _openSalesReport() {
  const now = new Date();
  renderSalesReport(now.getFullYear(), now.getMonth() + 1);
}

async function _fetchSalesData(projectId) {
  const [leads, acts, units] = await Promise.all([
    sb.from('crm_leads').select('*').eq('project_id', projectId),
    sb.from('crm_lead_activities').select('*'),
    sb.from('units').select('*').eq('project_id', projectId),
  ]);
  const leadIds = new Set((leads.data || []).map(l => l.id));
  const actsScoped = (acts.data || []).filter(a => leadIds.has(a.lead_id));
  return { leads: leads.data || [], acts: actsScoped, units: units.data || [] };
}

const _STAGE_ORDER = ['new','contacted','qualified','proposal','negotiation','closed_won','closed_lost'];
const _STAGE_LABEL = { new:'New', contacted:'Contacted', qualified:'Qualified', proposal:'Proposal', negotiation:'Negotiation', closed_won:'Closed Won', closed_lost:'Closed Lost' };
const _UNIT_STATUS_ORDER = ['available','reserved','sold','booked','held'];
const _UNIT_STATUS_LABEL = { available:'Available', reserved:'Reserved', sold:'Sold', booked:'Booked', held:'Held' };
const _UNIT_STATUS_COLOR = { available:'var(--green)', reserved:'var(--sand)', sold:'var(--blue)', booked:'var(--amber)', held:'var(--text3)' };

function _inMonthS(dt, y, m) {
  if (!dt) return false;
  const d = new Date(dt);
  return d.getFullYear() === y && (d.getMonth() + 1) === m;
}

function _sCalcStats(data, year, month) {
  const { leads, acts, units } = data;

  const totalLeads = leads.length;
  const closedWon  = leads.filter(l => l.stage === 'closed_won').length;
  const closedLost = leads.filter(l => l.stage === 'closed_lost').length;
  const closedTotal = closedWon + closedLost;
  const activePipeline = totalLeads - closedWon - closedLost;
  const conversionRate = closedTotal > 0 ? Math.round((closedWon / closedTotal) * 100) : 0;

  const soldStatuses = new Set(['sold','booked','reserved']);
  const unitsSold = units.filter(u => soldStatuses.has(u.sale_status)).length;
  const totalUnits = units.length;

  const revenueBooked = units
    .filter(u => soldStatuses.has(u.sale_status))
    .reduce((s,u) => s + (Number(u.listed_price) || 0), 0);

  const wonLeads = leads.filter(l => l.stage === 'closed_won' && l.created_at && l.updated_at);
  const cycleDays = wonLeads.length > 0
    ? Math.round(wonLeads.reduce((s,l) => s + Math.max(0, (new Date(l.updated_at) - new Date(l.created_at)) / 86400000), 0) / wonLeads.length)
    : 0;

  const periodNewLeads = leads.filter(l => _inMonthS(l.created_at, year, month)).length;
  const periodActs     = acts.filter(a => _inMonthS(a.contacted_at || a.created_at, year, month)).length;
  const periodUnitsSold = units.filter(u => soldStatuses.has(u.sale_status) && _inMonthS(u.created_at, year, month)).length;
  const periodRevenue  = units
    .filter(u => soldStatuses.has(u.sale_status) && _inMonthS(u.created_at, year, month))
    .reduce((s,u) => s + (Number(u.listed_price) || 0), 0);

  const priorY = month === 1 ? year - 1 : year;
  const priorM = month === 1 ? 12 : month - 1;
  const priorNewLeads = leads.filter(l => _inMonthS(l.created_at, priorY, priorM)).length;
  const priorActs     = acts.filter(a => _inMonthS(a.contacted_at || a.created_at, priorY, priorM)).length;
  const priorUnitsSold = units.filter(u => soldStatuses.has(u.sale_status) && _inMonthS(u.created_at, priorY, priorM)).length;
  const priorRevenue  = units
    .filter(u => soldStatuses.has(u.sale_status) && _inMonthS(u.created_at, priorY, priorM))
    .reduce((s,u) => s + (Number(u.listed_price) || 0), 0);

  const stageCounts = {};
  _STAGE_ORDER.forEach(s => stageCounts[s] = 0);
  leads.forEach(l => { if (stageCounts[l.stage] !== undefined) stageCounts[l.stage]++; });

  const sourceMap = {};
  leads.forEach(l => {
    const src = l.source || 'Unknown';
    if (!sourceMap[src]) sourceMap[src] = { source: src, total: 0, won: 0, lost: 0, active: 0 };
    sourceMap[src].total++;
    if (l.stage === 'closed_won')      sourceMap[src].won++;
    else if (l.stage === 'closed_lost') sourceMap[src].lost++;
    else                                sourceMap[src].active++;
  });
  const sourceRows = Object.values(sourceMap)
    .map(r => Object.assign({}, r, { convRate: (r.won + r.lost) > 0 ? Math.round((r.won / (r.won + r.lost)) * 100) : 0 }))
    .sort((a,b) => b.total - a.total);

  const unitStatusMap = {};
  _UNIT_STATUS_ORDER.forEach(s => unitStatusMap[s] = 0);
  units.forEach(u => {
    const k = (u.sale_status || 'available').toLowerCase();
    unitStatusMap[k] = (unitStatusMap[k] || 0) + 1;
  });

  const trend = [];
  const monthLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  for (let i = 5; i >= 0; i--) {
    let y = year, m = month - i;
    while (m <= 0) { m += 12; y -= 1; }
    const newL = leads.filter(l => _inMonthS(l.created_at, y, m)).length;
    const sold = units.filter(u => soldStatuses.has(u.sale_status) && _inMonthS(u.created_at, y, m)).length;
    trend.push({ label: monthLabels[m - 1], newLeads: newL, sold });
  }

  return {
    totalLeads, activePipeline, conversionRate, unitsSold, totalUnits, revenueBooked, cycleDays,
    periodNewLeads, periodActs, periodUnitsSold, periodRevenue,
    priorNewLeads, priorActs, priorUnitsSold, priorRevenue,
    stageCounts, sourceRows, unitStatusMap, trend,
  };
}

async function renderSalesReport(year, month) {
  const mm = String(month).padStart(2, '0');
  if (location.hash !== '#reports-sales/' + year + '-' + mm) {
    history.replaceState(null, '', '#reports-sales/' + year + '-' + mm);
  }
  currentPage = 'reports-sales';
  document.getElementById('page-title').textContent = PAGE_TITLES['reports-sales'];
  const el = document.getElementById('content');
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Loading...</div>';
  const data = await _fetchSalesData(currentProject.id);
  const stats = _sCalcStats(data, year, month);
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const curYear = new Date().getFullYear();
  const yearOpts  = [curYear-2,curYear-1,curYear,curYear+1,curYear+2]
    .map(y => '<option value="' + y + '"' + (y === year ? ' selected' : '') + '>' + y + '</option>').join('');
  const monthOpts = months
    .map((m, i) => '<option value="' + (i + 1) + '"' + (i + 1 === month ? ' selected' : '') + '>' + m + '</option>').join('');
  const container = document.createElement('div');
  container.id = 'sales-report-container';
  container.style.cssText = 'padding-bottom:32px';
  container.innerHTML = _sBuildHTML(stats, year, month, months, yearOpts, monthOpts);
  el.innerHTML = '';
  el.appendChild(container);
}

function _sFmtAED(n) {
  if (!n) return 'AED 0';
  if (n >= 1e9) return 'AED ' + (n/1e9).toFixed(2) + 'B';
  if (n >= 1e6) return 'AED ' + (n/1e6).toFixed(2) + 'M';
  if (n >= 1e3) return 'AED ' + (n/1e3).toFixed(0) + 'k';
  return 'AED ' + n.toFixed(0);
}

function _sDelta(current, prior, invertColor) {
  const diff = current - prior;
  if (diff === 0) return '<div style="color:var(--text3);font-size:10px;margin-top:2px">no change</div>';
  const goodDirection = invertColor ? diff < 0 : diff > 0;
  const color = goodDirection ? 'var(--green)' : 'var(--amber)';
  const arrow = diff > 0 ? '&#8593;' : '&#8595;';
  const sign  = diff > 0 ? '+' : '';
  return '<div style="color:' + color + ';font-size:10px;margin-top:2px">' + arrow + ' ' + sign + Math.abs(diff) + '</div>';
}

function _sBuildHTML(stats, year, month, months, yearOpts, monthOpts) {
  const rptYear  = "document.getElementById('rpt-s-year').value";
  const rptMonth = "document.getElementById('rpt-s-month').value";
  const projName = (currentProject && currentProject.name) ? currentProject.name : '';
  const header = [
    '<div style="padding:20px 24px 0;display:flex;flex-direction:column;gap:14px">',
    '<div style="display:flex;align-items:center;gap:6px">',
    '<a href="#" onclick="nav(\'reports\', document.getElementById(\'n-reports\'));return false" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:500;color:var(--text3);text-decoration:none;padding:4px 8px;border-radius:6px;background:var(--bg3);border:0.5px solid var(--border)">',
    '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8 2L4 6l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'All Reports</a>',
    '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="#B4A88C" stroke-width="1.2" stroke-linecap="round"/></svg>',
    '<span style="font-size:11px;color:var(--text2);font-weight:500">Sales &amp; CRM Report</span>',
    '</div>',
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">',
    '<div>',
    '<h1 style="margin:0 0 2px;font-size:18px;font-weight:600;color:var(--charcoal);letter-spacing:-.3px">Sales &amp; CRM MIS Report</h1>',
    '<div style="font-size:12px;color:var(--text3)">' + projName + '</div>',
    '</div>',
    '<button class="btn btn-sm btn-secondary" style="flex-shrink:0;margin-top:2px" onclick="exportSalesReportPDF(' + year + ',' + month + ')">',
    '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="margin-right:4px"><path d="M6 2v6M3 6l3 3 3-3M2 10h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'Export PDF</button>',
    '</div>',
    '<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--bg3);border:0.5px solid var(--border);border-radius:8px">',
    '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1.5" y="2.5" width="10" height="9" rx="1.5" stroke="#B4A88C" stroke-width="1.1"/><path d="M4 1.5v2M9 1.5v2M1.5 5.5h10" stroke="#B4A88C" stroke-width="1.1" stroke-linecap="round"/></svg>',
    '<span style="font-size:11px;font-weight:500;color:var(--text2)">Period</span>',
    '<select id="rpt-s-month" class="filter-sel" onchange="renderSalesReport(+' + rptYear + ',+this.value)">' + monthOpts + '</select>',
    '<select id="rpt-s-year"  class="filter-sel" onchange="renderSalesReport(+this.value,+' + rptMonth + ')">' + yearOpts + '</select>',
    '<span style="margin-left:auto;font-size:10px;color:var(--text3)">Generated ' + new Date().toLocaleDateString('en-GB') + '</span>',
    '</div>',
    '</div>',
  ].join('');
  const sections = [
    '<div style="padding:0 24px;display:flex;flex-direction:column;gap:16px;margin-top:16px">',
    _sSummary(stats, year, month, months),
    _sCumulativeKPIs(stats),
    _sPeriodKPIs(stats, year, month, months),
    _sFunnel(stats),
    _sCharts(stats),
    _sSourceTable(stats),
    '</div>',
  ].join('');
  return header + sections;
}

function _sSummary(stats, year, month, months) {
  const { totalLeads, activePipeline, conversionRate, unitsSold, totalUnits, revenueBooked } = stats;
  return [
    '<div style="background:var(--green-bg);border-left:3px solid var(--green);border-radius:0 8px 8px 0;padding:14px 18px">',
    '<div style="color:var(--green);font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px">Executive Summary</div>',
    '<p style="color:var(--charcoal);font-size:13px;line-height:1.75;margin:0">',
    'As of ' + months[month - 1] + ' ' + year + ', the project has <strong>' + totalLeads + ' lead' + (totalLeads === 1 ? '' : 's') + '</strong> ',
    'with <strong>' + activePipeline + ' active in pipeline</strong> and a <strong>' + conversionRate + '% conversion rate</strong>. ',
    unitsSold + ' of ' + totalUnits + ' units booked or sold, generating <strong>' + _sFmtAED(revenueBooked) + '</strong> in revenue to date.',
    '</p></div>',
  ].join('');
}

function _sCumulativeKPIs(stats) {
  const { totalLeads, activePipeline, conversionRate, unitsSold, totalUnits, revenueBooked, cycleDays } = stats;
  return [
    '<div>',
    '<div style="color:var(--text3);font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">Project to Date (Cumulative)</div>',
    '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px">',
    _kpiTile('Total Leads',      String(totalLeads),            'var(--charcoal)', ''),
    _kpiTile('Active Pipeline',  String(activePipeline),        'var(--sand)',     ''),
    _kpiTile('Conversion Rate',  conversionRate + '%',          'var(--green)',    ''),
    _kpiTile('Units Sold',       unitsSold + ' / ' + totalUnits,'var(--blue)',     ''),
    _kpiTile('Revenue Booked',   _sFmtAED(revenueBooked),       'var(--green)',    ''),
    _kpiTile('Avg Sale Cycle',   cycleDays + 'd',               'var(--charcoal)', ''),
    '</div></div>',
  ].join('');
}

function _sPeriodKPIs(stats, year, month, months) {
  const { periodNewLeads, periodActs, periodUnitsSold, periodRevenue,
          priorNewLeads, priorActs, priorUnitsSold, priorRevenue } = stats;
  return [
    '<div>',
    '<div style="color:var(--text3);font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">This Period &mdash; ' + months[month - 1] + ' ' + year + '</div>',
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">',
    _kpiTile('New Leads',        String(periodNewLeads), 'var(--sand)',     _sDelta(periodNewLeads, priorNewLeads, false)),
    _kpiTile('Activities Logged', String(periodActs),    'var(--charcoal)', _sDelta(periodActs, priorActs, false)),
    _kpiTile('Units Sold',       String(periodUnitsSold),'var(--blue)',     _sDelta(periodUnitsSold, priorUnitsSold, false)),
    _kpiTile('Revenue Booked',   _sFmtAED(periodRevenue),'var(--green)',    _sDelta(periodRevenue, priorRevenue, false)),
    '</div></div>',
  ].join('');
}

function _sFunnel(stats) {
  const { stageCounts } = stats;
  const max = Math.max(1, ..._STAGE_ORDER.map(s => stageCounts[s] || 0));
  const colors = { new:'var(--sand)', contacted:'var(--blue)', qualified:'var(--green-light)', proposal:'var(--green)', negotiation:'var(--amber)', closed_won:'var(--green)', closed_lost:'var(--text3)' };
  const rows = _STAGE_ORDER.map(s => {
    const n = stageCounts[s] || 0;
    const widthPct = (n / max) * 100;
    return [
      '<div style="display:flex;align-items:center;gap:10px;font-size:11px">',
      '<div style="width:100px;color:var(--charcoal);font-weight:500">' + _STAGE_LABEL[s] + '</div>',
      '<div style="flex:1;height:18px;background:var(--bg3);border-radius:6px;overflow:hidden">',
      '<div style="width:' + widthPct + '%;height:100%;background:' + colors[s] + '"></div>',
      '</div>',
      '<div style="width:32px;text-align:right;color:var(--charcoal);font-variant-numeric:tabular-nums;font-weight:600">' + n + '</div>',
      '</div>',
    ].join('');
  }).join('');
  return [
    '<div class="card" style="padding:14px">',
    '<div style="font-size:12px;font-weight:600;color:var(--charcoal);margin-bottom:12px">Lead Pipeline Funnel</div>',
    '<div style="display:flex;flex-direction:column;gap:8px">' + rows + '</div>',
    '</div>',
  ].join('');
}

function _sUnitStatusChart(stats) {
  const { unitStatusMap } = stats;
  const total = _UNIT_STATUS_ORDER.reduce((s,k) => s + (unitStatusMap[k] || 0), 0);
  if (total === 0) {
    return [
      '<div class="card" style="padding:14px">',
      '<div style="font-size:12px;font-weight:600;color:var(--charcoal);margin-bottom:12px">Unit Status</div>',
      '<div style="text-align:center;color:var(--text3);font-size:12px;padding:24px 0">No units in this project.</div>',
      '</div>',
    ].join('');
  }
  const segs = _UNIT_STATUS_ORDER.filter(k => unitStatusMap[k] > 0).map(k => {
    const pct = (unitStatusMap[k] / total) * 100;
    return '<div title="' + _UNIT_STATUS_LABEL[k] + ': ' + unitStatusMap[k] + '" style="width:' + pct + '%;background:' + _UNIT_STATUS_COLOR[k] + '"></div>';
  }).join('');
  const legend = _UNIT_STATUS_ORDER.filter(k => unitStatusMap[k] > 0).map(k =>
    '<div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text2)">' +
      '<div style="width:9px;height:9px;background:' + _UNIT_STATUS_COLOR[k] + ';border-radius:2px"></div>' +
      _UNIT_STATUS_LABEL[k] + ' <span style="color:var(--text3);font-variant-numeric:tabular-nums">' + unitStatusMap[k] + '</span>' +
    '</div>'
  ).join('');
  return [
    '<div class="card" style="padding:14px">',
    '<div style="font-size:12px;font-weight:600;color:var(--charcoal);margin-bottom:12px">Unit Status</div>',
    '<div style="height:20px;background:var(--bg3);border-radius:6px;overflow:hidden;display:flex">' + segs + '</div>',
    '<div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:12px">' + legend + '</div>',
    '</div>',
  ].join('');
}

function _sTrendChart(stats) {
  const months = stats.trend;
  const allVals = [];
  months.forEach(m => { allVals.push(m.newLeads); allVals.push(m.sold); });
  const maxVal = Math.max(1, ...allVals);
  const W = 320, H = 140, PAD_L = 24, PAD_B = 24, PAD_T = 10, PAD_R = 8;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const groupW = innerW / months.length;
  const barW = Math.max(6, (groupW * 0.4));

  const bars = months.map((m, i) => {
    const xL = PAD_L + groupW * i + (groupW - barW * 2 - 2) / 2;
    const xS = xL + barW + 2;
    const hL = (m.newLeads / maxVal) * innerH;
    const hS = (m.sold / maxVal) * innerH;
    const yL = PAD_T + innerH - hL;
    const yS = PAD_T + innerH - hS;
    return [
      hL > 0 ? '<rect x="' + xL + '" y="' + yL + '" width="' + barW + '" height="' + hL + '" fill="var(--sand)"/>' : '',
      hS > 0 ? '<rect x="' + xS + '" y="' + yS + '" width="' + barW + '" height="' + hS + '" fill="var(--blue)"/>' : '',
      '<text x="' + (xL + barW + 1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="9" fill="var(--text3)">' + m.label + '</text>',
    ].join('');
  }).join('');

  const axis = '<line x1="' + PAD_L + '" y1="' + (PAD_T + innerH) + '" x2="' + (W - PAD_R) + '" y2="' + (PAD_T + innerH) + '" stroke="var(--border)" stroke-width="0.5"/>';

  return [
    '<div class="card" style="padding:14px">',
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">',
    '<div style="font-size:12px;font-weight:600;color:var(--charcoal)">Leads vs Sales \u2014 6 Month Trend</div>',
    '<div style="display:flex;gap:10px">',
    '<div style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text2)"><div style="width:8px;height:8px;background:var(--sand);border-radius:2px"></div>Leads In</div>',
    '<div style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text2)"><div style="width:8px;height:8px;background:var(--blue);border-radius:2px"></div>Units Sold</div>',
    '</div></div>',
    '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block">' + axis + bars + '</svg>',
    '</div>',
  ].join('');
}

function _sCharts(stats) {
  return [
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">',
    _sUnitStatusChart(stats),
    _sTrendChart(stats),
    '</div>',
  ].join('');
}

function _sSourceTable(stats) {
  const { sourceRows } = stats;
  const th  = label => '<th style="text-align:right;padding:8px 10px;font-weight:500;color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:.05em">' + label + '</th>';
  const thL = label => '<th style="text-align:left;padding:8px 10px;font-weight:500;color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:.05em">' + label + '</th>';
  let rowsHTML;
  if (!sourceRows.length) {
    rowsHTML = '<tr><td colspan="5" style="padding:18px;text-align:center;color:var(--text3);font-size:12px">No lead sources yet.</td></tr>';
  } else {
    rowsHTML = sourceRows.map(r => [
      '<tr style="border-bottom:0.5px solid var(--border)">',
      '<td style="padding:8px 10px;font-weight:500;color:var(--charcoal)">' + r.source + '</td>',
      '<td style="padding:8px 10px;text-align:right;color:var(--text2)">' + r.total + '</td>',
      '<td style="padding:8px 10px;text-align:right;color:var(--sand)">' + r.active + '</td>',
      '<td style="padding:8px 10px;text-align:right;color:var(--green)">' + r.won + '</td>',
      '<td style="padding:8px 10px;text-align:right;color:var(--charcoal);font-weight:600">' + r.convRate + '%</td>',
      '</tr>',
    ].join('')).join('');
  }
  return [
    '<div>',
    '<div style="color:var(--text3);font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">Lead Source Breakdown</div>',
    '<div style="background:var(--bg2);border:0.5px solid var(--border);border-radius:8px;overflow:hidden">',
    '<table style="width:100%;border-collapse:collapse;font-size:12px;color:var(--charcoal)">',
    '<thead><tr style="background:var(--bg3);border-bottom:0.5px solid var(--border)">',
    thL('Source') + th('Total') + th('Active') + th('Won') + th('Conversion %'),
    '</tr></thead>',
    '<tbody>' + rowsHTML + '</tbody>',
    '</table></div></div>',
  ].join('');
}

async function exportSalesReportPDF(year, month) {
  const el = document.getElementById('sales-report-container');
  if (!el) { toast('No report to export', 'warning'); return; }
  if (typeof html2pdf === 'undefined') { toast('PDF library not loaded', 'error'); return; }
  const ym = year + '-' + String(month).padStart(2, '0');
  const projSlug = (currentProject?.name || 'Project').replace(/[^A-Za-z0-9]+/g, '_');
  const filename = 'Sales_MIS_' + projSlug + '_' + ym + '.pdf';
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
