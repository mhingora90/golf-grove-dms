-- ================================================================
-- Migration: 20260417000002_rls_document_audit_log.sql
-- RLS policies for document_audit_log.
-- Depends on: get_user_role() from 20260417000000_rls_policies.sql
-- ================================================================

alter table public.document_audit_log enable row level security;

-- TEST: developer and consultant need oversight of all audit activity;
--       contractor/subcontractor have no business reading the raw log
create policy "document_audit_log: manage roles read"
  on public.document_audit_log for select to authenticated
  using (get_user_role() in ('developer', 'consultant'));

-- TEST: every authenticated user writes entries — the app logs all
--       tracked actions (uploads, approvals, status changes, etc.)
create policy "document_audit_log: all authenticated insert"
  on public.document_audit_log for insert to authenticated
  with check (true);

-- TEST: audit log is immutable — no UPDATE or DELETE policies
-- (no UPDATE policy → deny all updates)
-- (no DELETE policy  → deny all deletes)
