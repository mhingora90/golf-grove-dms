// @ts-check
export const config = {
  runtime: 'edge',
};

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kdxvhrwnnehicgdryowu.supabase.co';

// Limits per IP
const LIMIT_PER_MINUTE = 10;
const LIMIT_PER_HOUR   = 100;

function getIP(request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function log(ip, event, extra = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ip, event, ...extra }));
}

async function checkRateLimit(ip, sbHeaders) {
  const now = new Date();
  const minuteAgo = new Date(now - 60_000).toISOString();
  const hourAgo   = new Date(now - 3_600_000).toISOString();

  // Count requests from this IP in the last minute and last hour (single query)
  const countUrl = `${SUPABASE_URL}/rest/v1/rate_limit_events` +
    `?select=created_at&ip=eq.${encodeURIComponent(ip)}&created_at=gte.${encodeURIComponent(hourAgo)}`;
  const res = await fetch(countUrl, { headers: sbHeaders });
  if (!res.ok) return { allowed: true }; // fail open if DB unreachable

  const rows = await res.json();
  const countHour   = rows.length;
  const countMinute = rows.filter(r => r.created_at >= minuteAgo).length;

  if (countMinute >= LIMIT_PER_MINUTE) {
    return { allowed: false, window: 'minute', retryAfter: 60 };
  }
  if (countHour >= LIMIT_PER_HOUR) {
    return { allowed: false, window: 'hour', retryAfter: 3600 };
  }
  return { allowed: true };
}

async function recordEvent(ip, success, sbHeaders) {
  await fetch(`${SUPABASE_URL}/rest/v1/rate_limit_events`, {
    method: 'POST',
    headers: { ...sbHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({ ip, success, endpoint: 'meta-lead' }),
  });
}

async function pruneOldEvents(ip, sbHeaders) {
  const twoHoursAgo = new Date(Date.now() - 7_200_000).toISOString();
  await fetch(
    `${SUPABASE_URL}/rest/v1/rate_limit_events?ip=eq.${encodeURIComponent(ip)}&created_at=lt.${encodeURIComponent(twoHoursAgo)}`,
    { method: 'DELETE', headers: sbHeaders }
  );
}

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const ip = getIP(request);
  const SUPABASE_KEY = process.env.SUPABASE_KEY;

  const sbHeaders = {
    apikey:          SUPABASE_KEY || '',
    Authorization:   `Bearer ${SUPABASE_KEY || ''}`,
    'Content-Type':  'application/json',
  };

  try {
    // ── Rate limiting ────────────────────────────────────────────────
    if (SUPABASE_KEY) {
      const { allowed, window: win, retryAfter } = await checkRateLimit(ip, sbHeaders);
      if (!allowed) {
        log(ip, 'rate_limited', { window: win });
        return new Response(JSON.stringify({ error: 'Too many requests', window: win }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfter),
            'X-RateLimit-Window': win,
          },
        });
      }
    }

    // ── Parse body ───────────────────────────────────────────────────
    const data = await request.json();
    const leadId = data.lead_id || data.leadgen_id || '';
    const formId = data.form_id || data.adgroup_id || '';

    const fields = {};
    if (data.field_data && Array.isArray(data.field_data)) {
      data.field_data.forEach(f => { fields[f.name] = (f.values || []).join(', '); });
    }
    if (data.full_name)     fields.full_name     = data.full_name;
    if (data.email)         fields.email         = data.email;
    if (data.phone_number)  fields.phone_number  = data.phone_number;
    if (data.first_name)    fields.first_name    = data.first_name;
    if (data.company_name)  fields.company_name  = data.company_name;
    if (data.broker_type)   fields.broker_type   = data.broker_type;
    if (data.budget_range)  fields.budget_range  = data.budget_range;
    if (data.property_types) fields.property_types = data.property_types;
    if (data.availability)  fields.availability  = data.availability;

    const lead = {
      project_id:     '00000000-0000-0000-0000-000000000002',
      name:           fields.full_name || fields.first_name || fields.email || 'Unknown',
      email:          fields.email || null,
      phone:          fields.phone_number || fields.phone || null,
      source:         'meta_ads',
      meta_lead_id:   leadId,
      meta_form_id:   formId,
      first_name:     fields.first_name || null,
      broker_type:    fields.broker_type || null,
      budget_range:   fields.budget_range || null,
      property_types: fields.property_types || null,
      availability:   fields.availability || null,
      company_name:   fields.company_name || null,
    };

    if (!SUPABASE_KEY) {
      log(ip, 'no_key', { lead_id: leadId });
      return new Response(JSON.stringify({ status: 'logged_no_key', lead }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const fullHeaders = { ...sbHeaders, Prefer: 'return=representation' };

    // ── Duplicate check ──────────────────────────────────────────────
    const orFilter = `meta_lead_id.eq.${encodeURIComponent(leadId)}` +
      (lead.email ? `,email.eq.${encodeURIComponent(lead.email)}` : '');
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/crm_leads?select=id&or=(${orFilter})&limit=1`,
      { headers: fullHeaders }
    );
    const existing = await checkRes.json();

    if (existing && existing.length > 0) {
      log(ip, 'duplicate', { lead_id: leadId });
      await recordEvent(ip, true, sbHeaders);
      pruneOldEvents(ip, sbHeaders); // fire-and-forget
      return new Response(JSON.stringify({ status: 'duplicate', id: existing[0].id }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── Insert ───────────────────────────────────────────────────────
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/crm_leads`, {
      method: 'POST',
      headers: fullHeaders,
      body: JSON.stringify(lead),
    });
    const result = await insertRes.json();

    if (!insertRes.ok) {
      log(ip, 'insert_error', { lead_id: leadId, error: JSON.stringify(result) });
      await recordEvent(ip, false, sbHeaders);
      return new Response(JSON.stringify({ error: result }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    log(ip, 'created', { lead_id: leadId, name: lead.name });
    await recordEvent(ip, true, sbHeaders);
    pruneOldEvents(ip, sbHeaders); // fire-and-forget
    return new Response(JSON.stringify({ status: 'created', id: result[0]?.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (e) {
    log(ip, 'exception', { message: e.message });
    if (SUPABASE_KEY) await recordEvent(ip, false, sbHeaders).catch(() => {});
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
