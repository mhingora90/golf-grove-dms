-- Delete the empty duplicate 241 Waterside (created via UI before migration ran)
DELETE FROM projects WHERE id = '6fb826bf-04ab-4b5d-b41d-b04cf0a95f25';

-- Change project_id FKs on all module tables to ON DELETE CASCADE
-- so deleting a project cascades to its module data
DO $$
DECLARE
  t text;
  constraint_name text;
  tables text[] := ARRAY[
    'drawings','submittals','submittal_register','inspections','ncrs',
    'rfis','transmittals','correspondence','punch_list','method_statements',
    'subcontractors','boq_bills','payment_certificates','crm_leads','units'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Find the FK constraint name for project_id on this table
    SELECT tc.constraint_name INTO constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name = t
      AND kcu.column_name = 'project_id'
    LIMIT 1;

    IF constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t, constraint_name);
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE', t, constraint_name);
    END IF;
  END LOOP;
END $$;

-- Also cascade project_users when project deleted (already set, but ensure)
-- project_users already has ON DELETE CASCADE from creation migration
