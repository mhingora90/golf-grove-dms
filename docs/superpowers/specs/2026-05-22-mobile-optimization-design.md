# Mobile Optimization — Design Spec
**Date:** 2026-05-22  
**Status:** Approved for implementation

## Overview

Make the entire Golf Grove DMS SPA usable on mobile phones. Approach: additive CSS-only responsive layer at a single `@media (max-width: 768px)` breakpoint. Desktop layout is completely unchanged. ~10 lines of JS added for the hamburger drawer toggle. No new design language — same light theme, CSS variables, fonts.

## Current State

- No `@media` queries exist anywhere in the app
- Sidebar: fixed `220px` width, never collapses
- `.app`: `display:flex; height:100vh` — sidebar + main side-by-side
- No touch target sizing, no horizontal scroll on tables, modals sized for desktop
- Viewport meta tag already present: `<meta name="viewport" content="width=device-width, initial-scale=1.0">`

## Breakpoint

Single breakpoint: `max-width: 768px`. Covers all phone sizes (320–430px) and small tablets in portrait.

---

## Section 1 — Navigation / Sidebar

**Behaviour on mobile:**
- Sidebar hidden by default (`transform: translateX(-220px)` + `transition`)
- Topbar gets a `☰` hamburger button (top-left, 44×44px tap target)
- Tapping ☰ adds class `.nav-open` to `.app` → sidebar slides in as full-height overlay (z-index above content)
- Dark semi-transparent backdrop behind sidebar; tapping backdrop closes drawer
- `✕` close button inside sidebar top
- Current page title always visible in topbar (already rendered there)

**JS required (~10 lines):**
```javascript
function toggleMobileNav() {
  document.querySelector('.app').classList.toggle('nav-open');
}
function closeMobileNav() {
  document.querySelector('.app').classList.remove('nav-open');
}
// Close on backdrop click (backdrop is a pseudo-element or added div)
```

**HTML change:** Add `<button class="hamburger-btn" onclick="toggleMobileNav()">☰</button>` to the topbar.

**Auto-close:** Call `closeMobileNav()` inside the existing `nav()` function so the drawer closes whenever a page is navigated to.

---

## Section 2 — Layout Reflow

All grid and flex layouts collapse to single or 2-column on mobile.

| Element | Desktop | Mobile |
|---|---|---|
| Dashboard stats grid | `repeat(4, 1fr)` or similar | `repeat(2, 1fr)` |
| CRM KPI tiles row | 5 across | `repeat(2, 1fr)` wrap, last centered |
| CRM Home 2-col layout (main + sidebar) | side-by-side | single column, stacked |
| Finance overview cards | multi-column | `1fr` |
| Any `display:grid` with fixed column count | as-is | `repeat(2, 1fr)` or `1fr` |

Topbar project switcher and role badge: reduce padding, allow text truncation.

---

## Section 3 — Tables

All data tables get horizontal scrolling on mobile. No columns are hidden — users can scroll to see all data.

```css
@media (max-width: 768px) {
  .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  table { min-width: 520px; }
  th, td { white-space: nowrap; padding: 8px 10px; }
}
```

Where a `.table-wrap` container doesn't already exist, it will be added to the HTML as a wrapper `<div class="table-wrap">` around each `<table>`.

---

## Section 4 — Modals

All modals go full-screen on mobile.

```css
@media (max-width: 768px) {
  .modal-overlay { align-items: flex-start; }
  .modal-box {
    width: 100% !important;
    max-width: 100% !important;
    height: 100dvh;
    border-radius: 0;
    margin: 0;
    overflow-y: auto;
  }
  .modal-box .modal-close { top: 12px; right: 12px; }
}
```

Modal header stays fixed at top; body scrolls. Close button remains top-right.

---

## Section 5 — Touch Targets and Forms

**Touch targets (44px minimum):**
```css
@media (max-width: 768px) {
  nav a, .nav-item, button, .btn { min-height: 44px; }
  .sidebar .nav-item { padding: 12px 16px; }
}
```

**iOS zoom prevention** (font-size < 16px on inputs triggers auto-zoom):
```css
@media (max-width: 768px) {
  input, select, textarea { font-size: 16px !important; }
}
```

**Form row stacking** (label + input side-by-side → vertical):
```css
@media (max-width: 768px) {
  .form-row { flex-direction: column; }
  .form-row label { margin-bottom: 4px; }
  .form-row input, .form-row select { width: 100%; }
}
```

---

## Section 6 — Miscellaneous

- **Topbar:** Reduce font size/padding; project switcher truncates long names with ellipsis
- **Page content padding:** Reduce from `24px` to `12px` on mobile
- **Typography:** Section headings reduce ~2px; no body text changes
- **Punch list / badge counts:** Remain visible; no change needed
- **File upload inputs:** Already use `<input type="file">`; native mobile picker works

---

## Implementation Notes

- All changes go in a single `@media (max-width: 768px) { ... }` block appended to the existing `<style>` section in `index.html`
- Hamburger button and backdrop `<div>` added to the topbar HTML (near top of `.app` structure)
- `closeMobileNav()` call added inside existing `nav()` function
- `.table-wrap` divs added around each `<table>` where missing
- No new CSS files, no new dependencies
- Test at 390×844 (iPhone 14) and 375×667 (iPhone SE) viewport sizes

## Out of Scope

- Tablet landscape optimisation (future)
- Swipe gestures to open/close drawer
- Per-module native-style UX (date pickers, bottom sheets)
- Push notifications
- Offline/PWA support
