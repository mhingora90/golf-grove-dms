-- customers: canonical buyer / prospect record for Golf Grove DMS.
-- All CRM leads and unit sales can be linked to a customer row.

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
