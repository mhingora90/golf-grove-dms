// REPORTS — Document Control

function _openDocsReport() {
  const now = new Date();
  renderDocsReport(now.getFullYear(), now.getMonth() + 1);
}

async function _fetchDocsData(projectId) {
  const [draw, sub, rfi, ncr, insp, trans] = await Promise.all([
    sb.from('drawings').select('*').eq('project_id', projectId),
    sb.from('submittals').select('*').eq('project_id', projectId),
    sb.from('rfis').select('*').eq('project_id', projectId),
    sb.from('ncrs').select('*').eq('project_id', projectId),
    sb.from('inspections').select('*').eq('project_id', projectId),
    sb.from('transmittals').select('*').eq('project_id', projectId),
  ]);
  return {
    drawings: draw.data || [],
    submittals: sub.data || [],
    rfis: rfi.data || [],
    ncrs: ncr.data || [],
    inspections: insp.data || [],
    transmittals: trans.data || [],
  };
}

const _SUB_STAGE_ORDER = ['Draft','Pending Review','Approved','Approved with Comments','Revise & Resubmit','Rejected'];
const _SUB_STAGE_COLOR = {
  'Draft':'var(--text3)',
  'Pending Review':'var(--sand)',
  'Approved':'var(--green)',
  'Approved with Comments':'var(--green-light, #B6D9B0)',
  'Revise & Resubmit':'var(--amber)',
  'Rejected':'#C0392B',
};
const _D_DISC_ORDER = ['Architectural','Structural','MEP','Civil','Landscape','Other'];

function _inMonthD(dt, y, m) {
  if (!dt) return false;
  const d = new Date(dt);
  return d.getFullYear() === y && (d.getMonth() + 1) === m;
}

function _daysAgo(dt) {
  if (!dt) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(dt).getTime()) / 86400000));
}

function _bucketAge(days) {
  if (days <= 7)  return 0;
  if (days <= 14) return 1;
  if (days <= 30) return 2;
  return 3;
}

function _normDiscipline(v) {
  const s = (v || '').toString().toLowerCase();
  if (s.startsWith('arch')) return 'Architectural';
  if (s.startsWith('struct')) return 'Structural';
  if (s.startsWith('mep') || s.includes('mech') || s.includes('elec') || s.includes('plumb')) return 'MEP';
  if (s.startsWith('civ')) return 'Civil';
  if (s.startsWith('land')) return 'Landscape';
  return 'Other';
}

function _dCalcStats(data, year, month) {
  const { drawings, submittals, rfis, ncrs, inspections, transmittals } = data;

  const drawTotal = drawings.length;
  const drawApproved = drawings.filter(d => d.status === 'Approved').length;
  const drawApprovedPct = drawTotal > 0 ? Math.round((drawApproved / drawTotal) * 100) : 0;

  const subTotal = submittals.length;
  const subApproved = submittals.filter(s => s.status === 'Approved' || s.status === 'Approved with Comments' || s.outcome === '1' || s.outcome === '2').length;
  const subPending  = submittals.filter(s => s.status === 'Pending Review').length;
  const subApprovedPct = subTotal > 0 ? Math.round((subApproved / subTotal) * 100) : 0;

  const rfiOpen   = rfis.filter(r => r.status === 'Open').length;
  const rfiClosed = rfis.filter(r => r.status === 'Closed' || r.status === 'Answered').length;

  const ncrOpen   = ncrs.filter(n => n.status === 'Open').length;
  const ncrClosed = ncrs.filter(n => n.status === 'Closed').length;

  const inspTotal  = inspections.length;
  const inspPass   = inspections.filter(i => i.status === 'Pass' || i.status === 'Passed').length;
  const inspFail   = inspections.filter(i => i.status === 'Fail' || i.status === 'Failed').length;
  const inspDone   = inspPass + inspFail;
  const inspPassPct = inspDone > 0 ? Math.round((inspPass / inspDone) * 100) : 0;

  const trnTotal = transmittals.length;

  const closedRFIs = rfis.filter(r => (r.status === 'Closed' || r.status === 'Answered') && r.created_at && (r.closed_at || r.answered_at || r.updated_at));
  const avgRFITurn = closedRFIs.length > 0
    ? Math.round(closedRFIs.reduce((s,r) => s + Math.max(0, (new Date(r.closed_at || r.answered_at || r.updated_at) - new Date(r.created_at)) / 86400000), 0) / closedRFIs.length)
    : 0;

  const periodSub  = submittals.filter(s => _inMonthD(s.created_at, year, month)).length;
  const periodRFI  = rfis.filter(r => _inMonthD(r.created_at, year, month)).length;
  const periodNCR  = ncrs.filter(n => _inMonthD(n.created_at, year, month)).length;
  const periodTrn  = transmittals.filter(t => _inMonthD(t.transmit_date || t.created_at, year, month)).length;

  const priorY = month === 1 ? year - 1 : year;
  const priorM = month === 1 ? 12 : month - 1;
  const priorSub  = submittals.filter(s => _inMonthD(s.created_at, priorY, priorM)).length;
  const priorRFI  = rfis.filter(r => _inMonthD(r.created_at, priorY, priorM)).length;
  const priorNCR  = ncrs.filter(n => _inMonthD(n.created_at, priorY, priorM)).length;
  const priorTrn  = transmittals.filter(t => _inMonthD(t.transmit_date || t.created_at, priorY, priorM)).length;

  const subStageCounts = {};
  _SUB_STAGE_ORDER.forEach(s => subStageCounts[s] = 0);
  submittals.forEach(s => {
    const k = s.status || 'Pending Review';
    if (subStageCounts[k] !== undefined) subStageCounts[k]++;
    else if (k === 'Review Not Required') subStageCounts['Approved']++;
  });

  const subBuckets = [0,0,0,0];
  submittals.filter(s => s.status === 'Pending Review').forEach(s => {
    subBuckets[_bucketAge(_daysAgo(s.created_at))]++;
  });
  const rfiBuckets = [0,0,0,0];
  rfis.filter(r => r.status === 'Open').forEach(r => {
    rfiBuckets[_bucketAge(_daysAgo(r.created_at))]++;
  });
  const ncrBuckets = [0,0,0,0];
  ncrs.filter(n => n.status === 'Open').forEach(n => {
    ncrBuckets[_bucketAge(_daysAgo(n.created_at))]++;
  });

  const discMap = {};
  _D_DISC_ORDER.forEach(d => discMap[d] = { discipline:d, drawings:0, submittals:0, rfisOpen:0, ncrsOpen:0 });
  drawings.forEach(d => { const k = _normDiscipline(d.discipline); discMap[k].drawings++; });
  submittals.forEach(s => { const k = _normDiscipline(s.discipline); discMap[k].submittals++; });
  rfis.filter(r => r.status === 'Open').forEach(r => { const k = _normDiscipline(r.discipline); discMap[k].rfisOpen++; });
  ncrs.filter(n => n.status === 'Open').forEach(n => { const k = _normDiscipline(n.discipline); discMap[k].ncrsOpen++; });
  const discRows = _D_DISC_ORDER.map(d => discMap[d]).filter(r => r.drawings + r.submittals + r.rfisOpen + r.ncrsOpen > 0);

  const trend = [];
  const monthLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  for (let i = 5; i >= 0; i--) {
    let y = year, m = month - i;
    while (m <= 0) { m += 12; y -= 1; }
    const subIn = submittals.filter(s => _inMonthD(s.created_at, y, m)).length;
    const subOut = submittals.filter(s => (s.status === 'Approved' || s.status === 'Approved with Comments') && _inMonthD(s.updated_at || s.created_at, y, m)).length;
    trend.push({ label: monthLabels[m - 1], subIn, subOut });
  }

  return {
    drawTotal, drawApproved, drawApprovedPct,
    subTotal, subApproved, subPending, subApprovedPct,
    rfiOpen, rfiClosed,
    ncrOpen, ncrClosed,
    inspTotal, inspPass, inspFail, inspPassPct,
    trnTotal, avgRFITurn,
    periodSub, periodRFI, periodNCR, periodTrn,
    priorSub, priorRFI, priorNCR, priorTrn,
    subStageCounts,
    agingBuckets: { sub: subBuckets, rfi: rfiBuckets, ncr: ncrBuckets },
    discRows, trend,
  };
}

async function renderDocsReport(year, month) {
  const mm = String(month).padStart(2, '0');
  if (location.hash !== '#reports-docs/' + year + '-' + mm) {
    history.replaceState(null, '', '#reports-docs/' + year + '-' + mm);
  }
  currentPage = 'reports-docs';
  document.getElementById('page-title').textContent = PAGE_TITLES['reports-docs'];
  const el = document.getElementById('content');
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Loading...</div>';
  const data = await _fetchDocsData(currentProject.id);
  const stats = _dCalcStats(data, year, month);
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const curYear = new Date().getFullYear();
  const yearOpts  = [curYear-2,curYear-1,curYear,curYear+1,curYear+2]
    .map(y => '<option value="' + y + '"' + (y === year ? ' selected' : '') + '>' + y + '</option>').join('');
  const monthOpts = months
    .map((m, i) => '<option value="' + (i + 1) + '"' + (i + 1 === month ? ' selected' : '') + '>' + m + '</option>').join('');
  const container = document.createElement('div');
  container.id = 'docs-report-container';
  container.style.cssText = 'padding-bottom:32px';
  container.innerHTML = _dBuildHTML(stats, year, month, months, yearOpts, monthOpts);
  el.innerHTML = '';
  el.appendChild(container);
}

function _dDelta(current, prior, invertColor) {
  const diff = current - prior;
  if (diff === 0) return '<div style="color:var(--text3);font-size:10px;margin-top:2px">no change</div>';
  const goodDirection = invertColor ? diff < 0 : diff > 0;
  const color = goodDirection ? 'var(--green)' : 'var(--amber)';
  const arrow = diff > 0 ? '&#8593;' : '&#8595;';
  const sign  = diff > 0 ? '+' : '';
  return '<div style="color:' + color + ';font-size:10px;margin-top:2px">' + arrow + ' ' + sign + Math.abs(diff) + '</div>';
}

function _dBuildHTML(stats, year, month, months, yearOpts, monthOpts) {
  const rptYear  = "document.getElementById('rpt-d-year').value";
  const rptMonth = "document.getElementById('rpt-d-month').value";
  const projName = (currentProject && currentProject.name) ? currentProject.name : '';
  const header = [
    '<div style="padding:20px 24px 0;display:flex;flex-direction:column;gap:14px">',
    '<div style="display:flex;align-items:center;gap:6px">',
    '<a href="#" onclick="nav(\'reports\', document.getElementById(\'n-reports\'));return false" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:500;color:var(--text3);text-decoration:none;padding:4px 8px;border-radius:6px;background:var(--bg3);border:0.5px solid var(--border)">',
    '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8 2L4 6l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'All Reports</a>',
    '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="#B4A88C" stroke-width="1.2" stroke-linecap="round"/></svg>',
    '<span style="font-size:11px;color:var(--text2);font-weight:500">Document Control Report</span>',
    '</div>',
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">',
    '<div>',
    '<h1 style="margin:0 0 2px;font-size:18px;font-weight:600;color:var(--charcoal);letter-spacing:-.3px">Document Control MIS Report</h1>',
    '<div style="font-size:12px;color:var(--text3)">' + projName + '</div>',
    '</div>',
    '<button class="btn btn-sm btn-secondary" style="flex-shrink:0;margin-top:2px" onclick="exportDocsReportPDF(' + year + ',' + month + ')">',
    '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="margin-right:4px"><path d="M6 2v6M3 6l3 3 3-3M2 10h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'Export PDF</button>',
    '</div>',
    '<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--bg3);border:0.5px solid var(--border);border-radius:8px">',
    '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1.5" y="2.5" width="10" height="9" rx="1.5" stroke="#B4A88C" stroke-width="1.1"/><path d="M4 1.5v2M9 1.5v2M1.5 5.5h10" stroke="#B4A88C" stroke-width="1.1" stroke-linecap="round"/></svg>',
    '<span style="font-size:11px;font-weight:500;color:var(--text2)">Period</span>',
    '<select id="rpt-d-month" class="filter-sel" onchange="renderDocsReport(+' + rptYear + ',+this.value)">' + monthOpts + '</select>',
    '<select id="rpt-d-year"  class="filter-sel" onchange="renderDocsReport(+this.value,+' + rptMonth + ')">' + yearOpts + '</select>',
    '<span style="margin-left:auto;font-size:10px;color:var(--text3)">Generated ' + new Date().toLocaleDateString('en-GB') + '</span>',
    '</div>',
    '</div>',
  ].join('');
  const sections = [
    '<div style="padding:0 24px;display:flex;flex-direction:column;gap:16px;margin-top:16px">',
    _dSummary(stats, year, month, months),
    _dCumulativeKPIs(stats),
    _dPeriodKPIs(stats, year, month, months),
    _dFunnel(stats),
    _dCharts(stats),
    _dDisciplineTable(stats),
    '</div>',
  ].join('');
  return header + sections;
}

function _dSummary(stats, year, month, months) {
  const { drawTotal, drawApprovedPct, subTotal, subPending, rfiOpen, ncrOpen, inspPassPct, avgRFITurn } = stats;
  return [
    '<div style="background:#FFF8EC;border-left:3px solid #B4A88C;border-radius:0 8px 8px 0;padding:14px 18px">',
    '<div style="color:#8B7E5E;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px">Executive Summary</div>',
    '<p style="color:var(--charcoal);font-size:13px;line-height:1.75;margin:0">',
    'As of ' + months[month - 1] + ' ' + year + ', the project holds <strong>' + drawTotal + ' drawings</strong> ',
    '(<strong>' + drawApprovedPct + '% approved</strong>) and <strong>' + subTotal + ' submittals</strong> ',
    'with <strong>' + subPending + ' under review</strong>. ',
    '<strong>' + rfiOpen + ' RFIs</strong> and <strong>' + ncrOpen + ' NCRs</strong> remain open. ',
    'Inspection pass rate is <strong>' + inspPassPct + '%</strong>. Average RFI turnaround: <strong>' + avgRFITurn + ' days</strong>.',
    '</p></div>',
  ].join('');
}

function _dCumulativeKPIs(stats) {
  const { drawTotal, drawApprovedPct, subTotal, subApprovedPct, rfiOpen, rfiClosed, ncrOpen, ncrClosed, inspPassPct, trnTotal } = stats;
  return [
    '<div>',
    '<div style="color:var(--text3);font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">Project to Date (Cumulative)</div>',
    '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px">',
    _kpiTile('Drawings',     drawTotal + ' / ' + drawApprovedPct + '%',         'var(--charcoal)', '<div style="color:var(--text3);font-size:10px;margin-top:2px">approved</div>'),
    _kpiTile('Submittals',   subTotal + ' / ' + subApprovedPct + '%',           'var(--blue)',     '<div style="color:var(--text3);font-size:10px;margin-top:2px">approved</div>'),
    _kpiTile('RFIs',         rfiOpen + ' open',                                  'var(--amber)',   '<div style="color:var(--text3);font-size:10px;margin-top:2px">' + rfiClosed + ' closed</div>'),
    _kpiTile('NCRs',         ncrOpen + ' open',                                  '#C0392B',        '<div style="color:var(--text3);font-size:10px;margin-top:2px">' + ncrClosed + ' closed</div>'),
    _kpiTile('Insp. Pass',   inspPassPct + '%',                                  'var(--green)',   ''),
    _kpiTile('Transmittals', String(trnTotal),                                   'var(--charcoal)', ''),
    '</div></div>',
  ].join('');
}

function _dPeriodKPIs(stats, year, month, months) {
  const { periodSub, periodRFI, periodNCR, periodTrn, priorSub, priorRFI, priorNCR, priorTrn } = stats;
  return [
    '<div>',
    '<div style="color:var(--text3);font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">This Period &mdash; ' + months[month - 1] + ' ' + year + '</div>',
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">',
    _kpiTile('New Submittals', String(periodSub), 'var(--blue)',     _dDelta(periodSub, priorSub, false)),
    _kpiTile('RFIs Raised',    String(periodRFI), 'var(--amber)',    _dDelta(periodRFI, priorRFI, true)),
    _kpiTile('NCRs Raised',    String(periodNCR), '#C0392B',         _dDelta(periodNCR, priorNCR, true)),
    _kpiTile('Transmittals',   String(periodTrn), 'var(--charcoal)', _dDelta(periodTrn, priorTrn, false)),
    '</div></div>',
  ].join('');
}

function _dFunnel(stats) {
  const { subStageCounts } = stats;
  const counts = _SUB_STAGE_ORDER.map(s => subStageCounts[s] || 0);
  const max = Math.max(1, ...counts);
  const rows = _SUB_STAGE_ORDER.map(s => {
    const n = subStageCounts[s] || 0;
    const widthPct = (n / max) * 100;
    return [
      '<div style="display:flex;align-items:center;gap:10px;font-size:11px">',
      '<div style="width:160px;color:var(--charcoal);font-weight:500">' + s + '</div>',
      '<div style="flex:1;height:18px;background:var(--bg3);border-radius:6px;overflow:hidden">',
      '<div style="width:' + widthPct + '%;height:100%;background:' + _SUB_STAGE_COLOR[s] + '"></div>',
      '</div>',
      '<div style="width:32px;text-align:right;color:var(--charcoal);font-variant-numeric:tabular-nums;font-weight:600">' + n + '</div>',
      '</div>',
    ].join('');
  }).join('');
  return [
    '<div class="card" style="padding:14px">',
    '<div style="font-size:12px;font-weight:600;color:var(--charcoal);margin-bottom:12px">Submittal Status Funnel</div>',
    '<div style="display:flex;flex-direction:column;gap:8px">' + rows + '</div>',
    '</div>',
  ].join('');
}

function _dAgingChart(stats) {
  const { agingBuckets } = stats;
  const ab = agingBuckets || {};
  const streams = [
    { label:'Submittals', data: ab.sub || [0,0,0,0] },
    { label:'RFIs',       data: ab.rfi || [0,0,0,0] },
    { label:'NCRs',       data: ab.ncr || [0,0,0,0] },
  ];
  const bucketLabels = ['0-7d','8-14d','15-30d','30d+'];
  const bucketColors = ['var(--green)','var(--sand)','var(--amber)','#C0392B'];

  const rows = streams.map(s => {
    const total = s.data.reduce((a,b) => a + b, 0);
    if (total === 0) {
      return [
        '<div style="display:flex;align-items:center;gap:10px;font-size:11px">',
        '<div style="width:90px;color:var(--text2);font-weight:500">' + s.label + '</div>',
        '<div style="flex:1;height:18px;background:var(--bg3);border-radius:6px"></div>',
        '<div style="width:28px;text-align:right;color:var(--text3);font-size:10px">0</div>',
        '</div>',
      ].join('');
    }
    const segs = s.data.map((n,i) => {
      if (n === 0) return '';
      const pct = (n / total) * 100;
      return '<div title="' + bucketLabels[i] + ': ' + n + '" style="width:' + pct + '%;background:' + bucketColors[i] + '"></div>';
    }).join('');
    return [
      '<div style="display:flex;align-items:center;gap:10px;font-size:11px">',
      '<div style="width:90px;color:var(--charcoal);font-weight:500">' + s.label + '</div>',
      '<div style="flex:1;height:18px;background:var(--bg3);border-radius:6px;overflow:hidden;display:flex">' + segs + '</div>',
      '<div style="width:28px;text-align:right;color:var(--charcoal);font-variant-numeric:tabular-nums;font-weight:600">' + total + '</div>',
      '</div>',
    ].join('');
  }).join('');

  const legend = bucketLabels.map((l,i) =>
    '<div style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text2)">' +
      '<div style="width:9px;height:9px;background:' + bucketColors[i] + ';border-radius:2px"></div>' + l +
    '</div>'
  ).join('');

  return [
    '<div class="card" style="padding:14px">',
    '<div style="font-size:12px;font-weight:600;color:var(--charcoal);margin-bottom:12px">Open Items Aging</div>',
    '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">' + rows + '</div>',
    '<div style="display:flex;flex-wrap:wrap;gap:12px;border-top:0.5px solid var(--border);padding-top:10px">' + legend + '</div>',
    '</div>',
  ].join('');
}

function _dTrendChart(stats) {
  const months = stats.trend;
  const allVals = [];
  months.forEach(m => { allVals.push(m.subIn); allVals.push(m.subOut); });
  const maxVal = Math.max(1, ...allVals);
  const W = 320, H = 140, PAD_L = 24, PAD_B = 24, PAD_T = 10, PAD_R = 8;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const groupW = innerW / months.length;
  const barW = Math.max(6, (groupW * 0.4));

  const bars = months.map((m, i) => {
    const xL = PAD_L + groupW * i + (groupW - barW * 2 - 2) / 2;
    const xS = xL + barW + 2;
    const hL = (m.subIn / maxVal) * innerH;
    const hS = (m.subOut / maxVal) * innerH;
    const yL = PAD_T + innerH - hL;
    const yS = PAD_T + innerH - hS;
    return [
      hL > 0 ? '<rect x="' + xL + '" y="' + yL + '" width="' + barW + '" height="' + hL + '" fill="var(--sand)"/>' : '',
      hS > 0 ? '<rect x="' + xS + '" y="' + yS + '" width="' + barW + '" height="' + hS + '" fill="var(--green)"/>' : '',
      '<text x="' + (xL + barW + 1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="9" fill="var(--text3)">' + m.label + '</text>',
    ].join('');
  }).join('');

  const axis = '<line x1="' + PAD_L + '" y1="' + (PAD_T + innerH) + '" x2="' + (W - PAD_R) + '" y2="' + (PAD_T + innerH) + '" stroke="var(--border)" stroke-width="0.5"/>';

  return [
    '<div class="card" style="padding:14px">',
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">',
    '<div style="font-size:12px;font-weight:600;color:var(--charcoal)">Submittals \u2014 6 Month Trend</div>',
    '<div style="display:flex;gap:10px">',
    '<div style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text2)"><div style="width:8px;height:8px;background:var(--sand);border-radius:2px"></div>Submitted</div>',
    '<div style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text2)"><div style="width:8px;height:8px;background:var(--green);border-radius:2px"></div>Approved</div>',
    '</div></div>',
    '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block">' + axis + bars + '</svg>',
    '</div>',
  ].join('');
}

function _dCharts(stats) {
  return [
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">',
    _dAgingChart(stats),
    _dTrendChart(stats),
    '</div>',
  ].join('');
}

function _dDisciplineTable(stats) {
  const { discRows } = stats;
  const th  = label => '<th style="text-align:right;padding:8px 10px;font-weight:500;color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:.05em">' + label + '</th>';
  const thL = label => '<th style="text-align:left;padding:8px 10px;font-weight:500;color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:.05em">' + label + '</th>';
  let rowsHTML;
  if (!discRows.length) {
    rowsHTML = '<tr><td colspan="5" style="padding:18px;text-align:center;color:var(--text3);font-size:12px">No discipline data yet.</td></tr>';
  } else {
    rowsHTML = discRows.map(r => [
      '<tr style="border-bottom:0.5px solid var(--border)">',
      '<td style="padding:8px 10px;font-weight:500;color:var(--charcoal)">' + r.discipline + '</td>',
      '<td style="padding:8px 10px;text-align:right;color:var(--text2)">' + r.drawings + '</td>',
      '<td style="padding:8px 10px;text-align:right;color:var(--blue)">' + r.submittals + '</td>',
      '<td style="padding:8px 10px;text-align:right;color:var(--amber)">' + r.rfisOpen + '</td>',
      '<td style="padding:8px 10px;text-align:right;color:#C0392B">' + r.ncrsOpen + '</td>',
      '</tr>',
    ].join('')).join('');
  }
  return [
    '<div>',
    '<div style="color:var(--text3);font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">Discipline Breakdown</div>',
    '<div style="background:var(--bg2);border:0.5px solid var(--border);border-radius:8px;overflow:hidden">',
    '<table style="width:100%;border-collapse:collapse;font-size:12px;color:var(--charcoal)">',
    '<thead><tr style="background:var(--bg3);border-bottom:0.5px solid var(--border)">',
    thL('Discipline') + th('Drawings') + th('Submittals') + th('RFIs Open') + th('NCRs Open'),
    '</tr></thead>',
    '<tbody>' + rowsHTML + '</tbody>',
    '</table></div></div>',
  ].join('');
}

async function exportDocsReportPDF(year, month) {
  const el = document.getElementById('docs-report-container');
  if (!el) { toast('No report to export', 'warning'); return; }
  if (typeof html2pdf === 'undefined') { toast('PDF library not loaded', 'error'); return; }
  const ym = year + '-' + String(month).padStart(2, '0');
  const projSlug = (currentProject?.name || 'Project').replace(/[^A-Za-z0-9]+/g, '_');
  const filename = 'DocControl_MIS_' + projSlug + '_' + ym + '.pdf';
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
