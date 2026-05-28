-- Revert: migration 20260528000003 incorrectly moved 241 Waterside contracts to Golf Grove
-- The Enabling Works / Aquapile contract belongs to 241 Waterside (project 2)
UPDATE contracts
SET project_id = '00000000-0000-0000-0000-000000000002'
WHERE project_id = '00000000-0000-0000-0000-000000000001';
