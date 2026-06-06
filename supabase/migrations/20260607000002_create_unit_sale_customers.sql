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
