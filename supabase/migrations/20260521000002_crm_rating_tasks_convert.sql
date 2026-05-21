-- Lead rating (hot/warm/cold)
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS rating text CHECK (rating IN ('hot','warm','cold'));

-- Link converted lead to a unit
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS converted_unit_id uuid REFERENCES units(id);

-- Task support on activities
ALTER TABLE crm_lead_activities ADD COLUMN IF NOT EXISTS due_at timestamptz;
ALTER TABLE crm_lead_activities ADD COLUMN IF NOT EXISTS completed boolean DEFAULT false;

-- Extend method enum to include task
ALTER TABLE crm_lead_activities DROP CONSTRAINT IF EXISTS crm_lead_activities_method_check;
ALTER TABLE crm_lead_activities ADD CONSTRAINT crm_lead_activities_method_check
  CHECK (method IN ('call','whatsapp','email','meeting','site_visit','note','task'));

-- Allow sales role to read units (needed for Convert Lead unit picker)
CREATE POLICY "units: sales select" ON units
  FOR SELECT TO authenticated USING (get_user_role() IN ('developer','sales'));
