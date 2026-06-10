// @ts-check
// Cron: pulls Google Sheet (public CSV) → upserts crm_leads for 241 Waterside.
// Replaces broken Apps Script trigger. Runs on Vercel cron schedule.

export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kdxvhrwnnehicgdryowu.supabase.co';
const SHEET_ID = '1MilS5L6fbmbm4w1xStoVvitX5vgvyrG0RWczSHRxNqo';
const SHEET_NAME = 'Automatic Meta Leads';
const PROJECT_ID = '00000000-0000-0000-0000-000000000002'; // 241 Waterside

function parseCSV(text) {
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

// SyncWith export layout (observed in sheet):
// 0=meta_lead_id(l:), 1=created_time, 2=ad_id, 3=ad_name, 4=adset_id, 5=adset_name,
// 6=campaign_id, 7=campaign_name, 8=form_id(f:), 9=form_name, 10=is_organic,
// 11=platform, 12=status, 13=broker_type, 14=budget_range, 15=property_types,
// 16=availability, 17=company_name, 18=first_name, 19=email, 20=phone(p:)
function rowToLead(r) {
  const idRaw = (r[0] || '').trim();
  const metaLeadId = idRaw.startsWith('l:') ? idRaw.slice(2) : idRaw;
  if (!metaLeadId) return null;
  const phone = (r[20] || '').replace(/^p:/, '').trim() || null;
  const formId = (r[8] || '').replace(/^f:/, '').trim() || null;
  const adId   = (r[2]  || '').replace(/^ag:/, '').trim() || null;
  return {
    project_id:     PROJECT_ID,
    meta_lead_id:   metaLeadId,
    name:           (r[18] || '').trim() || null,
    company_name:   (r[17] || '').trim() || null,
    email:          (r[19] || '').trim() || null,
    phone,
    created_time:   (r[1]  || '').trim() || null,
    ad_id:          adId,
    source:         'meta_ads',
    broker_type:    (r[13] || '').trim() || null,
    budget_range:   (r[14] || '').trim() || null,
    property_types: (r[15] || '').trim() || null,
    availability:   (r[16] || '').trim() || null,
    first_name:     (r[18] || '').trim() || null,
    meta_form_id:   formId,
  };
}

async function isCronSecret(auth) {
  const expected = `Bearer ${process.env.CRON_SECRET || ''}`;
  return Boolean(process.env.CRON_SECRET) && auth === expected;
}

// Validate Supabase user JWT: caller must be sales or developer.
async function isAuthorizedUser(auth) {
  if (!auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!anonKey) return false;

  // Resolve uid from token via Supabase auth endpoint.
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) return false;
  const user = await userRes.json();
  const uid = user?.id;
  if (!uid) return false;

  // Fetch caller's own profile (RLS lets authenticated users read any profile).
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(uid)}&select=role`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return false;
  const rows = await res.json();
  const role = rows?.[0]?.role;
  return role === 'sales' || role === 'developer';
}

export default async function handler(request) {
  const auth = request.headers.get('authorization') || '';
  const allowed = (await isCronSecret(auth)) || (await isAuthorizedUser(auth));
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const SUPABASE_KEY = process.env.SUPABASE_KEY;
  if (!SUPABASE_KEY) {
    return new Response(JSON.stringify({ error: 'missing SUPABASE_KEY' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;
    const csvRes = await fetch(csvUrl);
    if (!csvRes.ok) {
      return new Response(JSON.stringify({ error: 'sheet fetch failed', status: csvRes.status }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const csv = await csvRes.text();
    const rows = parseCSV(csv);

    // Row 0 is SyncWith's batch-jam row — every lead's values jammed
    // space-separated into single cells. Junk for our parser (produces a row
    // with embedded spaces in meta_lead_id that won't dedupe and won't render).
    // Skip it. Rows 1+ are individual lead rows (1-row-per-lead format).
    // Past assumption that row 1 was "shifted headers" was wrong; row 1 is a
    // real lead and was being silently dropped every sync.
    const dataRows = rows.slice(1);
    const allLeads = dataRows
      .map(rowToLead)
      .filter(Boolean)
      // Defensive: drop anything where meta_lead_id still has whitespace
      // (means the row wasn't a proper single-lead row).
      .filter(l => !/\s/.test(l.meta_lead_id));

    // SyncWith occasionally emits the same meta_lead_id for distinct people
    // (collision bug). Rule: keep the earliest occurrence in the sheet, drop
    // later ones. Dedup by meta_lead_id keeping first seen.
    const seen = new Set();
    const leads = [];
    let droppedCollisions = 0;
    for (const l of allLeads) {
      if (seen.has(l.meta_lead_id)) { droppedCollisions++; continue; }
      seen.add(l.meta_lead_id);
      leads.push(l);
    }

    const sbHeaders = {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      // ignore-duplicates: never touch an existing row. SyncWith reuses
      // meta_lead_ids across different real people; merge-duplicates was
      // overwriting human-curated CRM data (e.g. Bhupendra → Raha incident,
      // 2026-06-10). Inserts only; existing rows are immutable to this sync.
      Prefer: 'resolution=ignore-duplicates,return=representation',
    };

    let inserted = 0, skipped_existing = 0, errors = 0;
    const errorDetails = [];

    for (const lead of leads) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/crm_leads?on_conflict=meta_lead_id`, {
        method: 'POST',
        headers: sbHeaders,
        body: JSON.stringify(lead),
      });
      if (res.ok) {
        const body = await res.json();
        // ignore-duplicates: empty body = conflict, row already exists, skipped.
        // Non-empty body = actually inserted.
        if (body.length === 0) skipped_existing++;
        else inserted++;
      } else {
        errors++;
        if (errorDetails.length < 3) {
          errorDetails.push({ id: lead.meta_lead_id, status: res.status, body: (await res.text()).slice(0, 200) });
        }
      }
    }

    return new Response(JSON.stringify({
      status: 'ok',
      sheet_rows: allLeads.length,
      unique_leads: leads.length,
      dropped_collisions: droppedCollisions,
      inserted: inserted,
      skipped_existing,
      errors,
      errorDetails: errorDetails.length ? errorDetails : undefined,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
