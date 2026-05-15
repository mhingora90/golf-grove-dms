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
| Working file | `index.html` (~5,800 lines, ~320KB) |
| Project | Golf Grove – Residential Building (B+G+P+7+Roof), Production City, Dubai |
| Developer | Regent Star Property Developments |
| Consultant | POE Engineering Consultants |
| Contractor | Modern Building Contracting L.L.C |

---

## Dev Server & Testing

**Dev server:** `npx http-server . -p 3000 --cors -s`
**MCP Playwright browser** — use browser tools for UI testing, NOT screenshots
**DO NOT use `taskkill /F /T` on dev server PID** — it kills the MCP browser too
To stop dev server: `taskkill /F /T /IM node.exe` is also risky — use browser close first

**Test files:**
- `tests/boq-ipc-permissions.test.js` — Part A: Pure Node.js permission matrix (48 tests, all pass)
- `tests/boq-ipc-ui.test.js` — Part B: Playwright UI tests (needs fresh browser)
- `tests/boq-ipc-integration.test.js` — Part C: Supabase API tests (needs auth)

**Login:** mohammed@regent-developments.com / Mman1990 (developer role)
**Role switching:** Blocked by RLS `restrict_profile_role_changes`. Must reset via Supabase Dashboard SQL:
```sql
UPDATE profiles SET role = 'developer' WHERE email = 'mohammed@regent-developments.com';
```

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
**Toasts:** top-right, icon prefix (✓ ✕  ⚠), dismiss (×), variable durations:
  - `success` = 3s, `error` = 6s, `info` = persistent until dismissed, `warning` = 4s
**Buttons:** `.btn-primary` = charcoal background, `.btn-success` = outline green, `.btn-danger` = outline red
**Animations:** Motion One via CDN (`https://cdn.jsdelivr.net/npm/motion/dist/motion.js`), global `window.Motion`. Used for CRM kanban stagger + all modal entrances. Use `window.Motion.animate()` / `window.Motion.stagger()` for new animations.

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
| `boq_bills` | id, bill_no, title, sort_order |
| `boq_items` | id, bill_id, item_no, description, qty, unit, rate, total, sort_order |
| `payment_certificates` | id, cert_no, ref_no, status, submitted_date, submitted_by_name, reviewed_date, reviewed_by_name, certified_date, certified_by_name, paid_date, recorded_by_name, retention_pct, advance_recovery, vat_pct, previously_paid |
| `payment_certificate_items` | id, cert_id, boq_item_id, contractor_pct, contractor_amount, consultant_pct, consultant_amount |

### Storage buckets
- `drawings` — drawing PDF files, path: `{drawing_id}/{revision}_{timestamp}.pdf`
- `attachments` — all other attachments, path: `{record_type}/{record_id}/{filename}`

### RLS Security
Row Level Security is enforced via `supabase/rls_policies.sql`. The script is idempotent:
- Disables RLS on all tables first (clears existing policies)
- Drops/recreates helper functions (`get_user_role()`, `is_developer()`, etc.)
- Re-enables RLS with role-based policies for all 16 tables
- Wrap in `BEGIN; ... COMMIT;` for atomic execution
- Safe to run repeatedly. See `supabase/rls_policies.sql` for full policy definitions.

**Profile role changes blocked by RLS** — `restrict_profile_role_changes` policy prevents non-developers from changing their own role. Must use Supabase Dashboard SQL Editor to reset.

---

## Roles & Permissions

```javascript
developer:    { approve:true,  upload:true,  raise:true,  submit:true,  manageUsers:true,  manageSubs:true,  submitMS:false, manageRegister:true  }
consultant:   { approve:true,  upload:true,  raise:true,  submit:true,  manageUsers:false, manageSubs:false, submitMS:false, manageRegister:true  }
contractor:   { approve:false, upload:true,  raise:false, submit:true,  manageUsers:false, manageSubs:true,  submitMS:true,  manageRegister:false }
subcontractor:{ approve:false, upload:false, raise:false, submit:true,  manageUsers:false, manageSubs:false, submitMS:true,  manageRegister:false }
```

Checked via `can(action)` — returns boolean based on `currentProfile.role`.

**BOQ permissions:** Import Excel, Edit, Replace BOQ, + New — all gated by `can('manageRegister')` (developer + consultant only)

**IPC permissions:**
- + New button: visible to all (uses `can('submit')`), but RLS blocks consultant/subcontractor at DB
- Submit/Retract: contractor or developer
- Begin Review/Certify: consultant or developer
- Record Payment: developer only

**IPC Financial Summary:**
- **Contractor phase (Draft/Submitted):** Single-column summary showing contractor claimed → Value of Works → Retention → Advance Recovery → Previously Paid → Net Before VAT → VAT → NET CERTIFIED. All auto-calculated from contractor percentages (read-only, no editable inputs).
- **Consultant phase (Under Review/Certified/Paid):** Comparison table with 3 columns: Label | Contractor Claimed | Consultant Certified. When consultant enters percentages, both columns update live via `recalcIPCSummary()`. Consultant values are final/accepted (shown with ✓).
- **Contract-level settings** set at IPC creation: Retention %, Advance Recovery %, VAT %, Mobilisation Advance (AED). Inherited from last IPC or default to 10%/10%/5%/0.
- **Previously Paid:** Cumulative sum of all prior certified/paid IPCs' net amounts (gross - retention - advanceRecovery + VAT). Stored in `payment_certificates.previously_paid`.
- **Formula:** `NET = base - retention - advanceRecovery - previouslyPaid + VAT(base)`. Base = consultant amount if available, else contractor amount.
- **No editable financial inputs** — retention/advance/VAT displayed as read-only percentages in summary rows.

---

## CRM Module

**Purpose:** Lead management from Meta Ads Instant Forms. Sales team tracks leads from capture through broker qualification to deal closure.

**Table:** `crm_leads` in Supabase public schema.

**Columns:**
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| name | text | Nullable (Facebook may not send full name) |
| email | text | Nullable |
| phone | text | Nullable |
| source | text | Default 'meta_ads' |
| stage | text | Default 'new_lead' |
| assigned_to | text | Team member email |
| meta_lead_id | text | Facebook lead ID for dedup |
| meta_form_id | text | Facebook form ID |
| first_name | text | From Facebook form |
| company_name | text | Brokerage company name |
| broker_type | text | e.g. "Real Estate Broker / Agent" |
| budget_range | text | e.g. "AED 1.8M – AED 2.1M" |
| property_types | text | e.g. "2 Bedroom" |
| availability | text | e.g. "Immediately" |
| notes | text | Manual notes added in app |
| last_contacted_at | timestamptz | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Lead stages (CRM_STAGES constant):**
- `new_lead` → `contacted_responded` → `contacted_no_response` → `site_visit` → `follow_up` → `closed_won` / `closed_lost`

**UI (page `#crm`):**
- Kanban board with 7 columns (one per stage)
- Each card shows: name, email, phone, source badge, time ago
- Search bar filters across all cards
- "+ Add Lead" button for manual entry
- Click card → detail modal with all fields, stage dropdown, assign to, notes

**Permissions:** CRM nav visible to `sales` and `developer` roles. RLS gated by `has_crm_access()` function (sales/developer only).

**Google Sheet sync (live):**
- Sheet: "Automatic Meta Leads" — spreadsheet `1MilS5L6fbmbm4w1xStoVvitX5vgvyrG0RWczSHRxNqo`
- Apps Script project: `1_k0ADnbsdTFeUjfgKZ5pFg1MTSnUzLMhMs6OtYMKiuSvqImrQyqi0S-e`
- Trigger: `syncLeadsToCRM` on-change (auto-fires when new rows added by SyncWith)
- RLS: `crm_leads_anon_insert` — anon INSERT when `source = 'meta_ads'`
- Dedup: UNIQUE on `meta_lead_id`, plain POST (no `?on_conflict=`), 409 treated as success

**SyncWith column mapping (headers are misleading — actual data locations):**
- `adset_name` → `name` | `adset_id` → `company_name` | `campaign_id` → `email` | `campaign_name` → `phone`
- Apps Script uses `idxCompany = headers.findIndex(h => h === 'adset_id')` — mapped 2026-05-15

**CRM UI features:** Delete lead button (with confirm), company name shown as amber-colored line on kanban card. Toolbar is flex row (search + Add Lead button). Empty columns show "No leads" italic text. Cards truncate long email/phone values.

**Migrations:**
- `20260429000006_add_crm_leads.sql` — Table + RLS
- `20260429000007_add_crm_custom_fields.sql` — Broker custom fields + company_name
- `20260429000008_fix_crm_name_nullable.sql` — Drop NOT NULL on name
- `20260514000001_crm_leads_unique_meta_id.sql` — UNIQUE on meta_lead_id

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
| `ipc` | Payment Certificates | Site |
| `subs` | Subcontractors | Admin |
| `users` | User Management | Admin (developer only) |
| `boq` | BOQ Setup | Admin |
| `usetup` | Unit Setup | Sales (developer only) |
| `ureg` | Unit Register | Sales (developer only) |
| `srev` | Sales Revenue | Sales (developer only) |
| `crm` | CRM | Sales (sales + developer) |

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
renderBOQ()                // BOQ Setup with grouped bills/items
renderIPC()                // Payment Certificates list
```

### BOQ Functions
```javascript
renderBOQ()                // Grouped bill headers + items, contract sum
openImportBOQ()            // Excel import modal with SheetJS
doImportBOQ(file)          // Parse XLSX, insert boq_bills + boq_items
replaceBOQ()               // Confirm + delete all + re-import
toggleBOQEdit()            // Enter/exit inline edit mode (collects data, renders, saves in parallel)
recalcBOQRow(input)        // Live total recalc on qty/rate change
deleteBOQItem(id)          // Confirm + delete item
addBOQItem(billId)         // Add new item to bill
```

### IPC Functions
```javascript
renderIPC()                // IPC list with module stats (total, in progress, certified, paid)
openNewIPC()               // Check for open IPCs, show new IPC modal with prev-paid calc
doNewIPC(refNo, certNo, prevPaid)  // Create IPC + link to all BOQ items
viewIPC(id)                // IPC detail modal with BOQ claims table + financial summary
saveIPCClaims(id)          // Save contractor's percentage claims
beginReviewIPC(id)         // Transition to Under Review
retractIPC(id)             // Contractor retracts submission
saveIPCCertification(id)   // Consultant saves certified amounts
openRecordPayment(id)      // Record payment modal
doRecordPayment(id)        // Record payment, transition to Paid
```

### Modals & Forms
```javascript
openNew()                  // Context-sensitive new item — routes by currentPage
openModal(title, body, footer, wide)
closeModal()
confirmModal(msg)          // Custom confirmation dialog (replaces window.confirm, returns Promise<boolean>)
toast(msg, type)           // type: 'success' (3s) | 'error' (6s) | 'info' (persistent) | 'warning' (4s)
validateForm(fields)       // Inline validation: highlights empty required fields, returns boolean
validateDrawingNumberLive() // Live BS 1192 format validation on blur
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

1. **Stat cards** — Drawings / Submittals / Inspections / Open NCRs / Open RFIs / Payment Certs
2. **ISO Compliance Score** — % Published+Archived, % complete metadata
3. **Drawing approval donut** — IFC / Approved / Under Review / Pending (130px SVG)
4. **Discipline completion bars** — Architecture / Structure / MEP / Civil (async)
5. **Open items panel** — NCR count / RFI count / Submittals pending bar

---

## Building / Editing Pattern

When making changes:
1. Read the relevant function(s) first with `read_file`
2. Edit with `edit` tool using exact string matching (include 3+ lines context before/after)
3. Run `git diff --stat` to verify scope
4. Commit and push after grouping related changes

**Common bugs to watch for:**
- Literal newlines inside single-quoted JS strings → use `\\n`
- Nested backtick template literals in HTML strings → use single-quoted strings inside
- Supabase JS client returns `{data, error}`, does NOT throw — always check `.error`
- Use `.maybeSingle()` when row might not exist; `.single()` throws on 0 rows
- Chain `.insert().select('id')` to get generated ID in one call (no race condition)
- All borders must be `0.5px` not `1px`

---

## Performance Patterns

- **Dashboard counts** use `head:true` queries — never `select('*')` for counts
- **Display tables** use limited-field, limited-row queries (max 20 rows, only needed columns)
- **Bulk inserts** use single batched calls — not per-row sequential loops
- **SPA navigation** uses URL hash (`#ncr`, `#draw`) for refresh recovery

---

## Correctness Patterns

- **Use `.maybeSingle()` instead of `.single()`** when a row might not exist (deleted, soft-deleted, or uncertain)
- **Use `.insert().select('id')`** instead of separate insert-then-select (race condition risk)
- **Guard `string.includes()` against empty substrings** — `"".includes("")` is always true
- **Always wrap paired DB operations** (e.g., drawing insert + revision insert) — rollback first if second fails

---

## Testing Pattern (browser)

**DO NOT use screenshots during development** — use browser tools, DOM inspection, and assertions
**MCP Playwright browser tools available** — use `browser_navigate`, `browser_click`, `browser_type`, `browser_snapshot`, `browser_evaluate`, `browser_file_upload`
**DO NOT use `taskkill /F /T` on dev server PID** — it kills the MCP browser context

**Login:**
```javascript
// MCP browser is already logged in after first navigation
await page.goto('http://localhost:3000');
// Wait for dashboard to load
await page.waitForTimeout(2000);
// Check currentProfile
await page.evaluate(() => currentProfile?.role);
```

**Role switching — blocked by RLS.** Must reset via Supabase Dashboard:
```sql
UPDATE profiles SET role = 'developer' WHERE email = 'mohammed@regent-developments.com';
```

---

## Current State (May 15, 2026)

### Completed This Session
- **BOQ PDF → Excel conversion** — Parsed 115-page PDF, generated `boq_import.xlsx` with 276 items across 18 bills (AED 38M total)
- **BOQ Excel import** — Successfully imported into Supabase via browser
- **BOQ Edit feature** — Added inline editing with ✏️ Edit / ✓ Save Changes / Cancel, delete per row, + Add Item per bill
- **BOQ Edit RLS policy** — Created migration `supabase/migrations/20260429000000_add_boq_update_policies.sql` for `boq_items_update` policy
- **BOQ Edit save fix** — Fixed hang: collect data from DOM → set `_boqEditMode = false` → `render()` → save in background (Promise.allSettled)
- **Test suite** — Part A: 48/48 permission matrix tests pass (pure Node.js)

### Still Needed
- **Apps Script `company_name` mapping** — open Apps Script editor, add after `idxPhone` line:
  ```javascript
  const idxCompany = headers.findIndex(h => h === 'adset_id');
  ```
  And in payload object add:
  ```javascript
  company_name: idxCompany >= 0 ? (String(row[idxCompany]||'').trim()||null) : null,
  ```

### Files Created/Modified
- `index.html` — Added BOQ edit mode, deleteBOQItem, addBOQItem, toggleBOQEdit, recalcBOQRow
- `boq_import.xlsx` — Generated Excel file from PDF (ready for re-import if needed)
- `supabase/migrations/20260428000000_create_payment_certificates.sql`
- `supabase/migrations/20260428000001_rls_payment_certificates.sql`
- `supabase/migrations/20260429000000_add_boq_update_policies.sql`
- `tests/boq-ipc-permissions.test.js` — Part A (48 tests, all pass)
- `tests/boq-ipc-ui.test.js` — Part B (needs fresh browser)
- `tests/boq-ipc-integration.test.js` — Part C (needs auth)

### Known Issues
- MCP Playwright browser dies if dev server killed with `taskkill /F /T`
- Role switching blocked by `restrict_profile_role_changes` RLS policy
- Supabase anon key (401) blocks write operations — tests need authenticated session
- IPC `+ New` button visible to all roles (uses `can('submit')`), but RLS blocks consultant/subcontractor at DB level — UI shows button, insert fails

---

## What Was Built (Session History)

| Build | Features |
|---|---|
| v1 | Auth, all base modules, Supabase integration |
| v2 | New theme (Plus Jakarta Sans, parchment palette), dashboard charts, compliance widget |
| v3 | CDE workflow, ISO metadata fields on drawings, audit log, submittal register page |
| v4 | IR checklists, NCR CAP workflow, re-inspection, resubmit chain, module summary bars |
| v5 | POI codes, drawing number validation, revision scheme enforcement, void drawings, drawing register export, cross-referencing, revision comments, correspondence register, punch list, transmittal acknowledgement, AR/FI classification, IFC vs Approved on dashboard |
| v6+ | Dashboard optimization (head-only counts), URL hash page persistence, role-gated CDE transitions (individual + batch), batch upload, hard block on revision scheme mismatch, `.maybeSingle()` for profile/drawing lookups, error handling across 10+ action functions, storage upload failure aborts, `JSON.stringify` in onclick handlers, XSS fixes, drawing revision creation in bulk import |
| v7+ | Stat cards + bulk actions on all modules, checkboxes + export CSV everywhere, custom confirm modal (replaces window.confirm), toast UX (icons, dismiss, variable durations), inline form validation with red borders, live drawing number validation on blur, `sbadge()` case-insensitive via title-case normalisation, comprehensive RLS SQL script (idempotent, 16 tables) |
| v8+ | Payment Certificates module (BOQ + IPC workflow), BOQ Setup page with Excel import, BOQ inline editing, IPC detail modal with BOQ claims table + financial summary, full FIDIC IPC lifecycle (Draft → Submitted → Under Review → Certified → Paid) |

---

## Dev Login Credentials

| Email | Password | Role |
|---|---|---|
| `mohammed@regent-developments.com` | `Mman1990` | consultant |

**Note:** RLS blocks role self-changes. Reset to developer via Supabase Dashboard if needed.
