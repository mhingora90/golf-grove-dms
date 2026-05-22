-- Only mohammed@regent-developments.com can update the role column on profiles.
-- Other developers can read all profiles but cannot change roles.

drop policy if exists "profiles: developer updates any profile" on public.profiles;

create policy "profiles: admin updates any profile"
  on public.profiles for update to authenticated
  using (
    (select email from auth.users where id = auth.uid()) = 'mohammed@regent-developments.com'
  )
  with check (
    (select email from auth.users where id = auth.uid()) = 'mohammed@regent-developments.com'
  );
