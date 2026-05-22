-- Bug 2: add requested_role column to profiles
alter table public.profiles
  add column if not exists requested_role text;
