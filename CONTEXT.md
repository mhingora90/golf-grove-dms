# Golf Grove DMS — Context Brief

Paste this file at the start of any new Claude session to restore full context immediately.

---

## Project Overview

**Single-file web app** — entire app lives in one `index.html`
**Stack:** Vanilla JS, Supabase (auth + DB + storage), Vercel deploy
**Design:** Plus Jakarta Sans font, warm parchment palette
**Standards:** ISO 19650, BS 1192, FIDIC, ISO 9001

| Item | Value |
|---|---|
| Repo | github.com/mhingora90/golf-grove-dms |
| Live | https://golf-grove-dms.vercel.app |
| Working file | `/home/claude/index_v3.html` (4,116 lines, ~275KB) |
| Project | Golf Grove – Residential Building (B+G+P+7+Roof), Production City, Dubai |
| Developer | Regent Star Property Developments |
| Consultant | POE Engineering Consultants |
| Contractor | Modern Building Contracting L.L.C |

---

## Design System

```css
--bg: #F7F5F0          /* page background — warm parchment */
--bg2: #FFFEFB         /* card/sidebar background — cream */
--bg3: #F0EBE2         /* input/table header background */
--bg4: #EDE8E0         /* active nav, hover */
--border: #E8E4DC      /* default border — 0.5px */
--border2: #DDD8CE     /* emphasis border */
--text: #2C2A24        /* primary text */
--text2: #7A6E5F       /* secondary text */
--text3: #B4A88C       /* muted/label text */
--sand: #8B7355        /* primary accent */
--charcoal: #2C2A24    /* primary button background */
--blue: #185FA5        /* info */
--green: #3B6D11       /* success */
--amber: #C4863A       /* warning */
--red: #A32D2D         /* danger */
```

**Font:** Plus Jakarta Sans (Google Fonts), weights 400/500/600
**Borders:** always 0.5px, never 1px (except PDF viewer which stays dark)
**Radius:** `--radius: 8px`, `--radius-lg: 12px`
**Toasts:** top-right, card style, cream background
**Buttons:** `.btn-primary` = charcoal background, `.btn-success/.btn-danger` = outline style

---

## Supabase

**URL:** `https://kdxvhrwnnehicgdryowu.supabase.co`

### Tables

| Table | Key Columns |
|---|---|
| `drawings` | id, drawing_no, title, discipline, revision, status, cde_state, poi_code, arfi, originator, zone, level, doc_type, file_path, superseded_revisions, related_drawings[], uploaded_by |
| `drawing_revisions` | id, drawing_id, revision, status, uploaded_by_name, uploaded_by_id, upload_date, approval_date, approved_by_name, file_path, review_comments |
| `submittals` | id, ref_no, title, from_party, to_party, discipline, revision, parent_id, submit_date, due_date, status, outcome, arfi, changes_description |
| `submittal_register` | id, item_no, spec_ref, title, discipline, required_by, notes |
| `inspections` | id, ref_no, revision, location, elements, department (jsonb), inspection_time, inspection_date, request_date, status, due_date, subcontractor_id, rep, site_engineer, checklist (jsonb), checklist_notes, parent_ir_id |
| `ncrs` | id, ref_no, title, location, raised_by, raised_date, severity, root_cause, linked_drawing, status, cause, corrective_action, cap_submitted_date, cap_submitted_by, cap_responsible, cap_target_date, cap_verified_date, cap_verified_by, cap_verify_comments, closed_date, closed_by |
| `rfis` | id, ref_no, subject, from_party, to_party, discipline, status, due_date, response, response_date |
| `transmittals` | id, ref_no, from_party, to_party, transmit_date, purpose, method, documents (jsonb), notes, response_required, acknowledged_by, acknowledged_at |
| `correspondence` | id, ref_no, type, subject, from_party, to_party, correspondence_date, due_date, body, status, logged_by, closed_date |
| `punch_list` | id, description, location, element, discipline, severity, assigned_to, raised_by, status, contractor_response, closed_date |
| `method_statements` | id, ref_no, title, activity, discipline, location, revision, submitted_by, status, outcome, reviewed_by |
| `subcontractors` | id, name, rep, discipline, trade |
| `profiles` | id, full_name, role, company |
| `attachments` | id, record_type, record_id, file_name, file_path, file_type, file_size, uploaded_by_name |
| `comments` | id, record_type, record_id, message, author_name, author_role, created_at |
| `document_audit_log` | id, document_id, document_type, action, performed_by_name, performed_by_id, created_at |

### Storage buckets
- `drawings` — drawing PDF files, path: `{drawing_id}/{revision}_{timestamp}.pdf`
- `attachments` — all other attachments, path: `{record_type}/{record_id}/{filename}`

---

## Roles & Permissions

```javascript
developer:    { approve, upload, raise, submit, manageUsers, manageSubs, manageRegister }
consultant:   { approve, upload, raise, submit, manageRegister }
contractor:   { upload, submit, manageSubs, submitMS }
subcontractor:{ submit, submitMS }
```

Checked via `can(action)` — returns boolean based on `currentProfile.role`.

---

## Navigation Pages

| Page ID | Title | Module |
|---|---|---|
| `dash` | Dashboard | Main |
| `draw` | Drawing Register | Document Control |
| `sub` | Submittals (DSUB) | Document Control |
| `sreg` | Submittal Register | Document Control |
| `ir` | Inspection Requests | Site |
| `ncr` | Non-Conformance Reports | Site |
| `rfi` | RFI Register | Site |
| `trans` | Transmittal Log | Site |
| `corr` | Correspondence Register | Site |
| `punch` | Punch List / Defects | Site |
| `ms` | Method Statements | Site |
| `subs` | Subcontractors | Admin |
| `users` | User Management | Admin (developer only) |

---

## Key Functions Reference

### Navigation & Rendering
```javascript
nav(page, el)              // Navigate to page, highlight nav item
render()                   // Re-render current page
renderDash()               // Dashboard with compliance widget + charts
renderDrawings()           // Drawing register with CDE/POI filters
renderSubmittals()         // DSUB list with module bar
renderSubmittalRegister()  // Master submittal register
renderInspections()        // IR list with SLA tracking
renderNCRs()               // NCR list with CAP workflow + aging
renderCorrespondence()     // Correspondence register
renderPunchList()          // Punch list / defects
```

### Modals & Forms
```javascript
openNew()                  // Context-sensitive new item — routes by currentPage
openModal(title, body, footer, wide)
closeModal()
toast(msg, type)           // type: 'success' | 'error' | 'info'
```

### Drawing-specific
```javascript
viewDraw(id)               // Drawing detail with CDE stepper, revision history, PDF
uploadRev(id)              // Upload new revision modal
approveDrawing(id)         // Mark drawing as Approved + log audit
advanceCDE(id, newState)   // Advance CDE state: WIP→Shared→Published→Archived
voidDrawing(id, drawingNo) // Void a drawing (irreversible)
linkDrawings(id, drawingNo)// Cross-reference related drawings
exportDrawingRegister()    // CSV export of full drawing register
validateDrawingNumber(num) // BS 1192 format check
enforceRevisionScheme(status, revision) // Alpha vs numeric check
updateDocNum()             // Live document number preview on upload form
checkRevScheme()           // Warns if revision scheme doesn't match status
```

### NCR CAP Workflow
```javascript
submitCAP(id)    // Contractor: submit corrective action plan
doSubmitCAP(id)  // Save CAP to DB, status → 'CAP Submitted'
verifyCAP(id)    // Consultant: review CAP
doVerifyCAP(id)  // Approve CAP, status → 'CAP Verified'
doRejectCAP(id)  // Return CAP, status → 'Open'
doCloseNCR(id)   // Close NCR (only after CAP Verified)
```

### IR Checklist Workflow
```javascript
openChecklistModal(irId, template)  // Open checklist for template
setCK(irId, idx, val, btn)          // Set pass/fail/na per item
saveChecklist(irId, items)          // Save checklist jsonb to DB
```
**Templates:** Concrete Pour, Rebar, Waterproofing, Formwork, MEP

### Transmittal
```javascript
acknowledgeTransmittal(id)  // Recipient acknowledges receipt
openNewTransmittal()        // Create transmittal with drawing selector
```

### Correspondence
```javascript
openNewCorrespondence()     // Log new correspondence
viewCorrespondence(id)      // View with body, attachments, comments
closeCorrespondence(id)     // Mark closed
```
**Types:** Site Instruction, Letter, Variation Order, Extension of Time, RFI Response, General Correspondence

### Punch List
```javascript
openNewPunchItem()          // Add punch item with photos
viewPunchItem(id)           // View + update + contractor response
updatePunchItem(id)         // Save status/response update
closePunchItem(id)          // Quick close from list
```

### Submittals
```javascript
resubmitSub(parentId)       // Open resubmit modal with revision chain
doResubmit(parentId, nextRev) // Create new revision linked to parent
reviewSub(id)               // Consultant review with outcome codes (1-4)
```

### Badge Helpers
```javascript
sbadge(status)       // Standard status pill — maps to badge-success/warning/danger/info/neutral
cdeBadge(state)      // CDE state pill — WIP/Shared/Published/Archived/Superseded
poiBadge(code)       // Purpose of Issue — S0–S7 with colour coding
corrTypeBadge(type)  // Correspondence type badge
cdeStepperHTML(state, drawingId) // CDE lifecycle stepper with role-gated advance buttons
```

### Attachments & Files
```javascript
loadAttachments(recordType, recordId)
attachmentSectionHTML(recordType, recordId, attachments)
uploadStagedFiles(stagingId, recordType, recordId)
stageFiles(fileList, stagingId)
downloadAttachment(path, name)
```

### Comments
```javascript
loadComments(recordType, recordId)
commentThreadHTML(recordType, recordId, comments)
postComment(recordType, recordId)
```

### Submittal Register
```javascript
addRegisterItem()          // Manual add form
doAddRegisterItem()        // Save to DB
deleteRegisterItem(id)     // Remove with confirm
importRegisterCSV()        // CSV import modal
doImportRegister()         // Bulk insert from parsed CSV
```

---

## CDE States (ISO 19650)

```
WIP → Shared → Published → Archived
                         → Superseded (when new revision uploaded)
```

Transitions are role-gated:
- WIP→Shared: contractor, developer
- Shared→Published: consultant, developer
- Published→Archived: developer

---

## Purpose of Issue Codes (BS 1192 / ISO 19650)

| Code | Meaning |
|---|---|
| S0 | Work in Progress |
| S1 | Suitable for Coordination |
| S2 | Suitable for Information |
| S3 | Suitable for Review & Comment |
| S4 | Suitable for Construction (IFC) |
| S5 | As Constructed |
| S6 | Post-Construction Evaluation |
| S7 | Archived |

---

## NCR Status Flow

```
Open → CAP Submitted → CAP Verified → Closed
     ← (rejected back to Open by consultant)
```

---

## Dashboard Widgets

1. **Stat cards** — Drawings / Submittals / Inspections / Open NCRs / Open RFIs
2. **ISO Compliance Score** — % Published+Archived, % complete metadata
3. **Drawing approval donut** — IFC / Approved / Under Review / Pending (130px SVG)
4. **Discipline completion bars** — Architecture / Structure / MEP / Civil (async)
5. **Open items panel** — NCR count / RFI count / Submittals pending bar

---

## Building / Editing Pattern

When making changes:
1. Read the relevant function(s) first with `sed -n 'START,ENDp'`
2. Write all changes as a Python script that uses `str.replace()` on exact patterns
3. Run `node --check /tmp/check.js` after extracting inline JS with regex
4. Fix any literal newline issues in strings (use `\\n` not actual newlines)
5. Copy to `/mnt/user-data/outputs/index.html` and present to user

**Common bugs to watch for:**
- Literal newlines inside single-quoted JS strings → use `\\n`
- Nested backtick template literals in HTML strings → use single-quoted strings inside
- `var(--color-background-secondary)` etc. are Claude.ai CSS vars — use `var(--bg3)` etc.
- All borders must be `0.5px` not `1px`

---

## Testing Pattern (browser)

```javascript
// Login
doLogin()

// Switch role via Supabase REST
fetch(window._su+'/rest/v1/profiles?id=eq.'+window._uid, {
  method:'PATCH',
  headers:{'Content-Type':'application/json','apikey':window._sk,'Authorization':'Bearer '+window._token,'Prefer':'return=minimal'},
  body:JSON.stringify({role:'contractor'})
})

// Test page loads
nav('ir', null); // wait 500ms then check content
document.getElementById('content')?.innerHTML.length > 100 // true = loaded

// Test + New
openNew(); document.getElementById('modal-title')?.textContent
```

**Role switching note:** Contractor cannot PATCH own role (RLS). Switch back to developer via User Management modal or by temporarily granting elevated access.

---

## What Was Built (Session History)

| Build | Features |
|---|---|
| v1 | Auth, all base modules, Supabase integration |
| v2 | New theme (Plus Jakarta Sans, parchment palette), dashboard charts, compliance widget |
| v3 | CDE workflow, ISO metadata fields on drawings, audit log, submittal register page |
| v4 | IR checklists, NCR CAP workflow, re-inspection, resubmit chain, module summary bars |
| v5 | POI codes, drawing number validation, revision scheme enforcement, void drawings, drawing register export, cross-referencing, revision comments, correspondence register, punch list, transmittal acknowledgement, AR/FI classification, IFC vs Approved on dashboard |

---

## Suggested Next Features

- Email notifications via Supabase Edge Functions
- Bulk export PDF/Excel per module (IR register, NCR log, etc.)
- Download restriction + watermark on superseded drawings (server-side)
- Document distribution matrix (who gets notified on drawing publish)
- Tender / contract document register (separate from construction drawings)
- Specification linking (drawing ↔ spec section)
- Mobile-responsive layout improvements
- Parse project specification PDF → auto-populate Submittal Register
