/**
 * Shared test configuration for Golf Grove DMS.
 *
 * Persistent test accounts are created once by running:
 *   node tests/setup-test-accounts.js
 *
 * After that, every test file imports this config instead of hardcoding credentials.
 */

const path = require('path');

module.exports = {
  SUPABASE_URL : 'https://kdxvhrwnnehicgdryowu.supabase.co',
  ANON_KEY     : 'sb_publishable_EASrK2EfbUZ5Jz1VBNw8Kw_nqq18szU',
  SERVICE_KEY  : process.env.SUPABASE_SERVICE_KEY || (() => { throw new Error('Set SUPABASE_SERVICE_KEY env var (new sb_secret_... key from Supabase dashboard)'); })(),

  // Vercel deployment (use for full E2E; storage uploads require HTTPS)
  APP_URL  : process.env.APP_URL || 'https://golf-grove-dms.vercel.app',
  // Local file URL (use for fast JS / RLS tests that don't upload files)
  LOCAL_URL: 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/'),

  // Persistent test accounts — one per role, created by setup-test-accounts.js
  // Password is shared for simplicity; these are test-only accounts with no real data.
  TEST_PASSWORD: 'GGTest2026!',
  TEST_ACCOUNTS: {
    developer    : 'test.developer@golfgrove.test',
    consultant   : 'test.consultant@golfgrove.test',
    contractor   : 'test.contractor@golfgrove.test',
    subcontractor: 'test.subcontractor@golfgrove.test',
  },

  // Real developer account (use only when the test requires actual project data)
  DEV_EMAIL: 'mohammed@regent-developments.com',
  DEV_PASS : 'Mman1990',

  ROLES: ['developer', 'consultant', 'contractor', 'subcontractor'],
};
