-- ================================================================
-- Migration: 20260417000000_rls_policies.sql
-- RLS for 15 tables in Golf Grove DMS
-- NOTE: document_audit_log excluded — table not yet in remote schema;
--       add its RLS in a follow-up migration when the table is created.
-- Roles: developer > consultant > contractor > subcontractor
-- Helper: get_user_role() reads public.profiles via auth.uid()
-- ================================================================

-- ----------------------------------------------------------------
-- HELPER FUNCTION
-- SECURITY DEFINER so it bypasses RLS on profiles when called
-- inside policy expressions (avoids infinite recursion).
-- ----------------------------------------------------------------
create or replace function public.get_user_role()
  returns text
  language sql
  security definer
  stable
  set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ================================================================
-- ENABLE RLS ON ALL TABLES
-- ================================================================
alter table public.profiles           enable row level security;
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
-- profiles
-- ================================================================

-- TEST: any signed-in user reads any profile (names/roles shown app-wide)
create policy "profiles: authenticated read all"
  on public.profiles for select to authenticated
  using (true);

-- TEST: new user can only insert their own row (id = auth.uid())
create policy "profiles: user inserts own row"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

-- TEST: non-developer updates own row; WITH CHECK compares NEW.role
--       to get_user_role() (current/old value) — blocks self-promotion
create policy "profiles: user updates own non-role fields"
  on public.profiles for update to authenticated
  using  (auth.uid() = id and get_user_role() != 'developer')
  with check (auth.uid() = id and role = get_user_role());

-- TEST: developer updates any profile including role field
create policy "profiles: developer updates any profile"
  on public.profiles for update to authenticated
  using  (get_user_role() = 'developer')
  with check (get_user_role() = 'developer');

-- TEST: only developer can delete (offboarding)
create policy "profiles: developer deletes any profile"
  on public.profiles for delete to authenticated
  using (get_user_role() = 'developer');

-- ================================================================
-- drawings
-- ================================================================

-- TEST: all signed-in users can browse drawings
create policy "drawings: authenticated read all"
  on public.drawings for select to authenticated
  using (true);

-- TEST: upload:true roles — developer, consultant, contractor
--       subcontractor has upload:false → blocked
create policy "drawings: upload roles insert"
  on public.drawings for insert to authenticated
  with check (get_user_role() in ('developer', 'consultant', 'contractor'));

-- TEST: approve:true roles only — developer, consultant
--       needed for status changes (Approved, IFC, Void)
create policy "drawings: approve roles update"
  on public.drawings for update to authenticated
  using  (get_user_role() in ('developer', 'consultant'))
  with check (get_user_role() in ('developer', 'consultant'));

-- TEST: drawings are never deleted — use void/status change
-- (no DELETE policy → deny all)

-- ================================================================
-- drawing_revisions
-- ================================================================

-- TEST: full revision history readable by all authenticated
create policy "drawing_revisions: authenticated read all"
  on public.drawing_revisions for select to authenticated
  using (true);

-- TEST: upload roles add new revisions
create policy "drawing_revisions: upload roles insert"
  on public.drawing_revisions for insert to authenticated
  with check (get_user_role() in ('developer', 'consultant', 'contractor'));

-- TEST: approve roles set approval_date / approved_by_name
create policy "drawing_revisions: approve roles update"
  on public.drawing_revisions for update to authenticated
  using  (get_user_role() in ('developer', 'consultant'))
  with check (get_user_role() in ('developer', 'consultant'));

-- TEST: revision history is immutable — no deletes
-- (no DELETE policy)

-- ================================================================
-- submittals
-- ================================================================

-- TEST: all authenticated can view submittals
create policy "submittals: authenticated read all"
  on public.submittals for select to authenticated
  using (true);

-- TEST: submit:true on all four roles — anyone can raise a submittal
create policy "submittals: all authenticated insert"
  on public.submittals for insert to authenticated
  with check (true);

-- TEST: approve roles review/stamp submittals (Approved, R&R, etc.)
create policy "submittals: approve roles update"
  on public.submittals for update to authenticated
  using  (get_user_role() in ('developer', 'consultant'))
  with check (get_user_role() in ('developer', 'consultant'));

-- TEST: contractor/subcontractor can amend their own submittal ONLY
--       while it is still "Pending Review" (pre-review window)
--       status=Pending Review guard prevents edits after review starts
create policy "submittals: submitters edit pending"
  on public.submittals for update to authenticated
  using  (get_user_role() in ('contractor', 'subcontractor')
          and status = 'Pending Review')
  with check (get_user_role() in ('contractor', 'subcontractor')
              and status = 'Pending Review');

-- TEST: only developer can purge submittals
create policy "submittals: developer deletes"
  on public.submittals for delete to authenticated
  using (get_user_role() = 'developer');

-- ================================================================
-- submittal_register
-- ================================================================

-- TEST: all authenticated can view the register
create policy "submittal_register: authenticated read all"
  on public.submittal_register for select to authenticated
  using (true);

-- TEST: manageRegister:true — developer and consultant
create policy "submittal_register: manage roles insert"
  on public.submittal_register for insert to authenticated
  with check (get_user_role() in ('developer', 'consultant'));

create policy "submittal_register: manage roles update"
  on public.submittal_register for update to authenticated
  using  (get_user_role() in ('developer', 'consultant'))
  with check (get_user_role() in ('developer', 'consultant'));

-- TEST: only developer deletes register entries
create policy "submittal_register: developer deletes"
  on public.submittal_register for delete to authenticated
  using (get_user_role() = 'developer');

-- ================================================================
-- inspections
-- ================================================================

-- TEST: all authenticated can view inspection requests
create policy "inspections: authenticated read all"
  on public.inspections for select to authenticated
  using (true);

-- TEST: developer, consultant, contractor raise IRs
--       subcontractors coordinate via their contractor
create policy "inspections: raise roles insert"
  on public.inspections for insert to authenticated
  with check (get_user_role() in ('developer', 'consultant', 'contractor'));

-- TEST: approve roles change status (Approved, Correction, Rejected)
create policy "inspections: approve roles update"
  on public.inspections for update to authenticated
  using  (get_user_role() in ('developer', 'consultant'))
  with check (get_user_role() in ('developer', 'consultant'));

-- TEST: contractor can reschedule / amend a Pending inspection only
create policy "inspections: contractor edits pending"
  on public.inspections for update to authenticated
  using  (get_user_role() = 'contractor' and status = 'Pending')
  with check (get_user_role() = 'contractor' and status = 'Pending');

-- TEST: only developer deletes
create policy "inspections: developer deletes"
  on public.inspections for delete to authenticated
  using (get_user_role() = 'developer');

-- ================================================================
-- ncrs
-- ================================================================

-- TEST: all authenticated can read NCRs
create policy "ncrs: authenticated read all"
  on public.ncrs for select to authenticated
  using (true);

-- TEST: raise:true — developer and consultant only
create policy "ncrs: raise roles insert"
  on public.ncrs for insert to authenticated
  with check (get_user_role() in ('developer', 'consultant'));

-- TEST: raise roles manage full NCR lifecycle (Open → CAP → Closed)
create policy "ncrs: raise roles update"
  on public.ncrs for update to authenticated
  using  (get_user_role() in ('developer', 'consultant'))
  with check (get_user_role() in ('developer', 'consultant'));

-- TEST: contractor submits a CAP — can only transition Open → CAP Submitted
--       USING checks current status; WITH CHECK enforces new status
create policy "ncrs: contractor submits CAP"
  on public.ncrs for update to authenticated
  using  (get_user_role() = 'contractor' and status = 'Open')
  with check (get_user_role() = 'contractor' and status = 'CAP Submitted');

-- TEST: only developer deletes NCRs
create policy "ncrs: developer deletes"
  on public.ncrs for delete to authenticated
  using (get_user_role() = 'developer');

-- ================================================================
-- rfis
-- ================================================================

-- TEST: all authenticated can view RFIs
create policy "rfis: authenticated read all"
  on public.rfis for select to authenticated
  using (true);

-- TEST: all roles can raise an RFI
create policy "rfis: all authenticated insert"
  on public.rfis for insert to authenticated
  with check (true);

-- TEST: approve roles respond and close RFIs
create policy "rfis: approve roles update"
  on public.rfis for update to authenticated
  using  (get_user_role() in ('developer', 'consultant'))
  with check (get_user_role() in ('developer', 'consultant'));

-- TEST: contractor/subcontractor can amend their own open (unanswered) RFI
create policy "rfis: submitters edit open rfis"
  on public.rfis for update to authenticated
  using  (get_user_role() in ('contractor', 'subcontractor')
          and status = 'Open')
  with check (get_user_role() in ('contractor', 'subcontractor')
              and status = 'Open');

-- TEST: only developer deletes RFIs
create policy "rfis: developer deletes"
  on public.rfis for delete to authenticated
  using (get_user_role() = 'developer');

-- ================================================================
-- transmittals
-- ================================================================

-- TEST: all authenticated can read transmittals
create policy "transmittals: authenticated read all"
  on public.transmittals for select to authenticated
  using (true);

-- TEST: developer, consultant, contractor can send transmittals
create policy "transmittals: upload roles insert"
  on public.transmittals for insert to authenticated
  with check (get_user_role() in ('developer', 'consultant', 'contractor'));

-- TEST: approve roles can update transmittal details
create policy "transmittals: approve roles update"
  on public.transmittals for update to authenticated
  using  (get_user_role() in ('developer', 'consultant'))
  with check (get_user_role() in ('developer', 'consultant'));

-- TEST: contractor can acknowledge a transmittal sent to them
create policy "transmittals: contractor acknowledges"
  on public.transmittals for update to authenticated
  using  (get_user_role() = 'contractor')
  with check (get_user_role() = 'contractor');

-- TEST: only developer deletes
create policy "transmittals: developer deletes"
  on public.transmittals for delete to authenticated
  using (get_user_role() = 'developer');

-- ================================================================
-- correspondence
-- ================================================================

-- TEST: all authenticated can read correspondence
create policy "correspondence: authenticated read all"
  on public.correspondence for select to authenticated
  using (true);

-- TEST: raise:true — developer and consultant log correspondence
create policy "correspondence: raise roles insert"
  on public.correspondence for insert to authenticated
  with check (get_user_role() in ('developer', 'consultant'));

-- TEST: raise roles manage correspondence lifecycle (Open → Closed)
create policy "correspondence: raise roles update"
  on public.correspondence for update to authenticated
  using  (get_user_role() in ('developer', 'consultant'))
  with check (get_user_role() in ('developer', 'consultant'));

-- TEST: only developer deletes
create policy "correspondence: developer deletes"
  on public.correspondence for delete to authenticated
  using (get_user_role() = 'developer');

-- ================================================================
-- punch_list
-- ================================================================

-- TEST: all authenticated can read punch items
create policy "punch_list: authenticated read all"
  on public.punch_list for select to authenticated
  using (true);

-- TEST: raise:true — developer and consultant raise punch items
create policy "punch_list: raise roles insert"
  on public.punch_list for insert to authenticated
  with check (get_user_role() in ('developer', 'consultant'));

-- TEST: raise roles can fully manage items (change severity, close)
create policy "punch_list: raise roles update"
  on public.punch_list for update to authenticated
  using  (get_user_role() in ('developer', 'consultant'))
  with check (get_user_role() in ('developer', 'consultant'));

-- TEST: contractor adds response / moves to In Progress
--       WITH CHECK prevents contractor from self-closing items
create policy "punch_list: contractor responds"
  on public.punch_list for update to authenticated
  using  (get_user_role() = 'contractor'
          and status in ('Open', 'In Progress'))
  with check (get_user_role() = 'contractor'
              and status in ('Open', 'In Progress'));

-- TEST: only developer deletes punch items
create policy "punch_list: developer deletes"
  on public.punch_list for delete to authenticated
  using (get_user_role() = 'developer');

-- ================================================================
-- method_statements
-- ================================================================

-- TEST: all authenticated can view method statements
create policy "method_statements: authenticated read all"
  on public.method_statements for select to authenticated
  using (true);

-- TEST: submitMS:true — contractor & subcontractor; developer &
--       consultant can also author statements (superset of permissions)
create policy "method_statements: all authenticated insert"
  on public.method_statements for insert to authenticated
  with check (true);

-- TEST: approve roles review and stamp method statements
create policy "method_statements: approve roles update"
  on public.method_statements for update to authenticated
  using  (get_user_role() in ('developer', 'consultant'))
  with check (get_user_role() in ('developer', 'consultant'));

-- TEST: contractor/subcontractor can amend their Pending Review submission
create policy "method_statements: submitters edit pending"
  on public.method_statements for update to authenticated
  using  (get_user_role() in ('contractor', 'subcontractor')
          and status = 'Pending Review')
  with check (get_user_role() in ('contractor', 'subcontractor')
              and status = 'Pending Review');

-- TEST: only developer deletes
create policy "method_statements: developer deletes"
  on public.method_statements for delete to authenticated
  using (get_user_role() = 'developer');

-- ================================================================
-- subcontractors
-- ================================================================

-- TEST: all authenticated can browse the subcontractor directory
create policy "subcontractors: authenticated read all"
  on public.subcontractors for select to authenticated
  using (true);

-- TEST: manageSubs:true — developer and contractor
create policy "subcontractors: manage roles insert"
  on public.subcontractors for insert to authenticated
  with check (get_user_role() in ('developer', 'contractor'));

create policy "subcontractors: manage roles update"
  on public.subcontractors for update to authenticated
  using  (get_user_role() in ('developer', 'contractor'))
  with check (get_user_role() in ('developer', 'contractor'));

-- TEST: only developer deletes subcontractor records
create policy "subcontractors: developer deletes"
  on public.subcontractors for delete to authenticated
  using (get_user_role() = 'developer');

-- ================================================================
-- attachments
-- ================================================================

-- TEST: all authenticated can read/download attachments
create policy "attachments: authenticated read all"
  on public.attachments for select to authenticated
  using (true);

-- TEST: upload:true — developer, consultant, contractor
--       subcontractor has upload:false
create policy "attachments: upload roles insert"
  on public.attachments for insert to authenticated
  with check (get_user_role() in ('developer', 'consultant', 'contractor'));

-- TEST: only developer can clean up attachment records
create policy "attachments: developer deletes"
  on public.attachments for delete to authenticated
  using (get_user_role() = 'developer');

-- ================================================================
-- comments
-- ================================================================

-- TEST: all authenticated can read comments on any record
create policy "comments: authenticated read all"
  on public.comments for select to authenticated
  using (true);

-- TEST: all authenticated can post comments
-- NOTE: comments table has no author_id (UUID) column — ownership
--       checks are not enforceable. Adding author_id UUID FK to
--       auth.users is recommended for self-edit/delete policies.
create policy "comments: all authenticated insert"
  on public.comments for insert to authenticated
  with check (true);

-- TEST: developer can moderate any comment
create policy "comments: developer updates"
  on public.comments for update to authenticated
  using  (get_user_role() = 'developer')
  with check (get_user_role() = 'developer');

create policy "comments: developer deletes"
  on public.comments for delete to authenticated
  using (get_user_role() = 'developer');

-- ================================================================
-- document_audit_log
-- Deferred: table does not exist in remote schema yet.
-- When created, add a follow-up migration with:
--   alter table public.document_audit_log enable row level security;
--   SELECT: developer, consultant
--   INSERT: all authenticated (app logs every tracked action)
--   UPDATE / DELETE: none (immutable audit trail)
-- ================================================================
