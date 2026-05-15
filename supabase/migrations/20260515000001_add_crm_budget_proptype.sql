-- Add created_time (budget) and ad_id (property type) fields from Meta Ads sheet
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS created_time text;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS ad_id text;
