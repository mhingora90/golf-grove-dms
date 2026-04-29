/**
 * Test-data seed helpers.
 *
 * Each create*() function inserts a minimal valid record using the service role
 * and returns its UUID.  Pass all returned IDs to cleanup() at the end of your
 * test to remove everything from the database and storage.
 *
 * Usage pattern:
 *
 *   const { createDrawing, createSubmittal, cleanup } = require('./helpers/seed');
 *   const toDelete = {};
 *   const drawId = await createDrawing(toDelete);
 *   // ... test ...
 *   await cleanup(toDelete);
 */

const path = require('path');
const { api } = require('./api');

const TODAY = new Date().toISOString().split('T')[0];

function track(toDelete, table, id) {
  if (!id) return id;
  (toDelete[table] = toDelete[table] || []).push(id);
  return id;
}
function trackStorage(toDelete, bucket, filePath) {
  const key = `__storage__${bucket}`;
  (toDelete[key] = toDelete[key] || []).push(filePath);
}

// ── Drawing ───────────────────────────────────────────────────────────────────

async function createDrawing(toDelete, overrides = {}) {
  const TS = Date.now();
  const r = await api('POST', '/rest/v1/drawings', {
    drawing_no : `TST-${TS}`,
    title      : `Test Drawing ${TS}`,
    discipline : 'Structural',
    status     : 'Issued for Construction',
    revision   : 'A',
    cde_state  : 'WIP',
    ...overrides,
  });
  if (!r.ok || !r.data?.[0]?.id) throw new Error(`createDrawing failed: ${JSON.stringify(r.data)}`);
  return track(toDelete, 'drawings', r.data[0].id);
}

async function createDrawingRevision(toDelete, drawingId, overrides = {}) {
  const TS = Date.now();
  const r = await api('POST', '/rest/v1/drawing_revisions', {
    drawing_id  : drawingId,
    revision    : 'A',
    file_path   : `drawings/test-${TS}.pdf`,
    upload_date : TODAY,
    status      : 'Current',
    ...overrides,
  });
  if (!r.ok || !r.data?.[0]?.id) throw new Error(`createDrawingRevision failed: ${JSON.stringify(r.data)}`);
  return track(toDelete, 'drawing_revisions', r.data[0].id);
}

// ── Submittal ─────────────────────────────────────────────────────────────────

async function createSubmittal(toDelete, overrides = {}) {
  const TS = Date.now();
  const r = await api('POST', '/rest/v1/submittals', {
    ref_no     : `SUB-TST-${TS}`,
    title      : `Test Submittal ${TS}`,
    discipline : 'Mechanical',
    status     : 'Submitted',
    submit_date: TODAY,
    from_party : 'Contractor',
    to_party   : 'Consultant',
    ...overrides,
  });
  if (!r.ok || !r.data?.[0]?.id) throw new Error(`createSubmittal failed: ${JSON.stringify(r.data)}`);
  return track(toDelete, 'submittals', r.data[0].id);
}

// ── NCR ───────────────────────────────────────────────────────────────────────

async function createNCR(toDelete, overrides = {}) {
  const TS = Date.now();
  const r = await api('POST', '/rest/v1/ncrs', {
    ref_no     : `NCR-TST-${TS}`,
    title      : `Test NCR ${TS}`,
    status     : 'Open',
    raised_date: TODAY,
    raised_by  : 'Test',
    severity   : 'Minor',
    ...overrides,
  });
  if (!r.ok || !r.data?.[0]?.id) throw new Error(`createNCR failed: ${JSON.stringify(r.data)}`);
  return track(toDelete, 'ncrs', r.data[0].id);
}

// ── RFI ───────────────────────────────────────────────────────────────────────

async function createRFI(toDelete, overrides = {}) {
  const TS = Date.now();
  const r = await api('POST', '/rest/v1/rfis', {
    ref_no    : `RFI-TST-${TS}`,
    subject   : `Test RFI ${TS}`,
    status    : 'Open',
    raised_by : 'Test',
    from_party: 'Contractor',
    to_party  : 'Consultant',
    priority  : 'Normal',
    ...overrides,
  });
  if (!r.ok || !r.data?.[0]?.id) throw new Error(`createRFI failed: ${JSON.stringify(r.data)}`);
  return track(toDelete, 'rfis', r.data[0].id);
}

// ── Fake PDF (minimal valid PDF bytes for storage upload tests) ───────────────

function fakePdfBuffer(label = 'test') {
  const content = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n%%EOF`;
  return Buffer.from(content);
}

// ── Upload a fake file to Supabase Storage ────────────────────────────────────

async function uploadFakePdf(toDelete, bucket, filePath, { SERVICE_KEY, SUPABASE_URL } = require('../config')) {
  const buf = fakePdfBuffer(filePath);
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${filePath}`, {
    method : 'POST',
    headers: {
      Authorization  : `Bearer ${SERVICE_KEY}`,
      apikey         : SERVICE_KEY,
      'Content-Type' : 'application/pdf',
    },
    body: buf,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`uploadFakePdf(${bucket}/${filePath}) failed: ${t}`);
  }
  trackStorage(toDelete, bucket, filePath);
  return filePath;
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

async function cleanup(toDelete, { SERVICE_KEY, SUPABASE_URL } = require('../config')) {
  // Storage first (avoids FK issues if storage paths are referenced)
  for (const [key, paths] of Object.entries(toDelete)) {
    if (!key.startsWith('__storage__')) continue;
    const bucket = key.replace('__storage__', '');
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}`, {
      method : 'DELETE',
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, 'Content-Type': 'application/json' },
      body   : JSON.stringify({ prefixes: paths }),
    });
    if (!res.ok) console.warn(`  cleanup storage ${bucket}:`, await res.text());
  }

  // Delete in dependency order (children before parents)
  const ORDER = [
    'drawing_revisions',
    'drawing_attachments',
    'submittal_attachments',
    'ir_attachments',
    'ncr_attachments',
    'rfi_attachments',
    'document_audit_log',
    'drawings',
    'submittals',
    'inspection_requests',
    'ncrs',
    'rfis',
    'payment_certificate_items',
    'payment_certificates',
    'boq_items',
    'boq_bills',
  ];

  for (const table of ORDER) {
    const ids = toDelete[table];
    if (!ids?.length) continue;
    const r = await api('DELETE', `/rest/v1/${table}?id=in.(${ids.join(',')})`, undefined, SERVICE_KEY);
    if (!r.ok) console.warn(`  cleanup ${table} [${ids.join(',')}]:`, r.data);
  }
}

module.exports = {
  track,
  trackStorage,
  createDrawing,
  createDrawingRevision,
  createSubmittal,
  createNCR,
  createRFI,
  fakePdfBuffer,
  uploadFakePdf,
  cleanup,
};
