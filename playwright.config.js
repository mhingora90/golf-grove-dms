// Minimal Playwright config for Golf Grove DMS UI tests.
// Tests target the file:// URL by default (LOCAL_URL in tests/config.js),
// so no dev server is required. Pass APP_URL=https://... to point at a
// deployed environment.
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: ['**/*-e2e.test.js', '**/*-ui.test.js'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    actionTimeout: 10000,
    navigationTimeout: 15000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
