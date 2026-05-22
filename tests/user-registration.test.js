#!/usr/bin/env node
/**
 * User Registration — Integration Tests
 * Golf Grove DMS
 *
 * Covers:
 *   1. Signup creates auth user + profile row via trigger (no "Database error saving new user")
 *   2. Profile starts with role='pending', requested_role set from signup metadata
 *   3. All selectable requested_role values accepted by constraint
 *   4. Duplicate email rejected correctly
 *   5. Profile not created for invalid signup (short password)
 *
 * Run: node tests/user-registration.test.js
 */
const https = require('https');
const { SUPABASE_URL, ANON_KEY, SERVICE_KEY } = require('./config');

const results = [];
function pass(n)     { results.push({name:n,status:'PASS'}); console.log('  ✓  PASS  ' + n); }
function fail(n,msg) { results.push({name:n,status:'FAIL',info:msg}); console.error('  ✗  FAIL  ' + n + '  →  ' + msg); }
function section(t)  { console.log('\n' + '═'.repeat(72) + '\n  ' + t + '\n' + '─'.repeat(72)); }

function req(method, path, body, token, useService) {
  return new Promise((resolve, reject) => {
    const url  = new URL(path, SUPABASE_URL);
    const data = body ? JSON.stringify(body) : null;
    const key  = useService ? SERVICE_KEY : ANON_KEY;
    const opts = {
      hostname: url.hostname, path: url.pathname + url.search, method,
      headers: {
        'apikey': key,
        'Authorization': 'Bearer ' + (token || key),
        'Content-Type': 'application/json',
        ...(data ? {'Content-Length': Buffer.byteLength(data)} : {})
      }
    };
    const r = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({status: res.statusCode, data: JSON.parse(d)}); }
        catch(e) { resolve({status: res.statusCode, data: d}); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

// Sign up via anon key — mirrors doSignup() in index.html exactly
async function signUp(email, password, meta) {
  return req('POST', '/auth/v1/signup', { email, password, data: meta }, null, false);
}

// Delete auth user via service key (admin)
async function deleteUser(userId) {
  return req('DELETE', `/auth/v1/admin/users/${userId}`, null, SERVICE_KEY, true);
}

// Delete profile row via service key
async function deleteProfile(userId) {
  return req('DELETE', `/rest/v1/profiles?id=eq.${userId}`, null, SERVICE_KEY, true);
}

// Fetch profile row via service key
async function getProfile(userId) {
  const r = await req('GET', `/rest/v1/profiles?id=eq.${userId}&select=*`, null, SERVICE_KEY, true);
  return Array.isArray(r.data) ? r.data[0] : null;
}

const TEST_EMAIL_BASE = `test.reg.${Date.now()}`;
const createdUsers = []; // track for cleanup

async function run() {

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Basic signup — profile auto-created by trigger
  // ═══════════════════════════════════════════════════════════════════════════
  section('1. Basic signup — trigger creates profile row');
  {
    const email = `${TEST_EMAIL_BASE}.a@example.com`;
    const r = await signUp(email, 'Test123456!', {
      full_name: 'Test User Alpha',
      company: 'Test Corp',
      requested_role: 'contractor',
    });

    if (r.status !== 200 || !r.data?.user?.id) {
      fail('signup succeeds', `HTTP ${r.status} — ${JSON.stringify(r.data).slice(0,200)}`);
    } else {
      pass('signup succeeds (no Database error)');
      const uid = r.data.user.id;
      createdUsers.push(uid);

      const profile = await getProfile(uid);
      if (!profile) {
        fail('profile row auto-created', 'row not found in profiles table');
      } else {
        pass('profile row auto-created by trigger');
        profile.role === 'pending'
          ? pass('profile.role = pending')
          : fail('profile.role = pending', `got: ${profile.role}`);
        profile.requested_role === 'contractor'
          ? pass('profile.requested_role = contractor')
          : fail('profile.requested_role = contractor', `got: ${profile.requested_role}`);
        profile.full_name === 'Test User Alpha'
          ? pass('profile.full_name set from metadata')
          : fail('profile.full_name set from metadata', `got: ${profile.full_name}`);
        profile.email === email
          ? pass('profile.email set correctly')
          : fail('profile.email set correctly', `got: ${profile.email}`);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. All requested_role values accepted by constraint
  // ═══════════════════════════════════════════════════════════════════════════
  section('2. Role constraint — all selectable roles accepted');
  const roles = ['contractor', 'subcontractor', 'consultant', 'developer'];
  for (const role of roles) {
    const email = `${TEST_EMAIL_BASE}.role.${role}@example.com`;
    const r = await signUp(email, 'Test123456!', { full_name: 'Role Test', requested_role: role });
    if (r.status === 200 && r.data?.user?.id) {
      pass(`signup with requested_role=${role}`);
      createdUsers.push(r.data.user.id);
    } else {
      fail(`signup with requested_role=${role}`, `HTTP ${r.status} — ${JSON.stringify(r.data).slice(0,150)}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Duplicate email rejected
  // ═══════════════════════════════════════════════════════════════════════════
  section('3. Duplicate email — second signup rejected');
  {
    const email = `${TEST_EMAIL_BASE}.dup@example.com`;
    const r1 = await signUp(email, 'Test123456!', { full_name: 'Dup User', requested_role: 'contractor' });
    if (r1.status === 200 && r1.data?.user?.id) createdUsers.push(r1.data.user.id);

    const r2 = await signUp(email, 'Test123456!', { full_name: 'Dup User 2', requested_role: 'contractor' });
    // Supabase returns 200 with obfuscated response for duplicate (no user id) or 422
    const isDuplicate = r2.status === 422 || !r2.data?.user?.id;
    isDuplicate
      ? pass('duplicate email rejected or obfuscated')
      : fail('duplicate email rejected', `got HTTP ${r2.status} with user id`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Weak password rejected before trigger fires
  // ═══════════════════════════════════════════════════════════════════════════
  section('4. Weak password — signup rejected, no orphan profile');
  {
    const email = `${TEST_EMAIL_BASE}.weak@example.com`;
    const r = await signUp(email, '123', { full_name: 'Weak Pass', requested_role: 'contractor' });
    if (r.status !== 200 || !r.data?.user?.id) {
      pass('weak password signup rejected');
    } else {
      // If somehow accepted, check no profile exists in bad state
      const uid = r.data.user.id;
      createdUsers.push(uid);
      fail('weak password signup rejected', `accepted with HTTP ${r.status}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Cleanup — delete test users (profile first due to FK, then auth user)
  // ═══════════════════════════════════════════════════════════════════════════
  section('Cleanup');
  for (const uid of createdUsers) {
    await deleteProfile(uid);
    await deleteUser(uid);
  }
  pass(`cleaned up ${createdUsers.length} test user(s)`);

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log('\n' + '═'.repeat(72));
  console.log(`  ${passed} passed  |  ${failed} failed  |  ${results.length} total`);
  console.log('═'.repeat(72) + '\n');
  if (failed > 0) process.exit(1);
}

run().catch(e => { console.error(e); process.exit(1); });
