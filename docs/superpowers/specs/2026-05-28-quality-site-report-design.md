# Quality & Site MIS Report — Design Spec

**Date:** 2026-05-28
**Status:** Approved, ready for implementation plan

## Goal

Build a Quality & Site MIS Report that mirrors the existing Finance Report UI/UX. Surface NCR closure, inspection approval, punch list and RFI status across the project, with a discipline breakdown and aging visualisation.

## Decisions Locked

| # | Choice |
|---|---|
| Scope | Full MIS — exec summary + cumulative KPIs + period KPIs + breakdown table + 2 charts |
| Period model | Month + year picker (matches Finance) |
| Cumulative tiles (6) | Open NCRs · NCR Closure Rate · Open IRs · IR Approval Rate · Open Punch · Open RFIs |
| Period tiles (4) | IRs Raised · NCRs Raised · Punch Raised · RFIs Raised (each with delta vs prior month) |
| Breakdown row dimension | Discipline (Arch / Struct / MEP / Elec / Plumb / Fire / Civil / Unassigned) |
| Charts | Aging buckets (stacked horizontal bars) + NCR severity trend (last 6 months stacked) |
| Code structure | New file `src/reports-quality.js` |

## Architecture

**New file:** `src/reports-quality.js` (~450 lines, vanilla JS globals same as existing modules).
Loaded after `src/reports.js` in `index.html`.

**Globals defined:**
- `_openQualityReport()` — entry from hub card. Calls `renderQualityReport(currentYear, currentMonth)`.
- `renderQualityReport(year, month)` — main render function. Sets hash, currentPage, page title, fetches data, builds HTML, mounts into `#content`.
- `_fetchQualityData(projectId)` — parallel Supabase queries for ncrs / inspections / punch_list / rfis.
- `_calcQualityStats(data, year, month)` — pure function, returns stats object.
- `buildQualityReportHTML(stats, year, month, months, yearOpts, monthOpts)` — top-level HTML builder, returns string.
- `exportQualityReportPDF(year, month)` — html2pdf wrapper, same options as Finance.

**Modified files:**
- `src/nav.js` — add `reports-quality` to `PAGE_TITLES`, `NAV_ITEM_FOR`, and `_execRender`.
- `src/reports.js` — promote Quality & Site soon-card to active Live card; remove from `_hubSoonCard` row.
- `index.html` — add `<script src="src/reports-quality.js"></script>` after `reports.js`.

## Data Model

### Supabase queries (parallel, scoped by project_id)

```js
sb.from('ncrs').select('id,ref_no,status,severity,root_cause,discipline,raised_date,closed_date')
sb.from('inspections').select('id,ref_no,status,department,inspection_date,request_date,due_date,closed_date')
sb.from('punch_list').select('id,description,discipline,severity,status,created_at,closed_date')
sb.from('rfis').select('id,ref_no,status,due_date,created_at,closed_date')
```

**Note:** `inspections` table has no `discipline` column. Use `department` (jsonb of booleans). Derive primary discipline = first true key by priority order: `struct > arch > mep > elec > plumb > fire > civil`. Falls back to "Unassigned".

### Stats object shape

```ts
{
  // Cumulative KPI tiles (6)
  openNCRs:           number,
  ncrClosureRate:     number,   // closed / total * 100, rounded
  openIRs:            number,
  irApprovalRate:     number,   // approved / (approved+rejected) * 100
  openPunch:          number,
  openRFIs:           number,

  // Prior-month equivalents for delta arrows (open counts as of prior month end)
  priorOpenNCRs:      number,
  priorOpenIRs:       number,
  priorOpenPunch:     number,
  priorOpenRFIs:      number,

  // Period tiles (4) — raised in selected month
  periodIRs:          number,
  periodNCRs:         number,
  periodPunch:        number,
  periodRFIs:         number,

  // Prior period (prior month raised counts) for delta
  priorPeriodIRs:     number,
  priorPeriodNCRs:    number,
  priorPeriodPunch:   number,
  priorPeriodRFIs:    number,

  // Total overdue items (any workflow, due_date past today)
  overdueCount:       number,

  // Discipline breakdown table rows
  disciplineRows: [
    { discipline, ncrOpen, ncrClosed, irOpen, irApprovalRate, punchOpen, punchClosed }
  ],

  // Aging buckets — open items only, age = today - raised_date (or created_at)
  agingBuckets: {
    ncr:   [n0_30, n31_60, n61_90, n90plus],
    ir:    [n0_30, n31_60, n61_90, n90plus],
    punch: [n0_30, n31_60, n61_90, n90plus],
    rfi:   [n0_30, n31_60, n61_90, n90plus],
  },

  // Severity trend — last 6 months including selected
  severityTrend: [
    { month: 'YYYY-MM', label: 'Jan', minor: number, major: number }
  ],
}
```

### Calculation rules

- **Period counts** — items where `raised_date` (NCR), `request_date` (IR), `created_at` (Punch/RFI) falls within selected month.
- **Cumulative open counts** — all items where `status !== 'Closed' && status !== 'Approved' && status !== 'Rejected'`. Specifics:
  - NCR open = `status === 'Open'`
  - IR open = `status === 'Pending'`
  - Punch open = `status === 'Open'`
  - RFI open = `status === 'Open'`
- **Closure rate** — closed / total cumulative * 100.
- **IR approval rate** — approved / (approved + rejected) * 100. Ignores still-pending.
- **Prior-month open count** — items raised on/before prior month end AND (not closed OR closed after prior month end).
- **Overdue** — any open item with `due_date < today`.
- **Aging buckets** — open items only; age = `today - raised_date` (or `created_at` fallback). Days into buckets 0–30 / 31–60 / 61–90 / 90+.
- **Severity trend** — for each of last 6 months, count NCRs raised in that month split by severity (Minor / Major). Items without severity counted as Minor.

## UI Sections

All styling mirrors `buildFinanceReportHTML` in `src/reports.js`. Same colors (`--green`, `--amber`, `--sand`, `--blue`, `--charcoal`), same border-radius (8px tiles, 12px cards), same font sizes.

### Header

- Breadcrumb chip: `← All Reports` → on-click `nav('reports', document.getElementById('n-reports'))`
- Title: `<h1>Quality & Site MIS Report</h1>` + project name subtitle
- Export PDF button (top-right, secondary btn): `onclick="exportQualityReportPDF(year, month)"`
- Period selector bar (same bg3 chip): month select + year select (5-year window centered on current)
- Generated date stamp (right-aligned in selector bar)

### Section 1 — Executive Summary

Green-bg block (`--green-bg`) with left border `--green`, padding 14/18, narrative paragraph:

> As of {Month} {Year}, the project has **{openNCRs} open NCRs** with **{ncrClosureRate}% closure rate**. {openIRs} inspection requests pending, {irApprovalRate}% IR approval rate to date. {openPunch} punch items and {openRFIs} RFIs remain open. {overdueCount > 0 ? '<strong>X items</strong> are past their due date.' : ''}

### Section 2 — Cumulative KPIs (6 tiles)

`<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px">`

Tiles in order (each via shared `_kpiTile` helper or local equivalent):

1. **Open NCRs** — charcoal value, delta arrow vs `priorOpenNCRs`
2. **NCR Closure Rate** — green value, suffix `%`
3. **Open IRs** — charcoal value, delta vs `priorOpenIRs`
4. **IR Approval Rate** — green value, suffix `%`
5. **Open Punch** — charcoal value, delta vs `priorOpenPunch`
6. **Open RFIs** — charcoal value, delta vs `priorOpenRFIs`

### Section 3 — This Period (4 tiles)

`<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">`

1. **IRs Raised** — sand color, delta vs `priorPeriodIRs`
2. **NCRs Raised** — amber color, delta vs `priorPeriodNCRs`
3. **Punch Raised** — sand color, delta vs `priorPeriodPunch`
4. **RFIs Raised** — blue color, delta vs `priorPeriodRFIs`

Delta uses same up/down arrow + color rule as Finance `_delta` (positive = green, negative = amber).

### Section 4 — Discipline Breakdown Table

Same table styling as Finance contract table — bordered cells, monospace numbers, slightly tinted header.

Columns:
- Discipline (label)
- NCRs (Open / Closed) — formatted `"2 / 5"`
- IRs Open
- IR Approval %
- Punch (Open / Closed)

Row tint:
- amber-bg if `ncrOpen > 0`
- default otherwise

Empty state: `<tr><td colspan=5>No quality records yet for this project.</td></tr>`

### Section 5 — Charts Row (2 columns)

`<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">`

**Left card — Aging Buckets** (`--bg2`, border-radius 12px, padding 16):
- Title: "Aging — Open Items"
- 4 horizontal stacked bars, one per stream (NCRs / IRs / Punch / RFIs)
- Each bar segments: 0–30 (green) / 31–60 (sand) / 61–90 (amber) / 90+ (red)
- Inline SVG, width 100%, height ~28px per bar
- Count overlay text on each segment (skip if segment is 0)
- Legend strip below all bars

**Right card — NCR Severity Trend** (same card styling):
- Title: "NCR Severity — Last 6 Months"
- Stacked vertical bars, x-axis = month labels, y-axis implicit
- Stacks: Minor (sand bottom) + Major (amber top)
- Total count overlay above bar
- Inline SVG

## Hub Card

In `src/reports.js#buildReportsHub`:

- Remove first `_hubSoonCard(...)` call (the "Quality & Site" one).
- Add a Quality card matching the Finance card style:
  - Left stripe color: `var(--amber)` (differentiates from Finance's green)
  - Icon: same checkmark SVG as the current soon-card
  - Tag: "Quality"
  - Title: "Quality & Site Report"
  - Description: "NCR closure, inspection approval, punch list and RFI status, aging buckets, discipline breakdown. Exportable as A4 PDF."
  - Pills: "Discipline breakdown" · "Aging buckets" · "PDF export"
  - Badge: `&#9679; Live` (badge-warning style to match amber)
  - onclick: `_openQualityReport()`
- "In Development" row reduces to 2 cards: Document Control + Sales & CRM.

## Routing

**`src/nav.js`:**

- `PAGE_TITLES` — add `'reports-quality':'Quality & Site Report'`
- `NAV_ITEM_FOR` — add `'reports-quality':'reports'`
- `_execRender` — add branch:

```js
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
```

**`renderQualityReport(year, month)` sets:**
- `currentPage = 'reports-quality'`
- `document.getElementById('page-title').textContent = PAGE_TITLES['reports-quality']`
- `history.replaceState(null, '', '#reports-quality/' + year + '-' + String(month).padStart(2,'0'))`

## PDF Export

`exportQualityReportPDF(year, month)`:
- Use existing html2pdf import.
- Clone `#finance-report-container` pattern: render into hidden container, html2pdf with A4 options matching Finance.
- Filename: `QualitySiteReport-{slug(currentProject.name)}-{YYYY-MM}.pdf`

## Test Plan

1. **Hub card live** — open `#reports`, verify Quality & Site card now shows Live badge and is clickable.
2. **Open from hub** — click card → loads Quality Report for current month, hash becomes `#reports-quality/2026-05`, page title updates.
3. **Refresh persistence** — refresh on `#reports-quality/2026-05` → stays on Quality Report, Golf Grove project preserved.
4. **Period change** — change month/year selects → re-renders with new period, hash updates.
5. **Back to hub** — breadcrumb click → returns to `#reports`.
6. **Project switch** — switch to 241 Waterside from dropdown → report re-renders for that project.
7. **Empty state** — Golf Grove currently has 0 NCRs / 0 IRs / 0 RFIs / 0 Punch → all tiles show 0, table shows empty state, aging chart empty, no crashes.
8. **Populated state** — manually insert 1 NCR (Open, Major, discipline Structural, raised today). Reload report → Open NCRs tile = 1, NCRs Raised period tile = 1 with up arrow, Structural row appears in breakdown, aging 0–30 bucket = 1, severity trend current month shows Major = 1.
9. **PDF export** — click Export PDF → A4 PDF downloads with all sections rendered, filename includes project + period.
10. **Hash sub-route navigation** — manually paste `#reports-quality/2025-12` in URL → loads December 2025 data.

## Out of Scope

- Root cause pareto chart (rejected in Q6).
- Subcontractor breakdown (rejected in Q5).
- Rolling 30-day window (rejected in Q2).
- Edit/drill-down from report rows.
- Email/scheduled report delivery.
