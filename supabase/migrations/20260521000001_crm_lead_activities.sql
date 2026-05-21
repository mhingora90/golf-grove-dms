-- CRM activity log: replaces flat notes with structured per-contact entries
CREATE TABLE crm_lead_activities (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id      uuid        NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  author_id    uuid        REFERENCES auth.users(id),
  author_name  text        NOT NULL,
  method       text        NOT NULL DEFAULT 'note'
                           CHECK (method IN ('call','whatsapp','email','meeting','site_visit','note')),
  contacted_at timestamptz NOT NULL DEFAULT now(),
  body         text        NOT NULL,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE crm_lead_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_act_read   ON crm_lead_activities FOR SELECT USING (has_crm_access());
CREATE POLICY crm_act_insert ON crm_lead_activities FOR INSERT WITH CHECK (has_crm_access());
CREATE POLICY crm_act_delete ON crm_lead_activities FOR DELETE USING (has_crm_access());
