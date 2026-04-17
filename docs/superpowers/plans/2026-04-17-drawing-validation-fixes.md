# Drawing Validation Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce four drawing-upload validation rules: duplicate revision blocking, hard-block on revision scheme mismatch, full BS 1192 drawing number format, and required metadata fields.

**Architecture:** All changes are in `index.html` (single-file app). No schema changes. Fixes follow the existing pattern: inline error divs for field-level feedback, `toast()` for submit-level errors, `0.5px` borders, design system CSS vars. Each fix is self-contained in 1–3 functions.

**Tech Stack:** Vanilla JS, Supabase JS client, single-file HTML app. No build step. Open in browser to verify.

---

## Files

- Modify: `index.html`
  - `validateDrawingNumber()` — lines 671–679
  - `updateDocNum()` — lines 1442–1451
  - `doNewDraw()` — lines 2587–2639
  - `doUploadRev()` — lines 2322–2354
  - Upload modal HTML (inside `openNew()`) — lines 2362–2432
  - Revision upload modal HTML (inside `viewDraw()` or wherever `nr-${id}` input lives)

---

### Task 1: Duplicate Revision Detection in `doUploadRev`

**Files:**
- Modify: `index.html` — `doUploadRev()` (~line 2322) and the revision modal HTML that contains the `nr-${id}` input

- [ ] **Step 1: Find the revision modal HTML**

Search for `nr-` in index.html to locate where the revision input (`id="nr-${id}"`) is rendered. It is inside the modal body built in `viewDraw()` or `openUploadRevModal()`.

Run:
```bash
grep -n "nr-\${id}\|id=\"nr-\|nr-err" index.html
```

- [ ] **Step 2: Add inline error div after the revision input**

In the modal HTML, directly after the `<input ... id="nr-${id}" ...>` element, add:

```html
<div id="nr-err-${id}" style="display:none;color:var(--red);font-size:11px;margin-top:4px"></div>
```

The full snippet in context:
```html
<input type="text" class="form-control" id="nr-${id}" placeholder="e.g. Rev B" />
<div id="nr-err-${id}" style="display:none;color:var(--red);font-size:11px;margin-top:4px"></div>
```

- [ ] **Step 3: Add duplicate check at the top of `doUploadRev`**

Replace the existing early-return block:
```js
// BEFORE (line ~2326):
if(!newRev){toast('Please enter a revision number','error');return;}
const {data:d} = await sb.from('drawings').select('revision,superseded_revisions,file_path').eq('id',id).single();
let supers = JSON.parse(d.superseded_revisions||'[]');
supers.push(d.revision);
```

With:
```js
if(!newRev){toast('Please enter a revision number','error');return;}
const {data:d} = await sb.from('drawings').select('revision,superseded_revisions,file_path').eq('id',id).single();
let supers = JSON.parse(d.superseded_revisions||'[]');

// Duplicate revision check
const errEl = document.getElementById('nr-err-'+id);
const isDupe = newRev.trim() === d.revision?.trim() || supers.includes(newRev.trim());
if(isDupe) {
  if(errEl){ errEl.textContent = `Revision "${newRev}" already exists. Use a new revision identifier.`; errEl.style.display=''; }
  return;
}
if(errEl) errEl.style.display='none';

supers.push(d.revision);
```

- [ ] **Step 4: Verify in browser**

1. Open a drawing's revision upload modal.
2. Enter the current revision (e.g. `Rev A`) and click Upload — error div should appear: *Revision "Rev A" already exists.*
3. Enter a superseded revision — same error.
4. Enter a new revision (e.g. `Rev B`) — upload proceeds normally, revision history is updated.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "fix: block duplicate revision uploads with inline error message"
```

---

### Task 2: Hard-Block Revision Scheme Mismatch on Submit

**Files:**
- Modify: `index.html` — `doNewDraw()` (~line 2596)

- [ ] **Step 1: Change the revision-scheme check from advisory to blocking**

Find this block in `doNewDraw` (~line 2596):
```js
// BEFORE:
const revWarn = enforceRevisionScheme(document.getElementById('nd-status')?.value, document.getElementById('nd-rev')?.value);
if(revWarn.warn) toast(revWarn.msg,'info');
```

Replace with:
```js
// AFTER:
const revWarn = enforceRevisionScheme(document.getElementById('nd-status')?.value, document.getElementById('nd-rev')?.value);
if(revWarn.warn) {
  const warnEl = document.getElementById('nd-rev-warn');
  if(warnEl){ warnEl.textContent = revWarn.msg; warnEl.style.display=''; }
  return;
}
```

The `#nd-rev-warn` div already exists in the form (line ~2416) and is already updated live by `checkRevScheme()` on input. Correcting the revision field will clear the warning live, allowing resubmit.

- [ ] **Step 2: Verify in browser**

1. Set Review Status to `Issued for Construction`, set Revision to `Rev A` (alphabetical).
2. Click Upload Drawing — the amber warning div should be visible and upload must **not** proceed.
3. Change Revision to `1` (numerical) — warning clears live.
4. Click Upload Drawing again — proceeds normally.
5. Reverse test: Status = `Under Review`, Revision = `1` — should block with the pre-construction message.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "fix: block drawing upload when revision scheme mismatches CDE status"
```

---

### Task 3: Full BS 1192 Drawing Number Validation

**Files:**
- Modify: `index.html` — `validateDrawingNumber()` (line 671), `updateDocNum()` (line 1442), upload modal HTML in `openNew()` (line ~2365)

- [ ] **Step 1: Add Role and Number input fields to the upload modal**

In `openNew()`, the ISO document number grid currently has 5 columns: Originator, Zone, Level, Type, Revision. BS 1192 requires 7 segments. Add Role and Number columns.

Find the grid div (~line 2365):
```html
<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:8px;margin-bottom:8px">
  <div class="form-group">...(Originator)...</div>
  <div class="form-group">...(Zone)...</div>
  <div class="form-group">...(Level)...</div>
  <div class="form-group">...(Type select)...</div>
  <div class="form-group">...(Revision)...</div>
</div>
```

Replace with (7 columns — Role and Number inserted before Revision):
```html
<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr 1fr 1fr;gap:8px;margin-bottom:8px">
  <div class="form-group"><label class="form-label-dark" title="Required per ISO 19650-2 §5.3.2">Originator <span style="color:var(--red)">*</span></label><input type="text" class="form-control" id="nd-orig" placeholder="MBC" oninput="updateDocNum()" /></div>
  <div class="form-group"><label class="form-label-dark" title="Volume or Zone reference">Zone <span style="color:var(--red)">*</span></label><input type="text" class="form-control" id="nd-zone" placeholder="B1" oninput="updateDocNum()" /></div>
  <div class="form-group"><label class="form-label-dark">Level <span style="color:var(--red)">*</span></label><input type="text" class="form-control" id="nd-level" placeholder="L04" oninput="updateDocNum()" /></div>
  <div class="form-group"><label class="form-label-dark">Type</label>
    <select class="form-control" id="nd-type" onchange="updateDocNum()">
      <option value="DR">DR – Drawing</option>
      <option value="SP">SP – Specification</option>
      <option value="CA">CA – Calculation</option>
      <option value="MS">MS – Method Statement</option>
    </select>
  </div>
  <div class="form-group"><label class="form-label-dark" title="Role code e.g. A=Architect, S=Structural">Role <span style="color:var(--red)">*</span></label><input type="text" class="form-control" id="nd-role" placeholder="A" oninput="updateDocNum()" /></div>
  <div class="form-group"><label class="form-label-dark" title="4-digit sequence number">Number <span style="color:var(--red)">*</span></label><input type="text" class="form-control" id="nd-num" placeholder="0001" maxlength="4" oninput="updateDocNum()" /></div>
  <div class="form-group"><label class="form-label-dark">Revision <span style="color:var(--red)">*</span></label><input type="text" class="form-control" id="nd-rev" value="Rev A" oninput="updateDocNum();checkRevScheme()" /></div>
</div>
```

Note: `nd-rev`'s `oninput` gains `checkRevScheme()` so the rev-warn updates live (was already called on status change, now also on rev change).

- [ ] **Step 2: Update `updateDocNum()` to build 7-segment number**

Replace the existing function (line 1442):
```js
// BEFORE:
function updateDocNum() {
  const orig = (document.getElementById('nd-orig')?.value||'——').toUpperCase();
  const zone = (document.getElementById('nd-zone')?.value||'——').toUpperCase();
  const level = (document.getElementById('nd-level')?.value||'——').toUpperCase();
  const type = document.getElementById('nd-type')?.value||'DR';
  const rev = (document.getElementById('nd-rev')?.value||'RevA').replace(/\s/g,'');
  const num = `GG-${orig}-${zone}-${level}-${type}-${rev}`;
  const el = document.getElementById('nd-preview');
  if(el) el.textContent = num;
}
```

With:
```js
// AFTER:
function updateDocNum() {
  const orig  = (document.getElementById('nd-orig')?.value||'——').toUpperCase();
  const zone  = (document.getElementById('nd-zone')?.value||'——').toUpperCase();
  const level = (document.getElementById('nd-level')?.value||'——').toUpperCase();
  const type  = document.getElementById('nd-type')?.value||'DR';
  const role  = (document.getElementById('nd-role')?.value||'——').toUpperCase();
  const num   = (document.getElementById('nd-num')?.value||'——').padStart(4,'0');
  const rev   = (document.getElementById('nd-rev')?.value||'RevA').replace(/\s/g,'');
  const docNum = `GG-${orig}-${zone}-${level}-${type}-${role}-${num}-${rev}`;
  const el = document.getElementById('nd-preview');
  if(el) el.textContent = docNum;
}
```

- [ ] **Step 3: Rewrite `validateDrawingNumber()`**

Replace lines 671–679:
```js
// BEFORE:
function validateDrawingNumber(num) {
  // BS 1192: {Project}-{Originator}-{Zone}-{Level}-{Type}-{Revision}
  // Allow flexible: at least GG-XXX-...-XXX pattern
  if(!num) return {valid:false, msg:'Drawing number is required'};
  const parts = num.split('-');
  if(parts.length < 4) return {valid:false, msg:'Number must follow format: GG-{Originator}-{Zone}-{Level}-{Type}-{Rev} (min 4 segments separated by -)'};
  if(parts[0].toUpperCase() !== 'GG') return {valid:true, msg:'Warning: Project code should be GG'};
  return {valid:true, msg:''};
}
```

With:
```js
// AFTER:
function validateDrawingNumber(num) {
  if(!num) return {valid:false, msg:'Drawing number is required'};
  const parts = num.split('-');
  // Format: GG-[ORIGINATOR]-[VOLUME]-[LEVEL]-[TYPE]-[ROLE]-[NUMBER]-[REV]
  // NUMBER segment is 4 digits; REV is the trailing revision (Rev A, 1, etc.)
  // Minimum 8 parts when revision contains no hyphens; accept ≥8
  if(parts[0]?.toUpperCase() !== 'GG')
    return {valid:false, msg:'Segment 1 (Project) must be "GG"'};
  if(parts.length < 8)
    return {valid:false, msg:`Expected format: GG-Originator-Volume-Level-Type-Role-Number-Rev (8 segments), got ${parts.length}`};
  if(!parts[1])
    return {valid:false, msg:'Segment 2 (Originator) is empty'};
  if(!parts[2])
    return {valid:false, msg:'Segment 3 (Volume/Zone) is empty'};
  if(!parts[3])
    return {valid:false, msg:'Segment 4 (Level) is empty'};
  if(!parts[4])
    return {valid:false, msg:'Segment 5 (Type) is empty'};
  if(!parts[5])
    return {valid:false, msg:'Segment 6 (Role) is empty'};
  if(!/^\d{4}$/.test(parts[6]))
    return {valid:false, msg:'Segment 7 (Number) must be exactly 4 digits (e.g. 0001)'};
  return {valid:true, msg:''};
}
```

Note on segment count: The generated number is now 8 parts (`GG-ORIG-ZONE-LEVEL-TYPE-ROLE-NNNN-REV`). Manually typed numbers that include a hyphenated revision (e.g. `Rev-A`) would be 9 parts — the validator accepts `≥ 8` and only strictly validates segments 1–7, so these still pass.

- [ ] **Step 4: Update `doNewDraw()` to show validation error inline**

Find the validation section in `doNewDraw` (~line 2592):
```js
// BEFORE:
const numCheck = validateDrawingNumber(id);
if(!numCheck.valid){toast(numCheck.msg,'error');return;}
if(numCheck.msg){toast(numCheck.msg,'info');}
```

Replace with:
```js
// AFTER:
const numCheck = validateDrawingNumber(id);
if(!numCheck.valid){
  const numWarnEl = document.getElementById('nd-num-warn');
  if(numWarnEl){ numWarnEl.textContent = numCheck.msg; numWarnEl.style.display=''; }
  return;
}
const numWarnEl = document.getElementById('nd-num-warn');
if(numWarnEl) numWarnEl.style.display='none';
```

The `#nd-num-warn` amber div already exists in the form (line ~2417). No new elements needed.

- [ ] **Step 5: Verify in browser**

1. Open Upload New Drawing modal.
2. Fill only Originator, leave Number blank — preview shows `——` for missing segments.
3. Click "Use this" then Upload Drawing — error: *Segment 7 (Number) must be exactly 4 digits*.
4. Fill all 7 fields correctly (e.g. Orig=MBC, Zone=B1, Level=L04, Type=DR, Role=A, Number=0001, Rev=Rev A) — preview shows `GG-MBC-B1-L04-DR-A-0001-RevA`. Upload proceeds.
5. Manually type a 4-segment number like `GG-MBC-B1-L04` in Drawing No. field — error: *Expected 8 segments, got 4*.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: enforce full BS 1192 7-segment drawing number format with per-segment error messages"
```

---

### Task 4: Required Metadata Enforcement (Originator, Zone, Level)

**Files:**
- Modify: `index.html` — `doNewDraw()` (~line 2590), upload modal label HTML in `openNew()` (~line 2367)

Note: Zone and Level asterisks are added as part of Task 3 Step 1 (the grid replacement). If executing Task 4 standalone without Task 3, add asterisks to Zone and Level labels manually.

- [ ] **Step 1: Add metadata guard in `doNewDraw()`**

Find the existing early-return block at the top of `doNewDraw` (~line 2590):
```js
// BEFORE:
if(!id||!title){toast('Drawing number and title are required','error');return;}
```

Replace with:
```js
// AFTER:
if(!id||!title){toast('Drawing number and title are required','error');return;}
const orig  = document.getElementById('nd-orig')?.value?.trim();
const zone  = document.getElementById('nd-zone')?.value?.trim();
const level = document.getElementById('nd-level')?.value?.trim();
if(!orig||!zone||!level){
  toast('Originator, Zone, and Level are required','error');
  return;
}
```

`doc_type` is a `<select>` with a default of `DR` — it cannot be blank, so no guard needed.

- [ ] **Step 2: Verify in browser**

1. Open Upload New Drawing, leave Originator blank, fill everything else correctly.
2. Click Upload Drawing — toast error: *Originator, Zone, and Level are required*. No upload occurs.
3. Leave Zone blank instead — same block.
4. Leave Level blank — same block.
5. Fill all three — upload proceeds normally. Check Supabase `drawings` table: `originator`, `zone`, `level` columns are populated.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "fix: enforce required originator, zone, and level fields on drawing upload"
```

---

## Execution Order

Tasks are independent but share the same file. Execute in order 1 → 4 to avoid merge conflicts within the file. Each task ends with a commit so progress is recoverable.

| Task | Function(s) touched | Risk |
|------|--------------------|----|
| 1 | `doUploadRev`, revision modal HTML | Low — additive only |
| 2 | `doNewDraw` (2 lines) | Low — replaces toast with return |
| 3 | `validateDrawingNumber`, `updateDocNum`, modal grid HTML, `doNewDraw` | Medium — modal grid restructured |
| 4 | `doNewDraw` (4 lines) | Low — additive guard |
