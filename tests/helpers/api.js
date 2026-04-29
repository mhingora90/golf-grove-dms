/**
 * Low-level HTTP helpers for Supabase REST + Auth APIs.
 *
 * api()  — service-role request (bypasses RLS), returns { status, data, ok }
 * as()   — user-JWT request (RLS enforced), returns { status, data, ok }
 * login() — sign in, return JWT token
 * createAuthUser() — admin create user, return { id, email }
 * deleteAuthUser() — admin delete by UUID
 */

const { SUPABASE_URL, ANON_KEY, SERVICE_KEY } = require('../config');

async function api(method, path, body, token = SERVICE_KEY, extraHeaders = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey        : SERVICE_KEY,
      Authorization : `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer        : 'return=representation',
      ...extraHeaders,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, ok: res.status >= 200 && res.status < 300 };
}

// Enforces RLS — uses real user JWT with anon apikey
async function as(method, path, body, jwt, extraHeaders = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey        : ANON_KEY,
      Authorization : `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      Prefer        : 'return=representation',
      ...extraHeaders,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, ok: res.status >= 200 && res.status < 300 };
}

async function login(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method : 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body   : JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Login failed for ${email}: ${data.error_description || data.msg || JSON.stringify(data)}`);
  return data.access_token;
}

async function createAuthUser(email, password) {
  const r = await api('POST', '/auth/v1/admin/users', {
    email, password, email_confirm: true,
  });
  if (!r.ok) throw new Error(`createAuthUser(${email}): ${JSON.stringify(r.data)}`);
  return { id: r.data.id, email: r.data.email };
}

async function deleteAuthUser(uuid) {
  await api('DELETE', `/auth/v1/admin/users/${uuid}`);
}

module.exports = { api, as, login, createAuthUser, deleteAuthUser };
