-- Make lead_id nullable so activities can belong to either a lead or a customer
alter table public.crm_lead_activities
  alter column lead_id drop not null;

-- Add customer_id FK (idempotent)
alter table public.crm_lead_activities
  add column if not exists customer_id uuid
    references public.customers(id) on delete cascade;

-- Index for customer timeline queries
create index if not exists crm_activities_customer_idx
  on public.crm_lead_activities (customer_id, contacted_at desc)
  where customer_id is not null;

-- XOR constraint: exactly one of lead_id / customer_id must be set
alter table public.crm_lead_activities
  drop constraint if exists crm_activities_parent_xor;
alter table public.crm_lead_activities
  add constraint crm_activities_parent_xor
    check ((lead_id is not null) <> (customer_id is not null));

-- Backfill: existing lead-only rows satisfy XOR already (lead_id set, customer_id null)
-- No data migration needed for prior rows.

-- Extend method enum to include sms, in_person, task
-- Drop old inline check (auto-named by Postgres) then re-add with full set
alter table public.crm_lead_activities
  drop constraint if exists crm_lead_activities_method_check;
alter table public.crm_lead_activities
  add constraint crm_lead_activities_method_check
    check (method in ('call','whatsapp','email','sms','in_person','meeting','site_visit','note','task'));
