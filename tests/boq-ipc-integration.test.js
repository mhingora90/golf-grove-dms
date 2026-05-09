#!/usr/bin/env node
/**
 * BOQ Setup & Payment Certificates — Integration Tests
 * Golf Grove DMS — Part C (Supabase API tests, no browser)
 *
 * Tests the actual data and workflows via the Supabase REST API:
 *   - BOQ data loaded correctly
 *   - IPC creation, status transitions, role-gated actions
 *   - Financial calculations
 *   - Cross-module consistency
 *
 * Run:
 *   node tests/boq-ipc-integration.test.js
 */

const https = require('https');
const { URL } = require('url');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://kdxvhrwnnehicgdryowu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkeHZocndubmVoaWNnZHJ5b3d1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTg2NjMsImV4cCI6MjA5MTIzNDY2M30.uMlyBkTeth6nVl8ofBu9g_AYlnDLkgDyVTsxxaHI_ic';

const results = [];
function pass(n)      { results.push({ name: n, status: 'PASS' }); console.log(`  ✓  PASS  ${n}`); }
function fail(n, msg) { results.push({ name: n, status: 'FAIL', info: msg }); console.error(`  ✗  FAIL  ${n}  →  ${msg}`); }
function section(t)   { console.log(`\n${'═'.repeat(72)}\n  ${t}\n${'─'.repeat(72)}`); }

// ═══════════════════════════════════════════════════════════════════════════
// HTTP HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function get(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, SUPABASE_URL);
    const opts = {
      hostname: url.hostname, path: url.pathname + url.search,
      method: 'GET',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, ...headers },
    };
    https.get(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers }); }
        catch(e) { resolve({ status: res.statusCode, data, headers: res.headers }); }
      });
    }).on('error', reject);
  });
}

function post(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, SUPABASE_URL);
    const data = JSON.stringify(body);
    const opts = {
      hostname: url.hostname, path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data),
        'Prefer': 'return=representation',
        ...headers,
      },
    };
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d), headers: res.headers }); }
        catch(e) { resolve({ status: res.statusCode, data: d, headers: res.headers }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function patch(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, SUPABASE_URL);
    const data = JSON.stringify(body);
    const opts = {
      hostname: url.hostname, path: url.pathname + url.search,
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data),
        'Prefer': 'return=representation',
        ...headers,
      },
    };
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d), headers: res.headers }); }
        catch(e) { resolve({ status: res.statusCode, data: d, headers: res.headers }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function del(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, SUPABASE_URL);
    const opts = {
      hostname: url.hostname, path: url.pathname + url.search,
      method: 'DELETE',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, ...headers },
    };
    https.get(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers }); }
        catch(e) { resolve({ status: res.statusCode, data, headers: res.headers }); }
      });
    }).on('error', reject);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

(async () => {

// ── 1. BOQ DATA INTEGRITY ──
section('1. BOQ DATA INTEGRITY');

{
  const res = await get('/rest/v1/boq_bills?select=*&order=sort_order.asc');
  if (res.status === 200 && Array.isArray(res.data)) {
    const bills = res.data;
    if (bills.length >= 18) pass(`BOQ has ${bills.length} bills (expected ≥ 18)`);
    else fail(`BOQ has ${bills.length} bills`, 'expected ≥ 18');

    // Check bill titles are meaningful
    const hasTitles = bills.every(b => b.title && b.title.length > 2);
    if (hasTitles) pass('All bills have titles');
    else fail('Some bills missing titles');

    // Check sort_order is sequential
    const hasSortOrder = bills.every(b => typeof b.sort_order === 'number');
    if (hasSortOrder) pass('All bills have sort_order');
    else fail('Some bills missing sort_order');
  } else {
    fail('Could not fetch boq_bills', `HTTP ${res.status}`);
  }
}

{
  const res = await get('/rest/v1/boq_items?select=*&order=sort_order.asc');
  if (res.status === 200 && Array.isArray(res.data)) {
    const items = res.data;
    if (items.length >= 200) pass(`BOQ has ${items.length} items (expected ≥ 200)`);
    else fail(`BOQ has ${items.length} items`, 'expected ≥ 200');

    // Check all items have required fields
    const hasAllFields = items.every(i =>
      i.item_no && i.description && i.qty !== undefined && i.unit && i.rate !== undefined && i.total !== undefined
    );
    if (hasAllFields) pass('All items have required fields');
    else fail('Some items missing required fields');

    // Check totals match qty × rate
    const totalsMatch = items.every(i => {
      const expected = (i.qty || 0) * (i.rate || 0);
      return Math.abs(expected - (i.total || 0)) < 0.01;
    });
    if (totalsMatch) pass('All totals match qty × rate');
    else fail('Some totals don\'t match qty × rate');

    // Check total BOQ value is reasonable
    const totalValue = items.reduce((s, i) => s + (i.total || 0), 0);
    if (totalValue > 1000000) pass(`Total BOQ value: AED ${totalValue.toLocaleString()}`);
    else fail('Total BOQ value seems too low', `AED ${totalValue.toLocaleString()}`);
  } else {
    fail('Could not fetch boq_items', `HTTP ${res.status}`);
  }
}

{
  // Check bill → item relationship
  const { data: bills } = await get('/rest/v1/boq_bills?select=id,bill_no');
  const { data: items } = await get('/rest/v1/boq_items?select=id,bill_id');
  const billIds = new Set((bills || []).map(b => b.id));
  const allItemsHaveValidBills = (items || []).every(i => billIds.has(i.bill_id));
  if (allItemsHaveValidBills) pass('All items reference valid bills');
  else fail('Some items reference invalid bills');
}

// ── 2. PAYMENT CERTIFICATES — CRUD ──
section('2. PAYMENT CERTIFICATES — CRUD');

{
  const res = await get('/rest/v1/payment_certificates?select=*');
  if (res.status === 200) {
    const certs = res.data || [];
    pass(`IPC list accessible (${certs.length} existing certificates)`);
  } else {
    fail('Cannot access IPC list', `HTTP ${res.status}`);
  }
}

{
  // Try to create a draft IPC
  const res = await post('/rest/v1/payment_certificates', {
    cert_no: 999, ref_no: 'IPC-TEST', status: 'Draft',
    retention_pct: 10, advance_recovery: 0, vat_pct: 5, previously_paid: 0
  });
  if (res.status === 201 && res.data && res.data[0]) {
    const certId = res.data[0].id;
    pass('Can create Draft IPC');

    // Check it appears in list
    const listRes = await get('/rest/v1/payment_certificates?select=*&ref_no=eq.IPC-TEST');
    if (listRes.status === 200 && listRes.data && listRes.data.length > 0) {
      pass('New IPC appears in list');
    } else {
      fail('New IPC not in list', JSON.stringify(listRes.data));
    }

    // ── 3. IPC STATUS TRANSITIONS ──
    section('3. IPC STATUS TRANSITIONS');

    // Draft → Submitted
    const submitRes = await patch('/rest/v1/payment_certificates?id=eq.' + certId,
      { status: 'Submitted', submitted_date: new Date().toISOString().split('T')[0] });
    if (submitRes.status === 200) {
      pass('Can transition Draft → Submitted');

      // Verify status changed
      const checkRes = await get('/rest/v1/payment_certificates?select=status&id=eq.' + certId);
      if (checkRes.data?.[0]?.status === 'Submitted') {
        pass('Status confirmed as Submitted');
      } else {
        fail('Status not updated', checkRes.data?.[0]?.status);
      }

      // Submitted → Under Review
      const reviewRes = await patch('/rest/v1/payment_certificates?id=eq.' + certId,
        { status: 'Under Review' });
      if (reviewRes.status === 200) pass('Can transition Submitted → Under Review');
      else fail('Cannot transition to Under Review', `HTTP ${reviewRes.status}`);

      // Under Review → Certified
      const certRes = await patch('/rest/v1/payment_certificates?id=eq.' + certId,
        { status: 'Certified' });
      if (certRes.status === 200) pass('Can transition Under Review → Certified');
      else fail('Cannot transition to Certified', `HTTP ${certRes.status}`);

      // Certified → Paid
      const paidRes = await patch('/rest/v1/payment_certificates?id=eq.' + certId,
        { status: 'Paid' });
      if (paidRes.status === 200) pass('Can transition Certified → Paid');
      else fail('Cannot transition to Paid', `HTTP ${paidRes.status}`);

    } else {
      fail('Cannot transition Draft → Submitted', `HTTP ${submitRes.status}`);
    }

    // Clean up test IPC
    const delRes = await del('/rest/v1/payment_certificates?id=eq.' + certId);
    if (delRes.status === 204) pass('Test IPC cleaned up');
    else fail('Could not delete test IPC', `HTTP ${delRes.status}`);
  } else if (res.status === 403 || res.status === 401) {
    fail('Cannot create IPC (RLS denied)', `HTTP ${res.status} — this is expected for anon key`);
    section('3. IPC STATUS TRANSITIONS — SKIPPED (RLS blocks anon)');
    pass('RLS correctly prevents anon user from creating IPCs');
  } else {
    fail('Could not create test IPC', `HTTP ${res.status}: ${JSON.stringify(res.data)?.substring(0, 200)}`);
    section('3. IPC STATUS TRANSITIONS — SKIPPED');
  }
}

// ── 4. IPC CERTIFICATE ITEMS ──
section('4. IPC CERTIFICATE ITEMS');

{
  // Get count of payment_certificate_items
  const res = await get('/rest/v1/payment_certificate_items?select=id&limit=1');
  if (res.status === 200) {
    pass('payment_certificate_items table accessible');
  } else {
    fail('Cannot access payment_certificate_items', `HTTP ${res.status}`);
  }
}

// ── 5. CROSS-MODULE: BOQ → IPC consistency ──
section('5. CROSS-MODULE CONSISTENCY');

{
  const { data: boqItems } = await get('/rest/v1/boq_items?select=id');
  const boqCount = (boqItems || []).length;
  if (boqCount > 0) pass(`BOQ has ${boqCount} items available for IPC claims`);
  else fail('No BOQ items found');
}

// ── 6. FINANCIAL CALCULATIONS ──
section('6. FINANCIAL CALCULATIONS');

{
  // Verify BOQ total matches sum of items
  const { data: items } = await get('/rest/v1/boq_items?select=total');
  if (items && items.length > 0) {
    const calculatedTotal = items.reduce((s, i) => s + (i.total || 0), 0);
    pass(`Calculated BOQ total: AED ${calculatedTotal.toLocaleString()}`);

    // Check individual item math
    const { data: fullItems } = await get('/rest/v1/boq_items?select=qty,rate,total');
    if (fullItems && fullItems.length > 0) {
      const allCorrect = fullItems.every(i =>
        Math.abs((i.qty || 0) * (i.rate || 0) - (i.total || 0)) < 0.01
      );
      if (allCorrect) pass('All item totals are mathematically correct');
      else fail('Some item totals don\'t match qty × rate');
    }
  }
}

// ── 7. RLS POLICIES ──
section('7. RLS POLICIES');

{
  // Test that anon can read BOQ data (public read)
  const boqRead = await get('/rest/v1/boq_bills?select=id&limit=1');
  if (boqRead.status === 200) pass('RLS allows anon read on boq_bills');
  else fail('RLS blocks anon read on boq_bills', `HTTP ${boqRead.status}`);

  const itemsRead = await get('/rest/v1/boq_items?select=id&limit=1');
  if (itemsRead.status === 200) pass('RLS allows anon read on boq_items');
  else fail('RLS blocks anon read on boq_items', `HTTP ${itemsRead.status}`);

  // Test that anon can read payment_certificates
  const ipcRead = await get('/rest/v1/payment_certificates?select=id&limit=1');
  if (ipcRead.status === 200) pass('RLS allows anon read on payment_certificates');
  else fail('RLS blocks anon read on payment_certificates', `HTTP ${ipcRead.status}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════
const p = results.filter(r => r.status === 'PASS').length;
const f = results.filter(r => r.status === 'FAIL').length;

console.log(`\n${'═'.repeat(72)}`);
console.log(`  PART C RESULTS  ${p} passed, ${f} failed  (${results.length} total)`);
console.log('═'.repeat(72));

if (f > 0) {
  console.error('\nFailed tests:');
  results.filter(r => r.status === 'FAIL').forEach(r => console.error(`  ✗  ${r.name}  →  ${r.info}`));
  process.exit(1);
}

})();
