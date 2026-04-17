-- Add all remaining columns missing from remote DB

-- inspections: plot/city for project header; individual department flags
alter table public.inspections
  add column if not exists plot         text,
  add column if not exists arch         boolean default false,
  add column if not exists elec         boolean default false,
  add column if not exists fire         boolean default false,
  add column if not exists plumb        boolean default false,
  add column if not exists structural   boolean default false,
  add column if not exists mep          boolean default false,
  add column if not exists civil        boolean default false;

-- submittals: document type checkboxes and discipline review flags
alter table public.submittals
  add column if not exists samples      boolean default false,
  add column if not exists brochure     boolean default false,
  add column if not exists sketches     boolean default false,
  add column if not exists others       boolean default false,
  add column if not exists civil        boolean default false,
  add column if not exists mech         boolean default false,
  add column if not exists elv          boolean default false,
  add column if not exists specs        boolean default false,
  add column if not exists arch         boolean default false,
  add column if not exists elec         boolean default false;

-- drawings: optional description field
alter table public.drawings
  add column if not exists description  text;
