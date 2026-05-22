-- Bug 1 & 3: auto-create profile row on auth.users INSERT via DB trigger.
-- This runs as SECURITY DEFINER so it bypasses RLS, removing the need
-- for the client to hold an active session during signup.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, company, requested_role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    'pending',
    coalesce(new.raw_user_meta_data->>'company', ''),
    new.raw_user_meta_data->>'requested_role'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Drop trigger if it already exists, then recreate
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
