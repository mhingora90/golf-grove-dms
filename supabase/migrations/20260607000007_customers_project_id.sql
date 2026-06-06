-- Scope customers to a "home project" (the project they were created against).
-- A customer remains visible to that home project AND any project they own
-- a unit in (so joint owners spanning multiple projects still appear in each).

alter table public.customers
  add column if not exists project_id uuid references public.projects(id) on delete set null;

create index if not exists customers_project_id_idx on public.customers (project_id);

-- Backfill: for existing rows, pick the project of the first linked unit.
update public.customers c
set    project_id = sub.project_id
from (
  select distinct on (usc.customer_id)
         usc.customer_id,
         u.project_id
  from   public.unit_sale_customers usc
  join   public.unit_sales us on us.id = usc.unit_sale_id
  join   public.units      u  on u.id  = us.unit_id
  order  by usc.customer_id, usc.is_primary desc nulls last, usc.unit_sale_id
) as sub
where  sub.customer_id = c.id
  and  c.project_id is null;
