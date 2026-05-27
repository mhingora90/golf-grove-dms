-- Replace hardcoded admin email in RLS policies with a role-based is_app_admin() flag.
-- This removes the single point of failure (hardcoded email) from the DB layer.

-- ── 1. Add flag column ──────────────────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_app_admin boolean NOT NULL DEFAULT false;

-- ── 2. Set flag for the current admin (once, by email lookup) ───────────────
UPDATE public.profiles
SET is_app_admin = true
WHERE id = (SELECT id FROM auth.users WHERE email = 'mohammed@regent-developments.com' LIMIT 1);

-- ── 3. Helper function (SECURITY DEFINER bypasses RLS) ──────────────────────
CREATE OR REPLACE FUNCTION public.is_app_admin()
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_app_admin FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$;

-- ── 4. Replace email-based policies ─────────────────────────────────────────

-- profiles UPDATE (was: auth.email() = 'mohammed@...')
DROP POLICY IF EXISTS "profiles: admin updates any profile" ON public.profiles;
CREATE POLICY "profiles: admin updates any profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING  (is_app_admin())
  WITH CHECK (is_app_admin());

-- profiles DELETE (was: get_user_role() = 'developer' OR auth.email() = 'mohammed@...')
DROP POLICY IF EXISTS "profiles: developer deletes any profile" ON public.profiles;
CREATE POLICY "profiles: developer deletes any profile"
  ON public.profiles FOR DELETE TO authenticated
  USING (get_user_role() = 'developer' OR is_app_admin());

-- project_users INSERT (was: is_developer() OR auth.email() = 'mohammed@...')
DROP POLICY IF EXISTS "project_users_insert" ON public.project_users;
CREATE POLICY "project_users_insert"
  ON public.project_users FOR INSERT
  WITH CHECK (is_developer() OR is_app_admin());
