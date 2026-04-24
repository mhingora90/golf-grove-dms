-- ─── GOLF GROVE DMS — Row Level Security Policies ────────────────
-- Run this script in the Supabase SQL Editor after confirming table
-- structures match the schema below.
--
-- Roles: developer, consultant, contractor, subcontractor
-- All roles are stored in public.profiles.role
-- Policies use auth.uid() to match profiles.id
--
-- WARNING: Enabling RLS blocks ALL access until policies are created.
-- Run this entire script in one transaction.

BEGIN;

-- ─── ENABLE RLS ON ALL TABLES ────────────────────────────────────
ALTER TABLE public.drawings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drawing_revisions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submittals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submittal_register   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspections          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncrs                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfis                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transmittals         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.correspondence       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.punch_list           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.method_statements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontractors       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_audit_log   ENABLE ROW LEVEL SECURITY;

-- ─── HELPER FUNCTION: get current user's role ────────────────────
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- ─── HELPER FUNCTION: is developer ───────────────────────────────
CREATE OR REPLACE FUNCTION public.is_developer()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT get_user_role() = 'developer';
$$;

-- ─── HELPER FUNCTION: is consultant ──────────────────────────────
CREATE OR REPLACE FUNCTION public.is_consultant()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT get_user_role() IN ('consultant', 'developer');
$$;

-- ─── HELPER FUNCTION: is contractor ──────────────────────────────
CREATE OR REPLACE FUNCTION public.is_contractor()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT get_user_role() IN ('contractor', 'developer');
$$;

-- ─── PROFILES TABLE ──────────────────────────────────────────────
-- Everyone can read profiles (needed for showing user info)
CREATE POLICY "profiles_read_all" ON public.profiles
  FOR SELECT USING (true);

-- Only the user can update their own profile
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Only developers can insert profiles (new user registration)
CREATE POLICY "profiles_insert_developer" ON public.profiles
  FOR INSERT WITH CHECK (public.is_developer());

-- ─── DOCUMENT_AUDIT_LOG TABLE ────────────────────────────────────
-- Everyone can read the audit log
CREATE POLICY "audit_log_read_all" ON public.document_audit_log
  FOR SELECT USING (true);

-- Nobody can manually insert/update/delete audit log entries
-- (Only Supabase Edge Functions or app backend should write)
-- App inserts are allowed via service role key; this blocks end-users
-- If the app uses the anon key for inserts, allow self-insert:
CREATE POLICY "audit_log_insert_app" ON public.document_audit_log
  FOR INSERT WITH CHECK (true);

-- ─── DRAWINGS TABLE ──────────────────────────────────────────────
-- Everyone can read drawings
CREATE POLICY "drawings_read_all" ON public.drawings
  FOR SELECT USING (true);

-- Developer: full access (insert, update, delete)
CREATE POLICY "drawings_full_developer" ON public.drawings
  FOR ALL USING (public.is_developer());

-- Consultant: can update (approve, review) but not delete
CREATE POLICY "drawings_update_consultant" ON public.drawings
  FOR UPDATE USING (public.is_consultant());

-- Contractor: can insert and update own drawings
CREATE POLICY "drawings_insert_contractor" ON public.drawings
  FOR INSERT WITH CHECK (public.is_contractor());

CREATE POLICY "drawings_update_contractor" ON public.drawings
  FOR UPDATE USING (
    public.is_contractor()
    AND uploaded_by = auth.uid()::text
  );

-- Subcontractor: can insert and update own drawings
CREATE POLICY "drawings_insert_subcontractor" ON public.drawings
  FOR INSERT WITH CHECK (public.get_user_role() = 'subcontractor');

CREATE POLICY "drawings_update_subcontractor" ON public.drawings
  FOR UPDATE USING (
    public.get_user_role() = 'subcontractor'
    AND uploaded_by = auth.uid()::text
  );

-- ─── DRAWING_REVISIONS TABLE ─────────────────────────────────────
-- Everyone can read
CREATE POLICY "drawing_revisions_read_all" ON public.drawing_revisions
  FOR SELECT USING (true);

-- Developer: full access
CREATE POLICY "drawing_revisions_full_developer" ON public.drawing_revisions
  FOR ALL USING (public.is_developer());

-- Consultant: can insert/update (approve revisions)
CREATE POLICY "drawing_revisions_insert_consultant" ON public.drawing_revisions
  FOR INSERT WITH CHECK (public.is_consultant());

CREATE POLICY "drawing_revisions_update_consultant" ON public.drawing_revisions
  FOR UPDATE USING (public.is_consultant());

-- Contractor: can insert own revisions, not delete
CREATE POLICY "drawing_revisions_insert_contractor" ON public.drawing_revisions
  FOR INSERT WITH CHECK (
    public.is_contractor()
    AND uploaded_by_id = auth.uid()
  );

CREATE POLICY "drawing_revisions_update_contractor" ON public.drawing_revisions
  FOR UPDATE USING (
    public.is_contractor()
    AND uploaded_by_id = auth.uid()
  );

-- ─── SUBMITTALS TABLE ────────────────────────────────────────────
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
  FOR UPDATE USING (
    public.get_user_role() = 'subcontractor'
    AND from_party = auth.uid()::text
  );

-- ─── SUBMITTAL_REGISTER TABLE ────────────────────────────────────
CREATE POLICY "submittal_register_read_all" ON public.submittal_register
  FOR SELECT USING (true);

CREATE POLICY "submittal_register_full_developer" ON public.submittal_register
  FOR ALL USING (public.is_developer());

-- Consultant can manage register
CREATE POLICY "submittal_register_consultant" ON public.submittal_register
  FOR ALL USING (
    public.is_consultant()
    AND NOT public.is_developer()
  );

-- ─── INSPECTIONS TABLE ───────────────────────────────────────────
CREATE POLICY "inspections_read_all" ON public.inspections
  FOR SELECT USING (true);

CREATE POLICY "inspections_full_developer" ON public.inspections
  FOR ALL USING (public.is_developer());

-- Consultant: respond, update checklists
CREATE POLICY "inspections_update_consultant" ON public.inspections
  FOR UPDATE USING (public.is_consultant());

-- Contractor: can insert and update own inspections
CREATE POLICY "inspections_insert_contractor" ON public.inspections
  FOR INSERT WITH CHECK (public.is_contractor());

CREATE POLICY "inspections_update_contractor" ON public.inspections
  FOR UPDATE USING (public.is_contractor());

-- ─── NCRS TABLE ──────────────────────────────────────────────────
CREATE POLICY "ncrs_read_all" ON public.ncrs
  FOR SELECT USING (true);

CREATE POLICY "ncrs_full_developer" ON public.ncrs
  FOR ALL USING (public.is_developer());

-- Consultant: can insert, update (verify CAP, close)
CREATE POLICY "ncrs_insert_consultant" ON public.ncrs
  FOR INSERT WITH CHECK (public.is_consultant());

CREATE POLICY "ncrs_update_consultant" ON public.ncrs
  FOR UPDATE USING (public.is_consultant());

-- Contractor: can submit CAP on open NCRs
CREATE POLICY "ncrs_update_contractor" ON public.ncrs
  FOR UPDATE USING (public.is_contractor());

-- ─── RFIS TABLE ──────────────────────────────────────────────────
CREATE POLICY "rfis_read_all" ON public.rfis
  FOR SELECT USING (true);

CREATE POLICY "rfis_full_developer" ON public.rfis
  FOR ALL USING (public.is_developer());

-- Consultant: can respond
CREATE POLICY "rfis_update_consultant" ON public.rfis
  FOR UPDATE USING (public.is_consultant());

-- Contractor/Developer: can insert and update
CREATE POLICY "rfis_insert_contractor" ON public.rfis
  FOR INSERT WITH CHECK (public.is_contractor());

CREATE POLICY "rfis_update_contractor" ON public.rfis
  FOR UPDATE USING (public.is_contractor());

-- ─── TRANSMITTALS TABLE ──────────────────────────────────────────
CREATE POLICY "transmittals_read_all" ON public.transmittals
  FOR SELECT USING (true);

CREATE POLICY "transmittals_full_developer" ON public.transmittals
  FOR ALL USING (public.is_developer());

-- Consultant/Contractor: can insert, update (acknowledge)
CREATE POLICY "transmittals_insert_consultant" ON public.transmittals
  FOR INSERT WITH CHECK (public.is_consultant());

CREATE POLICY "transmittals_update_consultant" ON public.transmittals
  FOR UPDATE USING (public.is_consultant());

CREATE POLICY "transmittals_insert_contractor" ON public.transmittals
  FOR INSERT WITH CHECK (public.is_contractor());

CREATE POLICY "transmittals_update_contractor" ON public.transmittals
  FOR UPDATE USING (public.is_contractor());

-- ─── CORRESPONDENCE TABLE ────────────────────────────────────────
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
CREATE POLICY "subcontractors_read_all" ON public.subcontractors
  FOR SELECT USING (true);

CREATE POLICY "subcontractors_full_developer" ON public.subcontractors
  FOR ALL USING (public.is_developer());

-- Contractor can manage subcontractors
CREATE POLICY "subcontractors_insert_contractor" ON public.subcontractors
  FOR INSERT WITH CHECK (public.is_contractor());

CREATE POLICY "subcontractors_update_contractor" ON public.subcontractors
  FOR UPDATE USING (public.is_contractor());

CREATE POLICY "subcontractors_delete_contractor" ON public.subcontractors
  FOR DELETE USING (public.is_contractor());

-- ─── COMMENTS TABLE ──────────────────────────────────────────────
CREATE POLICY "comments_read_all" ON public.comments
  FOR SELECT USING (true);

-- Anyone can insert comments
CREATE POLICY "comments_insert_all" ON public.comments
  FOR INSERT WITH CHECK (true);

-- Only the author can update/delete their own comments
CREATE POLICY "comments_update_own" ON public.comments
  FOR UPDATE USING (auth.uid()::text = author_role);

CREATE POLICY "comments_delete_own" ON public.comments
  FOR DELETE USING (auth.uid()::text = author_role);

-- ─── ATTACHMENTS TABLE ───────────────────────────────────────────
CREATE POLICY "attachments_read_all" ON public.attachments
  FOR SELECT USING (true);

-- Anyone can insert attachments
CREATE POLICY "attachments_insert_all" ON public.attachments
  FOR INSERT WITH CHECK (true);

-- Only the uploader can delete their own attachments
CREATE POLICY "attachments_delete_own" ON public.attachments
  FOR DELETE USING (auth.uid() = uploaded_by_id);

-- ─── STORAGE BUCKET POLICIES ─────────────────────────────────────
-- These go in the Storage section of the Supabase dashboard, not SQL:
--
-- drawings bucket:
--   SELECT: Public (anyone can download)
--   INSERT: Authenticated users only
--   UPDATE: Authenticated users only
--   DELETE: Authenticated users only
--
-- attachments bucket:
--   SELECT: Public
--   INSERT: Authenticated users only
--   UPDATE: Authenticated users only
--   DELETE: Authenticated users only

COMMIT;
