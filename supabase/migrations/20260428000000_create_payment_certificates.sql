-- Payment Certificates Module
-- Tables: boq_bills, boq_items, payment_certificates, payment_certificate_items

create table if not exists boq_bills (
  id           uuid primary key default gen_random_uuid(),
  bill_no      text not null,
  title        text not null,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists boq_items (
  id           uuid primary key default gen_random_uuid(),
  bill_id      uuid not null references boq_bills(id) on delete cascade,
  item_no      text not null,
  description  text not null,
  qty          numeric not null default 0,
  unit         text not null default '',
  rate         numeric not null default 0,
  total        numeric not null default 0,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists payment_certificates (
  id                 uuid primary key default gen_random_uuid(),
  cert_no            integer not null,
  ref_no             text not null,
  status             text not null default 'Draft',
  submitted_by_name  text,
  submitted_date     timestamptz,
  certified_by_name  text,
  certified_date     timestamptz,
  paid_date          date,
  payment_ref        text,
  retention_pct      numeric not null default 10,
  advance_recovery   numeric not null default 0,
  vat_pct            numeric not null default 5,
  previously_paid    numeric not null default 0,
  notes              text,
  created_at         timestamptz not null default now()
);

create table if not exists payment_certificate_items (
  id                uuid primary key default gen_random_uuid(),
  cert_id           uuid not null references payment_certificates(id) on delete cascade,
  boq_item_id       uuid not null references boq_items(id) on delete restrict,
  contractor_pct    numeric not null default 0,
  contractor_amount numeric not null default 0,
  consultant_pct    numeric,
  consultant_amount numeric,
  created_at        timestamptz not null default now()
);
