# MIS Reports — Finance Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Reports nav section (developer-only) with a Finance MIS Report featuring period selector, 5 content sections, and PDF export.

**Architecture:** New `src/reports.js` holds all hub + renderer logic. Nav wired in `src/nav.js` and `index.html`. No new Supabase tables — queries existing `contracts`, `payment_certificates`, `payment_certificate_items`, `boq_bills`, `boq_items`.

**Tech Stack:** Vanilla JS, Supabase JS v2, html2pdf (already loaded via CDN), inline SVG for charts.

---

### Task 1: Nav wiring + stub reports module

**Files:**
- Create: `src/reports.js`
- Modify: `src/nav.js`
- Modify: `index.html`

- [ ] **Step 1: Create stub `src/reports.js`**

```js
// src/reports.js

async function renderReports() {
  document.getElementById('content').innerHTML = '<p>Reports loading...</p>';
}
```

- [ ] **Step 2: Add `reports` nav item to `index.html`**

Find the Finance nav item (id `n-finance-wrap`) and add a new item immediately after it, before Unit Setup:

```html
<div id="n-reports-wrap" class="nav-item" onclick="nav('reports')" title="Reports">
  <span class="nav-icon">📊</span>
  <span class="nav-label">Reports</span>
</div>
```

Also add the script tag after the other src/ script tags:
```html
<script src="src/reports.js"></script>
```

- [ ] **Step 3: Wire nav in `src/nav.js`**

Add `reports: 'Reports'` to `PAGE_TITLES`.

In `_execRender`, add the dispatch case:
```js
case 'reports': await renderReports(); break;
```

- [ ] **Step 4: Hide nav item from non-developer roles**

In the auth/nav visibility block (where `n-finance-wrap`, `n-unit-setup-wrap`, etc. are shown/hidden based on role), add:
```js
document.getElementById('n-reports-wrap').style.display = can('developer') ? '' : 'none';
```

- [ ] **Step 5: Verify in browser**
- Log in as developer → Reports nav item appears between Finance and Unit Setup
- Click Reports → page renders "Reports loading..."
- Log in as non-developer → Reports nav item hidden

- [ ] **Step 6: Commit**
```bash
git add src/reports.js src/nav.js index.html
git commit -m "feat: add Reports nav item and stub module (developer-only)"
```

---

### Task 2: Finance report data layer

**Files:**
- Modify: `src/reports.js`

- [ ] **Step 1: Add `_fetchFinanceData(projectId)`**

```js
async function _fetchFinanceData(projectId) {
  const [contractsRes, certsRes, itemsRes, billsRes, boqItemsRes] = await Promise.all([
    sb.from('contracts').select('id,contractor_name,awarded_value,start_date,end_date').eq('project_id', projectId),
    sb.from('payment_certificates').select('id,contract_id,period_month,period_year,claimed_amount,certified_amount,paid_amount,payment_date,status,reference').eq('project_id', projectId),
    sb.from('payment_certificate_items').select('certificate_id,retention_amount').in('certificate_id',
      (await sb.from('payment_certificates').select('id').eq('project_id', projectId)).data?.map(c => c.id) || []
    ),
    sb.from('boq_bills').select('id,contract_id,total_amount').eq('project_id', projectId),
    sb.from('boq_items').select('bill_id,total_price').eq('project_id', projectId),
  ]);
  return {
    contracts: contractsRes.data || [],
    certs: certsRes.data || [],
    certItems: itemsRes.data || [],
    boqBills: billsRes.data || [],
    boqItems: boqItemsRes.data || [],
  };
}
```

- [ ] **Step 2: Add `_calcFinanceStats(data, year, month)`**

```js
function _calcFinanceStats(data, year, month) {
  const { contracts, certs, certItems, boqBills, boqItems } = data;

  // BOQ total per contract
  const boqByContract = {};
  boqBills.forEach(b => {
    const items = boqItems.filter(i => i.bill_id === b.id);
    const sum = items.reduce((s, i) => s + (i.total_price || 0), 0);
    boqByContract[b.contract_id] = (boqByContract[b.contract_id] || 0) + sum;
  });

  // Retention per cert
  const retentionByCert = {};
  certItems.forEach(i => {
    retentionByCert[i.certificate_id] = (retentionByCert[i.certificate_id] || 0) + (i.retention_amount || 0);
  });

  // Helper: cert is "up to and including" period
  const inPeriod = (c, y, m) => c.period_year < y || (c.period_year === y && c.period_month <= m);
  const exactPeriod = (c, y, m) => c.period_year === y && c.period_month === m;

  const priorMonth = month === 1 ? 12 : month - 1;
  const priorYear = month === 1 ? year - 1 : year;

  // Cumulative stats (up to selected period)
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

  // This period stats
  const periodCerts = certs.filter(c => exactPeriod(c, year, month));
  const priorPeriodCerts = certs.filter(c => exactPeriod(c, priorYear, priorMonth));

  const periodClaimed = sumField(periodCerts, 'claimed_amount');
  const periodCertified = sumField(periodCerts, 'certified_amount');
  const periodPaid = sumField(periodCerts.filter(c => c.payment_date), 'paid_amount');
  const priorPeriodClaimed = sumField(priorPeriodCerts, 'claimed_amount');
  const priorPeriodCertified = sumField(priorPeriodCerts, 'certified_amount');
  const priorPeriodPaid = sumField(priorPeriodCerts.filter(c => c.payment_date), 'paid_amount');

  // Contract rows
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

  // Monthly cashflow (last 6 months up to and including selected)
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

  // S-curve: planned = equal monthly distribution of totalContractValue across project duration
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
    priorCertifiedToDate, priorPaidToDate,
    outstandingCerts,
    periodClaimed, periodCertified, periodPaid, periodCertsRefs: periodCerts.map(c => c.reference).filter(Boolean),
    priorPeriodClaimed, priorPeriodCertified, priorPeriodPaid,
    contractRows, monthMap, sCurvePoints, totalMonths,
  };
}
```

- [ ] **Step 3: Commit**
```bash
git add src/reports.js
git commit -m "feat: reports data layer — fetch and calc finance stats"
```

---

### Task 3: Report hub + Finance shell + period selector + narrative

**Files:**
- Modify: `src/reports.js`

- [ ] **Step 1: Replace stub `renderReports()` with hub page**

```js
async function renderReports() {
  const el = document.getElementById('content');
  el.innerHTML = `
    <div class="page-header"><h1>Reports</h1></div>
    <div class="cards" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;padding:24px">
      <div class="card" style="cursor:pointer" onclick="_openFinanceReport()">
        <div class="card-body">
          <div style="font-size:28px;margin-bottom:8px">📊</div>
          <h3>Finance Report</h3>
          <p class="subtitle">Cashflow, KPIs, contracts</p>
          <span class="badge badge-success">Active</span>
        </div>
      </div>
      <div class="card" style="opacity:.5">
        <div class="card-body">
          <div style="font-size:28px;margin-bottom:8px">🏗️</div>
          <h3>Quality &amp; Site</h3>
          <span class="badge">Coming Soon</span>
        </div>
      </div>
      <div class="card" style="opacity:.5">
        <div class="card-body">
          <div style="font-size:28px;margin-bottom:8px">📁</div>
          <h3>Document Control</h3>
          <span class="badge">Coming Soon</span>
        </div>
      </div>
      <div class="card" style="opacity:.5">
        <div class="card-body">
          <div style="font-size:28px;margin-bottom:8px">🤝</div>
          <h3>Sales &amp; CRM</h3>
          <span class="badge">Coming Soon</span>
        </div>
      </div>
    </div>`;
}
```

- [ ] **Step 2: Add `_openFinanceReport()` and `renderFinanceReport(year, month)`**

```js
function _openFinanceReport() {
  const now = new Date();
  renderFinanceReport(now.getFullYear(), now.getMonth() + 1);
}

async function renderFinanceReport(year, month) {
  const el = document.getElementById('content');
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Loading...</div>';

  const data = await _fetchFinanceData(currentProject.id);
  const stats = _calcFinanceStats(data, year, month);

  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const curYear = new Date().getFullYear();
  const yearOpts = [curYear-2,curYear-1,curYear,curYear+1,curYear+2].map(y =>
    `<option value="${y}"${y===year?' selected':''}>${y}</option>`).join('');
  const monthOpts = months.map((m,i) =>
    `<option value="${i+1}"${i+1===month?' selected':''}>${m}</option>`).join('');

  el.innerHTML = `
    <div id="finance-report-container">
      <div class="page-header" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <a href="#" onclick="renderReports();return false" style="font-size:13px;color:var(--accent)">&larr; All Reports</a>
        <h1 style="flex:1">Finance MIS Report &mdash; ${currentProject.name}</h1>
        <button class="btn btn-sm btn-secondary" onclick="exportFinanceReportPDF(${year},${month})">&#8595; Export PDF</button>
      </div>
      <div style="display:flex;align-items:center;gap:8px;padding:0 24px 16px">
        <label style="font-size:13px">Period:</label>
        <select onchange="renderFinanceReport(+document.getElementById('rpt-year').value,+this.value)" style="padding:4px 8px">${monthOpts}</select>
        <select id="rpt-year" onchange="renderFinanceReport(+this.value,+document.querySelector('[onchange*=rpt-year]').value)" style="padding:4px 8px">${yearOpts}</select>
        <span style="font-size:11px;color:var(--text-muted)">Generated ${new Date().toLocaleDateString('en-GB')}</span>
      </div>
      <div style="padding:0 24px 24px;display:flex;flex-direction:column;gap:16px">
        ${_financeSummaryNarrative(stats, year, month, months)}
        ${_financeCumulativeKPIs(stats)}
        ${_financePeriodKPIs(stats, year, month, months)}
        ${_financeContractTable(stats)}
        ${_financeCharts(stats)}
      </div>
    </div>`;
}
```

- [ ] **Step 3: Add `_financeSummaryNarrative(stats, year, month, months)`**

```js
function _financeSummaryNarrative(stats, year, month, months) {
  const fmt = v => 'AED ' + (v >= 1e6 ? (v/1e6).toFixed(1)+'M' : (v/1e3).toFixed(0)+'K');
  const { totalContractValue, certifiedToDate, pctComplete, periodCertified, priorPeriodCertified, outstandingCerts, retentionHeld } = stats;
  const delta = periodCertified - priorPeriodCertified;
  const deltaPct = priorPeriodCertified > 0 ? Math.abs(Math.round((delta/priorPeriodCertified)*100)) : null;
  const deltaStr = deltaPct !== null
    ? (delta >= 0 ? `&#8593; ${deltaPct}% vs ${months[month===1?11:month-2]}` : `&#8595; ${deltaPct}% vs ${months[month===1?11:month-2]}`)
    : 'no prior period data';
  const outstanding = outstandingCerts.length > 0
    ? outstandingCerts.map(c => `${c.reference || 'IPC'} (${fmt(c.certified_amount - (c.paid_amount||0))})`).join(', ') + ' outstanding. '
    : '';

  return `<div style="background:rgba(74,222,128,.08);border-left:3px solid #4ade80;border-radius:4px;padding:12px 16px">
    <div style="color:#86efac;font-size:10px;font-weight:700;letter-spacing:1px;margin-bottom:6px">EXECUTIVE SUMMARY</div>
    <p style="color:var(--text);font-size:13px;line-height:1.7;margin:0">
      As of ${months[month-1]} ${year}, the project is <strong>${pctComplete}% complete</strong>.
      ${fmt(certifiedToDate)} has been certified against a total contract value of ${fmt(totalContractValue)}.
      This period, ${fmt(periodCertified)} was certified &mdash; ${deltaStr}.
      ${outstanding}${retentionHeld > 0 ? `Retention of ${fmt(retentionHeld)} is held to date.` : ''}
    </p>
  </div>`;
}
```

- [ ] **Step 4: Verify in browser**
- Navigate to Reports → hub shows 4 cards
- Click Finance Report → report renders with period selector, narrative, and "Loading..." sections (KPI sections not yet built)
- Change month/year → report re-renders

- [ ] **Step 5: Commit**
```bash
git add src/reports.js
git commit -m "feat: reports hub page, finance report shell, period selector, narrative"
```

---

### Task 4: KPI tiles — cumulative and period strips

**Files:**
- Modify: `src/reports.js`

- [ ] **Step 1: Add `_delta(current, prior)` helper**

```js
function _delta(current, prior) {
  const diff = current - prior;
  if (prior === 0 && diff === 0) return '';
  const fmt = v => 'AED ' + (Math.abs(v) >= 1e6 ? (Math.abs(v)/1e6).toFixed(1)+'M' : (Math.abs(v)/1e3).toFixed(0)+'K');
  const color = diff >= 0 ? '#4ade80' : '#f87171';
  const arrow = diff >= 0 ? '&#8593;' : '&#8595;';
  const sign = diff >= 0 ? '+' : '&minus;';
  return `<div style="color:${color};font-size:10px">${arrow} ${sign}${fmt(Math.abs(diff))}</div>`;
}
```

- [ ] **Step 2: Add `_financeCumulativeKPIs(stats)`**

```js
function _financeCumulativeKPIs(stats) {
  const fmt = v => 'AED ' + (v >= 1e6 ? (v/1e6).toFixed(1)+'M' : (v/1e3).toFixed(0)+'K');
  const { totalContractValue, certifiedToDate, paidToDate, outstandingBalance, retentionHeld, pctComplete,
          priorCertifiedToDate, priorPaidToDate } = stats;

  const tile = (label, value, color, extra='') =>
    `<div style="background:var(--surface2,#1e2a3e);padding:10px;border-radius:6px;text-align:center">
      <div style="color:var(--text-muted);font-size:9px;font-weight:700;letter-spacing:1px;margin-bottom:4px">${label}</div>
      <div style="color:${color};font-weight:700;font-size:14px">${value}</div>
      ${extra}
    </div>`;

  return `<div>
    <div style="color:var(--text-muted);font-size:10px;font-weight:700;letter-spacing:1px;margin-bottom:8px">PROJECT TO DATE (CUMULATIVE)</div>
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px">
      ${tile('CONTRACT VALUE', fmt(totalContractValue), 'var(--text)')}
      ${tile('CERTIFIED', fmt(certifiedToDate), '#4ade80', _delta(certifiedToDate, priorCertifiedToDate))}
      ${tile('PAID', fmt(paidToDate), '#60a5fa', _delta(paidToDate, priorPaidToDate))}
      ${tile('OUTSTANDING', fmt(outstandingBalance), outstandingBalance > 0 ? '#f87171' : 'var(--text)')}
      ${tile('RETENTION', fmt(retentionHeld), '#f59e0b')}
      ${tile('% COMPLETE', pctComplete + '%', '#a78bfa')}
    </div>
  </div>`;
}
```

- [ ] **Step 3: Add `_financePeriodKPIs(stats, year, month, months)`**

```js
function _financePeriodKPIs(stats, year, month, months) {
  const fmt = v => 'AED ' + (v >= 1e6 ? (v/1e6).toFixed(1)+'M' : (v/1e3).toFixed(0)+'K');
  const { periodClaimed, periodCertified, periodPaid, periodCertsRefs,
          priorPeriodClaimed, priorPeriodCertified, priorPeriodPaid } = stats;

  const tile = (label, value, color, extra='') =>
    `<div style="background:var(--surface2,#1e2a3e);padding:10px;border-radius:6px;text-align:center;border:1px solid var(--border)">
      <div style="color:var(--text-muted);font-size:9px;font-weight:700;letter-spacing:1px;margin-bottom:4px">${label}</div>
      <div style="color:${color};font-weight:700;font-size:14px">${value}</div>
      ${extra}
    </div>`;

  return `<div>
    <div style="color:var(--text-muted);font-size:10px;font-weight:700;letter-spacing:1px;margin-bottom:8px">THIS PERIOD &mdash; ${months[month-1].toUpperCase()} ${year}</div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
      ${tile('CLAIMED', fmt(periodClaimed), 'var(--text)', _delta(periodClaimed, priorPeriodClaimed))}
      ${tile('CERTIFIED', fmt(periodCertified), '#4ade80', _delta(periodCertified, priorPeriodCertified))}
      ${tile('PAID', fmt(periodPaid), '#60a5fa', _delta(periodPaid, priorPeriodPaid))}
      ${tile('CERTS ISSUED', String(periodCertsRefs.length),
        'var(--text)',
        periodCertsRefs.length > 0 ? `<div style="color:var(--text-muted);font-size:10px">${periodCertsRefs.join(', ')}</div>` : ''
      )}
    </div>
  </div>`;
}
```

- [ ] **Step 4: Verify in browser**
- Finance report shows 6-tile cumulative strip and 4-tile period strip
- Delta arrows appear in green/red where prior period data exists

- [ ] **Step 5: Commit**
```bash
git add src/reports.js
git commit -m "feat: finance report KPI tiles — cumulative and period strips with delta"
```

---

### Task 5: Contract breakdown table

**Files:**
- Modify: `src/reports.js`

- [ ] **Step 1: Add `_financeContractTable(stats)`**

```js
function _financeContractTable(stats) {
  const fmt = v => v >= 1e6 ? (v/1e6).toFixed(2)+'M' : (v/1e3).toFixed(0)+'K';
  const { contractRows } = stats;

  if (!contractRows.length) return '<p class="subtitle">No contracts found for this project.</p>';

  const rows = contractRows.map(r => `
    <tr style="border-bottom:1px solid var(--border)">
      <td style="padding:6px 8px">${r.name || '—'}</td>
      <td style="text-align:right;padding:6px 8px">${fmt(r.awardedValue)}</td>
      <td style="text-align:right;padding:6px 8px">${r.boqTotal ? fmt(r.boqTotal) : '—'}</td>
      <td style="text-align:right;padding:6px 8px;color:#4ade80">${fmt(r.certified)}</td>
      <td style="text-align:right;padding:6px 8px;color:#60a5fa">${fmt(r.paid)}</td>
      <td style="text-align:right;padding:6px 8px;color:${r.outstanding > 0 ? '#f87171' : 'var(--text)'}">${fmt(r.outstanding)}</td>
      <td style="text-align:right;padding:6px 8px;color:#f59e0b">${fmt(r.retention)}</td>
      <td style="text-align:right;padding:6px 8px;color:#a78bfa">${r.pct}%</td>
    </tr>`).join('');

  return `<div>
    <div style="color:var(--text-muted);font-size:10px;font-weight:700;letter-spacing:1px;margin-bottom:8px">CONTRACT BREAKDOWN</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr style="color:var(--text-muted);font-size:10px;border-bottom:1px solid var(--border)">
          <th style="text-align:left;padding:6px 8px">CONTRACTOR</th>
          <th style="text-align:right;padding:6px 8px">AWARDED</th>
          <th style="text-align:right;padding:6px 8px">BOQ</th>
          <th style="text-align:right;padding:6px 8px">CERTIFIED</th>
          <th style="text-align:right;padding:6px 8px">PAID</th>
          <th style="text-align:right;padding:6px 8px">OUTSTANDING</th>
          <th style="text-align:right;padding:6px 8px">RETENTION</th>
          <th style="text-align:right;padding:6px 8px">%</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}
```

- [ ] **Step 2: Verify in browser**
- Contract rows appear sorted by awarded value descending
- Outstanding column shows red for any row with outstanding > 0

- [ ] **Step 3: Commit**
```bash
git add src/reports.js
git commit -m "feat: finance report contract breakdown table"
```

---

### Task 6: Charts + PDF export

**Files:**
- Modify: `src/reports.js`

- [ ] **Step 1: Add `_financeCharts(stats)`**

```js
function _financeCharts(stats) {
  const { monthMap, sCurvePoints, totalMonths, totalContractValue } = stats;

  // Cashflow chart
  const plotH = 80;
  const allVals = monthMap.flatMap(m => [m.claimed, m.certified, m.paid]);
  const maxVal = Math.max(...allVals, 1);
  const barW = 10; const barGap = 2; const groupGap = 8;
  const groupW = barW * 3 + barGap * 2 + groupGap;
  const svgW = monthMap.length * groupW + 20;

  const cashflowBars = monthMap.map((m, i) => {
    const x = 10 + i * groupW;
    const hClaim = Math.round((m.claimed / maxVal) * plotH);
    const hCert = Math.round((m.certified / maxVal) * plotH);
    const hPaid = Math.round((m.paid / maxVal) * plotH);
    return `
      <rect x="${x}" y="${plotH - hClaim}" width="${barW}" height="${hClaim}" fill="#64748b" rx="1"/>
      <rect x="${x + barW + barGap}" y="${plotH - hCert}" width="${barW}" height="${hCert}" fill="#4ade80" rx="1"/>
      <rect x="${x + (barW + barGap) * 2}" y="${plotH - hPaid}" width="${barW}" height="${hPaid}" fill="#60a5fa" rx="1"/>
      <text x="${x + groupW/2 - groupGap/2}" y="${plotH + 12}" fill="#64748b" font-size="8" text-anchor="middle">${m.label}</text>`;
  }).join('');

  const cashflowChart = `
    <div>
      <div style="color:var(--text-muted);font-size:9px;margin-bottom:6px">MONTHLY CASHFLOW (Claimed / Certified / Paid)</div>
      <svg width="${svgW}" height="${plotH + 18}" viewBox="0 0 ${svgW} ${plotH + 18}" style="overflow:visible">${cashflowBars}</svg>
      <div style="display:flex;gap:10px;font-size:10px;color:var(--text-muted);margin-top:4px">
        <span><span style="color:#64748b">&#9646;</span> Claimed</span>
        <span><span style="color:#4ade80">&#9646;</span> Certified</span>
        <span><span style="color:#60a5fa">&#9646;</span> Paid</span>
      </div>
    </div>`;

  // S-Curve
  const sCurveW = 240; const sCurveH = 80;
  const maxCum = totalContractValue || 1;
  const ptScale = (idx, val) => ({
    x: Math.round((idx / Math.max(totalMonths - 1, 1)) * sCurveW),
    y: Math.round(sCurveH - (val / maxCum) * sCurveH),
  });
  const plannedPts = sCurvePoints.map((p, i) => { const pt = ptScale(i, p.cumPlanned); return `${pt.x},${pt.y}`; }).join(' ');
  const actualPts = sCurvePoints.filter(p => p.cumActual !== null).map((p, i) => { const pt = ptScale(i, p.cumActual); return `${pt.x},${pt.y}`; }).join(' ');
  const lastActual = sCurvePoints.filter(p => p.cumActual !== null).pop();
  const lastIdx = lastActual ? sCurvePoints.indexOf(lastActual) : 0;
  const lastPt = lastActual ? ptScale(lastIdx, lastActual.cumActual) : null;

  const sCurve = `
    <div>
      <div style="color:var(--text-muted);font-size:9px;margin-bottom:6px">S-CURVE (Cumulative Certified vs Planned)</div>
      <svg width="${sCurveW}" height="${sCurveH + 4}" viewBox="0 0 ${sCurveW} ${sCurveH + 4}">
        <polyline points="${plannedPts}" fill="none" stroke="#334155" stroke-width="1.5" stroke-dasharray="4,2"/>
        ${actualPts ? `<polyline points="${actualPts}" fill="none" stroke="#4ade80" stroke-width="2"/>` : ''}
        ${lastPt ? `<circle cx="${lastPt.x}" cy="${lastPt.y}" r="3" fill="#4ade80"/>` : ''}
      </svg>
      <div style="display:flex;gap:10px;font-size:10px;color:var(--text-muted);margin-top:4px">
        <span style="color:#4ade80">&#8212; Actual</span>
        <span style="color:#334155">- - Planned</span>
      </div>
    </div>`;

  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
    <div style="background:var(--surface2,#1e2a3e);border-radius:6px;padding:12px">${cashflowChart}</div>
    <div style="background:var(--surface2,#1e2a3e);border-radius:6px;padding:12px">${sCurve}</div>
  </div>`;
}
```

- [ ] **Step 2: Add `exportFinanceReportPDF(year, month)`**

```js
function exportFinanceReportPDF(year, month) {
  const el = document.getElementById('finance-report-container');
  if (!el) return toast('Report not loaded', 'error');
  const projectName = (currentProject.name || 'Project').replace(/\s+/g, '_');
  const mm = String(month).padStart(2, '0');
  const filename = `Finance_MIS_${projectName}_${year}-${mm}.pdf`;
  const opt = {
    margin: 8,
    filename,
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
  };
  html2pdf().set(opt).from(el).save();
}
```

- [ ] **Step 3: Verify in browser**
- Both charts render with correct data
- "Export PDF" button produces A4 landscape PDF named `Finance_MIS_[ProjectName]_YYYY-MM.pdf`
- Report looks correct across different period selections including periods with no data

- [ ] **Step 4: Commit**
```bash
git add src/reports.js
git commit -m "feat: finance report charts (cashflow + S-curve) and PDF export"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Nav item between Finance and Unit Setup, developer-only, `📊` icon
- ✅ Hub page with 4 cards (Finance active, 3 coming soon)
- ✅ Finance report: period selector (month/year dropdowns), defaults to current month/year
- ✅ Re-fetches on period change
- ✅ Executive summary narrative (template-driven)
- ✅ Cumulative KPIs: 6 tiles with delta
- ✅ Period strip: 4 tiles with delta
- ✅ Contract breakdown table sorted by awarded value desc, outstanding in red
- ✅ Monthly cashflow bar chart (last 6 months, 3 grouped bars)
- ✅ S-Curve (cumulative certified vs planned, planned = equal distribution)
- ✅ PDF export: html2pdf, A4 landscape, correct filename
- ✅ Back navigation "← All Reports"
- ✅ `src/reports.js` new file
- ✅ `src/nav.js` + `index.html` modified
- ✅ Role check: developer only

**No placeholders found.**
