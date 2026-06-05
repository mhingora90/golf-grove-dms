-- Add mentions array to activities. Populated client-side by the @ autocomplete.
-- Hard cap at 10 to prevent abuse. NULL-safe array_length check.

ALTER TABLE public.crm_lead_activities
  ADD COLUMN IF NOT EXISTS mentions uuid[] NOT NULL DEFAULT '{}';

ALTER TABLE public.crm_lead_activities
  DROP CONSTRAINT IF EXISTS crm_activities_mentions_max_10;

ALTER TABLE public.crm_lead_activities
  ADD CONSTRAINT crm_activities_mentions_max_10
    CHECK (array_length(mentions, 1) IS NULL OR array_length(mentions, 1) <= 10);
