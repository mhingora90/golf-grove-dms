-- Remove NOT NULL constraint from name column in crm_leads
ALTER TABLE crm_leads ALTER COLUMN name DROP NOT NULL;
