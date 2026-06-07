-- When a customer is deleted, the CASCADE on unit_sale_customers drops the
-- junction row, but unit_sales.buyer_name kept its stale text. This trigger
-- recomputes buyer_name from the remaining linked owners (preferring the
-- primary). If no owners remain, buyer_name becomes null so the Unit
-- Register column reads as empty.

create or replace function public.sync_buyer_name_on_owner_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_primary_name text;
begin
  select c.name
    into new_primary_name
    from public.unit_sale_customers usc
    join public.customers c on c.id = usc.customer_id
   where usc.unit_sale_id = OLD.unit_sale_id
   order by usc.is_primary desc nulls last
   limit 1;

  update public.unit_sales
     set buyer_name = new_primary_name
   where id = OLD.unit_sale_id;

  return OLD;
end
$$;

drop trigger if exists trg_sync_buyer_name_on_owner_delete on public.unit_sale_customers;

create trigger trg_sync_buyer_name_on_owner_delete
after delete on public.unit_sale_customers
for each row
execute function public.sync_buyer_name_on_owner_delete();
