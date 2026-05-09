create or replace function public.list_policies(p_table text)
  returns table(policyname text, cmd text, roles text[], qual text, with_check text)
  language sql security definer stable set search_path = public
as $$
  select policyname::text, cmd::text, roles, qual::text, with_check::text
  from pg_policies
  where schemaname = 'public' and tablename = p_table
  order by policyname;
$$;
