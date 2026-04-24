-- ─── GOLF GROVE DMS — Row Level Security Policies ────────────────
-- Run this script in the Supabase SQL Editor.
-- Safe to run multiple times — uses DROP IF EXISTS for idempotency.
--
-- Roles: developer, consultant, contractor, subcontractor
-- WARNING: Disables RLS first, then re-enables with new policies.

BEGIN;

-- ─── DISABLE RLS FIRST (clears all existing policies) ───────────
ALTER TABLE public.drawings             DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.drawing_revisions    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.submittals           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.submittal_register   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspections          DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncrs                 DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfis                 DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.transmittals         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.correspondence       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.punch_list           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.method_statements    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontractors       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles             DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments             DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments          DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_audit_log   DISABLE ROW LEVEL SECURITY;

-- ─── DROP EXISTING HELPER FUNCTIONS ──────────────────────────────
DROP FUNCTION IF EXISTS public.get_user_role() CASCADE;
DROP FUNCTION IF EXISTS public.is_developer() CASCADE;
DROP FUNCTION IF EXISTS public.is_consultant() CASCADE;
DROP FUNCTION IF EXISTS public.is_contractor() CASCADE;

-- ─── HELPER FUNCTION: get current user's role ────────────────────
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_developer()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT get_user_role() = 'developer';
$$;

CREATE OR REPLACE FUNCTION public.is_consultant()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT get_user_role() IN ('consultant', 'developer');
$$;

CREATE OR REPLACE FUNCTION public.is_contractor()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT get_user_role() IN ('contractor', 'developer');
$$;

-- ─── PROFILES TABLE ──────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_read_all" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "profiles_insert_developer" ON public.profiles
  FOR INSERT WITH CHECK (public.is_developer());

-- ─── DOCUMENT_AUDIT_LOG TABLE ────────────────────────────────────
ALTER TABLE public.document_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_read_all" ON public.document_audit_log
  FOR SELECT USING (true);

CREATE POLICY "audit_log_insert_app" ON public.document_audit_log
  FOR INSERT WITH CHECK (true);

-- ─── DRAWINGS TABLE ──────────────────────────────────────────────
ALTER TABLE public.drawings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drawings_read_all" ON public.drawings
  FOR SELECT USING (true);

CREATE POLICY "drawings_full_developer" ON public.drawings
  FOR ALL USING (public.is_developer());

CREATE POLICY "drawings_update_consultant" ON public.drawings
  FOR UPDATE USING (public.is_consultant());

CREATE POLICY "drawings_insert_contractor" ON public.drawings
  FOR INSERT WITH CHECK (public.is_contractor());

CREATE POLICY "drawings_update_contractor" ON public.drawings
  FOR UPDATE USING (public.is_contractor() AND uploaded_by = auth.uid()::text);

CREATE POLICY "drawings_insert_subcontractor" ON public.drawings
  FOR INSERT WITH CHECK (public.get_user_role() = 'subcontractor');

CREATE POLICY "drawings_update_subcontractor" ON public.drawings
  FOR UPDATE USING (public.get_user_role() = 'subcontractor' AND uploaded_by = auth.uid()::text);

-- ─── DRAWING_REVISIONS TABLE ─────────────────────────────────────
ALTER TABLE public.drawing_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drawing_revisions_read_all" ON public.drawing_revisions
  FOR SELECT USING (true);

CREATE POLICY "drawing_revisions_full_developer" ON public.drawing_revisions
  FOR ALL USING (public.is_developer());

CREATE POLICY "drawing_revisions_insert_consultant" ON public.drawing_revisions
  FOR INSERT WITH CHECK (public.is_consultant());

CREATE POLICY "drawing_revisions_update_consultant" ON public.drawing_revisions
  FOR UPDATE USING (public.is_consultant());

CREATE POLICY "drawing_revisions_insert_contractor" ON public.drawing_revisions
  FOR INSERT WITH CHECK (public.is_contractor() AND uploaded_by_id = auth.uid());

CREATE POLICY "drawing_revisions_update_contractor" ON public.drawing_revisions
  FOR UPDATE USING (public.is_contractor() AND uploaded_by_id = auth.uid());

-- ─── SUBMITTALS TABLE ────────────────────────────────────────────
ALTER TABLE public.submittals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "submittals_read_all" ON public.submittals
  FOR SELECT USING (true);

CREATE POLICY "submittals_full_developer" ON public.submittals
  FOR ALL USING (public.is_developer());

CREATE POLICY "submittals_insert_contractor" ON public.submittals
  FOR INSERT WITH CHECK (public.is_contractor());

CREATE POLICY "submittals_update_contractor" ON public.submittals
  FOR UPDATE USING (public.is_contractor());

CREATE POLICY "submittals_update_consultant" ON public.submittals
  FOR UPDATE USING (public.is_consultant());

CREATE POLICY "submittals_insert_subcontractor" ON public.submittals
  FOR INSERT WITH CHECK (public.get_user_role() = 'subcontractor');

CREATE POLICY "submittals_update_subcontractor" ON public.submittals
  FOR UPDATE USING (public.get_user_role() = 'subcontractor');

-- ─── SUBMITTAL_REGISTER TABLE ────────────────────────────────────
ALTER TABLE public.submittal_register ENABLE ROW LEVEL SECURITY;

CREATE POLICY "submittal_register_read_all" ON public.submittal_register
  FOR SELECT USING (true);

CREATE POLICY "submittal_register_full_developer" ON public.submittal_register
  FOR ALL USING (public.is_developer());

CREATE POLICY "submittal_register_consultant" ON public.submittal_register
  FOR ALL USING (public.is_consultant() AND NOT public.is_developer());

-- ─── INSPECTIONS TABLE ───────────────────────────────────────────
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inspections_read_all" ON public.inspections
  FOR SELECT USING (true);

CREATE POLICY "inspections_full_developer" ON public.inspections
  FOR ALL USING (public.is_developer());

CREATE POLICY "inspections_update_consultant" ON public.inspections
  FOR UPDATE USING (public.is_consultant());

CREATE POLICY "inspections_insert_contractor" ON public.inspections
  FOR INSERT WITH CHECK (public.is_contractor());

CREATE POLICY "inspections_update_contractor" ON public.inspections
  FOR UPDATE USING (public.is_contractor());

-- ─── NCRS TABLE ──────────────────────────────────────────────────
ALTER TABLE public.ncrs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ncrs_read_all" ON public.ncrs
  FOR SELECT USING (true);

CREATE POLICY "ncrs_full_developer" ON public.ncrs
  FOR ALL USING (public.is_developer());

CREATE POLICY "ncrs_insert_consultant" ON public.ncrs
  FOR INSERT WITH CHECK (public.is_consultant());

CREATE POLICY "ncrs_update_consultant" ON public.ncrs
  FOR UPDATE USING (public.is_consultant());

CREATE POLICY "ncrs_update_contractor" ON public.ncrs
  FOR UPDATE USING (public.is_contractor());

-- ─── RFIS TABLE ──────────────────────────────────────────────────
ALTER TABLE public.rfis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rfis_read_all" ON public.rfis
  FOR SELECT USING (true);

CREATE POLICY "rfis_full_developer" ON public.rfis
  FOR ALL USING (public.is_developer());

CREATE POLICY "rfis_update_consultant" ON public.rfis
  FOR UPDATE USING (public.is_consultant());

CREATE POLICY "rfis_insert_contractor" ON public.rfis
  FOR INSERT WITH CHECK (public.is_contractor());

CREATE POLICY "rfis_update_contractor" ON public.rfis
  FOR UPDATE USING (public.is_contractor());

-- ─── TRANSMITTALS TABLE ──────────────────────────────────────────
ALTER TABLE public.transmittals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transmittals_read_all" ON public.transmittals
  FOR SELECT USING (true);

CREATE POLICY "transmittals_full_developer" ON public.transmittals
  FOR ALL USING (public.is_developer());

CREATE POLICY "transmittals_insert_consultant" ON public.transmittals
  FOR INSERT WITH CHECK (public.is_consultant());

CREATE POLICY "transmittals_update_consultant" ON public.transmittals
  FOR UPDATE USING (public.is_consultant());

CREATE POLICY "transmittals_insert_contractor" ON public.transmittals
  FOR INSERT WITH CHECK (public.is_contractor());

CREATE POLICY "transmittals_update_contractor" ON public.transmittals
  FOR UPDATE USING (public.is_contractor());

-- ─── CORRESPONDENCE TABLE ────────────────────────────────────────
ALTER TABLE public.correspondence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "correspondence_read_all" ON public.correspondence
  FOR SELECT USING (true);

CREATE POLICY "correspondence_full_developer" ON public.correspondence
  FOR ALL USING (public.is_developer());

CREATE POLICY "correspondence_insert_consultant" ON public.correspondence
  FOR INSERT WITH CHECK (public.is_consultant());

CREATE POLICY "correspondence_update_consultant" ON public.correspondence
  FOR UPDATE USING (public.is_consultant());

CREATE POLICY "correspondence_insert_contractor" ON public.correspondence
  FOR INSERT WITH CHECK (public.is_contractor());

CREATE POLICY "correspondence_update_contractor" ON public.correspondence
  FOR UPDATE USING (public.is_contractor());

-- ─── PUNCH_LIST TABLE ────────────────────────────────────────────
ALTER TABLE public.punch_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "punch_list_read_all" ON public.punch_list
  FOR SELECT USING (true);

CREATE POLICY "punch_list_full_developer" ON public.punch_list
  FOR ALL USING (public.is_developer());

CREATE POLICY "punch_list_insert_consultant" ON public.punch_list
  FOR INSERT WITH CHECK (public.is_consultant());

CREATE POLICY "punch_list_update_consultant" ON public.punch_list
  FOR UPDATE USING (public.is_consultant());

CREATE POLICY "punch_list_insert_contractor" ON public.punch_list
  FOR INSERT WITH CHECK (public.is_contractor());

CREATE POLICY "punch_list_update_contractor" ON public.punch_list
  FOR UPDATE USING (public.is_contractor());

-- ─── METHOD_STATEMENTS TABLE ─────────────────────────────────────
ALTER TABLE public.method_statements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "method_statements_read_all" ON public.method_statements
  FOR SELECT USING (true);

CREATE POLICY "method_statements_full_developer" ON public.method_statements
  FOR ALL USING (public.is_developer());

CREATE POLICY "method_statements_insert_consultant" ON public.method_statements
  FOR INSERT WITH CHECK (public.is_consultant());

CREATE POLICY "method_statements_update_consultant" ON public.method_statements
  FOR UPDATE USING (public.is_consultant());

CREATE POLICY "method_statements_insert_contractor" ON public.method_statements
  FOR INSERT WITH CHECK (public.is_contractor());

CREATE POLICY "method_statements_update_contractor" ON public.method_statements
  FOR UPDATE USING (public.is_contractor());

CREATE POLICY "method_statements_insert_subcontractor" ON public.method_statements
  FOR INSERT WITH CHECK (public.get_user_role() = 'subcontractor');

CREATE POLICY "method_statements_update_subcontractor" ON public.method_statements
  FOR UPDATE USING (public.get_user_role() = 'subcontractor');

-- ─── SUBCONTRACTORS TABLE ────────────────────────────────────────
ALTER TABLE public.subcontractors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subcontractors_read_all" ON public.subcontractors
  FOR SELECT USING (true);

CREATE POLICY "subcontractors_full_developer" ON public.subcontractors
  FOR ALL USING (public.is_developer());

CREATE POLICY "subcontractors_insert_contractor" ON public.subcontractors
  FOR INSERT WITH CHECK (public.is_contractor());

CREATE POLICY "subcontractors_update_contractor" ON public.subcontractors
  FOR UPDATE USING (public.is_contractor());

CREATE POLICY "subcontractors_delete_contractor" ON public.subcontractors
  FOR DELETE USING (public.is_contractor());

-- ─── COMMENTS TABLE ──────────────────────────────────────────────
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comments_read_all" ON public.comments
  FOR SELECT USING (true);

CREATE POLICY "comments_insert_all" ON public.comments
  FOR INSERT WITH CHECK (true);

CREATE POLICY "comments_delete_own" ON public.comments
  FOR DELETE USING (auth.uid() = uploaded_by_id);

-- ─── ATTACHMENTS TABLE ───────────────────────────────────────────
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attachments_read_all" ON public.attachments
  FOR SELECT USING (true);

CREATE POLICY "attachments_insert_all" ON public.attachments
  FOR INSERT WITH CHECK (true);

CREATE POLICY "attachments_delete_own" ON public.attachments
  FOR DELETE USING (auth.uid() = uploaded_by_id);

COMMIT;
