# Sales Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a three-page Sales module (Unit Setup, Unit Register, Sales Revenue) inside the existing Golf Grove DMS single-file SPA.

**Architecture:** All code lives in `index.html`. Three new Supabase tables (`units`, `unit_sales`, `payment_milestones`) with developer-only RLS. Three render functions follow the existing if-else dispatch pattern. Nav items are role-gated via a wrapper div revealed on login.

**Tech Stack:** Vanilla JS, HTML/CSS in `index.html`; Supabase Postgres + RLS; migration applied via `npx supabase db push`.

**XSS note:** All user-supplied strings are passed through the existing `esc()` function (line 5246 in index.html) before insertion via template literals assigned to `.innerHTML`. This is the established pattern used throughout the codebase for all existing modules.

---

## Files

| File | Action | What changes |
|------|--------|--------------|
| `supabase/migrations/20260509000001_sales_module.sql` | Create | 3 tables + RLS policies |
| `index.html` | Modify | Nav HTML (~line 474), login handler (~line 623), PAGE_TITLES (line 637), canCreateOnPage (line 639), hash restore list (line 631), render() (line 700), + 3 render functions + CRUD helpers appended before closing script tag |
| `tests/sales-api.test.js` | Create | API-level tests for CRUD and RLS on the 3 new tables |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260509000001_sales_module.sql`

- [ ] **Step 1: Write migration file**

```sql
-- Migration: 20260509000001_sales_module.sql
-- Creates units, unit_sales, payment_milestones with developer-only RLS.

-- ================================================================
-- units
-- ================================================================
create table if not exists public.units (
  id           uuid primary key default gen_random_uuid(),
  unit_no      text not null unique,
  floor        integer not null,
  unit_type    text not null check (unit_type in ('Studio','1BHK')),
  area_sqft    numeric not null,
  listed_price numeric not null,
  created_at   timestamptz default now()
);

alter table public.units enable row level security;

drop policy if exists "units: developer select" on public.units;
drop policy if exists "units: developer insert" on public.units;
drop policy if exists "units: developer update" on public.units;
drop policy if exists "units: developer delete" on public.units;

create policy "units: developer select" on public.units
  for select to authenticated using (get_user_role() = 'developer');
create policy "units: developer insert" on public.units
  for insert to authenticated with check (get_user_role() = 'developer');
create policy "units: developer update" on public.units
  for update to authenticated
  using (get_user_role() = 'developer') with check (get_user_role() = 'developer');
create policy "units: developer delete" on public.units
  for delete to authenticated using (get_user_role() = 'developer');

-- ================================================================
-- unit_sales
-- ================================================================
create table if not exists public.unit_sales (
  id              uuid primary key default gen_random_uuid(),
  unit_id         uuid not null unique references public.units(id) on delete cascade,
  status          text not null default 'reserved' check (status in ('reserved','sold')),
  buyer_name      text,
  sale_date       date,
  sold_price      numeric,
  discount_amount numeric default 0,
  commission_pct  numeric default 0,
  broker_name     text,
  brokerage_name  text,
  spa_status      text default 'not_signed'
    check (spa_status in ('not_signed','signed_buyer','fully_signed')),
  spa_date        date,
  oqood_status    text default 'not_registered'
    check (oqood_status in ('not_registered','registered')),
  oqood_date      date,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table public.unit_sales enable row level security;

drop policy if exists "unit_sales: developer select" on public.unit_sales;
drop policy if exists "unit_sales: developer insert" on public.unit_sales;
drop policy if exists "unit_sales: developer update" on public.unit_sales;
drop policy if exists "unit_sales: developer delete" on public.unit_sales;

create policy "unit_sales: developer select" on public.unit_sales
  for select to authenticated using (get_user_role() = 'developer');
create policy "unit_sales: developer insert" on public.unit_sales
  for insert to authenticated with check (get_user_role() = 'developer');
create policy "unit_sales: developer update" on public.unit_sales
  for update to authenticated
  using (get_user_role() = 'developer') with check (get_user_role() = 'developer');
create policy "unit_sales: developer delete" on public.unit_sales
  for delete to authenticated using (get_user_role() = 'developer');

-- ================================================================
-- payment_milestones
-- ================================================================
create table if not exists public.payment_milestones (
  id              uuid primary key default gen_random_uuid(),
  unit_sale_id    uuid not null references public.unit_sales(id) on delete cascade,
  milestone_name  text not null,
  amount          numeric not null,
  pct_of_sale     numeric not null,
  due_date        date,
  sort_order      integer not null default 0
);

alter table public.payment_milestones enable row level security;

drop policy if exists "payment_milestones: developer select" on public.payment_milestones;
drop policy if exists "payment_milestones: developer insert" on public.payment_milestones;
drop policy if exists "payment_milestones: developer update" on public.payment_milestones;
drop policy if exists "payment_milestones: developer delete" on public.payment_milestones;

create policy "payment_milestones: developer select" on public.payment_milestones
  for select to authenticated using (get_user_role() = 'developer');
create policy "payment_milestones: developer insert" on public.payment_milestones
  for insert to authenticated with check (get_user_role() = 'developer');
create policy "payment_milestones: developer update" on public.payment_milestones
  for update to authenticated
  using (get_user_role() = 'developer') with check (get_user_role() = 'developer');
create policy "payment_milestones: developer delete" on public.payment_milestones
  for delete to authenticated using (get_user_role() = 'developer');
```

- [ ] **Step 2: Push migration**

```bash
npx supabase db push
```

Expected: `Applying migration 20260509000001_sales_module.sql... done`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260509000001_sales_module.sql
git commit -m "feat(sales): add units, unit_sales, payment_milestones tables with RLS"
```

---

## Task 2: Wire Navigation and Render Dispatch

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add Sales nav section**

Find in `index.html` (~line 474):
```html
    <div class="sb-section">Admin</div>
```

Insert this block immediately before it:
```html
    <div id="n-sales-wrap" style="display:none">
      <div class="sb-section">Sales</div>
      <div class="nav-item" id="n-usetup" onclick="nav('usetup',this)">
        <svg class="nav-icon" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="14" height="14" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M8 4v8M4 8h8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        Unit Setup
      </div>
      <div class="nav-item" id="n-ureg" onclick="nav('ureg',this)">
        <svg class="nav-icon" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="12" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M4 6h8M4 9h5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><path d="M1 5h14" stroke="currentColor" stroke-width="1"/></svg>
        Unit Register
      </div>
      <div class="nav-item" id="n-srev" onclick="nav('srev',this)">
        <svg class="nav-icon" viewBox="0 0 16 16" fill="none"><path d="M2 13L5 9l3 2 3-4 3-2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 2v11h12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        Sales Revenue
      </div>
    </div>
```

- [ ] **Step 2: Reveal Sales nav on developer login**

Find (~line 623):
```javascript
  if(profile?.role==='developer'){
    document.getElementById('n-users-wrap').style.display='';
  }
```

Replace with:
```javascript
  if(profile?.role==='developer'){
    document.getElementById('n-users-wrap').style.display='';
    document.getElementById('n-sales-wrap').style.display='';
  }
```

- [ ] **Step 3: Update hash restore list**

Find (~line 631):
```javascript
  const defaultPage = ['dash','draw','sub','sreg','ir','ncr','rfi','trans','corr','punch','ms','subs','users','ipc','boq','finance'].includes(hash) ? hash : 'dash';
```

Replace with:
```javascript
  const defaultPage = ['dash','draw','sub','sreg','ir','ncr','rfi','trans','corr','punch','ms','subs','users','ipc','boq','finance','usetup','ureg','srev'].includes(hash) ? hash : 'dash';
```

- [ ] **Step 4: Add page titles**

Find (line 637):
```javascript
const PAGE_TITLES = {dash:'Dashboard',draw:'Drawing Register',sub:'Submittals (DSUB)',sreg:'Submittal Register',ir:'Inspection Requests',ncr:'Non-Conformance Reports',rfi:'RFI Register',trans:'Transmittal Log',corr:'Correspondence Register',punch:'Punch List / Defects',subs:'Subcontractors',users:'User Management',ms:'Method Statements',ipc:'Payment Certificates',boq:'BOQ Setup',finance:'Finance Overview'};
```

Replace with:
```javascript
const PAGE_TITLES = {dash:'Dashboard',draw:'Drawing Register',sub:'Submittals (DSUB)',sreg:'Submittal Register',ir:'Inspection Requests',ncr:'Non-Conformance Reports',rfi:'RFI Register',trans:'Transmittal Log',corr:'Correspondence Register',punch:'Punch List / Defects',subs:'Subcontractors',users:'User Management',ms:'Method Statements',ipc:'Payment Certificates',boq:'BOQ Setup',finance:'Finance Overview',usetup:'Unit Setup',ureg:'Unit Register',srev:'Sales Revenue'};
```

- [ ] **Step 5: Update canCreateOnPage**

Find:
```javascript
  if(page==='boq') return can('manageRegister');
  return false;
```

Replace with:
```javascript
  if(page==='boq') return can('manageRegister');
  if(page==='usetup') return currentProfile?.role==='developer';
  if(page==='ureg') return currentProfile?.role==='developer';
  return false;
```

- [ ] **Step 6: Add render dispatch branches**

Find (~line 700):
```javascript
  else if(currentPage==='finance') await renderFinance();
  await updateBadges();
```

Replace with:
```javascript
  else if(currentPage==='finance') await renderFinance();
  else if(currentPage==='usetup') await renderUnitSetup();
  else if(currentPage==='ureg') await renderUnitRegister();
  else if(currentPage==='srev') await renderSalesRevenue();
  await updateBadges();
```

- [ ] **Step 7: Wire openNew() for Sales pages**

Find `function openNew()` in index.html. Add at the start of its body:
```javascript
  if(currentPage==='usetup') { openAddUnitForm(); return; }
  if(currentPage==='ureg')   { openSaleForm(null, null);  return; }
```

- [ ] **Step 8: Smoke test**

Open the app as developer — Sales section appears with 3 nav items. Click each: page title updates, no JS errors. Log in as consultant — Sales section absent.

- [ ] **Step 9: Commit**

```bash
git add index.html
git commit -m "feat(sales): wire nav, page titles, render dispatch for usetup/ureg/srev"
```

---

## Task 3: renderUnitSetup() + Single-Unit CRUD

**Files:**
- Modify: `index.html` — append before closing `</script>` tag

- [ ] **Step 1: Append renderUnitSetup + openAddUnitForm**

Note: all data inserted into template literals uses `esc()` to prevent XSS — same pattern as every other render function in this file.

```javascript
// ─── UNIT SETUP ──────────────────────────────────────────────────────────────

async function renderUnitSetup() {
  const {data:units, error} = await sb.from('units').select('*').order('floor').order('unit_no');
  if(error) {
    document.getElementById('content').innerHTML =
      '<div class="empty-state" style="padding:48px;text-align:center;color:var(--red)">Failed to load units: ' + esc(error.message) + '</div>';
    return;
  }
  const list = units||[];
  const studioCount = list.filter(u=>u.unit_type==='Studio').length;
  const bhkCount    = list.filter(u=>u.unit_type==='1BHK').length;

  const rowsHTML = list.length
    ? list.map(u =>
        '<tr>' +
        '<td style="font-weight:600">' + esc(u.unit_no) + '</td>' +
        '<td>' + esc(u.floor) + '</td>' +
        '<td>' + esc(u.unit_type) + '</td>' +
        '<td style="text-align:right">' + (+u.area_sqft).toLocaleString() + '</td>' +
        '<td style="text-align:right">' + fmtAED(u.listed_price) + '</td>' +
        '<td style="width:90px">' +
          '<button class="btn btn-sm" onclick="openEditUnit(\'' + u.id + '\')">Edit</button>' +
          '<button class="btn btn-sm btn-danger" onclick="deleteUnit(\'' + u.id + '\',\'' + esc(u.unit_no) + '\')" style="margin-left:4px">&times;</button>' +
        '</td></tr>'
      ).join('')
    : '<tr><td colspan="6" class="empty-state">No units yet. Use \u201c+ New\u201d or Import CSV to add units.</td></tr>';

  const statsBar = list.length
    ? '<div class="module-bar" style="margin-bottom:14px">' +
        '<div class="module-stat"><div class="module-stat-val">' + list.length + '</div><div class="module-stat-label">Total Units</div></div>' +
        '<div class="module-stat"><div class="module-stat-val">' + studioCount + '</div><div class="module-stat-label">Studio</div></div>' +
        '<div class="module-stat"><div class="module-stat-val">' + bhkCount + '</div><div class="module-stat-label">1BHK</div></div>' +
      '</div>'
    : '';

  document.getElementById('content').innerHTML =
    '<div class="fbar" style="margin-bottom:14px">' +
      '<button class="btn" onclick="downloadUnitCSVTemplate()">Download CSV Template</button>' +
      '<label class="btn" style="margin-left:6px;cursor:pointer">Import CSV' +
        '<input type="file" accept=".csv" style="display:none" onchange="handleUnitCSV(event)">' +
      '</label>' +
    '</div>' +
    statsBar +
    '<div class="card"><div class="tw"><table>' +
      '<tr><th>Unit No.</th><th>Floor</th><th>Type</th><th style="text-align:right">Area (sqft)</th><th style="text-align:right">Listed Price</th><th></th></tr>' +
      rowsHTML +
    '</table></div></div>';
}

function openAddUnitForm() {
  openModal('Add Unit',
    '<div class="form-group"><label class="form-label">Unit No.</label><input id="uf-no" class="form-input" placeholder="e.g. 101" /></div>' +
    '<div class="form-group"><label class="form-label">Floor</label><input id="uf-floor" type="number" min="1" class="form-input" placeholder="1" /></div>' +
    '<div class="form-group"><label class="form-label">Type</label><select id="uf-type" class="form-input"><option value="Studio">Studio</option><option value="1BHK">1BHK</option></select></div>' +
    '<div class="form-group"><label class="form-label">Area (sqft)</label><input id="uf-sqft" type="number" min="1" class="form-input" placeholder="490" /></div>' +
    '<div class="form-group"><label class="form-label">Listed Price (AED)</label><input id="uf-price" type="number" min="1" class="form-input" placeholder="625000" /></div>',
    '<button class="btn btn-primary" onclick="saveNewUnit()">Add Unit</button><button class="btn" onclick="closeModal()">Cancel</button>'
  );
}

async function saveNewUnit() {
  const unit_no      = document.getElementById('uf-no')?.value.trim();
  const floor        = parseInt(document.getElementById('uf-floor')?.value);
  const unit_type    = document.getElementById('uf-type')?.value;
  const area_sqft    = parseFloat(document.getElementById('uf-sqft')?.value);
  const listed_price = parseFloat(document.getElementById('uf-price')?.value);
  if(!unit_no || !floor || !area_sqft || !listed_price) { toast('Fill in all fields','error'); return; }
  const {error} = await sb.from('units').insert({unit_no, floor, unit_type, area_sqft, listed_price});
  if(error) { toast('Error: ' + error.message,'error'); return; }
  toast('Unit added','success');
  closeModal();
  render();
}

async function openEditUnit(id) {
  const {data:u, error} = await sb.from('units').select('*').eq('id',id).single();
  if(error||!u) { toast('Failed to load unit','error'); return; }
  openModal('Edit Unit ' + esc(u.unit_no),
    '<div class="form-group"><label class="form-label">Unit No.</label><input id="eu-no" class="form-input" value="' + esc(u.unit_no) + '" /></div>' +
    '<div class="form-group"><label class="form-label">Floor</label><input id="eu-floor" type="number" class="form-input" value="' + esc(u.floor) + '" /></div>' +
    '<div class="form-group"><label class="form-label">Type</label><select id="eu-type" class="form-input">' +
      '<option value="Studio"' + (u.unit_type==='Studio'?' selected':'') + '>Studio</option>' +
      '<option value="1BHK"' + (u.unit_type==='1BHK'?' selected':'') + '>1BHK</option>' +
    '</select></div>' +
    '<div class="form-group"><label class="form-label">Area (sqft)</label><input id="eu-sqft" type="number" class="form-input" value="' + esc(u.area_sqft) + '" /></div>' +
    '<div class="form-group"><label class="form-label">Listed Price (AED)</label><input id="eu-price" type="number" class="form-input" value="' + esc(u.listed_price) + '" /></div>',
    '<button class="btn btn-primary" onclick="saveEditUnit(\'' + id + '\')">Save</button><button class="btn" onclick="closeModal()">Cancel</button>'
  );
}

async function saveEditUnit(id) {
  const unit_no      = document.getElementById('eu-no')?.value.trim();
  const floor        = parseInt(document.getElementById('eu-floor')?.value);
  const unit_type    = document.getElementById('eu-type')?.value;
  const area_sqft    = parseFloat(document.getElementById('eu-sqft')?.value);
  const listed_price = parseFloat(document.getElementById('eu-price')?.value);
  if(!unit_no || !floor || !area_sqft || !listed_price) { toast('Fill in all fields','error'); return; }
  const {error} = await sb.from('units').update({unit_no, floor, unit_type, area_sqft, listed_price}).eq('id',id);
  if(error) { toast('Error: ' + error.message,'error'); return; }
  toast('Unit updated','success');
  closeModal();
  render();
}

async function deleteUnit(id, unitNo) {
  const {count} = await sb.from('unit_sales').select('*',{head:true,count:'exact'}).eq('unit_id',id);
  if(count > 0) { toast('Unit ' + unitNo + ' has a sale record \u2014 remove it first','error'); return; }
  const ok = await confirmModal('Delete unit ' + unitNo + '? This cannot be undone.');
  if(!ok) return;
  const {error} = await sb.from('units').delete().eq('id',id);
  if(error) { toast('Error: ' + error.message,'error'); return; }
  toast('Unit deleted','success');
  render();
}
```

- [ ] **Step 2: Verify in browser**

Navigate to Unit Setup as developer. Confirm:
- "+ New" opens Add Unit form.
- Add unit 101 / Floor 1 / Studio / 490 / 625000. Row appears.
- Edit changes price. Delete removes unit.
- Empty state shows when no units exist.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(sales): Unit Setup page — add, edit, delete units"
```

---

## Task 4: Unit Setup — CSV Import

**Files:**
- Modify: `index.html` — append before closing `</script>` tag

- [ ] **Step 1: Append CSV helpers**

```javascript
function downloadUnitCSVTemplate() {
  const csv = 'unit_no,floor,unit_type,area_sqft,listed_price\n101,1,Studio,490,625000\n201,2,1BHK,720,950000\n';
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'unit-import-template.csv';
  a.click();
}

async function handleUnitCSV(event) {
  const file = event.target.files[0];
  if(!file) return;
  const text = await file.text();
  const lines = text.trim().split('\n').filter(l=>l.trim());
  if(lines.length < 2) { toast('CSV is empty or has no data rows','error'); return; }
  const headers = lines[0].split(',').map(h=>h.trim().toLowerCase());
  const required = ['unit_no','floor','unit_type','area_sqft','listed_price'];
  const missing = required.filter(r=>!headers.includes(r));
  if(missing.length) { toast('CSV missing columns: ' + missing.join(', '),'error'); return; }

  const rows = [];
  for(let i=1; i<lines.length; i++) {
    const vals = lines[i].split(',').map(v=>v.trim());
    const obj = {};
    headers.forEach((h,idx)=>{ obj[h]=vals[idx]??''; });
    if(!obj.unit_no || !obj.floor || !obj.unit_type || !obj.area_sqft || !obj.listed_price) {
      toast('Row ' + (i+1) + ' incomplete \u2014 skipped','warning');
      continue;
    }
    if(!['Studio','1BHK'].includes(obj.unit_type)) {
      toast('Row ' + (i+1) + ': unit_type must be Studio or 1BHK \u2014 skipped','warning');
      continue;
    }
    rows.push({
      unit_no: obj.unit_no,
      floor: parseInt(obj.floor),
      unit_type: obj.unit_type,
      area_sqft: parseFloat(obj.area_sqft),
      listed_price: parseFloat(obj.listed_price),
    });
  }
  if(!rows.length) { toast('No valid rows to import','error'); return; }
  const {error} = await sb.from('units').upsert(rows, {onConflict:'unit_no'});
  if(error) { toast('Import error: ' + error.message,'error'); return; }
  toast('Imported ' + rows.length + ' units','success');
  event.target.value = '';
  render();
}
```

- [ ] **Step 2: Verify import**

Download template. Fill in 3 rows. Import. Units appear in table. Re-import same file — no duplicates (upsert on unit_no).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(sales): Unit Setup CSV import with template download"
```

---

## Task 5: renderUnitRegister() — Table, Filters, Search

**Files:**
- Modify: `index.html` — append before closing `</script>` tag

- [ ] **Step 1: Append render function and badge helpers**

```javascript
// ─── UNIT REGISTER ───────────────────────────────────────────────────────────

function _unitSaleStatus(u) {
  return u.unit_sales ? u.unit_sales.status : 'available';
}

function _unitStatusBadge(status) {
  const cfg = {
    available: ['#EAF3DE','#3B6D11','Available'],
    reserved:  ['#FEF3E8','#854F0B','Reserved'],
    sold:      ['#d4edbc','#2d6a0a','Sold'],
  };
  const [bg,color,label] = cfg[status]||cfg.available;
  return '<span style="background:' + bg + ';color:' + color + ';padding:1px 8px;border-radius:4px;font-size:10px;font-weight:500">' + label + '</span>';
}

function _spaBadge(s) {
  const cfg = {
    not_signed:   ['#e8e4dc','#666','Not Signed'],
    signed_buyer: ['#FEF3E8','#854F0B','Signed \u2014 Buyer'],
    fully_signed: ['#d4edbc','#2d6a0a','Fully Signed'],
  };
  const [bg,color,label] = cfg[s||'not_signed']||cfg.not_signed;
  return '<span style="background:' + bg + ';color:' + color + ';padding:1px 6px;border-radius:4px;font-size:10px">' + label + '</span>';
}

function _oqoodBadge(s) {
  const cfg = {
    not_registered: ['#e8e4dc','#666','Not Registered'],
    registered:     ['#d4edbc','#2d6a0a','Registered'],
  };
  const [bg,color,label] = cfg[s||'not_registered']||cfg.not_registered;
  return '<span style="background:' + bg + ';color:' + color + ';padding:1px 6px;border-radius:4px;font-size:10px">' + label + '</span>';
}

async function renderUnitRegister() {
  const {data:units, error} = await sb
    .from('units')
    .select('*, unit_sales(*, payment_milestones(*))')
    .order('floor')
    .order('unit_no');
  if(error) {
    document.getElementById('content').innerHTML =
      '<div class="empty-state" style="padding:48px;text-align:center;color:var(--red)">Failed to load: ' + esc(error.message) + '</div>';
    return;
  }
  window._uregData = units||[];
  _renderUregTable();
}

function _renderUregTable() {
  const units  = window._uregData||[];
  const typeF   = document.getElementById('urf-type')?.value   || 'all';
  const statusF = document.getElementById('urf-status')?.value || 'all';
  const floorF  = document.getElementById('urf-floor')?.value  || 'all';
  const search  = (document.getElementById('urf-search')?.value||'').toLowerCase().trim();

  const floors = [...new Set(units.map(u=>u.floor))].sort((a,b)=>a-b);

  const filtered = units.filter(u => {
    const st = _unitSaleStatus(u);
    if(typeF !== 'all' && u.unit_type !== typeF) return false;
    if(statusF !== 'all' && st !== statusF) return false;
    if(floorF !== 'all' && String(u.floor) !== floorF) return false;
    if(search) {
      const buyer = (u.unit_sales?.buyer_name||'').toLowerCase();
      if(!u.unit_no.toLowerCase().includes(search) && !buyer.includes(search)) return false;
    }
    return true;
  });

  const rowsHTML = filtered.length
    ? filtered.map(u => {
        const sale = u.unit_sales;
        const st   = _unitSaleStatus(u);
        return '<tr style="cursor:pointer" onclick="openUnitModal(\'' + u.id + '\')">' +
          '<td style="font-weight:600">' + esc(u.unit_no) + '</td>' +
          '<td>' + esc(u.floor) + '</td>' +
          '<td>' + esc(u.unit_type) + '</td>' +
          '<td style="text-align:right">' + (+u.area_sqft).toLocaleString() + '</td>' +
          '<td style="text-align:right">' + fmtAED(u.listed_price) + '</td>' +
          '<td style="color:var(--blue)">' + (sale ? esc(sale.buyer_name||'\u2014') : '\u2014') + '</td>' +
          '<td>' + (sale ? _spaBadge(sale.spa_status) : '\u2014') + '</td>' +
          '<td>' + (sale ? _oqoodBadge(sale.oqood_status) : '\u2014') + '</td>' +
          '<td>' + _unitStatusBadge(st) + '</td>' +
          '</tr>';
      }).join('')
    : '<tr><td colspan="9" class="empty-state">No units match filters.</td></tr>';

  const floorOpts = floors.map(f=>'<option value="' + f + '">Floor ' + f + '</option>').join('');

  const filterBar =
    '<div class="fbar" style="margin-bottom:14px">' +
      '<select id="urf-type" class="form-control" style="width:auto;padding:5px 8px;font-size:12px" onchange="_renderUregTable()">' +
        '<option value="all">All Types</option><option value="Studio">Studio</option><option value="1BHK">1BHK</option>' +
      '</select>' +
      '<select id="urf-status" class="form-control" style="width:auto;padding:5px 8px;font-size:12px;margin-left:6px" onchange="_renderUregTable()">' +
        '<option value="all">All Statuses</option><option value="available">Available</option><option value="reserved">Reserved</option><option value="sold">Sold</option>' +
      '</select>' +
      '<select id="urf-floor" class="form-control" style="width:auto;padding:5px 8px;font-size:12px;margin-left:6px" onchange="_renderUregTable()">' +
        '<option value="all">All Floors</option>' + floorOpts +
      '</select>' +
      '<input id="urf-search" class="form-control" style="width:180px;padding:5px 8px;font-size:12px;margin-left:6px" placeholder="Search unit / buyer\u2026" oninput="_renderUregTable()" />' +
    '</div>';

  // Preserve filter state across re-renders
  const savedType   = typeF;
  const savedStatus = statusF;
  const savedFloor  = floorF;
  const savedSearch = search;

  document.getElementById('content').innerHTML =
    filterBar +
    '<div class="card"><div class="tw"><table>' +
      '<tr><th>Unit</th><th>Floor</th><th>Type</th><th style="text-align:right">Sqft</th><th style="text-align:right">Listed Price</th><th>Buyer</th><th>SPA</th><th>Oqood</th><th>Status</th></tr>' +
      rowsHTML +
    '</table></div></div>';

  // Restore filter values after innerHTML wipe
  const t = document.getElementById('urf-type');
  if(t) {
    t.value = savedType;
    document.getElementById('urf-status').value = savedStatus;
    document.getElementById('urf-floor').value  = savedFloor;
    document.getElementById('urf-search').value = savedSearch;
  }
}
```

- [ ] **Step 2: Verify in browser**

Navigate to Unit Register. Confirm table renders, filters live-update, search works.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(sales): Unit Register table with live filters and search"
```

---

## Task 6: Unit Detail Modal — View Mode

**Files:**
- Modify: `index.html` — append before closing `</script>` tag

- [ ] **Step 1: Append openUnitModal**

```javascript
// ─── UNIT DETAIL MODAL ───────────────────────────────────────────────────────

function openUnitModal(unitId) {
  const u = (window._uregData||[]).find(x=>x.id===unitId);
  if(!u) { toast('Unit not found','error'); return; }
  const sale   = u.unit_sales;
  const ms     = (sale?.payment_milestones||[]).sort((a,b)=>a.sort_order-b.sort_order);
  const isDev  = currentProfile?.role==='developer';

  const field = (label, val) =>
    '<div><div style="font-size:10px;color:var(--text3);margin-bottom:2px">' + label + '</div><div>' + val + '</div></div>';

  // Unit info strip
  const infoStrip =
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;padding:10px 0;border-bottom:0.5px solid var(--border);margin-bottom:14px">' +
    '<div><div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">Unit No.</div><div style="font-weight:600">' + esc(u.unit_no) + '</div></div>' +
    '<div><div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">Type</div><div>' + esc(u.unit_type) + '</div></div>' +
    '<div><div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">Floor</div><div>' + esc(u.floor) + '</div></div>' +
    '<div><div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">Area (sqft)</div><div style="font-weight:600">' + (+u.area_sqft).toLocaleString() + ' sqft</div></div>' +
    '</div>';

  // Sale details
  let saleSection = '';
  if(sale) {
    const commVal = ((+sale.sold_price||0) * (+sale.commission_pct||0) / 100);
    const discPct = (+u.listed_price) ? (((+sale.discount_amount||0) / (+u.listed_price)) * 100).toFixed(2) : '0.00';
    saleSection =
      '<div style="margin-bottom:14px">' +
      '<div style="font-size:11px;font-weight:600;color:var(--charcoal);margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em">Sale Details</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
        field('Buyer Name', '<span style="font-weight:500">' + esc(sale.buyer_name||'\u2014') + '</span>') +
        field('Sale Date', esc(sale.sale_date||'\u2014')) +
        field('Listed Price', fmtAED(u.listed_price)) +
        field('Discount', '<span style="color:var(--amber)">' + fmtAED(sale.discount_amount||0) + ' (' + discPct + '%)</span>') +
        field('Sold Price', '<span style="font-weight:600;color:var(--green)">' + fmtAED(sale.sold_price||0) + '</span>') +
        '<div></div>' +
        field('Commission %', (+sale.commission_pct||0).toFixed(2) + '%') +
        field('Commission Value', '<span style="font-weight:500;color:var(--blue)">' + fmtAED(commVal) + '</span>') +
        field('Broker Name', esc(sale.broker_name||'\u2014')) +
        field('Brokerage', esc(sale.brokerage_name||'\u2014')) +
      '</div></div>';
  }

  // SPA + Oqood
  let spaSection = '';
  if(sale) {
    spaSection =
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px;background:var(--bg3);border-radius:8px;margin-bottom:14px">' +
      '<div><div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">SPA Status</div>' +
        _spaBadge(sale.spa_status) +
        '<div style="font-size:10px;color:var(--text3);margin-top:4px">Date: ' + esc(sale.spa_date||'\u2014') + '</div></div>' +
      '<div><div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Oqood Status</div>' +
        _oqoodBadge(sale.oqood_status) +
        '<div style="font-size:10px;color:var(--text3);margin-top:4px">Date: ' + esc(sale.oqood_date||'\u2014') + '</div></div>' +
      '</div>';
  }

  // Payment milestones
  let msSection = '';
  if(sale && ms.length) {
    const msRows = ms.map(m =>
      '<tr style="border-bottom:0.5px solid var(--border)">' +
      '<td style="padding:5px 8px">' + esc(m.milestone_name) + '</td>' +
      '<td style="padding:5px 8px;text-align:right">' + fmtAED(m.amount) + '</td>' +
      '<td style="padding:5px 8px;text-align:right;color:var(--text2)">' + (+m.pct_of_sale).toFixed(0) + '%</td>' +
      '<td style="padding:5px 8px;color:' + (m.due_date?'inherit':'var(--text3)') + '">' + esc(m.due_date||'On Handover') + '</td>' +
      '</tr>'
    ).join('');
    msSection =
      '<div>' +
      '<div style="font-size:11px;font-weight:600;color:var(--charcoal);margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em;display:flex;justify-content:space-between;align-items:center">' +
        'Payment Plan Milestones' +
        '<span style="font-size:10px;font-weight:400;color:var(--text2)">' + fmtAED(sale.sold_price||0) + ' contracted</span>' +
      '</div>' +
      '<table style="width:100%;font-size:11px;border-collapse:collapse">' +
        '<tr style="background:var(--bg3)"><th style="padding:5px 8px;text-align:left">Milestone</th><th style="padding:5px 8px;text-align:right">Amount</th><th style="padding:5px 8px;text-align:right">%</th><th style="padding:5px 8px;text-align:left">Due Date</th></tr>' +
        msRows +
      '</table></div>';
  }

  const availNote = !sale
    ? '<div style="padding:14px;background:var(--green-bg);border-radius:8px;font-size:12px;color:var(--green);margin-bottom:14px">No sale recorded \u2014 unit is available.</div>'
    : '';

  const body = infoStrip + availNote + saleSection + spaSection + msSection;

  const footer = isDev
    ? (sale
        ? '<button class="btn btn-primary" onclick="openSaleForm(\'' + u.id + '\',\'' + sale.id + '\')">Edit Sale</button>' +
          '<button class="btn btn-danger" onclick="markUnitAvailable(\'' + sale.id + '\',\'' + esc(u.unit_no) + '\')" style="margin-left:6px">Mark Available</button>' +
          '<button class="btn" onclick="closeModal()" style="margin-left:auto">Close</button>'
        : '<button class="btn btn-primary" onclick="openSaleForm(\'' + u.id + '\',null)">+ Add Sale</button>' +
          '<button class="btn" onclick="closeModal()" style="margin-left:auto">Close</button>')
    : '<button class="btn" onclick="closeModal()">Close</button>';

  openModal('Unit ' + esc(u.unit_no) + ' \u2014 ' + esc(u.unit_type) + ' \u00b7 Floor ' + esc(u.floor), body, footer, true);
}
```

- [ ] **Step 2: Verify in browser**

Click unit rows. Available: green note + Add Sale button. Sold/Reserved: all 4 sections visible. Edit Sale and Mark Available buttons present for developer.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(sales): Unit Detail modal — view mode with 4 sections"
```

---

## Task 7: Add/Edit Sale Form + Save + Mark Available

**Files:**
- Modify: `index.html` — append before closing `</script>` tag

- [ ] **Step 1: Append openSaleForm**

```javascript
// ─── SALE FORM ───────────────────────────────────────────────────────────────

function openSaleForm(unitId, saleId) {
  const u = (window._uregData||[]).find(x=>x.id===unitId);
  if(!u) { toast('Unit not found','error'); return; }
  const sale = u.unit_sales;
  const ms   = (sale?.payment_milestones||[]).sort((a,b)=>a.sort_order-b.sort_order);
  const isEdit = !!saleId;

  const defaultMS = [
    {milestone_name:'Booking Deposit', pct_of_sale:10, amount:'', due_date:'', sort_order:0},
    {milestone_name:'1st Instalment',  pct_of_sale:30, amount:'', due_date:'', sort_order:1},
    {milestone_name:'2nd Instalment',  pct_of_sale:30, amount:'', due_date:'', sort_order:2},
    {milestone_name:'Handover',        pct_of_sale:30, amount:'', due_date:'',  sort_order:3},
  ];
  const msSource = (isEdit && ms.length) ? ms : defaultMS;

  const msRows = msSource.map((m,i) =>
    '<tr>' +
    '<td><input class="form-control" data-ms="name" data-i="' + i + '" value="' + esc(m.milestone_name) + '" style="width:100%;padding:4px 6px;font-size:11px" /></td>' +
    '<td><input type="number" class="form-control" data-ms="amount" data-i="' + i + '" value="' + (m.amount||'') + '" style="width:95px;padding:4px 6px;font-size:11px;text-align:right" /></td>' +
    '<td><input type="number" class="form-control" data-ms="pct" data-i="' + i + '" value="' + (m.pct_of_sale||'') + '" style="width:55px;padding:4px 6px;font-size:11px;text-align:right" /></td>' +
    '<td><input type="date" class="form-control" data-ms="due" data-i="' + i + '" value="' + (m.due_date||'') + '" style="padding:4px 6px;font-size:11px" /></td>' +
    '</tr>'
  ).join('');

  const sel = (id, opts, val) =>
    '<select id="' + id + '" class="form-input">' +
    opts.map(o=>'<option value="' + o[0] + '"' + (val===o[0]?' selected':'') + '>' + o[1] + '</option>').join('') +
    '</select>';

  const body =
    '<div style="font-size:11px;font-weight:600;color:var(--charcoal);margin-bottom:10px;text-transform:uppercase;letter-spacing:.05em">Sale Details</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">' +
      '<div class="form-group" style="margin:0"><label class="form-label">Buyer Name</label><input id="sf-buyer" class="form-input" value="' + esc(sale?.buyer_name||'') + '" /></div>' +
      '<div class="form-group" style="margin:0"><label class="form-label">Sale Date</label><input id="sf-saledate" type="date" class="form-input" value="' + esc(sale?.sale_date||'') + '" /></div>' +
      '<div class="form-group" style="margin:0"><label class="form-label">Sold Price (AED)</label><input id="sf-price" type="number" class="form-input" value="' + (sale?.sold_price||'') + '" /></div>' +
      '<div class="form-group" style="margin:0"><label class="form-label">Discount (AED)</label><input id="sf-discount" type="number" class="form-input" value="' + (sale?.discount_amount||0) + '" /></div>' +
      '<div class="form-group" style="margin:0"><label class="form-label">Commission %</label><input id="sf-commpct" type="number" step="0.1" class="form-input" value="' + (sale?.commission_pct||0) + '" /></div>' +
      '<div></div>' +
      '<div class="form-group" style="margin:0"><label class="form-label">Broker Name</label><input id="sf-broker" class="form-input" value="' + esc(sale?.broker_name||'') + '" /></div>' +
      '<div class="form-group" style="margin:0"><label class="form-label">Brokerage</label><input id="sf-brokerage" class="form-input" value="' + esc(sale?.brokerage_name||'') + '" /></div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">' +
      '<div class="form-group" style="margin:0"><label class="form-label">Unit Status</label>' + sel('sf-status',[['reserved','Reserved'],['sold','Sold']], sale?.status||'reserved') + '</div>' +
      '<div></div>' +
      '<div class="form-group" style="margin:0"><label class="form-label">SPA Status</label>' + sel('sf-spa',[['not_signed','Not Signed'],['signed_buyer','Signed \u2014 Buyer'],['fully_signed','Fully Signed']], sale?.spa_status||'not_signed') + '</div>' +
      '<div class="form-group" style="margin:0"><label class="form-label">SPA Date</label><input id="sf-spadate" type="date" class="form-input" value="' + esc(sale?.spa_date||'') + '" /></div>' +
      '<div class="form-group" style="margin:0"><label class="form-label">Oqood Status</label>' + sel('sf-oqood',[['not_registered','Not Registered'],['registered','Registered']], sale?.oqood_status||'not_registered') + '</div>' +
      '<div class="form-group" style="margin:0"><label class="form-label">Oqood Date</label><input id="sf-oqooddate" type="date" class="form-input" value="' + esc(sale?.oqood_date||'') + '" /></div>' +
    '</div>' +
    '<div style="font-size:11px;font-weight:600;color:var(--charcoal);margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em">Payment Plan Milestones</div>' +
    '<table style="width:100%;font-size:11px;border-collapse:collapse;margin-bottom:14px">' +
      '<tr style="background:var(--bg3)"><th style="padding:4px 6px;text-align:left">Milestone</th><th style="padding:4px 6px;text-align:right">Amount (AED)</th><th style="padding:4px 6px;text-align:right">%</th><th style="padding:4px 6px">Due Date</th></tr>' +
      msRows +
    '</table>';

  openModal(
    (isEdit ? 'Edit Sale \u2014 Unit ' : 'Add Sale \u2014 Unit ') + esc(u.unit_no),
    body,
    '<button class="btn btn-primary" onclick="saveSaleForm(\'' + unitId + '\',\'' + (saleId||'') + '\')">Save</button><button class="btn" onclick="closeModal()">Cancel</button>',
    true
  );
}
```

- [ ] **Step 2: Append saveSaleForm**

```javascript
async function saveSaleForm(unitId, saleId) {
  const buyer_name      = document.getElementById('sf-buyer')?.value.trim()||null;
  const sale_date       = document.getElementById('sf-saledate')?.value||null;
  const sold_price      = parseFloat(document.getElementById('sf-price')?.value)||null;
  const discount_amount = parseFloat(document.getElementById('sf-discount')?.value)||0;
  const commission_pct  = parseFloat(document.getElementById('sf-commpct')?.value)||0;
  const broker_name     = document.getElementById('sf-broker')?.value.trim()||null;
  const brokerage_name  = document.getElementById('sf-brokerage')?.value.trim()||null;
  const status          = document.getElementById('sf-status')?.value||'reserved';
  const spa_status      = document.getElementById('sf-spa')?.value||'not_signed';
  const spa_date        = document.getElementById('sf-spadate')?.value||null;
  const oqood_status    = document.getElementById('sf-oqood')?.value||'not_registered';
  const oqood_date      = document.getElementById('sf-oqooddate')?.value||null;

  const nameEls   = [...document.querySelectorAll('[data-ms="name"]')];
  const amountEls = [...document.querySelectorAll('[data-ms="amount"]')];
  const pctEls    = [...document.querySelectorAll('[data-ms="pct"]')];
  const dueEls    = [...document.querySelectorAll('[data-ms="due"]')];
  const milestones = nameEls
    .map((el,i)=>({
      milestone_name: el.value.trim(),
      amount: parseFloat(amountEls[i]?.value)||0,
      pct_of_sale: parseFloat(pctEls[i]?.value)||0,
      due_date: dueEls[i]?.value||null,
      sort_order: i,
    }))
    .filter(m=>m.milestone_name);

  const saleData = {
    unit_id:unitId, status, buyer_name, sale_date, sold_price, discount_amount,
    commission_pct, broker_name, brokerage_name, spa_status, spa_date, oqood_status,
    oqood_date, updated_at: new Date().toISOString()
  };

  let targetSaleId = saleId;
  if(saleId) {
    const {error} = await sb.from('unit_sales').update(saleData).eq('id',saleId);
    if(error) { toast('Save error: ' + error.message,'error'); return; }
  } else {
    const {data, error} = await sb.from('unit_sales').insert(saleData).select().single();
    if(error) { toast('Save error: ' + error.message,'error'); return; }
    targetSaleId = data.id;
  }

  // Replace milestones: delete all then insert fresh
  await sb.from('payment_milestones').delete().eq('unit_sale_id', targetSaleId);
  if(milestones.length) {
    const rows = milestones.map(m=>({...m, unit_sale_id:targetSaleId}));
    const {error:msErr} = await sb.from('payment_milestones').insert(rows);
    if(msErr) { toast('Milestone error: ' + msErr.message,'error'); return; }
  }

  toast('Sale saved','success');
  closeModal();
  render();
}

async function markUnitAvailable(saleId, unitNo) {
  const ok = await confirmModal('Remove sale record for Unit ' + unitNo + ' and mark it Available? Payment milestones will also be deleted.');
  if(!ok) return;
  const {error} = await sb.from('unit_sales').delete().eq('id',saleId);
  if(error) { toast('Error: ' + error.message,'error'); return; }
  toast('Unit ' + unitNo + ' is now available','success');
  closeModal();
  render();
}
```

- [ ] **Step 3: Verify full sale workflow**

1. Add sale to available unit — fill all fields, 4 milestones with dates. Save. Unit shows buyer + Reserved badge.
2. Open unit modal → Edit Sale. Change sold price. Save. Reopen — new price shows.
3. Mark Available. Confirm. Unit returns to green Available.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(sales): Add/edit sale form, milestone CRUD, mark-available action"
```

---

## Task 8: renderSalesRevenue()

**Files:**
- Modify: `index.html` — append before closing `</script>` tag

- [ ] **Step 1: Append renderSalesRevenue**

```javascript
// ─── SALES REVENUE ───────────────────────────────────────────────────────────

async function renderSalesRevenue() {
  const {data:units, error} = await sb
    .from('units')
    .select('*, unit_sales(*, payment_milestones(*))');
  if(error) {
    document.getElementById('content').innerHTML =
      '<div class="empty-state" style="padding:48px;text-align:center;color:var(--red)">Failed to load: ' + esc(error.message) + '</div>';
    return;
  }
  const all = units||[];
  const soldUnits     = all.filter(u=>u.unit_sales?.status==='sold');
  const reservedUnits = all.filter(u=>u.unit_sales?.status==='reserved');
  const availUnits    = all.filter(u=>!u.unit_sales);
  const contracted    = [...soldUnits,...reservedUnits];
  const studios       = all.filter(u=>u.unit_type==='Studio');
  const bhks          = all.filter(u=>u.unit_type==='1BHK');

  const totalGDV        = all.reduce((s,u)=>s+(+u.listed_price||0),0);
  const totalContracted = contracted.reduce((s,u)=>s+(+u.unit_sales.sold_price||0),0);
  const remainingGDV    = availUnits.reduce((s,u)=>s+(+u.listed_price||0),0);
  const totalSqftSold   = soldUnits.reduce((s,u)=>s+(+u.area_sqft||0),0);
  const totalSqft       = all.reduce((s,u)=>s+(+u.area_sqft||0),0);
  const soldPct         = all.length ? (soldUnits.length/all.length*100).toFixed(1) : '0.0';
  const availPct        = all.length ? (availUnits.length/all.length*100).toFixed(1) : '0.0';

  // Commission
  const totalComm = contracted.reduce((s,u)=>s+((+u.unit_sales.sold_price||0)*(+u.unit_sales.commission_pct||0)/100),0);
  const commRates = contracted.filter(u=>+u.unit_sales.commission_pct>0).map(u=>+u.unit_sales.commission_pct);
  const avgComm   = commRates.length ? commRates.reduce((s,v)=>s+v,0)/commRates.length : 0;
  const withBroker= contracted.filter(u=>u.unit_sales.broker_name).length;

  // Discount
  const totalDisc = contracted.reduce((s,u)=>s+(+u.unit_sales.discount_amount||0),0);
  const discPcts  = contracted.filter(u=>+u.unit_sales.discount_amount>0)
    .map(u=>((+u.unit_sales.discount_amount)/(+u.listed_price||1))*100);
  const avgDisc   = discPcts.length ? discPcts.reduce((s,v)=>s+v,0)/discPcts.length : 0;
  const withDisc  = contracted.filter(u=>+u.unit_sales.discount_amount>0).length;

  // Monthly expected revenue
  const monthMap = {};
  let onHandover = 0;
  for(const u of contracted) {
    for(const m of (u.unit_sales.payment_milestones||[])) {
      if(!m.due_date) { onHandover += (+m.amount||0); continue; }
      const key = m.due_date.substring(0,7);
      monthMap[key] = (monthMap[key]||0) + (+m.amount||0);
    }
  }
  const sortedMonths = Object.keys(monthMap).sort();
  let cum = 0;
  const monthRowsHTML = sortedMonths.map(k=>{
    cum += monthMap[k];
    const [yr,mo] = k.split('-');
    const label = new Date(+yr,+mo-1,1).toLocaleDateString('en-GB',{month:'short',year:'numeric'});
    return '<tr style="border-bottom:0.5px solid var(--border)">' +
      '<td style="padding:5px 10px">' + label + '</td>' +
      '<td style="padding:5px 10px;text-align:right;font-weight:500">' + fmtAED(monthMap[k]) + '</td>' +
      '<td style="padding:5px 10px;text-align:right;color:var(--text2)">' + fmtAED(cum) + '</td>' +
      '</tr>';
  }).join('');
  const handoverRow = onHandover > 0
    ? '<tr style="border-top:1px solid var(--border2);font-style:italic">' +
        '<td style="padding:5px 10px;color:var(--text2)">On Handover (event-based)</td>' +
        '<td style="padding:5px 10px;text-align:right;font-weight:500">' + fmtAED(onHandover) + '</td>' +
        '<td style="padding:5px 10px;text-align:right;color:var(--text2)">\u2014</td>' +
      '</tr>'
    : '';

  // By type
  const typeRows = ['Studio','1BHK'].map(type=>{
    const ta   = all.filter(u=>u.unit_type===type);
    const ts   = ta.filter(u=>u.unit_sales?.status==='sold');
    const tc   = ta.filter(u=>u.unit_sales);
    const avgS = ta.length ? ta.reduce((s,u)=>s+(+u.area_sqft||0),0)/ta.length : 0;
    const avgP = ts.length ? ts.reduce((s,u)=>s+(+u.unit_sales.sold_price||0),0)/ts.length : 0;
    const totR = tc.reduce((s,u)=>s+(+u.unit_sales.sold_price||0),0);
    return '<tr style="border-bottom:0.5px solid var(--border)">' +
      '<td style="padding:6px 10px;font-weight:500">' + type + '</td>' +
      '<td style="padding:6px 10px;text-align:center">' + ta.length + '</td>' +
      '<td style="padding:6px 10px;text-align:center;color:var(--green);font-weight:500">' + ts.length + '</td>' +
      '<td style="padding:6px 10px;text-align:right">' + avgS.toFixed(0) + ' sqft</td>' +
      '<td style="padding:6px 10px;text-align:right">' + (ts.length ? fmtAED(avgP) : '\u2014') + '</td>' +
      '<td style="padding:6px 10px;text-align:right;font-weight:600">' + (totR > 0 ? fmtAED(totR) : '\u2014') + '</td>' +
      '</tr>';
  }).join('');

  // Helper: stat card
  const sc = (val,label,sub,valColor) =>
    '<div style="background:var(--bg2);border:0.5px solid var(--border);border-radius:8px;padding:12px">' +
    '<div style="font-size:20px;font-weight:700;color:' + (valColor||'var(--charcoal)') + '">' + val + '</div>' +
    '<div style="font-size:10px;color:var(--text2);margin-top:2px">' + label + '</div>' +
    (sub ? '<div style="font-size:10px;color:var(--text3);margin-top:4px">' + sub + '</div>' : '') +
    '</div>';

  const rc = (val,label,sub,bg,border,vc) =>
    '<div style="background:' + bg + ';border:0.5px solid ' + border + ';border-radius:8px;padding:12px">' +
    '<div style="font-size:18px;font-weight:700;color:' + vc + '">' + val + '</div>' +
    '<div style="font-size:10px;color:' + vc + ';margin-top:2px">' + label + '</div>' +
    (sub ? '<div style="font-size:10px;color:var(--text3);margin-top:4px">' + sub + '</div>' : '') +
    '</div>';

  document.getElementById('content').innerHTML =
    // Stats strip
    '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px">' +
      sc(all.length,'Total Units', studios.length + ' Studio \u00b7 ' + bhks.length + ' 1BHK') +
      sc(soldUnits.length,'Sold', soldPct + '% of total','var(--green)') +
      sc(reservedUnits.length,'Reserved','SPA in progress','var(--amber)') +
      sc(availUnits.length,'Available', availPct + '% remaining','var(--blue)') +
      sc((totalSqftSold/1000).toFixed(1)+'K sqft','Sqft Sold','of ' + (totalSqft/1000).toFixed(1) + 'K total') +
    '</div>' +
    // Revenue strip
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">' +
      rc(fmtCompact(totalGDV),'Total GDV (Listed)','Gross Development Value','var(--green-bg)','#C0DD97','var(--green)') +
      rc(fmtCompact(totalContracted),'Total Contracted Revenue', contracted.length + ' units (sold + reserved)','var(--green-bg)','#C0DD97','var(--green)') +
      rc(fmtCompact(remainingGDV),'Remaining GDV', availUnits.length + ' available units','var(--bg2)','var(--border)','var(--charcoal)') +
    '</div>' +
    // Monthly revenue table
    '<div class="card" style="margin-bottom:16px"><div style="padding:14px 18px">' +
      '<div style="font-size:11px;font-weight:600;color:var(--charcoal);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Expected Revenue by Month (Payment Plan)</div>' +
      (sortedMonths.length || onHandover > 0
        ? '<table style="width:100%;font-size:11px;border-collapse:collapse"><tr style="background:var(--bg3)"><th style="padding:5px 10px;text-align:left">Month</th><th style="padding:5px 10px;text-align:right">Expected (AED)</th><th style="padding:5px 10px;text-align:right">Cumulative (AED)</th></tr>' + monthRowsHTML + handoverRow + '</table>'
        : '<div class="empty-state" style="padding:16px 0">No payment milestones with due dates yet.</div>') +
    '</div></div>' +
    // Commission + Discount
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">' +
      '<div class="card"><div style="padding:14px 18px">' +
        '<div style="font-size:11px;font-weight:600;color:var(--charcoal);margin-bottom:10px;text-transform:uppercase;letter-spacing:.04em">Commission Summary</div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:11px"><span style="color:var(--text2)">Total Commission Payable</span><span style="font-weight:600;color:var(--blue)">' + fmtAED(totalComm) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:11px"><span style="color:var(--text2)">Avg Commission Rate</span><span>' + avgComm.toFixed(2) + '%</span></div>' +
        '<div style="display:flex;justify-content:space-between;font-size:11px"><span style="color:var(--text2)">Units with broker</span><span>' + withBroker + ' of ' + contracted.length + ' contracted</span></div>' +
      '</div></div>' +
      '<div class="card"><div style="padding:14px 18px">' +
        '<div style="font-size:11px;font-weight:600;color:var(--charcoal);margin-bottom:10px;text-transform:uppercase;letter-spacing:.04em">Discount Summary</div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:11px"><span style="color:var(--text2)">Total Discount Given</span><span style="font-weight:600;color:var(--amber)">' + fmtAED(totalDisc) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:11px"><span style="color:var(--text2)">Avg Discount Rate</span><span>' + avgDisc.toFixed(2) + '%</span></div>' +
        '<div style="display:flex;justify-content:space-between;font-size:11px"><span style="color:var(--text2)">Units with discount</span><span>' + withDisc + ' of ' + contracted.length + ' contracted</span></div>' +
      '</div></div>' +
    '</div>' +
    // By unit type
    '<div class="card"><div style="padding:14px 18px">' +
      '<div style="font-size:11px;font-weight:600;color:var(--charcoal);margin-bottom:10px;text-transform:uppercase;letter-spacing:.06em">Revenue by Unit Type</div>' +
      '<table style="width:100%;font-size:11px;border-collapse:collapse">' +
        '<tr style="background:var(--bg3)"><th style="padding:6px 10px;text-align:left">Type</th><th style="padding:6px 10px;text-align:center">Total</th><th style="padding:6px 10px;text-align:center">Sold</th><th style="padding:6px 10px;text-align:right">Avg Sqft</th><th style="padding:6px 10px;text-align:right">Avg Sold Price</th><th style="padding:6px 10px;text-align:right">Total Revenue</th></tr>' +
        typeRows +
      '</table>' +
    '</div></div>';
}
```

- [ ] **Step 2: Verify in browser**

With 2–3 units having sales and milestones, navigate to Sales Revenue. Confirm all sections render with correct computed values.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(sales): Sales Revenue dashboard"
```

---

## Task 9: API Integration Tests

**Files:**
- Create: `tests/sales-api.test.js`

- [ ] **Step 1: Write test file**

```javascript
#!/usr/bin/env node
/**
 * Sales Module — API Integration Tests
 * Run: node tests/sales-api.test.js
 */
const https = require('https');
const { SUPABASE_URL, ANON_KEY, TEST_ACCOUNTS, TEST_PASSWORD } = require('./config');

const results = [];
function pass(n)     { results.push({name:n,status:'PASS'}); console.log('  \u2713  PASS  ' + n); }
function fail(n,msg) { results.push({name:n,status:'FAIL',info:msg}); console.error('  \u2717  FAIL  ' + n + '  \u2192  ' + msg); }
function section(t)  { console.log('\n' + '='.repeat(70) + '\n  ' + t + '\n' + '-'.repeat(70)); }

function req(method, path, body, token) {
  return new Promise((resolve,reject) => {
    const url  = new URL(path, SUPABASE_URL);
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: url.hostname, path: url.pathname + url.search, method,
      headers: {
        'apikey': ANON_KEY, 'Authorization': 'Bearer ' + (token||ANON_KEY),
        'Content-Type': 'application/json', 'Prefer': 'return=representation',
        ...(data ? {'Content-Length': Buffer.byteLength(data)} : {})
      }
    };
    const r = https.request(opts, res => {
      let d = '';
      res.on('data',c=>d+=c);
      res.on('end',()=>{ try{resolve({status:res.statusCode,data:JSON.parse(d)});}catch(e){resolve({status:res.statusCode,data:d});} });
    });
    r.on('error',reject);
    if(data) r.write(data);
    r.end();
  });
}

async function signIn(email, password) {
  const r = await req('POST','/auth/v1/token?grant_type=password',{email,password},ANON_KEY);
  return r.data?.access_token||null;
}

const testUnitNo = 'TEST-' + Date.now();
let devToken, consultantToken, testUnitId, testSaleId;

async function run() {
  section('Sign in');
  devToken        = await signIn(TEST_ACCOUNTS.developer, TEST_PASSWORD);
  consultantToken = await signIn(TEST_ACCOUNTS.consultant, TEST_PASSWORD);
  devToken        ? pass('Developer sign in')   : fail('Developer sign in','No token');
  consultantToken ? pass('Consultant sign in')  : fail('Consultant sign in','No token');
  if(!devToken) { console.error('Cannot continue'); process.exit(1); }

  section('Developer CRUD — units');
  {
    const r = await req('POST','/rest/v1/units',{unit_no:testUnitNo,floor:99,unit_type:'Studio',area_sqft:490,listed_price:625000},devToken);
    if(r.status===201 && r.data?.[0]?.id) { testUnitId=r.data[0].id; pass('Insert unit'); }
    else fail('Insert unit','status='+r.status);
  }
  {
    const r = await req('GET','/rest/v1/units?unit_no=eq.'+testUnitNo,null,devToken);
    r.data?.[0]?.unit_no===testUnitNo ? pass('Select unit') : fail('Select unit',JSON.stringify(r.data));
  }
  {
    const r = await req('PATCH','/rest/v1/units?id=eq.'+testUnitId,{listed_price:650000},devToken);
    r.status===200 ? pass('Update unit') : fail('Update unit','status='+r.status);
  }

  section('RLS — consultant blocked');
  {
    const r = await req('GET','/rest/v1/units?unit_no=eq.'+testUnitNo,null,consultantToken);
    (r.status===200 && Array.isArray(r.data) && r.data.length===0)
      ? pass('Consultant cannot read units')
      : fail('Consultant cannot read units','status='+r.status+' data='+JSON.stringify(r.data));
  }
  {
    const r = await req('POST','/rest/v1/units',{unit_no:'CONS-TEST',floor:1,unit_type:'Studio',area_sqft:490,listed_price:600000},consultantToken);
    r.status!==201 ? pass('Consultant cannot insert unit') : fail('Consultant cannot insert unit','Insert succeeded');
  }

  section('Developer CRUD — unit_sales');
  if(testUnitId) {
    const r = await req('POST','/rest/v1/unit_sales',{unit_id:testUnitId,status:'reserved',buyer_name:'Test Buyer',sale_date:'2026-05-01',sold_price:615000,discount_amount:10000,commission_pct:2,spa_status:'signed_buyer'},devToken);
    if(r.status===201 && r.data?.[0]?.id) { testSaleId=r.data[0].id; pass('Insert unit_sales'); }
    else fail('Insert unit_sales','status='+r.status+' '+JSON.stringify(r.data));
  }

  section('Developer CRUD — payment_milestones');
  if(testSaleId) {
    const r = await req('POST','/rest/v1/payment_milestones',{unit_sale_id:testSaleId,milestone_name:'Booking Deposit',amount:61500,pct_of_sale:10,due_date:'2026-05-01',sort_order:0},devToken);
    r.status===201 ? pass('Insert milestone') : fail('Insert milestone','status='+r.status);
  }

  section('Cascade delete');
  if(testSaleId) {
    await req('DELETE','/rest/v1/unit_sales?id=eq.'+testSaleId,null,devToken);
    const r = await req('GET','/rest/v1/payment_milestones?unit_sale_id=eq.'+testSaleId,null,devToken);
    (Array.isArray(r.data) && r.data.length===0) ? pass('Milestones cascade-deleted') : fail('Cascade delete',r.data?.length+' milestones remain');
  }

  section('Cleanup');
  if(testUnitId) {
    const r = await req('DELETE','/rest/v1/units?id=eq.'+testUnitId,null,devToken);
    r.status===204 ? pass('Test unit deleted') : fail('Delete test unit','status='+r.status);
  }

  const passed = results.filter(r=>r.status==='PASS').length;
  const failed = results.filter(r=>r.status==='FAIL').length;
  console.log('\n' + '='.repeat(70));
  console.log('  ' + passed + ' PASS  ' + failed + ' FAIL  (' + results.length + ' total)');
  console.log('='.repeat(70));
  process.exit(failed>0?1:0);
}
run().catch(e=>{ console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run tests**

```bash
node tests/sales-api.test.js
```

Expected: all 11 tests PASS, 0 FAIL.

- [ ] **Step 3: Commit**

```bash
git add tests/sales-api.test.js
git commit -m "test(sales): API integration tests — CRUD and RLS for all 3 tables"
```

---

## Task 10: Push and Verify Deployment

- [ ] **Step 1: Push to main**

```bash
git push origin main
```

- [ ] **Step 2: Smoke check on Vercel deployment**

After ~60s Vercel rebuild, visit `https://golf-grove-dms.vercel.app` and verify:

| Check | Expected |
|-------|---------|
| Log in as developer | Sales section (3 items) visible in sidebar |
| Log in as consultant | Sales section absent |
| Unit Setup: + New | Add Unit modal opens |
| Unit Setup: add unit | Row appears in table |
| Unit Setup: import CSV (3 rows) | All 3 units appear |
| Unit Register: load | All units shown |
| Unit Register: filters | Live-filter without page reload |
| Unit Register: click row | Modal opens correctly |
| Add Sale + milestones | Unit shows Reserved + buyer |
| Edit Sale | Changes persist |
| Mark Available | Unit returns to Available |
| Sales Revenue: all stats | Correct aggregated values |
| Sales Revenue: monthly table | Milestones grouped by month |
