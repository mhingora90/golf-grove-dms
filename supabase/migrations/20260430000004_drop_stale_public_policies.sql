-- Drop all stale permissive "public"-role policies that bypass role-based RLS.
-- These were auto-generated earlier and override the properly-scoped policies
-- from migrations 20260417000000 and 20260430000001.

-- profiles
drop policy if exists "Users can update own profile"              on public.profiles;
drop policy if exists "Users can view own profile"               on public.profiles;
drop policy if exists "profiles_insert_developer"                on public.profiles;
drop policy if exists "profiles_read_all"                        on public.profiles;
drop policy if exists "profiles_update_own"                      on public.profiles;
drop policy if exists "restrict_profile_role_changes"            on public.profiles;

-- drawings
drop policy if exists "All users read drawings"                   on public.drawings;
drop policy if exists "Consultant and contractor can insert drawings" on public.drawings;
drop policy if exists "Consultant can update drawings"            on public.drawings;
drop policy if exists "Users can access drawings"                 on public.drawings;
drop policy if exists "drawings_full_developer"                   on public.drawings;
drop policy if exists "drawings_insert_contractor"               on public.drawings;
drop policy if exists "drawings_insert_subcontractor"            on public.drawings;
drop policy if exists "drawings_read_all"                        on public.drawings;
drop policy if exists "drawings_update_consultant"               on public.drawings;
drop policy if exists "drawings_update_contractor"               on public.drawings;
drop policy if exists "drawings_update_subcontractor"            on public.drawings;
drop policy if exists "restrict_cde_state_transitions"           on public.drawings;

-- drawing_revisions
drop policy if exists "All authenticated users read revisions"    on public.drawing_revisions;
drop policy if exists "Authenticated users insert revisions"      on public.drawing_revisions;
drop policy if exists "Consultant can update revisions"           on public.drawing_revisions;
drop policy if exists "drawing_revisions_full_developer"          on public.drawing_revisions;
drop policy if exists "drawing_revisions_insert_consultant"       on public.drawing_revisions;
drop policy if exists "drawing_revisions_insert_contractor"       on public.drawing_revisions;
drop policy if exists "drawing_revisions_read_all"                on public.drawing_revisions;
drop policy if exists "drawing_revisions_update_consultant"       on public.drawing_revisions;
drop policy if exists "drawing_revisions_update_contractor"       on public.drawing_revisions;

-- submittals
drop policy if exists "Authenticated users insert submittals"     on public.submittals;
drop policy if exists "Consultant can update submittals"          on public.submittals;
drop policy if exists "Contractors see own submittals"            on public.submittals;
drop policy if exists "Users can access submittals"              on public.submittals;
drop policy if exists "restrict_submittal_resubmit_to_contractors" on public.submittals;
drop policy if exists "submittals_full_developer"                on public.submittals;
drop policy if exists "submittals_insert_contractor"             on public.submittals;
drop policy if exists "submittals_insert_subcontractor"          on public.submittals;
drop policy if exists "submittals_read_all"                      on public.submittals;
drop policy if exists "submittals_update_consultant"             on public.submittals;
drop policy if exists "submittals_update_contractor"             on public.submittals;
drop policy if exists "submittals_update_subcontractor"          on public.submittals;

-- submittal_register
drop policy if exists "submittal_register_consultant"            on public.submittal_register;
drop policy if exists "submittal_register_full_developer"        on public.submittal_register;
drop policy if exists "submittal_register_read_all"              on public.submittal_register;

-- inspections
drop policy if exists "Authenticated users insert inspections"    on public.inspections;
drop policy if exists "Consultant can update inspections"         on public.inspections;
drop policy if exists "Users see relevant inspections"            on public.inspections;
drop policy if exists "inspections_full_developer"               on public.inspections;
drop policy if exists "inspections_insert_contractor"            on public.inspections;
drop policy if exists "inspections_read_all"                     on public.inspections;
drop policy if exists "inspections_update_consultant"            on public.inspections;
drop policy if exists "inspections_update_contractor"            on public.inspections;
drop policy if exists "restrict_ir_reinspect_to_contractors"     on public.inspections;

-- ncrs
drop policy if exists "All users read NCRs"                      on public.ncrs;
drop policy if exists "Consultant and developer manage NCRs"     on public.ncrs;
drop policy if exists "ncrs_full_developer"                      on public.ncrs;
drop policy if exists "ncrs_insert_consultant"                   on public.ncrs;
drop policy if exists "ncrs_read_all"                            on public.ncrs;
drop policy if exists "ncrs_update_consultant"                   on public.ncrs;
drop policy if exists "ncrs_update_contractor"                   on public.ncrs;
drop policy if exists "restrict_ncr_cap_submit_to_contractors"   on public.ncrs;

-- rfis
drop policy if exists "All authenticated users read rfis"        on public.rfis;
drop policy if exists "Authenticated users insert rfis"          on public.rfis;
drop policy if exists "Consultant and developer update rfis"     on public.rfis;
drop policy if exists "rfis_full_developer"                      on public.rfis;
drop policy if exists "rfis_insert_contractor"                   on public.rfis;
drop policy if exists "rfis_read_all"                            on public.rfis;
drop policy if exists "rfis_update_consultant"                   on public.rfis;
drop policy if exists "rfis_update_contractor"                   on public.rfis;

-- transmittals
drop policy if exists "All authenticated users read transmittals" on public.transmittals;
drop policy if exists "Authenticated users manage transmittals"  on public.transmittals;
drop policy if exists "transmittals_full_developer"              on public.transmittals;
drop policy if exists "transmittals_insert_consultant"           on public.transmittals;
drop policy if exists "transmittals_insert_contractor"           on public.transmittals;
drop policy if exists "transmittals_read_all"                    on public.transmittals;
drop policy if exists "transmittals_update_consultant"           on public.transmittals;
drop policy if exists "transmittals_update_contractor"           on public.transmittals;

-- correspondence
drop policy if exists "correspondence_full_developer"            on public.correspondence;
drop policy if exists "correspondence_insert_consultant"         on public.correspondence;
drop policy if exists "correspondence_insert_contractor"         on public.correspondence;
drop policy if exists "correspondence_read_all"                  on public.correspondence;
drop policy if exists "correspondence_update_consultant"         on public.correspondence;
drop policy if exists "correspondence_update_contractor"         on public.correspondence;

-- punch_list
drop policy if exists "punch_list_full_developer"                on public.punch_list;
drop policy if exists "punch_list_insert_consultant"             on public.punch_list;
drop policy if exists "punch_list_insert_contractor"             on public.punch_list;
drop policy if exists "punch_list_read_all"                      on public.punch_list;
drop policy if exists "punch_list_update_consultant"             on public.punch_list;
drop policy if exists "punch_list_update_contractor"             on public.punch_list;

-- method_statements
drop policy if exists "Auth insert MS"                           on public.method_statements;
drop policy if exists "Auth read MS"                             on public.method_statements;
drop policy if exists "Auth update MS"                           on public.method_statements;
drop policy if exists "method_statements_full_developer"         on public.method_statements;
drop policy if exists "method_statements_insert_consultant"      on public.method_statements;
drop policy if exists "method_statements_insert_contractor"      on public.method_statements;
drop policy if exists "method_statements_insert_subcontractor"   on public.method_statements;
drop policy if exists "method_statements_read_all"               on public.method_statements;
drop policy if exists "method_statements_update_consultant"      on public.method_statements;
drop policy if exists "method_statements_update_contractor"      on public.method_statements;
drop policy if exists "method_statements_update_subcontractor"   on public.method_statements;
drop policy if exists "restrict_ms_insert_to_contractors"        on public.method_statements;

-- subcontractors
drop policy if exists "Authenticated users read subcontractors"  on public.subcontractors;
drop policy if exists "Consultant and developer can manage subcontractors" on public.subcontractors;
drop policy if exists "subcontractors_delete_contractor"         on public.subcontractors;
drop policy if exists "subcontractors_full_developer"            on public.subcontractors;
drop policy if exists "subcontractors_insert_contractor"         on public.subcontractors;
drop policy if exists "subcontractors_read_all"                  on public.subcontractors;
drop policy if exists "subcontractors_update_contractor"         on public.subcontractors;

-- attachments
drop policy if exists "All authenticated users read attachments" on public.attachments;
drop policy if exists "Authenticated users insert attachments"   on public.attachments;
drop policy if exists "Uploader can delete own attachments"      on public.attachments;
drop policy if exists "attachments_insert_all"                   on public.attachments;
drop policy if exists "attachments_read_all"                     on public.attachments;

-- comments
drop policy if exists "All authenticated users read comments"    on public.comments;
drop policy if exists "Authenticated users insert comments"      on public.comments;
drop policy if exists "comments_insert_all"                      on public.comments;
drop policy if exists "comments_read_all"                        on public.comments;
