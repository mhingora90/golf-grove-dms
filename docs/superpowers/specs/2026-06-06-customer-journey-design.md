# Customer Journey — Post-Sale Interaction Tracking

**Date:** 2026-06-06
**Status:** Design approved (pre-implementation)
**Scope:** Post-sale customer interaction log accessible to Admin, Developer, Sales roles.

## 1. Problem

A buyer's record exists today only as plain text on `unit_sales.buyer_name`. Once a unit is sold, there is no place to record post-sale interactions (calls, emails, WhatsApp messages, SMS, in-person meetings, notes). Team members are not kept in the loop about ongoing conversations with the customer over the project lifecycle (handover, payments, snags, defects, move-in, warranty).

## 2. Goals (v1)

- A `customers` entity per buyer (one customer can own multiple units).
- Joint ownership supported (multiple customers per `unit_sale`).
- Activity feed per customer: method, date/time, body, author.
- Reuse the existing CRM activity feed component (mentions, threading, notifications inherited).
- Backfill existing `unit_sales.buyer_name` text into `customers` rows so the system is populated from day one.
- Read/write access for Admin, Developer, Sales roles.
- Accessible from a new top-nav **Customers** module and quick-linked from the existing **Unit Register** module.

## 3. Non-Goals (v1)

- Per-owner ownership_pct enforcement (stored, not validated to sum to 100).
- Customer merge/split tooling.
- File attachments on interactions (CRM activities don't have them either).
- Customer document storage (Emirates ID upload, passport scans).
- SMS/email/WhatsApp send integration. v1 is **logging only**.
- Pre-sale lifecycle tracking — leads stay in the existing CRM module.

## 4. Data Model

### 4.1 New tables

```sql
create table public.customers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  phone        text,
  email        text,
  nationality  text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  created_by   uuid references auth.users(id)
);
create index customers_name_idx  on public.customers (lower(name));
create index customers_phone_idx on public.customers (phone);
create index customers_email_idx on public.customers (lower(email));

create table public.unit_sale_customers (
  unit_sale_id   uuid not null references public.unit_sales(id) on delete cascade,
  customer_id    uuid not null references public.customers(id) on delete restrict,
  is_primary     boolean not null default false,
  ownership_pct  numeric,
  primary key (unit_sale_id, customer_id)
);
create unique index unit_sale_customers_one_primary
  on public.unit_sale_customers (unit_sale_id) where is_primary;
```

### 4.2 Extensions to existing tables

`crm_lead_activities`:
- `lead_id` → make **nullable** (was NOT NULL).
- Add `customer_id uuid references public.customers(id)`.
- Add XOR check: `CHECK ((lead_id IS NOT NULL) <> (customer_id IS NOT NULL))`.
- Extend `method` CHECK from `(call,whatsapp,email,meeting,site_visit,note)` to add `sms` and `in_person`. Final set: `(call, whatsapp, email, sms, in_person, meeting, site_visit, note)`.

`crm_notifications`:
- `lead_id` → make **nullable**.
- Add `customer_id uuid references public.customers(id) on delete cascade`.
- Add XOR check: `CHECK ((lead_id IS NOT NULL) <> (customer_id IS NOT NULL))`.

`fan_out_crm_notifications()` trigger:
- Branch on `NEW.customer_id IS NULL` vs `NEW.lead_id IS NULL` and insert the correct FK column on each notification row.

`unit_sales`:
- `buyer_name` kept as a **denormalized display string**. Writes set it from the primary customer's name. Reads prefer the junction; `buyer_name` is fallback only.

## 5. Backfill

Migration applies to each existing `unit_sales` row with non-null `buyer_name`:

1. Split `buyer_name` on the separators ` & `, ` AND ` (case-insensitive), ` and `.
2. Trim each segment to a candidate name.
3. For each candidate, upsert into `customers` matched by `LOWER(TRIM(name))`. Phone/email left NULL.
4. Insert `unit_sale_customers` rows. The first segment is `is_primary = true`; the rest are `is_primary = false`. `ownership_pct` left NULL.
5. Migration is idempotent — existing junction rows are skipped on re-run.
6. Rows with NULL `buyer_name` are not touched; they get a customer link the next time the sale is edited.

## 6. Permissions / RLS

New helper:

```sql
create or replace function public.has_customer_access() returns boolean
  language sql stable as
  $$ select get_user_role() in ('admin','developer','sales') $$;
```

Policies:

- `customers`, `unit_sale_customers`:
  - SELECT, INSERT, UPDATE: `has_customer_access()`.
  - DELETE: admin only (`get_user_role() = 'admin'`).
- `crm_lead_activities` policies extended:
  - `(lead_id IS NOT NULL AND has_crm_access()) OR (customer_id IS NOT NULL AND has_customer_access())`.
- `crm_notifications`: unchanged — recipients can read/update their own rows; only the SECURITY DEFINER trigger writes.

## 7. UI

### 7.1 New "Customers" module (top-nav)

List view:
- Table columns: name, phone, email, units owned (badge count), last interaction (relative), method icon of last interaction.
- Search: name / phone / email.
- Filters: last contact < 30/60/90 days, has interactions, no interactions.
- Sort: last contact (default), name, units owned.
- Toolbar: `+ New Customer` button.

Profile (drawer slides from right):
- Header: name, phone, email, nationality, Edit button.
- "Units owned" section: chips per unit (`project · unit_no`, `PRIMARY` tag when applicable). Each chip links to the Unit Register row.
- "Log interaction" composer: method dropdown (call / email / whatsapp / sms / in_person / note), `contacted_at` datetime (default `now()`), body textarea with `@mention` autocomplete, submit button.
- "Interactions" feed: chronological newest-first. Each entry shows author, method icon, relative date, body, Reply button. Threaded replies indent under their parent. Mentions trigger notifications in the existing inbox.

Create customer modal: name (required), phone, email, nationality. Opens from list "+ New Customer" or inline from the Unit Register sale form.

### 7.2 Unit Register integration

Sale form / edit modal: the existing `buyer_name` text input is replaced with an **Owners** block.
- Each row: tag (`PRIMARY` / `JOINT`), customer name field (search-as-type), ownership % input, remove button.
- `+ Add joint owner` button appends a row.
- Search dropdown shows existing customers (name + phone + units count) and a final option: `+ Create new customer "<typed text>"`.
- Exactly one row is `is_primary`.
- On save, the unit's `buyer_name` is updated to the primary customer's name (denorm).

Unit list row: customer names render as links to the Customers profile.

Unit detail panel: a new **Interactions** tab shows the union of all owners' interactions for that unit, read-only. The composer is disabled here; a "Log interaction" button routes to the relevant customer profile (if multiple owners, a small chooser appears first).

## 8. Code shape

Single-file SPA pattern (`index.html` + per-module JS), following existing CRM/Unit Register conventions.

- `src/customers.js` — new module. Mirrors `crm.js` structure: `loadCustomers()`, `renderCustomerList()`, `openCustomerProfile(id)`, `saveCustomer()`, `linkUnitToCustomer()`.
- `src/activity-feed.js` — extract the reusable activity feed (composer + thread renderer + mentions + notifications) out of the existing CRM module. The new function signature: `renderActivityFeed({ parentType: 'lead' | 'customer', parentId })`. Both CRM and Customer profiles call it.
- `src/units_sales.js` — existing module. New `pickCustomer({ allowJoint: true })` widget replaces the `buyer_name` text input and returns `[{ customer_id, is_primary, ownership_pct }]`.
- Top nav: add `#customers` route, slot into the existing module nav.
- Notifications inbox: extend the existing CRM inbox renderer to handle customer-scoped notifications with a distinct icon and link target.

## 9. Testing

- `tests/customers/` directory, following the existing `tests/helpers/` pattern.
- Migration test: backfill against seed `unit_sales` rows with joint names (`A & B`, `A AND B`, `A and B`, single, NULL) — verify junction row counts and `is_primary` flags.
- RLS tests: admin, developer, sales can read/write `customers` and `unit_sale_customers`; consultant cannot.
- Activity XOR tests: insert with both `lead_id` and `customer_id` is rejected; insert with neither is rejected.
- Notification fan-out test: mentioning a user inside a customer activity creates a `crm_notifications` row with `customer_id` populated and `lead_id` NULL.
- E2E (Playwright): create a customer → link to a unit → log a call → @mention a developer → verify the notification appears in their inbox and links back to the customer profile.

## 10. Migration plan summary

1. `customers` table + indexes.
2. `unit_sale_customers` table + partial unique index.
3. Alter `crm_lead_activities`: nullable `lead_id`, add `customer_id`, XOR check, extend `method` CHECK.
4. Alter `crm_notifications`: nullable `lead_id`, add `customer_id`, XOR check.
5. Replace `fan_out_crm_notifications()` to branch on parent type.
6. RLS policies for the two new tables; extend RLS on `crm_lead_activities`.
7. Backfill `customers` and `unit_sale_customers` from `unit_sales.buyer_name`.

Each step is a separate, idempotent migration file dated `20260606xxxxxx_*.sql` under `supabase/migrations/`.

## 11. Open questions / decisions deferred

- Whether to display all owners in the Unit Register list cell when joint ownership exists (currently "A & B" via primary name; may want chips). Defer to implementation feedback.
- Notification copy for customer-scoped mentions (different verb than lead mentions). Defer to implementation.
- Whether consultants should ever be granted read access to customer interactions. Currently denied; revisit if requested.
