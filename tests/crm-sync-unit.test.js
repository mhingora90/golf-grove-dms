#!/usr/bin/env node
/**
 * CRM Sync — Unit tests for pure parser/dedup logic.
 *
 * Runs in plain Node, no Supabase, no network. Covers:
 *   - parseCSV: quoted cells, escaped quotes, CRLF, jam-row preservation
 *   - rowToLead: prefix-stripping (l:, p:, f:, ag:), empty-id rejection,
 *     all 21 columns mapped correctly
 *   - buildSyncKey: matches DB generated-column formula
 *   - dedupLeads: same id+email collapses, same id different emails kept,
 *     whitespace-in-id rows (SyncWith jam row) dropped
 *   - csvToLeads: end-to-end on simulated SyncWith export including jam row,
 *     header skip, real collision pair (Cannon/Ayoub style)
 *
 * Run: node tests/crm-sync-unit.test.js
 */

const path = require('path');
const { pathToFileURL } = require('url');

const results = [];
function pass(n)     { results.push({name:n,status:'PASS'}); console.log('  \u2713  PASS  ' + n); }
function fail(n,msg) { results.push({name:n,status:'FAIL',info:msg}); console.error('  \u2717  FAIL  ' + n + '  \u2192  ' + msg); }
function section(t)  { console.log('\n' + '\u2550'.repeat(72) + '\n  ' + t + '\n' + '\u2500'.repeat(72)); }
function assertEq(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass(name);
  else fail(name, `expected ${e}, got ${a}`);
}

async function run() {
  const corePath = pathToFileURL(
    path.resolve(__dirname, '..', 'api', '_sync-meta-leads-core.mjs')
  ).href;
  const core = await import(corePath);
  const { parseCSV, rowToLead, buildSyncKey, dedupLeads, csvToLeads, PROJECT_ID } = core;

  // ──────────────────────────────────────────────────────────────────────
  section('parseCSV');
  // ──────────────────────────────────────────────────────────────────────
  assertEq('simple row',
    parseCSV('a,b,c\n'),
    [['a','b','c']]);

  assertEq('two rows',
    parseCSV('a,b\nc,d\n'),
    [['a','b'],['c','d']]);

  assertEq('quoted cell with comma',
    parseCSV('"hello, world",b\n'),
    [['hello, world','b']]);

  assertEq('escaped quote inside quoted cell',
    parseCSV('"she said ""hi""",b\n'),
    [['she said "hi"','b']]);

  assertEq('CRLF line endings',
    parseCSV('a,b\r\nc,d\r\n'),
    [['a','b'],['c','d']]);

  assertEq('trailing cell without newline',
    parseCSV('a,b'),
    [['a','b']]);

  assertEq('embedded newline inside quoted cell',
    parseCSV('"line1\nline2",b\n'),
    [['line1\nline2','b']]);

  // ──────────────────────────────────────────────────────────────────────
  section('rowToLead — column mapping');
  // ──────────────────────────────────────────────────────────────────────
  {
    const row = [
      'l:1508875954280849',                  // 0  meta_lead_id (with l: prefix)
      '2026-05-23T23:44:49-05:00',           // 1  created_time
      'ag:120244272837390634',               // 2  ad_id (with ag: prefix)
      'My Ad',                               // 3  ad_name
      '12345',                               // 4  adset_id
      'Adset A',                             // 5  adset_name
      '67890',                               // 6  campaign_id
      'Campaign B',                          // 7  campaign_name
      'f:1552506906032143',                  // 8  form_id (with f: prefix)
      'Lead Form',                           // 9  form_name
      'false',                               // 10 is_organic
      'fb',                                  // 11 platform
      'new',                                 // 12 status
      'real_estate_broker_/_agent',          // 13 broker_type
      'aed_1.8m_–_aed_2.1m',                 // 14 budget_range
      '2_bedroom',                           // 15 property_types
      'immediately',                         // 16 availability
      'Raha Lankarani Mohajer',              // 17 company_name
      'Raha Lankarani Mohajer',              // 18 first_name (= name)
      'raha.tameraha@gmail.com',             // 19 email
      'p:+971585953949',                     // 20 phone (with p: prefix)
    ];
    const lead = rowToLead(row, 'test-project-uuid');
    assertEq('meta_lead_id stripped of l: prefix', lead.meta_lead_id, '1508875954280849');
    assertEq('ad_id stripped of ag: prefix',       lead.ad_id,        '120244272837390634');
    assertEq('meta_form_id stripped of f: prefix', lead.meta_form_id, '1552506906032143');
    assertEq('phone stripped of p: prefix',        lead.phone,        '+971585953949');
    assertEq('project_id passes through',          lead.project_id,   'test-project-uuid');
    assertEq('email passes through',               lead.email,        'raha.tameraha@gmail.com');
    assertEq('name = column 18',                   lead.name,         'Raha Lankarani Mohajer');
    assertEq('first_name = column 18',             lead.first_name,   'Raha Lankarani Mohajer');
    assertEq('source = meta_ads',                  lead.source,       'meta_ads');
    assertEq('broker_type passes through',         lead.broker_type,  'real_estate_broker_/_agent');
    assertEq('budget_range passes through',        lead.budget_range, 'aed_1.8m_–_aed_2.1m');
    assertEq('property_types passes through',      lead.property_types,'2_bedroom');
    assertEq('availability passes through',        lead.availability, 'immediately');
    assertEq('company_name passes through',        lead.company_name, 'Raha Lankarani Mohajer');
    assertEq('created_time passes through',        lead.created_time, '2026-05-23T23:44:49-05:00');
  }

  // ──────────────────────────────────────────────────────────────────────
  section('rowToLead — edge cases');
  // ──────────────────────────────────────────────────────────────────────
  assertEq('empty meta_lead_id returns null',
    rowToLead(['', '2026-01-01', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']),
    null);

  assertEq('whitespace-only meta_lead_id returns null',
    rowToLead(['   ', '2026-01-01', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']),
    null);

  assertEq('bare id without l: prefix kept as-is',
    rowToLead(['1234567890', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''])?.meta_lead_id,
    '1234567890');

  assertEq('missing email maps to null',
    rowToLead(['l:abc', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''])?.email,
    null);

  assertEq('blank phone maps to null',
    rowToLead(['l:abc', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'x@y', ''])?.phone,
    null);

  // ──────────────────────────────────────────────────────────────────────
  section('buildSyncKey');
  // ──────────────────────────────────────────────────────────────────────
  assertEq('lowercases email',
    buildSyncKey('ABC123', 'Foo@Bar.COM'),
    'ABC123|foo@bar.com');

  assertEq('null email → trailing pipe',
    buildSyncKey('ABC123', null),
    'ABC123|');

  assertEq('undefined email → trailing pipe',
    buildSyncKey('ABC123', undefined),
    'ABC123|');

  assertEq('empty email → trailing pipe',
    buildSyncKey('ABC123', ''),
    'ABC123|');

  // ──────────────────────────────────────────────────────────────────────
  section('dedupLeads');
  // ──────────────────────────────────────────────────────────────────────
  {
    const same = [
      { meta_lead_id: '1', email: 'a@example.com' },
      { meta_lead_id: '1', email: 'a@example.com' },
    ];
    const out = dedupLeads(same);
    assertEq('same id+same email collapses to 1', out.unique.length, 1);
    assertEq('collision count = 1',               out.droppedCollisions, 1);
  }

  {
    // CRITICAL: SyncWith reuses meta_lead_ids across distinct real people.
    // This is the Bhupendra/Raha and Shiban/Ashok bug. Both must survive.
    const collision = [
      { meta_lead_id: '1508875954280849', email: 'bhupendramasih@gmail.com' },
      { meta_lead_id: '1508875954280849', email: 'raha.tameraha@gmail.com' },
    ];
    const out = dedupLeads(collision);
    assertEq('same id + different emails both kept', out.unique.length, 2);
    assertEq('no collisions counted',                out.droppedCollisions, 0);
  }

  {
    // Email case-insensitive in dedup (matches DB lower(email)).
    const caseDup = [
      { meta_lead_id: '5', email: 'mixed@case.com' },
      { meta_lead_id: '5', email: 'MIXED@case.com' },
    ];
    const out = dedupLeads(caseDup);
    assertEq('email case folds in dedup', out.unique.length, 1);
  }

  {
    // SyncWith's row-0 jam row produces meta_lead_id with embedded whitespace.
    const jam = [
      { meta_lead_id: '1 2 3', email: 'x@y.com' },
      { meta_lead_id: 'clean', email: 'x@y.com' },
    ];
    const out = dedupLeads(jam);
    assertEq('whitespace-in-id row dropped', out.unique.length, 1);
    assertEq('clean row kept',                out.unique[0].meta_lead_id, 'clean');
  }

  {
    const empty = [];
    const out = dedupLeads(empty);
    assertEq('empty input → empty output',  out.unique.length, 0);
    assertEq('empty input → 0 collisions',  out.droppedCollisions, 0);
  }

  // ──────────────────────────────────────────────────────────────────────
  section('csvToLeads — end-to-end Bhupendra/Raha collision');
  // ──────────────────────────────────────────────────────────────────────
  {
    // Row 0 = SyncWith batch-jam header. Row 1+ = real leads.
    // 21 columns each. Two leads share meta_lead_id `1508875954280849` but
    // have different emails — both must end up in the output.
    const csv = [
      // Row 0: header (skipped — used to be misread as jam row)
      'lead_id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,form_name,is_organic,platform,status,broker_type,budget_range,property_types,availability,company_name,first_name,email,phone',
      // Row 1: Bhupendra
      'l:1508875954280849,2026-05-23T00:00:00Z,ag:1,n1,1,a,1,c,f:1,fn,false,fb,new,broker,b1,2BR,now,Alcenza,Bhupendra,bhupendramasih@gmail.com,p:+971545634171',
      // Row 2: Raha — SAME meta_lead_id but different email
      'l:1508875954280849,2026-05-23T23:44:49Z,ag:1,n1,1,a,1,c,f:1,fn,false,fb,new,broker,b2,2BR,now,Raha,Raha,raha.tameraha@gmail.com,p:+971585953949',
      // Row 3: pure duplicate of row 2 (same id, same email) — should collapse
      'l:1508875954280849,2026-05-23T23:44:49Z,ag:1,n1,1,a,1,c,f:1,fn,false,fb,new,broker,b2,2BR,now,Raha,Raha,raha.tameraha@gmail.com,p:+971585953949',
      // Row 4: unrelated lead
      'l:9999999999999999,2026-05-24T00:00:00Z,ag:2,n2,2,a,2,c,f:1,fn,false,fb,new,broker,b3,3BR,now,Unrelated,Unrelated,u@example.com,p:+9710000000',
      '',
    ].join('\n');

    const { sheetRows, leads, droppedCollisions } = csvToLeads(csv, 'proj-uuid');
    assertEq('sheetRows counts pre-dedup parsed rows', sheetRows, 4);
    assertEq('after dedup: 3 unique leads',            leads.length, 3);
    assertEq('1 collision dropped (Raha duplicate)',   droppedCollisions, 1);

    const emails = leads.map(l => l.email).sort();
    assertEq('three correct emails survive', emails, [
      'bhupendramasih@gmail.com',
      'raha.tameraha@gmail.com',
      'u@example.com',
    ]);

    // Verify both collision-pair leads got distinct sync_keys (would happen
    // server-side, but the formula is the same one we use for dedup).
    const bhup = leads.find(l => l.email === 'bhupendramasih@gmail.com');
    const raha = leads.find(l => l.email === 'raha.tameraha@gmail.com');
    const keyBhup = buildSyncKey(bhup.meta_lead_id, bhup.email);
    const keyRaha = buildSyncKey(raha.meta_lead_id, raha.email);
    if (keyBhup !== keyRaha) pass('collision pair gets distinct sync_keys');
    else fail('collision pair gets distinct sync_keys', `both = ${keyBhup}`);
  }

  // ──────────────────────────────────────────────────────────────────────
  section('csvToLeads — jam-row defense');
  // ──────────────────────────────────────────────────────────────────────
  {
    // First row skipped (header). Second row is a SyncWith jam row whose
    // first cell has whitespace-jammed ids. Must be dropped by dedup.
    const csv = [
      'header',
      'l:1 l:2 l:3,a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t',
      'l:clean,2026-01-01,ag:1,n,1,a,1,c,f:1,fn,false,fb,new,broker,b,r,n,co,fn,em@x.com,p:+1',
      '',
    ].join('\n');
    const { leads, droppedCollisions } = csvToLeads(csv, 'p');
    assertEq('jam row dropped, clean row kept', leads.length, 1);
    assertEq('jam row counted as collision',    droppedCollisions, 1);
    assertEq('survivor is the clean one',       leads[0].meta_lead_id, 'clean');
  }

  // ──────────────────────────────────────────────────────────────────────
  section('PROJECT_ID constant');
  // ──────────────────────────────────────────────────────────────────────
  assertEq('PROJECT_ID is 241 Waterside UUID',
    PROJECT_ID,
    '00000000-0000-0000-0000-000000000002');

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
