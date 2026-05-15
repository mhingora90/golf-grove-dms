# CRM Redesign — Pipeline List View

**Date:** 2026-05-15  
**Status:** Approved

---

## Problem

Current kanban loads all leads in one Supabase query with no pagination. Client-side search hides/shows DOM nodes. At 100+ leads: slow initial load, 7 tall columns, stagger animation on every card degrades performance. No filtering beyond text search.

---

## Decision

Replace kanban with a paginated, sortable **pipeline list view**. Single PR — clean break, no toggle, no legacy kanban code.

---

## Layout

```
┌─ Topbar ─────────────────────────────────────────────────────┐
│ CRM                                          142 total leads  │
├─ Toolbar ─────────────────────────────────────────────────────┤
│ [Search…] [Stage ▾] [Source ▾] [Assigned ▾] [Date range] [+Add Lead] │
├─ Stage pills ─────────────────────────────────────────────────┤
│ All(142) | New(38)* | Contacted(24) | No Response(31) | …    │
├─ Bulk bar (conditional — only when ≥1 checkbox checked) ──────┤
│ 3 leads selected  [Move stage…] [Assign to…] [Delete]  ✕     │
├─ Table ───────────────────────────────────────────────────────┤
│ ☐ | Name↑ | Company | Email | Phone | Stage | Assigned | Age │
│ ☑   Ahmed Al Rashid  Emirates Realty  …  New Lead  Hamad  2d │
│ …                                                             │
├─ Footer ──────────────────────────────────────────────────────┤
│ Showing 1–25 of 38       [← 1 2 →]           25 per page     │
└───────────────────────────────────────────────────────────────┘
```

---

## Components

### Toolbar
- `reg-search` pill input — debounced, triggers server-side query
- Four `filter-sel` dropdowns: Stage, Source, Assigned To, Date range
  - Stage options: All / New Lead / Contacted / No Response / Site Visit / Follow-Up / Closed Won / Closed Lost
  - Source options: All / meta_ads / website / referral / walk_in / other
  - Assigned: All + distinct values from `crm_leads.assigned_to`
  - Date range: two date inputs (created_at from/to), cleared shows all
- `btn btn-primary` "+ Add Lead" — calls existing `openAddLead()`

### Stage Pills
- One pill per stage + "All"
- Shows live count from current filter result
- Clicking a pill sets the Stage filter and re-queries
- Active pill: `box-shadow: inset 0 -2px 0 var(--amber)`, amber count badge

### Table
| Col | Source field | Width | Sortable |
|---|---|---|---|
| Checkbox | — | 32px | No |
| Name | `name` | 1.8fr | Yes |
| Company | `company_name` | 1.4fr | Yes |
| Email | `email` | 1.8fr | No |
| Phone | `phone` | 1.2fr | No |
| Stage | `stage` | 1fr | Yes |
| Assigned | `assigned_to` | 1fr | Yes |
| Age | `created_at` | 0.6fr | Yes (default sort desc) |
| — | — | 60px | No (View → link) |

- Header row uses existing `th` styles (bg3, 10px uppercase, text3)
- `tr:hover td` → bg3 (existing pattern)
- Checked rows → amber-bg tint
- Stage shown as existing `.badge-warning/.badge-info/.badge-success/.badge-neutral/.badge-danger` per stage
- Row click OR "View →" → existing `viewLead(id)` modal unchanged

### Bulk Action Bar
- Hidden by default; appears when `selectedIds.length > 0`
- amber-bg background, 0.5px #FAC775 border-bottom
- **Move stage…** — dropdown or mini-modal to pick target stage → `UPDATE crm_leads SET stage=? WHERE id IN (...)`
- **Assign to…** — text input mini-modal → `UPDATE crm_leads SET assigned_to=? WHERE id IN (...)`
- **Delete** — confirm → `DELETE FROM crm_leads WHERE id IN (...)`
- **✕ Clear** — deselects all
- Checkbox in `<th>` = select-all on current page

### Pagination
- 25 leads per page
- Supabase `.range(offset, offset+24)` with `.count('exact')`
- Footer: "Showing X–Y of Z" + prev/next + page number buttons
- Changing any filter resets to page 1

---

## Data Loading

Single `renderCRM()` async function builds query:

```js
let q = sb.from('crm_leads').select('*', { count: 'exact' });
if (search)    q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
if (stage)     q = q.eq('stage', stage);
if (source)    q = q.eq('source', source);
if (assigned)  q = q.eq('assigned_to', assigned);
if (dateFrom)  q = q.gte('created_at', dateFrom);
if (dateTo)    q = q.lte('created_at', dateTo + 'T23:59:59');
q = q.order(sortCol, { ascending: sortAsc });
q = q.range(page * 25, page * 25 + 24);
const { data, count, error } = await q;
```

Stage pill counts: derived from a second query `select('stage').then(groupBy)` OR use the full unfiltered count per stage (separate lightweight query).

---

## State (module-level variables)

```js
let crmSearch = '', crmStage = '', crmSource = '', crmAssigned = '';
let crmDateFrom = '', crmDateTo = '';
let crmSortCol = 'created_at', crmSortAsc = false;
let crmPage = 0;
let crmSelected = new Set(); // lead IDs
```

All filter changes call `crmPage = 0; crmSelected.clear(); renderCRM();`

---

## Design System Compliance

All new elements use existing app tokens:
- Font: `Plus Jakarta Sans` via `var(--font)`
- Surfaces: `var(--bg2)` / `var(--bg3)` / `var(--bg4)`
- Borders: `0.5px solid var(--border)` / `var(--border2)`
- Radius: `var(--radius)` (8px) / `var(--radius-lg)` (12px)
- Badges: existing `.badge-warning/.badge-info/.badge-success/.badge-neutral/.badge-danger`
- Inputs: existing `.reg-search` (pill search) + `.filter-sel` (dropdown)
- Buttons: existing `.btn` / `.btn-primary` / `.btn-danger`
- No new CSS variables introduced

---

## What's Removed

- `renderCRM()` kanban HTML (7 column layout)
- `crmCard()` card renderer
- `filterCRM()` client-side DOM filter
- `.crm-col`, `.crm-col-head`, `.crm-col-body`, `.crm-col-empty`, `.crm-card*` CSS classes
- Motion One stagger animations on CRM

---

## What's Reused Unchanged

- `viewLead(id)` — modal detail view
- `updateLeadStage(id)` — stage dropdown in modal
- `updateLeadAssigned(id)` — assign input in modal
- `addLeadNote(id)` — notes in modal
- `deleteLead(id)` — delete in modal
- `openAddLead()` / `doAddLead()` — add lead modal
- `timeAgo(dateStr)` — age formatting
- Nav badge `nb-crm` — shows total count

---

## Out of Scope

- Drag-and-drop stage changes (kanban removed)
- Kanban toggle / dual-view
- Virtual scrolling (25/page is sufficient)
- Export to CSV (future)
- Lead merge/dedup UI (future)
