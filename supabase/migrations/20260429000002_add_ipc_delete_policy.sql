-- Allow contractor to delete Draft IPCs, developer to delete any
drop policy if exists "payment_certs_delete" on payment_certificates;

create policy "payment_certs_delete" on payment_certificates for delete to authenticated
  using (
    get_user_role() = 'developer'
    or (get_user_role() = 'contractor' and status = 'Draft')
  );
