-- ================================================================
-- Migration: 20260417000001_create_document_audit_log.sql
-- Creates the audit log table for all tracked document actions.
-- performed_by_id references auth.users (no cascade — log is
-- retained even if the user account is later deleted).
-- ================================================================

create table public.document_audit_log (
  id               uuid primary key default gen_random_uuid(),
  document_id      uuid        not null,
  document_type    text        not null,
  action           text        not null,
  performed_by_name text       not null,
  performed_by_id  uuid        not null references auth.users (id),
  created_at       timestamptz not null default now()
);
