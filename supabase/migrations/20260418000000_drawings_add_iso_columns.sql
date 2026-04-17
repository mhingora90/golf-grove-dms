-- Add ISO 19650 metadata columns to drawings table
alter table public.drawings
  add column if not exists cde_state     text not null default 'WIP',
  add column if not exists originator    text,
  add column if not exists zone          text,
  add column if not exists level         text,
  add column if not exists doc_type      text not null default 'DR';
