// REPORTS — Sales Cash Flow (expected monthly inflow from payment plans)

function _openCashFlowReport() {
  const now = new Date();
  renderCashFlowReport(now.getFullYear(), now.getMonth() + 1);
}

async function _fetchCashFlowData(projectId) {
  const unitsRes = await sb.from('units')
    .select('id, unit_no, sale_status, unit_sales(id, sold_price, status, payment_milestones(id, milestone_name, amount, pct_of_sale, due_date, sort_order))')
    .eq('project_id', projectId);
  return unitsRes.data || [];
}

function _cfIsContracted(u) {
  if (u.sale_status === 'sold' || u.sale_status === 'reserved' || u.sale_status === 'booked') return true;
  const s = u.unit_sales?.status;
  return s === 'sold' || s === 'reserved' || s === 'booked';
}

function _cfCalcStats(units, year, month) {
  const contracted = units.filter(_cfIsContracted);

  const totalContracted = contracted.length;
  const totalContractValue = contracted.reduce((s, u) => s + (+u.unit_sales?.sold_price || 0), 0);

  // Flatten milestones
  const milestones = [];
  for (const u of contracted) {
    const sale = u.unit_sales;
    if (!sale) continue;
    for (const m of (sale.payment_milestones || [])) {
      milestones.push({
        unitNo: u.unit_no,
        name: m.milestone_name,
        amount: +m.amount || 0,
        due: m.due_date || null,
      });
    }
  }

  const totalMilestoneValue = milestones.reduce((s, m) => s + m.amount, 0);

  // Monthly buckets (YYYY-MM). "On Handover" bucket for null due_date.
  const monthMap = {};
  let onHandover = 0;
  let onHandoverCount = 0;
  for (const m of milestones) {
    if (!m.due) { onHandover += m.amount; onHandoverCount++; continue; }
    const key = m.due.substring(0, 7);
    if (!monthMap[key]) monthMap[key] = { amount: 0, count: 0 };
    monthMap[key].amount += m.amount;
    monthMap[key].count++;
  }

  // Sorted month keys
  const monthKeys = Object.keys(monthMap).sort();
  let cum = 0;
  const monthRows = monthKeys.map(k => {
    const b = monthMap[k];
    cum += b.amount;
    return { key: k, label: _cfMonthLabel(k), amount: b.amount, count: b.count, cumulative: cum };
  });

  // Reporting-period anchor: end of selected month
  const anchor = new Date(year, month - 1, 1);
  const anchorNextMonth = new Date(year, month, 1);
  const today = new Date();

  const isPast = k => {
    const [y, m] = k.split('-').map(Number);
    return new Date(y, m - 1, 1) < anchor;
  };
  const isInMonth = k => {
    const [y, m] = k.split('-').map(Number);
    return y === year && m === month;
  };
  const isNext12 = k => {
    const [y, m] = k.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    const twelveOut = new Date(anchor.getFullYear(), anchor.getMonth() + 12, 1);
    return d >= anchorNextMonth && d < twelveOut;
  };

  const collectedToDate = monthKeys.filter(isPast).reduce((s, k) => s + monthMap[k].amount, 0);
  const periodExpected  = monthKeys.filter(isInMonth).reduce((s, k) => s + monthMap[k].amount, 0);
  const next12          = monthKeys.filter(isNext12).reduce((s, k) => s + monthMap[k].amount, 0);
  const beyond12 = totalMilestoneValue - collectedToDate - periodExpected - next12 - onHandover;

  // Full timeline chart: earliest dated milestone → latest dated milestone,
  // month-by-month (inclusive), zero-filled. On Handover appended as trailing bar.
  const chartMonths = [];
  if (monthKeys.length) {
    const [fy, fm] = monthKeys[0].split('-').map(Number);
    const [ly, lm] = monthKeys[monthKeys.length - 1].split('-').map(Number);
    const start = new Date(fy, fm - 1, 1);
    const end   = new Date(ly, lm - 1, 1);
    const totalMs = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
    for (let i = 0; i < totalMs; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      const b = monthMap[key] || { amount: 0, count: 0 };
      chartMonths.push({ key, label: d.toLocaleString('default', { month: 'short' }) + " '" + String(d.getFullYear()).slice(-2), amount: b.amount, count: b.count, kind: 'month' });
    }
  }
  if (onHandoverCount > 0) {
    chartMonths.push({ key: 'handover', label: 'Handover', amount: onHandover, count: onHandoverCount, kind: 'handover' });
  }

  // Timeline bounds for narrative
  const firstMonthKey = monthKeys[0] || null;
  const lastMonthKey  = monthKeys[monthKeys.length - 1] || null;

  return {
    totalContracted, totalContractValue, totalMilestoneValue,
    onHandover, onHandoverCount,
    monthRows, chartMonths,
    collectedToDate, periodExpected, next12, beyond12,
    firstMonthKey, lastMonthKey,
  };
}

function _cfMonthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('default', { month: 'short', year: 'numeric' });
}

async function renderCashFlowReport(year, month) {
  const mm = String(month).padStart(2, '0');
  if (location.hash !== '#reports-cashflow/' + year + '-' + mm) {
    history.replaceState(null, '', '#reports-cashflow/' + year + '-' + mm);
  }
  currentPage = 'reports-cashflow';
  document.getElementById('page-title').textContent = PAGE_TITLES['reports-cashflow'] || 'Sales Cash Flow';
  const el = document.getElementById('content');
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Loading...</div>';
  const units = await _fetchCashFlowData(currentProject.id);
  const stats = _cfCalcStats(units, year, month);
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const curYear = new Date().getFullYear();
  const yearOpts  = [curYear-2,curYear-1,curYear,curYear+1,curYear+2]
    .map(y => '<option value="' + y + '"' + (y === year ? ' selected' : '') + '>' + y + '</option>').join('');
  const monthOpts = months
    .map((m, i) => '<option value="' + (i + 1) + '"' + (i + 1 === month ? ' selected' : '') + '>' + m + '</option>').join('');
  const container = document.createElement('div');
  container.id = 'cashflow-report-container';
  container.style.cssText = 'padding-bottom:32px';
  container.innerHTML = _cfBuildHTML(stats, year, month, months, yearOpts, monthOpts);
  el.innerHTML = '';
  el.appendChild(container);
}

function _cfBuildHTML(stats, year, month, months, yearOpts, monthOpts) {
  const rptYear  = "document.getElementById('rpt-cf-year').value";
  const rptMonth = "document.getElementById('rpt-cf-month').value";
  const projName = (currentProject && currentProject.name) ? currentProject.name : '';
  const header = [
    '<div style="padding:20px 24px 0;display:flex;flex-direction:column;gap:14px">',
    '<div style="display:flex;align-items:center;gap:6px">',
    '<a href="#" onclick="nav(\'reports\', document.getElementById(\'n-reports\'));return false" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:500;color:var(--text3);text-decoration:none;padding:4px 8px;border-radius:6px;background:var(--bg3);border:0.5px solid var(--border)">',
    '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8 2L4 6l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'All Reports</a>',
    '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="#B4A88C" stroke-width="1.2" stroke-linecap="round"/></svg>',
    '<span style="font-size:11px;color:var(--text2);font-weight:500">Sales Cash Flow</span>',
    '</div>',
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">',
    '<div>',
    '<h1 style="margin:0 0 2px;font-size:18px;font-weight:600;color:var(--charcoal);letter-spacing:-.3px">Sales Cash Flow Report</h1>',
    '<div style="font-size:12px;color:var(--text3)">' + projName + ' &mdash; expected inflow from contracted payment plans</div>',
    '</div>',
    '<button class="btn btn-sm btn-secondary" style="flex-shrink:0;margin-top:2px" onclick="exportCashFlowReportPDF(' + year + ',' + month + ')">',
    '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="margin-right:4px"><path d="M6 2v6M3 6l3 3 3-3M2 10h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'Export PDF</button>',
    '</div>',
    '<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--bg3);border:0.5px solid var(--border);border-radius:8px">',
    '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1.5" y="2.5" width="10" height="9" rx="1.5" stroke="#B4A88C" stroke-width="1.1"/><path d="M4 1.5v2M9 1.5v2M1.5 5.5h10" stroke="#B4A88C" stroke-width="1.1" stroke-linecap="round"/></svg>',
    '<span style="font-size:11px;font-weight:500;color:var(--text2)">Anchor month</span>',
    '<select id="rpt-cf-month" class="filter-sel" onchange="renderCashFlowReport(+' + rptYear + ',+this.value)">' + monthOpts + '</select>',
    '<select id="rpt-cf-year"  class="filter-sel" onchange="renderCashFlowReport(+this.value,+' + rptMonth + ')">' + yearOpts + '</select>',
    '<span style="margin-left:auto;font-size:10px;color:var(--text3)">Generated ' + new Date().toLocaleDateString('en-GB') + '</span>',
    '</div>',
    '</div>',
  ].join('');
  const sections = [
    '<div style="padding:0 24px;display:flex;flex-direction:column;gap:16px;margin-top:16px">',
    _cfSummary(stats, year, month, months),
    _cfKPIs(stats, year, month, months),
    _cfMonthlyTable(stats, year, month),
    _cfChart(stats),
    '</div>',
  ].join('');
  return header + sections;
}

function _cfSummary(stats, year, month, months) {
  const { totalContracted, totalContractValue, totalMilestoneValue, collectedToDate, periodExpected, onHandover, firstMonthKey, lastMonthKey } = stats;
  const spanTxt = firstMonthKey && lastMonthKey
    ? _cfMonthLabel(firstMonthKey) + ' through ' + _cfMonthLabel(lastMonthKey)
    : 'no scheduled dates';
  return [
    '<div style="background:var(--green-bg);border-left:3px solid var(--green);border-radius:0 8px 8px 0;padding:14px 18px">',
    '<div style="color:var(--green);font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px">Executive Summary</div>',
    '<p style="color:var(--charcoal);font-size:13px;line-height:1.75;margin:0">',
    '<strong>' + totalContracted + ' contracted unit' + (totalContracted === 1 ? '' : 's') + '</strong> totalling <strong>' + _sFmtAED(totalContractValue) + '</strong> in sold price. ',
    'Payment plans schedule <strong>' + _sFmtAED(totalMilestoneValue) + '</strong> across all milestones, spanning ' + spanTxt + '. ',
    _sFmtAED(collectedToDate) + ' has fallen due prior to ' + months[month - 1] + ' ' + year + '. ',
    '<strong>' + _sFmtAED(periodExpected) + '</strong> is expected in ' + months[month - 1] + '. ',
    onHandover > 0 ? _sFmtAED(onHandover) + ' is scheduled on handover (undated).' : '',
    '</p></div>',
  ].join('');
}

function _cfKPIs(stats, year, month, months) {
  const { totalContractValue, collectedToDate, periodExpected, next12, beyond12, onHandover } = stats;
  return [
    '<div>',
    '<div style="color:var(--text3);font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">Cash Flow Buckets</div>',
    '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px">',
    _kpiTile('Total Contracted', _sFmtAED(totalContractValue), 'var(--charcoal)', ''),
    _kpiTile('Due Prior', _sFmtAED(collectedToDate), 'var(--text2)', ''),
    _kpiTile(months[month - 1] + ' ' + year, _sFmtAED(periodExpected), 'var(--green)', ''),
    _kpiTile('Next 12 Mo', _sFmtAED(next12), 'var(--blue)', ''),
    _kpiTile('Beyond 12 Mo', _sFmtAED(beyond12), 'var(--sand)', ''),
    _kpiTile('On Handover', _sFmtAED(onHandover), 'var(--amber)', ''),
    '</div></div>',
  ].join('');
}

function _cfChart(stats) {
  const { chartMonths, totalMilestoneValue, firstMonthKey, lastMonthKey } = stats;
  if (!chartMonths.length) {
    return [
      '<div class="card" style="padding:14px">',
      '<div style="font-size:12px;font-weight:600;color:var(--charcoal);margin-bottom:10px">Expected Monthly Inflow</div>',
      '<div style="text-align:center;color:var(--text3);font-size:12px;padding:24px 0">No scheduled milestones yet.</div>',
      '</div>',
    ].join('');
  }

  const PAD_L = 64, PAD_R = 16, PAD_T = 16, PAD_B = 48;
  const H = 260;
  const innerH = H - PAD_T - PAD_B;
  const groupW = 44; // per-bar allocation
  const barW = 26;
  const innerW = Math.max(320, chartMonths.length * groupW);
  const W = PAD_L + innerW + PAD_R;

  const maxVal = Math.max(1, ...chartMonths.map(m => m.amount));

  // Cumulative curve (running total across timeline)
  const cumMax = totalMilestoneValue || 1;
  let running = 0;
  const cumPts = chartMonths.map((m, i) => {
    running += m.amount;
    const x = PAD_L + groupW * i + groupW / 2;
    const y = PAD_T + innerH - (running / cumMax) * innerH;
    return { x, y, running };
  });

  const yTicks = 4;
  const gridLines = [];
  for (let i = 0; i <= yTicks; i++) {
    const y = PAD_T + (innerH * i / yTicks);
    const v = maxVal * (1 - i / yTicks);
    gridLines.push('<line x1="' + PAD_L + '" y1="' + y + '" x2="' + (W - PAD_R) + '" y2="' + y + '" stroke="var(--border)" stroke-width="0.5"/>');
    gridLines.push('<text x="' + (PAD_L - 6) + '" y="' + (y + 3) + '" text-anchor="end" font-size="9" fill="var(--text3)">' + _sFmtAED(v) + '</text>');
  }

  // Show value label only if amount > 0. Show every month label but rotate for readability.
  const bars = chartMonths.map((m, i) => {
    const x = PAD_L + groupW * i + (groupW - barW) / 2;
    const h = m.amount > 0 ? Math.max(2, (m.amount / maxVal) * innerH) : 0;
    const y = PAD_T + innerH - h;
    const fill = m.kind === 'handover' ? 'var(--amber)' : 'var(--green)';
    const valLabel = m.amount > 0 ? '<text x="' + (x + barW / 2) + '" y="' + (y - 4) + '" text-anchor="middle" font-size="8" fill="var(--text2)">' + _sFmtAED(m.amount) + '</text>' : '';
    const labelY = H - PAD_B + 14;
    return [
      h > 0 ? '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + h + '" fill="' + fill + '" rx="2"/>' : '',
      valLabel,
      '<text x="' + (x + barW / 2) + '" y="' + labelY + '" text-anchor="end" font-size="9" fill="var(--text3)" transform="rotate(-45 ' + (x + barW / 2) + ' ' + labelY + ')">' + m.label + '</text>',
    ].join('');
  }).join('');

  // Cumulative line + endpoint dot
  const cumPolyline = cumPts.map(p => p.x + ',' + p.y).join(' ');
  const cumLine = '<polyline points="' + cumPolyline + '" fill="none" stroke="#2B6CB0" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>';
  const lastPt = cumPts[cumPts.length - 1];
  const cumDot = '<circle cx="' + lastPt.x + '" cy="' + lastPt.y + '" r="3" fill="#2B6CB0"/>';
  const cumEndLabel = '<text x="' + lastPt.x + '" y="' + (lastPt.y - 8) + '" text-anchor="middle" font-size="9" font-weight="600" fill="#2B6CB0">' + _sFmtAED(lastPt.running) + '</text>';

  const spanLabel = firstMonthKey && lastMonthKey
    ? _cfMonthLabel(firstMonthKey) + ' → ' + _cfMonthLabel(lastMonthKey) + (stats.onHandoverCount > 0 ? ' + Handover' : '')
    : '';

  return [
    '<div class="card" style="padding:14px">',
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">',
    '<div style="font-size:12px;font-weight:600;color:var(--charcoal)">Expected Cash Inflow &mdash; Full Timeline</div>',
    '<div style="font-size:10px;color:var(--text3)">' + spanLabel + '</div>',
    '</div>',
    '<div style="overflow-x:auto;overflow-y:hidden">',
    '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" style="display:block;min-width:' + W + 'px">' + gridLines.join('') + bars + cumLine + cumDot + cumEndLabel + '</svg>',
    '</div>',
    '<div style="display:flex;gap:14px;font-size:10px;color:var(--text3);margin-top:8px">',
    '<span><span style="display:inline-block;width:10px;height:10px;background:var(--green);border-radius:2px;vertical-align:middle;margin-right:4px"></span>Monthly Expected</span>',
    stats.onHandoverCount > 0 ? '<span><span style="display:inline-block;width:10px;height:10px;background:var(--amber);border-radius:2px;vertical-align:middle;margin-right:4px"></span>On Handover</span>' : '',
    '<span><span style="display:inline-block;width:14px;height:2px;background:#2B6CB0;vertical-align:middle;margin-right:4px"></span>Cumulative</span>',
    '</div>',
    '</div>',
  ].join('');
}

function _cfMonthlyTable(stats, year, month) {
  const { monthRows, onHandover, onHandoverCount, totalMilestoneValue } = stats;
  const th  = label => '<th style="text-align:right;padding:8px 10px;font-weight:500;color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:.05em">' + label + '</th>';
  const thL = label => '<th style="text-align:left;padding:8px 10px;font-weight:500;color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:.05em">' + label + '</th>';
  const anchorKey = year + '-' + String(month).padStart(2, '0');

  let rowsHTML;
  if (!monthRows.length && !onHandoverCount) {
    rowsHTML = '<tr><td colspan="5" style="padding:18px;text-align:center;color:var(--text3);font-size:12px">No scheduled milestones yet.</td></tr>';
  } else {
    rowsHTML = monthRows.map(r => {
      const isAnchor = r.key === anchorKey;
      const bg = isAnchor ? 'background:var(--green-bg);' : '';
      const pct = totalMilestoneValue > 0 ? (r.amount / totalMilestoneValue * 100).toFixed(1) : '0.0';
      return [
        '<tr style="border-bottom:0.5px solid var(--border);' + bg + '">',
        '<td style="padding:8px 10px;font-weight:' + (isAnchor ? '600' : '500') + ';color:var(--charcoal)">' + r.label + (isAnchor ? ' <span style="color:var(--green);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-left:6px">Anchor</span>' : '') + '</td>',
        '<td style="padding:8px 10px;text-align:right;color:var(--text2)">' + r.count + '</td>',
        '<td style="padding:8px 10px;text-align:right;color:var(--green);font-weight:600">' + _sFmtAED(r.amount) + '</td>',
        '<td style="padding:8px 10px;text-align:right;color:var(--charcoal);font-variant-numeric:tabular-nums">' + _sFmtAED(r.cumulative) + '</td>',
        '<td style="padding:8px 10px;text-align:right;color:var(--text3);font-variant-numeric:tabular-nums">' + pct + '%</td>',
        '</tr>',
      ].join('');
    }).join('');
    if (onHandoverCount > 0) {
      const pct = totalMilestoneValue > 0 ? (onHandover / totalMilestoneValue * 100).toFixed(1) : '0.0';
      rowsHTML += [
        '<tr style="border-bottom:0.5px solid var(--border);background:var(--amber-bg)">',
        '<td style="padding:8px 10px;font-weight:600;color:var(--charcoal)">On Handover <span style="color:var(--amber);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-left:6px">Undated</span></td>',
        '<td style="padding:8px 10px;text-align:right;color:var(--text2)">' + onHandoverCount + '</td>',
        '<td style="padding:8px 10px;text-align:right;color:var(--amber);font-weight:600">' + _sFmtAED(onHandover) + '</td>',
        '<td style="padding:8px 10px;text-align:right;color:var(--text3)">&mdash;</td>',
        '<td style="padding:8px 10px;text-align:right;color:var(--text3);font-variant-numeric:tabular-nums">' + pct + '%</td>',
        '</tr>',
      ].join('');
    }
  }
  return [
    '<div>',
    '<div style="color:var(--text3);font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">Monthly Schedule</div>',
    '<div style="background:var(--bg2);border:0.5px solid var(--border);border-radius:8px;overflow:hidden">',
    '<table style="width:100%;border-collapse:collapse;font-size:12px;color:var(--charcoal)">',
    '<thead><tr style="background:var(--bg3);border-bottom:0.5px solid var(--border)">',
    thL('Month') + th('Milestones') + th('Expected') + th('Cumulative') + th('% of Total'),
    '</tr></thead>',
    '<tbody>' + rowsHTML + '</tbody>',
    '</table></div></div>',
  ].join('');
}

async function exportCashFlowReportPDF(year, month) {
  const el = document.getElementById('cashflow-report-container');
  if (!el) { toast('No report to export', 'warning'); return; }
  if (typeof html2pdf === 'undefined') { toast('PDF library not loaded', 'error'); return; }
  const ym = year + '-' + String(month).padStart(2, '0');
  const projSlug = (currentProject?.name || 'Project').replace(/[^A-Za-z0-9]+/g, '_');
  const filename = 'Sales_CashFlow_' + projSlug + '_' + ym + '.pdf';
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
