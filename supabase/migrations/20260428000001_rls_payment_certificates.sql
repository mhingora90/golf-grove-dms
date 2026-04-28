-- RLS for payment certificate tables
-- All authenticated users can read; writes are role-gated

alter table boq_bills enable row level security;
alter table boq_items enable row level security;
alter table payment_certificates enable row level security;
alter table payment_certificate_items enable row level security;

-- boq_bills
drop policy if exists "boq_bills_select" on boq_bills;
drop policy if exists "boq_bills_insert" on boq_bills;
drop policy if exists "boq_bills_delete" on boq_bills;

create policy "boq_bills_select" on boq_bills for select to authenticated using (true);
create policy "boq_bills_insert" on boq_bills for insert to authenticated
  with check (get_user_role() in ('developer','consultant'));
create policy "boq_bills_delete" on boq_bills for delete to authenticated
  using (get_user_role() in ('developer','consultant'));

-- boq_items
drop policy if exists "boq_items_select" on boq_items;
drop policy if exists "boq_items_insert" on boq_items;
drop policy if exists "boq_items_delete" on boq_items;

create policy "boq_items_select" on boq_items for select to authenticated using (true);
create policy "boq_items_insert" on boq_items for insert to authenticated
  with check (get_user_role() in ('developer','consultant'));
create policy "boq_items_delete" on boq_items for delete to authenticated
  using (get_user_role() in ('developer','consultant'));

-- payment_certificates
drop policy if exists "payment_certs_select" on payment_certificates;
drop policy if exists "payment_certs_insert" on payment_certificates;
drop policy if exists "payment_certs_update" on payment_certificates;

create policy "payment_certs_select" on payment_certificates for select to authenticated using (true);
create policy "payment_certs_insert" on payment_certificates for insert to authenticated
  with check (get_user_role() in ('developer','contractor'));
create policy "payment_certs_update" on payment_certificates for update to authenticated
  using (get_user_role() in ('developer','consultant','contractor'));

-- payment_certificate_items
drop policy if exists "payment_cert_items_select" on payment_certificate_items;
drop policy if exists "payment_cert_items_insert" on payment_certificate_items;
drop policy if exists "payment_cert_items_update" on payment_certificate_items;
drop policy if exists "payment_cert_items_delete" on payment_certificate_items;

create policy "payment_cert_items_select" on payment_certificate_items for select to authenticated using (true);
create policy "payment_cert_items_insert" on payment_certificate_items for insert to authenticated
  with check (get_user_role() in ('developer','contractor'));
create policy "payment_cert_items_update" on payment_certificate_items for update to authenticated
  using (get_user_role() in ('developer','consultant','contractor'));
create policy "payment_cert_items_delete" on payment_certificate_items for delete to authenticated
  using (get_user_role() in ('developer','contractor'));
