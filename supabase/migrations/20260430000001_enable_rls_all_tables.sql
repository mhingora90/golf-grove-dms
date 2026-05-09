-- ================================================================
-- Migration: 20260430000001_enable_rls_all_tables.sql
-- Enable RLS and apply role-based policies for all 14 core tables.
-- The initial migration (20260417000000) was never applied to the
-- remote instance; this migration supersedes it.
-- ================================================================

-- ================================================================
-- ENABLE RLS ON ALL TABLES
-- ================================================================
alter table public.drawings           enable row level security;
alter table public.drawing_revisions  enable row level security;
alter table public.submittals         enable row level security;
alter table public.submittal_register enable row level security;
alter table public.inspections        enable row level security;
alter table public.ncrs               enable row level security;
alter table public.rfis               enable row level security;
alter table public.transmittals       enable row level security;
alter table public.correspondence     enable row level security;
alter table public.punch_list         enable row level security;
alter table public.method_statements  enable row level security;
alter table public.subcontractors     enable row level security;
alter table public.attachments        enable row level security;
alter table public.comments           enable row level security;

-- ================================================================
-- profiles (RLS may already be on from dashboard setup)
-- ================================================================
alter table public.profiles enable row level security;

drop policy if exists "profiles: authenticated read all"       on public.profiles;
drop policy if exists "profiles: user inserts own row"        on public.profiles;
drop policy if exists "profiles: user updates own non-role fields" on public.profiles;
drop policy if exists "profiles: developer updates any profile"    on public.profiles;
drop policy if exists "profiles: developer deletes any profile"   on public.profiles;

create policy "profiles: authenticated read all"
  on public.profiles for select to authenticated using (true);

create policy "profiles: user inserts own row"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

create policy "profiles: user updates own non-role fields"
  on public.profiles for update to authenticated
  using  (auth.uid() = id and get_user_role() != 'developer')
  with check (auth.uid() = id and role = get_user_role());

create policy "profiles: developer updates any profile"
  on public.profiles for update to authenticated
  using  (get_user_role() = 'developer')
  with check (get_user_role() = 'developer');

create policy "profiles: developer deletes any profile"
  on public.profiles for delete to authenticated
  using (get_user_role() = 'developer');

-- ================================================================
-- drawings
-- ================================================================
drop policy if exists "drawings: authenticated read all"   on public.drawings;
drop policy if exists "drawings: upload roles insert"      on public.drawings;
drop policy if exists "drawings: approve roles update"     on public.drawings;

create policy "drawings: authenticated read all"
  on public.drawings for select to authenticated using (true);

-- upload:true — developer, consultant, contractor; subcontractor blocked
create policy "drawings: upload roles insert"
  on public.drawings for insert to authenticated
  with check (get_user_role() in ('developer', 'consultant', 'contractor'));

-- approve:true — developer, consultant only
create policy "drawings: approve roles update"
  on public.drawings for update to authenticated
  using  (get_user_role() in ('developer', 'consultant'))
  with check (get_user_role() in ('developer', 'consultant'));

-- no DELETE policy → deny all

-- ================================================================
-- drawing_revisions
-- ================================================================
drop policy if exists "drawing_revisions: authenticated read all"  on public.drawing_revisions;
drop policy if exists "drawing_revisions: upload roles insert"     on public.drawing_revisions;
drop policy if exists "drawing_revisions: approve roles update"    on public.drawing_revisions;

create policy "drawing_revisions: authenticated read all"
  on public.drawing_revisions for select to authenticated using (true);

-- upload:true roles only
create policy "drawing_revisions: upload roles insert"
  on public.drawing_revisions for insert to authenticated
  with check (get_user_role() in ('developer', 'consultant', 'contractor'));

create policy "drawing_revisions: approve roles update"
  on public.drawing_revisions for update to authenticated
  using  (get_user_role() in ('developer', 'consultant'))
  with check (get_user_role() in ('developer', 'consultant'));

-- revision history is immutable — no deletes

-- ================================================================
-- submittals
-- ================================================================
drop policy if exists "submittals: authenticated read all"  on public.submittals;
drop policy if exists "submittals: all authenticated insert" on public.submittals;
drop policy if exists "submittals: approve roles update"    on public.submittals;
drop policy if exists "submittals: submitters edit pending"  on public.submittals;
drop policy if exists "submittals: developer deletes"        on public.submittals;

create policy "submittals: authenticated read all"
  on public.submittals for select to authenticated using (true);

create policy "submittals: all authenticated insert"
  on public.submittals for insert to authenticated with check (true);

-- approve roles review/stamp submittals
create policy "submittals: approve roles update"
  on public.submittals for update to authenticated
  using  (get_user_role() in ('developer', 'consultant'))
  with check (get_user_role() in ('developer', 'consultant'));

-- contractor/sub can amend ONLY while Pending Review and cannot change status away from Pending Review
create policy "submittals: submitters edit pending"
  on public.submittals for update to authenticated
  using  (get_user_role() in ('contractor', 'subcontractor')
          and status = 'Pending Review')
  with check (get_user_role() in ('contractor', 'subcontractor')
              and status = 'Pending Review');

create policy "submittals: developer deletes"
  on public.submittals for delete to authenticated
  using (get_user_role() = 'developer');

-- ================================================================
-- submittal_register
-- ================================================================
drop policy if exists "submittal_register: authenticated read all" on public.submittal_register;
drop policy if exists "submittal_register: manage roles insert"    on public.submittal_register;
drop policy if exists "submittal_register: manage roles update"    on public.submittal_register;
drop policy if exists "submittal_register: developer deletes"      on public.submittal_register;

create policy "submittal_register: authenticated read all"
  on public.submittal_register for select to authenticated using (true);

create policy "submittal_register: manage roles insert"
  on public.submittal_register for insert to authenticated
  with check (get_user_role() in ('developer', 'consultant'));

create policy "submittal_register: manage roles update"
  on public.submittal_register for update to authenticated
  using  (get_user_role() in ('developer', 'consultant'))
  with check (get_user_role() in ('developer', 'consultant'));

create policy "submittal_register: developer deletes"
  on public.submittal_register for delete to authenticated
  using (get_user_role() = 'developer');

-- ================================================================
-- inspections
-- ================================================================
drop policy if exists "inspections: authenticated read all"  on public.inspections;
drop policy if exists "inspections: raise roles insert"      on public.inspections;
drop policy if exists "inspections: approve roles update"    on public.inspections;
drop policy if exists "inspections: contractor edits pending" on public.inspections;
drop policy if exists "inspections: developer deletes"        on public.inspections;

create policy "inspections: authenticated read all"
  on public.inspections for select to authenticated using (true);

-- All four roles can raise IRs (subcontractor included for re-inspection workflows)
create policy "inspections: raise roles insert"
  on public.inspections for insert to authenticated
  with check (get_user_role() in ('developer', 'consultant', 'contractor', 'subcontractor'));

create policy "inspections: approve roles update"
  on public.inspections for update to authenticated
  using  (get_user_role() in ('developer', 'consultant'))
  with check (get_user_role() in ('developer', 'consultant'));

create policy "inspections: contractor edits pending"
  on public.inspections for update to authenticated
  using  (get_user_role() = 'contractor' and status = 'Pending')
  with check (get_user_role() = 'contractor' and status = 'Pending');

create policy "inspections: developer deletes"
  on public.inspections for delete to authenticated
  using (get_user_role() = 'developer');

-- ================================================================
-- ncrs
-- ================================================================
drop policy if exists "ncrs: authenticated read all"     on public.ncrs;
drop policy if exists "ncrs: raise roles insert"         on public.ncrs;
drop policy if exists "ncrs: raise roles update"         on public.ncrs;
drop policy if exists "ncrs: contractor submits CAP"     on public.ncrs;
drop policy if exists "ncrs: developer deletes"          on public.ncrs;

create policy "ncrs: authenticated read all"
  on public.ncrs for select to authenticated using (true);

create policy "ncrs: raise roles insert"
  on public.ncrs for insert to authenticated
  with check (get_user_role() in ('developer', 'consultant'));

create policy "ncrs: raise roles update"
  on public.ncrs for update to authenticated
  using  (get_user_role() in ('developer', 'consultant'))
  with check (get_user_role() in ('developer', 'consultant'));

-- contractor: Open → CAP Submitted only
create policy "ncrs: contractor submits CAP"
  on public.ncrs for update to authenticated
  using  (get_user_role() = 'contractor' and status = 'Open')
  with check (get_user_role() = 'contractor' and status = 'CAP Submitted');

create policy "ncrs: developer deletes"
  on public.ncrs for delete to authenticated
  using (get_user_role() = 'developer');

-- ================================================================
-- rfis
-- ================================================================
drop policy if exists "rfis: authenticated read all"      on public.rfis;
drop policy if exists "rfis: all authenticated insert"    on public.rfis;
drop policy if exists "rfis: approve roles update"        on public.rfis;
drop policy if exists "rfis: submitters edit open rfis"   on public.rfis;
drop policy if exists "rfis: developer deletes"           on public.rfis;

create policy "rfis: authenticated read all"
  on public.rfis for select to authenticated using (true);

create policy "rfis: all authenticated insert"
  on public.rfis for insert to authenticated with check (true);

create policy "rfis: approve roles update"
  on public.rfis for update to authenticated
  using  (get_user_role() in ('developer', 'consultant'))
  with check (get_user_role() in ('developer', 'consultant'));

-- contractor/sub can edit subject/details ONLY while Open; cannot change status
create policy "rfis: submitters edit open rfis"
  on public.rfis for update to authenticated
  using  (get_user_role() in ('contractor', 'subcontractor') and status = 'Open')
  with check (get_user_role() in ('contractor', 'subcontractor') and status = 'Open');

create policy "rfis: developer deletes"
  on public.rfis for delete to authenticated
  using (get_user_role() = 'developer');

-- ================================================================
-- transmittals
-- ================================================================
drop policy if exists "transmittals: authenticated read all"  on public.transmittals;
drop policy if exists "transmittals: upload roles insert"     on public.transmittals;
drop policy if exists "transmittals: approve roles update"    on public.transmittals;
drop policy if exists "transmittals: contractor acknowledges" on public.transmittals;
drop policy if exists "transmittals: developer deletes"       on public.transmittals;

create policy "transmittals: authenticated read all"
  on public.transmittals for select to authenticated using (true);

create policy "transmittals: upload roles insert"
  on public.transmittals for insert to authenticated
  with check (get_user_role() in ('developer', 'consultant', 'contractor'));

create policy "transmittals: approve roles update"
  on public.transmittals for update to authenticated
  using  (get_user_role() in ('developer', 'consultant'))
  with check (get_user_role() in ('developer', 'consultant'));

-- contractor can acknowledge (set acknowledged_by/acknowledged_at only)
create policy "transmittals: contractor acknowledges"
  on public.transmittals for update to authenticated
  using  (get_user_role() = 'contractor')
  with check (get_user_role() = 'contractor');

create policy "transmittals: developer deletes"
  on public.transmittals for delete to authenticated
  using (get_user_role() = 'developer');

-- ================================================================
-- correspondence
-- ================================================================
drop policy if exists "correspondence: authenticated read all" on public.correspondence;
drop policy if exists "correspondence: raise roles insert"     on public.correspondence;
drop policy if exists "correspondence: raise roles update"     on public.correspondence;
drop policy if exists "correspondence: developer deletes"      on public.correspondence;

create policy "correspondence: authenticated read all"
  on public.correspondence for select to authenticated using (true);

create policy "correspondence: raise roles insert"
  on public.correspondence for insert to authenticated
  with check (get_user_role() in ('developer', 'consultant'));

create policy "correspondence: raise roles update"
  on public.correspondence for update to authenticated
  using  (get_user_role() in ('developer', 'consultant'))
  with check (get_user_role() in ('developer', 'consultant'));

create policy "correspondence: developer deletes"
  on public.correspondence for delete to authenticated
  using (get_user_role() = 'developer');

-- ================================================================
-- punch_list
-- ================================================================
drop policy if exists "punch_list: authenticated read all" on public.punch_list;
drop policy if exists "punch_list: raise roles insert"     on public.punch_list;
drop policy if exists "punch_list: raise roles update"     on public.punch_list;
drop policy if exists "punch_list: contractor responds"    on public.punch_list;
drop policy if exists "punch_list: developer deletes"      on public.punch_list;

create policy "punch_list: authenticated read all"
  on public.punch_list for select to authenticated using (true);

create policy "punch_list: raise roles insert"
  on public.punch_list for insert to authenticated
  with check (get_user_role() in ('developer', 'consultant'));

-- raise roles fully manage items (change severity, close, reopen)
create policy "punch_list: raise roles update"
  on public.punch_list for update to authenticated
  using  (get_user_role() in ('developer', 'consultant'))
  with check (get_user_role() in ('developer', 'consultant'));

-- contractor adds response / moves to In Progress; WITH CHECK prevents self-closing
create policy "punch_list: contractor responds"
  on public.punch_list for update to authenticated
  using  (get_user_role() = 'contractor'
          and status in ('Open', 'In Progress'))
  with check (get_user_role() = 'contractor'
              and status in ('Open', 'In Progress'));

create policy "punch_list: developer deletes"
  on public.punch_list for delete to authenticated
  using (get_user_role() = 'developer');

-- ================================================================
-- method_statements
-- ================================================================
drop policy if exists "method_statements: authenticated read all"  on public.method_statements;
drop policy if exists "method_statements: all authenticated insert" on public.method_statements;
drop policy if exists "method_statements: approve roles update"    on public.method_statements;
drop policy if exists "method_statements: submitters edit pending"  on public.method_statements;
drop policy if exists "method_statements: developer deletes"        on public.method_statements;

create policy "method_statements: authenticated read all"
  on public.method_statements for select to authenticated using (true);

create policy "method_statements: all authenticated insert"
  on public.method_statements for insert to authenticated with check (true);

create policy "method_statements: approve roles update"
  on public.method_statements for update to authenticated
  using  (get_user_role() in ('developer', 'consultant'))
  with check (get_user_role() in ('developer', 'consultant'));

-- contractor/sub can amend Pending Review submissions only; cannot self-approve
create policy "method_statements: submitters edit pending"
  on public.method_statements for update to authenticated
  using  (get_user_role() in ('contractor', 'subcontractor')
          and status = 'Pending Review')
  with check (get_user_role() in ('contractor', 'subcontractor')
              and status = 'Pending Review');

create policy "method_statements: developer deletes"
  on public.method_statements for delete to authenticated
  using (get_user_role() = 'developer');

-- ================================================================
-- subcontractors
-- ================================================================
drop policy if exists "subcontractors: authenticated read all"  on public.subcontractors;
drop policy if exists "subcontractors: manage roles insert"     on public.subcontractors;
drop policy if exists "subcontractors: manage roles update"     on public.subcontractors;
drop policy if exists "subcontractors: developer deletes"       on public.subcontractors;

create policy "subcontractors: authenticated read all"
  on public.subcontractors for select to authenticated using (true);

create policy "subcontractors: manage roles insert"
  on public.subcontractors for insert to authenticated
  with check (get_user_role() in ('developer', 'contractor'));

create policy "subcontractors: manage roles update"
  on public.subcontractors for update to authenticated
  using  (get_user_role() in ('developer', 'contractor'))
  with check (get_user_role() in ('developer', 'contractor'));

create policy "subcontractors: developer deletes"
  on public.subcontractors for delete to authenticated
  using (get_user_role() = 'developer');

-- ================================================================
-- attachments
-- ================================================================
drop policy if exists "attachments: authenticated read all" on public.attachments;
drop policy if exists "attachments: upload roles insert"    on public.attachments;
drop policy if exists "attachments: developer deletes"      on public.attachments;

create policy "attachments: authenticated read all"
  on public.attachments for select to authenticated using (true);

create policy "attachments: upload roles insert"
  on public.attachments for insert to authenticated
  with check (get_user_role() in ('developer', 'consultant', 'contractor'));

create policy "attachments: developer deletes"
  on public.attachments for delete to authenticated
  using (get_user_role() = 'developer');

-- ================================================================
-- comments
-- ================================================================
drop policy if exists "comments: authenticated read all"  on public.comments;
drop policy if exists "comments: all authenticated insert" on public.comments;
drop policy if exists "comments: developer updates"        on public.comments;
drop policy if exists "comments: developer deletes"        on public.comments;

create policy "comments: authenticated read all"
  on public.comments for select to authenticated using (true);

create policy "comments: all authenticated insert"
  on public.comments for insert to authenticated with check (true);

create policy "comments: developer updates"
  on public.comments for update to authenticated
  using  (get_user_role() = 'developer')
  with check (get_user_role() = 'developer');

create policy "comments: developer deletes"
  on public.comments for delete to authenticated
  using (get_user_role() = 'developer');
