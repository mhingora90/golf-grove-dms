-- Revert: move BOQ and payment certificate data back to Golf Grove – DPC
UPDATE boq_bills
SET project_id = '00000000-0000-0000-0000-000000000001'
WHERE project_id = '00000000-0000-0000-0000-000000000002';

UPDATE payment_certificates
SET project_id = '00000000-0000-0000-0000-000000000001'
WHERE project_id = '00000000-0000-0000-0000-000000000002';
