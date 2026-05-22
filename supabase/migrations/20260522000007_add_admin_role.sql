-- Add 'admin' role: sales-only access, can be requested at signup.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (
  role in ('developer','sales','admin','consultant','contractor','subcontractor','pending')
);

-- Admin has CRM (sales module) access
create or replace function has_crm_access()
returns boolean as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('sales', 'developer', 'admin')
  );
$$ language sql security definer;
