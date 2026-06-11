#!/usr/bin/env node
/**
 * iPad Viewport Audit
 * Golf Grove DMS — Playwright UI test
 *
 * Catches "screen gets cut off / cannot scroll to bottom" issues on iPad.
 *
 * What this catches (headless Chromium):
 *   - Content taller than viewport with no scrollable ancestor
 *   - Last child of .content not reachable by scrollTo(bottom)
 *   - Fixed/sticky elements overlapping last row of .content
 *   - Modal body that should scroll but doesn't (max-height/overflow misconfigured)
 *   - Static usage of 100vh in CSS (flagged for manual review — Safari URL-bar bug)
 *
 * What this does NOT catch (needs real Safari — see ipad-safari-checklist.md):
 *   - iOS 100vh URL-bar collapse bug
 *   - Momentum-scroll missing on overflow:auto containers
 *   - Form input zoom (font-size<16px) hijacking viewport
 *   - On-screen keyboard hiding form submit buttons
 *
 * Run:
 *   APP_URL=http://localhost:3000 npx playwright test tests/ipad-viewport-audit.test.js --reporter=list
 *   (or default to deployed)
 */

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE = process.env.APP_URL || 'https://golf-grove-dms.vercel.app';
const EMAIL = 'mohammed@regent-developments.com';
const PASSWORD = 'Mman1990';

const VIEWPORTS = {
  'ipad-portrait':  { width: 768,  height: 1024 },
  'ipad-landscape': { width: 1024, height: 768  },
  'ipad-pro-portrait': { width: 1024, height: 1366 },
};

const ROUTES = [
  'dash','draw','sub','sreg','ir','ncr','rfi','trans','corr','punch','ms',
  'finance','ipc','boq','crm','crm-home','crm-notifications','customers',
  'usetup','ureg','srev','reports','subs','users',
];

const OUT_DIR = path.join(__dirname, '..', 'ipad-audit-out');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
const REPORT_PATH = path.join(OUT_DIR, 'report.json');
let REPORT = { generated: new Date().toISOString(), base: BASE, results: [] };

function saveReport() { fs.writeFileSync(REPORT_PATH, JSON.stringify(REPORT, null, 2)); }

async function login(page) {
  await page.goto(BASE);
  await page.waitForTimeout(1000);
  const visible = await page.locator('#login-email').isVisible().catch(() => false);
  if (visible) {
    await page.fill('#login-email', EMAIL);
    await page.fill('#login-password', PASSWORD);
    await page.click('#login-btn');
    await page.waitForSelector('#app-screen', { state: 'visible', timeout: 15000 });
  }
  await page.waitForTimeout(500);
}

async function pickFirstProject(page) {
  const onProjects = await page.locator('#project-screen').isVisible().catch(() => false);
  if (!onProjects) return;
  const firstCard = page.locator('.proj-card, [data-project-id], .project-card').first();
  if (await firstCard.isVisible().catch(() => false)) {
    await firstCard.click();
    await page.waitForSelector('#app-screen', { state: 'visible', timeout: 10000 });
  }
}

async function navTo(page, hash) {
  await page.evaluate((h) => { location.hash = h; if (typeof render === 'function') render(true); }, hash);
  await page.waitForFunction(
    () => {
      const c = document.getElementById('content');
      return c && !c.textContent?.includes('Loading...');
    },
    { timeout: 8000 },
  ).catch(() => {});
  await page.waitForTimeout(400);
}

async function probePage(page, route, viewportName) {
  return await page.evaluate(({ route, viewportName }) => {
    const issues = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const content = document.getElementById('content');
    const sidebar = document.querySelector('.sidebar');
    const topbar = document.querySelector('.topbar');

    if (!content) {
      issues.push({ severity: 'error', kind: 'no-content', msg: '#content not found' });
      return { route, viewportName, vw, vh, issues };
    }

    // Topbar reachable
    if (topbar) {
      const tb = topbar.getBoundingClientRect();
      if (tb.top < 0 || tb.bottom > vh) {
        issues.push({ severity: 'warn', kind: 'topbar-clipped', rect: { top: tb.top, bottom: tb.bottom } });
      }
    }

    // Can content scroll to its bottom?
    const cRect = content.getBoundingClientRect();
    const scrollableContent = content.scrollHeight > content.clientHeight + 1;
    if (scrollableContent) {
      content.scrollTop = content.scrollHeight;
      const atBottom = Math.abs(content.scrollHeight - content.clientHeight - content.scrollTop) < 2;
      if (!atBottom) {
        issues.push({
          severity: 'error',
          kind: 'content-scroll-stuck',
          scrollHeight: content.scrollHeight,
          clientHeight: content.clientHeight,
          scrollTop: content.scrollTop,
        });
      }
      // Last child should now be within viewport
      const last = content.lastElementChild;
      if (last) {
        const lr = last.getBoundingClientRect();
        if (lr.bottom > vh + 2 || lr.top > vh) {
          issues.push({
            severity: 'error',
            kind: 'last-child-not-visible-after-scroll',
            childRect: { top: lr.top, bottom: lr.bottom, height: lr.height },
            tag: last.tagName,
            cls: last.className,
          });
        }
      }
      content.scrollTop = 0;
    } else {
      // Not scrollable, but does content overflow viewport anyway?
      if (cRect.bottom > vh + 2) {
        issues.push({
          severity: 'error',
          kind: 'content-overflows-no-scroll',
          rect: { top: cRect.top, bottom: cRect.bottom },
          contentScrollHeight: content.scrollHeight,
          viewport: vh,
        });
      }
    }

    // Fixed/sticky footers overlapping content bottom?
    const fixedEls = Array.from(document.querySelectorAll('body *')).filter((el) => {
      const cs = getComputedStyle(el);
      return (cs.position === 'fixed' || cs.position === 'sticky') && cs.display !== 'none' && cs.visibility !== 'hidden';
    });
    for (const el of fixedEls) {
      if (el === sidebar || sidebar?.contains(el) || topbar?.contains(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.height === 0 || r.width === 0) continue;
      // Bottom-anchored element covering last 80px of viewport
      if (r.top > vh * 0.7 && r.bottom >= vh - 4 && r.width > vw * 0.4) {
        issues.push({
          severity: 'warn',
          kind: 'fixed-footer-overlay',
          rect: { top: r.top, bottom: r.bottom, height: r.height },
          tag: el.tagName,
          cls: (el.className || '').toString().slice(0, 80),
        });
      }
    }

    return { route, viewportName, vw, vh, scrollableContent, issues };
  }, { route, viewportName });
}

async function probeModal(page, route, viewportName, modalLabel) {
  return await page.evaluate(({ route, viewportName, modalLabel }) => {
    const issues = [];
    const vh = window.innerHeight;
    const modals = Array.from(document.querySelectorAll('.modal-bg.open .modal'));
    if (!modals.length) {
      return { route, viewportName, modalLabel, issues: [{ severity: 'info', kind: 'no-modal-open' }] };
    }
    for (const m of modals) {
      const mr = m.getBoundingClientRect();
      if (mr.bottom > vh + 2 || mr.top < 0) {
        issues.push({ severity: 'warn', kind: 'modal-overflows-viewport', rect: { top: mr.top, bottom: mr.bottom } });
      }
      const body = m.querySelector('.modal-body');
      if (body) {
        const bScrollable = body.scrollHeight > body.clientHeight + 1;
        if (bScrollable) {
          body.scrollTop = body.scrollHeight;
          const stuck = Math.abs(body.scrollHeight - body.clientHeight - body.scrollTop) > 2;
          if (stuck) issues.push({ severity: 'error', kind: 'modal-body-scroll-stuck' });
          body.scrollTop = 0;
        } else if (body.getBoundingClientRect().bottom > vh + 2) {
          issues.push({ severity: 'error', kind: 'modal-body-overflow-no-scroll' });
        }
      }
      const footer = m.querySelector('.modal-footer');
      if (footer) {
        const fr = footer.getBoundingClientRect();
        if (fr.bottom > vh + 2 || fr.top > vh) {
          issues.push({ severity: 'error', kind: 'modal-footer-hidden', rect: { top: fr.top, bottom: fr.bottom } });
        }
      }
    }
    return { route, viewportName, modalLabel, issues };
  }, { route, viewportName, modalLabel });
}

async function tryOpenNew(page) {
  const btn = page.locator('#new-btn');
  if (!(await btn.isVisible().catch(() => false))) return false;
  await btn.click().catch(() => {});
  await page.waitForTimeout(500);
  return await page.locator('.modal-bg.open').isVisible().catch(() => false);
}

async function closeAnyModal(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.modal-bg.open').forEach((m) => m.classList.remove('open'));
  });
}

async function runRouteTest(page, vpName, vp, route) {
  await page.setViewportSize(vp);
  await login(page);
  await pickFirstProject(page);
  await navTo(page, route);
  const result = await probePage(page, route, vpName);
  const modalOpened = await tryOpenNew(page).catch(() => false);
  if (modalOpened) {
    const m = await probeModal(page, route, vpName, '+ New');
    result.modal = m;
    await closeAnyModal(page);
  }
  const shotPath = path.join(OUT_DIR, `${vpName}__${route}.png`);
  await page.screenshot({ path: shotPath, fullPage: true }).catch(() => {});
  result.screenshot = path.basename(shotPath);
  REPORT.results.push(result);
  saveReport();

  const errors = (result.issues || []).filter((i) => i.severity === 'error');
  const modalErrors = ((result.modal && result.modal.issues) || []).filter((i) => i.severity === 'error');
  if (errors.length || modalErrors.length) {
    console.log(`FAIL ${vpName} ${route}:`, JSON.stringify({ errors, modalErrors }, null, 2));
  }
  expect(errors).toEqual([]);
  expect(modalErrors).toEqual([]);
}

test.describe('iPad portrait (768x1024)', () => {
  const vp = VIEWPORTS['ipad-portrait'];
  for (const route of ROUTES) {
    test(`route ${route}`, async ({ page }) => { await runRouteTest(page, 'ipad-portrait', vp, route); });
  }
});

test.describe('iPad landscape (1024x768)', () => {
  const vp = VIEWPORTS['ipad-landscape'];
  for (const route of ROUTES) {
    test(`route ${route}`, async ({ page }) => { await runRouteTest(page, 'ipad-landscape', vp, route); });
  }
});

test.describe('iPad Pro portrait (1024x1366)', () => {
  const vp = VIEWPORTS['ipad-pro-portrait'];
  for (const route of ROUTES) {
    test(`route ${route}`, async ({ page }) => { await runRouteTest(page, 'ipad-pro-portrait', vp, route); });
  }
});

test.describe('static CSS audit', () => {
  test('flag 100vh usage outside @media', async () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
    const lines = css.split(/\r?\n/);
    const flags = [];
    let depth = 0;
    let inMedia = false;
    let mediaDepth = 0;
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      if (/@media/.test(ln)) { inMedia = true; mediaDepth = depth; }
      const opens = (ln.match(/\{/g) || []).length;
      const closes = (ln.match(/\}/g) || []).length;
      depth += opens - closes;
      if (inMedia && depth <= mediaDepth) inMedia = false;
      if (/\b100vh\b/.test(ln) && !inMedia) {
        flags.push({ line: i + 1, text: ln.trim() });
      }
    }
    REPORT.cssAudit = { '100vh_outside_media': flags };
    saveReport();
    if (flags.length) {
      console.log('100vh outside @media (consider 100dvh for iOS Safari):');
      flags.forEach((f) => console.log(`  styles.css:${f.line}: ${f.text}`));
    }
    // Not a failure — informational. Comment out next line to enforce.
    // expect(flags).toEqual([]);
  });
});
