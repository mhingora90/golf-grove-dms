-- Fix: revert migration 20260516000009 missed contracts table
-- Contracts were inserted into project 2 (241 Waterside) but BOQ bills
-- and payment certificates have been reverted to project 1 (Golf Grove – DPC)
UPDATE contracts
SET project_id = '00000000-0000-0000-0000-000000000001'
WHERE project_id = '00000000-0000-0000-0000-000000000002';
