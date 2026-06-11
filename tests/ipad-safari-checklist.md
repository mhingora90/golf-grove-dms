# iPad Safari Manual Checklist

Headless Chromium ≠ Safari. Run these by hand on a real iPad (or Safari Responsive Design Mode → iPad Pro 11"/iPad mini) **after** the Playwright audit passes.

## Setup

1. Open `https://golf-grove-dms.vercel.app/` in Safari on iPad.
2. Test both portrait + landscape.
3. Test with Safari URL bar visible AND hidden (scroll up to collapse it — this is where `100vh` bugs surface).

## Checks

### Viewport / scroll

- [ ] On every module page, scroll to bottom of `.content` — last row fully visible above Safari toolbar.
- [ ] Tilt to landscape mid-session — layout doesn't break, sidebar still works.
- [ ] Collapse URL bar by scrolling — content does NOT get cut off at the bottom (this is the `100vh` URL-bar bug).
- [ ] On a long table page (Drawing Register, BOQ, Submittal Register), the last table row is reachable.
- [ ] Sidebar scrolls independently of main content (don't pull both at once).

### Modals

- [ ] Open `+ New` on each module — modal opens fully on screen, no clipping.
- [ ] Modal body scrolls with finger drag (not just trackpad).
- [ ] Modal footer (Cancel / Save buttons) always visible — never hidden under keyboard.
- [ ] Tap a text input → on-screen keyboard appears → Save button still tappable (scroll up if needed).
- [ ] Close modal with X — page scroll position restored.

### Forms

- [ ] Tap any text input — page does NOT zoom in (font-size must be ≥16px on inputs to prevent iOS auto-zoom).
- [ ] Tap a `<select>` — native picker opens, dismisses cleanly.
- [ ] Date inputs trigger native iOS date picker, not a broken HTML5 fallback.
- [ ] File upload buttons (Drawing Register, Submittals) trigger native file picker, allow camera/photo lib selection.

### Touch / momentum

- [ ] Scroll containers feel native — momentum scroll, no janky stop.
- [ ] Tap targets ≥44×44px (sidebar items, nav badges, action buttons).
- [ ] Long-press on a row doesn't trigger system context menu over app UI.
- [ ] Two-finger pinch on table doesn't break layout.

### Sidebar (collapsed)

- [ ] At <768px, sidebar collapses to drawer (hamburger). Collapse button hidden — drawer ignores `.collapsed`.
- [ ] At 1024px landscape, collapse button works, rail width is 56px, icons remain tappable.

### Performance smoke

- [ ] First Contentful Paint <2s on iPad over WiFi.
- [ ] Switching modules feels instant (cache warm).
- [ ] No console errors in Safari Web Inspector (connect iPad via USB → Mac Safari → Develop menu).

## Known iPad gotchas to grep for

- `100vh` in CSS → consider `100dvh` (dynamic viewport, accounts for URL bar). The Playwright audit already flags these.
- Inputs with `font-size: 14px` or lower → iOS auto-zooms. Use `≥16px` or `font-size: max(16px, 1rem)`.
- `overflow: auto` containers without inertia scrolling on older iOS — usually fine on iOS 16+.
- `position: fixed` elements with `bottom: 0` get covered by Safari toolbar when URL bar expands.

## Reporting bugs

When a check fails, capture:
1. Viewport size (Settings → Safari → Show Status Bar).
2. iOS version + Safari version.
3. URL bar state (visible / collapsed).
4. Screenshot.
5. Steps to reproduce.

File issue against this repo with `bug:ipad` label.
