-- Add columns missing from remote DB across several tables

alter table public.rfis
  add column if not exists from_party    text,
  add column if not exists to_party      text,
  add column if not exists discipline    text,
  add column if not exists response_date date;

alter table public.submittals
  add column if not exists arfi          text default 'AR';

alter table public.method_statements
  add column if not exists outcome       text;

alter table public.comments
  add column if not exists content       text;
