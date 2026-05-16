-- Move BOQ and payment certificate data from Golf Grove – DPC to 241 Waterside
UPDATE boq_bills
SET project_id = '00000000-0000-0000-0000-000000000002'
WHERE project_id = '00000000-0000-0000-0000-000000000001';

UPDATE payment_certificates
SET project_id = '00000000-0000-0000-0000-000000000002'
WHERE project_id = '00000000-0000-0000-0000-000000000001';
