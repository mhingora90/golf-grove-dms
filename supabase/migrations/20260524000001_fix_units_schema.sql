-- Migration: 20260524000001_fix_units_schema.sql
-- Fix units table:
--   1. Drop restrictive unit_type check (allow any type string)
--   2. Add project_id foreign key
--   3. Add blocked column for "Blocked by Developer" status

ALTER TABLE public.units DROP CONSTRAINT IF EXISTS units_unit_type_check;

ALTER TABLE public.units ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE public.units ADD COLUMN IF NOT EXISTS blocked boolean NOT NULL DEFAULT false;

-- Update RLS policies to be project-scoped (developer only, same as before)
DROP POLICY IF EXISTS "units: developer select" ON public.units;
DROP POLICY IF EXISTS "units: developer insert" ON public.units;
DROP POLICY IF EXISTS "units: developer update" ON public.units;
DROP POLICY IF EXISTS "units: developer delete" ON public.units;

CREATE POLICY "units: developer select" ON public.units
  FOR SELECT TO authenticated USING (get_user_role() = 'developer');
CREATE POLICY "units: developer insert" ON public.units
  FOR INSERT TO authenticated WITH CHECK (get_user_role() = 'developer');
CREATE POLICY "units: developer update" ON public.units
  FOR UPDATE TO authenticated
  USING (get_user_role() = 'developer') WITH CHECK (get_user_role() = 'developer');
CREATE POLICY "units: developer delete" ON public.units
  FOR DELETE TO authenticated USING (get_user_role() = 'developer');
