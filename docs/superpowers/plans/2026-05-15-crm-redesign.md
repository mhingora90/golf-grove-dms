# CRM Pipeline List Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the CRM kanban with a paginated, sortable, server-side-filtered pipeline list view that scales to hundreds of leads.

**Architecture:** All changes in index.html. Kanban renderer (renderCRM, crmCard, filterCRM) and CSS replaced wholesale. All modal functions (viewLead, updateLeadStage, updateLeadAssigned, addLeadNote, deleteLead, openAddLead, doAddLead) kept 100% unchanged. Module-level state variables drive all filter/sort/pagination.

**Tech Stack:** Vanilla JS, Supabase client (`sb`), existing CSS tokens (`var(--amber)`, `var(--bg3)`, etc.), existing helpers (`esc()`, `toast()`, `openModal()`, `timeAgo()`).

---

## File Map

| File | Action | What changes |
|---|---|---|
| index.html:262-278 | Modify | Remove kanban CSS, add pipeline list CSS |
| index.html:7215-7223 | Keep | CRM_STAGES array unchanged |
| index.html (before renderCRM) | Insert | 6 state variables |
| index.html:7225-7259 | Replace | renderCRM() rewrite |
| index.html:7261-7274 | Delete | crmCard() |
| index.html:7276-7280 | Delete | filterCRM() |
| index.html (after renderCRM) | Insert | crmHTML, crmTh, crmRow, 5 handler functions, 3 bulk handlers |
| index.html:748 | Modify | Nav handler: add resetCRM() call |
| index.html:7283+ | Keep | All modal functions unchanged |

---

## Task 1: Replace Kanban CSS with Pipeline List CSS

**Files:** Modify `index.html:262-278`

- [ ] **Step 1: Locate the kanban CSS block**

Run:
```bash
grep -n "\.crm-col\|\.crm-card\|CRM" index.html | head -30
```
Expected: lines ~262-278 containing `.crm-col`, `.crm-card`, `.crm-card-name`, etc.

- [ ] **Step 2: Replace the entire block with pipeline list CSS**

Delete from `/* CRM */` through the last `.crm-note` rule. Insert:

```css
/* CRM pipeline list */
.crm-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:12px 16px;border-bottom:0.5px solid var(--border)}
.crm-stage-pills{display:flex;gap:0;border-bottom:0.5px solid var(--border);overflow-x:auto}
.crm-pill{flex:0 0 auto;padding:6px 14px;background:none;border:none;border-bottom:2px solid transparent;font:600 11px var(--font);color:var(--text2);cursor:pointer;white-space:nowrap;transition:color .15s}
.crm-pill:hover{color:var(--charcoal)}
.crm-pill.active{color:var(--amber);border-bottom-color:var(--amber)}
.crm-pill .pill-ct{display:inline-block;margin-left:4px;background:var(--bg4);color:var(--text3);border-radius:10px;padding:1px 6px;font-size:10px;font-weight:700}
.crm-pill.active .pill-ct{background:var(--amber-bg);color:var(--amber)}
.crm-bulk-bar{display:flex;align-items:center;gap:8px;padding:7px 16px;background:var(--amber-bg);border-bottom:0.5px solid #FAC775;font-size:12px}
.crm-bulk-bar .bulk-count{font-weight:700;color:var(--charcoal)}
.crm-table{width:100%;border-collapse:collapse}
.crm-table th{padding:8px 10px;background:var(--bg3);font:700 10px var(--font);color:var(--text3);text-transform:uppercase;letter-spacing:.04em;text-align:left;white-space:nowrap;border-bottom:0.5px solid var(--border);cursor:pointer;user-select:none}
.crm-table th.crm-sort-active{color:var(--amber)}
.crm-table th.no-sort{cursor:default}
.crm-table td{padding:9px 10px;font-size:13px;color:var(--text1);border-bottom:0.5px solid var(--border2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px}
.crm-table tr:hover td{background:var(--bg3);cursor:pointer}
.crm-table tr.crm-checked td{background:var(--amber-bg)}
.crm-table td.crm-muted{color:var(--text3);font-size:12px}
.crm-table td.crm-action{text-align:right;color:var(--text3);font-size:12px;font-weight:600}
.crm-table td.crm-action:hover{color:var(--amber)}
.crm-footer{display:flex;align-items:center;justify-content:space-between;padding:8px 16px;background:var(--bg3);border-top:0.5px solid var(--border);font-size:12px;color:var(--text2)}
.crm-page-btns{display:flex;gap:4px}
.crm-page-btn{padding:3px 9px;border:0.5px solid var(--border);border-radius:var(--radius);background:var(--bg2);font:600 11px var(--font);color:var(--text2);cursor:pointer}
.crm-page-btn:hover{background:var(--bg3)}
.crm-page-btn.active{background:var(--charcoal);color:#fff;border-color:var(--charcoal)}
.crm-page-btn:disabled{opacity:.4;cursor:default}
```

- [ ] **Step 3: Verify no old kanban classes remain**

```bash
grep -n "crm-col\|crm-card" index.html | grep -v "//\|<!--"
```
Expected: zero results (only if any commented references).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(crm): replace kanban CSS with pipeline list styles"
```

---

## Task 2: Add CRM State Variables

**Files:** Modify `index.html` — insert after `CRM_STAGES` closing `];`

- [ ] **Step 1: Locate insertion point**

```bash
grep -n "CRM_STAGES\|crmSearch\|crmStage" index.html | head -20
```
Expected: `CRM_STAGES` at ~line 7215. `crmSearch` should not exist yet.

- [ ] **Step 2: Insert state block immediately after `CRM_STAGES` closing `];`**

```js
let crmSearch = "", crmStage = "", crmSource = "", crmAssigned = "";
let crmDateFrom = "", crmDateTo = "";
let crmSortCol = "created_at", crmSortAsc = false;
let crmPage = 0;
let crmSelected = new Set();
const CRM_PER_PAGE = 25;
let crmSearchTimer = null;
```

- [ ] **Step 3: Verify insertion**

```bash
grep -n "crmSearch\|CRM_PER_PAGE\|crmSelected" index.html | head -10
```
Expected: all 3 variables found on consecutive lines after CRM_STAGES.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(crm): add pipeline list state variables"
```

---

## Task 3: Rewrite renderCRM()

**Files:** Modify `index.html:7225-7259` (old kanban renderCRM)

- [ ] **Step 1: Delete old renderCRM body and replace**

Find `async function renderCRM()` at ~line 7225. Delete the entire function through its closing `}`. Replace with:

```js
async function renderCRM() {
  let q = sb.from("crm_leads").select("*", { count: "exact" });
  if (crmSearch)   q = q.or(`name.ilike.%${crmSearch}%,email.ilike.%${crmSearch}%,phone.ilike.%${crmSearch}%`);
  if (crmStage)    q = q.eq("stage", crmStage);
  if (crmSource)   q = q.eq("source", crmSource);
  if (crmAssigned) q = q.eq("assigned_to", crmAssigned);
  if (crmDateFrom) q = q.gte("created_at", crmDateFrom);
  if (crmDateTo)   q = q.lte("created_at", crmDateTo + "T23:59:59");
  q = q.order(crmSortCol, { ascending: crmSortAsc });
  q = q.range(crmPage * CRM_PER_PAGE, crmPage * CRM_PER_PAGE + CRM_PER_PAGE - 1);
  const { data: leads, count, error } = await q;
  if (error) {
    document.getElementById("content").innerHTML = `<div class="empty-state">Error: ${esc(error.message)}</div>`;
    return;
  }

  // Nav badge: total unfiltered count
  const { count: total } = await sb.from("crm_leads").select("*", { count: "exact", head: true });
  const nb = document.getElementById("nb-crm");
  if (nb) nb.textContent = total || 0;

  // Stage pill counts: all leads (no filters)
  const { data: stageRows } = await sb.from("crm_leads").select("stage");
  const stageMap = {};
  (stageRows || []).forEach(r => { stageMap[r.stage] = (stageMap[r.stage] || 0) + 1; });
  const totalAll = (stageRows || []).length;

  const totalPages = Math.ceil((count || 0) / CRM_PER_PAGE);
  document.getElementById("content").innerHTML = crmHTML(leads || [], count || 0, stageMap, totalAll, totalPages);

  // Populate assigned dropdown with live distinct values
  const { data: assigneeRows } = await sb.from("crm_leads").select("assigned_to").not("assigned_to", "is", null);
  const unique = [...new Set((assigneeRows || []).map(r => r.assigned_to).filter(Boolean))].sort();
  const sel = document.getElementById("crm-assigned-sel");
  if (sel) {
    sel.innerHTML = `<option value="">Assigned: All</option>` +
      unique.map(a => `<option value="${esc(a)}"${crmAssigned === a ? " selected" : ""}>${esc(a)}</option>`).join("");
  }
}
```

- [ ] **Step 2: Verify old renderCRM is gone**

```bash
grep -n "crm-col\|crmCard\|filterCRM\|kanban" index.html | head -10
```
Expected: zero results (they'll be deleted in later tasks, but renderCRM no longer references them).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(crm): rewrite renderCRM with server-side queries, pagination, filters"
```

---

## Task 4: Add crmHTML(), crmTh(), crmRow() Renderers

**Files:** Modify `index.html` — insert after `renderCRM` closing `}`

- [ ] **Step 1: Insert `crmHTML()` immediately after renderCRM**

```js
function crmHTML(leads, count, stageMap, totalAll, totalPages) {
  const from = crmPage * CRM_PER_PAGE + 1;
  const to = Math.min((crmPage + 1) * CRM_PER_PAGE, count);
  const allOnPage = leads.length > 0 && leads.every(l => crmSelected.has(l.id));

  const toolbar = `
    <div class="crm-toolbar">
      <input id="crm-search" class="reg-search" placeholder="Search name, email, phone…"
        value="${esc(crmSearch)}" oninput="crmOnSearch(this.value)" style="min-width:200px">
      <select class="filter-sel" id="crm-stage-sel" onchange="crmSetFilter('stage',this.value)">
        <option value="">Stage: All</option>
        ${CRM_STAGES.map(s => `<option value="${esc(s.key)}"${crmStage === s.key ? " selected" : ""}>${esc(s.label)}</option>`).join("")}
      </select>
      <select class="filter-sel" id="crm-source-sel" onchange="crmSetFilter('source',this.value)">
        <option value="">Source: All</option>
        ${["meta_ads","website","referral","walk_in","other"].map(v =>
          `<option value="${v}"${crmSource === v ? " selected" : ""}>${v.replace("_"," ")}</option>`).join("")}
      </select>
      <select class="filter-sel" id="crm-assigned-sel" onchange="crmSetFilter('assigned',this.value)">
        <option value="">Assigned: All</option>
      </select>
      <input type="date" class="filter-sel" id="crm-date-from" value="${esc(crmDateFrom)}"
        onchange="crmSetFilter('dateFrom',this.value)" title="Created from">
      <input type="date" class="filter-sel" id="crm-date-to" value="${esc(crmDateTo)}"
        onchange="crmSetFilter('dateTo',this.value)" title="Created to">
      <button class="btn btn-primary" onclick="openAddLead()" style="margin-left:auto">+ Add Lead</button>
    </div>`;

  const pills = `
    <div class="crm-stage-pills">
      <button class="crm-pill${!crmStage ? " active" : ""}" onclick="crmSetFilter('stage','')">
        All <span class="pill-ct">${totalAll}</span>
      </button>
      ${CRM_STAGES.map(s => `
        <button class="crm-pill${crmStage === s.key ? " active" : ""}" onclick="crmSetFilter('stage','${esc(s.key)}')">
          ${esc(s.label)} <span class="pill-ct">${stageMap[s.key] || 0}</span>
        </button>`).join("")}
    </div>`;

  const bulkBar = crmSelected.size > 0 ? `
    <div class="crm-bulk-bar">
      <span class="bulk-count">${crmSelected.size} lead${crmSelected.size > 1 ? "s" : ""} selected</span>
      <button class="btn" onclick="crmBulkMoveStage()">Move stage…</button>
      <button class="btn" onclick="crmBulkAssign()">Assign to…</button>
      <button class="btn btn-danger" onclick="crmBulkDelete()">Delete</button>
      <span style="margin-left:auto;cursor:pointer;color:var(--text3)" onclick="crmClearSelection()">✕ Clear</span>
    </div>` : "";

  const thead = `<tr>
    <th class="no-sort" style="width:32px">
      <input type="checkbox" ${allOnPage ? "checked" : ""} onchange="crmToggleAll(this.checked)">
    </th>
    ${crmTh("name","Name")}
    ${crmTh("company_name","Company")}
    <th class="no-sort">Email</th>
    <th class="no-sort">Phone</th>
    ${crmTh("stage","Stage")}
    ${crmTh("assigned_to","Assigned")}
    ${crmTh("created_at","Age")}
    <th class="no-sort"></th>
  </tr>`;

  const rows = leads.length
    ? leads.map(l => crmRow(l)).join("")
    : `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text3)">No leads found</td></tr>`;

  const pageButtons = totalPages <= 1 ? "" : Array.from({ length: totalPages }, (_, i) =>
    `<button class="crm-page-btn${i === crmPage ? " active" : ""}" onclick="crmSetPage(${i})">${i + 1}</button>`
  ).join("");

  const footer = `
    <div class="crm-footer">
      <span>Showing <strong>${count > 0 ? from : 0}–${to}</strong> of <strong>${count}</strong> leads</span>
      <div class="crm-page-btns">
        <button class="crm-page-btn" onclick="crmSetPage(${crmPage - 1})" ${crmPage === 0 ? "disabled" : ""}>←</button>
        ${pageButtons}
        <button class="crm-page-btn" onclick="crmSetPage(${crmPage + 1})" ${crmPage >= totalPages - 1 ? "disabled" : ""}>→</button>
      </div>
      <span>25 per page</span>
    </div>`;

  return toolbar + pills + bulkBar +
    `<table class="crm-table">${thead}<tbody>${rows}</tbody></table>` +
    footer;
}
```

- [ ] **Step 2: Insert `crmTh()` after `crmHTML`**

```js
function crmTh(col, label) {
  const active = crmSortCol === col;
  const arrow = active ? (crmSortAsc ? " ↑" : " ↓") : "";
  return `<th class="${active ? "crm-sort-active" : ""}" onclick="crmSetSort('${col}')">${esc(label)}${arrow}</th>`;
}
```

- [ ] **Step 3: Insert `crmRow()` after `crmTh`**

```js
function crmRow(lead) {
  const checked = crmSelected.has(lead.id);
  const stageClass = {
    new_lead: "badge-warning",
    contacted_responded: "badge-info",
    contacted_no_response: "badge-neutral",
    site_visit: "badge-success",
    follow_up: "badge-warning",
    closed_won: "badge-success",
    closed_lost: "badge-danger"
  }[lead.stage] || "badge-neutral";
  const stageLabel = CRM_STAGES.find(s => s.key === lead.stage)?.label || esc(lead.stage || "--");
  const company = lead.company_name ? esc(lead.company_name) : `<span class="crm-muted">—</span>`;
  const assigned = lead.assigned_to ? esc(lead.assigned_to) : `<span class="crm-muted">—</span>`;
  return `
    <tr class="${checked ? "crm-checked" : ""}" data-id="${lead.id}">
      <td onclick="crmToggleRow(${lead.id},event)" style="width:32px">
        <input type="checkbox" ${checked ? "checked" : ""}>
      </td>
      <td onclick="viewLead(${lead.id})" style="font-weight:600">${esc(lead.name || "--")}</td>
      <td onclick="viewLead(${lead.id})">${company}</td>
      <td onclick="viewLead(${lead.id})" class="crm-muted">${esc(lead.email || "--")}</td>
      <td onclick="viewLead(${lead.id})" class="crm-muted">${esc(lead.phone || "--")}</td>
      <td onclick="viewLead(${lead.id})"><span class="badge ${stageClass}">${stageLabel}</span></td>
      <td onclick="viewLead(${lead.id})" class="crm-muted">${assigned}</td>
      <td onclick="viewLead(${lead.id})" class="crm-muted">${timeAgo(lead.created_at)}</td>
      <td class="crm-action" onclick="viewLead(${lead.id})">View →</td>
    </tr>`;
}
```

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(crm): add crmHTML, crmTh, crmRow renderers"
```

---

## Task 5: Add Filter, Sort, Pagination, and Search Handlers

**Files:** Modify `index.html` — insert after `crmRow` closing `}`

- [ ] **Step 1: Insert `resetCRM()` and `crmOnSearch()`**

```js
function resetCRM() {
  crmSearch = ""; crmStage = ""; crmSource = ""; crmAssigned = "";
  crmDateFrom = ""; crmDateTo = "";
  crmSortCol = "created_at"; crmSortAsc = false;
  crmPage = 0; crmSelected.clear();
}

function crmOnSearch(val) {
  clearTimeout(crmSearchTimer);
  crmSearchTimer = setTimeout(() => {
    crmSearch = val.trim();
    crmPage = 0; crmSelected.clear();
    renderCRM();
  }, 350);
}
```

- [ ] **Step 2: Insert `crmSetFilter()` and `crmSetSort()` and `crmSetPage()`**

```js
function crmSetFilter(field, val) {
  if (field === "stage")    crmStage    = val;
  if (field === "source")   crmSource   = val;
  if (field === "assigned") crmAssigned = val;
  if (field === "dateFrom") crmDateFrom = val;
  if (field === "dateTo")   crmDateTo   = val;
  crmPage = 0; crmSelected.clear();
  renderCRM();
}

function crmSetSort(col) {
  if (crmSortCol === col) {
    crmSortAsc = !crmSortAsc;
  } else {
    crmSortCol = col;
    crmSortAsc = col !== "created_at";
  }
  crmPage = 0; crmSelected.clear();
  renderCRM();
}

function crmSetPage(p) {
  crmPage = p;
  crmSelected.clear();
  renderCRM();
}
```

- [ ] **Step 3: Update the nav handler in `index.html` to call `resetCRM()` when navigating to CRM**

Find ~line 748:
```js
else if(currentPage==='crm') await renderCRM();
```
Replace with:
```js
else if(currentPage==='crm') { resetCRM(); await renderCRM(); }
```

- [ ] **Step 4: Verify handlers exist**

```bash
grep -n "crmSetFilter\|crmSetSort\|crmSetPage\|resetCRM\|crmOnSearch" index.html
```
Expected: all 5 function names found.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(crm): add filter, sort, pagination, and search handlers"
```

---

## Task 6: Add Checkbox Selection Handlers

**Files:** Modify `index.html` — insert after `crmSetPage`

- [ ] **Step 1: Insert `crmToggleRow()`, `crmToggleAll()`, `crmClearSelection()`**

```js
function crmToggleRow(id, event) {
  event.stopPropagation();
  if (crmSelected.has(id)) {
    crmSelected.delete(id);
  } else {
    crmSelected.add(id);
  }
  renderCRM();
}

function crmToggleAll(checked) {
  const rows = document.querySelectorAll(".crm-table tbody tr[data-id]");
  rows.forEach(tr => {
    const id = Number(tr.dataset.id);
    if (checked) { crmSelected.add(id); } else { crmSelected.delete(id); }
  });
  renderCRM();
}

function crmClearSelection() {
  crmSelected.clear();
  renderCRM();
}
```

- [ ] **Step 2: Verify**

```bash
grep -n "crmToggleRow\|crmToggleAll\|crmClearSelection" index.html
```
Expected: each function defined once.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(crm): add checkbox selection handlers"
```

---

## Task 7: Add Bulk Action Handlers

**Files:** Modify `index.html` — insert after `crmClearSelection`

- [ ] **Step 1: Insert bulk move stage handler**

```js
function crmBulkMoveStage() {
  const opts = CRM_STAGES.map(s => `<option value="${esc(s.key)}">${esc(s.label)}</option>`).join("");
  openModal(`<div class="modal-header"><h2>Move ${crmSelected.size} leads to stage</h2></div>
    <div class="modal-body">
      <select id="bulk-stage-sel" class="filter-sel" style="width:100%">${opts}</select>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="crmBulkMoveStageConfirm()">Move</button>
    </div>`);
}

async function crmBulkMoveStageConfirm() {
  const stage = document.getElementById("bulk-stage-sel")?.value;
  if (!stage) return;
  const ids = [...crmSelected];
  const { error } = await sb.from("crm_leads").update({ stage }).in("id", ids);
  if (error) { toast("Error: " + error.message, "error"); return; }
  toast(`${ids.length} leads moved`, "success");
  closeModal();
  crmSelected.clear();
  renderCRM();
}
```

- [ ] **Step 2: Insert bulk assign handler**

```js
function crmBulkAssign() {
  openModal(`<div class="modal-header"><h2>Assign ${crmSelected.size} leads</h2></div>
    <div class="modal-body">
      <input id="bulk-assign-input" class="reg-search" placeholder="Assignee name…" style="width:100%">
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="crmBulkAssignConfirm()">Assign</button>
    </div>`);
}

async function crmBulkAssignConfirm() {
  const assigned_to = document.getElementById("bulk-assign-input")?.value.trim();
  if (!assigned_to) return;
  const ids = [...crmSelected];
  const { error } = await sb.from("crm_leads").update({ assigned_to }).in("id", ids);
  if (error) { toast("Error: " + error.message, "error"); return; }
  toast(`${ids.length} leads assigned to ${assigned_to}`, "success");
  closeModal();
  crmSelected.clear();
  renderCRM();
}
```

- [ ] **Step 3: Insert bulk delete handler**

```js
async function crmBulkDelete() {
  const ids = [...crmSelected];
  if (!confirm(`Delete ${ids.length} lead${ids.length > 1 ? "s" : ""}? This cannot be undone.`)) return;
  const { error } = await sb.from("crm_leads").delete().in("id", ids);
  if (error) { toast("Error: " + error.message, "error"); return; }
  toast(`${ids.length} leads deleted`, "success");
  crmSelected.clear();
  renderCRM();
}
```

- [ ] **Step 4: Verify all 5 bulk functions exist**

```bash
grep -n "crmBulkMoveStage\|crmBulkAssign\|crmBulkDelete" index.html
```
Expected: 5 function definitions found.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(crm): add bulk move stage, assign, and delete handlers"
```

---

## Task 8: Delete crmCard() and filterCRM()

**Files:** Modify `index.html:7261-7280` (approximate — verify with grep first)

- [ ] **Step 1: Locate functions to delete**

```bash
grep -n "function crmCard\|function filterCRM" index.html
```
Expected: both found, crmCard before filterCRM.

- [ ] **Step 2: Delete `crmCard()` entirely**

Find `function crmCard(lead)` through its closing `}`. Delete the whole function.

- [ ] **Step 3: Delete `filterCRM()` entirely**

Find `function filterCRM()` through its closing `}`. Delete the whole function.

- [ ] **Step 4: Verify no remaining references**

```bash
grep -n "crmCard\|filterCRM" index.html
```
Expected: zero results.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(crm): remove crmCard and filterCRM (kanban remnants)"
```

---

## Task 9: End-to-End Verification and Push

- [ ] **Step 1: Start local server**

```bash
npx serve . -p 3000
```
or use existing dev server pattern for this project.

- [ ] **Step 2: Navigate to CRM and verify initial load**

Open `http://localhost:3000`. Log in. Click CRM nav item.
Expected:
- Toolbar renders: search input + 4 dropdowns + "+ Add Lead" button
- Stage pills show 8 pills (All + 7 stages) with live counts
- Table renders: 9 columns, rows show Name, Company, Email, Phone, Stage badge, Assigned, Age, View →
- Footer shows "Showing 1–25 of N leads" with page buttons

- [ ] **Step 3: Verify search (debounced)**

Type "Ahmed" in search box. Wait ~400ms.
Expected: table re-renders with only matching leads, URL unchanged, no page reload.

- [ ] **Step 4: Verify stage filter via pill**

Click "New Lead" pill.
Expected: pill gets amber underline, table shows only new_lead stage, stage dropdown updates to "New Lead".

- [ ] **Step 5: Verify sort**

Click "Name" column header.
Expected: rows re-sort alphabetically ascending, "↑" appears next to Name. Click again → descending "↓".

- [ ] **Step 6: Verify pagination**

If more than 25 leads: click page 2.
Expected: next 25 leads load, footer shows "Showing 26–50 of N".

- [ ] **Step 7: Verify checkbox and bulk bar**

Check one row.
Expected: bulk action bar appears above table with "1 lead selected", Move/Assign/Delete buttons.
Check header checkbox → all rows on page select.

- [ ] **Step 8: Verify bulk move stage**

Select 2 rows. Click "Move stage…".
Expected: modal opens with stage dropdown. Select a stage, click Move. Toast "2 leads moved". Table re-renders.

- [ ] **Step 9: Verify row click opens modal unchanged**

Click any row (not the checkbox).
Expected: existing `viewLead()` modal opens with full lead details, notes, stage change dropdown — all working as before.

- [ ] **Step 10: Verify Add Lead still works**

Click "+ Add Lead". Fill form. Submit.
Expected: lead added via existing `doAddLead()`, table re-renders with new lead.

- [ ] **Step 11: Final commit and push**

```bash
git add index.html
git commit -m "feat(crm): pipeline list view complete — paginated, sortable, server-side filtered"
git push
```

Expected: Vercel deployment triggers automatically.
