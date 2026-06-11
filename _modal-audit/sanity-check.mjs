// Sanity check: feed a known-overlapping modal HTML into the probe; expect fail.
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const css = readFileSync(resolve('styles.css'), 'utf8');

// Hand-crafted: two buttons absolutely positioned to overlap.
const html = `<!DOCTYPE html><html><head><style>${css}</style>
<style>body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;background:#efece6;margin:0}
.modal-bg{position:fixed;inset:0;display:flex;align-items:flex-start;justify-content:center;padding:24px;overflow:auto}</style></head>
<body>
<div class="modal-bg open" id="modal-bg">
  <div class="modal" id="modal">
    <div class="modal-header"><div class="modal-title" id="modal-title">overlap test</div></div>
    <div class="modal-body" id="modal-body">
      <div style="position:relative;height:100px">
        <button style="position:absolute;left:10px;top:10px;width:200px;height:40px">A</button>
        <button style="position:absolute;left:100px;top:20px;width:200px;height:40px">B</button>
      </div>
    </div>
    <div class="modal-footer" id="modal-footer"></div>
  </div>
</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 768, height: 1024 });
await page.setContent(html);
await page.waitForTimeout(100);

const probe = await page.evaluate(() => {
  const body = document.getElementById('modal-body');
  const els = Array.from(body.querySelectorAll('input, select, textarea, button, a.btn, .form-control, .form-input'));
  const items = els.map(el => {
    const r = el.getBoundingClientRect();
    return { id: el.textContent.trim(), rect: { l: r.left, r: r.right, t: r.top, b: r.bottom } };
  });
  const TOL = 1;
  const inter = (a, b) => !(a.r <= b.l + TOL || b.r <= a.l + TOL || a.b <= b.t + TOL || b.b <= a.t + TOL);
  const cols = [];
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++)
      if (inter(items[i].rect, items[j].rect)) cols.push([items[i].id, items[j].id]);
  return { nElements: items.length, collisions: cols };
});

console.log(JSON.stringify(probe, null, 2));
console.log(probe.collisions.length > 0 ? 'SANITY OK — probe detects overlap' : 'SANITY FAIL — probe missed overlap');
await browser.close();
