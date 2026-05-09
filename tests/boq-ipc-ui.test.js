#!/usr/bin/env node
/**
 * BOQ Setup & Payment Certificates — UI Tests
 * Golf Grove DMS — Part B (Playwright)
 *
 * Tests the actual UI from a logged-in session:
 *   - BOQ page loads with data, bill headers, item counts
 *   - Import Excel, Edit, Replace BOQ, + New button visibility
 *   - Edit mode toggle (inputs appear, Save/Cancel, exits cleanly)
 *   - IPC page loads with module stats, + New, View buttons
 *   - IPC detail view with BOQ items and financial summary
 *   - Hash persistence, sidebar navigation
 *
 * Requires:
 *   - Dev server running on localhost:3000
 *   - Logged in as developer role (contractor can't access manage BOQ)
 *
 * Run:
 *   npx playwright test tests/boq-ipc-ui.test.js --reporter=list
 */

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:3000';
const EMAIL = 'mohammed@regent-developments.com';
const PASSWORD = 'Mman1990';

async function login(page) {
  await page.goto(BASE);
  // Wait for either the login form or the dashboard (if already logged in)
  await page.waitForTimeout(1000);
  const isLoginPage = await page.getByPlaceholder('Email').isVisible().catch(() => false);
  if (isLoginPage) {
    await page.getByPlaceholder('Email').fill(EMAIL);
    await page.getByPlaceholder('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign In' }).click();
    // Wait for the dashboard to appear
    await page.waitForTimeout(3000);
  }
  // Verify we're on a page (either dashboard or already logged in)
  await page.waitForTimeout(500);
}

async function navTo(page, hash) {
  await page.evaluate((h) => {
    window.location.hash = h;
    // Also call loadApp() to force re-render
    if (typeof loadApp === 'function') loadApp();
  }, hash);
  // Wait for the loading spinner to disappear and actual content to appear
  await page.waitForFunction(() => {
    const content = document.getElementById('content');
    return content && !content.textContent?.includes('Loading...');
  }, { timeout: 10000 });
}

async function btnExists(page, name) {
  try { return await page.getByRole('button', { name }).isVisible(); }
  catch(e) { return false; }
}

async function countEls(page, sel) { return await page.locator(sel).count().catch(() => 0); }

// ═══════════════════════════════════════════════════════════════════════════
// BOQ SETUP — UI Tests
// ═══════════════════════════════════════════════════════════════════════════

test.describe('BOQ Setup — UI', () => {

  test('page loads with BOQ data', async ({ page }) => {
    await login(page);
    await navTo(page, 'boq');
    const text = await page.locator('#content').textContent();
    expect(text.length).toBeGreaterThan(500);
    expect(text.toLowerCase()).toMatch(/bill|item|description|aED|total|contract sum/i);
  });

  test('Import Excel button visible', async ({ page }) => {
    await login(page);
    await navTo(page, 'boq');
    expect(await btnExists(page, 'Import Excel')).toBeTruthy();
  });

  test('Edit button visible', async ({ page }) => {
    await login(page);
    await navTo(page, 'boq');
    expect(await btnExists(page, 'Edit')).toBeTruthy();
  });

  test('Replace BOQ button visible', async ({ page }) => {
    await login(page);
    await navTo(page, 'boq');
    expect(await btnExists(page, 'Replace BOQ')).toBeTruthy();
  });

  test('+ New button visible', async ({ page }) => {
    await login(page);
    await navTo(page, 'boq');
    expect(await btnExists(page, '+ New')).toBeTruthy();
  });

  test('stat bar shows bill and item counts', async ({ page }) => {
    await login(page);
    await navTo(page, 'boq');
    const text = await page.locator('#content').textContent();
    expect(text).toMatch(/\d+\s*bills/i);
    expect(text).toMatch(/\d+\s*items/i);
  });

  test('CONTRACT SUM displayed', async ({ page }) => {
    await login(page);
    await navTo(page, 'boq');
    const text = await page.locator('#content').textContent();
    expect(text).toMatch(/CONTRACT\s*SUM/i);
  });

  test('edit mode toggles correctly', async ({ page }) => {
    await login(page);
    await navTo(page, 'boq');

    // Enter edit mode
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.waitForTimeout(1500);

    const inputs = await countEls(page, 'input.boq-edit');
    expect(inputs).toBeGreaterThan(0);

    // Save and Cancel visible
    expect(await btnExists(page, 'Save Changes')).toBeTruthy();
    expect(await btnExists(page, 'Cancel')).toBeTruthy();

    // Cancel exits edit mode
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.waitForTimeout(1000);

    const inputsAfter = await countEls(page, 'input.boq-edit');
    expect(inputsAfter).toBe(0);

    // Edit button reappears
    expect(await btnExists(page, 'Edit')).toBeTruthy();
  });

  test('BOQ table has bill headers', async ({ page }) => {
    await login(page);
    await navTo(page, 'boq');
    const text = await page.locator('#content').textContent();
    expect(text).toMatch(/site works|sub-structure|block work/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENT CERTIFICATES — UI Tests
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Payment Certificates — UI', () => {

  test('IPC page loads with module stats', async ({ page }) => {
    await login(page);
    await navTo(page, 'ipc');
    const text = await page.locator('#content').textContent();
    expect(text.toLowerCase()).toMatch(/payment|certif|ipc|total|status/i);
    const stats = await countEls(page, '.module-stat');
    expect(stats).toBeGreaterThanOrEqual(3);
  });

  test('+ New button visible', async ({ page }) => {
    await login(page);
    await navTo(page, 'ipc');
    expect(await btnExists(page, '+ New')).toBeTruthy();
  });

  test('View buttons exist for each IPC', async ({ page }) => {
    await login(page);
    await navTo(page, 'ipc');
    const viewBtns = await countEls(page, 'button:has-text("View")');
    const text = await page.locator('#content').textContent();
    if (!text.includes('No payment certificates')) {
      expect(viewBtns).toBeGreaterThanOrEqual(1);
    }
  });

  test('status badges render', async ({ page }) => {
    await login(page);
    await navTo(page, 'ipc');
    const text = await page.locator('#content').textContent();
    expect(text.toLowerCase()).toMatch(/draft|submitted|under review|certified|paid|no payment/i);
  });

  test('IPC detail view shows BOQ items', async ({ page }) => {
    await login(page);
    await navTo(page, 'ipc');

    // Open first IPC if available
    const viewBtns = await countEls(page, 'button:has-text("View")');
    if (viewBtns > 0) {
      await page.locator('button:has-text("View")').first().click();
      await page.waitForTimeout(2000);

      const content = await page.locator('#content').textContent();
      expect(content.length).toBeGreaterThan(200);
      expect(content.toLowerCase()).toMatch(/bill|item|claimed|certified|percentage/i);
    }
  });

  test('IPC detail shows financial summary', async ({ page }) => {
    await login(page);
    await navTo(page, 'ipc');
    const viewBtns = await countEls(page, 'button:has-text("View")');
    if (viewBtns > 0) {
      await page.locator('button:has-text("View")').first().click();
      await page.waitForTimeout(2000);

      const content = await page.locator('#content').textContent();
      expect(content.toLowerCase()).toMatch(/gross|retention|VAT|net|certified|previously/i);
    }
  });

  test('action buttons appear based on IPC status', async ({ page }) => {
    await login(page);
    await navTo(page, 'ipc');
    const viewBtns = await countEls(page, 'button:has-text("View")');
    if (viewBtns > 0) {
      await page.locator('button:has-text("View")').first().click();
      await page.waitForTimeout(2000);

      const content = await page.locator('#content').textContent();
      const actions = ['Submit', 'Retract', 'Begin Review', 'Save', 'Certify', 'Record Payment'];
      const hasAny = actions.some(a => content.toLowerCase().includes(a.toLowerCase()));
      expect(hasAny).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// NAVIGATION & PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Navigation & Persistence', () => {

  test('sidebar shows BOQ Setup', async ({ page }) => {
    await login(page);
    // The sidebar uses a custom layout, not semantic HTML
    const pageText = await page.locator('body').textContent();
    expect(pageText.toLowerCase()).toContain('boq setup');
  });

  test('sidebar shows Payment Certificates', async ({ page }) => {
    await login(page);
    const pageText = await page.locator('body').textContent();
    expect(pageText.toLowerCase()).toContain('payment certificates');
  });

  test('hash persists on reload', async ({ page }) => {
    await login(page);
    await navTo(page, 'boq');
    expect(page.url()).toContain('#boq');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('#boq');
  });

  test('navigation boq → ipc works', async ({ page }) => {
    await login(page);
    await navTo(page, 'boq');
    await navTo(page, 'ipc');
    expect(page.url()).toContain('#ipc');
  });

  test('navigation ipc → boq works', async ({ page }) => {
    await login(page);
    await navTo(page, 'ipc');
    await navTo(page, 'boq');
    expect(page.url()).toContain('#boq');
  });

  test('dashboard shows payment certs stat card', async ({ page }) => {
    await login(page);
    await page.waitForTimeout(1500);
    const text = await page.locator('#content').textContent();
    expect(text).toMatch(/payment certs/i);
  });
});
