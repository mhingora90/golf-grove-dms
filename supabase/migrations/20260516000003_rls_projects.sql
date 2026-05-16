-- ================================================================
-- Migration: 20260516000003_rls_projects.sql
-- RLS for projects + project_users tables.
-- Extend module table SELECT policies to scope by project_id.
-- ================================================================

-- ----------------------------------------------------------------
-- STEP 1: Helper function — returns all project IDs the current
--         user belongs to (SECURITY DEFINER bypasses RLS on
--         project_users to avoid infinite recursion).
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION user_project_ids()
RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT project_id FROM project_users WHERE user_id = auth.uid();
$$;

-- ----------------------------------------------------------------
-- STEP 2: Enable RLS on new tables
-- ----------------------------------------------------------------
ALTER TABLE projects      ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_users ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------
-- STEP 3: Policies on projects
-- ----------------------------------------------------------------

-- SELECT: developer sees all; others see only their assigned projects
CREATE POLICY "projects_select" ON projects FOR SELECT USING (
  is_developer() OR id IN (SELECT user_project_ids())
);

-- INSERT/UPDATE/DELETE: developer only
CREATE POLICY "projects_insert" ON projects FOR INSERT WITH CHECK (is_developer());
CREATE POLICY "projects_update" ON projects FOR UPDATE USING (is_developer());
CREATE POLICY "projects_delete" ON projects FOR DELETE USING (is_developer());

-- ----------------------------------------------------------------
-- STEP 4: Policies on project_users
-- ----------------------------------------------------------------

-- SELECT: developer sees all; others see own rows only
CREATE POLICY "project_users_select" ON project_users FOR SELECT USING (
  is_developer() OR user_id = auth.uid()
);

-- INSERT/DELETE: developer only
CREATE POLICY "project_users_insert" ON project_users FOR INSERT WITH CHECK (is_developer());
CREATE POLICY "project_users_delete" ON project_users FOR DELETE USING (is_developer());

-- ----------------------------------------------------------------
-- STEP 5: Extend module table SELECT policies to scope by project
--
-- Pattern: DROP the old SELECT policy, CREATE a new one that adds
-- the project_id filter. Developer bypasses; others must be in the
-- project.
-- ----------------------------------------------------------------

-- ---- drawings ----
DROP POLICY IF EXISTS "drawings: authenticated read all" ON public.drawings;
CREATE POLICY "drawings: authenticated read all"
  ON public.drawings FOR SELECT TO authenticated
  USING (
    is_developer() OR (
      auth.uid() IS NOT NULL AND
      project_id IN (SELECT user_project_ids())
    )
  );

-- ---- submittals ----
DROP POLICY IF EXISTS "submittals: authenticated read all" ON public.submittals;
CREATE POLICY "submittals: authenticated read all"
  ON public.submittals FOR SELECT TO authenticated
  USING (
    is_developer() OR (
      auth.uid() IS NOT NULL AND
      project_id IN (SELECT user_project_ids())
    )
  );

-- ---- submittal_register ----
DROP POLICY IF EXISTS "submittal_register: authenticated read all" ON public.submittal_register;
CREATE POLICY "submittal_register: authenticated read all"
  ON public.submittal_register FOR SELECT TO authenticated
  USING (
    is_developer() OR (
      auth.uid() IS NOT NULL AND
      project_id IN (SELECT user_project_ids())
    )
  );

-- ---- inspections ----
DROP POLICY IF EXISTS "inspections: authenticated read all" ON public.inspections;
CREATE POLICY "inspections: authenticated read all"
  ON public.inspections FOR SELECT TO authenticated
  USING (
    is_developer() OR (
      auth.uid() IS NOT NULL AND
      project_id IN (SELECT user_project_ids())
    )
  );

-- ---- ncrs ----
DROP POLICY IF EXISTS "ncrs: authenticated read all" ON public.ncrs;
CREATE POLICY "ncrs: authenticated read all"
  ON public.ncrs FOR SELECT TO authenticated
  USING (
    is_developer() OR (
      auth.uid() IS NOT NULL AND
      project_id IN (SELECT user_project_ids())
    )
  );

-- ---- rfis ----
DROP POLICY IF EXISTS "rfis: authenticated read all" ON public.rfis;
CREATE POLICY "rfis: authenticated read all"
  ON public.rfis FOR SELECT TO authenticated
  USING (
    is_developer() OR (
      auth.uid() IS NOT NULL AND
      project_id IN (SELECT user_project_ids())
    )
  );

-- ---- transmittals ----
DROP POLICY IF EXISTS "transmittals: authenticated read all" ON public.transmittals;
CREATE POLICY "transmittals: authenticated read all"
  ON public.transmittals FOR SELECT TO authenticated
  USING (
    is_developer() OR (
      auth.uid() IS NOT NULL AND
      project_id IN (SELECT user_project_ids())
    )
  );

-- ---- correspondence ----
DROP POLICY IF EXISTS "correspondence: authenticated read all" ON public.correspondence;
CREATE POLICY "correspondence: authenticated read all"
  ON public.correspondence FOR SELECT TO authenticated
  USING (
    is_developer() OR (
      auth.uid() IS NOT NULL AND
      project_id IN (SELECT user_project_ids())
    )
  );

-- ---- punch_list ----
DROP POLICY IF EXISTS "punch_list: authenticated read all" ON public.punch_list;
CREATE POLICY "punch_list: authenticated read all"
  ON public.punch_list FOR SELECT TO authenticated
  USING (
    is_developer() OR (
      auth.uid() IS NOT NULL AND
      project_id IN (SELECT user_project_ids())
    )
  );

-- ---- method_statements ----
DROP POLICY IF EXISTS "method_statements: authenticated read all" ON public.method_statements;
CREATE POLICY "method_statements: authenticated read all"
  ON public.method_statements FOR SELECT TO authenticated
  USING (
    is_developer() OR (
      auth.uid() IS NOT NULL AND
      project_id IN (SELECT user_project_ids())
    )
  );

-- ---- subcontractors ----
DROP POLICY IF EXISTS "subcontractors: authenticated read all" ON public.subcontractors;
CREATE POLICY "subcontractors: authenticated read all"
  ON public.subcontractors FOR SELECT TO authenticated
  USING (
    is_developer() OR (
      auth.uid() IS NOT NULL AND
      project_id IN (SELECT user_project_ids())
    )
  );

-- ---- boq_bills ----
DROP POLICY IF EXISTS "boq_bills_select" ON public.boq_bills;
CREATE POLICY "boq_bills_select"
  ON public.boq_bills FOR SELECT TO authenticated
  USING (
    is_developer() OR (
      auth.uid() IS NOT NULL AND
      project_id IN (SELECT user_project_ids())
    )
  );

-- ---- payment_certificates ----
DROP POLICY IF EXISTS "payment_certs_select" ON public.payment_certificates;
CREATE POLICY "payment_certs_select"
  ON public.payment_certificates FOR SELECT TO authenticated
  USING (
    is_developer() OR (
      auth.uid() IS NOT NULL AND
      project_id IN (SELECT user_project_ids())
    )
  );

-- ---- crm_leads (existing policy uses has_crm_access()) ----
DROP POLICY IF EXISTS "crm_leads_read" ON public.crm_leads;
CREATE POLICY "crm_leads_read"
  ON public.crm_leads FOR SELECT
  USING (
    is_developer() OR (
      has_crm_access() AND
      project_id IN (SELECT user_project_ids())
    )
  );

-- ---- units (existing policy gated to developer only; keep restriction) ----
DROP POLICY IF EXISTS "units: developer select" ON public.units;
CREATE POLICY "units: developer select"
  ON public.units FOR SELECT TO authenticated
  USING (
    is_developer() AND
    project_id IN (SELECT user_project_ids())
  );
