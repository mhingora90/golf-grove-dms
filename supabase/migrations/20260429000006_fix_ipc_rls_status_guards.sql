-- Fix RLS gaps on payment_certificates and payment_certificate_items
-- Enforce status-based write guards per role:
--   contractor : can touch certs only in (Draft, Submitted); new status in (Draft, Submitted)
--   consultant : can touch certs only in (Submitted, Under Review, Certified); new status in (Submitted, Under Review, Certified)
--   developer  : unrestricted

-- payment_certificates UPDATE — replace single permissive policy with role-split policies
drop policy if exists "payment_certs_update" on payment_certificates;

create policy "payment_certs_update_developer" on payment_certificates
  for update to authenticated
  using    (get_user_role() = 'developer')
  with check (get_user_role() = 'developer');

create policy "payment_certs_update_contractor" on payment_certificates
  for update to authenticated
  using    (get_user_role() = 'contractor' and status in ('Draft','Submitted'))
  with check (get_user_role() = 'contractor' and status in ('Draft','Submitted'));

create policy "payment_certs_update_consultant" on payment_certificates
  for update to authenticated
  using    (get_user_role() = 'consultant' and status in ('Submitted','Under Review','Certified'))
  with check (get_user_role() = 'consultant' and status in ('Submitted','Under Review','Certified'));

-- payment_certificate_items UPDATE — status-gated via join to parent cert
drop policy if exists "payment_cert_items_update" on payment_certificate_items;

create policy "payment_cert_items_update_developer" on payment_certificate_items
  for update to authenticated
  using    (get_user_role() = 'developer')
  with check (get_user_role() = 'developer');

create policy "payment_cert_items_update_contractor" on payment_certificate_items
  for update to authenticated
  using (
    get_user_role() = 'contractor'
    and exists (
      select 1 from payment_certificates pc
      where pc.id = cert_id
        and pc.status in ('Draft','Submitted')
    )
  )
  with check (
    get_user_role() = 'contractor'
    and exists (
      select 1 from payment_certificates pc
      where pc.id = cert_id
        and pc.status in ('Draft','Submitted')
    )
  );

create policy "payment_cert_items_update_consultant" on payment_certificate_items
  for update to authenticated
  using (
    get_user_role() = 'consultant'
    and exists (
      select 1 from payment_certificates pc
      where pc.id = cert_id
        and pc.status in ('Under Review','Certified')
    )
  )
  with check (
    get_user_role() = 'consultant'
    and exists (
      select 1 from payment_certificates pc
      where pc.id = cert_id
        and pc.status in ('Under Review','Certified')
    )
  );
