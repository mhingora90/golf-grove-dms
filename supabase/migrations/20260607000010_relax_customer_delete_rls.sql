-- The original delete policy only allowed admin to delete customers, which
-- silently failed for developer/sales users (RLS returns 0 affected rows
-- with no error). Relax to has_customer_access() to match insert/update.

drop policy if exists "customers: delete" on public.customers;

create policy "customers: delete" on public.customers
  for delete to authenticated using (public.has_customer_access());
