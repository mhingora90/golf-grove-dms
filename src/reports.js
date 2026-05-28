// REPORTS MODULE

async function renderReports() {
  document.getElementById('content').innerHTML = buildReportsHub();
}

function buildReportsHub() {
  const proj = (currentProject?.name || '').replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
  return [
    '<div style="display:flex;align-items:baseline;gap:10px;margin-bottom:14px">',
    '<h1 style="font-size:18px;font-weight:500;color:var(--charcoal);letter-spacing:-.2px;margin:0">Reports</h1>',
    '<span style="font-size:11px;color:var(--text3)">' + proj + '</span>',
    '</div>',

    // Featured live report — uses .card class to match dashboard cards
    '<div class="card" style="margin-bottom:14px;cursor:pointer;transition:box-shadow .15s"',
    ' onmouseover="this.style.boxShadow=\'0 4px 14px rgba(44,42,36,.10)\'"',
    ' onmouseout="this.style.boxShadow=\'0 1px 4px rgba(44,42,36,.05)\'"',
    ' onclick="_openFinanceReport()">',
    // Card header (matches dashboard card-header pattern)
    '<div style="padding:12px 14px;border-bottom:0.5px solid var(--border);display:flex;justify-content:space-between;align-items:center">',
    '<div style="display:flex;align-items:center;gap:8px">',
    '<div style="width:22px;height:22px;border-radius:6px;background:var(--green-bg);display:flex;align-items:center;justify-content:center;flex-shrink:0">',
    '<svg width="13" height="13" viewBox="0 0 18 18" fill="none"><path d="M3 14V9M7 14V6M11 14V9M15 14V4" stroke="#3B6D11" stroke-width="1.6" stroke-linecap="round"/></svg>',
    '</div>',
    '<span style="font-size:12px;font-weight:500;color:var(--charcoal)">Finance Report</span>',
    '<span class="badge badge-success" style="font-size:9px">Live</span>',
    '</div>',
    '<span style="font-size:11px;color:var(--text3)">Updated monthly</span>',
    '</div>',
    // Card body
    '<div style="padding:14px;display:grid;grid-template-columns:1fr auto;align-items:end;gap:16px">',
    '<div>',
    '<div style="font-size:11px;color:var(--text2);line-height:1.6;max-width:520px;margin-bottom:10px">',
    'Period cashflow, certified &amp; paid KPIs with month-on-month delta, contract breakdown table, monthly cashflow bars, S-curve progress. A4 PDF export.',
    '</div>',
    '<div style="display:flex;gap:6px;flex-wrap:wrap">',
    _hubChip('Contract breakdown'),
    _hubChip('S-curve'),
    _hubChip('Cashflow'),
    _hubChip('PDF export'),
    '</div>',
    '</div>',
    '<div style="display:flex;align-items:center;gap:5px;padding:7px 12px;background:var(--green-bg);border:0.5px solid #C0DD97;border-radius:8px;white-space:nowrap;font-size:11px;font-weight:500;color:var(--green)">',
    'Open report',
    '<svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M3 7h8M8 4l3 3-3 3" stroke="#3B6D11" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    '</div>',
    '</div>',
    '</div>',

    // Section label — matches dashboard "Open items" style
    '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);font-weight:500;margin:18px 0 8px">In Development</div>',
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">',
    _hubSoonCard(
      '<svg width="13" height="13" viewBox="0 0 15 15" fill="none"><path d="M3 7.5l3 3 6-6" stroke="#B4A88C" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      'Quality &amp; Site', 'NCRs, punch list, inspection rates'),
    _hubSoonCard(
      '<svg width="13" height="13" viewBox="0 0 15 15" fill="none"><rect x="3" y="2" width="9" height="11" rx="1.5" stroke="#B4A88C" stroke-width="1.2"/><path d="M5 5.5h5M5 8h3" stroke="#B4A88C" stroke-width="1" stroke-linecap="round"/></svg>',
      'Document Control', 'Submittals, drawings, RFI turnaround'),
    _hubSoonCard(
      '<svg width="13" height="13" viewBox="0 0 15 15" fill="none"><path d="M2 11l3-4.5 2.5 2L11 4" stroke="#B4A88C" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      'Sales &amp; CRM', 'Pipeline, conversion, revenue forecast'),
    '</div>',
  ].join('');
}

function _hubChip(label) {
  return '<span style="font-size:10px;color:var(--text3);background:var(--bg3);border:0.5px solid var(--border);padding:2px 8px;border-radius:6px;font-weight:500">' + label + '</span>';
}

function _hubSoonCard(iconSvg, title, desc) {
  return [
    '<div class="card" style="margin:0;padding:12px 14px;display:flex;flex-direction:column;gap:10px">',
    '<div style="display:flex;align-items:center;justify-content:space-between">',
    '<div style="width:24px;height:24px;border-radius:6px;background:var(--bg3);display:flex;align-items:center;justify-content:center">',
    iconSvg,
    '</div>',
    '<span class="badge badge-neutral" style="font-size:9px">Soon</span>',
    '</div>',
    '<div>',
    '<div style="font-size:12px;font-weight:500;color:var(--charcoal);margin-bottom:2px">' + title + '</div>',
    '<div style="font-size:10px;color:var(--text3);line-height:1.5">' + desc + '</div>',
    '</div>',
    '</div>',
  ].join('');
}

// ── Finance Report ────────────────────────────────────────────────

function _openFinanceReport() {
  const now = new Date();
  renderFinanceReport(now.getFullYear(), now.getMonth() + 1);
}

async function _fetchFinanceData(projectId) {
  const [contractsRes, certsRes, billsRes] = await Promise.all([
    sb.from('contracts').select('id,name,contractor,contract_value,award_date,sort_order')
      .eq('project_id', projectId).order('sort_order').order('created_at'),
    sb.from('payment_certificates')
      .select('id,cert_no,contract_id,status,retention_pct,advance_recovery_pct,vat_pct,previously_paid,amount_paid,mobilisation_advance,submitted_date,certified_date,paid_date')
      .eq('project_id', projectId),
    sb.from('boq_bills').select('id,contract_id').eq('project_id', projectId),
  ]);
  const certIds = (certsRes.data || []).map(c => c.id);
  const billIds = (billsRes.data || []).map(b => b.id);
  const [certItemsRes, boqItemsRes] = await Promise.all([
    certIds.length
      ? sb.from('payment_certificate_items').select('cert_id,contractor_amount,consultant_amount').in('cert_id', certIds)
      : Promise.resolve({ data: [] }),
    billIds.length
      ? sb.from('boq_items').select('bill_id,total').in('bill_id', billIds)
      : Promise.resolve({ data: [] }),
  ]);
  return {
    contracts: contractsRes.data || [],
    certs: certsRes.data || [],
    certItems: certItemsRes.data || [],
    boqBills: billsRes.data || [],
    boqItems: boqItemsRes.data || [],
  };
}

function _netPay(c, certAmt) {
  const gross = (certAmt[c.id] || {}).certified || 0;
  const rp = c.retention_pct || 0;
  const ap = c.advance_recovery_pct || 0;
  const vp = c.vat_pct || 0;
  const net = gross * (1 - rp / 100 - ap / 100) - (c.previously_paid || 0);
  return net + net * vp / 100;
}

function _calcFinanceStats(data, year, month) {
  const { contracts, certs, certItems, boqBills, boqItems } = data;

  // cert_id → { claimed: sum(contractor_amount), certified: sum(consultant_amount) }
  const certAmt = {};
  certItems.forEach(i => {
    if (!certAmt[i.cert_id]) certAmt[i.cert_id] = { claimed: 0, certified: 0 };
    certAmt[i.cert_id].claimed += i.contractor_amount || 0;
    certAmt[i.cert_id].certified += i.consultant_amount || 0;
  });

  // BOQ totals by contract
  const billToContract = {};
  boqBills.forEach(b => { billToContract[b.id] = b.contract_id; });
  const boqByContract = {};
  boqItems.forEach(i => {
    const cid = billToContract[i.bill_id];
    if (cid) boqByContract[cid] = (boqByContract[cid] || 0) + (i.total || 0);
  });

  // Date helpers
  const dCert = c => c.certified_date ? new Date(c.certified_date) : (c.submitted_date ? new Date(c.submitted_date) : null);
  const dPaid = c => c.paid_date ? new Date(c.paid_date) : (c.certified_date ? new Date(c.certified_date) : null);
  const dSub  = c => c.submitted_date ? new Date(c.submitted_date) : null;
  const beforeOrIn = (d, y, m) => d && (d.getFullYear() < y || (d.getFullYear() === y && d.getMonth() + 1 <= m));
  const inMonth    = (d, y, m) => d && d.getFullYear() === y && d.getMonth() + 1 === m;

  const priorMonth = month === 1 ? 12 : month - 1;
  const priorYear  = month === 1 ? year - 1 : year;

  // Certs with no dates but certified/paid status count unconditionally toward cumulative totals
  const isCertified = c => c.status === 'Certified' || c.status === 'Paid';
  const cumCerts      = certs.filter(c => { const d = dCert(c); return d ? beforeOrIn(d, year, month) : isCertified(c); });
  const priorCumCerts = certs.filter(c => { const d = dCert(c); return d ? beforeOrIn(d, priorYear, priorMonth) : false; });

  const totalContractValue = contracts.reduce((s, c) => s + (c.contract_value || 0), 0);
  const totalBOQ           = Object.values(boqByContract).reduce((s, v) => s + v, 0);
  const pctDenominator     = totalContractValue > 0 ? totalContractValue : totalBOQ;

  const certifiedToDate = cumCerts.reduce((s, c) => s + ((certAmt[c.id] || {}).certified || 0), 0);
  const paidToDate      = certs.filter(c => { const d = dPaid(c); return d ? beforeOrIn(d, year, month) : c.status === 'Paid'; }).reduce((s, c) => s + (c.amount_paid || 0), 0);
  const retentionHeld   = cumCerts.reduce((s, c) => s + ((certAmt[c.id] || {}).certified || 0) * (c.retention_pct || 0) / 100, 0);

  const outstandingList    = cumCerts.filter(c => c.status !== 'Paid');
  const outstandingBalance = outstandingList.reduce((s, c) => s + Math.max(0, _netPay(c, certAmt) - (c.amount_paid || 0)), 0);
  const pctComplete        = pctDenominator > 0 ? parseFloat((certifiedToDate / pctDenominator * 100).toFixed(1)) : 0;

  const priorCertifiedToDate = priorCumCerts.reduce((s, c) => s + ((certAmt[c.id] || {}).certified || 0), 0);
  const priorPaidToDate      = certs.filter(c => beforeOrIn(dPaid(c), priorYear, priorMonth)).reduce((s, c) => s + (c.amount_paid || 0), 0);

  // Period KPIs — claimed bucketed by certified_date so claimed/certified always align
  const periodCerts    = certs.filter(c => inMonth(dCert(c), year, month));
  const priorPeriodC   = certs.filter(c => inMonth(dCert(c), priorYear, priorMonth));

  const periodClaimed        = periodCerts.reduce((s, c) => s + ((certAmt[c.id] || {}).claimed || 0), 0);
  const periodCertified      = periodCerts.reduce((s, c) => s + ((certAmt[c.id] || {}).certified || 0), 0);
  const periodPaid           = certs.filter(c => inMonth(dPaid(c), year, month)).reduce((s, c) => s + (c.amount_paid || 0), 0);
  const priorPeriodClaimed   = priorPeriodC.reduce((s, c) => s + ((certAmt[c.id] || {}).claimed || 0), 0);
  const priorPeriodCertified = priorPeriodC.reduce((s, c) => s + ((certAmt[c.id] || {}).certified || 0), 0);
  const priorPeriodPaid      = certs.filter(c => inMonth(dPaid(c), priorYear, priorMonth)).reduce((s, c) => s + (c.amount_paid || 0), 0);

  const fmtK = v => 'AED ' + (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : (v / 1e3).toFixed(0) + 'K');
  const outstandingStr = outstandingList.length
    ? outstandingList.map(c => {
        const bal = Math.max(0, _netPay(c, certAmt) - (c.amount_paid || 0));
        return (c.cert_no || 'IPC') + ' (' + fmtK(bal) + ')';
      }).join(', ') + ' outstanding.'
    : '';

  // Certs with no contract_id: attribute to the sole contract, or skip if multiple
  const unlinkedCerts = certs.filter(x => !x.contract_id);
  const soloContractId = contracts.length === 1 ? contracts[0].id : null;

  // Contract rows
  const contractRows = contracts.map(c => {
    const linked = certs.filter(x => x.contract_id === c.id);
    const cc = soloContractId === c.id ? [...linked, ...unlinkedCerts] : linked;
    const cumCC   = cc.filter(x => beforeOrIn(dCert(x), year, month));
    const certified  = cumCC.reduce((s, x) => s + ((certAmt[x.id] || {}).certified || 0), 0);
    const paid       = cc.filter(x => beforeOrIn(dPaid(x), year, month)).reduce((s, x) => s + (x.amount_paid || 0), 0);
    const retention  = cumCC.reduce((s, x) => s + ((certAmt[x.id] || {}).certified || 0) * (x.retention_pct || 0) / 100, 0);
    const outstanding = cumCC.filter(x => x.status !== 'Paid').reduce((s, x) => s + Math.max(0, _netPay(x, certAmt) - (x.amount_paid || 0)), 0);
    const pct = (c.contract_value || 0) > 0 ? Math.min(100, Math.round((certified / c.contract_value) * 100)) : 0;
    return { name: c.name, contractor: c.contractor, awardedValue: c.contract_value || 0, boqTotal: boqByContract[c.id] || 0, certified, paid, outstanding, retention, pct };
  }).sort((a, b) => b.awardedValue - a.awardedValue);

  // Monthly cashflow (last 6 months)
  const monthMap = [];
  for (let i = 5; i >= 0; i--) {
    let m = month - i; let y = year;
    if (m <= 0) { m += 12; y -= 1; }
    const certInM = certs.filter(x => inMonth(dCert(x), y, m));
    const paidInM = certs.filter(x => inMonth(dPaid(x), y, m));
    monthMap.push({
      label:     new Date(y, m - 1).toLocaleString('default', { month: 'short' }),
      claimed:   certInM.reduce((s, x) => s + ((certAmt[x.id] || {}).claimed || 0), 0),
      certified: certInM.reduce((s, x) => s + ((certAmt[x.id] || {}).certified || 0), 0),
      paid:      paidInM.reduce((s, x) => s + (x.amount_paid || 0), 0),
    });
  }

  // S-curve
  const allStarts  = contracts.map(c => c.award_date).filter(Boolean).sort();
  const allEnds    = [].filter(Boolean).sort(); // end_date not in schema
  const projStart  = allStarts[0] ? new Date(allStarts[0]) : new Date(year, 0);
  const projEnd    = allEnds[allEnds.length - 1] ? new Date(allEnds[allEnds.length - 1]) : new Date(year + 1, 11);
  const totalMonths = Math.max(1, (projEnd.getFullYear() - projStart.getFullYear()) * 12 + projEnd.getMonth() - projStart.getMonth() + 1);
  const monthlyPlanned = totalContractValue / totalMonths;
  const sCurvePoints = [];
  let cumPlanned = 0; let cumActual = 0;
  for (let i = 0; i < totalMonths; i++) {
    const d = new Date(projStart.getFullYear(), projStart.getMonth() + i);
    cumPlanned += monthlyPlanned;
    const mc = certs.filter(x => inMonth(dCert(x), d.getFullYear(), d.getMonth() + 1));
    cumActual += mc.reduce((s, x) => s + ((certAmt[x.id] || {}).certified || 0), 0);
    const isPast = d.getFullYear() < year || (d.getFullYear() === year && d.getMonth() + 1 <= month);
    sCurvePoints.push({ month: i, cumPlanned, cumActual: isPast ? cumActual : null });
  }

  return {
    totalContractValue, certifiedToDate, paidToDate, retentionHeld, outstandingBalance, pctComplete,
    priorCertifiedToDate, priorPaidToDate, outstandingStr,
    periodClaimed, periodCertified, periodPaid,
    periodCertsRefs: periodCerts.map(c => c.cert_no).filter(Boolean),
    priorPeriodClaimed, priorPeriodCertified, priorPeriodPaid,
    contractRows, monthMap, sCurvePoints, totalMonths,
  };
}

async function renderFinanceReport(year, month) {
  const mm = String(month).padStart(2, '0');
  if (location.hash !== '#reports-finance/' + year + '-' + mm) {
    history.replaceState(null, '', '#reports-finance/' + year + '-' + mm);
  }
  currentPage = 'reports-finance';
  document.getElementById('page-title').textContent = PAGE_TITLES['reports-finance'];
  const el = document.getElementById('content');
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Loading...</div>';
  const data = await _fetchFinanceData(currentProject.id);
  const stats = _calcFinanceStats(data, year, month);
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const curYear = new Date().getFullYear();
  const yearOpts  = [curYear-2,curYear-1,curYear,curYear+1,curYear+2]
    .map(y => '<option value="' + y + '"' + (y === year ? ' selected' : '') + '>' + y + '</option>').join('');
  const monthOpts = months
    .map((m, i) => '<option value="' + (i + 1) + '"' + (i + 1 === month ? ' selected' : '') + '>' + m + '</option>').join('');
  const container = document.createElement('div');
  container.id = 'finance-report-container';
  container.style.cssText = 'padding-bottom:32px';
  container.innerHTML = buildFinanceReportHTML(stats, year, month, months, yearOpts, monthOpts);
  el.innerHTML = '';
  el.appendChild(container);
}

function buildFinanceReportHTML(stats, year, month, months, yearOpts, monthOpts) {
  const rptYear  = "document.getElementById('rpt-year').value";
  const rptMonth = "document.getElementById('rpt-month').value";
  const header = [
    // Breadcrumb + title row
    '<div style="padding:20px 24px 0;display:flex;flex-direction:column;gap:14px">',
    '<div style="display:flex;align-items:center;gap:6px">',
    '<a href="#" onclick="nav(\'reports\', document.getElementById(\'n-reports\'));return false" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:500;color:var(--text3);text-decoration:none;padding:4px 8px;border-radius:6px;background:var(--bg3);border:0.5px solid var(--border);transition:color .15s"',
    ' onmouseover="this.style.color=\'var(--charcoal)\'" onmouseout="this.style.color=\'var(--text3)\'">',
    '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8 2L4 6l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'All Reports</a>',
    '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="#B4A88C" stroke-width="1.2" stroke-linecap="round"/></svg>',
    '<span style="font-size:11px;color:var(--text2);font-weight:500">Finance Report</span>',
    '</div>',
    // Title + export button
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">',
    '<div>',
    '<h1 style="margin:0 0 2px;font-size:18px;font-weight:600;color:var(--charcoal);letter-spacing:-.3px">Finance MIS Report</h1>',
    '<div style="font-size:12px;color:var(--text3)">' + currentProject.name + '</div>',
    '</div>',
    '<button class="btn btn-sm btn-secondary" style="flex-shrink:0;margin-top:2px" onclick="exportFinanceReportPDF(' + year + ',' + month + ')">',
    '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="margin-right:4px"><path d="M6 2v6M3 6l3 3 3-3M2 10h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'Export PDF</button>',
    '</div>',
    // Period selector bar
    '<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--bg3);border:0.5px solid var(--border);border-radius:8px">',
    '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1.5" y="2.5" width="10" height="9" rx="1.5" stroke="#B4A88C" stroke-width="1.1"/><path d="M4 1.5v2M9 1.5v2M1.5 5.5h10" stroke="#B4A88C" stroke-width="1.1" stroke-linecap="round"/></svg>',
    '<span style="font-size:11px;font-weight:500;color:var(--text2)">Period</span>',
    '<select id="rpt-month" class="filter-sel" onchange="renderFinanceReport(+' + rptYear + ',+this.value)">' + monthOpts + '</select>',
    '<select id="rpt-year"  class="filter-sel" onchange="renderFinanceReport(+this.value,+' + rptMonth + ')">' + yearOpts + '</select>',
    '<span style="margin-left:auto;font-size:10px;color:var(--text3)">Generated ' + new Date().toLocaleDateString('en-GB') + '</span>',
    '</div>',
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
  const fmt = v => 'AED ' + (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : (v / 1e3).toFixed(0) + 'K');
  const { totalContractValue, certifiedToDate, pctComplete, periodCertified, outstandingStr, retentionHeld } = stats;
  const periodPct = certifiedToDate > 0 ? Math.round((periodCertified / certifiedToDate) * 100) : 0;
  const periodStr = periodCertified > 0
    ? fmt(periodCertified) + ' (' + periodPct + '% of certified to date)'
    : fmt(periodCertified);
  return [
    '<div style="background:var(--green-bg);border-left:3px solid var(--green);border-radius:0 8px 8px 0;padding:14px 18px">',
    '<div style="color:var(--green);font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px">Executive Summary</div>',
    '<p style="color:var(--charcoal);font-size:13px;line-height:1.75;margin:0">',
    'As of ' + months[month - 1] + ' ' + year + ', the project is <strong>' + pctComplete + '% complete</strong>. ',
    fmt(certifiedToDate) + ' has been certified against a total contract value of ' + fmt(totalContractValue) + '. ',
    'This period, ' + periodStr + ' was certified. ',
    outstandingStr ? outstandingStr + ' ' : '',
    retentionHeld > 0 ? 'Retention of ' + fmt(retentionHeld) + ' is held to date.' : '',
    '</p></div>',
  ].join('');
}

function _delta(current, prior) {
  const diff = current - prior;
  if (prior === 0 && diff === 0) return '';
  const abs    = Math.abs(diff);
  const fmtAmt = abs >= 1e6 ? 'AED ' + (abs / 1e6).toFixed(1) + 'M' : 'AED ' + (abs / 1e3).toFixed(0) + 'K';
  const color  = diff >= 0 ? 'var(--green)' : 'var(--amber)';
  const arrow  = diff >= 0 ? '&#8593;' : '&#8595;';
  const sign   = diff >= 0 ? '+' : '&minus;';
  return '<div style="color:' + color + ';font-size:10px;margin-top:2px">' + arrow + ' ' + sign + fmtAmt + '</div>';
}

function _kpiTile(label, value, color, extra) {
  return '<div style="background:var(--bg2);border:0.5px solid var(--border);padding:12px;border-radius:8px;text-align:center">' +
    '<div style="color:var(--text3);font-size:9px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-bottom:5px">' + label + '</div>' +
    '<div style="color:' + color + ';font-weight:700;font-size:14px;letter-spacing:-.3px">' + value + '</div>' +
    (extra || '') + '</div>';
}

function _financeCumulativeKPIs(stats) {
  const fmt = v => 'AED ' + (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : (v / 1e3).toFixed(0) + 'K');
  const { totalContractValue, certifiedToDate, paidToDate, outstandingBalance, retentionHeld, pctComplete, priorCertifiedToDate, priorPaidToDate } = stats;
  return [
    '<div>',
    '<div style="color:var(--text3);font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">Project to Date (Cumulative)</div>',
    '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px">',
    _kpiTile('Contract Value', fmt(totalContractValue), 'var(--charcoal)', ''),
    _kpiTile('Certified', fmt(certifiedToDate), 'var(--green)', _delta(certifiedToDate, priorCertifiedToDate)),
    _kpiTile('Paid', fmt(paidToDate), 'var(--blue)', _delta(paidToDate, priorPaidToDate)),
    _kpiTile('Outstanding', fmt(outstandingBalance), outstandingBalance > 0 ? 'var(--amber)' : 'var(--text2)', ''),
    _kpiTile('Retention', fmt(retentionHeld), 'var(--sand)', ''),
    _kpiTile('% Complete', pctComplete + '%', 'var(--charcoal)', ''),
    '</div></div>',
  ].join('');
}

function _financePeriodKPIs(stats, year, month, months) {
  const fmt = v => 'AED ' + (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : (v / 1e3).toFixed(0) + 'K');
  const { periodClaimed, periodCertified, periodPaid, periodCertsRefs, priorPeriodClaimed, priorPeriodCertified, priorPeriodPaid } = stats;
  const certsExtra = periodCertsRefs.length > 0
    ? '<div style="color:var(--text3);font-size:10px;margin-top:2px">' + periodCertsRefs.join(', ') + '</div>'
    : '';
  return [
    '<div>',
    '<div style="color:var(--text3);font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">This Period &mdash; ' + months[month - 1] + ' ' + year + '</div>',
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">',
    _kpiTile('Claimed', fmt(periodClaimed), 'var(--sand)', _delta(periodClaimed, priorPeriodClaimed)),
    _kpiTile('Certified', fmt(periodCertified), 'var(--green)', _delta(periodCertified, priorPeriodCertified)),
    _kpiTile('Paid', fmt(periodPaid), 'var(--blue)', _delta(periodPaid, priorPeriodPaid)),
    _kpiTile('Certs Issued', String(periodCertsRefs.length), 'var(--charcoal)', certsExtra),
    '</div></div>',
  ].join('');
}

function _financeContractTable(stats) {
  const fmt = v => v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : (v / 1e3).toFixed(0) + 'K';
  const { contractRows } = stats;
  if (!contractRows.length) return '<p class="subtitle">No contracts found for this project.</p>';
  const rows = contractRows.map(r => [
    '<tr style="border-bottom:0.5px solid var(--border)">',
    '<td style="padding:8px 10px;font-weight:500">' + (r.name || '&mdash;') + '</td>',
    '<td style="padding:8px 10px;color:var(--text2)">' + (r.contractor || '&mdash;') + '</td>',
    '<td style="padding:8px 10px;text-align:right">' + fmt(r.awardedValue) + '</td>',
    '<td style="padding:8px 10px;text-align:right;color:var(--text2)">' + (r.boqTotal ? fmt(r.boqTotal) : '&mdash;') + '</td>',
    '<td style="padding:8px 10px;text-align:right;color:var(--green)">' + fmt(r.certified) + '</td>',
    '<td style="padding:8px 10px;text-align:right;color:var(--blue)">' + fmt(r.paid) + '</td>',
    '<td style="padding:8px 10px;text-align:right;color:' + (r.outstanding > 0 ? 'var(--amber)' : 'var(--text2)') + '">' + fmt(r.outstanding) + '</td>',
    '<td style="padding:8px 10px;text-align:right;color:var(--sand)">' + fmt(r.retention) + '</td>',
    '<td style="padding:8px 10px;text-align:right">',
    '<div style="display:flex;align-items:center;gap:6px;justify-content:flex-end">',
    '<div style="width:36px;height:4px;background:var(--bg4);border-radius:2px;overflow:hidden">',
    '<div style="width:' + r.pct + '%;height:100%;background:var(--green);border-radius:2px"></div>',
    '</div>',
    r.pct + '%</div></td>',
    '</tr>',
  ].join('')).join('');
  const th = label => '<th style="text-align:right;padding:8px 10px;font-weight:500;color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:.05em">' + label + '</th>';
  const thL = label => '<th style="text-align:left;padding:8px 10px;font-weight:500;color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:.05em">' + label + '</th>';
  return [
    '<div>',
    '<div style="color:var(--text3);font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">Contract Breakdown</div>',
    '<div style="background:var(--bg2);border:0.5px solid var(--border);border-radius:8px;overflow:hidden">',
    '<table style="width:100%;border-collapse:collapse;font-size:12px;color:var(--charcoal)">',
    '<thead><tr style="background:var(--bg3);border-bottom:0.5px solid var(--border)">',
    thL('Contract') + thL('Contractor') + th('Awarded') + th('BOQ') + th('Certified') + th('Paid') + th('Outstanding') + th('Retention') + th('%'),
    '</tr></thead>',
    '<tbody>' + rows + '</tbody>',
    '</table></div></div>',
  ].join('');
}

function _financeCharts(stats) {
  const { monthMap, sCurvePoints, totalMonths, totalContractValue } = stats;

  // Cashflow bar chart
  const plotH  = 90;
  const allVals = monthMap.flatMap(m => [m.claimed, m.certified, m.paid]);
  const maxVal  = Math.max(...allVals, 1);
  const barW = 10; const barGap = 2; const groupGap = 10;
  const groupW  = barW * 3 + barGap * 2 + groupGap;
  const svgW    = monthMap.length * groupW + 20;
  const bars = monthMap.map((m, i) => {
    const x      = 10 + i * groupW;
    const hClaim = m.claimed   > 0 ? Math.max(2, Math.round((m.claimed   / maxVal) * plotH)) : 0;
    const hCert  = m.certified > 0 ? Math.max(2, Math.round((m.certified / maxVal) * plotH)) : 0;
    const hPaid  = m.paid      > 0 ? Math.max(2, Math.round((m.paid      / maxVal) * plotH)) : 0;
    return [
      hClaim ? '<rect x="' + x                        + '" y="' + (plotH - hClaim) + '" width="' + barW + '" height="' + hClaim + '" fill="#C4A882" rx="2"/>' : '',
      hCert  ? '<rect x="' + (x + barW + barGap)      + '" y="' + (plotH - hCert)  + '" width="' + barW + '" height="' + hCert  + '" fill="#3B6D11" rx="2"/>' : '',
      hPaid  ? '<rect x="' + (x + (barW+barGap) * 2)  + '" y="' + (plotH - hPaid)  + '" width="' + barW + '" height="' + hPaid  + '" fill="#185FA5" rx="2"/>' : '',
      '<text x="' + (x + groupW / 2 - groupGap / 2) + '" y="' + (plotH + 13) + '" fill="#B4A88C" font-size="8" text-anchor="middle">' + m.label + '</text>',
    ].join('');
  }).join('');
  const cashflowSVG = '<svg width="' + svgW + '" height="' + (plotH + 20) + '" viewBox="0 0 ' + svgW + ' ' + (plotH + 20) + '" style="overflow:visible">' + bars + '</svg>';
  const cashflowChart = [
    '<div>',
    '<div style="color:var(--text3);font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-bottom:10px">Monthly Cashflow</div>',
    cashflowSVG,
    '<div style="display:flex;gap:12px;font-size:10px;color:var(--text3);margin-top:6px">',
    '<span><span style="color:#C4A882">&#9646;</span> Claimed</span>',
    '<span><span style="color:#3B6D11">&#9646;</span> Certified</span>',
    '<span><span style="color:#185FA5">&#9646;</span> Paid</span>',
    '</div></div>',
  ].join('');

  // S-curve
  const sCW = 280; const sCH = 90;
  const maxCum = totalContractValue || 1;
  const ptX = idx => Math.round((idx / Math.max(totalMonths - 1, 1)) * sCW);
  const ptY = val => Math.round(sCH - (val / maxCum) * sCH);
  const plannedPts = sCurvePoints.map((p, i) => ptX(i) + ',' + ptY(p.cumPlanned)).join(' ');
  const actualFiltered = sCurvePoints.filter(p => p.cumActual !== null);
  const actualPts  = actualFiltered.map(p => ptX(sCurvePoints.indexOf(p)) + ',' + ptY(p.cumActual)).join(' ');
  const lastActual = actualFiltered[actualFiltered.length - 1];
  const lastIdx    = lastActual ? sCurvePoints.indexOf(lastActual) : -1;
  const scParts = ['<svg width="' + sCW + '" height="' + (sCH + 4) + '" viewBox="0 0 ' + sCW + ' ' + (sCH + 4) + '">'];
  if (plannedPts) scParts.push('<polyline points="' + plannedPts + '" fill="none" stroke="#B4A88C" stroke-width="1.5" stroke-dasharray="4,3"/>');
  if (actualPts)  scParts.push('<polyline points="' + actualPts  + '" fill="none" stroke="#3B6D11" stroke-width="2"/>');
  if (lastIdx >= 0) scParts.push('<circle cx="' + ptX(lastIdx) + '" cy="' + ptY(lastActual.cumActual) + '" r="3" fill="#3B6D11"/>');
  scParts.push('</svg>');
  const sCurve = [
    '<div>',
    '<div style="color:var(--text3);font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-bottom:10px">S-Curve (Cumulative Certified vs Planned)</div>',
    scParts.join(''),
    '<div style="display:flex;gap:12px;font-size:10px;color:var(--text3);margin-top:6px">',
    '<span style="color:#3B6D11">&#8212; Actual</span>',
    '<span style="color:#B4A88C">- - Planned</span>',
    '</div></div>',
  ].join('');

  return [
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">',
    '<div style="background:var(--bg2);border:0.5px solid var(--border);border-radius:8px;padding:16px">' + cashflowChart + '</div>',
    '<div style="background:var(--bg2);border:0.5px solid var(--border);border-radius:8px;padding:16px">' + sCurve + '</div>',
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
