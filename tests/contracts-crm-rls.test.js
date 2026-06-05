#!/usr/bin/env node
/**
 * Contracts & CRM — RLS Integration Tests
 * Golf Grove DMS
 *
 * Covers:
 *   1. contracts table RLS — read-all, write developer/consultant only
 *   2. boq_bills.contract_id FK scoping
 *   3. payment_certificates per-contract numbering isolation
 *   4. crm_lead_activities insert/read per role
 *   5. crm_lead_activities UPDATE (task completion) policy
 *   6. crm_leads rating + converted_unit_id field access
 *
 * Run: node tests/contracts-crm-rls.test.js
 */
const https = require('https');
const { SUPABASE_URL, ANON_KEY, SERVICE_KEY, TEST_ACCOUNTS, TEST_PASSWORD } = require('./config');

const results = [];
function pass(n)     { results.push({name:n,status:'PASS'}); console.log('  \u2713  PASS  ' + n); }
function fail(n,msg) { results.push({name:n,status:'FAIL',info:msg}); console.error('  \u2717  FAIL  ' + n + '  \u2192  ' + msg); }
function skip(n,msg) { results.push({name:n,status:'SKIP',info:msg}); console.log('  -  SKIP  ' + n + (msg?' ('+msg+')':'')); }
function section(t)  { console.log('\n' + '═'.repeat(72) + '\n  ' + t + '\n' + '─'.repeat(72)); }

const PROJECT_241 = '00000000-0000-0000-0000-000000000002';

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url  = new URL(path, SUPABASE_URL);
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: url.hostname, path: url.pathname + url.search, method,
      headers: {
        'apikey': ANON_KEY, 'Authorization': 'Bearer ' + (token || ANON_KEY),
        'Content-Type': 'application/json', 'Prefer': 'return=representation',
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

async function signIn(email, password) {
  const r = await req('POST', '/auth/v1/token?grant_type=password', {email, password});
  return r.data?.access_token || null;
}

// Service-key request: the new sb_secret_... keys are NOT JWTs. Send the
// secret as both apikey and Bearer (Supabase accepts this combo for the
// new key format) and PostgREST will run with service_role privileges.
// Do NOT include the ANON_KEY apikey here — that would scope to anon.
function reqSvc(method, path, body) {
  return new Promise((resolve, reject) => {
    const url  = new URL(path, SUPABASE_URL);
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: url.hostname, path: url.pathname + url.search, method,
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json', 'Prefer': 'return=representation',
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

async function run() {

  // ── Auth ──────────────────────────────────────────────────────────────────
  section('Sign in — all roles');
  const tokens = {};
  for (const role of ['developer','consultant','contractor','subcontractor']) {
    tokens[role] = await signIn(TEST_ACCOUNTS[role], TEST_PASSWORD);
    tokens[role] ? pass(`${role} sign in`) : fail(`${role} sign in`, 'no token');
  }
  const dev  = tokens.developer;
  const cons = tokens.consultant;
  const cont = tokens.contractor;
  const sub  = tokens.subcontractor;
  if (!dev) { console.error('Developer token missing — cannot continue'); process.exit(1); }

  // ═════════════════════════════════════════════════════════════════════════
  // 1. contracts TABLE — RLS
  // ═════════════════════════════════════════════════════════════════════════
  section('1. contracts — RLS read access (all roles)');

  let contractIds = [];
  {
    // Anon read (unauthenticated users should also be able to read contracts)
    const r = await req('GET', '/rest/v1/contracts?select=id,name,project_id&limit=5', null, ANON_KEY);
    if (r.status === 200 && Array.isArray(r.data)) {
      pass(`Anon can read contracts (${r.data.length} rows)`);
      contractIds = r.data.map(c => c.id);
    } else {
      fail('Anon read contracts', `HTTP ${r.status}`);
    }
  }

  for (const [role, token] of Object.entries(tokens)) {
    if (!token) { skip(`${role} can read contracts`, 'no token'); continue; }
    const r = await req('GET', '/rest/v1/contracts?select=id,name&limit=5', null, token);
    (r.status === 200 && Array.isArray(r.data))
      ? pass(`${role} can read contracts`)
      : fail(`${role} can read contracts`, `HTTP ${r.status}`);
  }

  section('1b. contracts — RLS write access (developer/consultant only)');

  const tmpName = 'TEST-CONTRACT-' + Date.now();
  let tmpContractId = null;

  // developer CAN insert
  {
    const r = await req('POST', '/rest/v1/contracts', {
      project_id: PROJECT_241, name: tmpName, contract_type: 'other', sort_order: 99
    }, dev);
    if (r.status === 201 && r.data?.[0]?.id) {
      tmpContractId = r.data[0].id;
      pass('developer can insert contract');
    } else {
      fail('developer can insert contract', `HTTP ${r.status} ${JSON.stringify(r.data)}`);
    }
  }

  // consultant CAN insert
  {
    const tmpName2 = 'TEST-CONS-' + Date.now();
    let tmpId2 = null;
    const r = await req('POST', '/rest/v1/contracts', {
      project_id: PROJECT_241, name: tmpName2, contract_type: 'other', sort_order: 100
    }, cons);
    if (r.status === 201 && r.data?.[0]?.id) {
      tmpId2 = r.data[0].id;
      pass('consultant can insert contract');
      // cleanup
      await req('DELETE', '/rest/v1/contracts?id=eq.' + tmpId2, null, dev);
    } else {
      fail('consultant can insert contract', `HTTP ${r.status} ${JSON.stringify(r.data)}`);
    }
  }

  // contractor CANNOT insert
  {
    const r = await req('POST', '/rest/v1/contracts', {
      project_id: PROJECT_241, name: 'BLOCK-CONT', contract_type: 'other', sort_order: 101
    }, cont);
    r.status !== 201
      ? pass('contractor blocked from inserting contract')
      : fail('contractor blocked from inserting contract', 'Insert succeeded — RLS gap');
  }

  // subcontractor CANNOT insert
  {
    const r = await req('POST', '/rest/v1/contracts', {
      project_id: PROJECT_241, name: 'BLOCK-SUB', contract_type: 'other', sort_order: 102
    }, sub);
    r.status !== 201
      ? pass('subcontractor blocked from inserting contract')
      : fail('subcontractor blocked from inserting contract', 'Insert succeeded — RLS gap');
  }

  // cleanup test contract
  if (tmpContractId) {
    await req('DELETE', '/rest/v1/contracts?id=eq.' + tmpContractId, null, dev);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 2. boq_bills — contract_id FK scoping
  // ═════════════════════════════════════════════════════════════════════════
  section('2. boq_bills — contract_id FK scoping');

  {
    // All contracts for project 241
    const r = await req('GET',
      '/rest/v1/contracts?select=id,name&project_id=eq.' + PROJECT_241, null, dev);
    const contracts = (r.status === 200 && Array.isArray(r.data)) ? r.data : [];
    if (contracts.length === 0) {
      skip('boq_bills per-contract scoping', 'No contracts for project 241');
    } else {
      pass(`Found ${contracts.length} contracts for 241 Waterside`);
      // Each contract should have at least some bills
      for (const c of contracts) {
        const br = await req('GET',
          `/rest/v1/boq_bills?select=id,bill_no&contract_id=eq.${c.id}`, null, dev);
        if (br.status === 200 && Array.isArray(br.data)) {
          pass(`Contract "${c.name}": ${br.data.length} bills linked via contract_id`);
        } else {
          fail(`Fetch bills for contract "${c.name}"`, `HTTP ${br.status}`);
        }
      }

      // Bills for one contract should not appear in another contract's filter
      if (contracts.length >= 2) {
        const c1 = contracts[0];
        const c2 = contracts[1];
        const r1 = await req('GET', `/rest/v1/boq_bills?select=id&contract_id=eq.${c1.id}`, null, dev);
        const r2 = await req('GET', `/rest/v1/boq_bills?select=id&contract_id=eq.${c2.id}`, null, dev);
        const ids1 = new Set((r1.data||[]).map(b=>b.id));
        const ids2 = new Set((r2.data||[]).map(b=>b.id));
        const overlap = [...ids1].filter(id => ids2.has(id));
        overlap.length === 0
          ? pass('No bill overlap between contracts (contract_id scoping correct)')
          : fail('Bill overlap between contracts', `${overlap.length} shared bill IDs`);
      }
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 3. payment_certificates — per-contract cert_no isolation
  // ═════════════════════════════════════════════════════════════════════════
  section('3. payment_certificates — per-contract cert_no scoping');

  {
    const r = await req('GET',
      '/rest/v1/contracts?select=id,name&project_id=eq.' + PROJECT_241, null, dev);
    const contracts = (r.status === 200 && Array.isArray(r.data)) ? r.data : [];

    if (contracts.length === 0) {
      skip('Per-contract cert_no check', 'No contracts for project 241');
    } else {
      for (const c of contracts) {
        const cr = await req('GET',
          `/rest/v1/payment_certificates?select=id,cert_no,ref_no,status&contract_id=eq.${c.id}&order=cert_no.asc`,
          null, dev);
        if (cr.status === 200 && Array.isArray(cr.data)) {
          const certs = cr.data;
          pass(`Contract "${c.name}": ${certs.length} certs`);
          if (certs.length > 0) {
            // cert_no should start at 1 for each contract
            const minNo = Math.min(...certs.map(c=>c.cert_no||999));
            minNo === 1
              ? pass(`Contract "${c.name}": cert_no starts at 1 (IPC-001)`)
              : fail(`Contract "${c.name}": cert_no starts at ${minNo}`, 'expected 1');
          }
        } else {
          fail(`Fetch certs for contract "${c.name}"`, `HTTP ${cr.status}`);
        }
      }

      // Certs from different contracts should not cross-filter
      if (contracts.length >= 2) {
        const c1 = contracts[0];
        const c2 = contracts[1];
        const r1 = await req('GET', `/rest/v1/payment_certificates?select=id&contract_id=eq.${c1.id}`, null, dev);
        const r2 = await req('GET', `/rest/v1/payment_certificates?select=id&contract_id=eq.${c2.id}`, null, dev);
        const ids1 = new Set((r1.data||[]).map(c=>c.id));
        const ids2 = new Set((r2.data||[]).map(c=>c.id));
        const overlap = [...ids1].filter(id => ids2.has(id));
        overlap.length === 0
          ? pass('No cert overlap between contracts (contract_id scoping correct)')
          : fail('Cert overlap between contracts', `${overlap.length} shared cert IDs`);
      }
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 4. crm_lead_activities — insert/read per role
  // ═════════════════════════════════════════════════════════════════════════
  section('4. crm_lead_activities — insert/read RLS per role');

  // Get a real lead to attach activities to
  let testLeadId = null;
  {
    const r = await req('GET', '/rest/v1/crm_leads?select=id&limit=1', null, dev);
    if (r.status === 200 && Array.isArray(r.data) && r.data.length > 0) {
      testLeadId = r.data[0].id;
      pass(`Found test lead: ${testLeadId}`);
    } else {
      skip('crm_lead_activities tests', 'No leads found in DB');
    }
  }

  const insertedActivityIds = [];

  if (testLeadId) {
    // developer CAN insert activity (has_crm_access = developer|sales only)
    {
      const r = await req('POST', '/rest/v1/crm_lead_activities', {
        lead_id: testLeadId, method: 'note', body: 'Test dev note',
        contacted_at: new Date().toISOString(), author_name: 'Test Developer'
      }, dev);
      if (r.status === 201 && r.data?.[0]?.id) {
        insertedActivityIds.push(r.data[0].id);
        pass('developer can insert crm_lead_activity');
      } else {
        fail('developer can insert crm_lead_activity', `HTTP ${r.status} ${JSON.stringify(r.data)}`);
      }
    }

    // consultant CANNOT insert — has_crm_access() = developer|sales only
    {
      const r = await req('POST', '/rest/v1/crm_lead_activities', {
        lead_id: testLeadId, method: 'call', body: 'Blocked call',
        contacted_at: new Date().toISOString(), author_name: 'Test Consultant'
      }, cons);
      r.status !== 201
        ? pass('consultant correctly blocked from inserting crm_lead_activity (RLS: developer|sales only)')
        : fail('consultant blocked from inserting crm_lead_activity', 'Insert should be denied');
    }

    // contractor CANNOT read crm_lead_activities
    {
      const r = await req('GET', `/rest/v1/crm_lead_activities?lead_id=eq.${testLeadId}&limit=5`, null, cont);
      (r.status !== 200 || (Array.isArray(r.data) && r.data.length === 0))
        ? pass('contractor cannot read crm_lead_activities (RLS blocks)')
        : fail('contractor cannot read crm_lead_activities', `Got ${r.data?.length} rows`);
    }

    // subcontractor CANNOT read crm_lead_activities
    {
      const r = await req('GET', `/rest/v1/crm_lead_activities?lead_id=eq.${testLeadId}&limit=5`, null, sub);
      (r.status !== 200 || (Array.isArray(r.data) && r.data.length === 0))
        ? pass('subcontractor cannot read crm_lead_activities (RLS blocks)')
        : fail('subcontractor cannot read crm_lead_activities', `Got ${r.data?.length} rows`);
    }

    // developer CAN read
    {
      const r = await req('GET', `/rest/v1/crm_lead_activities?lead_id=eq.${testLeadId}&limit=5`, null, dev);
      (r.status === 200 && Array.isArray(r.data))
        ? pass(`developer can read crm_lead_activities (${r.data.length} rows)`)
        : fail('developer can read crm_lead_activities', `HTTP ${r.status}`);
    }

    // consultant cannot read either
    {
      const r = await req('GET', `/rest/v1/crm_lead_activities?lead_id=eq.${testLeadId}&limit=5`, null, cons);
      (r.status !== 200 || (Array.isArray(r.data) && r.data.length === 0))
        ? pass('consultant cannot read crm_lead_activities (RLS: developer|sales only)')
        : fail('consultant cannot read crm_lead_activities', `Got ${r.data?.length} rows`);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 5. crm_lead_activities UPDATE — task completion scenario
  // ═════════════════════════════════════════════════════════════════════════
  section('5. crm_lead_activities — UPDATE policy (task completion)');

  if (insertedActivityIds.length > 0) {
    const actId = insertedActivityIds[0];

    // developer can mark task completed
    {
      const r = await req('PATCH',
        `/rest/v1/crm_lead_activities?id=eq.${actId}`,
        {completed: true},
        dev
      );
      r.status === 200
        ? pass('developer can UPDATE activity (mark completed)')
        : fail('developer can UPDATE activity', `HTTP ${r.status} ${JSON.stringify(r.data)}`);
    }

    // consultant can update activity
    if (insertedActivityIds.length > 1) {
      const actId2 = insertedActivityIds[1];
      const r = await req('PATCH',
        `/rest/v1/crm_lead_activities?id=eq.${actId2}`,
        {completed: true},
        cons
      );
      r.status === 200
        ? pass('consultant can UPDATE activity (mark completed)')
        : fail('consultant can UPDATE activity', `HTTP ${r.status} ${JSON.stringify(r.data)}`);
    }

    // contractor CANNOT update activity
    {
      const r = await req('PATCH',
        `/rest/v1/crm_lead_activities?id=eq.${actId}`,
        {notes: 'HACKED by contractor'},
        cont
      );
      (r.status !== 200 || (Array.isArray(r.data) && r.data.length === 0))
        ? pass('contractor cannot UPDATE crm_lead_activity (RLS blocks)')
        : fail('contractor cannot UPDATE crm_lead_activity', `HTTP ${r.status}`);
    }

    // cleanup inserted test activities
    for (const id of insertedActivityIds) {
      await req('DELETE', `/rest/v1/crm_lead_activities?id=eq.${id}`, null, dev);
    }
    pass('Test activities cleaned up');
  } else {
    skip('Activity UPDATE tests', 'No test activities were created');
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 6. crm_leads — rating + converted_unit_id field access
  // ═════════════════════════════════════════════════════════════════════════
  section('6. crm_leads — rating + converted_unit_id field access');

  {
    // developer can read rating field
    const r = await req('GET', '/rest/v1/crm_leads?select=id,rating,converted_unit_id&limit=3', null, dev);
    if (r.status === 200 && Array.isArray(r.data)) {
      pass(`developer can read crm_leads.rating (${r.data.length} rows)`);
      // Check schema — rating field should exist (value null or hot/warm/cold)
      const hasRatingField = r.data.length === 0 || 'rating' in r.data[0];
      hasRatingField
        ? pass('crm_leads.rating column exists in schema')
        : fail('crm_leads.rating column missing', 'field not in response');
      const hasConvertedField = r.data.length === 0 || 'converted_unit_id' in r.data[0];
      hasConvertedField
        ? pass('crm_leads.converted_unit_id column exists in schema')
        : fail('crm_leads.converted_unit_id column missing', 'field not in response');
    } else {
      fail('developer read crm_leads with rating', `HTTP ${r.status}`);
    }

    // contractor cannot read crm_leads
    const r2 = await req('GET', '/rest/v1/crm_leads?select=id,rating&limit=3', null, cont);
    (r2.status !== 200 || (Array.isArray(r2.data) && r2.data.length === 0))
      ? pass('contractor cannot read crm_leads (RLS blocks)')
      : fail('contractor cannot read crm_leads', `Got ${r2.data?.length} rows`);

    // subcontractor cannot read crm_leads
    const r3 = await req('GET', '/rest/v1/crm_leads?select=id,rating&limit=3', null, sub);
    (r3.status !== 200 || (Array.isArray(r3.data) && r3.data.length === 0))
      ? pass('subcontractor cannot read crm_leads (RLS blocks)')
      : fail('subcontractor cannot read crm_leads', `Got ${r3.data?.length} rows`);
  }

  // developer can write rating
  if (testLeadId) {
    const r = await req('PATCH', `/rest/v1/crm_leads?id=eq.${testLeadId}`,
      {rating: 'hot'}, dev);
    r.status === 200
      ? pass('developer can set lead rating to hot')
      : fail('developer set lead rating', `HTTP ${r.status}`);

    // reset rating
    await req('PATCH', `/rest/v1/crm_leads?id=eq.${testLeadId}`, {rating: null}, dev);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 7. crm_notifications — RLS (SELECT / INSERT block / UPDATE isolation)
  // ═════════════════════════════════════════════════════════════════════════
  section('7. crm_notifications — RLS');

  {
    // Resolve user IDs for dev + consultant.
    const devUserResp = await req('GET', '/auth/v1/user', null, dev);
    const consUserResp = await req('GET', '/auth/v1/user', null, cons);
    const devUserId  = devUserResp.data?.id || null;
    const consUserId = consUserResp.data?.id || null;

    if (!devUserId || !consUserId || !testLeadId) {
      skip('crm_notifications RLS', 'missing dev/cons user id or testLeadId');
    } else {
      const seededActivityIds = [];
      const seededNotifIds    = [];

      try {
        // ── Seed via SERVICE_KEY: bypasses RLS, fires fan_out trigger. ──
        // Activity 1: dev mentions consultant → 1 notif row for consultant.
        const seed1 = await reqSvc('POST', '/rest/v1/crm_lead_activities', {
          lead_id: testLeadId,
          author_id: devUserId,
          author_name: 'Test Developer',
          method: 'note',
          contacted_at: new Date().toISOString(),
          body: '@[Cons](x) RLS notif seed dev->cons',
          mentions: [consUserId],
        });
        if (seed1.status === 201 && seed1.data?.[0]?.id) {
          seededActivityIds.push(seed1.data[0].id);
        } else {
          fail('Seed activity (dev mentions cons)', `HTTP ${seed1.status} ${JSON.stringify(seed1.data)}`);
        }

        // Activity 2: consultant mentions developer → 1 notif row for developer.
        const seed2 = await reqSvc('POST', '/rest/v1/crm_lead_activities', {
          lead_id: testLeadId,
          author_id: consUserId,
          author_name: 'Test Consultant',
          method: 'note',
          contacted_at: new Date().toISOString(),
          body: '@[Dev](x) RLS notif seed cons->dev',
          mentions: [devUserId],
        });
        if (seed2.status === 201 && seed2.data?.[0]?.id) {
          seededActivityIds.push(seed2.data[0].id);
        } else {
          fail('Seed activity (cons mentions dev)', `HTTP ${seed2.status} ${JSON.stringify(seed2.data)}`);
        }

        // Fetch the seeded notif rows via service key for cleanup + UPDATE test.
        let devNotifId = null, consNotifId = null;
        if (seededActivityIds.length > 0) {
          const notifLookup = await reqSvc('GET',
            `/rest/v1/crm_notifications?select=id,user_id,activity_id&activity_id=in.(${seededActivityIds.join(',')})`,
            null);
          if (notifLookup.status === 200 && Array.isArray(notifLookup.data)) {
            for (const n of notifLookup.data) {
              seededNotifIds.push(n.id);
              if (n.user_id === devUserId)  devNotifId  = n.id;
              if (n.user_id === consUserId) consNotifId = n.id;
            }
          }
        }

        // ── Test A: SELECT isolation. ──
        {
          const r = await req('GET',
            '/rest/v1/crm_notifications?select=id,user_id&limit=100', null, dev);
          if (r.status === 200 && Array.isArray(r.data)) {
            const foreign = r.data.filter(n => n.user_id !== devUserId);
            foreign.length === 0
              ? pass(`developer sees only own crm_notifications (${r.data.length} rows)`)
              : fail('developer SELECT isolation', `${foreign.length} foreign rows leaked`);
          } else {
            fail('developer SELECT crm_notifications', `HTTP ${r.status}`);
          }
        }
        {
          const r = await req('GET',
            '/rest/v1/crm_notifications?select=id,user_id&limit=100', null, cons);
          if (r.status === 200 && Array.isArray(r.data)) {
            const foreign = r.data.filter(n => n.user_id !== consUserId);
            foreign.length === 0
              ? pass(`consultant sees only own crm_notifications (${r.data.length} rows)`)
              : fail('consultant SELECT isolation', `${foreign.length} foreign rows leaked`);
          } else {
            fail('consultant SELECT crm_notifications', `HTTP ${r.status}`);
          }
        }

        // ── Test B: direct INSERT is blocked (no INSERT policy). ──
        {
          const r = await req('POST', '/rest/v1/crm_notifications', {
            user_id: devUserId,
            type: 'mention',
            lead_id: testLeadId,
            activity_id: seededActivityIds[0] || '00000000-0000-0000-0000-000000000000',
            actor_name: 'Hacker',
            snippet: 'direct insert attempt',
          }, dev);
          r.status !== 201
            ? pass(`developer blocked from direct INSERT into crm_notifications (HTTP ${r.status})`)
            : fail('developer blocked from direct INSERT into crm_notifications',
                   'Insert succeeded — RLS gap (no INSERT policy expected)');
        }

        // ── Test C: UPDATE isolation. ──
        if (devNotifId) {
          const r1 = await req('PATCH',
            `/rest/v1/crm_notifications?id=eq.${devNotifId}`,
            { read_at: new Date().toISOString() }, dev);
          (r1.status === 200 && Array.isArray(r1.data) && r1.data.length === 1)
            ? pass('developer can UPDATE own crm_notification (mark read)')
            : fail('developer UPDATE own crm_notification',
                   `HTTP ${r1.status} rows=${Array.isArray(r1.data)?r1.data.length:'?'}`);
        } else {
          skip('developer UPDATE own crm_notification', 'no dev notif row seeded');
        }

        if (consNotifId) {
          const r2 = await req('PATCH',
            `/rest/v1/crm_notifications?id=eq.${consNotifId}`,
            { read_at: new Date().toISOString() }, dev);
          (r2.status === 200 && Array.isArray(r2.data) && r2.data.length === 0)
            ? pass('developer cannot UPDATE other user crm_notification (RLS hides row)')
            : fail('developer UPDATE other user crm_notification',
                   `HTTP ${r2.status} rows=${Array.isArray(r2.data)?r2.data.length:'?'}`);
        } else {
          skip('developer cannot UPDATE other user crm_notification', 'no cons notif row seeded');
        }

      } finally {
        // Cleanup: notifs first (cascade also handles it, but be explicit), then activities.
        if (seededNotifIds.length > 0) {
          await reqSvc('DELETE',
            `/rest/v1/crm_notifications?id=in.(${seededNotifIds.join(',')})`,
            null);
        }
        if (seededActivityIds.length > 0) {
          await reqSvc('DELETE',
            `/rest/v1/crm_lead_activities?id=in.(${seededActivityIds.join(',')})`,
            null);
        }
        pass('crm_notifications test rows cleaned up');
      }
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═════════════════════════════════════════════════════════════════════════
  const passed = results.filter(r=>r.status==='PASS').length;
  const failed = results.filter(r=>r.status==='FAIL').length;
  const skipped = results.filter(r=>r.status==='SKIP').length;
  console.log('\n' + '═'.repeat(72));
  console.log(`  ${passed} PASS  ${failed} FAIL  ${skipped} SKIP  (${results.length} total)`);
  console.log('═'.repeat(72));
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
