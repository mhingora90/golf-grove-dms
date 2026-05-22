-- Fix RLS so the admin email (mohammed@regent-developments.com) can:
--   1. DELETE pending profiles (denyUser)
--   2. INSERT into project_users (doApproveUser project assignment)
--
-- The existing "profiles: developer updates any profile" policy was already
-- replaced in migration 000006 with an email-based check, so UPDATE is fine.
-- The missing pieces are DELETE on profiles and INSERT on project_users.

-- ----------------------------------------------------------------
-- profiles DELETE: allow admin email in addition to developer role
-- ----------------------------------------------------------------
drop policy if exists "profiles: developer deletes any profile" on public.profiles;

create policy "profiles: developer deletes any profile"
  on public.profiles for delete to authenticated
  using (
    get_user_role() = 'developer'
    or (select email from auth.users where id = auth.uid()) = 'mohammed@regent-developments.com'
  );

-- ----------------------------------------------------------------
-- project_users INSERT: allow admin email in addition to is_developer()
-- ----------------------------------------------------------------
drop policy if exists "project_users_insert" on public.project_users;

create policy "project_users_insert"
  on public.project_users for insert
  with check (
    is_developer()
    or (select email from auth.users where id = auth.uid()) = 'mohammed@regent-developments.com'
  );
