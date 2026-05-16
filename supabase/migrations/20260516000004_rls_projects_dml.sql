-- ================================================================
-- Migration: 20260516000004_rls_projects_dml.sql
-- Fixes:
--   1. units SELECT policy: AND → OR so developers bypass project check
--   2. Index on project_users(user_id) for performance
--   3. Scope INSERT/UPDATE/DELETE on all 15 module tables by project_id
-- ================================================================

-- ----------------------------------------------------------------
-- PART 1: Fix units SELECT policy (AND → OR)
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "units: developer select" ON public.units;
CREATE POLICY "units_select" ON public.units FOR SELECT USING (
  is_developer() OR (auth.uid() IS NOT NULL AND project_id IN (SELECT user_project_ids()))
);

-- ----------------------------------------------------------------
-- PART 2: Index on project_users(user_id)
-- ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_project_users_user_id ON project_users(user_id);

-- ================================================================
-- PART 3: Scope DML policies by project_id on all 15 module tables
-- Pattern:
--   INSERT: WITH CHECK (is_developer() OR (existing_role_check AND project_id IN (...)))
--   UPDATE: USING (is_developer() OR (existing_role_check AND project_id IN (...)))
--   DELETE: USING (is_developer() OR (existing_role_check AND project_id IN (...)))
-- ================================================================

-- ----------------------------------------------------------------
-- drawings
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "drawings: upload roles insert" ON public.drawings;
CREATE POLICY "drawings: upload roles insert" ON public.drawings
  FOR INSERT TO authenticated
  WITH CHECK (
    is_developer() OR (
      get_user_role() IN ('developer', 'consultant', 'contractor')
      AND project_id IN (SELECT user_project_ids())
    )
  );

DROP POLICY IF EXISTS "drawings: approve roles update" ON public.drawings;
CREATE POLICY "drawings: approve roles update" ON public.drawings
  FOR UPDATE TO authenticated
  USING (
    is_developer() OR (
      get_user_role() IN ('developer', 'consultant')
      AND project_id IN (SELECT user_project_ids())
    )
  )
  WITH CHECK (
    is_developer() OR (
      get_user_role() IN ('developer', 'consultant')
      AND project_id IN (SELECT user_project_ids())
    )
  );

DROP POLICY IF EXISTS "drawings: developer deletes" ON public.drawings;
CREATE POLICY "drawings: developer deletes" ON public.drawings
  FOR DELETE TO authenticated
  USING (is_developer() OR (get_user_role() = 'developer' AND project_id IN (SELECT user_project_ids())));

-- ----------------------------------------------------------------
-- submittals
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "submittals: all authenticated insert" ON public.submittals;
CREATE POLICY "submittals: all authenticated insert" ON public.submittals
  FOR INSERT TO authenticated
  WITH CHECK (
    is_developer() OR project_id IN (SELECT user_project_ids())
  );

DROP POLICY IF EXISTS "submittals: approve roles update" ON public.submittals;
CREATE POLICY "submittals: approve roles update" ON public.submittals
  FOR UPDATE TO authenticated
  USING (
    is_developer() OR (
      get_user_role() IN ('developer', 'consultant')
      AND project_id IN (SELECT user_project_ids())
    )
  )
  WITH CHECK (
    is_developer() OR (
      get_user_role() IN ('developer', 'consultant')
      AND project_id IN (SELECT user_project_ids())
    )
  );

DROP POLICY IF EXISTS "submittals: submitters edit pending" ON public.submittals;
CREATE POLICY "submittals: submitters edit pending" ON public.submittals
  FOR UPDATE TO authenticated
  USING (
    get_user_role() IN ('contractor', 'subcontractor')
    AND status = 'Pending Review'
    AND project_id IN (SELECT user_project_ids())
  )
  WITH CHECK (
    get_user_role() IN ('contractor', 'subcontractor')
    AND status = 'Pending Review'
    AND project_id IN (SELECT user_project_ids())
  );

DROP POLICY IF EXISTS "submittals: developer deletes" ON public.submittals;
CREATE POLICY "submittals: developer deletes" ON public.submittals
  FOR DELETE TO authenticated
  USING (is_developer() OR (get_user_role() = 'developer' AND project_id IN (SELECT user_project_ids())));

-- ----------------------------------------------------------------
-- submittal_register
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "submittal_register: manage roles insert" ON public.submittal_register;
CREATE POLICY "submittal_register: manage roles insert" ON public.submittal_register
  FOR INSERT TO authenticated
  WITH CHECK (
    is_developer() OR (
      get_user_role() IN ('developer', 'consultant')
      AND project_id IN (SELECT user_project_ids())
    )
  );

DROP POLICY IF EXISTS "submittal_register: manage roles update" ON public.submittal_register;
CREATE POLICY "submittal_register: manage roles update" ON public.submittal_register
  FOR UPDATE TO authenticated
  USING (
    is_developer() OR (
      get_user_role() IN ('developer', 'consultant')
      AND project_id IN (SELECT user_project_ids())
    )
  )
  WITH CHECK (
    is_developer() OR (
      get_user_role() IN ('developer', 'consultant')
      AND project_id IN (SELECT user_project_ids())
    )
  );

DROP POLICY IF EXISTS "submittal_register: developer deletes" ON public.submittal_register;
CREATE POLICY "submittal_register: developer deletes" ON public.submittal_register
  FOR DELETE TO authenticated
  USING (is_developer() OR (get_user_role() = 'developer' AND project_id IN (SELECT user_project_ids())));

-- ----------------------------------------------------------------
-- inspections
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "inspections: raise roles insert" ON public.inspections;
CREATE POLICY "inspections: raise roles insert" ON public.inspections
  FOR INSERT TO authenticated
  WITH CHECK (
    is_developer() OR (
      get_user_role() IN ('developer', 'consultant', 'contractor')
      AND project_id IN (SELECT user_project_ids())
    )
  );

DROP POLICY IF EXISTS "inspections: approve roles update" ON public.inspections;
CREATE POLICY "inspections: approve roles update" ON public.inspections
  FOR UPDATE TO authenticated
  USING (
    is_developer() OR (
      get_user_role() IN ('developer', 'consultant')
      AND project_id IN (SELECT user_project_ids())
    )
  )
  WITH CHECK (
    is_developer() OR (
      get_user_role() IN ('developer', 'consultant')
      AND project_id IN (SELECT user_project_ids())
    )
  );

DROP POLICY IF EXISTS "inspections: contractor edits pending" ON public.inspections;
CREATE POLICY "inspections: contractor edits pending" ON public.inspections
  FOR UPDATE TO authenticated
  USING (
    get_user_role() = 'contractor'
    AND status = 'Pending'
    AND project_id IN (SELECT user_project_ids())
  )
  WITH CHECK (
    get_user_role() = 'contractor'
    AND status = 'Pending'
    AND project_id IN (SELECT user_project_ids())
  );

DROP POLICY IF EXISTS "inspections: developer deletes" ON public.inspections;
CREATE POLICY "inspections: developer deletes" ON public.inspections
  FOR DELETE TO authenticated
  USING (is_developer() OR (get_user_role() = 'developer' AND project_id IN (SELECT user_project_ids())));

-- ----------------------------------------------------------------
-- ncrs
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "ncrs: raise roles insert" ON public.ncrs;
CREATE POLICY "ncrs: raise roles insert" ON public.ncrs
  FOR INSERT TO authenticated
  WITH CHECK (
    is_developer() OR (
      get_user_role() IN ('developer', 'consultant')
      AND project_id IN (SELECT user_project_ids())
    )
  );

DROP POLICY IF EXISTS "ncrs: raise roles update" ON public.ncrs;
CREATE POLICY "ncrs: raise roles update" ON public.ncrs
  FOR UPDATE TO authenticated
  USING (
    is_developer() OR (
      get_user_role() IN ('developer', 'consultant')
      AND project_id IN (SELECT user_project_ids())
    )
  )
  WITH CHECK (
    is_developer() OR (
      get_user_role() IN ('developer', 'consultant')
      AND project_id IN (SELECT user_project_ids())
    )
  );

DROP POLICY IF EXISTS "ncrs: contractor submits CAP" ON public.ncrs;
CREATE POLICY "ncrs: contractor submits CAP" ON public.ncrs
  FOR UPDATE TO authenticated
  USING (
    get_user_role() = 'contractor'
    AND status = 'Open'
    AND project_id IN (SELECT user_project_ids())
  )
  WITH CHECK (
    get_user_role() = 'contractor'
    AND status = 'CAP Submitted'
    AND project_id IN (SELECT user_project_ids())
  );

DROP POLICY IF EXISTS "ncrs: developer deletes" ON public.ncrs;
CREATE POLICY "ncrs: developer deletes" ON public.ncrs
  FOR DELETE TO authenticated
  USING (is_developer() OR (get_user_role() = 'developer' AND project_id IN (SELECT user_project_ids())));

-- ----------------------------------------------------------------
-- rfis
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "rfis: all authenticated insert" ON public.rfis;
CREATE POLICY "rfis: all authenticated insert" ON public.rfis
  FOR INSERT TO authenticated
  WITH CHECK (
    is_developer() OR project_id IN (SELECT user_project_ids())
  );

DROP POLICY IF EXISTS "rfis: approve roles update" ON public.rfis;
CREATE POLICY "rfis: approve roles update" ON public.rfis
  FOR UPDATE TO authenticated
  USING (
    is_developer() OR (
      get_user_role() IN ('developer', 'consultant')
      AND project_id IN (SELECT user_project_ids())
    )
  )
  WITH CHECK (
    is_developer() OR (
      get_user_role() IN ('developer', 'consultant')
      AND project_id IN (SELECT user_project_ids())
    )
  );

DROP POLICY IF EXISTS "rfis: submitters edit open rfis" ON public.rfis;
CREATE POLICY "rfis: submitters edit open rfis" ON public.rfis
  FOR UPDATE TO authenticated
  USING (
    get_user_role() IN ('contractor', 'subcontractor')
    AND status = 'Open'
    AND project_id IN (SELECT user_project_ids())
  )
  WITH CHECK (
    get_user_role() IN ('contractor', 'subcontractor')
    AND status = 'Open'
    AND project_id IN (SELECT user_project_ids())
  );

DROP POLICY IF EXISTS "rfis: developer deletes" ON public.rfis;
CREATE POLICY "rfis: developer deletes" ON public.rfis
  FOR DELETE TO authenticated
  USING (is_developer() OR (get_user_role() = 'developer' AND project_id IN (SELECT user_project_ids())));

-- ----------------------------------------------------------------
-- transmittals
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "transmittals: upload roles insert" ON public.transmittals;
CREATE POLICY "transmittals: upload roles insert" ON public.transmittals
  FOR INSERT TO authenticated
  WITH CHECK (
    is_developer() OR (
      get_user_role() IN ('developer', 'consultant', 'contractor')
      AND project_id IN (SELECT user_project_ids())
    )
  );

DROP POLICY IF EXISTS "transmittals: approve roles update" ON public.transmittals;
CREATE POLICY "transmittals: approve roles update" ON public.transmittals
  FOR UPDATE TO authenticated
  USING (
    is_developer() OR (
      get_user_role() IN ('developer', 'consultant')
      AND project_id IN (SELECT user_project_ids())
    )
  )
  WITH CHECK (
    is_developer() OR (
      get_user_role() IN ('developer', 'consultant')
      AND project_id IN (SELECT user_project_ids())
    )
  );

DROP POLICY IF EXISTS "transmittals: contractor acknowledges" ON public.transmittals;
CREATE POLICY "transmittals: contractor acknowledges" ON public.transmittals
  FOR UPDATE TO authenticated
  USING (
    get_user_role() = 'contractor'
    AND project_id IN (SELECT user_project_ids())
  )
  WITH CHECK (
    get_user_role() = 'contractor'
    AND project_id IN (SELECT user_project_ids())
  );

DROP POLICY IF EXISTS "transmittals: developer deletes" ON public.transmittals;
CREATE POLICY "transmittals: developer deletes" ON public.transmittals
  FOR DELETE TO authenticated
  USING (is_developer() OR (get_user_role() = 'developer' AND project_id IN (SELECT user_project_ids())));

-- ----------------------------------------------------------------
-- correspondence
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "correspondence: raise roles insert" ON public.correspondence;
CREATE POLICY "correspondence: raise roles insert" ON public.correspondence
  FOR INSERT TO authenticated
  WITH CHECK (
    is_developer() OR (
      get_user_role() IN ('developer', 'consultant')
      AND project_id IN (SELECT user_project_ids())
    )
  );

DROP POLICY IF EXISTS "correspondence: raise roles update" ON public.correspondence;
CREATE POLICY "correspondence: raise roles update" ON public.correspondence
  FOR UPDATE TO authenticated
  USING (
    is_developer() OR (
      get_user_role() IN ('developer', 'consultant')
      AND project_id IN (SELECT user_project_ids())
    )
  )
  WITH CHECK (
    is_developer() OR (
      get_user_role() IN ('developer', 'consultant')
      AND project_id IN (SELECT user_project_ids())
    )
  );

DROP POLICY IF EXISTS "correspondence: developer deletes" ON public.correspondence;
CREATE POLICY "correspondence: developer deletes" ON public.correspondence
  FOR DELETE TO authenticated
  USING (is_developer() OR (get_user_role() = 'developer' AND project_id IN (SELECT user_project_ids())));

-- ----------------------------------------------------------------
-- punch_list
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "punch_list: raise roles insert" ON public.punch_list;
CREATE POLICY "punch_list: raise roles insert" ON public.punch_list
  FOR INSERT TO authenticated
  WITH CHECK (
    is_developer() OR (
      get_user_role() IN ('developer', 'consultant')
      AND project_id IN (SELECT user_project_ids())
    )
  );

DROP POLICY IF EXISTS "punch_list: raise roles update" ON public.punch_list;
CREATE POLICY "punch_list: raise roles update" ON public.punch_list
  FOR UPDATE TO authenticated
  USING (
    is_developer() OR (
      get_user_role() IN ('developer', 'consultant')
      AND project_id IN (SELECT user_project_ids())
    )
  )
  WITH CHECK (
    is_developer() OR (
      get_user_role() IN ('developer', 'consultant')
      AND project_id IN (SELECT user_project_ids())
    )
  );

DROP POLICY IF EXISTS "punch_list: contractor responds" ON public.punch_list;
CREATE POLICY "punch_list: contractor responds" ON public.punch_list
  FOR UPDATE TO authenticated
  USING (
    get_user_role() = 'contractor'
    AND status IN ('Open', 'In Progress')
    AND project_id IN (SELECT user_project_ids())
  )
  WITH CHECK (
    get_user_role() = 'contractor'
    AND status IN ('Open', 'In Progress')
    AND project_id IN (SELECT user_project_ids())
  );

DROP POLICY IF EXISTS "punch_list: developer deletes" ON public.punch_list;
CREATE POLICY "punch_list: developer deletes" ON public.punch_list
  FOR DELETE TO authenticated
  USING (is_developer() OR (get_user_role() = 'developer' AND project_id IN (SELECT user_project_ids())));

-- ----------------------------------------------------------------
-- method_statements
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "method_statements: all authenticated insert" ON public.method_statements;
CREATE POLICY "method_statements: all authenticated insert" ON public.method_statements
  FOR INSERT TO authenticated
  WITH CHECK (
    is_developer() OR project_id IN (SELECT user_project_ids())
  );

DROP POLICY IF EXISTS "method_statements: approve roles update" ON public.method_statements;
CREATE POLICY "method_statements: approve roles update" ON public.method_statements
  FOR UPDATE TO authenticated
  USING (
    is_developer() OR (
      get_user_role() IN ('developer', 'consultant')
      AND project_id IN (SELECT user_project_ids())
    )
  )
  WITH CHECK (
    is_developer() OR (
      get_user_role() IN ('developer', 'consultant')
      AND project_id IN (SELECT user_project_ids())
    )
  );

DROP POLICY IF EXISTS "method_statements: submitters edit pending" ON public.method_statements;
CREATE POLICY "method_statements: submitters edit pending" ON public.method_statements
  FOR UPDATE TO authenticated
  USING (
    get_user_role() IN ('contractor', 'subcontractor')
    AND status = 'Pending Review'
    AND project_id IN (SELECT user_project_ids())
  )
  WITH CHECK (
    get_user_role() IN ('contractor', 'subcontractor')
    AND status = 'Pending Review'
    AND project_id IN (SELECT user_project_ids())
  );

DROP POLICY IF EXISTS "method_statements: developer deletes" ON public.method_statements;
CREATE POLICY "method_statements: developer deletes" ON public.method_statements
  FOR DELETE TO authenticated
  USING (is_developer() OR (get_user_role() = 'developer' AND project_id IN (SELECT user_project_ids())));

-- ----------------------------------------------------------------
-- subcontractors
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "subcontractors: manage roles insert" ON public.subcontractors;
CREATE POLICY "subcontractors: manage roles insert" ON public.subcontractors
  FOR INSERT TO authenticated
  WITH CHECK (
    is_developer() OR (
      get_user_role() IN ('developer', 'contractor')
      AND project_id IN (SELECT user_project_ids())
    )
  );

DROP POLICY IF EXISTS "subcontractors: manage roles update" ON public.subcontractors;
CREATE POLICY "subcontractors: manage roles update" ON public.subcontractors
  FOR UPDATE TO authenticated
  USING (
    is_developer() OR (
      get_user_role() IN ('developer', 'contractor')
      AND project_id IN (SELECT user_project_ids())
    )
  )
  WITH CHECK (
    is_developer() OR (
      get_user_role() IN ('developer', 'contractor')
      AND project_id IN (SELECT user_project_ids())
    )
  );

DROP POLICY IF EXISTS "subcontractors: developer deletes" ON public.subcontractors;
CREATE POLICY "subcontractors: developer deletes" ON public.subcontractors
  FOR DELETE TO authenticated
  USING (is_developer() OR (get_user_role() = 'developer' AND project_id IN (SELECT user_project_ids())));

-- ----------------------------------------------------------------
-- boq_bills
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "boq_bills_insert" ON public.boq_bills;
CREATE POLICY "boq_bills_insert" ON public.boq_bills
  FOR INSERT TO authenticated
  WITH CHECK (
    is_developer() OR (
      get_user_role() IN ('developer', 'consultant')
      AND project_id IN (SELECT user_project_ids())
    )
  );

DROP POLICY IF EXISTS "boq_bills_update" ON public.boq_bills;
CREATE POLICY "boq_bills_update" ON public.boq_bills
  FOR UPDATE TO authenticated
  USING (
    is_developer() OR (
      get_user_role() IN ('developer', 'consultant')
      AND project_id IN (SELECT user_project_ids())
    )
  );

DROP POLICY IF EXISTS "boq_bills_delete" ON public.boq_bills;
CREATE POLICY "boq_bills_delete" ON public.boq_bills
  FOR DELETE TO authenticated
  USING (
    is_developer() OR (
      get_user_role() IN ('developer', 'consultant')
      AND project_id IN (SELECT user_project_ids())
    )
  );

-- ----------------------------------------------------------------
-- payment_certificates
-- (Three split UPDATE policies; preserve status guards)
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "payment_certs_insert" ON public.payment_certificates;
CREATE POLICY "payment_certs_insert" ON public.payment_certificates
  FOR INSERT TO authenticated
  WITH CHECK (
    is_developer() OR (
      get_user_role() IN ('developer', 'contractor')
      AND project_id IN (SELECT user_project_ids())
    )
  );

DROP POLICY IF EXISTS "payment_certs_update_developer" ON public.payment_certificates;
CREATE POLICY "payment_certs_update_developer" ON public.payment_certificates
  FOR UPDATE TO authenticated
  USING    (is_developer() OR (get_user_role() = 'developer' AND project_id IN (SELECT user_project_ids())))
  WITH CHECK (is_developer() OR (get_user_role() = 'developer' AND project_id IN (SELECT user_project_ids())));

DROP POLICY IF EXISTS "payment_certs_update_contractor" ON public.payment_certificates;
CREATE POLICY "payment_certs_update_contractor" ON public.payment_certificates
  FOR UPDATE TO authenticated
  USING (
    get_user_role() = 'contractor'
    AND status IN ('Draft', 'Submitted')
    AND project_id IN (SELECT user_project_ids())
  )
  WITH CHECK (
    get_user_role() = 'contractor'
    AND status IN ('Draft', 'Submitted')
    AND project_id IN (SELECT user_project_ids())
  );

DROP POLICY IF EXISTS "payment_certs_update_consultant" ON public.payment_certificates;
CREATE POLICY "payment_certs_update_consultant" ON public.payment_certificates
  FOR UPDATE TO authenticated
  USING (
    get_user_role() = 'consultant'
    AND status IN ('Submitted', 'Under Review', 'Certified')
    AND project_id IN (SELECT user_project_ids())
  )
  WITH CHECK (
    get_user_role() = 'consultant'
    AND status IN ('Submitted', 'Under Review', 'Certified')
    AND project_id IN (SELECT user_project_ids())
  );

DROP POLICY IF EXISTS "payment_certs_delete" ON public.payment_certificates;
CREATE POLICY "payment_certs_delete" ON public.payment_certificates
  FOR DELETE TO authenticated
  USING (
    is_developer()
    OR (get_user_role() = 'developer' AND project_id IN (SELECT user_project_ids()))
    OR (get_user_role() = 'contractor' AND status = 'Draft' AND project_id IN (SELECT user_project_ids()))
  );

-- ----------------------------------------------------------------
-- crm_leads
-- (Preserve has_crm_access() checks; add project_id scope for non-devs)
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "crm_leads_insert" ON public.crm_leads;
CREATE POLICY "crm_leads_insert" ON public.crm_leads
  FOR INSERT
  WITH CHECK (
    is_developer() OR (
      has_crm_access()
      AND project_id IN (SELECT user_project_ids())
    )
  );

DROP POLICY IF EXISTS "crm_leads_update" ON public.crm_leads;
CREATE POLICY "crm_leads_update" ON public.crm_leads
  FOR UPDATE
  USING (
    is_developer() OR (
      has_crm_access()
      AND project_id IN (SELECT user_project_ids())
    )
  );

DROP POLICY IF EXISTS "crm_leads_delete" ON public.crm_leads;
CREATE POLICY "crm_leads_delete" ON public.crm_leads
  FOR DELETE
  USING (
    is_developer() OR (
      has_crm_access()
      AND project_id IN (SELECT user_project_ids())
    )
  );

-- ----------------------------------------------------------------
-- units
-- (Developer-only DML; add project_id scope for non-developer paths
--  even though current policies gate to developer only — future-proof)
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "units: developer insert" ON public.units;
CREATE POLICY "units: developer insert" ON public.units
  FOR INSERT TO authenticated
  WITH CHECK (is_developer());

DROP POLICY IF EXISTS "units: developer update" ON public.units;
CREATE POLICY "units: developer update" ON public.units
  FOR UPDATE TO authenticated
  USING (is_developer())
  WITH CHECK (is_developer());

DROP POLICY IF EXISTS "units: developer delete" ON public.units;
CREATE POLICY "units: developer delete" ON public.units
  FOR DELETE TO authenticated
  USING (is_developer());
