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

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtBudget(v) {
  if (!v) return '';
  return String(v).replace(/_/g, ' ').replace(/aed /gi, 'AED ');
}

function renderLeadDigestHtml(leads) {
  const rows = leads.map(l => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee"><strong>${escapeHtml(l.name || '—')}</strong></td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(l.email || '—')}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml((l.phone || '').replace(/^p:/, '') || '—')}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(fmtBudget(l.budget_range) || '—')}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(l.company_name || '—')}</td>
    </tr>`).join('');
  return `
    <div style="font-family:system-ui,Segoe UI,sans-serif;color:#1a1a1a">
      <h2 style="margin:0 0 8px">${leads.length} new lead${leads.length === 1 ? '' : 's'} — 241 Waterside</h2>
      <p style="margin:0 0 16px;color:#555">From Meta Ads via Google Sheet sync.</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        <thead>
          <tr style="background:#f6f6f6;text-align:left">
            <th style="padding:8px 12px">Name</th>
            <th style="padding:8px 12px">Email</th>
            <th style="padding:8px 12px">Phone</th>
            <th style="padding:8px 12px">Budget</th>
            <th style="padding:8px 12px">Company</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin:16px 0 0">
        <a href="https://golf-grove-dms.vercel.app/#crm" style="color:#2563eb">Open CRM →</a>
      </p>
    </div>`;
}

async function sendLeadDigest(insertedLeads) {
  const apiKey = process.env.RESEND_API_KEY;
  const to     = (process.env.LEAD_NOTIFY_TO || '').split(',').map(s => s.trim()).filter(Boolean);
  const from   = process.env.LEAD_NOTIFY_FROM || 'onboarding@resend.dev';
  if (!apiKey)    return { ok: false, skipped: 'missing RESEND_API_KEY' };
  if (!to.length) return { ok: false, skipped: 'missing LEAD_NOTIFY_TO' };

  const subject = `${insertedLeads.length} new lead${insertedLeads.length === 1 ? '' : 's'} — 241 Waterside`;
  const html    = renderLeadDigestHtml(insertedLeads);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { ok: false, status: res.status, body: body.slice(0, 200) };
  }
  const data = await res.json().catch(() => ({}));
  return { ok: true, id: data.id, count: insertedLeads.length, to };
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

    const { inserted, skipped_existing, errors, errorDetails, insertedLeads } = await upsertLeads(leads, {
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_KEY,
    });

    let digest = undefined;
    if (insertedLeads && insertedLeads.length) {
      digest = await sendLeadDigest(insertedLeads).catch(e => ({ ok: false, error: e.message }));
    }

    return new Response(JSON.stringify({
      status: 'ok',
      sheet_rows: sheetRows,
      unique_leads: leads.length,
      dropped_collisions: droppedCollisions,
      inserted,
      skipped_existing,
      errors,
      errorDetails: errorDetails.length ? errorDetails : undefined,
      digest,
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
