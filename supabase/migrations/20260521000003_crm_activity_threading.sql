-- Self-referencing FK for threaded activity replies
ALTER TABLE crm_lead_activities
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES crm_lead_activities(id) ON DELETE CASCADE;
