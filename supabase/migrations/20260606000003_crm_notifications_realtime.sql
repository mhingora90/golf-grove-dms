-- Enable Postgres Realtime for crm_notifications so the bell icon and
-- dashboard widget can subscribe to INSERT events per user.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'crm_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_notifications;
  END IF;
END $$;
