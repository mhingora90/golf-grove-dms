# MIS Reports — Design Spec

**Date:** 2026-05-28
**Status:** Approved

---

## Goal

Add a dedicated Reports section to the app where senior management can generate, view, and export MIS (Management Information System) reports per project. Finance Report is the first report; Quality, Document Control, and Sales follow later.

---

## Audience & Access

- **Consumer:** Senior management / board level
- **Role access:** Developer role only for Finance Report (enforced via existing `can()` / role check pattern)
- **Format:** In-app view + PDF export

---

## Architecture

### New file
`src/reports.js` — contains all report hub and renderer functions. No new Supabase tables or migrations required. Finance report queries the same tables already used by the Finance module.

### Nav
- New nav item **"Reports"** with `📊` icon, nav ID `reports`
- Positioned between Finance and Unit Setup in the sidebar
- Visible only to `developer` role (hidden for all other roles)

### PDF export
Uses the existing `html2pdf` library (already loaded via CDN). Captures the report container div.

---

## Reports Hub Page

Landing page when user navigates to Reports. Shows four report cards:

| Report | Status |
|--------|--------|
| Finance Report | ✅ Active |
| Quality & Site | 🔒 Coming Soon |
| Document Control | 🔒 Coming Soon |
| Sales & CRM | 🔒 Coming Soon |

Clicking Finance Report navigates to the Finance Report view (replaces hub content, no modal). Coming Soon cards are non-clickable with muted styling.

---

## Finance Report

### Period Selector
- Month dropdown (Jan–Dec) + Year dropdown (current year ± 2 years)
- Defaults to current month/year on load
- Re-fetches and re-renders all sections on change

### Data Sources
All data already available via existing Supabase tables:
- `contracts` — awarded values, contractor names
- `payment_certificates` — claimed, certified, paid amounts, dates, status
- `payment_certificate_items` — line-item detail
- `boq_bills` / `boq_items` — BOQ totals per contract

### Delta Calculation
Prior period = selected month − 1. Delta = current period value − prior period value. Displayed as `↑ +AED X` (green) or `↓ −AED X` (red).

### Sections (top to bottom)

#### 1. Executive Summary
Auto-generated narrative paragraph. Template-driven — no AI. Variables filled from live data:

> "As of [Month Year], the project is [X]% complete. AED [certified-to-date] has been certified against a total contract value of AED [contract-value]. This period, AED [period-certified] was certified — [↑/↓ delta%] vs [prior month]. [If outstanding > 0: IPC-[ref] (AED [amount]) is outstanding for [N] days.] Retention of AED [retention] is held to date."

#### 2. Cumulative KPIs (project to date)
Six metric tiles in a row, each with delta where applicable:

| Metric | Delta |
|--------|-------|
| Total Contract Value | — |
| Certified to Date | ↑/↓ vs prior period |
| Paid to Date | ↑/↓ vs prior period |
| Outstanding Balance | shown in red if > 0 |
| Retention Held | — |
| % Complete | — |

#### 3. This Period Strip
Four metric tiles for the selected period only:

| Metric | Delta |
|--------|-------|
| Claimed | ↑/↓ vs prior period |
| Certified | ↑/↓ vs prior period |
| Paid | ↑/↓ vs prior period |
| Certs Issued | count + IPC refs |

#### 4. Contract Breakdown Table
One row per contract. Columns:

`Contractor · Awarded Value · BOQ Total · Certified · Paid · Outstanding · Retention · %`

Rows sorted by contract awarded value descending. Outstanding column highlighted red if > 0.

#### 5. Charts (side by side)
- **Left — Monthly Cashflow bar chart:** Grouped bars (Claimed / Certified / Paid) for last 6 months up to and including selected period. Built with inline SVG (same pattern as existing Finance module).
- **Right — S-Curve:** Cumulative certified (actual) vs cumulative planned. Planned line derived from equal monthly distribution of total contract value across project duration. Built with inline SVG.

### PDF Export
- Button: "↓ Export PDF" top-right of report header
- Captures report container div via `html2pdf`
- Filename: `Finance_MIS_[ProjectName]_[YYYY-MM].pdf`
- Page size: A4 landscape

### Back navigation
"← All Reports" link at top-left returns to the Reports hub.

---

## File Structure

| File | Change |
|------|--------|
| `src/reports.js` | New — hub + Finance report renderer |
| `src/nav.js` | Add `reports` to PAGE_TITLES, nav render, and `render()` dispatch |
| `index.html` | Add Reports nav item in sidebar |

---

## Out of Scope (this iteration)

- Quality & Site report
- Document Control report
- Sales & CRM report
- Scheduled / emailed reports
- AI-generated narrative (narrative is template-string only)
- Role access for non-developer roles
