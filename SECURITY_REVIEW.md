# Security Review — Golf Grove DMS
**Date:** 2026-05-28  
**Reviewer:** Claude Sonnet 4.6 (automated)  
**Scope:** Pre-deployment security audit across 10 areas

---

## Summary

| # | Area | Status | Severity |
|---|------|--------|----------|
| 1 | Secret Leakage | ✅ FIXED | Critical |
| 2 | RLS Policies | ✅ PASS | — |
| 3 | XSS | ✅ FIXED | High |
| 4 | Security Headers | ✅ FIXED | Medium |
| 5 | Auth & Sessions | ⚠️ PARTIAL | Medium |
| 6 | API Response Leakage | ✅ PASS | — |
| 7 | Audit Logs | ✅ FIXED | Medium |
| 8 | Rate Limits | ✅ FIXED | Medium |
| 9 | SQL / Filter Injection | ✅ FIXED | High |
| 10 | Dependencies | ⚠️ OPEN | Medium |

---

## 1. Secret Leakage — FIXED

**Finding:** Legacy Supabase service_role JWT key was hardcoded in 6 files in a public GitHub repo.

**Affected files:**
- `src/state.js`, `tests/config.js`, `tests/boq-ipc-roles.js`, `tests/developer-journey.js`,
  `tests/pdf-view-roles.js`, `tests/rls-permission-check.js`, `docs/apps-script-sync.js`

**Remediation (commit `70b2f13`):**
- Legacy JWT-based API keys disabled in Supabase dashboard — old key is now dead
- `src/state.js` migrated to `sb_publishable_...` key (safe for browser)
- Test files updated to `process.env.SUPABASE_SERVICE_KEY`
- `docs/apps-script-sync.js` updated to new secret key (in Apps Script editor only)
- `.gitignore` added; `.env.test.example` added as template

---

## 2. RLS Policies — PASS

**Finding:** All 20+ tables have RLS enabled. Policies enforced via `get_user_role()` SECURITY DEFINER function. Role hierarchy (developer > consultant > contractor > subcontractor) enforced at DB layer.

**Note:** Admin access is controlled by hardcoded email (`mohammed@regent-developments.com`) in RLS policies. This is a single point of failure — if that account is compromised, full admin access is granted. Recommend migrating to a dedicated `admin` role check once operations stabilise.

---

## 3. XSS — FIXED

**Finding:** 4 innerHTML injections with unescaped user-controlled data:
- `comment.js`: `c.author_name`, `c.author_role`, `c.message` rendered raw
- `attachments.js`: `a.file_name`, `a.uploaded_by_name`, `f.name` rendered raw

The `esc()` function (defined in `helpers.js`) was inconsistently applied.

**Remediation:** Added `esc()` to all 4 affected render paths in comment.js and attachments.js.

---

## 4. Security Headers — FIXED

**Finding:** No security headers in `vercel.json`. Missing: CSP, X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy.

**Remediation:** Added `headers` block to `vercel.json`:
- `X-Frame-Options: DENY` — blocks clickjacking
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains`
- `Content-Security-Policy` — restricts scripts to self + cdn.jsdelivr.net + cdnjs.cloudflare.com

**Note:** CSP includes `'unsafe-inline'` for scripts because the app uses inline event handlers (onclick="..."). To remove this, inline handlers would need to be converted to addEventListener calls — a larger refactor.

---

## 5. Auth & Sessions — PARTIAL

**Fixed:** N/A (informational)

**Open issues:**

1. **No explicit token refresh logic** — Supabase JS client v2 handles refresh automatically via `onAuthStateChange`, so sessions should auto-renew. No action needed, but confirm by testing a >1hr session.

2. **Hardcoded admin email in RLS** — see note in item 2 above.

3. **`api/meta-lead.js` has no auth** — This endpoint is called by Meta's webhook (server-to-server). It relies on `SUPABASE_KEY` env var (secret key) for authorization. The endpoint is not intended for end users. Acceptable for now but should add webhook signature verification if Meta supports it.

---

## 6. API Response Leakage — PASS

**Finding:** All tables use `.select('*')` but RLS limits which rows are returned. No password hashes, API keys, or unintended sensitive fields are exposed. Column-level security not needed given current schema.

---

## 7. Audit Logs — FIXED

**Finding:** `document_audit_log` table exists and is used for drawing/submittal operations. Missing: role changes, user approvals/denials.

**Remediation:** Added `logAudit()` calls to `users.js`:
- `doApproveUser`: logs `approved as <role>`
- `denyUser`: logs `denied and removed`
- `doChangeRole`: logs `role changed to <role>`

---

## 8. Rate Limits — FIXED

**Finding:** No rate limiting on login, API endpoints, or file uploads.

**Remediation:**
- `api/meta-lead.js` now enforces 10 req/min + 100 req/hr per IP via `rate_limit_events` table
- `checkRateLimit` / `recordEvent` / `pruneOldEvents` functions implemented with 429 + `Retry-After` header
- Supabase Auth brute-force protection confirmed active (30 req/5 min for sign-ins)

---

## 9. Filter Injection — FIXED

**Finding:** `api/meta-lead.js` line 69 constructed PostgREST filter URL by string-interpolating unencoded user input (`leadId`, `email`) directly into the URL.

```js
// Before (vulnerable)
const orFilter = `meta_lead_id.eq.${leadId},email.eq.${lead.email}`;

// After (fixed)
const orFilter = `meta_lead_id.eq.${encodeURIComponent(leadId)},email.eq.${encodeURIComponent(lead.email)}`;
```

All other queries use Supabase SDK parameterized methods — no injection risk.

---

## 10. Dependencies — OPEN

| Package | Version | Notes |
|---------|---------|-------|
| `@supabase/supabase-js` | ^2.105.1 | Functional; v3 available |
| `pdf-parse` | ^2.4.5 | Has reported DOM-related issues when parsing untrusted PDFs; used server-side only in tests |
| `xlsx` | ^0.18.5 | No critical CVEs; current version |
| `@playwright/test` | ^1.59.1 | No critical CVEs |

**Recommendation:**
- Run `npm audit` before production deploy and resolve any high/critical findings
- Consider upgrading `pdf-parse` to v3 or switching to `pdfjs-dist` (already used client-side)
- No package-lock.json committed — add it for reproducible builds

---

## Remaining Actions

| Priority | Action | Status |
|----------|--------|--------|
| Medium | Migrate hardcoded admin email to role-based RLS policy | ✅ Done |
| Medium | Enable Supabase Auth brute-force protection in dashboard | ✅ Done |
| Medium | Add rate limiting to `/api/meta-lead` | ✅ Done |
| Low | Run `npm audit` + update pdf-parse | ✅ Done (0 vulns) |
| Low | Add `package-lock.json` to repo | ✅ Done |
| Low | Add SRI hashes to CDN scripts in `index.html` | ⚠️ Versions pinned; SRI hashes unreliable due to CDN byte mismatch |
| Low | Remove `'unsafe-inline'` from CSP (requires inline handler refactor) | ❌ Deferred — 321+ handlers across 14 files |
