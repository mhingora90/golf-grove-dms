-- Migration: 20260509000001_sales_module.sql
-- Creates units, unit_sales, payment_milestones with developer-only RLS.

-- ================================================================
-- units
-- ================================================================
create table if not exists public.units (
  id           uuid primary key default gen_random_uuid(),
  unit_no      text not null unique,
  floor        integer not null,
  unit_type    text not null check (unit_type in ('Studio','1BHK')),
  area_sqft    numeric not null,
  listed_price numeric not null,
  created_at   timestamptz default now()
);

alter table public.units enable row level security;

drop policy if exists "units: developer select" on public.units;
drop policy if exists "units: developer insert" on public.units;
drop policy if exists "units: developer update" on public.units;
drop policy if exists "units: developer delete" on public.units;

create policy "units: developer select" on public.units
  for select to authenticated using (get_user_role() = 'developer');
create policy "units: developer insert" on public.units
  for insert to authenticated with check (get_user_role() = 'developer');
create policy "units: developer update" on public.units
  for update to authenticated
  using (get_user_role() = 'developer') with check (get_user_role() = 'developer');
create policy "units: developer delete" on public.units
  for delete to authenticated using (get_user_role() = 'developer');

-- ================================================================
-- unit_sales
-- ================================================================
create table if not exists public.unit_sales (
  id              uuid primary key default gen_random_uuid(),
  unit_id         uuid not null unique references public.units(id) on delete cascade,
  status          text not null default 'reserved' check (status in ('reserved','sold')),
  buyer_name      text,
  sale_date       date,
  sold_price      numeric,
  discount_amount numeric default 0,
  commission_pct  numeric default 0,
  broker_name     text,
  brokerage_name  text,
  spa_status      text default 'not_signed'
    check (spa_status in ('not_signed','signed_buyer','fully_signed')),
  spa_date        date,
  oqood_status    text default 'not_registered'
    check (oqood_status in ('not_registered','registered')),
  oqood_date      date,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table public.unit_sales enable row level security;

drop policy if exists "unit_sales: developer select" on public.unit_sales;
drop policy if exists "unit_sales: developer insert" on public.unit_sales;
drop policy if exists "unit_sales: developer update" on public.unit_sales;
drop policy if exists "unit_sales: developer delete" on public.unit_sales;

create policy "unit_sales: developer select" on public.unit_sales
  for select to authenticated using (get_user_role() = 'developer');
create policy "unit_sales: developer insert" on public.unit_sales
  for insert to authenticated with check (get_user_role() = 'developer');
create policy "unit_sales: developer update" on public.unit_sales
  for update to authenticated
  using (get_user_role() = 'developer') with check (get_user_role() = 'developer');
create policy "unit_sales: developer delete" on public.unit_sales
  for delete to authenticated using (get_user_role() = 'developer');

-- ================================================================
-- payment_milestones
-- ================================================================
create table if not exists public.payment_milestones (
  id              uuid primary key default gen_random_uuid(),
  unit_sale_id    uuid not null references public.unit_sales(id) on delete cascade,
  milestone_name  text not null,
  amount          numeric not null,
  pct_of_sale     numeric not null,
  due_date        date,
  sort_order      integer not null default 0
);

alter table public.payment_milestones enable row level security;

drop policy if exists "payment_milestones: developer select" on public.payment_milestones;
drop policy if exists "payment_milestones: developer insert" on public.payment_milestones;
drop policy if exists "payment_milestones: developer update" on public.payment_milestones;
drop policy if exists "payment_milestones: developer delete" on public.payment_milestones;

create policy "payment_milestones: developer select" on public.payment_milestones
  for select to authenticated using (get_user_role() = 'developer');
create policy "payment_milestones: developer insert" on public.payment_milestones
  for insert to authenticated with check (get_user_role() = 'developer');
create policy "payment_milestones: developer update" on public.payment_milestones
  for update to authenticated
  using (get_user_role() = 'developer') with check (get_user_role() = 'developer');
create policy "payment_milestones: developer delete" on public.payment_milestones
  for delete to authenticated using (get_user_role() = 'developer');
