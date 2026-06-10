// Pure logic for Meta-Ads → Supabase CRM lead sync.
// Extracted from sync-meta-leads.js so it can be unit-tested in Node without
// the edge runtime. The HTTP handler in sync-meta-leads.js wires this up to
// a real Google Sheet fetch + Supabase REST upsert.
//
// Filename starts with `_` so Vercel does not deploy it as a route.

export const SHEET_ID   = '1MilS5L6fbmbm4w1xStoVvitX5vgvyrG0RWczSHRxNqo';
export const SHEET_NAME = 'Automatic Meta Leads';
export const PROJECT_ID = '00000000-0000-0000-0000-000000000002'; // 241 Waterside

/**
 * Minimal RFC-4180 CSV parser. Handles quoted cells, escaped quotes, CRLF.
 * Returns array of string arrays.
 */
export function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQ = false;
      else cell += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c === '\r') { /* skip */ }
      else cell += c;
    }
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/**
 * SyncWith export layout (observed in sheet):
 *   0=meta_lead_id(l:), 1=created_time, 2=ad_id, 3=ad_name, 4=adset_id, 5=adset_name,
 *   6=campaign_id, 7=campaign_name, 8=form_id(f:), 9=form_name, 10=is_organic,
 *  11=platform, 12=status, 13=broker_type, 14=budget_range, 15=property_types,
 *  16=availability, 17=company_name, 18=first_name, 19=email, 20=phone(p:)
 *
 * Returns null if meta_lead_id is missing/empty.
 */
export function rowToLead(r, projectId = PROJECT_ID) {
  const idRaw = (r[0] || '').trim();
  const metaLeadId = idRaw.startsWith('l:') ? idRaw.slice(2) : idRaw;
  if (!metaLeadId) return null;
  const phone  = (r[20] || '').replace(/^p:/, '').trim() || null;
  const formId = (r[8]  || '').replace(/^f:/, '').trim() || null;
  const adId   = (r[2]  || '').replace(/^ag:/, '').trim() || null;
  return {
    project_id    : projectId,
    meta_lead_id  : metaLeadId,
    name          : (r[18] || '').trim() || null,
    company_name  : (r[17] || '').trim() || null,
    email         : (r[19] || '').trim() || null,
    phone,
    created_time  : (r[1]  || '').trim() || null,
    ad_id         : adId,
    source        : 'meta_ads',
    broker_type   : (r[13] || '').trim() || null,
    budget_range  : (r[14] || '').trim() || null,
    property_types: (r[15] || '').trim() || null,
    availability  : (r[16] || '').trim() || null,
    first_name    : (r[18] || '').trim() || null,
    meta_form_id  : formId,
  };
}

/**
 * Dedup key matches the database's generated `sync_key` column:
 *   meta_lead_id || '|' || lower(email)
 */
export function buildSyncKey(metaLeadId, email) {
  return `${metaLeadId}|${(email || '').toLowerCase()}`;
}

/**
 * Drops rows whose meta_lead_id contains whitespace (SyncWith's row-0 jam-row
 * artifact) and rows where multiple sheet entries share the same
 * (meta_lead_id, lower(email)) pair. Returns
 *   { unique, droppedCollisions }
 * where unique is the list of leads to upsert and droppedCollisions is the
 * count of within-sheet duplicates removed.
 *
 * Same meta_lead_id with DIFFERENT emails are NOT dropped — SyncWith reuses
 * meta_lead_ids across distinct real people (Cannon/Ayoub, Bhupendra/Raha,
 * Shiban/Ashok). The database's composite unique on (project_id, sync_key)
 * makes this safe at insert time.
 */
export function dedupLeads(leads) {
  const seen = new Set();
  const unique = [];
  let droppedCollisions = 0;
  for (const l of leads) {
    if (!l || !l.meta_lead_id || /\s/.test(l.meta_lead_id)) {
      droppedCollisions++;
      continue;
    }
    const key = buildSyncKey(l.meta_lead_id, l.email);
    if (seen.has(key)) { droppedCollisions++; continue; }
    seen.add(key);
    unique.push(l);
  }
  return { unique, droppedCollisions };
}

/**
 * Parses a full CSV dump from SyncWith into deduped leads ready for upsert.
 *
 * Row 0 is SyncWith's batch-jam row — every lead's values jammed
 * space-separated into single cells. Skip it. Rows 1+ are individual lead
 * rows. Past assumption that row 1 was "shifted headers" was wrong; row 1 is
 * a real lead and was being silently dropped every sync.
 */
export function csvToLeads(csv, projectId = PROJECT_ID) {
  const rows = parseCSV(csv);
  const dataRows = rows.slice(1);
  const all = dataRows.map(r => rowToLead(r, projectId)).filter(Boolean);
  const { unique, droppedCollisions } = dedupLeads(all);
  return { sheetRows: all.length, leads: unique, droppedCollisions };
}

/**
 * Upserts a batch of leads to Supabase via PostgREST.
 *
 * Uses `Prefer: resolution=ignore-duplicates` — existing rows are NEVER
 * overwritten by sync. SyncWith reuses meta_lead_ids across different real
 * people; merge-duplicates was overwriting human-curated CRM data (e.g.
 * Bhupendra → Raha incident, 2026-06-10). Inserts only; existing rows are
 * immutable to this sync.
 *
 * Options:
 *   supabaseUrl, supabaseKey  — required
 *   fetchImpl                 — override `fetch` (used by tests)
 *   maxErrorDetails           — how many error bodies to capture (default 3)
 *   onConflict                — column list for ON CONFLICT (default project_id,sync_key)
 */
export async function upsertLeads(leads, opts) {
  const {
    supabaseUrl,
    supabaseKey,
    fetchImpl = globalThis.fetch,
    maxErrorDetails = 3,
    onConflict = 'project_id,sync_key',
  } = opts;
  if (!supabaseUrl) throw new Error('upsertLeads: supabaseUrl required');
  if (!supabaseKey) throw new Error('upsertLeads: supabaseKey required');

  const sbHeaders = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=ignore-duplicates,return=representation',
  };

  let inserted = 0, skipped_existing = 0, errors = 0;
  const errorDetails = [];

  for (const lead of leads) {
    const res = await fetchImpl(
      `${supabaseUrl}/rest/v1/crm_leads?on_conflict=${encodeURIComponent(onConflict)}`,
      { method: 'POST', headers: sbHeaders, body: JSON.stringify(lead) },
    );
    if (res.ok) {
      const body = await res.json();
      // ignore-duplicates: empty body = conflict, row already exists, skipped.
      // Non-empty body = actually inserted.
      if (Array.isArray(body) && body.length === 0) skipped_existing++;
      else inserted++;
    } else {
      errors++;
      if (errorDetails.length < maxErrorDetails) {
        let bodyText = '';
        try { bodyText = (await res.text()).slice(0, 200); } catch (_) { /* */ }
        errorDetails.push({ id: lead.meta_lead_id, status: res.status, body: bodyText });
      }
    }
  }

  return { inserted, skipped_existing, errors, errorDetails };
}
