-- Add missing UPDATE policies for BOQ tables (needed for inline editing)

drop policy if exists "boq_bills_update" on boq_bills;
drop policy if exists "boq_items_update" on boq_items;

create policy "boq_bills_update" on boq_bills for update to authenticated
  using (get_user_role() in ('developer','consultant'));

create policy "boq_items_update" on boq_items for update to authenticated
  using (get_user_role() in ('developer','consultant'));
