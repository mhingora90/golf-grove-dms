-- Add broker/custom fields to crm_leads
BEGIN;

ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS broker_type text;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS budget_range text;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS property_types text;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS availability text;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS company_name text;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS first_name text;

COMMIT;
