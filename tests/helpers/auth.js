/**
 * Playwright login helpers.
 *
 * loginAs(page, role)  — navigate to app, fill login form, wait for app screen
 * loginDev(page)       — shortcut: logs in with real developer account
 *
 * Uses persistent test accounts from tests/config.js.
 * The app URL can be overridden by passing it as the third argument.
 */

const { TEST_ACCOUNTS, TEST_PASSWORD, DEV_EMAIL, DEV_PASS, LOCAL_URL } = require('../config');

async function loginAs(page, role, appUrl = LOCAL_URL) {
  const email = TEST_ACCOUNTS[role];
  if (!email) throw new Error(`Unknown role: "${role}". Valid roles: ${Object.keys(TEST_ACCOUNTS).join(', ')}`);
  await _login(page, appUrl, email, TEST_PASSWORD);
}

async function loginDev(page, appUrl = LOCAL_URL) {
  await _login(page, appUrl, DEV_EMAIL, DEV_PASS);
}

async function _login(page, appUrl, email, password) {
  await page.goto(appUrl);
  await page.waitForSelector('#login-email', { timeout: 10000 });
  await page.fill('#login-email', email);
  await page.fill('#login-password', password);
  await page.click('#login-btn');
  await page.waitForSelector('#app-screen', { timeout: 15000 });
}

module.exports = { loginAs, loginDev };
