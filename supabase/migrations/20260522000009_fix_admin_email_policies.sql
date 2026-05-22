-- Fix: replace (select email from auth.users where id = auth.uid())
-- with auth.email() — authenticated role cannot query auth.users directly.

-- profiles UPDATE (migration 000006)
drop policy if exists "profiles: admin updates any profile" on public.profiles;
create policy "profiles: admin updates any profile"
  on public.profiles for update to authenticated
  using  (auth.email() = 'mohammed@regent-developments.com')
  with check (auth.email() = 'mohammed@regent-developments.com');

-- profiles DELETE (migration 000008)
drop policy if exists "profiles: developer deletes any profile" on public.profiles;
create policy "profiles: developer deletes any profile"
  on public.profiles for delete to authenticated
  using (get_user_role() = 'developer' or auth.email() = 'mohammed@regent-developments.com');

-- project_users INSERT (migration 000008)
drop policy if exists "project_users_insert" on public.project_users;
create policy "project_users_insert"
  on public.project_users for insert
  with check (is_developer() or auth.email() = 'mohammed@regent-developments.com');
