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
  ANON_KEY     : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkeHZocndubmVoaWNnZHJ5b3d1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTg2NjMsImV4cCI6MjA5MTIzNDY2M30.uMlyBkTeth6nVl8ofBu9g_AYlnDLkgDyVTsxxaHI_ic',
  SERVICE_KEY  : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkeHZocndubmVoaWNnZHJ5b3d1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY1ODY2MywiZXhwIjoyMDkxMjM0NjYzfQ.q9i53Jx2GXHpX5t89Tdzly0WPiS-TOeiuY36D6uRnUA',

  // Vercel deployment (use for full E2E; storage uploads require HTTPS)
  APP_URL  : 'https://golf-grove-dms.vercel.app',
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
