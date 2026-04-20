#!/usr/bin/env node
/**
 * Search Tests — searchReg function
 * Golf Grove DMS
 *
 * Tests the client-side search filtering logic for all 9 register pages.
 * No browser required — simulates the data-search attribute building and
 * the searchReg filter predicate in plain Node.js.
 *
 * Run:
 *   node tests/search.test.js
 */

const results = [];
let currentSection = '';

function pass(name)      { results.push({ name, status: 'PASS' }); console.log(`  ✓  PASS  ${name}`); }
function fail(name, msg) { results.push({ name, status: 'FAIL', info: msg }); console.error(`  ✗  FAIL  ${name}  →  ${msg}`); }
function section(t)      { currentSection = t; console.log(`\n${'═'.repeat(60)}\n  ${t}\n${'─'.repeat(60)}`); }

// ── SEARCH LOGIC (mirrors index.html exactly) ─────────────────────────────

/**
 * Build the data-search string the same way each register template does:
 * filter(Boolean).join(' ').replace(/"/g,' ').toLowerCase()
 */
function buildSearch(...fields) {
  return fields.filter(Boolean).join(' ').replace(/"/g, ' ').toLowerCase();
}

/**
 * The filter predicate from searchReg:
 *   const ok = !q || (r.dataset.search || '').includes(q);
 */
function matches(dataSearch, rawQuery) {
  const q = rawQuery.trim().toLowerCase();
  return !q || (dataSearch || '').includes(q);
}

// ── HELPERS ───────────────────────────────────────────────────────────────

function assertMatch(name, dataSearch, query) {
  if (matches(dataSearch, query)) pass(name);
  else fail(name, `"${dataSearch}" did not match query "${query}"`);
}

function assertNoMatch(name, dataSearch, query) {
  if (!matches(dataSearch, query)) pass(name);
  else fail(name, `"${dataSearch}" unexpectedly matched query "${query}"`);
}

function filterRows(rows, query) {
  const q = query.trim().toLowerCase();
  return rows.filter(r => !q || (r.search || '').includes(q));
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. CORE PREDICATE LOGIC
// ═══════════════════════════════════════════════════════════════════════════
section('1. CORE PREDICATE LOGIC');

// Empty / whitespace query — matches everything
assertMatch('Empty query matches any row', buildSearch('DWG-001', 'Foundation Plan'), '');
assertMatch('Whitespace-only query matches any row', buildSearch('DWG-001', 'Foundation Plan'), '   ');

// Exact match
assertMatch('Exact ref_no match', buildSearch('DWG-001'), 'DWG-001');

// Substring match
assertMatch('Partial ref_no match', buildSearch('DWG-001', 'Foundation Plan'), 'DWG');
assertMatch('Partial title match', buildSearch('DWG-001', 'Foundation Plan'), 'foundation');

// Case-insensitive
assertMatch('Uppercase query on lowercase data', buildSearch('DWG-001', 'Foundation Plan'), 'FOUNDATION');
assertMatch('Mixed-case query', buildSearch('DWG-001', 'Foundation Plan'), 'FoUnDaTiOn');

// No match
assertNoMatch('Query not in any field', buildSearch('DWG-001', 'Foundation Plan'), 'xyz_no_match');

// Quotes in source data are replaced with spaces (not breaking the attribute)
{
  const withQuote = buildSearch('RFI-005', 'What\'s the "spec"?');
  assertMatch('Quote chars replaced — still searchable by surrounding text', withQuote, 'spec');
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. DATA-SEARCH FIELD COVERAGE PER REGISTER
// ═══════════════════════════════════════════════════════════════════════════

section('2. DRAWINGS — fields: drawing_no, title, discipline, originator');
{
  const row = { drawing_no: 'A-101', title: 'Ground Floor Plan', discipline: 'Architecture', originator: 'MBC' };
  const s = buildSearch(row.drawing_no, row.title, row.discipline, row.originator);
  assertMatch('Draw — match by drawing_no', s, 'a-101');
  assertMatch('Draw — match by title',      s, 'ground floor');
  assertMatch('Draw — match by discipline', s, 'architecture');
  assertMatch('Draw — match by originator', s, 'mbc');
  assertNoMatch('Draw — no match',          s, 'structural');
}

section('3. METHOD STATEMENTS — fields: ref_no, title, activity');
{
  const row = { ref_no: 'MS-003', title: 'Concrete Pouring Procedure', activity: 'Pouring' };
  const s = buildSearch(row.ref_no, row.title, row.activity);
  assertMatch('MS — match by ref_no',   s, 'ms-003');
  assertMatch('MS — match by title',    s, 'concrete');
  assertMatch('MS — match by activity', s, 'pouring');
  assertNoMatch('MS — no match',        s, 'welding');
}

section('4. SUBMITTALS — fields: ref_no, title, from_party, to_party');
{
  const row = { ref_no: 'SUB-010', title: 'Steel Shop Drawings', from_party: 'MBC', to_party: 'POE' };
  const s = buildSearch(row.ref_no, row.title, row.from_party, row.to_party);
  assertMatch('Sub — match by ref_no',    s, 'sub-010');
  assertMatch('Sub — match by title',     s, 'steel');
  assertMatch('Sub — match by from_party',s, 'mbc');
  assertMatch('Sub — match by to_party',  s, 'poe');
  assertNoMatch('Sub — no match',         s, 'concrete');
}

section('5. INSPECTIONS (IR) — fields: ref_no, location, elements');
{
  const row = { ref_no: 'IR-007', location: 'Level 3 - Grid C', elements: 'Column C3' };
  const s = buildSearch(row.ref_no, row.location, row.elements);
  assertMatch('IR — match by ref_no',   s, 'ir-007');
  assertMatch('IR — match by location', s, 'level 3');
  assertMatch('IR — match by elements', s, 'column c3');
  assertNoMatch('IR — no match',        s, 'roof');
}

section('6. NCRs — fields: ref_no, title, location');
{
  const row = { ref_no: 'NCR-002', title: 'Rebar Spacing Non-Conformance', location: 'Basement Slab' };
  const s = buildSearch(row.ref_no, row.title, row.location);
  assertMatch('NCR — match by ref_no',   s, 'ncr-002');
  assertMatch('NCR — match by title',    s, 'rebar');
  assertMatch('NCR — match by location', s, 'basement');
  assertNoMatch('NCR — no match',        s, 'electrical');
}

section('7. RFIs — fields: ref_no, subject');
{
  const row = { ref_no: 'RFI-015', subject: 'Clarify waterproofing spec on level B1' };
  const s = buildSearch(row.ref_no, row.subject);
  assertMatch('RFI — match by ref_no',  s, 'rfi-015');
  assertMatch('RFI — match by subject', s, 'waterproofing');
  assertMatch('RFI — partial subject',  s, 'level b1');
  assertNoMatch('RFI — no match',       s, 'hvac');
}

section('8. TRANSMITTALS — fields: ref_no, notes');
{
  const row = { ref_no: 'TR-008', notes: 'Forwarding revised IFC drawings for approval' };
  const s = buildSearch(row.ref_no, row.notes);
  assertMatch('Trans — match by ref_no', s, 'tr-008');
  assertMatch('Trans — match by notes',  s, 'ifc drawings');
  assertNoMatch('Trans — no match',      s, 'invoice');
}

section('9. CORRESPONDENCE — fields: ref_no, subject');
{
  const row = { ref_no: 'CORR-004', subject: 'Extension of Time Request' };
  const s = buildSearch(row.ref_no, row.subject);
  assertMatch('Corr — match by ref_no',  s, 'corr-004');
  assertMatch('Corr — match by subject', s, 'extension of time');
  assertNoMatch('Corr — no match',       s, 'payment');
}

section('10. PUNCH LIST — fields: description, location');
{
  const row = { description: 'Cracked tile repair needed', location: 'Toilet 2A' };
  const s = buildSearch(row.description, row.location);
  assertMatch('Punch — match by description', s, 'cracked tile');
  assertMatch('Punch — match by location',    s, 'toilet 2a');
  assertNoMatch('Punch — no match',           s, 'painting');
}

// ═══════════════════════════════════════════════════════════════════════════
// 11. MULTI-ROW FILTER BEHAVIOUR
// ═══════════════════════════════════════════════════════════════════════════
section('11. MULTI-ROW FILTER BEHAVIOUR');

{
  const rows = [
    { id: 1, search: buildSearch('RFI-001', 'Fire escape route query') },
    { id: 2, search: buildSearch('RFI-002', 'HVAC duct sizing clarification') },
    { id: 3, search: buildSearch('RFI-003', 'Structural beam depth') },
  ];

  const all    = filterRows(rows, '');
  const fire   = filterRows(rows, 'fire');
  const hvac   = filterRows(rows, 'HVAC');        // case-insensitive
  const none   = filterRows(rows, 'plumbing');
  const multi  = filterRows(rows, 'rfi');          // matches all 3

  if (all.length === 3)  pass('Multi-row — empty query returns all rows');
  else fail('Multi-row — empty query returns all rows', `got ${all.length}`);

  if (fire.length === 1 && fire[0].id === 1) pass('Multi-row — "fire" matches only row 1');
  else fail('Multi-row — "fire" matches only row 1', JSON.stringify(fire.map(r=>r.id)));

  if (hvac.length === 1 && hvac[0].id === 2) pass('Multi-row — "HVAC" (case-insensitive) matches only row 2');
  else fail('Multi-row — "HVAC" matches only row 2', JSON.stringify(hvac.map(r=>r.id)));

  if (none.length === 0) pass('Multi-row — no match returns empty array');
  else fail('Multi-row — no match returns empty array', `got ${none.length}`);

  if (multi.length === 3) pass('Multi-row — "rfi" prefix matches all 3 rows');
  else fail('Multi-row — "rfi" prefix matches all 3 rows', `got ${multi.length}`);
}

// ── Empty-state message logic ─────────────────────────────────────────────
{
  // srch-empty row is shown when vis===0 && q is non-empty
  function emptyState(visibleCount, query) {
    const q = query.trim().toLowerCase();
    return !visibleCount && q;
  }

  if (emptyState(0, 'something')) pass('Empty-state — shown when 0 visible rows and non-empty query');
  else fail('Empty-state — shown when 0 visible rows and non-empty query', 'should be truthy');

  if (!emptyState(0, ''))  pass('Empty-state — hidden when query is blank');
  else fail('Empty-state — hidden when query is blank', 'should be falsy');

  if (!emptyState(2, 'rfi')) pass('Empty-state — hidden when rows are still visible');
  else fail('Empty-state — hidden when rows are still visible', 'should be falsy');
}

// ── Edge cases ────────────────────────────────────────────────────────────
section('12. EDGE CASES');

// Row with no searchable data
assertMatch('Null fields — empty data-search; empty query still matches', buildSearch(null, undefined, ''), '');
assertNoMatch('Null fields — empty data-search; any query misses', buildSearch(null, undefined, ''), 'test');

// Single-character query
assertMatch('Single char query matches', buildSearch('RFI-001', 'Fire route'), 'f');

// Numbers in query
assertMatch('Numeric ref query', buildSearch('DWG-042', 'Roof plan'), '042');

// Leading/trailing whitespace in query (trimmed by searchReg)
assertMatch('Query with leading space is trimmed', buildSearch('NCR-001', 'Crack'), '  crack  ');

// ═══════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════

const passed = results.filter(r => r.status === 'PASS').length;
const failed = results.filter(r => r.status === 'FAIL').length;

console.log(`\n${'═'.repeat(60)}`);
console.log(`  RESULTS  ${passed} passed, ${failed} failed  (${results.length} total)`);
console.log('═'.repeat(60));

if (failed > 0) {
  console.error('\nFailed tests:');
  results.filter(r => r.status === 'FAIL').forEach(r => console.error(`  ✗  ${r.name}  →  ${r.info}`));
  process.exit(1);
}
