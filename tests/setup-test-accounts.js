#!/usr/bin/env node
/**
 * One-time setup: create persistent per-role test accounts in Supabase.
 *
 * Run ONCE (safe to re-run — skips accounts that already exist):
 *   node tests/setup-test-accounts.js
 *
 * What it does:
 *   1. Creates one auth user per role using the admin API
 *   2. Upserts a row in `profiles` with the correct role
 *
 * The accounts are never deleted by individual tests — they are stable fixtures.
 * If you need to reset them, run this script with --reset to delete and recreate.
 */

const { SUPABASE_URL, SERVICE_KEY, ANON_KEY, TEST_ACCOUNTS, TEST_PASSWORD, ROLES } = require('./config');
const { api, createAuthUser } = require('./helpers/api');

const RESET = process.argv.includes('--reset');

async function listExistingAuthUsers() {
  const r = await api('GET', '/auth/v1/admin/users?per_page=1000');
  if (!r.ok) throw new Error(`listUsers: ${JSON.stringify(r.data)}`);
  return r.data.users || [];
}

async function deleteAuthUserByEmail(email, users) {
  const u = users.find(x => x.email === email);
  if (!u) return;
  await api('DELETE', `/auth/v1/admin/users/${u.id}`);
  console.log(`  deleted auth user: ${email}`);
}

async function upsertProfile(userId, role) {
  const r = await api('POST', '/rest/v1/profiles', { id: userId, role }, SERVICE_KEY, {
    Prefer: 'resolution=merge-duplicates,return=representation',
  });
  if (!r.ok) throw new Error(`upsertProfile(${role}): ${JSON.stringify(r.data)}`);
}

(async () => {
  console.log('\nGolf Grove DMS — Test Account Setup');
  console.log('═'.repeat(50));

  const existingUsers = await listExistingAuthUsers();

  if (RESET) {
    console.log('\nResetting existing test accounts...');
    for (const role of ROLES) {
      await deleteAuthUserByEmail(TEST_ACCOUNTS[role], existingUsers);
    }
    // Re-fetch after deletion
    existingUsers.length = 0;
    (await listExistingAuthUsers()).forEach(u => existingUsers.push(u));
  }

  let created = 0, skipped = 0;
  for (const role of ROLES) {
    const email = TEST_ACCOUNTS[role];
    const existing = existingUsers.find(u => u.email === email);

    if (existing) {
      console.log(`  ⊘  SKIP  ${role.padEnd(14)} ${email}  (already exists)`);
      // Still ensure profile row has correct role
      await upsertProfile(existing.id, role).catch(e => console.warn(`    profile upsert: ${e.message}`));
      skipped++;
      continue;
    }

    try {
      const user = await createAuthUser(email, TEST_PASSWORD);
      await upsertProfile(user.id, role);
      console.log(`  ✓  OK    ${role.padEnd(14)} ${email}`);
      created++;
    } catch (err) {
      console.error(`  ✗  FAIL  ${role.padEnd(14)} ${email}  →  ${err.message}`);
    }
  }

  console.log('\n' + '─'.repeat(50));
  console.log(`  Created: ${created}  |  Skipped: ${skipped}`);
  console.log(`  Password for all accounts: ${TEST_PASSWORD}`);
  console.log('─'.repeat(50) + '\n');
})();
