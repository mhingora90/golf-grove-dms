-- Link payment certificates to a specific contract
ALTER TABLE payment_certificates ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES contracts(id);
