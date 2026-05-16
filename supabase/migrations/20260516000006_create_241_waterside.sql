-- Create 241 Waterside project
INSERT INTO projects (id, name)
VALUES ('00000000-0000-0000-0000-000000000002', '241 Waterside')
ON CONFLICT (id) DO NOTHING;

-- Assign all users who are on Golf Grove – DPC to 241 Waterside as well
INSERT INTO project_users (project_id, user_id)
SELECT '00000000-0000-0000-0000-000000000002', user_id
FROM project_users
WHERE project_id = '00000000-0000-0000-0000-000000000001'
ON CONFLICT (project_id, user_id) DO NOTHING;

-- Move all CRM leads from Golf Grove – DPC to 241 Waterside
UPDATE crm_leads
SET project_id = '00000000-0000-0000-0000-000000000002'
WHERE project_id = '00000000-0000-0000-0000-000000000001';
