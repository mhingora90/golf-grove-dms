alter table public.crm_notifications
  alter column lead_id drop not null;

alter table public.crm_notifications
  add column if not exists customer_id uuid
    references public.customers(id) on delete cascade;

alter table public.crm_notifications
  drop constraint if exists crm_notifications_parent_xor;
alter table public.crm_notifications
  add constraint crm_notifications_parent_xor
    check ((lead_id is not null) <> (customer_id is not null));

create index if not exists crm_notifications_customer_idx
  on public.crm_notifications (customer_id) where customer_id is not null;

create or replace function public.fan_out_crm_notifications()
returns trigger
security definer
set search_path = public
language plpgsql as $$
declare
  v_actor_name    text;
  v_snippet       text;
  v_recipient     uuid;
  v_parent_author uuid;
begin
  v_actor_name := coalesce(new.author_name, 'Someone');
  v_snippet    := left(coalesce(new.body, ''), 140);

  if new.mentions is not null then
    foreach v_recipient in array new.mentions loop
      if v_recipient is not null and (new.author_id is null or v_recipient <> new.author_id) then
        insert into public.crm_notifications
          (user_id, type, lead_id, customer_id, activity_id, actor_id, actor_name, snippet)
        values
          (v_recipient, 'mention', new.lead_id, new.customer_id, new.id,
           new.author_id, v_actor_name, v_snippet)
        on conflict do nothing;
      end if;
    end loop;
  end if;

  if new.parent_id is not null then
    select author_id into v_parent_author
    from public.crm_lead_activities where id = new.parent_id;
    if v_parent_author is not null
       and (new.author_id is null or v_parent_author <> new.author_id)
       and not (v_parent_author = any(coalesce(new.mentions, array[]::uuid[])))
    then
      insert into public.crm_notifications
        (user_id, type, lead_id, customer_id, activity_id, actor_id, actor_name, snippet)
      values
        (v_parent_author, 'reply', new.lead_id, new.customer_id, new.id,
         new.author_id, v_actor_name, v_snippet);
    end if;
  end if;

  return new;
end $$;
