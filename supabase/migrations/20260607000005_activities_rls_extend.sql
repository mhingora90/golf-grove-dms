-- Extend crm_lead_activities RLS to cover both lead-scoped and customer-scoped activities.
--
-- Before: policies used has_crm_access() only — semantically tied to the lead branch.
-- After:  policies branch on which parent FK is set:
--           (lead_id     IS NOT NULL AND has_crm_access())
--           OR (customer_id IS NOT NULL AND has_customer_access())
--
-- has_crm_access()      → developer | sales | admin
-- has_customer_access() → developer | sales | admin
-- (sets are currently identical; the branched form encodes the contract so future
--  divergence of either set is reflected in the policy without further edits.)

drop policy if exists crm_act_read   on public.crm_lead_activities;
drop policy if exists crm_act_insert on public.crm_lead_activities;
drop policy if exists crm_act_update on public.crm_lead_activities;
drop policy if exists crm_act_delete on public.crm_lead_activities;

create policy crm_act_read on public.crm_lead_activities
  for select to authenticated using (
       (lead_id     is not null and public.has_crm_access())
    or (customer_id is not null and public.has_customer_access())
  );

create policy crm_act_insert on public.crm_lead_activities
  for insert to authenticated with check (
       (lead_id     is not null and public.has_crm_access())
    or (customer_id is not null and public.has_customer_access())
  );

create policy crm_act_update on public.crm_lead_activities
  for update to authenticated
  using (
       (lead_id     is not null and public.has_crm_access())
    or (customer_id is not null and public.has_customer_access())
  )
  with check (
       (lead_id     is not null and public.has_crm_access())
    or (customer_id is not null and public.has_customer_access())
  );

create policy crm_act_delete on public.crm_lead_activities
  for delete to authenticated using (
       (lead_id     is not null and public.has_crm_access())
    or (customer_id is not null and public.has_customer_access())
  );
