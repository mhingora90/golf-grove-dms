-- Rate limit tracking for public API endpoints (e.g. /api/meta-lead)
-- Rows older than 2 hours serve no purpose — pruned on insert.

CREATE TABLE public.rate_limit_events (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  ip         text        NOT NULL,
  endpoint   text        NOT NULL DEFAULT 'meta-lead',
  success    boolean     NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX rate_limit_events_ip_created_at ON public.rate_limit_events (ip, created_at);

-- No public access — only reachable via service key from the edge function
ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;
-- (no policies = deny all; service key bypasses RLS)
