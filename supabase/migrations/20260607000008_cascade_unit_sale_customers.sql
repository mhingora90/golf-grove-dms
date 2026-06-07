-- Change unit_sale_customers.customer_id FK from ON DELETE RESTRICT to CASCADE
-- so deleting a customer from the Customers module removes their unit links
-- rather than blocking the delete. Sale rows survive; unit_sales.buyer_name
-- keeps its historical text (not auto-updated here).

alter table public.unit_sale_customers
  drop constraint if exists unit_sale_customers_customer_id_fkey;

alter table public.unit_sale_customers
  add constraint unit_sale_customers_customer_id_fkey
  foreign key (customer_id) references public.customers(id) on delete cascade;
