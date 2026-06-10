#!/usr/bin/env node
/**
 * CRM Sync — Integration tests against real Supabase.
 *
 * Hits the production Supabase project with service-key writes against
 * tagged TEST- rows on the 241 Waterside project. Every test cleans up its
 * own rows in a finally block — failures still clean up.
 *
 * What this proves:
 *   1. No-overwrite contract: an existing curated lead is never mutated by
 *      sync, even if a sheet row arrives with the same meta_lead_id.
 *   2. Collision-pair survival: two real people sharing a SyncWith
 *      meta_lead_id with different emails both land as separate rows. This
 *      is the Bhupendra/Raha + Shiban/Ashok regression test.
 *   3. Idempotency: replaying the same batch produces 0 inserts.
 *   4. sync_key generated column matches buildSyncKey formula.
 *   5. Activities pinned to lead UUID stay pinned (don't migrate to the
 *      "other person" when SyncWith reuses the meta_lead_id).
 *   6. Empty batch is a no-op.
 *
 * Env required: SUPABASE_SERVICE_KEY (sb_secret_...).
 *
 * Run: SUPABASE_SERVICE_KEY=... node tests/crm-sync-integration.test.js
 */

const path = require('path');
const { pathToFileURL } = require('url');
const { createClient } = require('@supabase/supabase-js');
const { SUPABASE_URL, SERVICE_KEY } = require('./config');

const PROJECT_241 = '00000000-0000-0000-0000-000000000002';
const TEST_TAG = 'TEST-SYNC-' + Date.now() + '-';

const results = [];
function pass(n)     { results.push({name:n,status:'PASS'}); console.log('  \u2713  PASS  ' + n); }
function fail(n,msg) { results.push({name:n,status:'FAIL',info:msg}); console.error('  \u2717  FAIL  ' + n + '  \u2192  ' + msg); }
function section(t)  { console.log('\n' + '\u2550'.repeat(72) + '\n  ' + t + '\n' + '\u2500'.repeat(72)); }

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function loadCore() {
  const corePath = pathToFileURL(
    path.resolve(__dirname, '..', 'api', '_sync-meta-leads-core.mjs')
  ).href;
  return import(corePath);
}

async function cleanupAllTestRows() {
  // Cascade from leads will drop activities + notifications.
  const { error } = await admin
    .from('crm_leads')
    .delete()
    .like('meta_lead_id', TEST_TAG + '%');
  if (error) console.error('  cleanup error:', error.message);
}

async function run() {
  const { upsertLeads, buildSyncKey } = await loadCore();

  try {
    // ════════════════════════════════════════════════════════════════════
    section('Test 1 — empty batch is a no-op');
    // ════════════════════════════════════════════════════════════════════
    {
      const r = await upsertLeads([], {
        supabaseUrl: SUPABASE_URL,
        supabaseKey: SERVICE_KEY,
      });
      r.inserted === 0         ? pass('inserted=0')         : fail('inserted=0',         String(r.inserted));
      r.skipped_existing === 0 ? pass('skipped_existing=0') : fail('skipped_existing=0', String(r.skipped_existing));
      r.errors === 0           ? pass('errors=0')           : fail('errors=0',           String(r.errors));
    }

    // ════════════════════════════════════════════════════════════════════
    section('Test 2 — fresh insert produces inserted=N');
    // ════════════════════════════════════════════════════════════════════
    {
      const id = TEST_TAG + 'fresh-1';
      const r = await upsertLeads([{
        project_id: PROJECT_241,
        meta_lead_id: id,
        name: 'Fresh Lead',
        first_name: 'Fresh',
        email: 'fresh1@test.local',
        phone: '+9710000001',
        source: 'meta_ads',
      }], { supabaseUrl: SUPABASE_URL, supabaseKey: SERVICE_KEY });

      r.inserted === 1         ? pass('inserted=1')                : fail('inserted=1',         String(r.inserted));
      r.skipped_existing === 0 ? pass('skipped_existing=0')        : fail('skipped_existing=0', String(r.skipped_existing));

      // sync_key generated column must match our formula.
      const { data: rows } = await admin
        .from('crm_leads')
        .select('id, meta_lead_id, email, sync_key, name')
        .eq('meta_lead_id', id);
      if (rows?.length === 1) {
        pass('row exists in DB');
        const expectedKey = buildSyncKey(id, 'fresh1@test.local');
        rows[0].sync_key === expectedKey
          ? pass('DB sync_key matches buildSyncKey formula')
          : fail('DB sync_key matches buildSyncKey formula', `expected ${expectedKey}, got ${rows[0].sync_key}`);
      } else {
        fail('row exists in DB', 'count=' + (rows?.length ?? 'null'));
      }
    }

    // ════════════════════════════════════════════════════════════════════
    section('Test 3 — no-overwrite contract (the Bhupendra → Raha bug)');
    // ════════════════════════════════════════════════════════════════════
    {
      // Step 1: insert a curated lead manually (simulates Bhupendra after
      // sales has edited his profile).
      const sharedId = TEST_TAG + 'collision';
      const { data: existing, error: insErr } = await admin
        .from('crm_leads')
        .insert({
          project_id   : PROJECT_241,
          meta_lead_id : sharedId,
          name         : 'Bhupendra (curated)',
          first_name   : 'Bhupendra',
          email        : 'bhupendra-test@example.com',
          phone        : '+9711111111',
          company_name : 'Alcenza properties/Masih',
          stage        : 'qualified',     // sales advanced him beyond new_lead
          source       : 'meta_ads',
        })
        .select('id, name, stage, sync_key')
        .single();
      if (insErr) { fail('seed Bhupendra', insErr.message); throw new Error('skip'); }
      pass('seed Bhupendra');
      const bhupUUID    = existing.id;
      const bhupOrigKey = existing.sync_key;

      // Step 2: simulate sync arriving with TWO rows sharing the meta_lead_id:
      //  - one matching Bhupendra's email (legitimate re-sync) — should skip
      //  - one with Raha's email (SyncWith collision)         — should insert
      const r = await upsertLeads([
        // Re-sync row (same meta_lead_id + same email).
        // Crucially the name + stage on this row are WRONG; if sync overwrote,
        // we'd see Bhupendra's name become "WRONG NAME" and stage reset.
        {
          project_id   : PROJECT_241,
          meta_lead_id : sharedId,
          name         : 'WRONG NAME — overwrite probe',
          first_name   : 'WRONG',
          email        : 'bhupendra-test@example.com',
          phone        : '+9719999999',
          company_name : 'SHOULD NOT APPEAR',
          source       : 'meta_ads',
        },
        // Collision row (same meta_lead_id, different email).
        {
          project_id   : PROJECT_241,
          meta_lead_id : sharedId,
          name         : 'Raha (sheet)',
          first_name   : 'Raha',
          email        : 'raha-test@example.com',
          phone        : '+9712222222',
          company_name : 'Raha Co',
          source       : 'meta_ads',
        },
      ], { supabaseUrl: SUPABASE_URL, supabaseKey: SERVICE_KEY });

      // 1 insert (Raha new), 1 skip (Bhupendra exists).
      r.inserted === 1         ? pass('inserted=1 (Raha)')                : fail('inserted=1 (Raha)',         String(r.inserted));
      r.skipped_existing === 1 ? pass('skipped_existing=1 (Bhupendra)')   : fail('skipped_existing=1', String(r.skipped_existing));
      r.errors === 0           ? pass('errors=0')                          : fail('errors=0',           JSON.stringify(r.errorDetails));

      // Step 3: re-fetch Bhupendra. NOTHING about him should have changed.
      const { data: bhupAfter } = await admin
        .from('crm_leads')
        .select('id, name, first_name, email, phone, company_name, stage, sync_key')
        .eq('id', bhupUUID)
        .single();
      bhupAfter.name         === 'Bhupendra (curated)'        ? pass('Bhupendra.name unchanged')     : fail('Bhupendra.name unchanged',     bhupAfter.name);
      bhupAfter.first_name   === 'Bhupendra'                  ? pass('Bhupendra.first_name unchanged') : fail('Bhupendra.first_name unchanged', bhupAfter.first_name);
      bhupAfter.email        === 'bhupendra-test@example.com' ? pass('Bhupendra.email unchanged')     : fail('Bhupendra.email unchanged',     bhupAfter.email);
      bhupAfter.phone        === '+9711111111'                ? pass('Bhupendra.phone unchanged')     : fail('Bhupendra.phone unchanged',     bhupAfter.phone);
      bhupAfter.company_name === 'Alcenza properties/Masih'   ? pass('Bhupendra.company unchanged')   : fail('Bhupendra.company unchanged',   bhupAfter.company_name);
      bhupAfter.stage        === 'qualified'                  ? pass('Bhupendra.stage stays qualified') : fail('Bhupendra.stage stays qualified', bhupAfter.stage);
      bhupAfter.sync_key     === bhupOrigKey                  ? pass('Bhupendra.sync_key unchanged')  : fail('Bhupendra.sync_key unchanged',  bhupAfter.sync_key);

      // Step 4: confirm Raha exists as a SEPARATE row with a distinct UUID
      // and distinct sync_key, but with the same meta_lead_id.
      const { data: rahaRows } = await admin
        .from('crm_leads')
        .select('id, name, email, sync_key, meta_lead_id')
        .eq('meta_lead_id', sharedId)
        .eq('email', 'raha-test@example.com');
      if (rahaRows?.length === 1) {
        pass('Raha exists as separate row');
        rahaRows[0].id !== bhupUUID
          ? pass('Raha.id differs from Bhupendra.id')
          : fail('Raha.id differs from Bhupendra.id', 'same UUID');
        rahaRows[0].sync_key !== bhupOrigKey
          ? pass('Raha.sync_key differs from Bhupendra.sync_key')
          : fail('Raha.sync_key differs', 'same sync_key');
        rahaRows[0].meta_lead_id === sharedId
          ? pass('Raha.meta_lead_id matches collision id')
          : fail('Raha.meta_lead_id matches collision id', rahaRows[0].meta_lead_id);
      } else {
        fail('Raha exists as separate row', 'count=' + (rahaRows?.length ?? 'null'));
      }
    }

    // ════════════════════════════════════════════════════════════════════
    section('Test 4 — idempotency: second sync of same batch inserts 0');
    // ════════════════════════════════════════════════════════════════════
    {
      const id = TEST_TAG + 'idem';
      const lead = {
        project_id: PROJECT_241,
        meta_lead_id: id,
        name: 'Idempotent',
        first_name: 'Idempotent',
        email: 'idem@test.local',
        phone: '+9714444444',
        source: 'meta_ads',
      };
      const first  = await upsertLeads([lead], { supabaseUrl: SUPABASE_URL, supabaseKey: SERVICE_KEY });
      const second = await upsertLeads([lead], { supabaseUrl: SUPABASE_URL, supabaseKey: SERVICE_KEY });
      first.inserted  === 1         ? pass('first run inserts 1')         : fail('first run inserts 1',  String(first.inserted));
      second.inserted === 0         ? pass('second run inserts 0')        : fail('second run inserts 0', String(second.inserted));
      second.skipped_existing === 1 ? pass('second run skips existing 1') : fail('second run skips 1',   String(second.skipped_existing));
      second.errors === 0           ? pass('second run errors 0')         : fail('second run errors 0',  JSON.stringify(second.errorDetails));
    }

    // ════════════════════════════════════════════════════════════════════
    section('Test 5 — activities stay pinned to UUID across collision sync');
    // ════════════════════════════════════════════════════════════════════
    {
      // Insert a lead, add an activity authored under that lead UUID, then
      // run a sync that includes a collision-pair partner. Activity should
      // still be on the original lead — NOT the new collision-partner row.
      const sharedId = TEST_TAG + 'activity-pin';

      const { data: original, error: oErr } = await admin
        .from('crm_leads')
        .insert({
          project_id: PROJECT_241,
          meta_lead_id: sharedId,
          name: 'Client A',
          first_name: 'Client',
          email: 'clienta@test.local',
          source: 'meta_ads',
        })
        .select('id')
        .single();
      if (oErr) { fail('seed Client A', oErr.message); throw new Error('skip'); }
      pass('seed Client A');

      const { data: act, error: aErr } = await admin
        .from('crm_lead_activities')
        .insert({
          lead_id      : original.id,
          author_name  : 'Sales Note',
          method       : 'note',
          contacted_at : new Date().toISOString(),
          body         : 'Note made about Client A — must not migrate.',
        })
        .select('id, lead_id')
        .single();
      if (aErr) { fail('seed activity', aErr.message); throw new Error('skip'); }
      pass('seed activity');

      // Now sync with collision partner Client B (same meta_lead_id, different email).
      await upsertLeads([{
        project_id: PROJECT_241,
        meta_lead_id: sharedId,
        name: 'Client B',
        first_name: 'Client',
        email: 'clientb@test.local',
        source: 'meta_ads',
      }], { supabaseUrl: SUPABASE_URL, supabaseKey: SERVICE_KEY });

      // Re-fetch activity. lead_id should still point at Client A's UUID.
      const { data: actAfter } = await admin
        .from('crm_lead_activities')
        .select('id, lead_id, body')
        .eq('id', act.id)
        .single();
      actAfter.lead_id === original.id
        ? pass('activity still pinned to Client A UUID')
        : fail('activity still pinned to Client A UUID', `now points at ${actAfter.lead_id}`);

      // And verify Client A's identity intact.
      const { data: aRow } = await admin
        .from('crm_leads')
        .select('name, email')
        .eq('id', original.id)
        .single();
      aRow.name  === 'Client A'              ? pass("Client A's name still 'Client A'")  : fail("Client A's name still 'Client A'", aRow.name);
      aRow.email === 'clienta@test.local'    ? pass("Client A's email unchanged")        : fail("Client A's email unchanged",       aRow.email);

      // And Client B is a separate row.
      const { data: bRows } = await admin
        .from('crm_leads')
        .select('id, email')
        .eq('meta_lead_id', sharedId)
        .eq('email', 'clientb@test.local');
      bRows?.length === 1 && bRows[0].id !== original.id
        ? pass('Client B inserted as distinct row')
        : fail('Client B inserted as distinct row', JSON.stringify(bRows));
    }

    // ════════════════════════════════════════════════════════════════════
    section('Test 6 — null email collision insert still works');
    // ════════════════════════════════════════════════════════════════════
    {
      // Two sheet rows share meta_lead_id and both have null email. The
      // sync_key formula gives both the same value (id|''), so only the
      // first should insert and the second should skip.
      const id = TEST_TAG + 'nullemail';
      const r = await upsertLeads([
        { project_id: PROJECT_241, meta_lead_id: id, name: 'No Email A', first_name: 'NoA', email: null, source: 'meta_ads' },
        { project_id: PROJECT_241, meta_lead_id: id, name: 'No Email B', first_name: 'NoB', email: null, source: 'meta_ads' },
      ], { supabaseUrl: SUPABASE_URL, supabaseKey: SERVICE_KEY });
      r.inserted === 1         ? pass('null-email first row inserts') : fail('null-email first row inserts',  String(r.inserted));
      r.skipped_existing === 1 ? pass('null-email second row skips')  : fail('null-email second row skips',   String(r.skipped_existing));
      r.errors === 0           ? pass('no errors')                     : fail('no errors',                     JSON.stringify(r.errorDetails));
    }

  } catch (e) {
    console.error('\n  fatal:', e.message);
  } finally {
    section('Cleanup');
    await cleanupAllTestRows();
    console.log('  cleaned all rows matching meta_lead_id LIKE \'' + TEST_TAG + '%\'');
  }

  // ──────────────────────────────────────────────────────────────────────
  section('Summary');
  // ──────────────────────────────────────────────────────────────────────
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`  PASS: ${passed}`);
  console.log(`  FAIL: ${failed}`);
  if (failed > 0) {
    console.log('\n  Failures:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`    - ${r.name}: ${r.info}`);
    });
  }
  process.exit(failed ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
