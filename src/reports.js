// REPORTS MODULE

async function renderReports() {
  const el = document.getElementById('content');
  el.innerHTML = buildReportsHub();
}

function buildReportsHub() {
  const iconFinance = '<svg width="32" height="32" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#EAF3DE"/><path d="M16 8v16M10 20l6 4 6-4M10 12l6-4 6 4" stroke="#3B6D11" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const iconQuality = '<svg width="32" height="32" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#F0EBE2"/><path d="M10 16l4 4 8-8" stroke="#B4A88C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const iconDocs = '<svg width="32" height="32" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#F0EBE2"/><rect x="9" y="10" width="14" height="2" rx="1" fill="#B4A88C"/><rect x="9" y="15" width="10" height="2" rx="1" fill="#B4A88C"/><rect x="9" y="20" width="7" height="2" rx="1" fill="#B4A88C"/></svg>';
  const iconSales = '<svg width="32" height="32" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#F0EBE2"/><path d="M8 22l5-7 4 3 6-9" stroke="#B4A88C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const activeCard = [
    '<div style="background:var(--bg2);border:0.5px solid var(--border);border-radius:var(--radius-lg);padding:22px;cursor:pointer;',
    'box-shadow:0 1px 4px rgba(44,42,36,.05);transition:box-shadow .15s,border-color .15s;display:flex;flex-direction:column;gap:14px"',
    ' onmouseover="this.style.boxShadow=\'0 4px 16px rgba(44,42,36,.1)\';this.style.borderColor=\'var(--border2)\'"',
    ' onmouseout="this.style.boxShadow=\'0 1px 4px rgba(44,42,36,.05)\';this.style.borderColor=\'var(--border)\'"',
    ' onclick="_openFinanceReport()">',
    '<div style="display:flex;align-items:flex-start;justify-content:space-between">',
    iconFinance,
    '<span class="badge badge-success">Live</span>',
    '</div>',
    '<div>',
    '<div style="font-size:14px;font-weight:600;color:var(--charcoal);margin-bottom:5px">Finance Report</div>',
    '<div style="font-size:11px;color:var(--text3);line-height:1.6">Cashflow, certified &amp; paid KPIs,<br>contract breakdown, S-curve progress</div>',
    '</div>',
    '<div style="font-size:11px;font-weight:500;color:var(--green-light)">Open report &rarr;</div>',
    '</div>',
  ].join('');

  const comingSoonCard = (icon, title, desc) => [
    '<div style="background:var(--bg3);border:0.5px solid var(--border);border-radius:var(--radius-lg);padding:22px;',
    'cursor:default;display:flex;flex-direction:column;gap:14px">',
    '<div style="display:flex;align-items:flex-start;justify-content:space-between">',
    icon,
    '<span class="badge badge-neutral">Coming Soon</span>',
    '</div>',
    '<div>',
    '<div style="font-size:14px;font-weight:600;color:var(--charcoal);margin-bottom:5px">' + title + '</div>',
    '<div style="font-size:11px;color:var(--text3);line-height:1.6">' + desc + '</div>',
    '</div>',
    '</div>',
  ].join('');

  return [
    '<div style="padding:24px 24px 0">',
    '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--text3);font-weight:500;margin-bottom:3px">Management Information System</div>',
    '<h1 style="font-size:20px;font-weight:600;color:var(--charcoal);margin:0 0 6px">Reports</h1>',
    '<div style="font-size:12px;color:var(--text2);margin-bottom:22px">Select a report for <strong>' + currentProject.name + '</strong>.</div>',
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px">',
    activeCard,
    comingSoonCard(iconQuality, 'Quality &amp; Site', 'NCRs, punch list, inspection pass rates'),
    comingSoonCard(iconDocs, 'Document Control', 'Drawing register, submittal turnaround, RFIs'),
    comingSoonCard(iconSales, 'Sales &amp; CRM', 'Pipeline, conversion, revenue forecast'),
    '</div>',
    '</div>',
  ].join('');
}

// FINANCE REPORT

function _openFinanceReport() {
  const now = new Date();
  renderFinanceReport(now.getFullYear(), now.getMonth() + 1);
}

async function _fetchFinanceData(projectId) {
  const [contractsRes, certsRes, billsRes, boqItemsRes] = await Promise.all([
    sb.from('contracts').select('id,contractor_name,awarded_value,start_date,end_date').eq('project_id', projectId),
    sb.from('payment_certificates').select('id,contract_id,period_month,period_year,claimed_amount,certified_amount,paid_amount,payment_date,status,reference').eq('project_id', projectId),
    sb.from('boq_bills').select('id,contract_id,total_amount').eq('project_id', projectId),
    sb.from('boq_items').select('bill_id,total_price').eq('project_id', projectId),
  ]);
  const certIds = (certsRes.data || []).map(c => c.id);
  let certItems = [];
  if (certIds.length > 0) {
    const itemsRes = await sb.from('payment_certificate_items').select('certificate_id,retention_amount').in('certificate_id', certIds);
    certItems = itemsRes.data || [];
  }
  return {
    contracts: contractsRes.data || [],
    certs: certsRes.data || [],
    certItems,
    boqBills: billsRes.data || [],
    boqItems: boqItemsRes.data || [],
  };
}

function _calcFinanceStats(data, year, month) {
  const { contracts, certs, certItems, boqBills, boqItems } = data;
  const boqByContract = {};
  boqBills.forEach(b => {
    const items = boqItems.filter(i => i.bill_id === b.id);
    const sum = items.reduce((s, i) => s + (i.total_price || 0), 0);
    boqByContract[b.contract_id] = (boqByContract[b.contract_id] || 0) + sum;
  });
  const retentionByCert = {};
  certItems.forEach(i => {
    retentionByCert[i.certificate_id] = (retentionByCert[i.certificate_id] || 0) + (i.retention_amount || 0);
  });
  const inPeriod = (c, y, m) => c.period_year < y || (c.period_year === y && c.period_month <= m);
  const exactPeriod = (c, y, m) => c.period_year === y && c.period_month === m;
  const priorMonth = month === 1 ? 12 : month - 1;
  const priorYear = month === 1 ? year - 1 : year;
  const cumCerts = certs.filter(c => inPeriod(c, year, month));
  const priorCumCerts = certs.filter(c => inPeriod(c, priorYear, priorMonth));
  const sumField = (arr, f) => arr.reduce((s, c) => s + (c[f] || 0), 0);
  const totalContractValue = contracts.reduce((s, c) => s + (c.awarded_value || 0), 0);
  const certifiedToDate = sumField(cumCerts, 'certified_amount');
  const paidToDate = sumField(cumCerts.filter(c => c.payment_date), 'paid_amount');
  const retentionHeld = cumCerts.reduce((s, c) => s + (retentionByCert[c.id] || 0), 0);
  const outstandingCerts = cumCerts.filter(c => c.status !== 'paid' && (c.certified_amount || 0) > 0);
  const outstandingBalance = outstandingCerts.reduce((s, c) => s + (c.certified_amount || 0) - (c.paid_amount || 0), 0);
  const pctComplete = totalContractValue > 0 ? Math.round((certifiedToDate / totalContractValue) * 100) : 0;
  const priorCertifiedToDate = sumField(priorCumCerts, 'certified_amount');
  const priorPaidToDate = sumField(priorCumCerts.filter(c => c.payment_date), 'paid_amount');
  const periodCerts = certs.filter(c => exactPeriod(c, year, month));
  const priorPeriodCerts = certs.filter(c => exactPeriod(c, priorYear, priorMonth));
  const periodClaimed = sumField(periodCerts, 'claimed_amount');
  const periodCertified = sumField(periodCerts, 'certified_amount');
  const periodPaid = sumField(periodCerts.filter(c => c.payment_date), 'paid_amount');
  const priorPeriodClaimed = sumField(priorPeriodCerts, 'claimed_amount');
  const priorPeriodCertified = sumField(priorPeriodCerts, 'certified_amount');
  const priorPeriodPaid = sumField(priorPeriodCerts.filter(c => c.payment_date), 'paid_amount');
  const contractRows = contracts
    .map(c => {
      const cCerts = cumCerts.filter(x => x.contract_id === c.id);
      const certified = sumField(cCerts, 'certified_amount');
      const paid = sumField(cCerts.filter(x => x.payment_date), 'paid_amount');
      const retention = cCerts.reduce((s, x) => s + (retentionByCert[x.id] || 0), 0);
      const outstanding = cCerts.filter(x => x.status !== 'paid').reduce((s, x) => s + (x.certified_amount || 0) - (x.paid_amount || 0), 0);
      const pct = (c.awarded_value || 0) > 0 ? Math.round((certified / c.awarded_value) * 100) : 0;
      const boqTotal = boqByContract[c.id] || 0;
      return { name: c.contractor_name, awardedValue: c.awarded_value || 0, boqTotal, certified, paid, outstanding, retention, pct };
    })
    .sort((a, b) => b.awardedValue - a.awardedValue);
  const monthMap = [];
  for (let i = 5; i >= 0; i--) {
    let m = month - i; let y = year;
    if (m <= 0) { m += 12; y -= 1; }
    const mc = certs.filter(c => exactPeriod(c, y, m));
    monthMap.push({
      label: new Date(y, m - 1).toLocaleString('default', { month: 'short' }),
      claimed: sumField(mc, 'claimed_amount'),
      certified: sumField(mc, 'certified_amount'),
      paid: sumField(mc.filter(c => c.payment_date), 'paid_amount'),
    });
  }
  const allStarts = contracts.map(c => c.start_date).filter(Boolean).sort();
  const allEnds = contracts.map(c => c.end_date).filter(Boolean).sort();
  const projectStart = allStarts[0] ? new Date(allStarts[0]) : new Date(year, 0);
  const projectEnd = allEnds[allEnds.length - 1] ? new Date(allEnds[allEnds.length - 1]) : new Date(year + 1, 11);
  const totalMonths = Math.max(1, (projectEnd.getFullYear() - projectStart.getFullYear()) * 12 + projectEnd.getMonth() - projectStart.getMonth() + 1);
  const monthlyPlanned = totalContractValue / totalMonths;
  const sCurvePoints = [];
  let cumPlanned = 0; let cumActual = 0;
  for (let i = 0; i < totalMonths; i++) {
    const d = new Date(projectStart.getFullYear(), projectStart.getMonth() + i);
    cumPlanned += monthlyPlanned;
    const mc = certs.filter(c => exactPeriod(c, d.getFullYear(), d.getMonth() + 1));
    cumActual += sumField(mc, 'certified_amount');
    const isPast = d.getFullYear() < year || (d.getFullYear() === year && d.getMonth() + 1 <= month);
    sCurvePoints.push({ month: i, cumPlanned, cumActual: isPast ? cumActual : null });
  }
  return {
    totalContractValue, certifiedToDate, paidToDate, retentionHeld, outstandingBalance, pctComplete,
    priorCertifiedToDate, priorPaidToDate, outstandingCerts,
    periodClaimed, periodCertified, periodPaid,
    periodCertsRefs: periodCerts.map(c => c.reference).filter(Boolean),
    priorPeriodClaimed, priorPeriodCertified, priorPeriodPaid,
    contractRows, monthMap, sCurvePoints, totalMonths,
  };
}

async function renderFinanceReport(year, month) {
  const el = document.getElementById('content');
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Loading...</div>';
  const data = await _fetchFinanceData(currentProject.id);
  const stats = _calcFinanceStats(data, year, month);
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const curYear = new Date().getFullYear();
  const yearOpts = [curYear-2,curYear-1,curYear,curYear+1,curYear+2]
    .map(y => '<option value="' + y + '"' + (y===year?' selected':'') + '>' + y + '</option>').join('');
  const monthOpts = months
    .map((m,i) => '<option value="' + (i+1) + '"' + (i+1===month?' selected':'') + '>' + m + '</option>').join('');
  const container = document.createElement('div');
  container.id = 'finance-report-container';
  container.style.cssText = 'padding-bottom:32px';
  container.innerHTML = buildFinanceReportHTML(stats, year, month, months, yearOpts, monthOpts);
  el.innerHTML = '';
  el.appendChild(container);
}

function buildFinanceReportHTML(stats, year, month, months, yearOpts, monthOpts) {
  const rptYear = "document.getElementById('rpt-year').value";
  const rptMonth = "document.getElementById('rpt-month').value";
  const header = [
    '<div class="page-header" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">',
    '<a href="#" onclick="renderReports();return false" style="font-size:13px;color:var(--accent)">&larr; All Reports</a>',
    '<h1 style="flex:1;margin:0">Finance MIS Report &mdash; ' + currentProject.name + '</h1>',
    '<button class="btn btn-sm btn-secondary" onclick="exportFinanceReportPDF(' + year + ',' + month + ')">&#8595; Export PDF</button>',
    '</div>',
    '<div style="display:flex;align-items:center;gap:8px;padding:0 24px 16px">',
    '<label style="font-size:13px">Period:</label>',
    '<select id="rpt-month" onchange="renderFinanceReport(+' + rptYear + ',+this.value)" style="padding:4px 8px">' + monthOpts + '</select>',
    '<select id="rpt-year" onchange="renderFinanceReport(+this.value,+' + rptMonth + ')" style="padding:4px 8px">' + yearOpts + '</select>',
    '<span style="font-size:11px;color:var(--text-muted)">Generated ' + new Date().toLocaleDateString('en-GB') + '</span>',
    '</div>',
  ].join('');
  const sections = [
    '<div style="padding:0 24px;display:flex;flex-direction:column;gap:16px">',
    _financeSummaryNarrative(stats, year, month, months),
    _financeCumulativeKPIs(stats),
    _financePeriodKPIs(stats, year, month, months),
    _financeContractTable(stats),
    _financeCharts(stats),
    '</div>',
  ].join('');
  return header + sections;
}

function _financeSummaryNarrative(stats, year, month, months) {
  const fmt = v => 'AED ' + (v >= 1e6 ? (v/1e6).toFixed(1)+'M' : (v/1e3).toFixed(0)+'K');
  const { totalContractValue, certifiedToDate, pctComplete, periodCertified, priorPeriodCertified, outstandingCerts, retentionHeld } = stats;
  const delta = periodCertified - priorPeriodCertified;
  const deltaPct = priorPeriodCertified > 0 ? Math.abs(Math.round((delta/priorPeriodCertified)*100)) : null;
  const priorLabel = months[month === 1 ? 11 : month - 2];
  const deltaStr = deltaPct !== null
    ? (delta >= 0 ? '&#8593; ' + deltaPct + '% vs ' + priorLabel : '&#8595; ' + deltaPct + '% vs ' + priorLabel)
    : 'no prior period data';
  const outstandingStr = outstandingCerts.length > 0
    ? outstandingCerts.map(c => (c.reference || 'IPC') + ' (' + fmt((c.certified_amount||0) - (c.paid_amount||0)) + ')').join(', ') + ' outstanding. '
    : '';
  return [
    '<div style="background:rgba(74,222,128,.08);border-left:3px solid #4ade80;border-radius:4px;padding:12px 16px">',
    '<div style="color:#86efac;font-size:10px;font-weight:700;letter-spacing:1px;margin-bottom:6px">EXECUTIVE SUMMARY</div>',
    '<p style="color:var(--text);font-size:13px;line-height:1.7;margin:0">',
    'As of ' + months[month-1] + ' ' + year + ', the project is <strong>' + pctComplete + '% complete</strong>. ',
    fmt(certifiedToDate) + ' has been certified against a total contract value of ' + fmt(totalContractValue) + '. ',
    'This period, ' + fmt(periodCertified) + ' was certified &mdash; ' + deltaStr + '. ',
    outstandingStr,
    retentionHeld > 0 ? 'Retention of ' + fmt(retentionHeld) + ' is held to date.' : '',
    '</p></div>',
  ].join('');
}

function _delta(current, prior) {
  const diff = current - prior;
  if (prior === 0 && diff === 0) return '';
  const abs = Math.abs(diff);
  const fmtAmt = abs >= 1e6 ? 'AED ' + (abs/1e6).toFixed(1)+'M' : 'AED ' + (abs/1e3).toFixed(0)+'K';
  const color = diff >= 0 ? '#4ade80' : '#f87171';
  const arrow = diff >= 0 ? '&#8593;' : '&#8595;';
  const sign = diff >= 0 ? '+' : '&minus;';
  return '<div style="color:' + color + ';font-size:10px">' + arrow + ' ' + sign + fmtAmt + '</div>';
}

function _financeCumulativeKPIs(stats) {
  const fmt = v => 'AED ' + (v >= 1e6 ? (v/1e6).toFixed(1)+'M' : (v/1e3).toFixed(0)+'K');
  const { totalContractValue, certifiedToDate, paidToDate, outstandingBalance, retentionHeld, pctComplete,
          priorCertifiedToDate, priorPaidToDate } = stats;
  const tile = (label, value, color, extra) =>
    '<div style="background:var(--surface2,#1e2a3e);padding:10px;border-radius:6px;text-align:center">' +
    '<div style="color:var(--text-muted);font-size:9px;font-weight:700;letter-spacing:1px;margin-bottom:4px">' + label + '</div>' +
    '<div style="color:' + color + ';font-weight:700;font-size:14px">' + value + '</div>' +
    (extra || '') + '</div>';
  return [
    '<div>',
    '<div style="color:var(--text-muted);font-size:10px;font-weight:700;letter-spacing:1px;margin-bottom:8px">PROJECT TO DATE (CUMULATIVE)</div>',
    '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px">',
    tile('CONTRACT VALUE', fmt(totalContractValue), 'var(--text)', ''),
    tile('CERTIFIED', fmt(certifiedToDate), '#4ade80', _delta(certifiedToDate, priorCertifiedToDate)),
    tile('PAID', fmt(paidToDate), '#60a5fa', _delta(paidToDate, priorPaidToDate)),
    tile('OUTSTANDING', fmt(outstandingBalance), outstandingBalance > 0 ? '#f87171' : 'var(--text)', ''),
    tile('RETENTION', fmt(retentionHeld), '#f59e0b', ''),
    tile('% COMPLETE', pctComplete + '%', '#a78bfa', ''),
    '</div></div>',
  ].join('');
}

function _financePeriodKPIs(stats, year, month, months) {
  const fmt = v => 'AED ' + (v >= 1e6 ? (v/1e6).toFixed(1)+'M' : (v/1e3).toFixed(0)+'K');
  const { periodClaimed, periodCertified, periodPaid, periodCertsRefs,
          priorPeriodClaimed, priorPeriodCertified, priorPeriodPaid } = stats;
  const tile = (label, value, color, extra) =>
    '<div style="background:var(--surface2,#1e2a3e);padding:10px;border-radius:6px;text-align:center;border:1px solid var(--border)">' +
    '<div style="color:var(--text-muted);font-size:9px;font-weight:700;letter-spacing:1px;margin-bottom:4px">' + label + '</div>' +
    '<div style="color:' + color + ';font-weight:700;font-size:14px">' + value + '</div>' +
    (extra || '') + '</div>';
  const certsExtra = periodCertsRefs.length > 0
    ? '<div style="color:var(--text-muted);font-size:10px">' + periodCertsRefs.join(', ') + '</div>'
    : '';
  return [
    '<div>',
    '<div style="color:var(--text-muted);font-size:10px;font-weight:700;letter-spacing:1px;margin-bottom:8px">THIS PERIOD &mdash; ' + months[month-1].toUpperCase() + ' ' + year + '</div>',
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">',
    tile('CLAIMED', fmt(periodClaimed), 'var(--text)', _delta(periodClaimed, priorPeriodClaimed)),
    tile('CERTIFIED', fmt(periodCertified), '#4ade80', _delta(periodCertified, priorPeriodCertified)),
    tile('PAID', fmt(periodPaid), '#60a5fa', _delta(periodPaid, priorPeriodPaid)),
    tile('CERTS ISSUED', String(periodCertsRefs.length), 'var(--text)', certsExtra),
    '</div></div>',
  ].join('');
}

function _financeContractTable(stats) {
  const fmt = v => v >= 1e6 ? (v/1e6).toFixed(2)+'M' : (v/1e3).toFixed(0)+'K';
  const { contractRows } = stats;
  if (!contractRows.length) return '<p class="subtitle">No contracts found for this project.</p>';
  const rows = contractRows.map(r => [
    '<tr style="border-bottom:1px solid var(--border)">',
    '<td style="padding:6px 8px">' + (r.name || '&mdash;') + '</td>',
    '<td style="text-align:right;padding:6px 8px">' + fmt(r.awardedValue) + '</td>',
    '<td style="text-align:right;padding:6px 8px">' + (r.boqTotal ? fmt(r.boqTotal) : '&mdash;') + '</td>',
    '<td style="text-align:right;padding:6px 8px;color:#4ade80">' + fmt(r.certified) + '</td>',
    '<td style="text-align:right;padding:6px 8px;color:#60a5fa">' + fmt(r.paid) + '</td>',
    '<td style="text-align:right;padding:6px 8px;color:' + (r.outstanding > 0 ? '#f87171' : 'var(--text)') + '">' + fmt(r.outstanding) + '</td>',
    '<td style="text-align:right;padding:6px 8px;color:#f59e0b">' + fmt(r.retention) + '</td>',
    '<td style="text-align:right;padding:6px 8px;color:#a78bfa">' + r.pct + '%</td>',
    '</tr>',
  ].join('')).join('');
  return [
    '<div>',
    '<div style="color:var(--text-muted);font-size:10px;font-weight:700;letter-spacing:1px;margin-bottom:8px">CONTRACT BREAKDOWN</div>',
    '<table style="width:100%;border-collapse:collapse;font-size:12px">',
    '<thead><tr style="color:var(--text-muted);font-size:10px;border-bottom:1px solid var(--border)">',
    '<th style="text-align:left;padding:6px 8px">CONTRACTOR</th>',
    '<th style="text-align:right;padding:6px 8px">AWARDED</th>',
    '<th style="text-align:right;padding:6px 8px">BOQ</th>',
    '<th style="text-align:right;padding:6px 8px">CERTIFIED</th>',
    '<th style="text-align:right;padding:6px 8px">PAID</th>',
    '<th style="text-align:right;padding:6px 8px">OUTSTANDING</th>',
    '<th style="text-align:right;padding:6px 8px">RETENTION</th>',
    '<th style="text-align:right;padding:6px 8px">%</th>',
    '</tr></thead>',
    '<tbody>' + rows + '</tbody>',
    '</table></div>',
  ].join('');
}

function _financeCharts(stats) {
  const { monthMap, sCurvePoints, totalMonths, totalContractValue } = stats;
  const plotH = 80;
  const allVals = monthMap.flatMap(m => [m.claimed, m.certified, m.paid]);
  const maxVal = Math.max(...allVals, 1);
  const barW = 10; const barGap = 2; const groupGap = 8;
  const groupW = barW * 3 + barGap * 2 + groupGap;
  const svgW = monthMap.length * groupW + 20;
  const cashflowBars = monthMap.map((m, i) => {
    const x = 10 + i * groupW;
    const hClaim = m.claimed > 0 ? Math.max(1, Math.round((m.claimed / maxVal) * plotH)) : 0;
    const hCert = m.certified > 0 ? Math.max(1, Math.round((m.certified / maxVal) * plotH)) : 0;
    const hPaid = m.paid > 0 ? Math.max(1, Math.round((m.paid / maxVal) * plotH)) : 0;
    return [
      '<rect x="' + x + '" y="' + (plotH - hClaim) + '" width="' + barW + '" height="' + hClaim + '" fill="#64748b" rx="1"/>',
      '<rect x="' + (x + barW + barGap) + '" y="' + (plotH - hCert) + '" width="' + barW + '" height="' + hCert + '" fill="#4ade80" rx="1"/>',
      '<rect x="' + (x + (barW + barGap) * 2) + '" y="' + (plotH - hPaid) + '" width="' + barW + '" height="' + hPaid + '" fill="#60a5fa" rx="1"/>',
      '<text x="' + (x + groupW/2 - groupGap/2) + '" y="' + (plotH + 12) + '" fill="#64748b" font-size="8" text-anchor="middle">' + m.label + '</text>',
    ].join('');
  }).join('');
  const cashflowSVG = '<svg width="' + svgW + '" height="' + (plotH + 18) + '" viewBox="0 0 ' + svgW + ' ' + (plotH + 18) + '" style="overflow:visible">' + cashflowBars + '</svg>';
  const cashflowChart = [
    '<div>',
    '<div style="color:var(--text-muted);font-size:9px;margin-bottom:6px">MONTHLY CASHFLOW (Claimed / Certified / Paid)</div>',
    cashflowSVG,
    '<div style="display:flex;gap:10px;font-size:10px;color:var(--text-muted);margin-top:4px">',
    '<span><span style="color:#64748b">&#9646;</span> Claimed</span>',
    '<span><span style="color:#4ade80">&#9646;</span> Certified</span>',
    '<span><span style="color:#60a5fa">&#9646;</span> Paid</span>',
    '</div></div>',
  ].join('');
  const sCurveW = 240; const sCurveH = 80;
  const maxCum = totalContractValue || 1;
  const ptX = (idx) => Math.round((idx / Math.max(totalMonths - 1, 1)) * sCurveW);
  const ptY = (val) => Math.round(sCurveH - (val / maxCum) * sCurveH);
  const plannedPts = sCurvePoints.map((p, i) => ptX(i) + ',' + ptY(p.cumPlanned)).join(' ');
  const actualFiltered = sCurvePoints.filter(p => p.cumActual !== null);
  const actualPts = actualFiltered.map(p => ptX(sCurvePoints.indexOf(p)) + ',' + ptY(p.cumActual)).join(' ');
  const lastActual = actualFiltered[actualFiltered.length - 1];
  const lastIdx = lastActual ? sCurvePoints.indexOf(lastActual) : -1;
  const sCurveParts = ['<svg width="' + sCurveW + '" height="' + (sCurveH + 4) + '" viewBox="0 0 ' + sCurveW + ' ' + (sCurveH + 4) + '">'];
  if (plannedPts) sCurveParts.push('<polyline points="' + plannedPts + '" fill="none" stroke="#334155" stroke-width="1.5" stroke-dasharray="4,2"/>');
  if (actualPts) sCurveParts.push('<polyline points="' + actualPts + '" fill="none" stroke="#4ade80" stroke-width="2"/>');
  if (lastIdx >= 0) sCurveParts.push('<circle cx="' + ptX(lastIdx) + '" cy="' + ptY(lastActual.cumActual) + '" r="3" fill="#4ade80"/>');
  sCurveParts.push('</svg>');
  const sCurve = [
    '<div>',
    '<div style="color:var(--text-muted);font-size:9px;margin-bottom:6px">S-CURVE (Cumulative Certified vs Planned)</div>',
    sCurveParts.join(''),
    '<div style="display:flex;gap:10px;font-size:10px;color:var(--text-muted);margin-top:4px">',
    '<span style="color:#4ade80">&#8212; Actual</span>',
    '<span style="color:#64748b">- - Planned</span>',
    '</div></div>',
  ].join('');
  return [
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">',
    '<div style="background:var(--surface2,#1e2a3e);border-radius:6px;padding:12px">' + cashflowChart + '</div>',
    '<div style="background:var(--surface2,#1e2a3e);border-radius:6px;padding:12px">' + sCurve + '</div>',
    '</div>',
  ].join('');
}

function exportFinanceReportPDF(year, month) {
  const el = document.getElementById('finance-report-container');
  if (!el) { toast('Report not loaded', 'error'); return; }
  const projectName = (currentProject.name || 'Project').replace(/\s+/g, '_');
  const mm = String(month).padStart(2, '0');
  const filename = 'Finance_MIS_' + projectName + '_' + year + '-' + mm + '.pdf';
  const opt = {
    margin: 8, filename,
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
  };
  html2pdf().set(opt).from(el).save();
}


