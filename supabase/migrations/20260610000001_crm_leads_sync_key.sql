-- crm_leads: replace unique(meta_lead_id) with composite unique(project_id, sync_key).
--
-- Background: SyncWith (Meta Ads → Google Sheet pipeline) emits the same
-- meta_lead_id for different real people. Combined with merge-duplicates
-- upserts, this silently overwrote human-curated rows in the CRM (e.g.
-- Bhupendra → Raha and Shiban → Ashok on 2026-06-10). Activities stayed
-- pinned to the lead UUID, so notes from Client A appeared under Client B's
-- identity.
--
-- The new generated `sync_key` column combines meta_lead_id with lower(email)
-- so that:
--   - Same person re-syncing (same meta_lead_id + same email) deduplicates.
--   - Different people sharing a meta_lead_id (SyncWith collision) get
--     separate rows because their emails differ.
-- Sync API now upserts with on_conflict on (project_id, sync_key) and
-- resolution=ignore-duplicates so existing rows are never overwritten.

begin;

alter table public.crm_leads
  drop constraint if exists crm_leads_meta_lead_id_key;

alter table public.crm_leads
  add column if not exists sync_key text generated always as (
    case
      when meta_lead_id is not null
      then meta_lead_id || '|' || coalesce(lower(email), '')
      else null
    end
  ) stored;

-- Non-partial unique index. NULL sync_key (i.e. non-Meta leads) is allowed
-- freely because Postgres treats NULLs as distinct in unique indexes.
-- Must be non-partial so PostgREST's ON CONFLICT (project_id, sync_key) can
-- match it without supplying the index predicate.
create unique index if not exists crm_leads_project_sync_key_idx
  on public.crm_leads (project_id, sync_key);

commit;
