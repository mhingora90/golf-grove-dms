-- CRM Leads table
BEGIN;

-- Disable RLS first (idempotent)
ALTER TABLE IF EXISTS crm_leads DISABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS crm_leads CASCADE;

CREATE TABLE crm_leads (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  email text,
  phone text,
  source text DEFAULT 'meta_ads',
  stage text DEFAULT 'new_lead',
  assigned_to text,
  meta_lead_id text,
  meta_form_id text,
  notes text,
  last_contacted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE crm_leads ENABLE ROW LEVEL SECURITY;

-- Helper: check if user has CRM access (sales role or developer)
DROP FUNCTION IF EXISTS has_crm_access();
CREATE OR REPLACE FUNCTION has_crm_access()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND (role = 'sales' OR role = 'developer')
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- RLS: sales/developer can read all leads
CREATE POLICY crm_leads_read ON crm_leads
  FOR SELECT USING (has_crm_access());

-- RLS: sales/developer can insert
CREATE POLICY crm_leads_insert ON crm_leads
  FOR INSERT WITH CHECK (has_crm_access());

-- RLS: sales/developer can update
CREATE POLICY crm_leads_update ON crm_leads
  FOR UPDATE USING (has_crm_access());

-- RLS: sales/developer can delete
CREATE POLICY crm_leads_delete ON crm_leads
  FOR DELETE USING (has_crm_access());

COMMIT;
