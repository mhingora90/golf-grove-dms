#!/usr/bin/env node
/**
 * Example: per-role Playwright test using shared helpers.
 *
 * Demonstrates:
 *   - loginAs(page, role)       — sign in with a persistent test account
 *   - createDrawing(toDelete)   — seed a test drawing via service role
 *   - cleanup(toDelete)         — delete everything seeded during the test
 *
 * Run: node tests/example-role-test.js
 */

const { chromium } = require('playwright');
const { loginAs }  = require('./helpers/auth');
const { createDrawing, cleanup } = require('./helpers/seed');
const { ROLES, LOCAL_URL } = require('./config');

const results  = [];
const toDelete = {};

function pass(name) { results.push({ name, ok: true  }); console.log(`  ✓  PASS  ${name}`); }
function fail(name, err) {
  const msg = err?.message || String(err);
  results.push({ name, ok: false, msg });
  console.error(`  ✗  FAIL  ${name}  →  ${msg}`);
}
function section(t) { console.log(`\n${'═'.repeat(60)}\n  ${t}\n${'─'.repeat(60)}`); }

(async () => {
  const browser = await chromium.launch({ headless: true });

  // Seed one shared drawing that all roles will see
  const drawId = await createDrawing(toDelete, { title: 'Role Visibility Test Drawing' });
  console.log(`\n  Seeded drawing: ${drawId}`);

  try {
    for (const role of ROLES) {
      section(`Role: ${role}`);
      const page = await browser.newPage();

      try {
        await loginAs(page, role, LOCAL_URL);
        pass(`${role} — login succeeds`);

        await page.click('text=Drawing Register');
        // Wait for at least one row or the empty-state element, up to 10s
        await page.waitForFunction(
          () => document.querySelectorAll('tr.draw-row').length > 0 ||
                document.querySelector('.empty-state') !== null,
          { timeout: 10000 }
        ).catch(() => {});

        const rows = await page.locator('tr.draw-row').count();
        pass(`${role} — Drawing Register renders (${rows} rows visible)`);

        // Confirm the seeded drawing appears
        const hasSeeded = await page.locator('tr.draw-row', { hasText: 'Role Visibility Test Drawing' }).count();
        if (hasSeeded > 0) pass(`${role} — seeded drawing visible`);
        else               fail(`${role} — seeded drawing NOT visible`);

      } catch (err) {
        fail(`${role} — unexpected error`, err);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
    await cleanup(toDelete);
    console.log('\n  Cleanup complete.\n');
  }

  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log('─'.repeat(60));
  console.log(`  RESULTS: ${passed} PASS | ${failed} FAIL`);
  console.log('─'.repeat(60));
  if (failed) process.exit(1);
})();
