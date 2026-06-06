/**
 * Customer journey golden path — Playwright E2E.
 *
 * Run: npx playwright test tests/customers/e2e.spec.js
 *
 * Logs in as the persistent developer account (sales role does not have a
 * persistent test account; developer has full access). Creates a customer,
 * opens the profile, logs an activity, asserts it appears in the feed.
 *
 * Cleanup runs against Supabase via the service key so a failed assertion
 * does not leak rows.
 */

const { test, expect } = require('@playwright/test');
const { createClient } = require('@supabase/supabase-js');
const { loginDev } = require('../helpers/auth');
const { SUPABASE_URL, SERVICE_KEY } = require('../config');

const UNIQ = Date.now().toString(36);
const NAME = `E2E Buyer ${UNIQ}`;
const NOTE = `First contact ${UNIQ}`;

test('customer journey golden path', async ({ page }) => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let createdCustomerId = null;

  try {
    await loginDev(page);

    await page.click('#n-customers');
    await page.waitForSelector('text=+ New Customer', { timeout: 5000 });

    await page.click('text=+ New Customer');
    await page.waitForSelector('#cust-new-name', { timeout: 5000 });
    await page.fill('#cust-new-name', NAME);
    await page.fill('#cust-new-phone', '+971500000000');
    await page.click('text=Create');

    const row = page.locator(`text=${NAME}`).first();
    await expect(row).toBeVisible({ timeout: 5000 });

    await row.click();
    await page.waitForSelector('#act-method', { timeout: 5000 });
    await page.selectOption('#act-method', 'call');
    await page.fill('#act-body', NOTE);
    await page.click('button.btn.btn-primary:has-text("Add")');

    await expect(page.locator(`text=${NOTE}`)).toBeVisible({ timeout: 5000 });

    const { data } = await admin.from('customers').select('id').eq('name', NAME).maybeSingle();
    createdCustomerId = data?.id || null;
  } finally {
    if (createdCustomerId) {
      await admin.from('crm_lead_activities').delete().eq('customer_id', createdCustomerId);
      await admin.from('customers').delete().eq('id', createdCustomerId);
    } else {
      await admin.from('customers').delete().eq('name', NAME);
    }
  }
});
