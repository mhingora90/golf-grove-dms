-- Migration: 20260703000001_usc_developer_delete.sql
-- unit_sale_customers DELETE was admin-only, so developer saves in the
-- sale form failed to clear the join table before re-inserting owners,
-- producing "duplicate key" errors on the (unit_sale_id, customer_id) PK.
-- Grant delete to developer + admin (same as select/insert/update).

drop policy if exists "usc: delete" on public.unit_sale_customers;

create policy "usc: delete" on public.unit_sale_customers
  for delete to authenticated
  using (public.get_user_role() in ('developer','admin'));
