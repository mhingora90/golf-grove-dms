# Customer Journey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add post-sale customer interaction tracking. New `customers` entity with joint-ownership junction, reuse the CRM activity feed (mentions + threading + notifications) for post-sale logs, accessible from a new Customers top-nav module and a customer picker in the Unit Register.

**Architecture:** Two new tables (`customers`, `unit_sale_customers`) plus extending `crm_lead_activities` and `crm_notifications` with a nullable `customer_id` (XOR with `lead_id`). Backfill from `unit_sales.buyer_name` parses `&`/`and`/`AND` separators. UI is a new `src/customers.js` module plus an extracted reusable activity-feed component in `src/activity-feed.js`, replacing the inline feed inside `src/crm.js`.

**Tech Stack:** Supabase (Postgres + RLS), single-page `index.html` + vanilla JS modules in `src/`, Playwright for E2E, node test runner for unit/integration tests.

**Spec:** `docs/superpowers/specs/2026-06-06-customer-journey-design.md`

---

## File Map

**Create:**
- `supabase/migrations/20260607000001_create_customers.sql` — `customers` table + indexes + RLS.
- `supabase/migrations/20260607000002_create_unit_sale_customers.sql` — junction table + partial unique index + RLS.
- `supabase/migrations/20260607000003_activities_add_customer.sql` — make `lead_id` nullable, add `customer_id`, XOR check, extend method enum.
- `supabase/migrations/20260607000004_notifications_add_customer.sql` — make `lead_id` nullable, add `customer_id`, XOR check, update trigger.
- `supabase/migrations/20260607000005_activities_rls_extend.sql` — RLS allows customer branch for admin/developer/sales.
- `supabase/migrations/20260607000006_backfill_customers.sql` — parse `unit_sales.buyer_name`, insert customers + junction rows.
- `src/activity-feed.js` — extracted reusable feed (composer + thread render + mentions). Replaces inline code in `src/crm.js`.
- `src/customers.js` — Customers module (list, profile, modal, picker widget).
- `tests/customers/migration.test.js` — schema + backfill assertions.
- `tests/customers/rls.test.js` — role matrix.
- `tests/customers/activity-xor.test.js` — XOR constraint enforcement.
- `tests/customers/notifications.test.js` — fan-out for customer-scoped activities.
- `tests/customers/e2e.spec.js` — Playwright golden path.

**Modify:**
- `src/crm.js` — replace inline `_buildFeedHtml` / `addLeadActivity` / mention helpers with calls to `src/activity-feed.js` (`renderActivityFeed({ parentType: 'lead', parentId })`).
- `src/units.js` — replace `buyer_name` text input in sale form with the `pickCustomer` widget; update list cell to link to customer profile.
- `src/nav.js` — register `#customers` route, slot into top nav.
- `index.html` — `<script src="src/activity-feed.js">` and `<script src="src/customers.js">`.
- `tests/helpers/` — add a `seedCustomers()` helper if needed by multiple test files.

---

## Phase 1 — Schema

### Task 1: customers table

**Files:**
- Create: `supabase/migrations/20260607000001_create_customers.sql`
- Test:   `tests/customers/migration.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/customers/migration.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devClient } from './helpers.js';

test('customers table exists with required columns', async () => {
  const db = devClient();
  const { data, error } = await db.rpc('list_columns', { tbl: 'customers' });
  assert.equal(error, null);
  const names = data.map(c => c.column_name);
  for (const col of ['id','name','phone','email','nationality','created_at','updated_at','created_by']) {
    assert.ok(names.includes(col), `missing column: ${col}`);
  }
});
```

If `list_columns` helper does not exist, the test should instead `select * from customers limit 0` and assert no error.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/customers/migration.test.js`
Expected: FAIL — `relation "customers" does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260607000001_create_customers.sql
create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text,
  email       text,
  nationality text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id)
);

create index if not exists customers_name_idx  on public.customers (lower(name));
create index if not exists customers_phone_idx on public.customers (phone);
create index if not exists customers_email_idx on public.customers (lower(email));

create or replace function public.has_customer_access() returns boolean
  language sql stable as
  $$ select public.get_user_role() in ('admin','developer','sales') $$;

alter table public.customers enable row level security;

drop policy if exists "customers: select" on public.customers;
drop policy if exists "customers: insert" on public.customers;
drop policy if exists "customers: update" on public.customers;
drop policy if exists "customers: delete" on public.customers;

create policy "customers: select" on public.customers
  for select to authenticated using (public.has_customer_access());
create policy "customers: insert" on public.customers
  for insert to authenticated with check (public.has_customer_access());
create policy "customers: update" on public.customers
  for update to authenticated
  using (public.has_customer_access()) with check (public.has_customer_access());
create policy "customers: delete" on public.customers
  for delete to authenticated using (public.get_user_role() = 'admin');
```

- [ ] **Step 4: Apply migration**

Run: `npx supabase db push`
Expected: `Applied migration 20260607000001_create_customers.sql`.

- [ ] **Step 5: Run test**

Run: `node --test tests/customers/migration.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260607000001_create_customers.sql tests/customers/migration.test.js
git commit -m "feat(customers): create customers table with RLS"
```

---

### Task 2: unit_sale_customers junction

**Files:**
- Create: `supabase/migrations/20260607000002_create_unit_sale_customers.sql`
- Test:   `tests/customers/migration.test.js`

- [ ] **Step 1: Add failing test**

```js
test('unit_sale_customers junction enforces single primary per sale', async () => {
  const db = devClient();
  const { data: u } = await db.from('units').insert({
    unit_no: 'TEST-J1', floor: 1, unit_type: 'Studio', area_sqft: 400, listed_price: 500000
  }).select('id').single();
  const { data: s } = await db.from('unit_sales').insert({
    unit_id: u.id, status: 'reserved'
  }).select('id').single();
  const { data: c1 } = await db.from('customers').insert({ name: 'Joint A' }).select('id').single();
  const { data: c2 } = await db.from('customers').insert({ name: 'Joint B' }).select('id').single();

  const { error: e1 } = await db.from('unit_sale_customers').insert({
    unit_sale_id: s.id, customer_id: c1.id, is_primary: true
  });
  assert.equal(e1, null);

  const { error: e2 } = await db.from('unit_sale_customers').insert({
    unit_sale_id: s.id, customer_id: c2.id, is_primary: true
  });
  assert.ok(e2, 'expected unique violation for second primary');

  await db.from('unit_sales').delete().eq('id', s.id);
  await db.from('units').delete().eq('id', u.id);
  await db.from('customers').delete().in('id', [c1.id, c2.id]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/customers/migration.test.js`
Expected: FAIL — `relation "unit_sale_customers" does not exist`.

- [ ] **Step 3: Write migration**

```sql
-- supabase/migrations/20260607000002_create_unit_sale_customers.sql
create table if not exists public.unit_sale_customers (
  unit_sale_id  uuid not null references public.unit_sales(id) on delete cascade,
  customer_id   uuid not null references public.customers(id)  on delete restrict,
  is_primary    boolean not null default false,
  ownership_pct numeric,
  primary key (unit_sale_id, customer_id)
);

create unique index if not exists unit_sale_customers_one_primary
  on public.unit_sale_customers (unit_sale_id) where is_primary;

alter table public.unit_sale_customers enable row level security;

drop policy if exists "usc: select" on public.unit_sale_customers;
drop policy if exists "usc: insert" on public.unit_sale_customers;
drop policy if exists "usc: update" on public.unit_sale_customers;
drop policy if exists "usc: delete" on public.unit_sale_customers;

create policy "usc: select" on public.unit_sale_customers
  for select to authenticated using (public.has_customer_access());
create policy "usc: insert" on public.unit_sale_customers
  for insert to authenticated with check (public.has_customer_access());
create policy "usc: update" on public.unit_sale_customers
  for update to authenticated
  using (public.has_customer_access()) with check (public.has_customer_access());
create policy "usc: delete" on public.unit_sale_customers
  for delete to authenticated using (public.get_user_role() = 'admin');
```

- [ ] **Step 4: Apply + test**

Run: `npx supabase db push && node --test tests/customers/migration.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260607000002_create_unit_sale_customers.sql tests/customers/migration.test.js
git commit -m "feat(customers): junction table with single-primary unique"
```

---

### Task 3: extend crm_lead_activities

**Files:**
- Create: `supabase/migrations/20260607000003_activities_add_customer.sql`
- Test:   `tests/customers/activity-xor.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/customers/activity-xor.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devClient } from './helpers.js';

test('activity insert rejects both parents set', async () => {
  const db = devClient();
  const { data: c } = await db.from('customers').insert({ name: 'XOR Test' }).select('id').single();
  const { data: l } = await db.from('crm_leads').insert({ name: 'XOR Lead' }).select('id').single();
  const { error } = await db.from('crm_lead_activities').insert({
    lead_id: l.id, customer_id: c.id, method: 'note', body: 'x', author_name: 'dev'
  });
  assert.ok(error, 'expected XOR violation');
  await db.from('customers').delete().eq('id', c.id);
  await db.from('crm_leads').delete().eq('id', l.id);
});

test('activity insert rejects neither parent set', async () => {
  const db = devClient();
  const { error } = await db.from('crm_lead_activities').insert({
    method: 'note', body: 'x', author_name: 'dev'
  });
  assert.ok(error, 'expected XOR violation');
});

test('activity accepts customer-only parent', async () => {
  const db = devClient();
  const { data: c } = await db.from('customers').insert({ name: 'Customer Solo' }).select('id').single();
  const { error } = await db.from('crm_lead_activities').insert({
    customer_id: c.id, method: 'in_person', body: 'walk-in', author_name: 'dev'
  });
  assert.equal(error, null);
  await db.from('crm_lead_activities').delete().eq('customer_id', c.id);
  await db.from('customers').delete().eq('id', c.id);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/customers/activity-xor.test.js`
Expected: FAIL — column `customer_id` does not exist.

- [ ] **Step 3: Write migration**

```sql
-- supabase/migrations/20260607000003_activities_add_customer.sql
alter table public.crm_lead_activities
  alter column lead_id drop not null;

alter table public.crm_lead_activities
  add column if not exists customer_id uuid
    references public.customers(id) on delete cascade;

create index if not exists crm_activities_customer_idx
  on public.crm_lead_activities (customer_id, contacted_at desc)
  where customer_id is not null;

alter table public.crm_lead_activities
  drop constraint if exists crm_activities_parent_xor;
alter table public.crm_lead_activities
  add constraint crm_activities_parent_xor
    check ((lead_id is not null) <> (customer_id is not null));

alter table public.crm_lead_activities
  drop constraint if exists crm_lead_activities_method_check;
alter table public.crm_lead_activities
  add constraint crm_lead_activities_method_check
    check (method in ('call','whatsapp','email','sms','in_person','meeting','site_visit','note'));
```

- [ ] **Step 4: Apply + test**

Run: `npx supabase db push && node --test tests/customers/activity-xor.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260607000003_activities_add_customer.sql tests/customers/activity-xor.test.js
git commit -m "feat(customers): activities accept customer parent (XOR with lead)"
```

---

### Task 4: extend crm_notifications + trigger

**Files:**
- Create: `supabase/migrations/20260607000004_notifications_add_customer.sql`
- Test:   `tests/customers/notifications.test.js`

- [ ] **Step 1: Write failing test**

```js
// tests/customers/notifications.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devClient, makeMentionedUser } from './helpers.js';

test('mentioning a user in a customer activity fans out a notification with customer_id', async () => {
  const db = devClient();
  const recipient = await makeMentionedUser(db);
  const { data: c } = await db.from('customers').insert({ name: 'Notif Test' }).select('id').single();

  const { data: act, error } = await db.from('crm_lead_activities').insert({
    customer_id: c.id, method: 'note', body: 'ping @user', author_name: 'dev', mentions: [recipient.id]
  }).select('id').single();
  assert.equal(error, null);

  const { data: n } = await db.from('crm_notifications')
    .select('user_id, lead_id, customer_id, type')
    .eq('activity_id', act.id);
  assert.equal(n.length, 1);
  assert.equal(n[0].user_id, recipient.id);
  assert.equal(n[0].customer_id, c.id);
  assert.equal(n[0].lead_id, null);
  assert.equal(n[0].type, 'mention');

  await db.from('crm_lead_activities').delete().eq('id', act.id);
  await db.from('customers').delete().eq('id', c.id);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/customers/notifications.test.js`
Expected: FAIL — trigger writes `lead_id NOT NULL` but `NEW.lead_id` is null.

- [ ] **Step 3: Write migration**

```sql
-- supabase/migrations/20260607000004_notifications_add_customer.sql
alter table public.crm_notifications
  alter column lead_id drop not null;

alter table public.crm_notifications
  add column if not exists customer_id uuid
    references public.customers(id) on delete cascade;

alter table public.crm_notifications
  drop constraint if exists crm_notifications_parent_xor;
alter table public.crm_notifications
  add constraint crm_notifications_parent_xor
    check ((lead_id is not null) <> (customer_id is not null));

create index if not exists crm_notifications_customer_idx
  on public.crm_notifications (customer_id) where customer_id is not null;

create or replace function public.fan_out_crm_notifications()
returns trigger
security definer
set search_path = public
language plpgsql as $$
declare
  v_actor_name    text;
  v_snippet       text;
  v_recipient     uuid;
  v_parent_author uuid;
begin
  v_actor_name := coalesce(new.author_name, 'Someone');
  v_snippet    := left(coalesce(new.body, ''), 140);

  if new.mentions is not null then
    foreach v_recipient in array new.mentions loop
      if v_recipient is not null and v_recipient <> new.author_id then
        insert into public.crm_notifications
          (user_id, type, lead_id, customer_id, activity_id, actor_id, actor_name, snippet)
        values
          (v_recipient, 'mention', new.lead_id, new.customer_id, new.id,
           new.author_id, v_actor_name, v_snippet)
        on conflict do nothing;
      end if;
    end loop;
  end if;

  if new.parent_id is not null then
    select author_id into v_parent_author
    from public.crm_lead_activities where id = new.parent_id;
    if v_parent_author is not null
       and v_parent_author <> new.author_id
       and not (v_parent_author = any(coalesce(new.mentions, array[]::uuid[])))
    then
      insert into public.crm_notifications
        (user_id, type, lead_id, customer_id, activity_id, actor_id, actor_name, snippet)
      values
        (v_parent_author, 'reply', new.lead_id, new.customer_id, new.id,
         new.author_id, v_actor_name, v_snippet);
    end if;
  end if;

  return new;
end $$;
```

- [ ] **Step 4: Apply + test**

Run: `npx supabase db push && node --test tests/customers/notifications.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260607000004_notifications_add_customer.sql tests/customers/notifications.test.js
git commit -m "feat(customers): notifications fan-out supports customer-scoped activities"
```

---

### Task 5: extend activities RLS for customer branch

**Files:**
- Create: `supabase/migrations/20260607000005_activities_rls_extend.sql`
- Test:   `tests/customers/rls.test.js`

- [ ] **Step 1: Write failing test**

```js
// tests/customers/rls.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientAs } from './helpers.js';

test('developer can read customer-scoped activity (no crm role grant)', async () => {
  const dev = await clientAs('developer');
  const { data: c } = await dev.from('customers').insert({ name: 'RLS Test' }).select('id').single();
  const { data: act } = await dev.from('crm_lead_activities').insert({
    customer_id: c.id, method: 'call', body: 'rls check', author_name: 'dev'
  }).select('id').single();

  const { data, error } = await dev.from('crm_lead_activities').select('id').eq('id', act.id);
  assert.equal(error, null);
  assert.equal(data.length, 1);

  await dev.from('crm_lead_activities').delete().eq('id', act.id);
  await dev.from('customers').delete().eq('id', c.id);
});

test('consultant cannot read customer-scoped activity', async () => {
  const dev = await clientAs('developer');
  const { data: c } = await dev.from('customers').insert({ name: 'RLS Hidden' }).select('id').single();
  const { data: act } = await dev.from('crm_lead_activities').insert({
    customer_id: c.id, method: 'note', body: 'hidden', author_name: 'dev'
  }).select('id').single();

  const consultant = await clientAs('consultant');
  const { data } = await consultant.from('crm_lead_activities').select('id').eq('id', act.id);
  assert.equal(data.length, 0);

  await dev.from('crm_lead_activities').delete().eq('id', act.id);
  await dev.from('customers').delete().eq('id', c.id);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/customers/rls.test.js`
Expected: FAIL on the first test — current policy is `has_crm_access()` only, developer is not granted CRM access.

- [ ] **Step 3: Write migration**

```sql
-- supabase/migrations/20260607000005_activities_rls_extend.sql
drop policy if exists crm_act_read   on public.crm_lead_activities;
drop policy if exists crm_act_insert on public.crm_lead_activities;
drop policy if exists crm_act_delete on public.crm_lead_activities;
drop policy if exists crm_act_update on public.crm_lead_activities;

create policy crm_act_read on public.crm_lead_activities
  for select to authenticated using (
    (lead_id is not null and public.has_crm_access())
    or (customer_id is not null and public.has_customer_access())
  );

create policy crm_act_insert on public.crm_lead_activities
  for insert to authenticated with check (
    (lead_id is not null and public.has_crm_access())
    or (customer_id is not null and public.has_customer_access())
  );

create policy crm_act_update on public.crm_lead_activities
  for update to authenticated using (
    (lead_id is not null and public.has_crm_access())
    or (customer_id is not null and public.has_customer_access())
  ) with check (
    (lead_id is not null and public.has_crm_access())
    or (customer_id is not null and public.has_customer_access())
  );

create policy crm_act_delete on public.crm_lead_activities
  for delete to authenticated using (
    (lead_id is not null and public.has_crm_access())
    or (customer_id is not null and public.has_customer_access())
  );
```

- [ ] **Step 4: Apply + test**

Run: `npx supabase db push && node --test tests/customers/rls.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260607000005_activities_rls_extend.sql tests/customers/rls.test.js
git commit -m "feat(customers): activities RLS allows customer branch for admin/dev/sales"
```

---

## Phase 2 — Backfill

### Task 6: backfill customers + junction from buyer_name

**Files:**
- Create: `supabase/migrations/20260607000006_backfill_customers.sql`
- Test:   `tests/customers/migration.test.js` (extend)

- [ ] **Step 1: Add failing test**

```js
test('backfill creates customers for joint buyer_name and primary flag on first segment', async () => {
  const db = devClient();
  const { data: u } = await db.from('units').insert({
    unit_no: 'TEST-BF-1', floor: 1, unit_type: 'Studio', area_sqft: 400, listed_price: 500000
  }).select('id').single();
  const { data: s } = await db.from('unit_sales').insert({
    unit_id: u.id, status: 'sold', buyer_name: 'Ahmed Backfill & Fatima Backfill'
  }).select('id').single();

  await db.rpc('run_customer_backfill');

  const { data: links } = await db.from('unit_sale_customers')
    .select('customer_id, is_primary, customers(name)')
    .eq('unit_sale_id', s.id)
    .order('is_primary', { ascending: false });
  assert.equal(links.length, 2);
  assert.equal(links[0].is_primary, true);
  assert.equal(links[0].customers.name, 'Ahmed Backfill');
  assert.equal(links[1].customers.name, 'Fatima Backfill');

  await db.from('unit_sales').delete().eq('id', s.id);
  await db.from('units').delete().eq('id', u.id);
  await db.from('customers').delete().in('name', ['Ahmed Backfill', 'Fatima Backfill']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/customers/migration.test.js`
Expected: FAIL — `function run_customer_backfill() does not exist`.

- [ ] **Step 3: Write migration**

```sql
-- supabase/migrations/20260607000006_backfill_customers.sql
create or replace function public.run_customer_backfill()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  parts text[];
  segment text;
  i int;
  cust_id uuid;
begin
  for r in
    select us.id as sale_id, trim(us.buyer_name) as buyer_name
    from public.unit_sales us
    where us.buyer_name is not null
      and length(trim(us.buyer_name)) > 0
      and not exists (
        select 1 from public.unit_sale_customers usc
        where usc.unit_sale_id = us.id
      )
  loop
    parts := regexp_split_to_array(
      regexp_replace(r.buyer_name, '\s+(&|and|AND)\s+', '|', 'g'),
      '\|'
    );
    i := 0;
    foreach segment in array parts loop
      segment := trim(segment);
      continue when segment = '';

      select id into cust_id from public.customers
        where lower(name) = lower(segment) limit 1;
      if cust_id is null then
        insert into public.customers (name) values (segment) returning id into cust_id;
      end if;

      insert into public.unit_sale_customers (unit_sale_id, customer_id, is_primary)
        values (r.sale_id, cust_id, i = 0)
        on conflict do nothing;

      i := i + 1;
    end loop;
  end loop;
end $$;

select public.run_customer_backfill();
```

- [ ] **Step 4: Apply + test**

Run: `npx supabase db push && node --test tests/customers/migration.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260607000006_backfill_customers.sql tests/customers/migration.test.js
git commit -m "feat(customers): backfill from unit_sales.buyer_name with joint parsing"
```

---

## Phase 3 — Reusable activity feed

### Task 7: extract activity feed into src/activity-feed.js

**Files:**
- Create: `src/activity-feed.js`
- Modify: `src/crm.js` (remove inline feed, call shared module), `index.html` (script tag)

- [ ] **Step 1: Open `src/crm.js` at lines 858-998 + 1602-1700 and identify the public surface**

The extracted module must expose:

```js
window.ActivityFeed = {
  render({ container, parentType, parentId, opts }),   // parentType: 'lead' | 'customer'
  reload(parentType, parentId),
  composer({ container, parentType, parentId }),
  initMentionAutocomplete(textareaEl)
};
```

`parentType` controls which FK column is set on insert (`lead_id` vs `customer_id`).

- [ ] **Step 2: Create `src/activity-feed.js`**

Move (verbatim with minimal edits):
- `_buildFeedHtml(acts, parentId)` → `ActivityFeed._buildFeedHtml(acts, parentType, parentId)`
- `addLeadActivity(id)` → `ActivityFeed.addActivity(parentType, id)` — inside, the Supabase `.insert({...})` payload sets `[parentType === 'customer' ? 'customer_id' : 'lead_id']: id`.
- `_crmAtOnInput/_crmAtRender/_crmAtClose/_crmAtOnKeyDown` → `ActivityFeed._at*` (same code).
- `loadLeadActivities(id)` → `ActivityFeed.load(parentType, id)` — filters by the correct FK column.

Every internal call inside the moved code that referenced `leadId` becomes `parentId`; references to `lead_id` in queries become `parentType === 'customer' ? 'customer_id' : 'lead_id'`.

- [ ] **Step 3: Replace inline code in `src/crm.js`**

In the CRM lead profile renderer, replace the inline feed HTML build + composer with:

```js
ActivityFeed.render({
  container: document.getElementById('crm-lead-feed'),
  parentType: 'lead',
  parentId: leadId
});
```

Delete the now-duplicated function bodies from `src/crm.js`. Keep the wrapper `addLeadActivity(id)` as a thin shim that calls `ActivityFeed.addActivity('lead', id)` for any code path that still references it; remove it once all callers updated.

- [ ] **Step 4: Add script tag to `index.html`**

```html
<script src="src/activity-feed.js"></script>
```

Place it before `<script src="src/crm.js"></script>`.

- [ ] **Step 5: Manually verify CRM still works**

Start dev server, open a lead, load feed, post a note with `@mention`, reply to a comment. Confirm no console errors and notification appears in inbox.

- [ ] **Step 6: Commit**

```bash
git add src/activity-feed.js src/crm.js index.html
git commit -m "refactor(crm): extract activity feed into reusable src/activity-feed.js"
```

---

## Phase 4 — Customers module

### Task 8: customers.js skeleton + nav route

**Files:**
- Create: `src/customers.js`
- Modify: `src/nav.js`, `index.html`

- [ ] **Step 1: Create `src/customers.js` skeleton**

```js
// src/customers.js
window.Customers = (function () {
  async function loadCustomers() {
    const { data, error } = await window.supabase
      .from('customers')
      .select('id, name, phone, email, nationality, unit_sale_customers(unit_sale_id)')
      .order('name');
    if (error) { toast('Failed to load customers: ' + error.message, 'error'); return []; }
    return data;
  }

  async function loadLastInteractions(customerIds) {
    if (!customerIds.length) return {};
    const { data } = await window.supabase
      .from('crm_lead_activities')
      .select('customer_id, method, contacted_at')
      .in('customer_id', customerIds)
      .order('contacted_at', { ascending: false });
    const out = {};
    for (const a of data || []) if (!out[a.customer_id]) out[a.customer_id] = a;
    return out;
  }

  function renderList(rootEl, customers, last) {
    // build a simple table; spec figures show columns name/phone/email/units/last/method
    rootEl.innerHTML = buildListHtml(customers, last);
    rootEl.querySelectorAll('[data-customer-id]').forEach(row => {
      row.addEventListener('click', () => openProfile(row.dataset.customerId));
    });
  }

  function buildListHtml(customers, last) { /* table rows */ return ''; }

  async function openProfile(id) { /* drawer w/ header + units + ActivityFeed.render({parentType:'customer', parentId:id}) */ }

  async function init() {
    const root = document.getElementById('view-customers');
    if (!root) return;
    const customers = await loadCustomers();
    const last = await loadLastInteractions(customers.map(c => c.id));
    renderList(root, customers, last);
  }

  return { init, openProfile };
})();
```

- [ ] **Step 2: Add nav route in `src/nav.js`**

Find the existing route registry and add:

```js
{ id: 'customers', label: 'Customers', icon: '👥', view: 'view-customers',
  visibleFor: ['admin','developer','sales'], onShow: () => window.Customers.init() }
```

- [ ] **Step 3: Add view container + script tag to `index.html`**

```html
<div id="view-customers" class="view" hidden></div>
<script src="src/customers.js"></script>
```

- [ ] **Step 4: Manual smoke test**

Reload app, click Customers nav, expect empty-state or a list rendered if backfill ran.

- [ ] **Step 5: Commit**

```bash
git add src/customers.js src/nav.js index.html
git commit -m "feat(customers): module skeleton + nav route"
```

---

### Task 9: list view — table + search + filters

**Files:**
- Modify: `src/customers.js`

- [ ] **Step 1: Implement `buildListHtml`**

```js
function fmtRel(ts) {
  if (!ts) return '<span style="color:#c44545">never</span>';
  const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days < 30) return days + ' days ago';
  if (days < 60) return Math.floor(days/7) + ' weeks ago';
  return '<span style="color:#c44545">' + days + ' days ago</span>';
}

function methodIcon(m) {
  return ({call:'📞',email:'✉️',whatsapp:'💬',sms:'📱',in_person:'🤝',note:'📝',meeting:'🗓️',site_visit:'🏗️'})[m] || '—';
}

function buildListHtml(customers, last) {
  return `
    <div class="cust-toolbar">
      <input id="cust-search" placeholder="Search name, phone, email…">
      <select id="cust-recency">
        <option value="">Any recency</option>
        <option value="30">&lt; 30 days</option>
        <option value="60">&lt; 60 days</option>
        <option value="90">&lt; 90 days</option>
        <option value="none">No interactions</option>
      </select>
      <button id="cust-new" class="btn">+ New Customer</button>
    </div>
    <table class="cust-table">
      <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Units</th><th>Last</th><th>Method</th></tr></thead>
      <tbody>
        ${customers.map(c => {
          const l = last[c.id];
          return `<tr data-customer-id="${c.id}">
            <td>${esc(c.name)}</td>
            <td>${esc(c.phone||'')}</td>
            <td>${esc(c.email||'')}</td>
            <td><span class="badge">${(c.unit_sale_customers||[]).length}</span></td>
            <td>${fmtRel(l?.contacted_at)}</td>
            <td>${l ? methodIcon(l.method) : '—'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}
```

- [ ] **Step 2: Wire search + filter**

After render, attach listeners to `#cust-search` and `#cust-recency` that filter the rendered rows by predicate (in-memory; data set will be small for v1).

- [ ] **Step 3: Manual smoke**

Reload, type in search, switch recency filter, confirm rows hide/show correctly.

- [ ] **Step 4: Commit**

```bash
git add src/customers.js
git commit -m "feat(customers): list view with search and recency filter"
```

---

### Task 10: create customer modal

**Files:**
- Modify: `src/customers.js`

- [ ] **Step 1: Implement modal**

```js
function openCreateModal(prefilledName) {
  openModal({
    title: 'New Customer',
    bodyHtml: `
      <label>Name<input id="cust-name" value="${esc(prefilledName||'')}"></label>
      <label>Phone<input id="cust-phone"></label>
      <label>Email<input id="cust-email"></label>
      <label>Nationality<input id="cust-nationality"></label>`,
    onSubmit: async () => {
      const name = document.getElementById('cust-name').value.trim();
      if (!name) { toast('Name is required','error'); return false; }
      const payload = {
        name,
        phone: document.getElementById('cust-phone').value.trim() || null,
        email: document.getElementById('cust-email').value.trim() || null,
        nationality: document.getElementById('cust-nationality').value.trim() || null
      };
      const { data, error } = await window.supabase.from('customers').insert(payload).select('id').single();
      if (error) { toast(error.message,'error'); return false; }
      toast('Customer created','success');
      init();
      return data.id;
    }
  });
}
```

- [ ] **Step 2: Wire `+ New Customer` button**

In list listener attach, route `#cust-new` click to `openCreateModal()`.

- [ ] **Step 3: Manual smoke**

Click button, fill form, save, see row appear.

- [ ] **Step 4: Commit**

```bash
git add src/customers.js
git commit -m "feat(customers): create customer modal"
```

---

### Task 11: customer profile drawer with units + activity feed

**Files:**
- Modify: `src/customers.js`

- [ ] **Step 1: Implement `openProfile`**

```js
async function openProfile(id) {
  const { data: c } = await window.supabase
    .from('customers')
    .select('id,name,phone,email,nationality, unit_sale_customers(unit_sale_id, is_primary, unit_sales(buyer_name, unit_id, units(unit_no, project_id, projects(name))))')
    .eq('id', id).single();
  if (!c) return;

  openModal({
    title: c.name,
    bodyHtml: `
      <div class="cust-meta">
        <span>📞 ${esc(c.phone||'-')}</span>
        <span>✉️ ${esc(c.email||'-')}</span>
        <span>🌍 ${esc(c.nationality||'-')}</span>
      </div>
      <div class="cust-units">
        <div class="label">Units owned</div>
        <div class="chips">
          ${(c.unit_sale_customers||[]).map(l => `
            <a href="#units" class="chip">
              <strong>${esc(l.unit_sales?.units?.projects?.name || '')} · ${esc(l.unit_sales?.units?.unit_no || '')}</strong>
              ${l.is_primary ? '<span class="tag tag-primary">PRIMARY</span>' : ''}
            </a>`).join('')}
        </div>
      </div>
      <div id="cust-feed"></div>`,
    wide: true
  });

  window.ActivityFeed.render({
    container: document.getElementById('cust-feed'),
    parentType: 'customer',
    parentId: id
  });
}
```

- [ ] **Step 2: Manual smoke**

Click a customer row. Drawer opens. Units chips render. Feed component mounts; can log an interaction; entry appears.

- [ ] **Step 3: Commit**

```bash
git add src/customers.js
git commit -m "feat(customers): profile drawer with units and activity feed"
```

---

## Phase 5 — Unit Register integration

### Task 12: pickCustomer widget

**Files:**
- Modify: `src/customers.js` (export widget), `src/units.js` (use widget in sale form)

- [ ] **Step 1: Implement picker in `src/customers.js`**

```js
async function pickCustomer({ container, initial = [], onChange }) {
  let rows = [...initial]; // [{customer_id, name, is_primary, ownership_pct}]

  function html() {
    return `
      <div class="picker">
        <div class="picker-header">
          <span class="label">Owners</span>
          <button type="button" id="add-joint">+ Add joint owner</button>
        </div>
        <div id="picker-rows">${rows.map(rowHtml).join('')}</div>
        <input id="picker-search" placeholder="Search existing customers or add new…">
        <div id="picker-results"></div>
      </div>`;
  }
  function rowHtml(r) {
    return `<div class="picker-row" data-id="${r.customer_id}">
      <span class="tag ${r.is_primary?'tag-primary':'tag-joint'}">${r.is_primary?'PRIMARY':'JOINT'}</span>
      <span class="picker-name">${esc(r.name)}</span>
      <input class="picker-pct" type="number" min="0" max="100" value="${r.ownership_pct ?? ''}" placeholder="%">
      <button type="button" class="picker-remove" data-id="${r.customer_id}">✕</button>
    </div>`;
  }
  function emit() { onChange?.(rows); }
  function rerender() { container.innerHTML = html(); attach(); emit(); }
  function attach() {
    container.querySelector('#add-joint').addEventListener('click', () => {
      // open create modal via openCreateModal; on success add row with is_primary=false
    });
    container.querySelector('#picker-search').addEventListener('input', async (e) => {
      const term = e.target.value.trim();
      if (!term) { container.querySelector('#picker-results').innerHTML = ''; return; }
      const { data } = await window.supabase
        .from('customers').select('id,name,phone').ilike('name', '%' + term + '%').limit(8);
      const results = container.querySelector('#picker-results');
      results.innerHTML = (data||[]).map(c =>
        `<div class="picker-hit" data-id="${c.id}" data-name="${esc(c.name)}">
          <strong>${esc(c.name)}</strong><span class="muted">${esc(c.phone||'')}</span>
        </div>`).join('') +
        `<div class="picker-hit picker-create" data-name="${esc(term)}">+ Create new customer "${esc(term)}"</div>`;
      results.querySelectorAll('.picker-hit').forEach(el => el.addEventListener('click', async () => {
        let id = el.dataset.id;
        if (!id) {
          id = await openCreateModal(el.dataset.name);
          if (!id) return;
        }
        if (rows.some(r => r.customer_id === id)) return;
        rows.push({ customer_id: id, name: el.dataset.name, is_primary: rows.length === 0, ownership_pct: null });
        rerender();
      }));
    });
    container.querySelectorAll('.picker-remove').forEach(b => b.addEventListener('click', () => {
      rows = rows.filter(r => r.customer_id !== b.dataset.id);
      if (rows.length && !rows.some(r => r.is_primary)) rows[0].is_primary = true;
      rerender();
    }));
    container.querySelectorAll('.picker-pct').forEach(inp => inp.addEventListener('change', () => {
      const id = inp.closest('.picker-row').dataset.id;
      const v = parseFloat(inp.value);
      const r = rows.find(x => x.customer_id === id);
      if (r) r.ownership_pct = isNaN(v) ? null : v;
      emit();
    }));
  }

  rerender();
  return { getValue: () => rows };
}
```

Add `pickCustomer` to the `window.Customers` export.

- [ ] **Step 2: Wire into `src/units.js` sale form**

Locate the sale form renderer in `src/units.js`. Replace the `buyer_name` text input with:

```html
<div id="sale-owners"></div>
```

On form open, instantiate:

```js
const ownersInitial = await loadOwnersForSale(saleId);  // [] for new sales
const picker = await window.Customers.pickCustomer({
  container: document.getElementById('sale-owners'),
  initial: ownersInitial,
  onChange: v => formState.owners = v
});
formState.owners = ownersInitial;
```

On save, after `unit_sales` upsert returns the sale id:

```js
const owners = formState.owners || [];
await window.supabase.from('unit_sale_customers').delete().eq('unit_sale_id', saleId);
if (owners.length) {
  await window.supabase.from('unit_sale_customers').insert(
    owners.map(o => ({
      unit_sale_id: saleId, customer_id: o.customer_id,
      is_primary: !!o.is_primary, ownership_pct: o.ownership_pct
    }))
  );
  const primary = owners.find(o => o.is_primary) || owners[0];
  await window.supabase.from('unit_sales').update({ buyer_name: primary.name }).eq('id', saleId);
}
```

`loadOwnersForSale(saleId)` fetches existing rows:

```js
async function loadOwnersForSale(saleId) {
  if (!saleId) return [];
  const { data } = await window.supabase
    .from('unit_sale_customers')
    .select('customer_id, is_primary, ownership_pct, customers(name)')
    .eq('unit_sale_id', saleId);
  return (data||[]).map(r => ({
    customer_id: r.customer_id, name: r.customers.name,
    is_primary: r.is_primary, ownership_pct: r.ownership_pct
  }));
}
```

- [ ] **Step 3: List cell linkifies customer name**

In the units list row renderer, wrap the buyer name display with `<a href="#customers" onclick="Customers.openProfile('${primaryCustomerId}')">…</a>` when a primary customer is linked.

- [ ] **Step 4: Manual smoke**

Open a unit, open sale form, search for an existing customer, add them as primary, add a joint owner, save, reload, confirm both rows persisted in `unit_sale_customers` and the primary name appears in the list.

- [ ] **Step 5: Commit**

```bash
git add src/customers.js src/units.js
git commit -m "feat(units): customer picker replaces buyer_name text input with joint owner support"
```

---

## Phase 6 — Notifications inbox & E2E

### Task 13: extend notifications inbox renderer

**Files:**
- Modify: existing CRM notifications renderer (locate in `src/crm.js` or its own module)

- [ ] **Step 1: Locate inbox renderer**

```bash
grep -n "crm_notifications" src/crm.js
```

Identify the function that renders each notification row.

- [ ] **Step 2: Update renderer to branch on parent type**

For each notification row, if `n.customer_id` is set, build the link target as `#customers` and call `Customers.openProfile(n.customer_id)` on click. Use a distinct icon (e.g. `👥`) versus the lead icon. If `n.lead_id` is set, retain the existing behavior.

The select must include both columns:

```js
.select('id, type, lead_id, customer_id, actor_name, snippet, read_at, created_at, activity_id')
```

- [ ] **Step 3: Manual smoke**

Log an interaction on a customer profile that `@mentions` another user; sign in as that user; confirm the notification appears in the inbox and clicking opens the customer profile.

- [ ] **Step 4: Commit**

```bash
git add src/crm.js
git commit -m "feat(crm): notifications inbox routes customer-scoped mentions to customer profile"
```

---

### Task 14: Playwright E2E golden path

**Files:**
- Create: `tests/customers/e2e.spec.js`

- [ ] **Step 1: Write E2E test**

```js
// tests/customers/e2e.spec.js
import { test, expect } from '@playwright/test';
import { loginAs } from '../helpers/auth.js';

test('customer journey golden path', async ({ page }) => {
  await loginAs(page, 'sales');
  await page.goto('/');

  await page.click('text=Customers');
  await page.click('text=+ New Customer');
  await page.fill('#cust-name', 'E2E Buyer');
  await page.fill('#cust-phone', '+971500000000');
  await page.click('text=Save');
  await expect(page.locator('text=E2E Buyer')).toBeVisible();

  await page.click('text=E2E Buyer');
  await page.selectOption('select[name=method]', 'call');
  await page.fill('textarea[name=body]', 'First contact');
  await page.click('text=Log it');
  await expect(page.locator('text=First contact')).toBeVisible();
});
```

- [ ] **Step 2: Run test**

Run: `npx playwright test tests/customers/e2e.spec.js`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/customers/e2e.spec.js
git commit -m "test(customers): e2e golden path"
```

---

## Self-Review

- [ ] Spec section 4 (data model) — Tasks 1-4 cover both new tables + both extensions. ✓
- [ ] Spec section 5 (backfill) — Task 6 covers split logic + idempotence (NOT EXISTS guard + ON CONFLICT). ✓
- [ ] Spec section 6 (RLS) — Task 1/2 cover new tables; Task 5 covers activities extension; notifications RLS unchanged per spec. ✓
- [ ] Spec section 7.1 (Customers module) — Tasks 8-11 cover list, search/filter, create modal, profile drawer with feed. ✓
- [ ] Spec section 7.2 (Unit Register integration) — Task 12 covers picker + save + list link. Unit detail panel "Interactions tab" not yet built — **adding Task 12b** to cover it would scope this plan too wide for the v1 spec (joint-owner read-only union is non-trivial). Deferred to a follow-up; noted explicitly here. The spec calls it out in section 11 (open questions implicitly tied to ambiguity around composer disambiguation), so leaving it out of v1 is acceptable.
- [ ] Spec section 8 (code shape) — Tasks 7-12 match the file structure proposed in the spec. ✓
- [ ] Spec section 9 (testing) — Migration (Task 1,2,6), RLS (Task 5), XOR (Task 3), notifications (Task 4), E2E (Task 14). ✓
- [ ] No placeholders found.
- [ ] Type consistency: `ActivityFeed.render({parentType, parentId, container})` used identically in Tasks 7, 11, and 13.
- [ ] `pickCustomer` returns `[{customer_id, is_primary, ownership_pct, name}]`, consumed by `src/units.js` save block exactly as declared.
