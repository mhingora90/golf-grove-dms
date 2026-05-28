// QUALITY & SITE MIS REPORT

function _openQualityReport() {
  const now = new Date();
  renderQualityReport(now.getFullYear(), now.getMonth() + 1);
}

async function _fetchQualityData(projectId) {
  const [ncrs, insp, punch, rfis] = await Promise.all([
    sb.from('ncrs').select('*').eq('project_id', projectId),
    sb.from('inspections').select('*').eq('project_id', projectId),
    sb.from('punch_list').select('*').eq('project_id', projectId),
    sb.from('rfis').select('*').eq('project_id', projectId),
  ]);
  return { ncrs: ncrs.data || [], insp: insp.data || [], punch: punch.data || [], rfis: rfis.data || [] };
}

const _DISC_ORDER = ['Structural','Architecture','MEP','Electrical','Plumbing','Fire','Civil','Unassigned'];
const _DEPT_PRIORITY = ['structural','arch','mep','elec','plumb','fire','civil'];
const _DEPT_LABEL = { structural:'Structural', arch:'Architecture', mep:'MEP', elec:'Electrical', plumb:'Plumbing', fire:'Fire', civil:'Civil' };

function _irDiscipline(ir) {
  const d = (ir && typeof ir.department === 'object') ? ir.department : null;
  if (!d) return 'Unassigned';
  for (const key of _DEPT_PRIORITY) if (d[key]) return _DEPT_LABEL[key];
  return 'Unassigned';
}

function _ncrDiscipline(n) {
  if (n.discipline && typeof n.discipline === 'string') return n.discipline;
  return 'Unassigned';
}

function _punchDiscipline(p) { return p.discipline || 'Unassigned'; }

function _inMonth(dateStr, year, month) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d.getFullYear() === year && (d.getMonth() + 1) === month;
}

function _priorMonthEnd(year, month) {
  const d = new Date(year, month - 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
}

function _isOpenAsOf(item, raisedField, closedField, asOfDate) {
  const raised = item[raisedField] ? new Date(item[raisedField]) : (item.created_at ? new Date(item.created_at) : null);
  if (!raised || raised > asOfDate) return false;
  const closed = item[closedField] ? new Date(item[closedField]) : null;
  return !closed || closed > asOfDate;
}

function _ageDays(dateStr) {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function _agingBucket(age) {
  if (age <= 30) return 0;
  if (age <= 60) return 1;
  if (age <= 90) return 2;
  return 3;
}

function _calcQualityStats(data, year, month) {
  const { ncrs, insp, punch, rfis } = data;
  const todayStr = new Date().toISOString().split('T')[0];
  const priorEnd = _priorMonthEnd(year, month);

  const openNCRs   = ncrs.filter(n  => n.status === 'Open').length;
  const openIRs    = insp.filter(i  => i.status === 'Pending').length;
  const openPunch  = punch.filter(p => p.status === 'Open').length;
  const openRFIs   = rfis.filter(r  => r.status === 'Open').length;

  const closedNCRs = ncrs.filter(n => n.status === 'Closed').length;
  const totalNCRs  = ncrs.length;
  const ncrClosureRate = totalNCRs > 0 ? Math.round((closedNCRs / totalNCRs) * 100) : 0;

  const approvedIRs = insp.filter(i => ['Approved','Approved as Noted'].includes(i.status)).length;
  const rejectedIRs = insp.filter(i => ['Rejected','Correction','Re-Inspection'].includes(i.status)).length;
  const irApprovalRate = (approvedIRs + rejectedIRs) > 0
    ? Math.round((approvedIRs / (approvedIRs + rejectedIRs)) * 100) : 0;

  const priorOpenNCRs  = ncrs.filter(n  => _isOpenAsOf(n, 'raised_date',  'closed_date', priorEnd)).length;
  const priorOpenIRs   = insp.filter(i  => _isOpenAsOf(i, 'request_date', 'closed_date', priorEnd)).length;
  const priorOpenPunch = punch.filter(p => _isOpenAsOf(p, 'created_at',   'closed_date', priorEnd)).length;
  const priorOpenRFIs  = rfis.filter(r  => _isOpenAsOf(r, 'created_at',   'closed_date', priorEnd)).length;

  const periodNCRs  = ncrs.filter(n  => _inMonth(n.raised_date  || n.created_at, year, month)).length;
  const periodIRs   = insp.filter(i  => _inMonth(i.request_date || i.created_at, year, month)).length;
  const periodPunch = punch.filter(p => _inMonth(p.created_at, year, month)).length;
  const periodRFIs  = rfis.filter(r  => _inMonth(r.created_at, year, month)).length;

  const priorY = month === 1 ? year - 1 : year;
  const priorM = month === 1 ? 12 : month - 1;
  const priorPeriodNCRs  = ncrs.filter(n  => _inMonth(n.raised_date  || n.created_at, priorY, priorM)).length;
  const priorPeriodIRs   = insp.filter(i  => _inMonth(i.request_date || i.created_at, priorY, priorM)).length;
  const priorPeriodPunch = punch.filter(p => _inMonth(p.created_at, priorY, priorM)).length;
  const priorPeriodRFIs  = rfis.filter(r  => _inMonth(r.created_at, priorY, priorM)).length;

  const overdueNCR  = ncrs.filter(n  => n.status === 'Open'    && n.due_date && n.due_date  < todayStr).length;
  const overdueIR   = insp.filter(i  => i.status === 'Pending' && i.due_date && i.due_date  < todayStr).length;
  const overdueRFI  = rfis.filter(r  => r.status === 'Open'    && r.due_date && r.due_date  < todayStr).length;
  const overdueCount = overdueNCR + overdueIR + overdueRFI;

  const discMap = {};
  const ensure = key => {
    if (!discMap[key]) discMap[key] = { discipline: key, ncrOpen: 0, ncrClosed: 0, irOpen: 0, irApproved: 0, irRejected: 0, punchOpen: 0, punchClosed: 0 };
    return discMap[key];
  };
  ncrs.forEach(n => {
    const k = _ncrDiscipline(n);
    if (n.status === 'Open') ensure(k).ncrOpen++;
    else if (n.status === 'Closed') ensure(k).ncrClosed++;
  });
  insp.forEach(i => {
    const k = _irDiscipline(i);
    if (i.status === 'Pending') ensure(k).irOpen++;
    else if (['Approved','Approved as Noted'].includes(i.status)) ensure(k).irApproved++;
    else if (['Rejected','Correction','Re-Inspection'].includes(i.status)) ensure(k).irRejected++;
  });
  punch.forEach(p => {
    const k = _punchDiscipline(p);
    if (p.status === 'Open') ensure(k).punchOpen++;
    else if (p.status === 'Closed') ensure(k).punchClosed++;
  });
  const disciplineRows = _DISC_ORDER
    .filter(d => discMap[d])
    .concat(Object.keys(discMap).filter(d => !_DISC_ORDER.includes(d)))
    .map(d => {
      const r = discMap[d];
      const irTotal = r.irApproved + r.irRejected;
      return Object.assign({}, r, { irApprovalRate: irTotal > 0 ? Math.round((r.irApproved / irTotal) * 100) : 0 });
    });

  const blankBuckets = () => [0, 0, 0, 0];
  const agingBuckets = { ncr: blankBuckets(), ir: blankBuckets(), punch: blankBuckets(), rfi: blankBuckets() };
  ncrs.filter(n => n.status === 'Open').forEach(n => agingBuckets.ncr[_agingBucket(_ageDays(n.raised_date || n.created_at))]++);
  insp.filter(i => i.status === 'Pending').forEach(i => agingBuckets.ir[_agingBucket(_ageDays(i.request_date || i.created_at))]++);
  punch.filter(p => p.status === 'Open').forEach(p => agingBuckets.punch[_agingBucket(_ageDays(p.created_at))]++);
  rfis.filter(r => r.status === 'Open').forEach(r => agingBuckets.rfi[_agingBucket(_ageDays(r.created_at))]++);

  const severityTrend = [];
  const monthLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  for (let i = 5; i >= 0; i--) {
    let y = year, m = month - i;
    while (m <= 0) { m += 12; y -= 1; }
    const inThis = ncrs.filter(n => _inMonth(n.raised_date || n.created_at, y, m));
    const minor = inThis.filter(n => (n.severity || 'Minor') !== 'Major').length;
    const major = inThis.filter(n => n.severity === 'Major').length;
    severityTrend.push({ month: y + '-' + String(m).padStart(2, '0'), label: monthLabels[m - 1], minor, major });
  }

  return {
    openNCRs, ncrClosureRate, openIRs, irApprovalRate, openPunch, openRFIs,
    priorOpenNCRs, priorOpenIRs, priorOpenPunch, priorOpenRFIs,
    periodIRs, periodNCRs, periodPunch, periodRFIs,
    priorPeriodIRs, priorPeriodNCRs, priorPeriodPunch, priorPeriodRFIs,
    overdueCount, disciplineRows, agingBuckets, severityTrend,
  };
}

async function renderQualityReport(year, month) {
  const mm = String(month).padStart(2, '0');
  if (location.hash !== '#reports-quality/' + year + '-' + mm) {
    history.replaceState(null, '', '#reports-quality/' + year + '-' + mm);
  }
  currentPage = 'reports-quality';
  document.getElementById('page-title').textContent = PAGE_TITLES['reports-quality'];
  const el = document.getElementById('content');
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Loading...</div>';
  const data = await _fetchQualityData(currentProject.id);
  const stats = _calcQualityStats(data, year, month);
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const curYear = new Date().getFullYear();
  const yearOpts  = [curYear-2,curYear-1,curYear,curYear+1,curYear+2]
    .map(y => '<option value="' + y + '"' + (y === year ? ' selected' : '') + '>' + y + '</option>').join('');
  const monthOpts = months
    .map((m, i) => '<option value="' + (i + 1) + '"' + (i + 1 === month ? ' selected' : '') + '>' + m + '</option>').join('');
  const container = document.createElement('div');
  container.id = 'quality-report-container';
  container.style.cssText = 'padding-bottom:32px';
  container.innerHTML = buildQualityReportHTML(stats, year, month, months, yearOpts, monthOpts);
  el.innerHTML = '';
  el.appendChild(container);
}

function buildQualityReportHTML(stats, year, month, months, yearOpts, monthOpts) {
  const rptYear  = "document.getElementById('rpt-q-year').value";
  const rptMonth = "document.getElementById('rpt-q-month').value";
  const projName = (currentProject && currentProject.name) ? currentProject.name : '';
  const header = [
    '<div style="padding:20px 24px 0;display:flex;flex-direction:column;gap:14px">',
    '<div style="display:flex;align-items:center;gap:6px">',
    '<a href="#" onclick="nav(\'reports\', document.getElementById(\'n-reports\'));return false" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:500;color:var(--text3);text-decoration:none;padding:4px 8px;border-radius:6px;background:var(--bg3);border:0.5px solid var(--border);transition:color .15s"',
    ' onmouseover="this.style.color=\'var(--charcoal)\'" onmouseout="this.style.color=\'var(--text3)\'">',
    '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8 2L4 6l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'All Reports</a>',
    '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="#B4A88C" stroke-width="1.2" stroke-linecap="round"/></svg>',
    '<span style="font-size:11px;color:var(--text2);font-weight:500">Quality &amp; Site Report</span>',
    '</div>',
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">',
    '<div>',
    '<h1 style="margin:0 0 2px;font-size:18px;font-weight:600;color:var(--charcoal);letter-spacing:-.3px">Quality &amp; Site MIS Report</h1>',
    '<div style="font-size:12px;color:var(--text3)">' + projName + '</div>',
    '</div>',
    '<button class="btn btn-sm btn-secondary" style="flex-shrink:0;margin-top:2px" onclick="exportQualityReportPDF(' + year + ',' + month + ')">',
    '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="margin-right:4px"><path d="M6 2v6M3 6l3 3 3-3M2 10h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'Export PDF</button>',
    '</div>',
    '<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--bg3);border:0.5px solid var(--border);border-radius:8px">',
    '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1.5" y="2.5" width="10" height="9" rx="1.5" stroke="#B4A88C" stroke-width="1.1"/><path d="M4 1.5v2M9 1.5v2M1.5 5.5h10" stroke="#B4A88C" stroke-width="1.1" stroke-linecap="round"/></svg>',
    '<span style="font-size:11px;font-weight:500;color:var(--text2)">Period</span>',
    '<select id="rpt-q-month" class="filter-sel" onchange="renderQualityReport(+' + rptYear + ',+this.value)">' + monthOpts + '</select>',
    '<select id="rpt-q-year"  class="filter-sel" onchange="renderQualityReport(+this.value,+' + rptMonth + ')">' + yearOpts + '</select>',
    '<span style="margin-left:auto;font-size:10px;color:var(--text3)">Generated ' + new Date().toLocaleDateString('en-GB') + '</span>',
    '</div>',
    '</div>',
  ].join('');
  const sections = [
    '<div style="padding:0 24px;display:flex;flex-direction:column;gap:16px;margin-top:16px">',
    _qualitySummaryNarrative(stats, year, month, months),
    _qualityCumulativeKPIs(stats),
    _qualityPeriodKPIs(stats, year, month, months),
    _qualityDisciplineTable(stats),
    _qualityCharts(stats),
    '</div>',
  ].join('');
  return header + sections;
}

function _qualitySummaryNarrative(stats, year, month, months) {
  const { openNCRs, ncrClosureRate, openIRs, irApprovalRate, openPunch, openRFIs, overdueCount } = stats;
  const overdueLine = overdueCount > 0
    ? '<strong>' + overdueCount + ' item' + (overdueCount === 1 ? '' : 's') + '</strong> past due date.'
    : 'No items past due.';
  return [
    '<div style="background:var(--green-bg);border-left:3px solid var(--green);border-radius:0 8px 8px 0;padding:14px 18px">',
    '<div style="color:var(--green);font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px">Executive Summary</div>',
    '<p style="color:var(--charcoal);font-size:13px;line-height:1.75;margin:0">',
    'As of ' + months[month - 1] + ' ' + year + ', the project has <strong>' + openNCRs + ' open NCR' + (openNCRs === 1 ? '' : 's') + '</strong> ',
    'with a <strong>' + ncrClosureRate + '% closure rate</strong>. ',
    openIRs + ' inspection request' + (openIRs === 1 ? '' : 's') + ' pending, ',
    irApprovalRate + '% IR approval rate to date. ',
    openPunch + ' punch item' + (openPunch === 1 ? '' : 's') + ' and ' + openRFIs + ' RFI' + (openRFIs === 1 ? '' : 's') + ' remain open. ',
    overdueLine,
    '</p></div>',
  ].join('');
}

function _qDelta(current, prior, invertColor) {
  const diff = current - prior;
  if (diff === 0) return '<div style="color:var(--text3);font-size:10px;margin-top:2px">no change</div>';
  const goodDirection = invertColor ? diff < 0 : diff > 0;
  const color = goodDirection ? 'var(--green)' : 'var(--amber)';
  const arrow = diff > 0 ? '&#8593;' : '&#8595;';
  const sign  = diff > 0 ? '+' : '&minus;';
  return '<div style="color:' + color + ';font-size:10px;margin-top:2px">' + arrow + ' ' + sign + Math.abs(diff) + '</div>';
}

function _qualityCumulativeKPIs(stats) {
  const { openNCRs, ncrClosureRate, openIRs, irApprovalRate, openPunch, openRFIs,
          priorOpenNCRs, priorOpenIRs, priorOpenPunch, priorOpenRFIs } = stats;
  return [
    '<div>',
    '<div style="color:var(--text3);font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">Project to Date (Cumulative)</div>',
    '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px">',
    _kpiTile('Open NCRs',          String(openNCRs),       openNCRs > 0 ? 'var(--amber)' : 'var(--charcoal)', _qDelta(openNCRs, priorOpenNCRs, true)),
    _kpiTile('NCR Closure Rate',   ncrClosureRate + '%',   'var(--green)', ''),
    _kpiTile('Open IRs',           String(openIRs),        openIRs > 0 ? 'var(--amber)' : 'var(--charcoal)', _qDelta(openIRs, priorOpenIRs, true)),
    _kpiTile('IR Approval Rate',   irApprovalRate + '%',   'var(--green)', ''),
    _kpiTile('Open Punch',         String(openPunch),      openPunch > 0 ? 'var(--amber)' : 'var(--charcoal)', _qDelta(openPunch, priorOpenPunch, true)),
    _kpiTile('Open RFIs',          String(openRFIs),       openRFIs > 0 ? 'var(--amber)' : 'var(--charcoal)', _qDelta(openRFIs, priorOpenRFIs, true)),
    '</div></div>',
  ].join('');
}

function _qualityPeriodKPIs(stats, year, month, months) {
  const { periodIRs, periodNCRs, periodPunch, periodRFIs,
          priorPeriodIRs, priorPeriodNCRs, priorPeriodPunch, priorPeriodRFIs } = stats;
  return [
    '<div>',
    '<div style="color:var(--text3);font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">This Period &mdash; ' + months[month - 1] + ' ' + year + '</div>',
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">',
    _kpiTile('IRs Raised',    String(periodIRs),    'var(--sand)',     _qDelta(periodIRs,    priorPeriodIRs,    false)),
    _kpiTile('NCRs Raised',   String(periodNCRs),   'var(--amber)',    _qDelta(periodNCRs,   priorPeriodNCRs,   true)),
    _kpiTile('Punch Raised',  String(periodPunch),  'var(--sand)',     _qDelta(periodPunch,  priorPeriodPunch,  true)),
    _kpiTile('RFIs Raised',   String(periodRFIs),   'var(--blue)',     _qDelta(periodRFIs,   priorPeriodRFIs,   false)),
    '</div></div>',
  ].join('');
}

function _qualityDisciplineTable(stats) {
  const { disciplineRows } = stats;
  const th  = label => '<th style="text-align:right;padding:8px 10px;font-weight:500;color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:.05em">' + label + '</th>';
  const thL = label => '<th style="text-align:left;padding:8px 10px;font-weight:500;color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:.05em">' + label + '</th>';
  let rowsHTML;
  if (!disciplineRows.length) {
    rowsHTML = '<tr><td colspan="5" style="padding:18px;text-align:center;color:var(--text3);font-size:12px">No quality records yet for this project.</td></tr>';
  } else {
    rowsHTML = disciplineRows.map(r => {
      const tint = r.ncrOpen > 0 ? 'background:var(--amber-bg)' : '';
      return [
        '<tr style="border-bottom:0.5px solid var(--border);' + tint + '">',
        '<td style="padding:8px 10px;font-weight:500;color:var(--charcoal)">' + r.discipline + '</td>',
        '<td style="padding:8px 10px;text-align:right;color:' + (r.ncrOpen > 0 ? 'var(--amber)' : 'var(--text2)') + '">' + r.ncrOpen + ' / ' + r.ncrClosed + '</td>',
        '<td style="padding:8px 10px;text-align:right;color:' + (r.irOpen > 0 ? 'var(--amber)' : 'var(--text2)') + '">' + r.irOpen + '</td>',
        '<td style="padding:8px 10px;text-align:right;color:var(--green)">' + r.irApprovalRate + '%</td>',
        '<td style="padding:8px 10px;text-align:right;color:' + (r.punchOpen > 0 ? 'var(--amber)' : 'var(--text2)') + '">' + r.punchOpen + ' / ' + r.punchClosed + '</td>',
        '</tr>',
      ].join('');
    }).join('');
  }
  return [
    '<div>',
    '<div style="color:var(--text3);font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">Discipline Breakdown</div>',
    '<div style="background:var(--bg2);border:0.5px solid var(--border);border-radius:8px;overflow:hidden">',
    '<table style="width:100%;border-collapse:collapse;font-size:12px;color:var(--charcoal)">',
    '<thead><tr style="background:var(--bg3);border-bottom:0.5px solid var(--border)">',
    thL('Discipline') + th('NCRs (Open / Closed)') + th('IRs Open') + th('IR Approval %') + th('Punch (Open / Closed)'),
    '</tr></thead>',
    '<tbody>' + rowsHTML + '</tbody>',
    '</table></div></div>',
  ].join('');
}

function _qualityAgingChart(stats) {
  const ab = stats.agingBuckets || {};
  const streams = [
    { label: 'NCRs',   buckets: ab.ncr   || [0,0,0,0] },
    { label: 'IRs',    buckets: ab.ir    || [0,0,0,0] },
    { label: 'Punch',  buckets: ab.punch || [0,0,0,0] },
    { label: 'RFIs',   buckets: ab.rfi   || [0,0,0,0] },
  ];
  const colors = ['var(--green)', 'var(--sand)', 'var(--amber)', 'var(--red)'];
  const bucketLabels = ['0\u201330d', '31\u201360d', '61\u201390d', '90d+'];
  const maxTotal = Math.max(1, ...streams.map(s => s.buckets.reduce((a,b)=>a+b,0)));

  const rows = streams.map(s => {
    const total = s.buckets.reduce((a,b)=>a+b,0);
    if (total === 0) {
      return [
        '<div style="display:flex;align-items:center;gap:10px;font-size:11px">',
        '<div style="width:48px;color:var(--text2);font-weight:600">' + s.label + '</div>',
        '<div style="flex:1;height:14px;background:var(--bg3);border-radius:6px"></div>',
        '<div style="width:32px;text-align:right;color:var(--text3);font-variant-numeric:tabular-nums">0</div>',
        '</div>',
      ].join('');
    }
    const widthPct = (total / maxTotal) * 100;
    let segs = '';
    s.buckets.forEach((n, i) => {
      if (n === 0) return;
      const pct = (n / total) * 100;
      segs += '<div title="' + bucketLabels[i] + ': ' + n + '" style="width:' + pct + '%;background:' + colors[i] + '"></div>';
    });
    return [
      '<div style="display:flex;align-items:center;gap:10px;font-size:11px">',
      '<div style="width:48px;color:var(--charcoal);font-weight:600">' + s.label + '</div>',
      '<div style="flex:1;height:14px;background:var(--bg3);border-radius:6px;overflow:hidden">',
      '<div style="width:' + widthPct + '%;height:100%;display:flex">' + segs + '</div>',
      '</div>',
      '<div style="width:32px;text-align:right;color:var(--charcoal);font-variant-numeric:tabular-nums;font-weight:600">' + total + '</div>',
      '</div>',
    ].join('');
  }).join('');

  const legend = bucketLabels.map((lbl, i) =>
    '<div style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text2)">' +
      '<div style="width:8px;height:8px;background:' + colors[i] + ';border-radius:2px"></div>' + lbl +
    '</div>'
  ).join('');

  return [
    '<div class="card" style="padding:14px">',
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">',
    '<div style="font-size:12px;font-weight:600;color:var(--charcoal)">Open Items \u2014 Aging</div>',
    '<div style="display:flex;gap:10px">' + legend + '</div>',
    '</div>',
    '<div style="display:flex;flex-direction:column;gap:8px">' + rows + '</div>',
    '</div>',
  ].join('');
}

function _qualitySeverityTrendChart(stats) {
  const months = stats.severityTrend;
  const maxVal = Math.max(1, ...months.map(m => m.minor + m.major));
  const W = 320, H = 140, PAD_L = 24, PAD_B = 24, PAD_T = 10, PAD_R = 8;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const barW = Math.max(8, (innerW / months.length) * 0.55);
  const step = innerW / months.length;

  const bars = months.map((m, i) => {
    const total = m.minor + m.major;
    const x = PAD_L + step * i + (step - barW) / 2;
    const minorH = (m.minor / maxVal) * innerH;
    const majorH = (m.major / maxVal) * innerH;
    const yMinor = PAD_T + innerH - minorH;
    const yMajor = yMinor - majorH;
    const label = m.label;
    return [
      majorH > 0 ? '<rect x="' + x + '" y="' + yMajor + '" width="' + barW + '" height="' + majorH + '" fill="var(--amber)"/>' : '',
      minorH > 0 ? '<rect x="' + x + '" y="' + yMinor + '" width="' + barW + '" height="' + minorH + '" fill="var(--sand)"/>' : '',
      total > 0 ? '<text x="' + (x + barW/2) + '" y="' + (yMajor - 4) + '" text-anchor="middle" font-size="9" fill="var(--charcoal)" font-weight="600">' + total + '</text>' : '',
      '<text x="' + (x + barW/2) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="9" fill="var(--text3)">' + label + '</text>',
    ].join('');
  }).join('');

  const axis = '<line x1="' + PAD_L + '" y1="' + (PAD_T + innerH) + '" x2="' + (W - PAD_R) + '" y2="' + (PAD_T + innerH) + '" stroke="var(--border)" stroke-width="0.5"/>';

  return [
    '<div class="card" style="padding:14px">',
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">',
    '<div style="font-size:12px;font-weight:600;color:var(--charcoal)">NCR Severity \u2014 6 Month Trend</div>',
    '<div style="display:flex;gap:10px">',
    '<div style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text2)"><div style="width:8px;height:8px;background:var(--sand);border-radius:2px"></div>Minor</div>',
    '<div style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text2)"><div style="width:8px;height:8px;background:var(--amber);border-radius:2px"></div>Major</div>',
    '</div></div>',
    '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block">' + axis + bars + '</svg>',
    '</div>',
  ].join('');
}

function _qualityCharts(stats) {
  return [
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">',
    _qualityAgingChart(stats),
    _qualitySeverityTrendChart(stats),
    '</div>',
  ].join('');
}

async function exportQualityReportPDF(year, month) {
  const el = document.getElementById('quality-report-container');
  if (!el) { toast('No report to export', 'warning'); return; }
  if (typeof html2pdf === 'undefined') { toast('PDF library not loaded', 'error'); return; }
  const ym = year + '-' + String(month).padStart(2, '0');
  const projSlug = (currentProject?.name || 'Project').replace(/[^A-Za-z0-9]+/g, '_');
  const filename = 'Quality_MIS_' + projSlug + '_' + ym + '.pdf';
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
