-- Insert the first project (idempotent)
INSERT INTO projects (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Golf Grove – DPC')
ON CONFLICT (id) DO NOTHING;

-- Add project_id column (nullable first, so we can backfill)
ALTER TABLE drawings             ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id);
ALTER TABLE submittals           ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id);
ALTER TABLE submittal_register   ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id);
ALTER TABLE inspections          ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id);
ALTER TABLE ncrs                 ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id);
ALTER TABLE rfis                 ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id);
ALTER TABLE transmittals         ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id);
ALTER TABLE correspondence       ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id);
ALTER TABLE punch_list           ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id);
ALTER TABLE method_statements    ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id);
ALTER TABLE subcontractors       ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id);
ALTER TABLE boq_bills            ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id);
ALTER TABLE payment_certificates ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id);
ALTER TABLE crm_leads            ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id);
ALTER TABLE units                ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id);

-- Backfill all existing rows to the first project
UPDATE drawings             SET project_id = '00000000-0000-0000-0000-000000000001' WHERE project_id IS NULL;
UPDATE submittals           SET project_id = '00000000-0000-0000-0000-000000000001' WHERE project_id IS NULL;
UPDATE submittal_register   SET project_id = '00000000-0000-0000-0000-000000000001' WHERE project_id IS NULL;
UPDATE inspections          SET project_id = '00000000-0000-0000-0000-000000000001' WHERE project_id IS NULL;
UPDATE ncrs                 SET project_id = '00000000-0000-0000-0000-000000000001' WHERE project_id IS NULL;
UPDATE rfis                 SET project_id = '00000000-0000-0000-0000-000000000001' WHERE project_id IS NULL;
UPDATE transmittals         SET project_id = '00000000-0000-0000-0000-000000000001' WHERE project_id IS NULL;
UPDATE correspondence       SET project_id = '00000000-0000-0000-0000-000000000001' WHERE project_id IS NULL;
UPDATE punch_list           SET project_id = '00000000-0000-0000-0000-000000000001' WHERE project_id IS NULL;
UPDATE method_statements    SET project_id = '00000000-0000-0000-0000-000000000001' WHERE project_id IS NULL;
UPDATE subcontractors       SET project_id = '00000000-0000-0000-0000-000000000001' WHERE project_id IS NULL;
UPDATE boq_bills            SET project_id = '00000000-0000-0000-0000-000000000001' WHERE project_id IS NULL;
UPDATE payment_certificates SET project_id = '00000000-0000-0000-0000-000000000001' WHERE project_id IS NULL;
UPDATE crm_leads            SET project_id = '00000000-0000-0000-0000-000000000001' WHERE project_id IS NULL;
UPDATE units                SET project_id = '00000000-0000-0000-0000-000000000001' WHERE project_id IS NULL;

-- Assign all existing users to the first project (idempotent)
INSERT INTO project_users (project_id, user_id)
SELECT '00000000-0000-0000-0000-000000000001', id FROM auth.users
ON CONFLICT (project_id, user_id) DO NOTHING;

-- Set NOT NULL after backfill
ALTER TABLE drawings             ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE submittals           ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE submittal_register   ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE inspections          ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE ncrs                 ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE rfis                 ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE transmittals         ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE correspondence        ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE punch_list           ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE method_statements    ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE subcontractors       ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE boq_bills            ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE payment_certificates ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE crm_leads            ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE units                ALTER COLUMN project_id SET NOT NULL;
