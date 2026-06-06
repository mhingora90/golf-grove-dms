-- Migration: 20260607000006_backfill_customers.sql
-- Backfill `customers` + `unit_sale_customers` from existing `unit_sales.buyer_name`.
--
-- Behavior:
--   * Splits `buyer_name` on " & ", " AND ", " and " (case-insensitive for the
--     "and" variant via the 'i' regex flag).
--   * Trims each segment; empty segments are skipped.
--   * Upserts customers matched by LOWER(TRIM(name)) — phone/email stay NULL.
--   * First segment is is_primary = true, others false. ownership_pct stays NULL.
--   * Idempotent: skips any unit_sale that already has at least one junction row
--     (so manual links and prior backfill runs are preserved).
--   * NULL or whitespace-only buyer_name rows are untouched.

create or replace function public.run_customer_backfill()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r        record;
  parts    text[];
  segment  text;
  idx      int;
  cust_id  uuid;
begin
  for r in
    select us.id as sale_id, btrim(us.buyer_name) as buyer_name
      from public.unit_sales us
     where us.buyer_name is not null
       and length(btrim(us.buyer_name)) > 0
       and not exists (
         select 1
           from public.unit_sale_customers usc
          where usc.unit_sale_id = us.id
       )
  loop
    -- Split on " & " (literal) and " and " (case-insensitive).
    -- The 'i' flag makes the alternation case-insensitive in regexp_split_to_array.
    parts := regexp_split_to_array(r.buyer_name, '\s+(?:&|and)\s+', 'i');

    idx := 0;
    foreach segment in array parts loop
      segment := btrim(segment);
      continue when segment = '';

      -- Dedup customers by LOWER(TRIM(name)).
      select id
        into cust_id
        from public.customers
       where lower(btrim(name)) = lower(segment)
       limit 1;

      if cust_id is null then
        insert into public.customers (name)
        values (segment)
        returning id into cust_id;
      end if;

      insert into public.unit_sale_customers (unit_sale_id, customer_id, is_primary)
      values (r.sale_id, cust_id, idx = 0)
      on conflict (unit_sale_id, customer_id) do nothing;

      idx := idx + 1;
    end loop;
  end loop;
end
$$;

comment on function public.run_customer_backfill() is
  'Parses unit_sales.buyer_name on & / and (case-insensitive) and populates customers + unit_sale_customers. Idempotent.';

revoke execute on function public.run_customer_backfill() from public;
grant execute on function public.run_customer_backfill() to service_role;

-- Run once at migration time.
select public.run_customer_backfill();
