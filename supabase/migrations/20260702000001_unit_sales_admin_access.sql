-- Migration: 20260702000001_unit_sales_admin_access.sql
-- Extend units / unit_sales / payment_milestones RLS to admin role so
-- Sales Admin users can add, edit, and delete unit sales alongside developers.

-- ── units ───────────────────────────────────────────────────────────────────
drop policy if exists "units: developer select" on public.units;
drop policy if exists "units: developer insert" on public.units;
drop policy if exists "units: developer update" on public.units;
drop policy if exists "units: developer delete" on public.units;

create policy "units: developer select" on public.units
  for select to authenticated using (public.get_user_role() in ('developer','admin'));
create policy "units: developer insert" on public.units
  for insert to authenticated with check (public.get_user_role() in ('developer','admin'));
create policy "units: developer update" on public.units
  for update to authenticated
  using (public.get_user_role() in ('developer','admin'))
  with check (public.get_user_role() in ('developer','admin'));
create policy "units: developer delete" on public.units
  for delete to authenticated using (public.get_user_role() in ('developer','admin'));

-- ── unit_sales ──────────────────────────────────────────────────────────────
drop policy if exists "unit_sales: developer select" on public.unit_sales;
drop policy if exists "unit_sales: developer insert" on public.unit_sales;
drop policy if exists "unit_sales: developer update" on public.unit_sales;
drop policy if exists "unit_sales: developer delete" on public.unit_sales;

create policy "unit_sales: developer select" on public.unit_sales
  for select to authenticated using (public.get_user_role() in ('developer','admin'));
create policy "unit_sales: developer insert" on public.unit_sales
  for insert to authenticated with check (public.get_user_role() in ('developer','admin'));
create policy "unit_sales: developer update" on public.unit_sales
  for update to authenticated
  using (public.get_user_role() in ('developer','admin'))
  with check (public.get_user_role() in ('developer','admin'));
create policy "unit_sales: developer delete" on public.unit_sales
  for delete to authenticated using (public.get_user_role() in ('developer','admin'));

-- ── payment_milestones ──────────────────────────────────────────────────────
drop policy if exists "payment_milestones: developer select" on public.payment_milestones;
drop policy if exists "payment_milestones: developer insert" on public.payment_milestones;
drop policy if exists "payment_milestones: developer update" on public.payment_milestones;
drop policy if exists "payment_milestones: developer delete" on public.payment_milestones;

create policy "payment_milestones: developer select" on public.payment_milestones
  for select to authenticated using (public.get_user_role() in ('developer','admin'));
create policy "payment_milestones: developer insert" on public.payment_milestones
  for insert to authenticated with check (public.get_user_role() in ('developer','admin'));
create policy "payment_milestones: developer update" on public.payment_milestones
  for update to authenticated
  using (public.get_user_role() in ('developer','admin'))
  with check (public.get_user_role() in ('developer','admin'));
create policy "payment_milestones: developer delete" on public.payment_milestones
  for delete to authenticated using (public.get_user_role() in ('developer','admin'));
