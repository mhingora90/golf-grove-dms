# Mobile Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the entire Golf Grove DMS SPA usable on mobile phones via an additive CSS-only responsive layer, with a hamburger drawer for navigation.

**Architecture:** Single `@media (max-width: 768px)` block appended to the `<style>` tag in `index.html`. ~10 lines of JS for the drawer toggle. All changes are additive — desktop layout is completely unchanged. No new files or dependencies.

**Tech Stack:** Vanilla HTML/CSS/JS, Supabase SPA (`index.html`). No build step.

---

## File Map

| File | Changes |
|---|---|
| `index.html` | All changes — HTML structure (topbar, backdrop), JS functions, CSS media block |

All edits are in one file. Tasks are ordered so each produces a visible, testable result.

---

### Task 1: Add hamburger JS functions + wire into nav()

**Files:**
- Modify: `index.html` — JS section near top (around line 1224 where `nav()` lives)

- [ ] **Step 1: Add `toggleMobileNav` and `closeMobileNav` functions**

Find the `nav()` function (around line 1224). Immediately before it, add:

```javascript
function toggleMobileNav() {
  document.getElementById('app-screen').classList.toggle('nav-open');
}
function closeMobileNav() {
  document.getElementById('app-screen').classList.remove('nav-open');
}
```

- [ ] **Step 2: Call `closeMobileNav()` inside `nav()`**

Inside the `nav()` function body (line ~1224), add `closeMobileNav();` as the first line:

```javascript
function nav(page, el, opts) {
  closeMobileNav();          // ← add this line
  currentPage = page;
  navFilter = opts?.filter || null;
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  if(el) el.classList.add('active');
  // ... rest of function unchanged
```

- [ ] **Step 3: Verify in browser (desktop, no visual change expected)**

Open `http://localhost:5173`. Confirm app still loads and nav still works normally. Open browser console — no errors.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Add toggleMobileNav/closeMobileNav JS functions, wire into nav()"
```

---

### Task 2: Add hamburger button + backdrop to HTML

**Files:**
- Modify: `index.html` — topbar HTML (~line 722) and app div (~line 604)

- [ ] **Step 1: Add hamburger button to topbar**

Find `<div class="topbar">` (line ~722). Add a hamburger button as its **first child**:

```html
<div class="topbar">
  <button class="hamburger-btn" onclick="toggleMobileNav()" aria-label="Menu">&#9776;</button>
  <!-- existing topbar contents unchanged below -->
```

- [ ] **Step 2: Add backdrop div inside .app**

Find `<div id="app-screen" class="app" ...>` (line ~604). Add a backdrop div as its **first child**, immediately after the opening tag:

```html
<div id="app-screen" class="app" style="display:none">
  <div class="nav-backdrop" onclick="closeMobileNav()"></div>
  <!-- existing sidebar and main-content divs unchanged below -->
```

- [ ] **Step 3: Verify HTML structure in browser**

Open `http://localhost:5173`. On desktop, hamburger button is not visible (will be hidden in Task 3 CSS). Open DevTools → Elements — confirm `.nav-backdrop` div exists inside `#app-screen` and `.hamburger-btn` is first child of `.topbar`.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Add hamburger button to topbar and nav backdrop div to app"
```

---

### Task 3: Sidebar drawer CSS (core mobile nav)

**Files:**
- Modify: `index.html` — `<style>` block (append new `@media` block at the end, before `</style>`)

- [ ] **Step 1: Add hamburger hide rule (outside media query — hidden on desktop)**

Find `</style>` closing tag. Insert this block **before** it:

```css
/* ─── Mobile responsive layer ─── */
.hamburger-btn { display: none; }
.nav-backdrop  { display: none; }
```

- [ ] **Step 2: Add the mobile nav drawer CSS block**

Immediately after the two lines above (still before `</style>`):

```css
@media (max-width: 768px) {

  /* ── Hamburger button ── */
  .hamburger-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    min-height: 44px;
    background: none;
    border: none;
    font-size: 22px;
    cursor: pointer;
    color: var(--text);
    flex-shrink: 0;
    padding: 0;
    margin-right: 4px;
  }

  /* ── Backdrop ── */
  .nav-open .nav-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.45);
    z-index: 199;
  }

  /* ── Sidebar becomes overlay drawer ── */
  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    height: 100%;
    z-index: 200;
    transform: translateX(-220px);
    transition: transform 0.25s ease;
    overflow-y: auto;
  }
  .nav-open .sidebar {
    transform: translateX(0);
    box-shadow: 4px 0 24px rgba(0,0,0,0.25);
  }

  /* ── Main content fills full width ── */
  .main-content, main, #main-content {
    margin-left: 0 !important;
    width: 100% !important;
  }

}
```

- [ ] **Step 3: Verify drawer in browser at mobile size**

1. Open `http://localhost:5173`, resize browser to 390px wide (or DevTools → toggle device toolbar → iPhone 14)
2. Confirm: hamburger ☰ is visible top-left in topbar
3. Tap/click ☰ → sidebar slides in from left
4. Tap backdrop → sidebar closes
5. Navigate to any page (e.g. Dashboard) → sidebar auto-closes

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Add mobile sidebar drawer CSS — hamburger, overlay, backdrop"
```

---

### Task 4: Layout reflow CSS

**Files:**
- Modify: `index.html` — inside the `@media (max-width: 768px)` block added in Task 3

- [ ] **Step 1: Add layout reflow rules inside the media block**

Inside the `@media (max-width: 768px) { ... }` block (after the nav drawer rules from Task 3, before the closing `}`):

```css
  /* ── Topbar ── */
  .topbar {
    padding: 0 8px;
    gap: 6px;
    min-height: 52px;
  }
  .topbar-right { gap: 6px; }
  .psw-wrap { max-width: 140px; }
  .psw-wrap .tb-proj-div,
  .psw-wrap button { font-size: 12px; }

  /* ── Page content padding ── */
  .page-content,
  .content-area,
  #page-body { padding: 12px !important; }

  /* ── Dashboard stats grid: 6 → 2 columns ── */
  .stats { grid-template-columns: repeat(2, 1fr) !important; }

  /* ── CRM Home KPI tiles: 5 → 2 columns ── */
  .crm-home-kpi { grid-template-columns: repeat(2, 1fr) !important; }

  /* ── CRM Home week bar: keep 5 cols, shrink cells ── */
  .ch-week-bar { gap: 4px; }
  .ch-week-bar > * { padding: 6px 4px; font-size: 11px; }

  /* ── CRM Home 2-col body → single column ── */
  .crm-home-body {
    grid-template-columns: 1fr !important;
  }

  /* ── Project selector grid ── */
  .ps-grid { grid-template-columns: 1fr !important; }

  /* ── Section headings ── */
  .page-title, h2.page-title { font-size: 18px; }
  .section-title, h3.section-title { font-size: 15px; }
```

- [ ] **Step 2: Verify layout reflow in browser at 390px width**

1. Navigate to **Dashboard** — stats should show 2 columns, not 6
2. Navigate to **CRM Home** — KPI tiles should show 2×3 grid; main+sidebar stack vertically; week bar still shows Mon–Fri (5 cols, smaller)
3. Navigate to **Finance Overview** — cards should be single column
4. Check topbar doesn't overflow — project name truncates cleanly

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "Add mobile layout reflow CSS — grids, topbar, content padding"
```

---

### Task 5: Table horizontal scroll

**Files:**
- Modify: `index.html` — CSS inside media block + HTML wrappers around unwrapped tables

- [ ] **Step 1: Add table scroll CSS inside the media block**

Inside the `@media (max-width: 768px) { ... }` block:

```css
  /* ── Table scroll ── */
  .tw {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    max-width: 100%;
  }
  .tw table { min-width: 520px; }
  th, td { white-space: nowrap; padding: 8px 10px; }
```

- [ ] **Step 2: Find tables NOT already inside a `.tw` div**

Run this grep to find `<table` that are NOT immediately preceded by `.tw`:

```bash
grep -n "<table" index.html | head -60
```

For each line number returned, check if the parent div has class `tw`. Tables at approximately lines 1777, 1940, 3027, 3132, 3191, 3270, 4821, 4828, 6314, 7882, 7958, 8175, 8196, 8474, 8738 may lack `.tw` wrappers. For each one found without a `.tw` parent, wrap it:

```html
<!-- Before -->
<table ...>

<!-- After -->
<div class="tw">
<table ...>
</div>
```

- [ ] **Step 3: Verify tables scroll on mobile**

1. Resize to 390px
2. Navigate to **Drawing Register** — table should scroll horizontally, all columns preserved
3. Navigate to **Submittals**, **NCRs**, **RFIs** — same check
4. Navigate to **CRM → Leads** — leads table scrolls horizontally

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Add mobile table horizontal scroll CSS and missing .tw wrappers"
```

---

### Task 6: Full-screen modals on mobile

**Files:**
- Modify: `index.html` — CSS inside media block

The modal structure uses `.modal-bg` (outer overlay) and `.modal` (inner box). The close button is inside `.modal-header`.

- [ ] **Step 1: Add modal CSS inside the media block**

Inside the `@media (max-width: 768px) { ... }` block:

```css
  /* ── Full-screen modals ── */
  .modal-bg {
    align-items: flex-start !important;
    padding: 0 !important;
  }
  .modal {
    width: 100% !important;
    max-width: 100% !important;
    height: 100dvh !important;
    border-radius: 0 !important;
    margin: 0 !important;
    overflow-y: auto !important;
    display: flex;
    flex-direction: column;
  }
  .modal-header {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--bg);
    flex-shrink: 0;
  }
  .modal-body { flex: 1; overflow-y: auto; }
  .modal-footer {
    position: sticky;
    bottom: 0;
    background: var(--bg);
    flex-shrink: 0;
  }
```

- [ ] **Step 2: Verify modals on mobile**

1. Resize to 390px
2. Open any lead from CRM → Leads — modal should be full screen, header fixed at top, body scrollable
3. Open a Drawing — modal full screen
4. Open an NCR — modal full screen
5. Close button visible and tappable (top area of modal header)

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "Add mobile full-screen modal CSS"
```

---

### Task 7: Touch targets + Form stacking

**Files:**
- Modify: `index.html` — CSS inside media block

- [ ] **Step 1: Add touch target and form CSS inside the media block**

Inside the `@media (max-width: 768px) { ... }` block:

```css
  /* ── Touch targets — 44px minimum ── */
  button, .btn, .nav-item, [role="button"] {
    min-height: 44px;
  }
  .sidebar .nav-item {
    padding: 12px 16px;
    font-size: 14px;
  }
  /* Table action buttons */
  td button, td .btn { min-height: 36px; padding: 6px 12px; }

  /* ── iOS input zoom prevention (font-size < 16px triggers zoom) ── */
  input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
  select,
  textarea {
    font-size: 16px !important;
  }

  /* ── Form row stacking (label + input side-by-side → vertical) ── */
  .form-row {
    flex-direction: column !important;
    align-items: flex-start !important;
  }
  .form-row label {
    margin-bottom: 4px;
    margin-right: 0 !important;
    width: 100% !important;
  }
  .form-row input,
  .form-row select,
  .form-row textarea {
    width: 100% !important;
    max-width: 100% !important;
  }

  /* ── Modal form grids (2-col form grids inside modals → 1 col) ── */
  .modal .form-grid,
  .modal [style*="grid-template-columns"] {
    grid-template-columns: 1fr !important;
  }
```

- [ ] **Step 2: Verify touch targets and forms on mobile**

1. Resize to 390px
2. Open any modal with a form (e.g. Add Lead, Add NCR) — form fields stack vertically, labels above inputs
3. Tap an input — iOS (or DevTools simulation) does NOT zoom in
4. Nav items in drawer are finger-sized (≥44px height)
5. Buttons in tables remain usable

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "Add mobile touch targets, form stacking, iOS zoom prevention"
```

---

### Task 8: Full browser verification pass

**Files:** None — verification only

- [ ] **Step 1: Test at iPhone 14 size (390×844)**

Open `http://localhost:5173` in browser with DevTools → Responsive → 390×844. Walk through:

| Page | Check |
|---|---|
| Login | Form usable, button tappable |
| Project select | Cards readable, select button works |
| Dashboard | Stats 2-col grid, no overflow |
| Drawing Register | Table scrolls horizontally |
| Submittals | Table scrolls horizontally |
| NCRs | Table scrolls, modal full-screen |
| RFIs | Table scrolls, modal full-screen |
| Inspection Requests | Table scrolls |
| Transmittals | Table scrolls |
| Finance Overview | Cards single-column |
| Payment Certificates | Table scrolls, IPC modal full-screen |
| CRM Home | KPI 2-col, main+sidebar stacked, week bar fits |
| Leads | Table scrolls, lead modal full-screen |
| User Management | Table scrolls |

- [ ] **Step 2: Test at iPhone SE size (375×667)**

Switch DevTools to 375×667. Repeat spot-check on: Dashboard, CRM Home, Leads modal, Drawing Register table.

- [ ] **Step 3: Verify desktop unchanged**

Switch DevTools back to full desktop width (1440px). Confirm:
- Sidebar is visible (not hidden, no hamburger visible)
- All grids show original column counts
- Modals open as centered overlays (not full-screen)
- No layout regressions

- [ ] **Step 4: Final commit + push**

```bash
git add index.html
git commit -m "Mobile optimization complete — responsive CSS layer, hamburger drawer, table scroll, full-screen modals"
git push
```
