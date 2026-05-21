-- Allow CRM users to update activities (needed for task completion, edits)
CREATE POLICY crm_act_update ON crm_lead_activities FOR UPDATE USING (has_crm_access()) WITH CHECK (has_crm_access());
