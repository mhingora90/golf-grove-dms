// @ts-check
// Cron: pulls Google Sheet (public CSV) → upserts crm_leads for 241 Waterside.
// Replaces broken Apps Script trigger. Runs on Vercel cron schedule.
//
// Pure logic lives in ./_sync-meta-leads-core.mjs so it can be unit-tested
// without the edge runtime.

import {
  SHEET_ID, SHEET_NAME, PROJECT_ID,
  csvToLeads, upsertLeads,
} from './_sync-meta-leads-core.mjs';

export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kdxvhrwnnehicgdryowu.supabase.co';

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

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) return false;
  const user = await userRes.json();
  const uid = user?.id;
  if (!uid) return false;

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
    const { sheetRows, leads, droppedCollisions } = csvToLeads(csv, PROJECT_ID);

    const { inserted, skipped_existing, errors, errorDetails } = await upsertLeads(leads, {
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_KEY,
    });

    return new Response(JSON.stringify({
      status: 'ok',
      sheet_rows: sheetRows,
      unique_leads: leads.length,
      dropped_collisions: droppedCollisions,
      inserted,
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
