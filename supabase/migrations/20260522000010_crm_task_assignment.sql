-- Add task assignment: who a task is assigned to (can differ from who created it)
ALTER TABLE crm_lead_activities
  ADD COLUMN IF NOT EXISTS assigned_to      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to_name text;
