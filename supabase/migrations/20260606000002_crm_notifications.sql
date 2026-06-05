-- crm_notifications: per-user inbox of mention/reply events derived from
-- crm_lead_activities inserts. Only the SECURITY DEFINER trigger writes;
-- recipients can read and mark-read their own rows.

CREATE TABLE IF NOT EXISTS public.crm_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('mention', 'reply')),
  lead_id     uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES public.crm_lead_activities(id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name  text NOT NULL,
  snippet     text NOT NULL,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_notifications_user_unread_idx
  ON public.crm_notifications (user_id, read_at NULLS FIRST, created_at DESC);

CREATE INDEX IF NOT EXISTS crm_notifications_activity_idx
  ON public.crm_notifications (activity_id);

-- Back the ON CONFLICT DO NOTHING in fan_out_crm_notifications() with a real
-- unique key so duplicate user UUIDs in NEW.mentions don't create twin rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'crm_notifications_mention_unique'
  ) THEN
    ALTER TABLE public.crm_notifications
      ADD CONSTRAINT crm_notifications_mention_unique
      UNIQUE (user_id, activity_id, type);
  END IF;
END $$;

ALTER TABLE public.crm_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own notifications: select" ON public.crm_notifications;
CREATE POLICY "own notifications: select"
  ON public.crm_notifications FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own notifications: update read_at" ON public.crm_notifications;
CREATE POLICY "own notifications: update read_at"
  ON public.crm_notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- No INSERT policy → only the SECURITY DEFINER trigger writes.
-- No DELETE policy → cascade only.

-- Trigger function: fan out into per-recipient notification rows.
CREATE OR REPLACE FUNCTION public.fan_out_crm_notifications()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_actor_name    text;
  v_snippet       text;
  v_recipient     uuid;
  v_parent_author uuid;
BEGIN
  v_actor_name := COALESCE(NEW.author_name, 'Someone');
  v_snippet    := LEFT(COALESCE(NEW.body, ''), 140);

  -- Mentions: explicit @recipients from client autocomplete.
  IF NEW.mentions IS NOT NULL THEN
    FOREACH v_recipient IN ARRAY NEW.mentions LOOP
      IF v_recipient IS NOT NULL AND v_recipient <> NEW.author_id THEN
        INSERT INTO public.crm_notifications
          (user_id, type, lead_id, activity_id, actor_id, actor_name, snippet)
        VALUES
          (v_recipient, 'mention', NEW.lead_id, NEW.id,
           NEW.author_id, v_actor_name, v_snippet)
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  -- Reply: notify parent comment author (skip if already mentioned or is the actor).
  IF NEW.parent_id IS NOT NULL THEN
    SELECT author_id INTO v_parent_author
    FROM public.crm_lead_activities
    WHERE id = NEW.parent_id;

    IF v_parent_author IS NOT NULL
       AND v_parent_author <> NEW.author_id
       AND NOT (v_parent_author = ANY(COALESCE(NEW.mentions, ARRAY[]::uuid[])))
    THEN
      INSERT INTO public.crm_notifications
        (user_id, type, lead_id, activity_id, actor_id, actor_name, snippet)
      VALUES
        (v_parent_author, 'reply', NEW.lead_id, NEW.id,
         NEW.author_id, v_actor_name, v_snippet);
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fan_out_crm_notifications ON public.crm_lead_activities;
CREATE TRIGGER trg_fan_out_crm_notifications
  AFTER INSERT ON public.crm_lead_activities
  FOR EACH ROW
  EXECUTE FUNCTION public.fan_out_crm_notifications();
