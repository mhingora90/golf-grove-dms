# Modular Split of index.html Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the 9,565-line monolithic `index.html` into a `styles.css` and ~18 focused JS files under `src/`, with zero feature regressions and no data loss.

**Architecture:** Extract the `<style>` block to `styles.css` and the `<script>` block into separate non-module JS files loaded via `<script src="...">` tags. No bundler, no ES modules — functions stay global so inline `onclick` handlers continue to work. Each extraction is one file, tested immediately after cutting. `index.html` retains only HTML structure, CDN `<script>` tags, the `<link>` to `styles.css`, and ordered `<script src="src/...">` tags.

**Tech Stack:** Vanilla JS, plain HTML, custom Node.js dev server (`server.js`), Supabase JS v2, Vercel deployment. No build step — files served as static assets.

---

## Load Order (critical — scripts must load in this sequence)

```
CDN scripts (supabase, motion, html2pdf, pdf.js, xlsx)   ← already in <head>
styles.css                                                 ← <link> in <head>
src/state.js       — sb client, global vars
src/helpers.js     — toast, modal, confirm (used by all)
src/auth.js        — loadApp, login, logout
src/projects.js    — project grid, setCurrentProject
src/nav.js         — nav(), render(), updateBadges()
src/comment.js     — comment thread (used by viewDraw, viewSub, etc.)
src/attachments.js — file upload, PDF viewer, staged files
src/dashboard.js   — renderDash
src/ms.js          — method statements
src/drawings.js    — drawings, submittals, bulk import, view modals, actions
src/sreg.js        — submittal register
src/site.js        — inspections, NCRs, RFIs, transmittals, corr, punch list
src/users.js       — subcontractors + user management
src/boq.js         — BOQ setup
src/ipc.js         — payment certificates
src/finance.js     — finance overview
src/units.js       — unit setup, unit register, unit modal, sale form, sales revenue
src/crm.js         — CRM leads + CRM home dashboard
src/init.js        — IIFE session check + hashchange handler (last, depends on all)
```

## File Structure

```
golf-grove-dms/
├── index.html           ← modify: remove <style> and <script> blocks, add links
├── styles.css           ← create: extracted CSS (lines 13–754 of current index.html)
└── src/
    ├── state.js         ← ~20 lines: sb client, global variables
    ├── helpers.js       ← ~160 lines: toast, modal helpers, confirm, form validation
    ├── auth.js          ← ~120 lines: login, signup, logout, loadApp
    ├── projects.js      ← ~220 lines: project grid, setCurrentProject, dropdown
    ├── nav.js           ← ~220 lines: nav(), render(), updateBadges(), PAGE_TITLES, can()
    ├── comment.js       ← ~135 lines: renderCommentThread, addComment, deleteComment
    ├── attachments.js   ← ~350 lines: file upload, attachment list, PDF viewer, staged files
    ├── dashboard.js     ← ~285 lines: renderDash
    ├── ms.js            ← ~225 lines: renderMS, viewMS, doReviewMS, openNewMS, doNewMS
    ├── drawings.js      ← ~1500 lines: renderDrawings, renderSubmittals, bulk import,
    │                                    view modals, drawing actions, forms, review panel
    ├── sreg.js          ← ~175 lines: renderSubmittalRegister
    ├── site.js          ← ~1400 lines: inspections, NCRs, RFIs, transmittals,
    │                                    correspondence, punch list, CAP, re-inspection
    ├── users.js         ← ~175 lines: renderSubcontractors, renderUsers, approveUser,
    │                                    doApproveUser, denyUser, editUserRole, doChangeRole
    ├── boq.js           ← ~470 lines: renderBOQ, BOQ item CRUD, import, bills
    ├── ipc.js           ← ~670 lines: renderIPC, viewIPC, newIPC, review, certification
    ├── finance.js       ← ~430 lines: renderFinance
    ├── units.js         ← ~715 lines: renderUnitSetup, renderUnitRegister, unit modal,
    │                                    sale form, renderSalesRevenue
    ├── crm.js           ← ~1110 lines: renderCRM, renderCRMHome, viewLead, all CRM functions
    └── init.js          ← ~25 lines: IIFE getSession() + hashchange listener
```

---

## Safety Rules (read before starting)

1. **One file at a time.** Extract one module, reload the browser, verify no console errors, commit. Do not batch multiple modules.
2. **Cut, don't copy.** When a module is extracted and verified working, delete those exact lines from the inline `<script>` block in `index.html`. Do not leave duplicate definitions.
3. **Never touch Supabase schema or data.** This plan only moves JS and CSS. No migration files, no DB changes.
4. **Test after every extraction.** Navigate to the specific page for that module. Open browser DevTools console. If any `ReferenceError` or `TypeError`, the load order is wrong — add the script tag earlier.
5. **Commit after every verified extraction.** Small commits = easy rollback.

---

## Task 1: Extract CSS to styles.css

**Files:**
- Create: `styles.css`
- Modify: `index.html` (lines 13–755)

- [ ] **Step 1: Create styles.css**

  Copy lines 13–754 from `index.html` (everything between `<style>` and `</style>`, not including those tags) into a new file `styles.css` at the project root.

  Verify `styles.css` starts with:
  ```css
  :root {
  ```
  and ends with the last `}` before line 755 (`</style>`).

- [ ] **Step 2: Replace `<style>` block in index.html**

  In `index.html`, replace lines 13–755 (the entire `<style>...</style>` block) with a single link tag:
  ```html
  <link rel="stylesheet" href="styles.css">
  ```
  This goes at line 13, replacing 743 lines with 1 line.

- [ ] **Step 3: Verify dev server serves the CSS file**

  Run: `node server.js`

  Open `http://localhost:5173` in browser. The app should look identical — same colours, layout, fonts. Open DevTools Network tab and confirm `styles.css` loads with status 200.

  Open DevTools Console — zero errors expected.

- [ ] **Step 4: Navigate through 3 pages**

  Click: Dashboard → Drawing Register → CRM Home. All should render with correct styling (no unstyled HTML).

- [ ] **Step 5: Commit**

  ```bash
  git add styles.css index.html
  git commit -m "Extract CSS to styles.css"
  ```

---

## Task 2: Create src/ directory and extract state

**Files:**
- Create: `src/state.js`
- Modify: `index.html`

- [ ] **Step 1: Create src/state.js**

  Create directory `src/`. Create `src/state.js` with the following content — copy exact lines 985–1005 from the current `index.html` inline `<script>` block (after removing the CSS, the script now starts earlier — use the content, not line numbers):

  ```js
  // ─── SUPABASE INIT ───────────────────────────────────────────────
  const SUPABASE_URL = 'https://kdxvhrwnnehicgdryowu.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkeHZocndubmVoaWNnZHJ5b3d1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTg2NjMsImV4cCI6MjA5MTIzNDY2M30.uMlyBkTeth6nVl8ofBu9g_AYlnDLkgDyVTsxxaHI_ic';
  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const PROJECT = {
    name:'Golf Grove – Residential Building (B+G+P+7+Roof)',
    client:'Regent Star Property Developments L.L.C',
    location:'Motor City, Dubai',
    consultant:'Atkins',
  };

  let currentPage = 'dash';
  let currentUser = null;
  let currentProfile = null;
  let currentProject = null;
  let userProjects    = [];
  ```

  The `sb` variable is used by every other module — this file must load first.

- [ ] **Step 2: Add script tag to index.html**

  In `index.html`, immediately before the opening `<script>` tag of the inline block, add:
  ```html
  <script src="src/state.js"></script>
  ```

- [ ] **Step 3: Remove duplicated lines from inline script**

  Inside the inline `<script>` block, delete the lines that are now in `src/state.js` (the SUPABASE_URL, SUPABASE_KEY, `sb`, `PROJECT`, and the five `let` declarations for currentPage/currentUser/currentProfile/currentProject/userProjects).

- [ ] **Step 4: Verify**

  Open browser. Open DevTools Console. Type `sb` — should return the Supabase client object, not `ReferenceError`. Type `currentProject` — should return `null`.

- [ ] **Step 5: Commit**

  ```bash
  git add src/state.js index.html
  git commit -m "Extract state and Supabase init to src/state.js"
  ```

---

## Task 3: Extract helpers to src/helpers.js

**Files:**
- Create: `src/helpers.js`
- Modify: `index.html`

Helpers are used by almost every other module — must load before all feature modules.

- [ ] **Step 1: Create src/helpers.js**

  Cut the following sections from the inline script and paste into `src/helpers.js`:

  - Section `// ─── MODAL HELPERS ────` through end of `closeBg()` (look for `function closeBg`)
  - Section `// ─── CONFIRM MODAL ────` through end of `confirm()` wrapper
  - Section `// ─── FORM VALIDATION ─────` through end of `validateForm()`
  - Section `// ─── LIVE DRAWING NUMBER VALIDATION ──` through end of `checkDrawingNumberLive()`
  - Section `// ─── TOAST ────` through end of `toast()`
  - Section `// ─── HELPERS ──` through end of `fmtDate()` / `fmtSize()` etc.

  These are lines ~4697–4797 in the original file. Functions included:
  `openModal`, `closeModal`, `closeBg`, `confirmModal` (Promise wrapper), `validateForm`,
  `checkDrawingNumberLive`, `toast`, `fmtDate`, `fmtSize`, `fmtAED`, `esc`,
  `fmtCompact`, `showBarTip`, `moveBarTip`, `hideBarTip`.

  Also cut from near the top of the script (they belong here):
  - `cdeBadge(state)` (~line 1527)
  - `poiBadge(code)` (~line 1539)
  - `corrTypeBadge(type)` (~line 1555)
  - `validateDrawingNumber(num)` (~line 1567)
  - `enforceRevisionScheme(...)` (~line 1590)
  - `cdeStepperHTML(...)` (~line 1601)
  - `sbadge(s)` (~line 1623)
  - `bulkExportCSV(...)` (~line 2409)
  - `selectAllRows(...)`, `toggleRowSelect(...)`, `clearSelection(...)`,
    `updateBulkBar(...)`, `bulkDelete(...)` (~lines 2423–2476)
  - `_modalDirty` variable declaration
  - `_pageFilters` const declaration

- [ ] **Step 2: Add script tag to index.html**

  Add before the inline script block (after `src/state.js` tag):
  ```html
  <script src="src/helpers.js"></script>
  ```

- [ ] **Step 3: Remove all moved lines from inline script**

  Delete every line you moved. Search for `function toast(` in the inline script — it should not exist there anymore.

- [ ] **Step 4: Verify**

  Open browser. Navigate to any page. Open DevTools Console, type `toast('test','success')` — should show a green toast notification.

  Navigate to Drawing Register. Check no console errors.

- [ ] **Step 5: Commit**

  ```bash
  git add src/helpers.js index.html
  git commit -m "Extract shared helpers, badges, and modal utilities to src/helpers.js"
  ```

---

## Task 4: Extract auth to src/auth.js

**Files:**
- Create: `src/auth.js`
- Modify: `index.html`

- [ ] **Step 1: Create src/auth.js**

  Cut section `// ─── AUTH ────` through end of `loadApp()`, including:
  `switchTab`, `doLogin`, `doSignup`, `showAuthMsg`, `doLogout`, `loadApp`.

  This is lines ~1305–1418 in the original file.

- [ ] **Step 2: Add script tag to index.html**

  ```html
  <script src="src/auth.js"></script>
  ```
  (after `src/helpers.js` tag)

- [ ] **Step 3: Remove moved lines from inline script**

- [ ] **Step 4: Verify**

  Sign out (click "Sign Out" in sidebar). Sign back in. App should load normally. Check console for errors.

- [ ] **Step 5: Commit**

  ```bash
  git add src/auth.js index.html
  git commit -m "Extract auth (login/logout/loadApp) to src/auth.js"
  ```

---

## Task 5: Extract projects to src/projects.js

**Files:**
- Create: `src/projects.js`
- Modify: `index.html`

- [ ] **Step 1: Create src/projects.js**

  Cut the following from the inline script:
  - `openNewProject`, `doNewProject`, `openManageUsers`, `doManageUsers`, `deleteProject`
  - `setCurrentProject`, `returnToProjects`
  - `buildProjectDropdown`, `toggleProjectDropdown`, `closeProjectDropdown`, `switchProject`
  - Section `// ─── PROJECT GRID ─────` → `renderProjectGrid`

  This is lines ~1007–1195 in the original file.

- [ ] **Step 2: Add script tag to index.html**

  ```html
  <script src="src/projects.js"></script>
  ```
  (after `src/auth.js` tag)

- [ ] **Step 3: Remove moved lines from inline script**

- [ ] **Step 4: Verify**

  Refresh page. It should land on the correct project (241 Waterside via localStorage). Click the project switcher dropdown — should open/close. Click "← Projects" link if visible — should show project grid.

- [ ] **Step 5: Commit**

  ```bash
  git add src/projects.js index.html
  git commit -m "Extract project grid and switcher to src/projects.js"
  ```

---

## Task 6: Extract nav to src/nav.js

**Files:**
- Create: `src/nav.js`
- Modify: `index.html`

- [ ] **Step 1: Create src/nav.js**

  Cut the following from the inline script:
  - `PAGE_TITLES` const
  - `canCreateOnPage`, `toggleMobileNav`, `closeMobileNav`, `nav`
  - Section `// ─── ROLE PERMISSIONS ─────` → `can(action)`
  - Section `// ─── RENDER ───────────────────` → `render()`, `updateBadges()`

  This is lines ~1419–1526 in the original file, plus the `render()` and `updateBadges()` functions up to ~1638.

- [ ] **Step 2: Add script tag to index.html**

  ```html
  <script src="src/nav.js"></script>
  ```
  (after `src/projects.js` tag)

- [ ] **Step 3: Remove moved lines from inline script**

- [ ] **Step 4: Verify**

  Click every sidebar nav item (Dashboard, Drawing Register, CRM Home, Finance Overview, etc.). Each page should render. Active nav item should highlight. No console errors.

- [ ] **Step 5: Commit**

  ```bash
  git add src/nav.js index.html
  git commit -m "Extract navigation, permissions, and render router to src/nav.js"
  ```

---

## Task 7: Extract comment thread to src/comment.js

**Files:**
- Create: `src/comment.js`
- Modify: `index.html`

Must come before `drawings.js` and `site.js` since those call `renderCommentThread`.

- [ ] **Step 1: Create src/comment.js**

  Cut section `// ─── COMMENT THREAD ───` through end of all comment functions:
  `renderCommentThread`, `addComment`, `deleteComment`, and any helper inside that section.

  This is lines ~4852–4983 in the original file.

- [ ] **Step 2: Add script tag to index.html**

  ```html
  <script src="src/comment.js"></script>
  ```
  (after `src/nav.js` tag)

- [ ] **Step 3: Remove moved lines from inline script**

- [ ] **Step 4: Verify**

  Open a drawing detail (Drawing Register → click any row → View). Scroll to Comments section. Add a comment. Comment should appear. Delete it. No console errors.

- [ ] **Step 5: Commit**

  ```bash
  git add src/comment.js index.html
  git commit -m "Extract comment thread to src/comment.js"
  ```

---

## Task 8: Extract attachments and PDF viewer to src/attachments.js

**Files:**
- Create: `src/attachments.js`
- Modify: `index.html`

- [ ] **Step 1: Create src/attachments.js**

  Cut the following sections from the inline script:
  - Section `// ─── ATTACHMENTS ──────────` through end of attachment functions
    (`renderAttachments`, `uploadAttachment`, `deleteAttachment`, `downloadAttachment`)
  - Section `// ─── STAGED FILES HELPER ──` (`stagedFiles` const + `stageFile`, `unstageFile`, `clearStagedFiles`, `getStagedFiles`)
  - Section `// ─── DRAWING REVIEW PANEL ──` (`openDrawingReview`, `closeDrawingReview`, `submitMarkup`, `markupFiles` let)
  - Section `// ─── PDF.JS VIEWER ENGINE ──` (`pdfState` const + `openPDFViewer`, `closePDFViewer`, `renderPDFPage`, `pdfPrev`, `pdfNext`, `pdfFitWidth`, `pdfFitPage`)
  - Section `// ─── VIEW REVISION PDF ──` (`viewRevisionPDF`)
  - Section `// ─── VIEW ATTACHMENT PDF ──` (`viewAttachmentPDF`)
  - Section `// ─── PDF EXPORT ──` (`printDoc`)

  This covers lines ~5644–6181 in the original file.

- [ ] **Step 2: Add script tag to index.html**

  ```html
  <script src="src/attachments.js"></script>
  ```
  (after `src/comment.js` tag)

- [ ] **Step 3: Remove moved lines from inline script**

- [ ] **Step 4: Verify**

  Open a drawing detail. Click the PDF link to view a drawing — PDF viewer should open. Click "Fit Width" and "Fit Page" buttons. Close viewer.

  Upload a new attachment on any drawing. File should appear in attachments list.

  No console errors.

- [ ] **Step 5: Commit**

  ```bash
  git add src/attachments.js index.html
  git commit -m "Extract attachments, PDF viewer, staged files to src/attachments.js"
  ```

---

## Task 9: Extract dashboard to src/dashboard.js

**Files:**
- Create: `src/dashboard.js`
- Modify: `index.html`

- [ ] **Step 1: Create src/dashboard.js**

  Cut section `// ─── DASHBOARD ────` through the end of `renderDash()` (all code up to the `// ─── METHOD STATEMENTS` comment).

  This is lines ~1640–1924 in the original file.

- [ ] **Step 2: Add script tag to index.html**

  ```html
  <script src="src/dashboard.js"></script>
  ```
  (after `src/attachments.js` tag)

- [ ] **Step 3: Remove moved lines from inline script**

- [ ] **Step 4: Verify**

  Navigate to Dashboard. Stats tiles should load (Drawings, Submittals, etc.). Charts/tables should render. No console errors.

- [ ] **Step 5: Commit**

  ```bash
  git add src/dashboard.js index.html
  git commit -m "Extract dashboard to src/dashboard.js"
  ```

---

## Task 10: Extract method statements to src/ms.js

**Files:**
- Create: `src/ms.js`
- Modify: `index.html`

- [ ] **Step 1: Create src/ms.js**

  Cut section `// ─── METHOD STATEMENTS ───` through all MS functions:
  `renderMS`, `doBatchMSApprove`, `viewMS`, `doReviewMS`, `openNewMS`, `doNewMS`.

  This is lines ~1925–2148 in the original file.

- [ ] **Step 2: Add script tag to index.html**

  ```html
  <script src="src/ms.js"></script>
  ```
  (after `src/dashboard.js` tag)

- [ ] **Step 3: Remove moved lines from inline script**

- [ ] **Step 4: Verify**

  Navigate to Method Statements (sidebar). List should render. If any MS exist, click one to view the detail modal. No console errors.

- [ ] **Step 5: Commit**

  ```bash
  git add src/ms.js index.html
  git commit -m "Extract method statements to src/ms.js"
  ```

---

## Task 11: Extract drawings module to src/drawings.js

**Files:**
- Create: `src/drawings.js`
- Modify: `index.html`

This is the largest extraction (~1500 lines). Take care with load order.

- [ ] **Step 1: Create src/drawings.js**

  Cut the following sections from the inline script:
  - `// ─── BULK DRAWING IMPORT ───` → `openBulkImport`, `downloadBulkTemplate`, `handleBulkDrop`, `parseCSVLine`, `parseBulkCSV`, `doBulkImport`
  - `// ─── BULK SELECTION ───` → `toggleDrawSelect`, `toggleSubSelect`, `selectAllDrawings`, `selectAllSubmittals`, `updateDrawBulkBar`, `updateSubBulkBar`
  - Global `let` vars for drawings: `bulkRows`, `drawFilters`, `selectedDrawings`, `selectedSubmittals`, `navFilter`, plus `selectedIRs`, `selectedNCRs`, `selectedRFIs`, `selectedTransmittals`, `selectedCorrespondence`, `selectedMS`, `selectedPunch`
  - `clearDrawSelection`, `clearSubSelection`, `batchDrawAction`, `batchSubAction`, `doBatchDrawAction`, `doBatchSubAction`
  - `// ─── DRAWINGS ─────` → `renderDrawings`, `updateDocNum`, `advanceCDE`, `logAudit`, `filtDraw`, `filt`, `searchReg`, `filtBOQ`, `filtIPC`
  - `// ─── SUBMITTALS ───` → `renderSubmittals`
  - `// ─── VIEW MODALS ──` → `viewDraw`, `viewSub`, `viewIR` (if viewIR is not also in site.js — check the section boundary)
  - `// ─── DRAWING ACTIONS ──` → `voidDrawing`, `linkDrawings`, `saveLinkDrawings`, `exportDrawingRegister`, `deleteDraw`
  - `// ─── ACTIONS ──` → `approveDrawing`, `reviewSub`, `doReviewSub`
  - `// ─── NEW ITEM FORMS ───` → `openNewDraw`, `doNewDraw`, `openNewSub`, `doNewSub` (drawing and submittal forms only — stop before IR/NCR forms)
  - `// ─── DRAWING REVIEW PANEL ──` is already in `src/attachments.js`; do not duplicate

  Lines approximately: 2149–2598, 2599–2885, 3192–3402 (viewDraw, viewSub), 3569–3695, and the drawing-specific new forms from ~3861.

  **Important:** Check each function against the Load Order table above. `viewIR` and `viewNCR` belong in `src/site.js`, not here.

- [ ] **Step 2: Add script tag to index.html**

  ```html
  <script src="src/drawings.js"></script>
  ```
  (after `src/ms.js` tag)

- [ ] **Step 3: Remove moved lines from inline script**

- [ ] **Step 4: Verify**

  Navigate to Drawing Register. List renders, filters work (Discipline, Status, CDE dropdowns). Click a row to open view modal. Click "Advance CDE" if available. Open "New Drawing" form and fill in details (don't submit unless you want a test drawing). No console errors.

  Navigate to Submittals (DSUB). List renders. Click a row to view detail. No console errors.

- [ ] **Step 5: Commit**

  ```bash
  git add src/drawings.js index.html
  git commit -m "Extract drawings, submittals, bulk import, and view/action modals to src/drawings.js"
  ```

---

## Task 12: Extract submittal register to src/sreg.js

**Files:**
- Create: `src/sreg.js`
- Modify: `index.html`

- [ ] **Step 1: Create src/sreg.js**

  Cut section `// ─── SUBMITTAL REGISTER ───` through end of all sreg functions:
  `renderSubmittalRegister`, `exportSubmittalRegister`, and any register-specific helpers.

  Also cut `registerImportData` let declaration.

  This is lines ~4523–4696 in the original file.

- [ ] **Step 2: Add script tag to index.html**

  ```html
  <script src="src/sreg.js"></script>
  ```
  (after `src/drawings.js` tag)

- [ ] **Step 3: Remove moved lines from inline script**

- [ ] **Step 4: Verify**

  Navigate to Submittal Register (sidebar). Table renders with correct columns. No console errors.

- [ ] **Step 5: Commit**

  ```bash
  git add src/sreg.js index.html
  git commit -m "Extract submittal register to src/sreg.js"
  ```

---

## Task 13: Extract site modules to src/site.js

**Files:**
- Create: `src/site.js`
- Modify: `index.html`

- [ ] **Step 1: Create src/site.js**

  Cut the following sections from the inline script:
  - `// ─── INSPECTIONS ──` → `renderInspections`, `respondIR`, `doRespondIR`, `openNewIR`, `doNewIR`
  - `viewIR`, `viewNCR` (from `// ─── VIEW MODALS ──` section — these were NOT moved to drawings.js)
  - `// ─── NCRs ─────` → `renderNCRs`, `openNewNCR`, `doNewNCR`
  - `// ─── CAP WORKFLOW ──` → `openCAP`, `saveCAP`, `closeCAP`
  - `// ─── RE-INSPECTION ──` → `openReInspection`, `doReInspection`
  - `// ─── INSPECTION CHECKLISTS ──` → `IR_TEMPLATES` const, `ckState` let, `buildChecklist`, `saveChecklist`
  - `// ─── RFI REGISTER ──` → `renderRFIs`, `viewRFI`, `openNewRFI`, `doNewRFI`, `respondRFI`, `doRespondRFI`
  - `// ─── TRANSMITTAL LOG ──` → `renderTransmittals`, `viewTransmittal`, `openNewTransmittal`, `doNewTransmittal`
  - `// ─── TRANSMITTAL ACKNOWLEDGEMENT ──` → `acknowledgeTransmittal`
  - `// ─── CORRESPONDENCE REGISTER ──` → `renderCorrespondence`, `viewCorrespondence`, `openNewCorrespondence`, `doNewCorrespondence`
  - `// ─── PUNCH LIST ──` → `renderPunch`, `viewPunch`, `openNewPunch`, `doNewPunch`, `resolvePunch`
  - `// ─── RESUBMISSION ──` → `openResubmitSub`, `doResubmitSub`
  - `// ─── NEW ITEM FORMS – RFI & TRANSMITTAL ──` (forms not already in drawings.js)

  Lines approximately: 2887–3042 (IR+NCR), 3402–3569 (viewIR, viewNCR), 3725–3861 (IR/NCR actions and forms), 4274–4522 (CAP, re-inspection, checklists), 4984–5643 (RFI, transmittal, correspondence, punch, resubmission, new forms).

- [ ] **Step 2: Add script tag to index.html**

  ```html
  <script src="src/site.js"></script>
  ```
  (after `src/sreg.js` tag)

- [ ] **Step 3: Remove moved lines from inline script**

- [ ] **Step 4: Verify**

  Navigate to: Inspection Requests → NCRs → RFIs → Transmittals → Correspondence → Punch List. Each should render. Open a detail modal on each. No console errors.

- [ ] **Step 5: Commit**

  ```bash
  git add src/site.js index.html
  git commit -m "Extract inspections, NCRs, RFIs, transmittals, correspondence, punch list to src/site.js"
  ```

---

## Task 14: Extract users to src/users.js

**Files:**
- Create: `src/users.js`
- Modify: `index.html`

- [ ] **Step 1: Create src/users.js**

  Cut sections:
  - `// ─── SUBCONTRACTORS ───` → `renderSubcontractors`
  - `// ─── USER MANAGEMENT ──` → `renderUsers`, `approveUser`, `doApproveUser`, `denyUser`, `editUserRole`, `doChangeRole`
  - `ROLE_ADMIN_EMAIL` const

  This is lines ~3043–3191 in the original file.

- [ ] **Step 2: Add script tag to index.html**

  ```html
  <script src="src/users.js"></script>
  ```
  (after `src/site.js` tag)

- [ ] **Step 3: Remove moved lines from inline script**

- [ ] **Step 4: Verify**

  Navigate to Subcontractors. List renders. Navigate to User Management. Users table renders. No console errors.

- [ ] **Step 5: Commit**

  ```bash
  git add src/users.js index.html
  git commit -m "Extract subcontractors and user management to src/users.js"
  ```

---

## Task 15: Extract BOQ to src/boq.js

**Files:**
- Create: `src/boq.js`
- Modify: `index.html`

- [ ] **Step 1: Create src/boq.js**

  Cut section `// ─── BOQ SETUP ────` through end of all BOQ functions:
  `renderBOQ`, `selectBOQContract`, `openAddContract`, `doAddContract`, `recalcBOQRow`, `deleteBOQItem`, `savePendingBOQEdits`, `addBOQItem`, `toggleBOQEdit`, `cancelBOQEdit`, `openImportBOQ`, `previewBOQ`, `doImportBOQ`, `replaceBOQ`, `openAddBill`, `doAddBill`.

  This is lines ~6182–6649 in the original file.

- [ ] **Step 2: Add script tag to index.html**

  ```html
  <script src="src/boq.js"></script>
  ```
  (after `src/users.js` tag)

- [ ] **Step 3: Remove moved lines from inline script**

- [ ] **Step 4: Verify**

  Navigate to BOQ Setup. Contract list renders. Click a contract to load its bill of quantities. Click "Edit" to enable editing mode. Click "Cancel". No console errors.

- [ ] **Step 5: Commit**

  ```bash
  git add src/boq.js index.html
  git commit -m "Extract BOQ setup to src/boq.js"
  ```

---

## Task 16: Extract IPC to src/ipc.js

**Files:**
- Create: `src/ipc.js`
- Modify: `index.html`

- [ ] **Step 1: Create src/ipc.js**

  Cut section `// ─── PAYMENT CERTIFICATES ─────` through end of all IPC functions:
  `renderIPC`, `selectIPCContract`, `openNewIPC`, `_openNewIPCForContract`, `_openNewIPCLegacy`, `doNewIPC`, `viewIPC`, `ipcActionButtons`, `deleteIPC`, `recalcIPCRow`, `recalcIPCSummary`, `saveIPCClaims`, `beginReviewIPC`, `retractIPC`, `saveIPCCertification`, `openRecordPayment`, `doRecordPayment`.

  This is lines ~6650–7297 in the original file.

- [ ] **Step 2: Add script tag to index.html**

  ```html
  <script src="src/ipc.js"></script>
  ```
  (after `src/boq.js` tag)

- [ ] **Step 3: Remove moved lines from inline script**

- [ ] **Step 4: Verify**

  Navigate to Payment Certificates. IPC list renders. Click a certificate to open it. Verify the financial summary table shows. Click "Certify" or other action buttons to confirm they respond (don't proceed with actual certification). No console errors.

- [ ] **Step 5: Commit**

  ```bash
  git add src/ipc.js index.html
  git commit -m "Extract payment certificates (IPC) to src/ipc.js"
  ```

---

## Task 17: Extract finance to src/finance.js

**Files:**
- Create: `src/finance.js`
- Modify: `index.html`

- [ ] **Step 1: Create src/finance.js**

  Cut section `// ─── FINANCE OVERVIEW ────` through end of `renderFinance()`.

  This is lines ~7315–7741 in the original file.

- [ ] **Step 2: Add script tag to index.html**

  ```html
  <script src="src/finance.js"></script>
  ```
  (after `src/ipc.js` tag)

- [ ] **Step 3: Remove moved lines from inline script**

- [ ] **Step 4: Verify**

  Navigate to Finance Overview. Charts and summary tables render. No console errors.

- [ ] **Step 5: Commit**

  ```bash
  git add src/finance.js index.html
  git commit -m "Extract finance overview to src/finance.js"
  ```

---

## Task 18: Extract units and sales to src/units.js

**Files:**
- Create: `src/units.js`
- Modify: `index.html`

- [ ] **Step 1: Create src/units.js**

  Cut the following sections from the inline script:
  - `// ─── UNIT SETUP ──` → `renderUnitSetup`, `openAddUnitForm`, `saveNewUnit`, `openEditUnit`, `saveEditUnit`, `deleteUnit`, `downloadUnitCSVTemplate`, `handleUnitCSV`
  - `// ─── UNIT REGISTER ───` → `_unitSaleStatus`, `_unitStatusBadge`, `_spaBadge`, `_oqoodBadge`, `renderUnitRegister`, `_renderUregTable`
  - `// ─── UNIT DETAIL MODAL ───` → `openUnitModal`
  - `// ─── SALE FORM ───` → `openSaleForm`, `saveSaleForm`, `markUnitAvailable`
  - `// ─── SALES REVENUE ───` → `renderSalesRevenue`

  This is lines ~7742–8452 in the original file.

- [ ] **Step 2: Add script tag to index.html**

  ```html
  <script src="src/units.js"></script>
  ```
  (after `src/finance.js` tag)

- [ ] **Step 3: Remove moved lines from inline script**

- [ ] **Step 4: Verify**

  Navigate to Unit Setup. Unit list renders. Navigate to Unit Register. Click a unit to open the unit detail modal. Navigate to Sales Revenue. Revenue summary renders. No console errors.

- [ ] **Step 5: Commit**

  ```bash
  git add src/units.js index.html
  git commit -m "Extract unit setup, unit register, and sales revenue to src/units.js"
  ```

---

## Task 19: Extract CRM to src/crm.js

**Files:**
- Create: `src/crm.js`
- Modify: `index.html`

- [ ] **Step 1: Create src/crm.js**

  Cut the entire `// ─── CRM ──` section through the end of the file (before the INIT block), including:
  - `CRM_STAGES` const, all crm state vars (`crmSearch`, `crmPage`, `crmSelected`, etc.)
  - `// ─── CRM HOME DASHBOARD ───` → `renderCRMHome` and all helper functions it calls
  - `renderCRM`, `crmHTML`, `crmTh`, `crmRow`, `resetCRM`, `crmClearDates`, `crmOnSearch`, `crmSetFilter`, `crmSetSort`, `crmSetPage`, `crmUpdateBulkBar`, `crmToggleRow`, `crmToggleAll`, `crmClearSelection`, `crmBulkMoveStage`, `crmBulkMoveStageConfirm`, `crmBulkAssign`, `crmBulkAssignConfirm`, `crmBulkDelete`
  - `ACT_METHODS`, `RATING_META` consts, `_crmReplyTo` let
  - `_nowLocal`, `_tomorrowLocal`, `onActMethodChange`, `filterActFeed`, `startActReply`, `cancelActReply`, `quickSchedule`, `_renderActItem`, `_buildFeedHtml`
  - `viewLead`, `updateLeadStage`, `setLeadRating`, `updateLeadAssigned`, `addLeadActivity`, `completeTask`, `openConvertLead`, `doConvertLead`, `deleteLead`, `openAddLead`, `doAddLead`
  - `fmtLeadField`, `timeAgo`

  This is lines ~8453–9555 in the original file (leaving only the INIT IIFE at the end).

- [ ] **Step 2: Add script tag to index.html**

  ```html
  <script src="src/crm.js"></script>
  ```
  (after `src/units.js` tag)

- [ ] **Step 3: Remove moved lines from inline script**

  After this task, the only remaining content in the inline `<script>` block should be the IIFE at the bottom (the `(async()=>{ ... })()` init block including the hashchange listener).

- [ ] **Step 4: Verify**

  Navigate to CRM Home. Dashboard tiles load, pipeline renders, going-cold section populates. Navigate to Leads. Lead list renders with filters. Click a lead to open the detail modal. Add an activity (note). No console errors.

- [ ] **Step 5: Commit**

  ```bash
  git add src/crm.js index.html
  git commit -m "Extract CRM home dashboard and leads module to src/crm.js"
  ```

---

## Task 20: Extract init to src/init.js and final cleanup

**Files:**
- Create: `src/init.js`
- Modify: `index.html`

After this task the inline `<script>` block in `index.html` will be gone entirely.

- [ ] **Step 1: Create src/init.js**

  Cut the entire remaining inline `<script>` block content (the IIFE at lines ~7298–7315 + hashchange handler at ~7302–7314):

  ```js
  // ─── INIT ─────────────────────────────────────────────────────────
  (async()=>{
    const {data:{session}} = await sb.auth.getSession();
    if(session?.user) await loadApp(session.user);
    else document.getElementById('auth-screen').style.display = 'flex';
    // Handle browser back/forward navigation
    window.addEventListener('hashchange', ()=>{
      if(!currentProfile) return;
      const hash = location.hash.replace('#','');
      const validPages = ['dash','draw','sub','sreg','ir','ncr','rfi','trans','corr','punch','ms','subs','users','ipc','boq','finance','usetup','ureg','srev','crm','crm-home'];
      if(validPages.includes(hash) && hash !== currentPage){
        const navEl = document.getElementById('n-'+hash);
        nav(hash, navEl);
      }
    });
    document.addEventListener('click', e => {
      if (!e.target.closest('.psw-wrap')) closeProjectDropdown();
    });
  })();
  ```

  (Copy the exact content from index.html — do not paraphrase.)

- [ ] **Step 2: Replace inline script block in index.html**

  Remove the entire `<script>...</script>` inline block (which now contains only the IIFE). Replace it with:
  ```html
  <script src="src/init.js"></script>
  ```

- [ ] **Step 3: Verify the full script tag list in index.html**

  The `<head>` and bottom of `<body>` in `index.html` should now look like this (in order):

  ```html
  <!-- head -->
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="https://cdn.jsdelivr.net/npm/motion/dist/motion.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
  <link rel="stylesheet" href="styles.css">

  <!-- end of body -->
  <script src="src/state.js"></script>
  <script src="src/helpers.js"></script>
  <script src="src/auth.js"></script>
  <script src="src/projects.js"></script>
  <script src="src/nav.js"></script>
  <script src="src/comment.js"></script>
  <script src="src/attachments.js"></script>
  <script src="src/dashboard.js"></script>
  <script src="src/ms.js"></script>
  <script src="src/drawings.js"></script>
  <script src="src/sreg.js"></script>
  <script src="src/site.js"></script>
  <script src="src/users.js"></script>
  <script src="src/boq.js"></script>
  <script src="src/ipc.js"></script>
  <script src="src/finance.js"></script>
  <script src="src/units.js"></script>
  <script src="src/crm.js"></script>
  <script src="src/init.js"></script>
  ```

  Confirm there is NO remaining inline `<script>` block with application code in index.html.

- [ ] **Step 4: Full regression test**

  Open browser. Open DevTools Console (keep it open throughout). Run through every page:

  | Page | What to check |
  |------|---------------|
  | Dashboard | Stats tiles load, charts render |
  | Drawing Register | List loads, filters work, click a row to view detail |
  | Submittals (DSUB) | List loads, click row to view |
  | Submittal Register | Table loads |
  | Inspection Requests | List loads, click to view |
  | NCRs | List loads |
  | RFIs | List loads |
  | Transmittals | List loads |
  | Correspondence | List loads |
  | Punch List | List loads |
  | Method Statements | List loads |
  | Finance Overview | Charts load |
  | Payment Certificates | IPC list loads, click to open cert |
  | BOQ Setup | Contract + bill table loads |
  | Unit Setup | Unit list loads |
  | Unit Register | Table loads, click unit to open modal |
  | Sales Revenue | Revenue table loads |
  | CRM Home | Dashboard tiles, pipeline render |
  | Leads | Lead list loads, click lead to view detail |
  | User Management | User list loads |
  | Subcontractors | List loads |

  Check console after each page — **zero `ReferenceError` or `TypeError`**. If one appears, the function it references is either in the wrong file or the load order is wrong.

- [ ] **Step 5: Verify project switching**

  Click the project switcher (top bar). Switch to the other project. All pages should still work. Refresh — should land on same project and page.

- [ ] **Step 6: Verify auth**

  Sign out. Sign back in. App loads correctly.

- [ ] **Step 7: Commit**

  ```bash
  git add src/init.js index.html
  git commit -m "Extract init IIFE to src/init.js — inline script block fully removed"
  ```

- [ ] **Step 8: Final commit with summary**

  ```bash
  git add -A
  git commit -m "chore: modular split complete — index.html now 230 lines (was 9565)"
  git push
  ```

---

## Troubleshooting Guide

**`ReferenceError: X is not defined`**
→ Function `X` is called before its file loads. Move the `<script src="...">` for that file earlier in the load order, OR check that the function wasn't accidentally left out of any file.

**`Uncaught TypeError: X is not a function`**
→ Same as above — check the file containing `X` loads before the file that calls it.

**Page renders but looks unstyled**
→ `styles.css` failed to load. Check Network tab. Verify path `styles.css` is at project root (same level as `index.html`).

**Duplicate function definition warning**
→ A function was moved to a new file but not removed from the inline script. Delete it from the inline block.

**App works locally but breaks on Vercel**
→ Vercel's `vercel.json` routes `(.*)` to `index.html`. Static files like `styles.css` and `src/*.js` are served directly by Vercel's CDN — no changes to `vercel.json` needed. If a file 404s, check the file was committed to git.
