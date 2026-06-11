// Synthetic modal layout probe: render each extracted modal in a blank doc
// with the real styles.css and the same modal scaffold from index.html.
// At each of 5 iPad viewport widths, get rects of every interactive element
// in the modal body, check (a) pairwise overlap, (b) overflow past the modal
// right edge, (c) overflow past the viewport. Screenshot any failure.

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';

const css = readFileSync(resolve('styles.css'), 'utf8');
const modals = JSON.parse(readFileSync(resolve('_modal-audit/modals/_index.json'), 'utf8'));

const OUT = resolve('_modal-audit/results');
mkdirSync(OUT, { recursive: true });

const WIDTHS = [768, 834, 1024, 1180, 1366];

function pageHtml(modal) {
  // Match the scaffold from index.html lines 252-261.
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>${css}</style>
<style>
  body { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; background:#efece6; margin:0 }
  /* Force modal-bg open for the test */
  .modal-bg { position:fixed; inset:0; display:flex; align-items:flex-start; justify-content:center; padding:24px; overflow:auto }
  .modal-bg.open { display:flex }
</style>
</head><body>
<div class="modal-bg open" id="modal-bg">
  <div class="modal ${modal.wide ? 'wide' : ''}" id="modal" role="dialog" aria-modal="true">
    <div class="modal-header">
      <div class="modal-title" id="modal-title">${escapeHtml(modal.title)}</div>
      <button class="modal-close" aria-label="Close">×</button>
    </div>
    <div class="modal-body" id="modal-body">${modal.body}</div>
    <div class="modal-footer" id="modal-footer">${modal.footer || ''}</div>
  </div>
</div>
</body></html>`;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

const results = [];

for (const modal of modals) {
  const html = pageHtml(modal);
  await page.setContent(html, { waitUntil: 'load' });

  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 1024 });
    // Let layout settle
    await page.waitForTimeout(80);

    const probe = await page.evaluate(() => {
      const modal = document.getElementById('modal');
      const body = document.getElementById('modal-body');
      if (!modal || !body) return { ok: false, error: 'scaffold missing' };
      const modalRect = modal.getBoundingClientRect();
      const vw = window.innerWidth;
      const els = Array.from(body.querySelectorAll('input, select, textarea, button, a.btn, .form-control, .form-input'));
      // Skip hidden / zero-size
      const visible = els.filter(el => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return false;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        return true;
      });
      const items = visible.map((el, i) => {
        const r = el.getBoundingClientRect();
        return {
          i,
          tag: el.tagName.toLowerCase(),
          type: (el.getAttribute('type') || '').toLowerCase(),
          id: el.id || '',
          cls: el.className || '',
          rect: { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) },
        };
      });

      function intersects(a, b) {
        // Allow 1px tolerance for sub-pixel anti-aliasing artifacts.
        const TOL = 1;
        return !(a.r <= b.l + TOL || b.r <= a.l + TOL || a.b <= b.t + TOL || b.b <= a.t + TOL);
      }

      const collisions = [];
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          if (intersects(items[i].rect, items[j].rect)) {
            collisions.push([items[i], items[j]]);
          }
        }
      }

      const modalOverflow = items.filter(it => it.rect.r > Math.round(modalRect.right) + 1);
      const vpOverflow = items.filter(it => it.rect.r > vw + 1);

      return {
        ok: true,
        modalRect: { l: Math.round(modalRect.left), r: Math.round(modalRect.right), w: Math.round(modalRect.width) },
        vw,
        nElements: items.length,
        collisions: collisions.map(([a, b]) => ({
          a: { tag: a.tag, type: a.type, id: a.id, rect: a.rect },
          b: { tag: b.tag, type: b.type, id: b.id, rect: b.rect },
        })),
        modalOverflow: modalOverflow.map(it => ({ tag: it.tag, type: it.type, id: it.id, rect: it.rect })),
        vpOverflow: vpOverflow.map(it => ({ tag: it.tag, type: it.type, id: it.id, rect: it.rect })),
      };
    });

    const fail = !probe.ok || probe.collisions.length > 0 || probe.modalOverflow.length > 0 || probe.vpOverflow.length > 0;
    if (fail) {
      const path = join(OUT, `${modal.key}__${w}.png`);
      await page.screenshot({ path, fullPage: false });
    }

    results.push({
      key: modal.key,
      module: modal.module,
      sourceLine: modal.sourceLine,
      title: modal.title,
      width: w,
      pass: !fail,
      nElements: probe.nElements,
      collisions: probe.collisions || [],
      modalOverflow: probe.modalOverflow || [],
      vpOverflow: probe.vpOverflow || [],
    });
  }
}

writeFileSync(join(OUT, 'report.json'), JSON.stringify(results, null, 2));

// Print table
const byModal = {};
for (const r of results) {
  byModal[r.key] = byModal[r.key] || { module: r.module, title: r.title, line: r.sourceLine, widths: {} };
  byModal[r.key].widths[r.width] = r.pass ? 'PASS' : `FAIL(c${r.collisions.length}/mo${r.modalOverflow.length}/vp${r.vpOverflow.length})`;
}

console.log('\n=== MODAL × WIDTH RESULTS ===');
console.log('module/line/title'.padEnd(50), WIDTHS.map(w => String(w).padStart(14)).join(''));
for (const key of Object.keys(byModal)) {
  const e = byModal[key];
  const label = `${e.module}:${e.line} ${e.title.slice(0, 30)}`.padEnd(50);
  console.log(label, WIDTHS.map(w => String(e.widths[w]).padStart(14)).join(''));
}

const failures = results.filter(r => !r.pass);
console.log(`\nTotal: ${results.length} probes (${modals.length} modals × ${WIDTHS.length} widths)`);
console.log(`Failures: ${failures.length}`);

// Group failures by modal
const failedModals = {};
for (const f of failures) {
  failedModals[f.key] = failedModals[f.key] || { module: f.module, line: f.sourceLine, title: f.title, widths: [], samples: [] };
  failedModals[f.key].widths.push(f.width);
  if (f.collisions.length && failedModals[f.key].samples.length < 2) {
    const c = f.collisions[0];
    failedModals[f.key].samples.push(`  ${f.width}px: ${c.a.tag}#${c.a.id || c.a.type} ⨯ ${c.b.tag}#${c.b.id || c.b.type}`);
  }
}
console.log('\n=== FAILED MODALS ===');
for (const k of Object.keys(failedModals)) {
  const m = failedModals[k];
  console.log(`${k} (${m.module}:${m.line}) widths=${m.widths.join(',')}`);
  m.samples.forEach(s => console.log(s));
}

await browser.close();
