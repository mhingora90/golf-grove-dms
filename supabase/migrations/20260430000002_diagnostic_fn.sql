-- Temporary diagnostic function — returns RLS status and policy count per table
create or replace function public.rls_diagnostic()
  returns table(tablename text, rowsecurity boolean, policy_count bigint)
  language sql security definer stable set search_path = public
as $$
  select t.tablename::text, t.rowsecurity,
    (select count(*) from pg_policies p where p.tablename = t.tablename and p.schemaname = 'public') as policy_count
  from pg_tables t
  where t.schemaname = 'public'
    and t.tablename in ('submittals','drawings','ncrs','rfis','punch_list','method_statements',
                        'transmittals','correspondence','inspections','payment_certificates')
  order by t.tablename;
$$;
