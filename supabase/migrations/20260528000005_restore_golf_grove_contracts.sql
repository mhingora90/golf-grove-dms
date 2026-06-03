-- Migration 20260528000004 over-aggressively moved ALL contracts to project 2,
-- including Golf Grove's own contracts. Move non-Enabling-Works contracts back.
UPDATE contracts
SET project_id = '00000000-0000-0000-0000-000000000001'
WHERE project_id = '00000000-0000-0000-0000-000000000002'
AND name != 'Enabling Works';
