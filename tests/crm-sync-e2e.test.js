/**
 * CRM Sync — End-to-end Playwright test for the Sync button UX.
 *
 * Loads the app via file:// as test.developer (CRM-enabled role), navigates
 * to #crm, intercepts /api/sync-meta-leads with canned responses, clicks
 * the Sync button, and asserts the toast text matches the expected pattern
 * for each scenario. The button-disabled state during request is verified
 * by inspecting the toast appearance + button text restoration.
 *
 * Intercepting means this test does NOT hit the production sheet or
 * production Supabase. It pins the contract between the frontend
 * `crmSyncMetaLeads()` and the API response shape so we catch any future
 * field-name drift (e.g. the dropped_collisions/skipped_existing rename
 * that broke the toast on 2026-06-10).
 *
 * Run:
 *   npx playwright test tests/crm-sync-e2e.test.js --reporter=list
 *
 * Requires: persistent test accounts set up (node tests/setup-test-accounts.js)
 */

const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

async function gotoCrm(page) {
  await page.evaluate(() => { window.location.hash = '#crm'; });
  // Sync button only renders inside the CRM module.
  await page.waitForSelector('#crm-sync-btn', { state: 'visible', timeout: 15000 });
}

/**
 * Fulfill a single POST to /api/sync-meta-leads with the given body and
 * status. Auto-removes itself after firing so a single click → single
 * intercept (no leakage between tests).
 */
async function interceptSync(page, body, status = 200) {
  await page.route('**/api/sync-meta-leads', async route => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
    await page.unroute('**/api/sync-meta-leads');
  });
}

async function readToast(page) {
  // Toast container — the app's toast() helper renders into a known node.
  // Look for any visible toast element.
  const toast = page.locator('.toast, #toast, [class*="toast" i]').last();
  await toast.waitFor({ state: 'visible', timeout: 5000 });
  return (await toast.textContent())?.trim() ?? '';
}

test.describe('CRM Sync button', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'developer');
    await gotoCrm(page);
  });

  test('happy path: new leads inserted, success toast', async ({ page }) => {
    await interceptSync(page, {
      status: 'ok',
      sheet_rows: 5,
      unique_leads: 5,
      dropped_collisions: 0,
      inserted: 3,
      skipped_existing: 2,
      errors: 0,
    });

    await page.click('#crm-sync-btn');
    const toast = await readToast(page);

    expect(toast).toMatch(/Synced\s+3\s+new\s+leads/i);
    expect(toast).toMatch(/2\s+already in CRM/i);
    expect(toast).not.toMatch(/error/i);

    // Button restored after request.
    await expect(page.locator('#crm-sync-btn')).toBeEnabled();
    await expect(page.locator('#crm-sync-btn')).toContainText('Sync');
  });

  test('up-to-date: no new leads, info toast', async ({ page }) => {
    await interceptSync(page, {
      status: 'ok',
      sheet_rows: 10,
      unique_leads: 10,
      dropped_collisions: 0,
      inserted: 0,
      skipped_existing: 10,
      errors: 0,
    });

    await page.click('#crm-sync-btn');
    const toast = await readToast(page);

    expect(toast).toMatch(/Up to date/i);
    expect(toast).toMatch(/10\s+already in CRM/i);
  });

  test('collision: dropped_collisions surfaced in toast', async ({ page }) => {
    await interceptSync(page, {
      status: 'ok',
      sheet_rows: 12,
      unique_leads: 10,
      dropped_collisions: 2,
      inserted: 1,
      skipped_existing: 9,
      errors: 0,
    });

    await page.click('#crm-sync-btn');
    const toast = await readToast(page);

    expect(toast).toMatch(/Synced\s+1\s+new\s+lead/i);
    expect(toast).toMatch(/skipped\s+2\s+sheet ID collisions/i);
  });

  test('partial errors: error toast with inserted count preserved', async ({ page }) => {
    await interceptSync(page, {
      status: 'ok',
      sheet_rows: 5,
      unique_leads: 5,
      dropped_collisions: 0,
      inserted: 2,
      skipped_existing: 1,
      errors: 2,
      errorDetails: [{ id: 'x', status: 500, body: 'oops' }],
    });

    await page.click('#crm-sync-btn');
    const toast = await readToast(page);

    expect(toast).toMatch(/Sync done with 2 error/i);
    expect(toast).toMatch(/2\s+new/i);
    expect(toast).toMatch(/1\s+existing/i);
  });

  test('server 500: failure toast', async ({ page }) => {
    await interceptSync(page, { error: 'missing SUPABASE_KEY' }, 500);

    await page.click('#crm-sync-btn');
    const toast = await readToast(page);

    expect(toast).toMatch(/Sync failed/i);
    expect(toast).toMatch(/missing SUPABASE_KEY/i);
  });

  test('button disables during request and re-enables after', async ({ page }) => {
    // Slow-stub: hold the response for 500 ms so we can observe the
    // disabled/Syncing state mid-flight.
    await page.route('**/api/sync-meta-leads', async route => {
      await new Promise(r => setTimeout(r, 500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok', sheet_rows: 0, unique_leads: 0, dropped_collisions: 0,
          inserted: 0, skipped_existing: 0, errors: 0,
        }),
      });
    });

    const clickPromise = page.click('#crm-sync-btn');

    // Mid-flight: button disabled + label changed.
    await page.waitForFunction(() => {
      const b = document.getElementById('crm-sync-btn');
      return b && b.disabled === true && /Syncing/i.test(b.textContent || '');
    }, null, { timeout: 3000 });

    await clickPromise;

    // Post-flight: button restored.
    await expect(page.locator('#crm-sync-btn')).toBeEnabled();
    await expect(page.locator('#crm-sync-btn')).toContainText('Sync');

    await page.unroute('**/api/sync-meta-leads');
  });

  test('sync request carries Authorization bearer token', async ({ page }) => {
    let capturedAuth = null;
    await page.route('**/api/sync-meta-leads', async route => {
      capturedAuth = route.request().headers()['authorization'] || null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok', sheet_rows: 0, unique_leads: 0, dropped_collisions: 0,
          inserted: 0, skipped_existing: 0, errors: 0,
        }),
      });
    });

    await page.click('#crm-sync-btn');
    await page.waitForFunction(() => {
      const b = document.getElementById('crm-sync-btn');
      return b && b.disabled === false;
    }, null, { timeout: 5000 });

    expect(capturedAuth).toMatch(/^Bearer\s+\S+/);

    await page.unroute('**/api/sync-meta-leads');
  });
});
