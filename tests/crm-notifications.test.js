#!/usr/bin/env node
/**
 * CRM Notifications — Trigger Fan-Out Tests
 * Golf Grove DMS
 *
 * Covers:
 *   1. mention fan-out (Task 4)
 *   2. reply fan-out (Task 5)
 *   3. mention+reply dedupe (Task 6)
 *   4. self-mention skip (Task 7)
 *   5. 10-mention cap CHECK constraint (Task 7)
 *
 * Run: node tests/crm-notifications.test.js
 */
const { createClient } = require('@supabase/supabase-js');
const { SUPABASE_URL, SERVICE_KEY } = require('./config');
const crypto = require('crypto');

const PROJECT_241 = '00000000-0000-0000-0000-000000000002';
const TEST_PASSWORD = 'TestPass123!';

const results = [];
function pass(n)     { results.push({name:n,status:'PASS'}); console.log('  \u2713  PASS  ' + n); }
function fail(n,msg) { results.push({name:n,status:'FAIL',info:msg}); console.error('  \u2717  FAIL  ' + n + '  \u2192  ' + msg); }
function section(t)  { console.log('\n' + '\u2550'.repeat(72) + '\n  ' + t + '\n' + '\u2500'.repeat(72)); }

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────
function uuidv4() {
  return crypto.randomUUID();
}

async function getOrCreateUser(label, runStamp) {
  const email = `${label}-${runStamp}@test.local`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser(${email}) failed: ${error.message}`);
  const id = data.user.id;

  // Upsert profile so has_crm_access() returns true.
  const { error: pErr } = await admin
    .from('profiles')
    .upsert({ id, email, role: 'sales' }, { onConflict: 'id' });
  if (pErr) throw new Error(`profile upsert (${email}) failed: ${pErr.message}`);

  return { id, email };
}

async function seedLead(name) {
  const { data, error } = await admin
    .from('crm_leads')
    .insert({ name, project_id: PROJECT_241, stage: 'new_lead' })
    .select('id, name')
    .single();
  if (error) throw new Error(`seedLead(${name}) failed: ${error.message}`);
  return data;
}

async function insertActivity(row) {
  const payload = {
    method: 'note',
    contacted_at: new Date().toISOString(),
    body: 'test activity',
    ...row,
  };
  return admin
    .from('crm_lead_activities')
    .insert(payload)
    .select('id, lead_id, author_id, mentions, parent_id')
    .single();
}

async function fetchNotifsForActivity(activityId) {
  return admin
    .from('crm_notifications')
    .select('id, user_id, type, lead_id, activity_id, actor_id, actor_name, snippet')
    .eq('activity_id', activityId);
}

async function cleanup(userIds, leadIds) {
  // Activities cascade from leads; notifications cascade from activities.
  try {
    if (leadIds.length) {
      await admin.from('crm_lead_activities').delete().in('lead_id', leadIds);
    }
  } catch (e) { console.error('  cleanup activities:', e.message); }
  try {
    if (leadIds.length) {
      await admin.from('crm_leads').delete().in('id', leadIds);
    }
  } catch (e) { console.error('  cleanup leads:', e.message); }
  try {
    if (userIds.length) {
      await admin.from('profiles').delete().in('id', userIds);
    }
  } catch (e) { console.error('  cleanup profiles:', e.message); }
  for (const uid of userIds) {
    try {
      await admin.auth.admin.deleteUser(uid);
    } catch (e) { console.error(`  cleanup user ${uid}:`, e.message); }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Run
// ──────────────────────────────────────────────────────────────────────────
async function run() {
  const stamp = Date.now();
  const created = { users: [], leads: [] };

  try {
    // ═════════════════════════════════════════════════════════════════════
    // Task 4 — mention fan-out
    // ═════════════════════════════════════════════════════════════════════
    section('Task 4 — mention fan-out (2 mentions \u2192 2 notifications)');
    try {
      const author     = await getOrCreateUser('mention-author', stamp);
      const mentioned1 = await getOrCreateUser('mentioned1',     stamp);
      const mentioned2 = await getOrCreateUser('mentioned2',     stamp);
      created.users.push(author.id, mentioned1.id, mentioned2.id);

      const lead = await seedLead('Mention Test Lead ' + stamp);
      created.leads.push(lead.id);

      const { data: act, error: actErr } = await insertActivity({
        lead_id     : lead.id,
        author_id   : author.id,
        author_name : 'Mention Author',
        body        : 'Hello @mentioned1 and @mentioned2',
        mentions    : [mentioned1.id, mentioned2.id],
      });
      if (actErr) { fail('Task 4 insert activity', actErr.message); throw new Error('skip'); }

      const { data: notifs, error: nErr } = await fetchNotifsForActivity(act.id);
      if (nErr) { fail('Task 4 fetch notifications', nErr.message); throw new Error('skip'); }

      if (notifs.length !== 2) {
        fail('Task 4 row count', `expected 2 notifications, got ${notifs.length}`);
      } else {
        pass('Task 4 row count (2 notifications)');
      }

      const allMention   = notifs.every(n => n.type === 'mention');
      const allActor     = notifs.every(n => n.actor_id === author.id);
      const allLead      = notifs.every(n => n.lead_id === lead.id);
      const recipients   = notifs.map(n => n.user_id).sort();
      const expected     = [mentioned1.id, mentioned2.id].sort();
      const recipientsOk = JSON.stringify(recipients) === JSON.stringify(expected);

      allMention   ? pass("Task 4 all type='mention'")          : fail("Task 4 all type='mention'",       JSON.stringify(notifs.map(n=>n.type)));
      allActor     ? pass('Task 4 all actor_id=author.id')       : fail('Task 4 all actor_id=author.id',     JSON.stringify(notifs.map(n=>n.actor_id)));
      allLead      ? pass('Task 4 all lead_id=lead.id')          : fail('Task 4 all lead_id=lead.id',        JSON.stringify(notifs.map(n=>n.lead_id)));
      recipientsOk ? pass('Task 4 recipients match mentions')    : fail('Task 4 recipients match mentions',  `got ${JSON.stringify(recipients)} expected ${JSON.stringify(expected)}`);
    } catch (e) {
      if (e.message !== 'skip') fail('Task 4 (unexpected error)', e.message);
    }

    // ═════════════════════════════════════════════════════════════════════
    // Task 5 — reply fan-out
    // ═════════════════════════════════════════════════════════════════════
    section('Task 5 — reply fan-out (no mentions \u2192 1 reply notification)');
    try {
      const original = await getOrCreateUser('reply-original', stamp);
      const replier  = await getOrCreateUser('reply-replier',  stamp);
      created.users.push(original.id, replier.id);

      const lead = await seedLead('Reply Test Lead ' + stamp);
      created.leads.push(lead.id);

      const { data: parent, error: pErr } = await insertActivity({
        lead_id     : lead.id,
        author_id   : original.id,
        author_name : 'Original Author',
        body        : 'Parent comment',
      });
      if (pErr) { fail('Task 5 parent insert', pErr.message); throw new Error('skip'); }

      const { data: child, error: cErr } = await insertActivity({
        lead_id     : lead.id,
        author_id   : replier.id,
        author_name : 'Replier',
        body        : 'Reply body',
        parent_id   : parent.id,
      });
      if (cErr) { fail('Task 5 child insert', cErr.message); throw new Error('skip'); }

      const { data: notifs, error: nErr } = await fetchNotifsForActivity(child.id);
      if (nErr) { fail('Task 5 fetch notifications', nErr.message); throw new Error('skip'); }

      if (notifs.length !== 1) {
        fail('Task 5 row count', `expected 1 notification, got ${notifs.length}`);
      } else {
        pass('Task 5 row count (1 notification)');
        const n = notifs[0];
        n.user_id  === original.id ? pass('Task 5 user_id=original.id') : fail('Task 5 user_id=original.id', String(n.user_id));
        n.type     === 'reply'      ? pass("Task 5 type='reply'")         : fail("Task 5 type='reply'",         n.type);
        n.actor_id === replier.id  ? pass('Task 5 actor_id=replier.id')  : fail('Task 5 actor_id=replier.id',  String(n.actor_id));
      }
    } catch (e) {
      if (e.message !== 'skip') fail('Task 5 (unexpected error)', e.message);
    }

    // ═════════════════════════════════════════════════════════════════════
    // Task 6 — mention+reply dedupe (mention wins)
    // ═════════════════════════════════════════════════════════════════════
    section('Task 6 — dedupe (parent author also mentioned \u2192 1 mention row)');
    try {
      const userA   = await getOrCreateUser('dedupe-userA',   stamp);
      const replier = await getOrCreateUser('dedupe-replier', stamp);
      created.users.push(userA.id, replier.id);

      const lead = await seedLead('Dedupe Test Lead ' + stamp);
      created.leads.push(lead.id);

      const { data: parent, error: pErr } = await insertActivity({
        lead_id     : lead.id,
        author_id   : userA.id,
        author_name : 'User A',
        body        : 'Parent by A',
      });
      if (pErr) { fail('Task 6 parent insert', pErr.message); throw new Error('skip'); }

      const { data: child, error: cErr } = await insertActivity({
        lead_id     : lead.id,
        author_id   : replier.id,
        author_name : 'Replier',
        body        : 'Reply that mentions @A',
        parent_id   : parent.id,
        mentions    : [userA.id],
      });
      if (cErr) { fail('Task 6 child insert', cErr.message); throw new Error('skip'); }

      const { data: notifs, error: nErr } = await fetchNotifsForActivity(child.id);
      if (nErr) { fail('Task 6 fetch notifications', nErr.message); throw new Error('skip'); }

      if (notifs.length !== 1) {
        fail('Task 6 row count', `expected 1 row, got ${notifs.length}: ${JSON.stringify(notifs.map(n=>n.type))}`);
      } else {
        pass('Task 6 row count (1 row, no duplicate)');
        notifs[0].type === 'mention'
          ? pass("Task 6 type='mention' (mention wins)")
          : fail("Task 6 type='mention' (mention wins)", notifs[0].type);
        notifs[0].user_id === userA.id
          ? pass('Task 6 user_id=userA.id')
          : fail('Task 6 user_id=userA.id', String(notifs[0].user_id));
      }
    } catch (e) {
      if (e.message !== 'skip') fail('Task 6 (unexpected error)', e.message);
    }

    // ═════════════════════════════════════════════════════════════════════
    // Task 7a — self-mention skip
    // ═════════════════════════════════════════════════════════════════════
    section('Task 7a — self-mention skip (author mentions self \u2192 0 notifications)');
    try {
      const author = await getOrCreateUser('selfmention-author', stamp);
      created.users.push(author.id);

      const lead = await seedLead('Self-Mention Test Lead ' + stamp);
      created.leads.push(lead.id);

      const { data: act, error: aErr } = await insertActivity({
        lead_id     : lead.id,
        author_id   : author.id,
        author_name : 'Self Mentioner',
        body        : 'Talking to myself @me',
        mentions    : [author.id],
      });
      if (aErr) { fail('Task 7a insert activity', aErr.message); throw new Error('skip'); }

      const { data: notifs, error: nErr } = await fetchNotifsForActivity(act.id);
      if (nErr) { fail('Task 7a fetch notifications', nErr.message); throw new Error('skip'); }

      notifs.length === 0
        ? pass('Task 7a row count (0 notifications)')
        : fail('Task 7a row count', `expected 0, got ${notifs.length}`);
    } catch (e) {
      if (e.message !== 'skip') fail('Task 7a (unexpected error)', e.message);
    }

    // ═════════════════════════════════════════════════════════════════════
    // Task 7b — 10-mention cap CHECK constraint
    // ═════════════════════════════════════════════════════════════════════
    section('Task 7b — 10-mention cap (11 mentions \u2192 CHECK constraint error)');
    try {
      const author = await getOrCreateUser('cap-author', stamp);
      created.users.push(author.id);

      const lead = await seedLead('Cap Test Lead ' + stamp);
      created.leads.push(lead.id);

      const eleven = Array.from({ length: 11 }, () => uuidv4());

      const { data: act, error: aErr } = await insertActivity({
        lead_id     : lead.id,
        author_id   : author.id,
        author_name : 'Cap Tester',
        body        : 'Spammy mass mention',
        mentions    : eleven,
      });

      if (!aErr && act) {
        fail('Task 7b cap rejects 11 mentions', 'insert succeeded (constraint missing?)');
      } else if (aErr && /crm_activities_mentions_max_10/.test(aErr.message)) {
        pass('Task 7b cap rejected with crm_activities_mentions_max_10');
      } else {
        fail('Task 7b cap error message', `expected match crm_activities_mentions_max_10, got: ${aErr ? aErr.message : '(no error)'}`);
      }
    } catch (e) {
      if (e.message !== 'skip') fail('Task 7b (unexpected error)', e.message);
    }

  } finally {
    section('Cleanup');
    await cleanup(created.users, created.leads);
    console.log(`  cleaned ${created.users.length} users, ${created.leads.length} leads`);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────────────────────────────
  section('Summary');
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
