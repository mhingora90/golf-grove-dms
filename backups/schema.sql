


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."block_audit_log_mutations"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  raise exception
    'document_audit_log is immutable: % operations are not permitted', TG_OP;
end;
$$;


ALTER FUNCTION "public"."block_audit_log_mutations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fan_out_crm_notifications"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."fan_out_crm_notifications"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_auth_user_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT role FROM profiles WHERE id = auth.uid()
  $$;


ALTER FUNCTION "public"."get_auth_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;


ALTER FUNCTION "public"."get_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (id, email, full_name, role, company, requested_role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    'pending',
    coalesce(new.raw_user_meta_data->>'company', ''),
    new.raw_user_meta_data->>'requested_role'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_crm_access"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('sales', 'developer', 'admin')
  );
$$;


ALTER FUNCTION "public"."has_crm_access"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_customer_access"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$ select public.get_user_role() in ('admin','developer','sales') $$;


ALTER FUNCTION "public"."has_customer_access"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_app_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT is_app_admin FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$;


ALTER FUNCTION "public"."is_app_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_consultant"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT get_user_role() IN ('consultant', 'developer');
$$;


ALTER FUNCTION "public"."is_consultant"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_contractor"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT get_user_role() IN ('contractor', 'developer');
$$;


ALTER FUNCTION "public"."is_contractor"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_developer"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT get_user_role() = 'developer';
$$;


ALTER FUNCTION "public"."is_developer"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_policies"("p_table" "text") RETURNS TABLE("policyname" "text", "cmd" "text", "roles" "text"[], "qual" "text", "with_check" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select policyname::text, cmd::text, roles, qual::text, with_check::text
  from pg_policies
  where schemaname = 'public' and tablename = p_table
  order by policyname;
$$;


ALTER FUNCTION "public"."list_policies"("p_table" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_diagnostic"() RETURNS TABLE("tablename" "text", "rowsecurity" boolean, "policy_count" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select t.tablename::text, t.rowsecurity,
    (select count(*) from pg_policies p where p.tablename = t.tablename and p.schemaname = 'public') as policy_count
  from pg_tables t
  where t.schemaname = 'public'
    and t.tablename in ('submittals','drawings','ncrs','rfis','punch_list','method_statements',
                        'transmittals','correspondence','inspections','payment_certificates')
  order by t.tablename;
$$;


ALTER FUNCTION "public"."rls_diagnostic"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_customer_backfill"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."run_customer_backfill"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."run_customer_backfill"() IS 'Parses unit_sales.buyer_name on & / and (case-insensitive) and populates customers + unit_sale_customers. Idempotent.';



CREATE OR REPLACE FUNCTION "public"."sync_buyer_name_on_owner_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."sync_buyer_name_on_owner_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_project_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT project_id FROM project_users WHERE user_id = auth.uid();
$$;


ALTER FUNCTION "public"."user_project_ids"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."attachments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "record_type" "text" NOT NULL,
    "record_id" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_size" integer,
    "file_type" "text",
    "uploaded_by_name" "text",
    "uploaded_by_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."boq_bills" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bill_no" "text" NOT NULL,
    "title" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "contract_id" "uuid"
);


ALTER TABLE "public"."boq_bills" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."boq_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bill_id" "uuid" NOT NULL,
    "item_no" "text" NOT NULL,
    "description" "text" NOT NULL,
    "qty" numeric DEFAULT 0 NOT NULL,
    "unit" "text" DEFAULT ''::"text" NOT NULL,
    "rate" numeric DEFAULT 0 NOT NULL,
    "total" numeric DEFAULT 0 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."boq_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "record_type" "text" NOT NULL,
    "record_id" "uuid" NOT NULL,
    "author_name" "text",
    "author_role" "text",
    "message" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "content" "text"
);


ALTER TABLE "public"."comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contracts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "name" "text" DEFAULT 'Main Contract'::"text" NOT NULL,
    "contractor" "text",
    "contract_type" "text" DEFAULT 'main'::"text",
    "contract_value" numeric DEFAULT 0,
    "award_date" "date",
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "contracts_contract_type_check" CHECK (("contract_type" = ANY (ARRAY['main'::"text", 'enabling_works'::"text", 'specialist'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."contracts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."correspondence" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ref_no" "text" NOT NULL,
    "type" "text",
    "subject" "text" NOT NULL,
    "from_party" "text",
    "to_party" "text",
    "correspondence_date" "date",
    "due_date" "date",
    "body" "text",
    "status" "text" DEFAULT 'Open'::"text",
    "logged_by" "text",
    "closed_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL
);


ALTER TABLE "public"."correspondence" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_lead_activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid",
    "author_id" "uuid",
    "author_name" "text" NOT NULL,
    "method" "text" DEFAULT 'note'::"text" NOT NULL,
    "contacted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "due_at" timestamp with time zone,
    "completed" boolean DEFAULT false,
    "parent_id" "uuid",
    "assigned_to" "uuid",
    "assigned_to_name" "text",
    "mentions" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "customer_id" "uuid",
    CONSTRAINT "crm_activities_mentions_max_10" CHECK ((("array_length"("mentions", 1) IS NULL) OR ("array_length"("mentions", 1) <= 10))),
    CONSTRAINT "crm_activities_parent_xor" CHECK ((("lead_id" IS NOT NULL) <> ("customer_id" IS NOT NULL))),
    CONSTRAINT "crm_lead_activities_method_check" CHECK (("method" = ANY (ARRAY['call'::"text", 'whatsapp'::"text", 'email'::"text", 'sms'::"text", 'in_person'::"text", 'meeting'::"text", 'site_visit'::"text", 'note'::"text", 'task'::"text"])))
);


ALTER TABLE "public"."crm_lead_activities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text",
    "email" "text",
    "phone" "text",
    "source" "text" DEFAULT 'meta_ads'::"text",
    "stage" "text" DEFAULT 'new_lead'::"text",
    "assigned_to" "text",
    "meta_lead_id" "text",
    "meta_form_id" "text",
    "notes" "text",
    "last_contacted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "broker_type" "text",
    "budget_range" "text",
    "property_types" "text",
    "availability" "text",
    "company_name" "text",
    "first_name" "text",
    "created_time" "text",
    "ad_id" "text",
    "project_id" "uuid" NOT NULL,
    "rating" "text",
    "converted_unit_id" "uuid",
    "sync_key" "text" GENERATED ALWAYS AS (
CASE
    WHEN ("meta_lead_id" IS NOT NULL) THEN (("meta_lead_id" || '|'::"text") || COALESCE("lower"("email"), ''::"text"))
    ELSE NULL::"text"
END) STORED,
    CONSTRAINT "crm_leads_rating_check" CHECK (("rating" = ANY (ARRAY['hot'::"text", 'warm'::"text", 'cold'::"text"])))
);


ALTER TABLE "public"."crm_leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "lead_id" "uuid",
    "activity_id" "uuid" NOT NULL,
    "actor_id" "uuid",
    "actor_name" "text" NOT NULL,
    "snippet" "text" NOT NULL,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "customer_id" "uuid",
    CONSTRAINT "crm_notifications_parent_xor" CHECK ((("lead_id" IS NOT NULL) <> ("customer_id" IS NOT NULL))),
    CONSTRAINT "crm_notifications_type_check" CHECK (("type" = ANY (ARRAY['mention'::"text", 'reply'::"text"])))
);


ALTER TABLE "public"."crm_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "nationality" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "project_id" "uuid"
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."document_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "uuid" NOT NULL,
    "document_type" "text" NOT NULL,
    "action" "text" NOT NULL,
    "performed_by_name" "text" NOT NULL,
    "performed_by_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."document_audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drawing_revisions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "drawing_id" "uuid",
    "revision" "text" NOT NULL,
    "status" "text",
    "uploaded_by_name" "text",
    "uploaded_by_id" "uuid",
    "upload_date" timestamp with time zone DEFAULT "now"(),
    "approved_by_name" "text",
    "approved_by_id" "uuid",
    "approval_date" timestamp with time zone,
    "file_path" "text",
    "notes" "text",
    "review_comments" "text"
);


ALTER TABLE "public"."drawing_revisions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drawings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "drawing_no" "text" NOT NULL,
    "title" "text" NOT NULL,
    "discipline" "text",
    "revision" "text" DEFAULT 'Rev A'::"text",
    "status" "text" DEFAULT 'Under Review'::"text",
    "uploaded_by" "text",
    "file_path" "text",
    "superseded_revisions" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "poi_code" "text",
    "arfi" "text" DEFAULT 'AR'::"text",
    "related_drawings" "uuid"[] DEFAULT '{}'::"uuid"[],
    "cde_state" "text" DEFAULT 'WIP'::"text" NOT NULL,
    "originator" "text",
    "zone" "text",
    "level" "text",
    "doc_type" "text" DEFAULT 'DR'::"text" NOT NULL,
    "description" "text",
    "project_id" "uuid" NOT NULL
);


ALTER TABLE "public"."drawings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inspections" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "ref_no" "text" NOT NULL,
    "revision" "text" DEFAULT '00'::"text",
    "location" "text",
    "city" "text" DEFAULT 'Production City, Dubai, UAE'::"text",
    "subcontractor_id" "uuid",
    "rep" "text",
    "site_engineer" "text",
    "department" "jsonb" DEFAULT '{}'::"jsonb",
    "elements" "text",
    "inspection_time" "text" DEFAULT '8:00am'::"text",
    "inspection_date" "text",
    "request_date" "text",
    "status" "text" DEFAULT 'Pending'::"text",
    "comments" "text",
    "inspected_by" "text",
    "response_date" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "due_date" "date",
    "parent_ir_id" "uuid",
    "checklist" "jsonb",
    "checklist_notes" "text",
    "plot" "text",
    "arch" boolean DEFAULT false,
    "elec" boolean DEFAULT false,
    "fire" boolean DEFAULT false,
    "plumb" boolean DEFAULT false,
    "structural" boolean DEFAULT false,
    "mep" boolean DEFAULT false,
    "civil" boolean DEFAULT false,
    "project_id" "uuid" NOT NULL
);


ALTER TABLE "public"."inspections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."method_statements" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "ref_no" "text" NOT NULL,
    "title" "text" NOT NULL,
    "activity" "text",
    "location" "text",
    "discipline" "text",
    "submitted_by" "text",
    "submitted_date" "date",
    "status" "text" DEFAULT 'Pending Review'::"text",
    "reviewed_by" "text",
    "review_date" "date",
    "review_comments" "text",
    "revision" "text" DEFAULT 'Rev 0'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "outcome" "text",
    "project_id" "uuid" NOT NULL
);


ALTER TABLE "public"."method_statements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ncrs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "ref_no" "text" NOT NULL,
    "title" "text" NOT NULL,
    "location" "text",
    "raised_by" "text",
    "raised_date" "date" DEFAULT CURRENT_DATE,
    "severity" "text" DEFAULT 'Minor'::"text",
    "status" "text" DEFAULT 'Open'::"text",
    "cause" "text",
    "corrective_action" "text",
    "closed_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "closed_by" "text",
    "root_cause" "text",
    "linked_drawing" "text",
    "cap_submitted_date" "date",
    "cap_submitted_by" "text",
    "cap_responsible" "text",
    "cap_target_date" "date",
    "cap_verified_date" "date",
    "cap_verified_by" "text",
    "cap_verify_comments" "text",
    "project_id" "uuid" NOT NULL
);


ALTER TABLE "public"."ncrs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_certificate_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cert_id" "uuid" NOT NULL,
    "boq_item_id" "uuid" NOT NULL,
    "contractor_pct" numeric DEFAULT 0 NOT NULL,
    "contractor_amount" numeric DEFAULT 0 NOT NULL,
    "consultant_pct" numeric,
    "consultant_amount" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."payment_certificate_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_certificates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cert_no" integer NOT NULL,
    "ref_no" "text" NOT NULL,
    "status" "text" DEFAULT 'Draft'::"text" NOT NULL,
    "submitted_by_name" "text",
    "submitted_date" timestamp with time zone,
    "certified_by_name" "text",
    "certified_date" timestamp with time zone,
    "paid_date" "date",
    "payment_ref" "text",
    "retention_pct" numeric DEFAULT 10 NOT NULL,
    "advance_recovery" numeric DEFAULT 0 NOT NULL,
    "vat_pct" numeric DEFAULT 5 NOT NULL,
    "previously_paid" numeric DEFAULT 0 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "mobilisation_advance" numeric DEFAULT 0 NOT NULL,
    "value_of_works" numeric DEFAULT 0 NOT NULL,
    "pc_ps_adjustments" numeric DEFAULT 0 NOT NULL,
    "advance_recovery_pct" numeric DEFAULT 10 NOT NULL,
    "amount_paid" numeric(15,2) DEFAULT 0,
    "project_id" "uuid" NOT NULL,
    "contract_id" "uuid"
);


ALTER TABLE "public"."payment_certificates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_milestones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "unit_sale_id" "uuid" NOT NULL,
    "milestone_name" "text" NOT NULL,
    "amount" numeric NOT NULL,
    "pct_of_sale" numeric NOT NULL,
    "due_date" "date",
    "sort_order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."payment_milestones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "email" "text",
    "role" "text",
    "company" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "requested_role" "text",
    "is_app_admin" boolean DEFAULT false NOT NULL,
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['developer'::"text", 'sales'::"text", 'admin'::"text", 'consultant'::"text", 'contractor'::"text", 'subcontractor'::"text", 'pending'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."project_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."punch_list" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "description" "text" NOT NULL,
    "location" "text",
    "element" "text",
    "discipline" "text",
    "severity" "text" DEFAULT 'Minor'::"text",
    "assigned_to" "text",
    "raised_by" "text",
    "status" "text" DEFAULT 'Open'::"text",
    "contractor_response" "text",
    "closed_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL
);


ALTER TABLE "public"."punch_list" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rate_limit_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ip" "text" NOT NULL,
    "endpoint" "text" DEFAULT 'meta-lead'::"text" NOT NULL,
    "success" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."rate_limit_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rfis" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "ref_no" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "drawing_ref" "text",
    "raised_by" "text",
    "assigned_to" "text",
    "priority" "text" DEFAULT 'Normal'::"text",
    "due_date" "date",
    "status" "text" DEFAULT 'Open'::"text",
    "question" "text",
    "response" "text",
    "responded_by" "text",
    "responded_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "from_party" "text",
    "to_party" "text",
    "discipline" "text",
    "response_date" "date",
    "project_id" "uuid" NOT NULL
);


ALTER TABLE "public"."rfis" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subcontractors" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "rep" "text",
    "discipline" "text",
    "trade" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL
);


ALTER TABLE "public"."subcontractors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."submittal_register" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_no" "text",
    "spec_ref" "text",
    "title" "text" NOT NULL,
    "discipline" "text",
    "required_by" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL
);


ALTER TABLE "public"."submittal_register" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."submittals" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "ref_no" "text" NOT NULL,
    "revision" "text" DEFAULT 'Rev 000'::"text",
    "title" "text" NOT NULL,
    "from_party" "text",
    "to_party" "text",
    "submit_date" "date" DEFAULT CURRENT_DATE,
    "status" "text" DEFAULT 'Pending Review'::"text",
    "attachments" "jsonb" DEFAULT '{}'::"jsonb",
    "discipline" "jsonb" DEFAULT '{}'::"jsonb",
    "eng_comments" "text",
    "outcome" "text",
    "reviewed_by" "text",
    "review_date" "date",
    "subcontractor_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "parent_id" "uuid",
    "revision_no" integer DEFAULT 0,
    "due_date" "date",
    "related_drawing" "text",
    "changes_description" "text",
    "arfi" "text" DEFAULT 'AR'::"text",
    "samples" boolean DEFAULT false,
    "brochure" boolean DEFAULT false,
    "sketches" boolean DEFAULT false,
    "others" boolean DEFAULT false,
    "civil" boolean DEFAULT false,
    "mech" boolean DEFAULT false,
    "elv" boolean DEFAULT false,
    "specs" boolean DEFAULT false,
    "arch" boolean DEFAULT false,
    "elec" boolean DEFAULT false,
    "project_id" "uuid" NOT NULL
);


ALTER TABLE "public"."submittals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transmittals" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "ref_no" "text" NOT NULL,
    "from_party" "text",
    "to_party" "text",
    "transmit_date" "date" DEFAULT CURRENT_DATE,
    "method" "text" DEFAULT 'Email'::"text",
    "purpose" "text",
    "documents" "jsonb" DEFAULT '[]'::"jsonb",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "response_required" "date",
    "acknowledged_by" "text",
    "acknowledged_at" timestamp with time zone,
    "project_id" "uuid" NOT NULL
);


ALTER TABLE "public"."transmittals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."unit_sale_customers" (
    "unit_sale_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "ownership_pct" numeric
);


ALTER TABLE "public"."unit_sale_customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."unit_sales" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "unit_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'reserved'::"text" NOT NULL,
    "buyer_name" "text",
    "sale_date" "date",
    "sold_price" numeric,
    "discount_amount" numeric DEFAULT 0,
    "commission_pct" numeric DEFAULT 0,
    "broker_name" "text",
    "brokerage_name" "text",
    "spa_status" "text" DEFAULT 'not_signed'::"text",
    "spa_date" "date",
    "oqood_status" "text" DEFAULT 'not_registered'::"text",
    "oqood_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "unit_sales_oqood_status_check" CHECK (("oqood_status" = ANY (ARRAY['not_registered'::"text", 'registered'::"text"]))),
    CONSTRAINT "unit_sales_spa_status_check" CHECK (("spa_status" = ANY (ARRAY['not_signed'::"text", 'signed_buyer'::"text", 'fully_signed'::"text"]))),
    CONSTRAINT "unit_sales_status_check" CHECK (("status" = ANY (ARRAY['reserved'::"text", 'sold'::"text", 'blocked_by_developer'::"text"])))
);


ALTER TABLE "public"."unit_sales" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."units" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "unit_no" "text" NOT NULL,
    "floor" integer NOT NULL,
    "unit_type" "text" NOT NULL,
    "area_sqft" numeric NOT NULL,
    "listed_price" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid" NOT NULL,
    "blocked" boolean DEFAULT false NOT NULL,
    "sale_status" "text" DEFAULT 'available'::"text" NOT NULL,
    CONSTRAINT "units_sale_status_check" CHECK (("sale_status" = ANY (ARRAY['available'::"text", 'sold'::"text", 'blocked_by_developer'::"text"])))
);


ALTER TABLE "public"."units" OWNER TO "postgres";


ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."boq_bills"
    ADD CONSTRAINT "boq_bills_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."boq_items"
    ADD CONSTRAINT "boq_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."correspondence"
    ADD CONSTRAINT "correspondence_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_lead_activities"
    ADD CONSTRAINT "crm_lead_activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_leads"
    ADD CONSTRAINT "crm_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_notifications"
    ADD CONSTRAINT "crm_notifications_mention_unique" UNIQUE ("user_id", "activity_id", "type");



ALTER TABLE ONLY "public"."crm_notifications"
    ADD CONSTRAINT "crm_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_audit_log"
    ADD CONSTRAINT "document_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drawing_revisions"
    ADD CONSTRAINT "drawing_revisions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drawings"
    ADD CONSTRAINT "drawings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."method_statements"
    ADD CONSTRAINT "method_statements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ncrs"
    ADD CONSTRAINT "ncrs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_certificate_items"
    ADD CONSTRAINT "payment_certificate_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_certificates"
    ADD CONSTRAINT "payment_certificates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_milestones"
    ADD CONSTRAINT "payment_milestones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_users"
    ADD CONSTRAINT "project_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_users"
    ADD CONSTRAINT "project_users_project_id_user_id_key" UNIQUE ("project_id", "user_id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."punch_list"
    ADD CONSTRAINT "punch_list_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rate_limit_events"
    ADD CONSTRAINT "rate_limit_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rfis"
    ADD CONSTRAINT "rfis_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subcontractors"
    ADD CONSTRAINT "subcontractors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."submittal_register"
    ADD CONSTRAINT "submittal_register_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."submittals"
    ADD CONSTRAINT "submittals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transmittals"
    ADD CONSTRAINT "transmittals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."unit_sale_customers"
    ADD CONSTRAINT "unit_sale_customers_pkey" PRIMARY KEY ("unit_sale_id", "customer_id");



ALTER TABLE ONLY "public"."unit_sales"
    ADD CONSTRAINT "unit_sales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."unit_sales"
    ADD CONSTRAINT "unit_sales_unit_id_key" UNIQUE ("unit_id");



ALTER TABLE ONLY "public"."units"
    ADD CONSTRAINT "units_pkey" PRIMARY KEY ("id");



CREATE INDEX "crm_activities_customer_idx" ON "public"."crm_lead_activities" USING "btree" ("customer_id", "contacted_at" DESC) WHERE ("customer_id" IS NOT NULL);



CREATE UNIQUE INDEX "crm_leads_project_sync_key_idx" ON "public"."crm_leads" USING "btree" ("project_id", "sync_key");



CREATE INDEX "crm_notifications_activity_idx" ON "public"."crm_notifications" USING "btree" ("activity_id");



CREATE INDEX "crm_notifications_customer_idx" ON "public"."crm_notifications" USING "btree" ("customer_id") WHERE ("customer_id" IS NOT NULL);



CREATE INDEX "crm_notifications_user_unread_idx" ON "public"."crm_notifications" USING "btree" ("user_id", "read_at" NULLS FIRST, "created_at" DESC);



CREATE INDEX "customers_email_idx" ON "public"."customers" USING "btree" ("lower"("email"));



CREATE INDEX "customers_name_idx" ON "public"."customers" USING "btree" ("lower"("name"));



CREATE INDEX "customers_phone_idx" ON "public"."customers" USING "btree" ("phone");



CREATE INDEX "customers_project_id_idx" ON "public"."customers" USING "btree" ("project_id");



CREATE INDEX "idx_project_users_user_id" ON "public"."project_users" USING "btree" ("user_id");



CREATE INDEX "rate_limit_events_ip_created_at" ON "public"."rate_limit_events" USING "btree" ("ip", "created_at");



CREATE UNIQUE INDEX "unit_sale_customers_one_primary" ON "public"."unit_sale_customers" USING "btree" ("unit_sale_id") WHERE "is_primary";



CREATE UNIQUE INDEX "units_unit_no_project_id_key" ON "public"."units" USING "btree" ("unit_no", "project_id");



CREATE OR REPLACE TRIGGER "audit_log_block_delete" BEFORE DELETE ON "public"."document_audit_log" FOR EACH ROW EXECUTE FUNCTION "public"."block_audit_log_mutations"();



CREATE OR REPLACE TRIGGER "audit_log_block_update" BEFORE UPDATE ON "public"."document_audit_log" FOR EACH ROW EXECUTE FUNCTION "public"."block_audit_log_mutations"();



CREATE OR REPLACE TRIGGER "trg_fan_out_crm_notifications" AFTER INSERT ON "public"."crm_lead_activities" FOR EACH ROW EXECUTE FUNCTION "public"."fan_out_crm_notifications"();



CREATE OR REPLACE TRIGGER "trg_sync_buyer_name_on_owner_delete" AFTER DELETE ON "public"."unit_sale_customers" FOR EACH ROW EXECUTE FUNCTION "public"."sync_buyer_name_on_owner_delete"();



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."boq_bills"
    ADD CONSTRAINT "boq_bills_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."boq_bills"
    ADD CONSTRAINT "boq_bills_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."boq_items"
    ADD CONSTRAINT "boq_items_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "public"."boq_bills"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."correspondence"
    ADD CONSTRAINT "correspondence_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_lead_activities"
    ADD CONSTRAINT "crm_lead_activities_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_lead_activities"
    ADD CONSTRAINT "crm_lead_activities_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."crm_lead_activities"
    ADD CONSTRAINT "crm_lead_activities_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_lead_activities"
    ADD CONSTRAINT "crm_lead_activities_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_lead_activities"
    ADD CONSTRAINT "crm_lead_activities_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."crm_lead_activities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_leads"
    ADD CONSTRAINT "crm_leads_converted_unit_id_fkey" FOREIGN KEY ("converted_unit_id") REFERENCES "public"."units"("id");



ALTER TABLE ONLY "public"."crm_leads"
    ADD CONSTRAINT "crm_leads_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_notifications"
    ADD CONSTRAINT "crm_notifications_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."crm_lead_activities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_notifications"
    ADD CONSTRAINT "crm_notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_notifications"
    ADD CONSTRAINT "crm_notifications_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_notifications"
    ADD CONSTRAINT "crm_notifications_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_notifications"
    ADD CONSTRAINT "crm_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."document_audit_log"
    ADD CONSTRAINT "document_audit_log_performed_by_id_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."drawing_revisions"
    ADD CONSTRAINT "drawing_revisions_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."drawing_revisions"
    ADD CONSTRAINT "drawing_revisions_drawing_id_fkey" FOREIGN KEY ("drawing_id") REFERENCES "public"."drawings"("id");



ALTER TABLE ONLY "public"."drawing_revisions"
    ADD CONSTRAINT "drawing_revisions_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."drawings"
    ADD CONSTRAINT "drawings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_parent_ir_id_fkey" FOREIGN KEY ("parent_ir_id") REFERENCES "public"."inspections"("id");



ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_subcontractor_id_fkey" FOREIGN KEY ("subcontractor_id") REFERENCES "public"."subcontractors"("id");



ALTER TABLE ONLY "public"."method_statements"
    ADD CONSTRAINT "method_statements_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ncrs"
    ADD CONSTRAINT "ncrs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_certificate_items"
    ADD CONSTRAINT "payment_certificate_items_boq_item_id_fkey" FOREIGN KEY ("boq_item_id") REFERENCES "public"."boq_items"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payment_certificate_items"
    ADD CONSTRAINT "payment_certificate_items_cert_id_fkey" FOREIGN KEY ("cert_id") REFERENCES "public"."payment_certificates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_certificates"
    ADD CONSTRAINT "payment_certificates_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id");



ALTER TABLE ONLY "public"."payment_certificates"
    ADD CONSTRAINT "payment_certificates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_milestones"
    ADD CONSTRAINT "payment_milestones_unit_sale_id_fkey" FOREIGN KEY ("unit_sale_id") REFERENCES "public"."unit_sales"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."project_users"
    ADD CONSTRAINT "project_users_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_users"
    ADD CONSTRAINT "project_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."punch_list"
    ADD CONSTRAINT "punch_list_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rfis"
    ADD CONSTRAINT "rfis_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subcontractors"
    ADD CONSTRAINT "subcontractors_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."submittal_register"
    ADD CONSTRAINT "submittal_register_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."submittals"
    ADD CONSTRAINT "submittals_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."submittals"("id");



ALTER TABLE ONLY "public"."submittals"
    ADD CONSTRAINT "submittals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."submittals"
    ADD CONSTRAINT "submittals_subcontractor_id_fkey" FOREIGN KEY ("subcontractor_id") REFERENCES "public"."subcontractors"("id");



ALTER TABLE ONLY "public"."transmittals"
    ADD CONSTRAINT "transmittals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."unit_sale_customers"
    ADD CONSTRAINT "unit_sale_customers_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."unit_sale_customers"
    ADD CONSTRAINT "unit_sale_customers_unit_sale_id_fkey" FOREIGN KEY ("unit_sale_id") REFERENCES "public"."unit_sales"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."unit_sales"
    ADD CONSTRAINT "unit_sales_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."units"
    ADD CONSTRAINT "units_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



CREATE POLICY "Audit logs are insert-only" ON "public"."document_audit_log" FOR INSERT WITH CHECK (true);



CREATE POLICY "Audit logs are read-only" ON "public"."document_audit_log" FOR SELECT USING (true);



ALTER TABLE "public"."attachments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attachments: authenticated read all" ON "public"."attachments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "attachments: developer deletes" ON "public"."attachments" FOR DELETE TO "authenticated" USING (("public"."get_user_role"() = 'developer'::"text"));



CREATE POLICY "attachments: upload roles insert" ON "public"."attachments" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text", 'contractor'::"text"])));



CREATE POLICY "audit_log_insert_app" ON "public"."document_audit_log" FOR INSERT WITH CHECK (true);



CREATE POLICY "audit_log_read_all" ON "public"."document_audit_log" FOR SELECT USING (true);



ALTER TABLE "public"."boq_bills" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "boq_bills_delete" ON "public"."boq_bills" FOR DELETE TO "authenticated" USING (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "boq_bills_insert" ON "public"."boq_bills" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "boq_bills_select" ON "public"."boq_bills" FOR SELECT TO "authenticated" USING (("public"."is_developer"() OR (("auth"."uid"() IS NOT NULL) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "boq_bills_update" ON "public"."boq_bills" FOR UPDATE TO "authenticated" USING (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids"))))) WITH CHECK (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



ALTER TABLE "public"."boq_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "boq_items_delete" ON "public"."boq_items" FOR DELETE TO "authenticated" USING ((("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"])) AND (EXISTS ( SELECT 1
   FROM ("public"."boq_bills" "bb"
     JOIN "public"."project_users" "pu" ON (("pu"."project_id" = "bb"."project_id")))
  WHERE (("bb"."id" = "boq_items"."bill_id") AND ("pu"."user_id" = "auth"."uid"()))))));



CREATE POLICY "boq_items_insert" ON "public"."boq_items" FOR INSERT TO "authenticated" WITH CHECK ((("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"])) AND (EXISTS ( SELECT 1
   FROM ("public"."boq_bills" "bb"
     JOIN "public"."project_users" "pu" ON (("pu"."project_id" = "bb"."project_id")))
  WHERE (("bb"."id" = "boq_items"."bill_id") AND ("pu"."user_id" = "auth"."uid"()))))));



CREATE POLICY "boq_items_select" ON "public"."boq_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."boq_bills" "bb"
     JOIN "public"."project_users" "pu" ON (("pu"."project_id" = "bb"."project_id")))
  WHERE (("bb"."id" = "boq_items"."bill_id") AND ("pu"."user_id" = "auth"."uid"())))));



CREATE POLICY "boq_items_update" ON "public"."boq_items" FOR UPDATE TO "authenticated" USING ((("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"])) AND (EXISTS ( SELECT 1
   FROM ("public"."boq_bills" "bb"
     JOIN "public"."project_users" "pu" ON (("pu"."project_id" = "bb"."project_id")))
  WHERE (("bb"."id" = "boq_items"."bill_id") AND ("pu"."user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "comments: all authenticated insert" ON "public"."comments" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "comments: authenticated read all" ON "public"."comments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "comments: developer deletes" ON "public"."comments" FOR DELETE TO "authenticated" USING (("public"."get_user_role"() = 'developer'::"text"));



CREATE POLICY "comments: developer updates" ON "public"."comments" FOR UPDATE TO "authenticated" USING (("public"."get_user_role"() = 'developer'::"text")) WITH CHECK (("public"."get_user_role"() = 'developer'::"text"));



ALTER TABLE "public"."contracts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contracts_select" ON "public"."contracts" FOR SELECT USING (true);



CREATE POLICY "contracts_write" ON "public"."contracts" USING (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"]))) WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"])));



ALTER TABLE "public"."correspondence" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "correspondence: authenticated read all" ON "public"."correspondence" FOR SELECT TO "authenticated" USING (("public"."is_developer"() OR (("auth"."uid"() IS NOT NULL) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "correspondence: developer deletes" ON "public"."correspondence" FOR DELETE TO "authenticated" USING (("public"."is_developer"() OR (("public"."get_user_role"() = 'developer'::"text") AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "correspondence: raise roles insert" ON "public"."correspondence" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "correspondence: raise roles update" ON "public"."correspondence" FOR UPDATE TO "authenticated" USING (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids"))))) WITH CHECK (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "crm_act_delete" ON "public"."crm_lead_activities" FOR DELETE TO "authenticated" USING (((("lead_id" IS NOT NULL) AND "public"."has_crm_access"()) OR (("customer_id" IS NOT NULL) AND "public"."has_customer_access"())));



CREATE POLICY "crm_act_insert" ON "public"."crm_lead_activities" FOR INSERT TO "authenticated" WITH CHECK (((("lead_id" IS NOT NULL) AND "public"."has_crm_access"()) OR (("customer_id" IS NOT NULL) AND "public"."has_customer_access"())));



CREATE POLICY "crm_act_read" ON "public"."crm_lead_activities" FOR SELECT TO "authenticated" USING (((("lead_id" IS NOT NULL) AND "public"."has_crm_access"()) OR (("customer_id" IS NOT NULL) AND "public"."has_customer_access"())));



CREATE POLICY "crm_act_update" ON "public"."crm_lead_activities" FOR UPDATE TO "authenticated" USING (((("lead_id" IS NOT NULL) AND "public"."has_crm_access"()) OR (("customer_id" IS NOT NULL) AND "public"."has_customer_access"()))) WITH CHECK (((("lead_id" IS NOT NULL) AND "public"."has_crm_access"()) OR (("customer_id" IS NOT NULL) AND "public"."has_customer_access"())));



ALTER TABLE "public"."crm_lead_activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_leads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "crm_leads_anon_insert" ON "public"."crm_leads" FOR INSERT TO "anon" WITH CHECK (("source" = 'meta_ads'::"text"));



CREATE POLICY "crm_leads_delete" ON "public"."crm_leads" FOR DELETE USING (("public"."is_developer"() OR ("public"."has_crm_access"() AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "crm_leads_insert" ON "public"."crm_leads" FOR INSERT WITH CHECK (("public"."is_developer"() OR ("public"."has_crm_access"() AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "crm_leads_read" ON "public"."crm_leads" FOR SELECT USING (("public"."is_developer"() OR ("public"."has_crm_access"() AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "crm_leads_update" ON "public"."crm_leads" FOR UPDATE USING (("public"."is_developer"() OR ("public"."has_crm_access"() AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



ALTER TABLE "public"."crm_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customers: delete" ON "public"."customers" FOR DELETE TO "authenticated" USING ("public"."has_customer_access"());



CREATE POLICY "customers: insert" ON "public"."customers" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_customer_access"());



CREATE POLICY "customers: select" ON "public"."customers" FOR SELECT TO "authenticated" USING ("public"."has_customer_access"());



CREATE POLICY "customers: update" ON "public"."customers" FOR UPDATE TO "authenticated" USING ("public"."has_customer_access"()) WITH CHECK ("public"."has_customer_access"());



ALTER TABLE "public"."document_audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "document_audit_log: all authenticated insert" ON "public"."document_audit_log" FOR INSERT TO "authenticated" WITH CHECK (true);



ALTER TABLE "public"."drawing_revisions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "drawing_revisions: approve roles update" ON "public"."drawing_revisions" FOR UPDATE TO "authenticated" USING (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"]))) WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"])));



CREATE POLICY "drawing_revisions: authenticated read all" ON "public"."drawing_revisions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "drawing_revisions: developer deletes" ON "public"."drawing_revisions" FOR DELETE TO "authenticated" USING (("public"."get_user_role"() = 'developer'::"text"));



CREATE POLICY "drawing_revisions: upload roles insert" ON "public"."drawing_revisions" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text", 'contractor'::"text"])));



ALTER TABLE "public"."drawings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "drawings: approve roles update" ON "public"."drawings" FOR UPDATE TO "authenticated" USING (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids"))))) WITH CHECK (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "drawings: authenticated read all" ON "public"."drawings" FOR SELECT TO "authenticated" USING (("public"."is_developer"() OR (("auth"."uid"() IS NOT NULL) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "drawings: developer deletes" ON "public"."drawings" FOR DELETE TO "authenticated" USING (("public"."is_developer"() OR (("public"."get_user_role"() = 'developer'::"text") AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "drawings: upload roles insert" ON "public"."drawings" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text", 'contractor'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



ALTER TABLE "public"."inspections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inspections: approve roles update" ON "public"."inspections" FOR UPDATE TO "authenticated" USING (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids"))))) WITH CHECK (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "inspections: authenticated read all" ON "public"."inspections" FOR SELECT TO "authenticated" USING (("public"."is_developer"() OR (("auth"."uid"() IS NOT NULL) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "inspections: contractor edits pending" ON "public"."inspections" FOR UPDATE TO "authenticated" USING ((("public"."get_user_role"() = 'contractor'::"text") AND ("status" = 'Pending'::"text") AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))) WITH CHECK ((("public"."get_user_role"() = 'contractor'::"text") AND ("status" = 'Pending'::"text") AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids"))));



CREATE POLICY "inspections: developer deletes" ON "public"."inspections" FOR DELETE TO "authenticated" USING (("public"."is_developer"() OR (("public"."get_user_role"() = 'developer'::"text") AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "inspections: raise roles insert" ON "public"."inspections" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text", 'contractor'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



ALTER TABLE "public"."method_statements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "method_statements: all authenticated insert" ON "public"."method_statements" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_developer"() OR ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids"))));



CREATE POLICY "method_statements: approve roles update" ON "public"."method_statements" FOR UPDATE TO "authenticated" USING (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids"))))) WITH CHECK (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "method_statements: authenticated read all" ON "public"."method_statements" FOR SELECT TO "authenticated" USING (("public"."is_developer"() OR (("auth"."uid"() IS NOT NULL) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "method_statements: developer deletes" ON "public"."method_statements" FOR DELETE TO "authenticated" USING (("public"."is_developer"() OR (("public"."get_user_role"() = 'developer'::"text") AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "method_statements: submitters edit pending" ON "public"."method_statements" FOR UPDATE TO "authenticated" USING ((("public"."get_user_role"() = ANY (ARRAY['contractor'::"text", 'subcontractor'::"text"])) AND ("status" = 'Pending Review'::"text") AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))) WITH CHECK ((("public"."get_user_role"() = ANY (ARRAY['contractor'::"text", 'subcontractor'::"text"])) AND ("status" = 'Pending Review'::"text") AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids"))));



ALTER TABLE "public"."ncrs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ncrs: authenticated read all" ON "public"."ncrs" FOR SELECT TO "authenticated" USING (("public"."is_developer"() OR (("auth"."uid"() IS NOT NULL) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "ncrs: contractor submits CAP" ON "public"."ncrs" FOR UPDATE TO "authenticated" USING ((("public"."get_user_role"() = 'contractor'::"text") AND ("status" = 'Open'::"text") AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))) WITH CHECK ((("public"."get_user_role"() = 'contractor'::"text") AND ("status" = 'CAP Submitted'::"text") AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids"))));



CREATE POLICY "ncrs: developer deletes" ON "public"."ncrs" FOR DELETE TO "authenticated" USING (("public"."is_developer"() OR (("public"."get_user_role"() = 'developer'::"text") AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "ncrs: raise roles insert" ON "public"."ncrs" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "ncrs: raise roles update" ON "public"."ncrs" FOR UPDATE TO "authenticated" USING (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids"))))) WITH CHECK (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "own notifications: select" ON "public"."crm_notifications" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "own notifications: update read_at" ON "public"."crm_notifications" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "payment_cert_items_delete" ON "public"."payment_certificate_items" FOR DELETE TO "authenticated" USING ((("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'contractor'::"text"])) AND (EXISTS ( SELECT 1
   FROM ("public"."payment_certificates" "pc"
     JOIN "public"."project_users" "pu" ON (("pu"."project_id" = "pc"."project_id")))
  WHERE (("pc"."id" = "payment_certificate_items"."cert_id") AND ("pu"."user_id" = "auth"."uid"()))))));



CREATE POLICY "payment_cert_items_insert" ON "public"."payment_certificate_items" FOR INSERT TO "authenticated" WITH CHECK ((("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'contractor'::"text"])) AND (EXISTS ( SELECT 1
   FROM ("public"."payment_certificates" "pc"
     JOIN "public"."project_users" "pu" ON (("pu"."project_id" = "pc"."project_id")))
  WHERE (("pc"."id" = "payment_certificate_items"."cert_id") AND ("pu"."user_id" = "auth"."uid"()))))));



CREATE POLICY "payment_cert_items_select" ON "public"."payment_certificate_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."payment_certificates" "pc"
     JOIN "public"."project_users" "pu" ON (("pu"."project_id" = "pc"."project_id")))
  WHERE (("pc"."id" = "payment_certificate_items"."cert_id") AND ("pu"."user_id" = "auth"."uid"())))));



CREATE POLICY "payment_cert_items_update" ON "public"."payment_certificate_items" FOR UPDATE TO "authenticated" USING ((("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text", 'contractor'::"text"])) AND (EXISTS ( SELECT 1
   FROM ("public"."payment_certificates" "pc"
     JOIN "public"."project_users" "pu" ON (("pu"."project_id" = "pc"."project_id")))
  WHERE (("pc"."id" = "payment_certificate_items"."cert_id") AND ("pu"."user_id" = "auth"."uid"()))))));



CREATE POLICY "payment_cert_items_update_consultant" ON "public"."payment_certificate_items" FOR UPDATE TO "authenticated" USING ((("public"."get_user_role"() = 'consultant'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."payment_certificates" "pc"
  WHERE (("pc"."id" = "payment_certificate_items"."cert_id") AND ("pc"."status" = ANY (ARRAY['Under Review'::"text", 'Certified'::"text"]))))))) WITH CHECK ((("public"."get_user_role"() = 'consultant'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."payment_certificates" "pc"
  WHERE (("pc"."id" = "payment_certificate_items"."cert_id") AND ("pc"."status" = ANY (ARRAY['Under Review'::"text", 'Certified'::"text"])))))));



CREATE POLICY "payment_cert_items_update_contractor" ON "public"."payment_certificate_items" FOR UPDATE TO "authenticated" USING ((("public"."get_user_role"() = 'contractor'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."payment_certificates" "pc"
  WHERE (("pc"."id" = "payment_certificate_items"."cert_id") AND ("pc"."status" = ANY (ARRAY['Draft'::"text", 'Submitted'::"text"]))))))) WITH CHECK ((("public"."get_user_role"() = 'contractor'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."payment_certificates" "pc"
  WHERE (("pc"."id" = "payment_certificate_items"."cert_id") AND ("pc"."status" = ANY (ARRAY['Draft'::"text", 'Submitted'::"text"])))))));



CREATE POLICY "payment_cert_items_update_developer" ON "public"."payment_certificate_items" FOR UPDATE TO "authenticated" USING (("public"."get_user_role"() = 'developer'::"text")) WITH CHECK (("public"."get_user_role"() = 'developer'::"text"));



ALTER TABLE "public"."payment_certificate_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_certificates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_certs_delete" ON "public"."payment_certificates" FOR DELETE TO "authenticated" USING (("public"."is_developer"() OR (("public"."get_user_role"() = 'developer'::"text") AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids"))) OR (("public"."get_user_role"() = 'contractor'::"text") AND ("status" = 'Draft'::"text") AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "payment_certs_insert" ON "public"."payment_certificates" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'contractor'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "payment_certs_select" ON "public"."payment_certificates" FOR SELECT TO "authenticated" USING (("public"."is_developer"() OR (("auth"."uid"() IS NOT NULL) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "payment_certs_update_consultant" ON "public"."payment_certificates" FOR UPDATE TO "authenticated" USING ((("public"."get_user_role"() = 'consultant'::"text") AND ("status" = ANY (ARRAY['Submitted'::"text", 'Under Review'::"text", 'Certified'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))) WITH CHECK ((("public"."get_user_role"() = 'consultant'::"text") AND ("status" = ANY (ARRAY['Submitted'::"text", 'Under Review'::"text", 'Certified'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids"))));



CREATE POLICY "payment_certs_update_contractor" ON "public"."payment_certificates" FOR UPDATE TO "authenticated" USING ((("public"."get_user_role"() = 'contractor'::"text") AND ("status" = ANY (ARRAY['Draft'::"text", 'Submitted'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))) WITH CHECK ((("public"."get_user_role"() = 'contractor'::"text") AND ("status" = ANY (ARRAY['Draft'::"text", 'Submitted'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids"))));



CREATE POLICY "payment_certs_update_developer" ON "public"."payment_certificates" FOR UPDATE TO "authenticated" USING (("public"."is_developer"() OR (("public"."get_user_role"() = 'developer'::"text") AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids"))))) WITH CHECK (("public"."is_developer"() OR (("public"."get_user_role"() = 'developer'::"text") AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



ALTER TABLE "public"."payment_milestones" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_milestones: developer delete" ON "public"."payment_milestones" FOR DELETE TO "authenticated" USING (("public"."get_user_role"() = 'developer'::"text"));



CREATE POLICY "payment_milestones: developer insert" ON "public"."payment_milestones" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_user_role"() = 'developer'::"text"));



CREATE POLICY "payment_milestones: developer select" ON "public"."payment_milestones" FOR SELECT TO "authenticated" USING (("public"."get_user_role"() = 'developer'::"text"));



CREATE POLICY "payment_milestones: developer update" ON "public"."payment_milestones" FOR UPDATE TO "authenticated" USING (("public"."get_user_role"() = 'developer'::"text")) WITH CHECK (("public"."get_user_role"() = 'developer'::"text"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles: admin updates any profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ("public"."is_app_admin"()) WITH CHECK ("public"."is_app_admin"());



CREATE POLICY "profiles: authenticated read all" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "profiles: developer deletes any profile" ON "public"."profiles" FOR DELETE TO "authenticated" USING ((("public"."get_user_role"() = 'developer'::"text") OR "public"."is_app_admin"()));



CREATE POLICY "profiles: user inserts own row" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "profiles: user updates own non-role fields" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "id") AND ("public"."get_user_role"() <> 'developer'::"text"))) WITH CHECK ((("auth"."uid"() = "id") AND ("role" = "public"."get_user_role"())));



ALTER TABLE "public"."project_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_users_delete" ON "public"."project_users" FOR DELETE USING ("public"."is_developer"());



CREATE POLICY "project_users_insert" ON "public"."project_users" FOR INSERT WITH CHECK (("public"."is_developer"() OR "public"."is_app_admin"()));



CREATE POLICY "project_users_select" ON "public"."project_users" FOR SELECT USING (("public"."is_developer"() OR ("user_id" = "auth"."uid"())));



ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "projects_delete" ON "public"."projects" FOR DELETE USING ("public"."is_developer"());



CREATE POLICY "projects_insert" ON "public"."projects" FOR INSERT WITH CHECK ("public"."is_developer"());



CREATE POLICY "projects_select" ON "public"."projects" FOR SELECT USING (("public"."is_developer"() OR ("id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids"))));



CREATE POLICY "projects_update" ON "public"."projects" FOR UPDATE USING ("public"."is_developer"());



ALTER TABLE "public"."punch_list" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "punch_list: authenticated read all" ON "public"."punch_list" FOR SELECT TO "authenticated" USING (("public"."is_developer"() OR (("auth"."uid"() IS NOT NULL) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "punch_list: contractor responds" ON "public"."punch_list" FOR UPDATE TO "authenticated" USING ((("public"."get_user_role"() = 'contractor'::"text") AND ("status" = ANY (ARRAY['Open'::"text", 'In Progress'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))) WITH CHECK ((("public"."get_user_role"() = 'contractor'::"text") AND ("status" = ANY (ARRAY['Open'::"text", 'In Progress'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids"))));



CREATE POLICY "punch_list: developer deletes" ON "public"."punch_list" FOR DELETE TO "authenticated" USING (("public"."is_developer"() OR (("public"."get_user_role"() = 'developer'::"text") AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "punch_list: raise roles insert" ON "public"."punch_list" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "punch_list: raise roles update" ON "public"."punch_list" FOR UPDATE TO "authenticated" USING (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids"))))) WITH CHECK (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



ALTER TABLE "public"."rate_limit_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rfis" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rfis: all authenticated insert" ON "public"."rfis" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_developer"() OR ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids"))));



CREATE POLICY "rfis: approve roles update" ON "public"."rfis" FOR UPDATE TO "authenticated" USING (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids"))))) WITH CHECK (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "rfis: authenticated read all" ON "public"."rfis" FOR SELECT TO "authenticated" USING (("public"."is_developer"() OR (("auth"."uid"() IS NOT NULL) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "rfis: developer deletes" ON "public"."rfis" FOR DELETE TO "authenticated" USING (("public"."is_developer"() OR (("public"."get_user_role"() = 'developer'::"text") AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "rfis: submitters edit open rfis" ON "public"."rfis" FOR UPDATE TO "authenticated" USING ((("public"."get_user_role"() = ANY (ARRAY['contractor'::"text", 'subcontractor'::"text"])) AND ("status" = 'Open'::"text") AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))) WITH CHECK ((("public"."get_user_role"() = ANY (ARRAY['contractor'::"text", 'subcontractor'::"text"])) AND ("status" = 'Open'::"text") AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids"))));



ALTER TABLE "public"."subcontractors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "subcontractors: authenticated read all" ON "public"."subcontractors" FOR SELECT TO "authenticated" USING (("public"."is_developer"() OR (("auth"."uid"() IS NOT NULL) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "subcontractors: developer deletes" ON "public"."subcontractors" FOR DELETE TO "authenticated" USING (("public"."is_developer"() OR (("public"."get_user_role"() = 'developer'::"text") AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "subcontractors: manage roles insert" ON "public"."subcontractors" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'contractor'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "subcontractors: manage roles update" ON "public"."subcontractors" FOR UPDATE TO "authenticated" USING (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'contractor'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids"))))) WITH CHECK (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'contractor'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



ALTER TABLE "public"."submittal_register" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "submittal_register: authenticated read all" ON "public"."submittal_register" FOR SELECT TO "authenticated" USING (("public"."is_developer"() OR (("auth"."uid"() IS NOT NULL) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "submittal_register: developer deletes" ON "public"."submittal_register" FOR DELETE TO "authenticated" USING (("public"."is_developer"() OR (("public"."get_user_role"() = 'developer'::"text") AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "submittal_register: manage roles insert" ON "public"."submittal_register" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "submittal_register: manage roles update" ON "public"."submittal_register" FOR UPDATE TO "authenticated" USING (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids"))))) WITH CHECK (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



ALTER TABLE "public"."submittals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "submittals: all authenticated insert" ON "public"."submittals" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_developer"() OR ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids"))));



CREATE POLICY "submittals: approve roles update" ON "public"."submittals" FOR UPDATE TO "authenticated" USING (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids"))))) WITH CHECK (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "submittals: authenticated read all" ON "public"."submittals" FOR SELECT TO "authenticated" USING (("public"."is_developer"() OR (("auth"."uid"() IS NOT NULL) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "submittals: developer deletes" ON "public"."submittals" FOR DELETE TO "authenticated" USING (("public"."is_developer"() OR (("public"."get_user_role"() = 'developer'::"text") AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "submittals: submitters edit pending" ON "public"."submittals" FOR UPDATE TO "authenticated" USING ((("public"."get_user_role"() = ANY (ARRAY['contractor'::"text", 'subcontractor'::"text"])) AND ("status" = 'Pending Review'::"text") AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))) WITH CHECK ((("public"."get_user_role"() = ANY (ARRAY['contractor'::"text", 'subcontractor'::"text"])) AND ("status" = 'Pending Review'::"text") AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids"))));



ALTER TABLE "public"."transmittals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transmittals: approve roles update" ON "public"."transmittals" FOR UPDATE TO "authenticated" USING (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids"))))) WITH CHECK (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "transmittals: authenticated read all" ON "public"."transmittals" FOR SELECT TO "authenticated" USING (("public"."is_developer"() OR (("auth"."uid"() IS NOT NULL) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "transmittals: contractor acknowledges" ON "public"."transmittals" FOR UPDATE TO "authenticated" USING ((("public"."get_user_role"() = 'contractor'::"text") AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))) WITH CHECK ((("public"."get_user_role"() = 'contractor'::"text") AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids"))));



CREATE POLICY "transmittals: developer deletes" ON "public"."transmittals" FOR DELETE TO "authenticated" USING (("public"."is_developer"() OR (("public"."get_user_role"() = 'developer'::"text") AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "transmittals: upload roles insert" ON "public"."transmittals" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_developer"() OR (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'consultant'::"text", 'contractor'::"text"])) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



ALTER TABLE "public"."unit_sale_customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."unit_sales" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "unit_sales: developer delete" ON "public"."unit_sales" FOR DELETE TO "authenticated" USING (("public"."get_user_role"() = 'developer'::"text"));



CREATE POLICY "unit_sales: developer insert" ON "public"."unit_sales" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_user_role"() = 'developer'::"text"));



CREATE POLICY "unit_sales: developer select" ON "public"."unit_sales" FOR SELECT TO "authenticated" USING (("public"."get_user_role"() = 'developer'::"text"));



CREATE POLICY "unit_sales: developer update" ON "public"."unit_sales" FOR UPDATE TO "authenticated" USING (("public"."get_user_role"() = 'developer'::"text")) WITH CHECK (("public"."get_user_role"() = 'developer'::"text"));



ALTER TABLE "public"."units" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "units: developer delete" ON "public"."units" FOR DELETE TO "authenticated" USING (("public"."get_user_role"() = 'developer'::"text"));



CREATE POLICY "units: developer insert" ON "public"."units" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_user_role"() = 'developer'::"text"));



CREATE POLICY "units: developer select" ON "public"."units" FOR SELECT TO "authenticated" USING (("public"."get_user_role"() = 'developer'::"text"));



CREATE POLICY "units: developer update" ON "public"."units" FOR UPDATE TO "authenticated" USING (("public"."get_user_role"() = 'developer'::"text")) WITH CHECK (("public"."get_user_role"() = 'developer'::"text"));



CREATE POLICY "units: sales select" ON "public"."units" FOR SELECT TO "authenticated" USING (("public"."get_user_role"() = ANY (ARRAY['developer'::"text", 'sales'::"text"])));



CREATE POLICY "units_select" ON "public"."units" FOR SELECT USING (("public"."is_developer"() OR (("auth"."uid"() IS NOT NULL) AND ("project_id" IN ( SELECT "public"."user_project_ids"() AS "user_project_ids")))));



CREATE POLICY "usc: delete" ON "public"."unit_sale_customers" FOR DELETE TO "authenticated" USING (("public"."get_user_role"() = 'admin'::"text"));



CREATE POLICY "usc: insert" ON "public"."unit_sale_customers" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_customer_access"());



CREATE POLICY "usc: select" ON "public"."unit_sale_customers" FOR SELECT TO "authenticated" USING ("public"."has_customer_access"());



CREATE POLICY "usc: update" ON "public"."unit_sale_customers" FOR UPDATE TO "authenticated" USING ("public"."has_customer_access"()) WITH CHECK ("public"."has_customer_access"());





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."crm_notifications";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."block_audit_log_mutations"() TO "anon";
GRANT ALL ON FUNCTION "public"."block_audit_log_mutations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."block_audit_log_mutations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fan_out_crm_notifications"() TO "anon";
GRANT ALL ON FUNCTION "public"."fan_out_crm_notifications"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fan_out_crm_notifications"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_auth_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_auth_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_auth_user_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_crm_access"() TO "anon";
GRANT ALL ON FUNCTION "public"."has_crm_access"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_crm_access"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_customer_access"() TO "anon";
GRANT ALL ON FUNCTION "public"."has_customer_access"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_customer_access"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_app_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_app_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_app_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_consultant"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_consultant"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_consultant"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_contractor"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_contractor"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_contractor"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_developer"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_developer"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_developer"() TO "service_role";



GRANT ALL ON FUNCTION "public"."list_policies"("p_table" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."list_policies"("p_table" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_policies"("p_table" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_diagnostic"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_diagnostic"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_diagnostic"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."run_customer_backfill"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."run_customer_backfill"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_buyer_name_on_owner_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_buyer_name_on_owner_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_buyer_name_on_owner_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."user_project_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."user_project_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_project_ids"() TO "service_role";


















GRANT ALL ON TABLE "public"."attachments" TO "anon";
GRANT ALL ON TABLE "public"."attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."attachments" TO "service_role";



GRANT ALL ON TABLE "public"."boq_bills" TO "anon";
GRANT ALL ON TABLE "public"."boq_bills" TO "authenticated";
GRANT ALL ON TABLE "public"."boq_bills" TO "service_role";



GRANT ALL ON TABLE "public"."boq_items" TO "anon";
GRANT ALL ON TABLE "public"."boq_items" TO "authenticated";
GRANT ALL ON TABLE "public"."boq_items" TO "service_role";



GRANT ALL ON TABLE "public"."comments" TO "anon";
GRANT ALL ON TABLE "public"."comments" TO "authenticated";
GRANT ALL ON TABLE "public"."comments" TO "service_role";



GRANT ALL ON TABLE "public"."contracts" TO "anon";
GRANT ALL ON TABLE "public"."contracts" TO "authenticated";
GRANT ALL ON TABLE "public"."contracts" TO "service_role";



GRANT ALL ON TABLE "public"."correspondence" TO "anon";
GRANT ALL ON TABLE "public"."correspondence" TO "authenticated";
GRANT ALL ON TABLE "public"."correspondence" TO "service_role";



GRANT ALL ON TABLE "public"."crm_lead_activities" TO "anon";
GRANT ALL ON TABLE "public"."crm_lead_activities" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_lead_activities" TO "service_role";



GRANT ALL ON TABLE "public"."crm_leads" TO "anon";
GRANT ALL ON TABLE "public"."crm_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_leads" TO "service_role";



GRANT ALL ON TABLE "public"."crm_notifications" TO "anon";
GRANT ALL ON TABLE "public"."crm_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."document_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."document_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."document_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."drawing_revisions" TO "anon";
GRANT ALL ON TABLE "public"."drawing_revisions" TO "authenticated";
GRANT ALL ON TABLE "public"."drawing_revisions" TO "service_role";



GRANT ALL ON TABLE "public"."drawings" TO "anon";
GRANT ALL ON TABLE "public"."drawings" TO "authenticated";
GRANT ALL ON TABLE "public"."drawings" TO "service_role";



GRANT ALL ON TABLE "public"."inspections" TO "anon";
GRANT ALL ON TABLE "public"."inspections" TO "authenticated";
GRANT ALL ON TABLE "public"."inspections" TO "service_role";



GRANT ALL ON TABLE "public"."method_statements" TO "anon";
GRANT ALL ON TABLE "public"."method_statements" TO "authenticated";
GRANT ALL ON TABLE "public"."method_statements" TO "service_role";



GRANT ALL ON TABLE "public"."ncrs" TO "anon";
GRANT ALL ON TABLE "public"."ncrs" TO "authenticated";
GRANT ALL ON TABLE "public"."ncrs" TO "service_role";



GRANT ALL ON TABLE "public"."payment_certificate_items" TO "anon";
GRANT ALL ON TABLE "public"."payment_certificate_items" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_certificate_items" TO "service_role";



GRANT ALL ON TABLE "public"."payment_certificates" TO "anon";
GRANT ALL ON TABLE "public"."payment_certificates" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_certificates" TO "service_role";



GRANT ALL ON TABLE "public"."payment_milestones" TO "anon";
GRANT ALL ON TABLE "public"."payment_milestones" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_milestones" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."project_users" TO "anon";
GRANT ALL ON TABLE "public"."project_users" TO "authenticated";
GRANT ALL ON TABLE "public"."project_users" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON TABLE "public"."punch_list" TO "anon";
GRANT ALL ON TABLE "public"."punch_list" TO "authenticated";
GRANT ALL ON TABLE "public"."punch_list" TO "service_role";



GRANT ALL ON TABLE "public"."rate_limit_events" TO "anon";
GRANT ALL ON TABLE "public"."rate_limit_events" TO "authenticated";
GRANT ALL ON TABLE "public"."rate_limit_events" TO "service_role";



GRANT ALL ON TABLE "public"."rfis" TO "anon";
GRANT ALL ON TABLE "public"."rfis" TO "authenticated";
GRANT ALL ON TABLE "public"."rfis" TO "service_role";



GRANT ALL ON TABLE "public"."subcontractors" TO "anon";
GRANT ALL ON TABLE "public"."subcontractors" TO "authenticated";
GRANT ALL ON TABLE "public"."subcontractors" TO "service_role";



GRANT ALL ON TABLE "public"."submittal_register" TO "anon";
GRANT ALL ON TABLE "public"."submittal_register" TO "authenticated";
GRANT ALL ON TABLE "public"."submittal_register" TO "service_role";



GRANT ALL ON TABLE "public"."submittals" TO "anon";
GRANT ALL ON TABLE "public"."submittals" TO "authenticated";
GRANT ALL ON TABLE "public"."submittals" TO "service_role";



GRANT ALL ON TABLE "public"."transmittals" TO "anon";
GRANT ALL ON TABLE "public"."transmittals" TO "authenticated";
GRANT ALL ON TABLE "public"."transmittals" TO "service_role";



GRANT ALL ON TABLE "public"."unit_sale_customers" TO "anon";
GRANT ALL ON TABLE "public"."unit_sale_customers" TO "authenticated";
GRANT ALL ON TABLE "public"."unit_sale_customers" TO "service_role";



GRANT ALL ON TABLE "public"."unit_sales" TO "anon";
GRANT ALL ON TABLE "public"."unit_sales" TO "authenticated";
GRANT ALL ON TABLE "public"."unit_sales" TO "service_role";



GRANT ALL ON TABLE "public"."units" TO "anon";
GRANT ALL ON TABLE "public"."units" TO "authenticated";
GRANT ALL ON TABLE "public"."units" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































