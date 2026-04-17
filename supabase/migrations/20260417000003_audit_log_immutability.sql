-- ================================================================
-- Migration: 20260417000003_audit_log_immutability.sql
-- Adds DB-level triggers blocking UPDATE and DELETE on
-- document_audit_log regardless of how the table is accessed
-- (covers service_role callers that bypass RLS).
-- RLS already restricts INSERT to authenticated; triggers add
-- belt-and-suspenders immutability at the storage engine level.
-- ================================================================

create or replace function public.block_audit_log_mutations()
  returns trigger
  language plpgsql
  security definer
as $$
begin
  raise exception
    'document_audit_log is immutable: % operations are not permitted', TG_OP;
end;
$$;

-- TEST: any UPDATE attempt raises exception before the row is touched
create trigger audit_log_block_update
  before update on public.document_audit_log
  for each row execute function public.block_audit_log_mutations();

-- TEST: any DELETE attempt raises exception before the row is removed
create trigger audit_log_block_delete
  before delete on public.document_audit_log
  for each row execute function public.block_audit_log_mutations();
