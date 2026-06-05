# CRM Mentions & Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Slack/Chatter-style @mentions and reply notifications to CRM lead activities — surfaced via a bell badge, dropdown, dashboard widget, and full inbox page, with realtime updates.

**Architecture:**
- Postgres trigger on `crm_lead_activities` insert fans out into a new `crm_notifications` table; only the trigger can INSERT, RLS gates SELECT/UPDATE per recipient.
- Frontend (single-file SPA, vanilla JS in `src/crm.js`) subscribes to a per-user Supabase Realtime channel; bell, dropdown, dashboard widget, and inbox page share a small in-memory cache.
- Mentions are stored as a `uuid[]` column on activities populated by an `@` autocomplete (no SQL parsing of body text). Body uses an `@[Name](uuid)` marker format that the activity renderer expands into colored chips.

**Tech Stack:** Supabase (Postgres 15 + RLS + Realtime), vanilla JS / `sb` client (Supabase JS v2), single-file SPA in `index.html` + `src/crm.js`, Playwright/Node tests in `tests/`.

**Spec:** [docs/superpowers/specs/2026-06-05-crm-mentions-design.md](../specs/2026-06-05-crm-mentions-design.md)

---

## File Map

**Migrations (new):**
- `supabase/migrations/20260606000001_crm_activities_mentions.sql` — `mentions uuid[]` column + CHECK ≤ 10
- `supabase/migrations/20260606000002_crm_notifications.sql` — table, indexes, RLS, trigger function, trigger
- `supabase/migrations/20260606000003_crm_notifications_realtime.sql` — enable Realtime publication on the table

**Frontend (modify):**
- `index.html` — add `n-crm-notifications` nav item; bell mount point in CRM toolbar; CSS for bell, dropdown, mention chips, autocomplete, widget, inbox
- `src/crm.js` — new section "CRM Notifications" (bell state, dropdown, realtime, read-state, inbox page render); modify `addLeadActivity` to send `mentions[]`; modify `_renderActItem` to render `@[Name](uuid)` chips; modify `viewLead` to wire `@` autocomplete into `#act-body`; modify `renderCRMHome` to include "Needs your attention" card

**Tests (new):**
- `tests/crm-notifications.test.js` — trigger fan-out (mention, reply, dedupe, self-skip, 10-cap)
- Extend `tests/contracts-crm-rls.test.js` — RLS coverage for `crm_notifications`

---

## Phase 1 — Database Foundation

### Task 1: Migration for `mentions` column on `crm_lead_activities`

**Files:**
- Create: `supabase/migrations/20260606000001_crm_activities_mentions.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add mentions array to activities. Populated client-side by the @ autocomplete.
-- Hard cap at 10 to prevent abuse. NULL-safe array_length check.

ALTER TABLE public.crm_lead_activities
  ADD COLUMN IF NOT EXISTS mentions uuid[] NOT NULL DEFAULT '{}';

ALTER TABLE public.crm_lead_activities
  DROP CONSTRAINT IF EXISTS crm_activities_mentions_max_10;

ALTER TABLE public.crm_lead_activities
  ADD CONSTRAINT crm_activities_mentions_max_10
    CHECK (array_length(mentions, 1) IS NULL OR array_length(mentions, 1) <= 10);
```

- [ ] **Step 2: Apply locally**

Run: `npx supabase db push`
Expected: "Applied migration 20260606000001_crm_activities_mentions"

- [ ] **Step 3: Verify column exists**

Run:
```bash
npx supabase db execute --sql "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='crm_lead_activities' AND column_name='mentions'"
```
Expected: one row, `mentions | ARRAY`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260606000001_crm_activities_mentions.sql
git commit -m "feat(db): add mentions uuid[] column to crm_lead_activities"
```

---

### Task 2: Migration for `crm_notifications` table + RLS + trigger

**Files:**
- Create: `supabase/migrations/20260606000002_crm_notifications.sql`

- [ ] **Step 1: Write the migration**

```sql
-- crm_notifications: per-user inbox of mention/reply events derived from
-- crm_lead_activities inserts. Only the SECURITY DEFINER trigger writes;
-- recipients can read and mark-read their own rows.

CREATE TABLE IF NOT EXISTS public.crm_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('mention', 'reply')),
  lead_id     uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES public.crm_lead_activities(id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name  text NOT NULL,
  snippet     text NOT NULL,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_notifications_user_unread_idx
  ON public.crm_notifications (user_id, read_at NULLS FIRST, created_at DESC);

CREATE INDEX IF NOT EXISTS crm_notifications_activity_idx
  ON public.crm_notifications (activity_id);

ALTER TABLE public.crm_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own notifications: select" ON public.crm_notifications;
CREATE POLICY "own notifications: select"
  ON public.crm_notifications FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own notifications: update read_at" ON public.crm_notifications;
CREATE POLICY "own notifications: update read_at"
  ON public.crm_notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- No INSERT policy → only the SECURITY DEFINER trigger writes.
-- No DELETE policy → cascade only.

-- Trigger function: fan out into per-recipient notification rows.
CREATE OR REPLACE FUNCTION public.fan_out_crm_notifications()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_actor_name    text;
  v_snippet       text;
  v_recipient     uuid;
  v_parent_author uuid;
BEGIN
  v_actor_name := COALESCE(NEW.author_name, 'Someone');
  v_snippet    := LEFT(COALESCE(NEW.body, ''), 140);

  -- Mentions: explicit @recipients from client autocomplete.
  IF NEW.mentions IS NOT NULL THEN
    FOREACH v_recipient IN ARRAY NEW.mentions LOOP
      IF v_recipient IS NOT NULL AND v_recipient <> NEW.author_id THEN
        INSERT INTO public.crm_notifications
          (user_id, type, lead_id, activity_id, actor_id, actor_name, snippet)
        VALUES
          (v_recipient, 'mention', NEW.lead_id, NEW.id,
           NEW.author_id, v_actor_name, v_snippet)
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  -- Reply: notify parent comment author (skip if already mentioned or is the actor).
  IF NEW.parent_id IS NOT NULL THEN
    SELECT author_id INTO v_parent_author
    FROM public.crm_lead_activities
    WHERE id = NEW.parent_id;

    IF v_parent_author IS NOT NULL
       AND v_parent_author <> NEW.author_id
       AND NOT (v_parent_author = ANY(COALESCE(NEW.mentions, ARRAY[]::uuid[])))
    THEN
      INSERT INTO public.crm_notifications
        (user_id, type, lead_id, activity_id, actor_id, actor_name, snippet)
      VALUES
        (v_parent_author, 'reply', NEW.lead_id, NEW.id,
         NEW.author_id, v_actor_name, v_snippet);
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fan_out_crm_notifications ON public.crm_lead_activities;
CREATE TRIGGER trg_fan_out_crm_notifications
  AFTER INSERT ON public.crm_lead_activities
  FOR EACH ROW
  EXECUTE FUNCTION public.fan_out_crm_notifications();
```

- [ ] **Step 2: Apply locally**

Run: `npx supabase db push`
Expected: "Applied migration 20260606000002_crm_notifications"

- [ ] **Step 3: Verify table + trigger exist**

Run:
```bash
npx supabase db execute --sql "SELECT trigger_name FROM information_schema.triggers WHERE event_object_table='crm_lead_activities' AND trigger_name='trg_fan_out_crm_notifications'"
```
Expected: one row.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260606000002_crm_notifications.sql
git commit -m "feat(db): add crm_notifications table, RLS, and fan-out trigger"
```

---

### Task 3: Enable Realtime publication

**Files:**
- Create: `supabase/migrations/20260606000003_crm_notifications_realtime.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add crm_notifications to the supabase_realtime publication so the JS client
-- receives INSERT events filtered by user_id.

ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_notifications;
```

- [ ] **Step 2: Apply**

Run: `npx supabase db push`
Expected: "Applied migration 20260606000003_crm_notifications_realtime"

- [ ] **Step 3: Verify publication**

Run:
```bash
npx supabase db execute --sql "SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='crm_notifications'"
```
Expected: one row.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260606000003_crm_notifications_realtime.sql
git commit -m "feat(db): enable realtime publication on crm_notifications"
```

---

## Phase 2 — Backend Tests

### Task 4: Test — mention fan-out

**Files:**
- Create: `tests/crm-notifications.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/crm-notifications.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { adminClient, getOrCreateUser, seedLead } from './helpers/crm-helpers.js';

test('mention fan-out inserts a notification row for each mentioned user', async () => {
  const admin = adminClient();
  const author = await getOrCreateUser('author@test.local');
  const mentioned1 = await getOrCreateUser('mentioned1@test.local');
  const mentioned2 = await getOrCreateUser('mentioned2@test.local');
  const lead = await seedLead({ name: 'Mention Test Lead' });

  const { data: activity, error: insErr } = await admin
    .from('crm_lead_activities')
    .insert({
      lead_id: lead.id,
      author_id: author.id,
      author_name: 'Author Name',
      method: 'note',
      contacted_at: new Date().toISOString(),
      body: 'Hello @[Mentioned One](placeholder) and @[Mentioned Two](placeholder)',
      mentions: [mentioned1.id, mentioned2.id],
    })
    .select()
    .single();
  assert.equal(insErr, null);

  const { data: notifs } = await admin
    .from('crm_notifications')
    .select('*')
    .eq('activity_id', activity.id)
    .order('user_id');

  assert.equal(notifs.length, 2);
  assert.equal(notifs.every(n => n.type === 'mention'), true);
  assert.equal(notifs.every(n => n.actor_id === author.id), true);
  assert.equal(notifs.every(n => n.lead_id === lead.id), true);
  const recipients = notifs.map(n => n.user_id).sort();
  assert.deepEqual(recipients, [mentioned1.id, mentioned2.id].sort());
});
```

- [ ] **Step 2: Create the helper if it doesn't exist**

Check `tests/helpers/` for an existing CRM helper. If none, create `tests/helpers/crm-helpers.js`:

```javascript
// tests/helpers/crm-helpers.js
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const TEST_PROJECT_ID = '00000000-0000-0000-0000-000000000002';

export function adminClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

export async function getOrCreateUser(email) {
  const admin = adminClient();
  const { data: existing } = await admin
    .from('profiles').select('id').eq('email', email).maybeSingle();
  if (existing) return { id: existing.id, email };
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password: 'TestPass123!', email_confirm: true,
  });
  if (error) throw error;
  await admin.from('profiles').upsert({
    id: created.user.id, email, full_name: email.split('@')[0], role: 'sales',
  });
  return { id: created.user.id, email };
}

export async function seedLead({ name }) {
  const admin = adminClient();
  const { data, error } = await admin
    .from('crm_leads')
    .insert({ name, project_id: TEST_PROJECT_ID, stage: 'new_lead' })
    .select().single();
  if (error) throw error;
  return data;
}

export async function cleanupCrmTestData() {
  const admin = adminClient();
  await admin.from('crm_leads').delete().like('name', '%Test Lead%');
  await admin.from('profiles').delete().like('email', '%@test.local');
}
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `node --test tests/crm-notifications.test.js`
Expected: 1 passing.

- [ ] **Step 4: Commit**

```bash
git add tests/crm-notifications.test.js tests/helpers/crm-helpers.js
git commit -m "test: crm mention fan-out trigger"
```

---

### Task 5: Test — reply fan-out

**Files:**
- Modify: `tests/crm-notifications.test.js`

- [ ] **Step 1: Append the test**

```javascript
test('reply fan-out notifies parent comment author', async () => {
  const admin = adminClient();
  const original = await getOrCreateUser('original@test.local');
  const replier  = await getOrCreateUser('replier@test.local');
  const lead = await seedLead({ name: 'Reply Test Lead' });

  const { data: parent } = await admin.from('crm_lead_activities').insert({
    lead_id: lead.id, author_id: original.id, author_name: 'Original',
    method: 'note', contacted_at: new Date().toISOString(), body: 'parent body',
  }).select().single();

  const { data: reply } = await admin.from('crm_lead_activities').insert({
    lead_id: lead.id, author_id: replier.id, author_name: 'Replier',
    method: 'note', contacted_at: new Date().toISOString(),
    body: 'reply body', parent_id: parent.id,
  }).select().single();

  const { data: notifs } = await admin
    .from('crm_notifications').select('*').eq('activity_id', reply.id);

  assert.equal(notifs.length, 1);
  assert.equal(notifs[0].user_id, original.id);
  assert.equal(notifs[0].type, 'reply');
  assert.equal(notifs[0].actor_id, replier.id);
});
```

- [ ] **Step 2: Run**

Run: `node --test tests/crm-notifications.test.js`
Expected: 2 passing.

- [ ] **Step 3: Commit**

```bash
git add tests/crm-notifications.test.js
git commit -m "test: crm reply fan-out trigger"
```

---

### Task 6: Test — dedupe (mention + parent author = same person)

**Files:**
- Modify: `tests/crm-notifications.test.js`

- [ ] **Step 1: Append the test**

```javascript
test('mention+reply on same recipient produces exactly one mention row', async () => {
  const admin = adminClient();
  const both    = await getOrCreateUser('both@test.local');
  const replier = await getOrCreateUser('replier2@test.local');
  const lead = await seedLead({ name: 'Dedupe Test Lead' });

  const { data: parent } = await admin.from('crm_lead_activities').insert({
    lead_id: lead.id, author_id: both.id, author_name: 'Both',
    method: 'note', contacted_at: new Date().toISOString(), body: 'parent',
  }).select().single();

  const { data: reply } = await admin.from('crm_lead_activities').insert({
    lead_id: lead.id, author_id: replier.id, author_name: 'Replier',
    method: 'note', contacted_at: new Date().toISOString(),
    body: '@[Both](x) reply', parent_id: parent.id, mentions: [both.id],
  }).select().single();

  const { data: notifs } = await admin
    .from('crm_notifications').select('*').eq('activity_id', reply.id);

  assert.equal(notifs.length, 1);
  assert.equal(notifs[0].type, 'mention');
});
```

- [ ] **Step 2: Run**

Run: `node --test tests/crm-notifications.test.js`
Expected: 3 passing.

- [ ] **Step 3: Commit**

```bash
git add tests/crm-notifications.test.js
git commit -m "test: crm notification mention+reply dedupe"
```

---

### Task 7: Test — self-skip + 10-cap

**Files:**
- Modify: `tests/crm-notifications.test.js`

- [ ] **Step 1: Append**

```javascript
test('self-mention does not produce a notification', async () => {
  const admin = adminClient();
  const me = await getOrCreateUser('self@test.local');
  const lead = await seedLead({ name: 'Self Test Lead' });

  const { data: act } = await admin.from('crm_lead_activities').insert({
    lead_id: lead.id, author_id: me.id, author_name: 'Me',
    method: 'note', contacted_at: new Date().toISOString(),
    body: '@[Me](x)', mentions: [me.id],
  }).select().single();

  const { data: notifs } = await admin
    .from('crm_notifications').select('*').eq('activity_id', act.id);

  assert.equal(notifs.length, 0);
});

test('inserting more than 10 mentions is rejected by CHECK constraint', async () => {
  const admin = adminClient();
  const author = await getOrCreateUser('cap-author@test.local');
  const lead = await seedLead({ name: 'Cap Test Lead' });
  const elevenIds = Array.from({length: 11}, () =>
    '00000000-0000-0000-0000-' + Math.random().toString(16).slice(2,14).padStart(12,'0')
  );

  const { error } = await admin.from('crm_lead_activities').insert({
    lead_id: lead.id, author_id: author.id, author_name: 'Cap',
    method: 'note', contacted_at: new Date().toISOString(),
    body: 'too many', mentions: elevenIds,
  });

  assert.notEqual(error, null);
  assert.match(error.message, /crm_activities_mentions_max_10/);
});
```

- [ ] **Step 2: Run**

Run: `node --test tests/crm-notifications.test.js`
Expected: 5 passing.

- [ ] **Step 3: Commit**

```bash
git add tests/crm-notifications.test.js
git commit -m "test: crm notification self-skip + 10-mention cap"
```

---

### Task 8: Test — RLS on `crm_notifications`

**Files:**
- Modify: `tests/contracts-crm-rls.test.js`

- [ ] **Step 1: Read the existing file to find the conventional structure**

Run: `head -60 tests/contracts-crm-rls.test.js`
Use the same auth helpers (`loginAs`, `userClient`, etc.) already in that file.

- [ ] **Step 2: Append the RLS coverage**

Add to `tests/contracts-crm-rls.test.js` (adjust helper names to match what's already there):

```javascript
test('crm_notifications: user can read only their own rows', async () => {
  const admin = adminClient();
  const alice = await getOrCreateUser('alice@test.local');
  const bob   = await getOrCreateUser('bob@test.local');
  const lead  = await seedLead({ name: 'RLS Test Lead' });

  // Author posts, mentioning alice and bob.
  const author = await getOrCreateUser('rls-author@test.local');
  await admin.from('crm_lead_activities').insert({
    lead_id: lead.id, author_id: author.id, author_name: 'Author',
    method: 'note', contacted_at: new Date().toISOString(),
    body: 'hi @[alice](x) @[bob](x)', mentions: [alice.id, bob.id],
  });

  const aliceSb = await userClient('alice@test.local', 'TestPass123!');
  const { data: aliceRows } = await aliceSb.from('crm_notifications').select('*');
  assert.equal(aliceRows.every(r => r.user_id === alice.id), true);
  assert.ok(aliceRows.length >= 1);

  const bobSb = await userClient('bob@test.local', 'TestPass123!');
  const { data: bobRows } = await bobSb.from('crm_notifications').select('*');
  assert.equal(bobRows.every(r => r.user_id === bob.id), true);
});

test('crm_notifications: user cannot INSERT directly', async () => {
  const alice = await getOrCreateUser('alice@test.local');
  const aliceSb = await userClient('alice@test.local', 'TestPass123!');
  const { error } = await aliceSb.from('crm_notifications').insert({
    user_id: alice.id, type: 'mention', lead_id: '00000000-0000-0000-0000-000000000001',
    activity_id: '00000000-0000-0000-0000-000000000001', actor_name: 'X', snippet: 'X',
  });
  assert.notEqual(error, null);
});

test('crm_notifications: user can mark their own row read but not others', async () => {
  const admin = adminClient();
  const alice = await getOrCreateUser('alice@test.local');
  const bob   = await getOrCreateUser('bob@test.local');

  const { data: aliceRow } = await admin
    .from('crm_notifications').select('id').eq('user_id', alice.id).limit(1).single();
  const { data: bobRow } = await admin
    .from('crm_notifications').select('id').eq('user_id', bob.id).limit(1).single();

  const aliceSb = await userClient('alice@test.local', 'TestPass123!');

  const r1 = await aliceSb.from('crm_notifications')
    .update({ read_at: new Date().toISOString() }).eq('id', aliceRow.id).select();
  assert.equal(r1.error, null);
  assert.equal(r1.data.length, 1);

  const r2 = await aliceSb.from('crm_notifications')
    .update({ read_at: new Date().toISOString() }).eq('id', bobRow.id).select();
  assert.equal(r2.data?.length || 0, 0); // RLS hides bob's row
});
```

- [ ] **Step 3: Run**

Run: `node --test tests/contracts-crm-rls.test.js`
Expected: all existing tests pass plus the 3 new ones.

- [ ] **Step 4: Commit**

```bash
git add tests/contracts-crm-rls.test.js
git commit -m "test(rls): crm_notifications select/insert/update policies"
```

---

## Phase 3 — Frontend: Bell, Dropdown, Realtime

### Task 9: CSS for bell, dropdown, chip, autocomplete, widget, inbox

**Files:**
- Modify: `index.html` (CSS section near other CRM styles)

- [ ] **Step 1: Locate the CRM CSS section**

Run: `grep -n "crm-home\|act-feed\|act-reply" index.html | head -10`
Find a clean spot just after existing CRM styles. Add the new styles there.

- [ ] **Step 2: Add the CSS block**

```html
<style>
/* ─── CRM Notifications ─── */
.crm-bell { position:relative; width:34px; height:34px; display:inline-flex; align-items:center;
  justify-content:center; border-radius:6px; background:#fff; border:1px solid var(--border,#d1d5db);
  cursor:pointer; font-size:16px; }
.crm-bell .crm-bell-dot { position:absolute; top:-4px; right:-4px; background:#ef4444; color:#fff;
  font-size:10px; font-weight:700; min-width:16px; height:16px; padding:0 4px; border-radius:8px;
  display:flex; align-items:center; justify-content:center; border:2px solid #fff; }
.crm-bell-dropdown { position:absolute; right:0; top:42px; width:380px; max-height:520px;
  overflow:auto; background:#fff; border:1px solid var(--border,#e5e7eb); border-radius:8px;
  box-shadow:0 10px 32px rgba(0,0,0,.12); z-index:1000; }
.crm-bell-dropdown.hidden { display:none; }
.crm-bell-dropdown .head { display:flex; align-items:center; padding:10px 14px;
  border-bottom:1px solid #f3f4f6; }
.crm-bell-dropdown .head .title { font-weight:600; font-size:14px; }
.crm-bell-dropdown .head .markall { margin-left:auto; font-size:12px; color:#2563eb; cursor:pointer; }
.crm-bell-dropdown .foot { padding:10px 14px; text-align:center; font-size:12px; color:#2563eb;
  cursor:pointer; border-top:1px solid #f3f4f6; }
.crm-notif { display:flex; gap:12px; padding:12px 14px; border-bottom:1px solid #f3f4f6;
  cursor:pointer; }
.crm-notif.unread { background:#eff6ff; }
.crm-notif:hover { background:#f9fafb; }
.crm-notif .avatar { width:32px; height:32px; border-radius:50%; background:#dbeafe; color:#1d4ed8;
  display:flex; align-items:center; justify-content:center; font-weight:600; font-size:12px;
  flex-shrink:0; }
.crm-notif .body { flex:1; min-width:0; }
.crm-notif .meta { font-size:12px; color:var(--text2,#6b7280); }
.crm-notif .meta strong { color:var(--text1,#111827); }
.crm-notif .pill { display:inline-block; padding:1px 6px; background:#e0e7ff; color:#3730a3;
  border-radius:3px; font-size:10px; font-weight:600; margin-left:4px; text-transform:uppercase; }
.crm-notif .pill.reply { background:#dcfce7; color:#166534; }
.crm-notif .snippet { font-size:13px; color:var(--text1,#374151); margin-top:4px; line-height:1.4; }
.crm-notif .time { font-size:11px; color:var(--text3,#9ca3af); margin-top:4px; }
.act-mention-chip { display:inline; color:#1d4ed8; background:#dbeafe; padding:0 4px;
  border-radius:3px; font-weight:500; }

/* @ autocomplete */
.crm-at-popup { position:absolute; background:#fff; border:1px solid #e5e7eb; border-radius:6px;
  box-shadow:0 8px 24px rgba(0,0,0,.1); width:240px; overflow:hidden; z-index:1200; }
.crm-at-item { display:flex; align-items:center; gap:10px; padding:8px 12px; cursor:pointer;
  font-size:13px; }
.crm-at-item.active { background:#eff6ff; }
.crm-at-item .role { margin-left:auto; font-size:11px; color:var(--text3,#6b7280); }

/* "Needs your attention" widget */
.ch-attn { background:#fff; border:1px solid var(--border,#e5e7eb); border-radius:8px;
  padding:14px; margin-bottom:14px; }
.ch-attn-hdr { display:flex; align-items:center; gap:8px; font-weight:600; font-size:14px;
  margin-bottom:10px; }
.ch-attn-badge { background:#ef4444; color:#fff; font-size:11px; font-weight:700; padding:2px 7px;
  border-radius:10px; }
.ch-attn-markall { margin-left:auto; font-size:12px; color:#2563eb; cursor:pointer; }
.ch-attn-row { display:flex; gap:10px; padding:8px 0; border-top:1px solid #f3f4f6; }
.ch-attn-row:first-of-type { border-top:0; }
.ch-attn-row .lead { font-weight:600; font-size:13px; }
.ch-attn-row .meta { font-size:12px; color:var(--text2,#6b7280); }
.ch-attn-row .snippet { font-size:12px; color:var(--text1,#374151); margin-top:3px; }
.ch-attn-row .open { margin-left:auto; font-size:11px; color:#2563eb; background:#eff6ff;
  padding:4px 8px; border-radius:4px; cursor:pointer; height:fit-content; }

/* Inbox page */
.notif-tabs { display:flex; gap:6px; margin-bottom:12px; }
.notif-tab { padding:6px 12px; border:1px solid var(--border,#d1d5db); background:#fff;
  border-radius:5px; font-size:13px; cursor:pointer; }
.notif-tab.active { background:#1d4ed8; color:#fff; border-color:#1d4ed8; }
.notif-list { background:#fff; border:1px solid var(--border,#e5e7eb); border-radius:8px; }
</style>
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(ui): CSS for CRM notifications bell, dropdown, widget, inbox"
```

---

### Task 10: Nav item + bell DOM mount

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add `n-crm-notifications` nav item**

Find the existing `n-crm-home` item:

```bash
grep -n 'id="n-crm-home"' index.html
```

Add directly after it:

```html
<div class="nav-item" id="n-crm-notifications" onclick="nav('crm-notifications',this)">
  <span class="nav-icon">🔔</span>
  Notifications
</div>
```

- [ ] **Step 2: Add the CRM toolbar bell mount point**

Find the CRM toolbar button row (next to "+ New Lead" / "↻ Sync" / "↓ Export"). It's in `src/crm.js` at the export row near line 438. The bell will be injected by JS — leave a marker placeholder in `index.html` only if the toolbar is static. Since the toolbar is rendered by JS, instead add a single line to the CRM section in `index.html`:

```html
<!-- CRM bell renders into here on CRM pages -->
<div id="crm-bell-root" style="display:none"></div>
```

Place it just before the closing of the CRM page container (the `#sec-crm` div, or wherever existing CRM section markup lives). The JS will move/render it as part of the toolbar.

- [ ] **Step 3: Add the empty page section for `crm-notifications`**

Find existing `<section id="sec-crm-home">` (or equivalent pattern) and add a sibling:

```html
<section id="sec-crm-notifications" class="page" style="display:none">
  <div class="page-header">
    <h2>Notifications</h2>
    <button class="btn" id="crm-notif-mark-all">Mark all read</button>
  </div>
  <div class="notif-tabs">
    <button class="notif-tab active" data-tab="all">All</button>
    <button class="notif-tab" data-tab="mention">Mentions</button>
    <button class="notif-tab" data-tab="reply">Replies</button>
    <button class="notif-tab" data-tab="unread">Unread</button>
  </div>
  <div class="notif-list" id="crm-notif-list">
    <div style="padding:24px;text-align:center;color:#9ca3af">Loading…</div>
  </div>
  <div id="crm-notif-loadmore" style="text-align:center;padding:12px;display:none">
    <button class="btn">Load more</button>
  </div>
</section>
```

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(ui): nav item, bell mount, and inbox page shell for CRM notifications"
```

---

### Task 11: Notification module skeleton (state + init)

**Files:**
- Modify: `src/crm.js` (append a new section at the bottom)

- [ ] **Step 1: Append the skeleton**

```javascript
// ─── CRM NOTIFICATIONS ────────────────────────────────────────────
const _crmNotifState = {
  rows: [],             // cached notification rows (most recent first)
  unread: 0,            // unread count
  loaded: false,        // initial fetch complete
  channel: null,        // Realtime channel handle
  pageOffset: 0,        // for inbox page "Load more"
};

async function initCrmNotifications() {
  if (_crmNotifState.channel) return; // already subscribed
  if (!currentUser?.id) return;
  if (!can('crm')) return;            // sales/dev/admin only

  await _crmNotifFetchInitial();
  _crmNotifSubscribe();
  _crmNotifMountBell();
}

async function _crmNotifFetchInitial() {
  const { data, error } = await sb
    .from('crm_notifications')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('read_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) { console.warn('[crm-notif] fetch:', error); return; }
  _crmNotifState.rows = data || [];
  _crmNotifState.unread = (data || []).filter(r => !r.read_at).length;
  _crmNotifState.loaded = true;
  _crmNotifRenderBell();
}

function _crmNotifSubscribe() {
  if (_crmNotifState.channel) return;
  _crmNotifState.channel = sb
    .channel(`crm-notifs-${currentUser.id}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'crm_notifications',
      filter: `user_id=eq.${currentUser.id}`,
    }, ({ new: row }) => {
      _crmNotifState.rows.unshift(row);
      if (!row.read_at) _crmNotifState.unread++;
      _crmNotifRenderBell();
      _crmNotifRenderDropdown();   // refresh if open
      _crmNotifRefreshHomeWidget();
      _crmNotifRefreshInboxIfActive();
    })
    .subscribe();
}
```

- [ ] **Step 2: Wire init into the CRM nav entry**

Find where `nav('crm', …)` or `nav('crm-home', …)` lands and ensure `initCrmNotifications()` is called once. Search:

```bash
grep -n "nav('crm" src/crm.js index.html | head
```

In whichever function fires on entering CRM (likely `renderCRM()` or `renderCRMHome()` in `src/crm.js`), add at the top:

```javascript
initCrmNotifications();  // idempotent
```

- [ ] **Step 3: Commit**

```bash
git add src/crm.js
git commit -m "feat(crm): notification state, initial fetch, realtime subscribe"
```

---

### Task 12: Bell render + click handler

**Files:**
- Modify: `src/crm.js`

- [ ] **Step 1: Add bell mount + render**

Append to the CRM Notifications section:

```javascript
function _crmNotifMountBell() {
  const root = document.getElementById('crm-bell-root');
  if (!root) return;
  root.style.display = '';
  root.innerHTML = `
    <div class="crm-bell" id="crm-bell-btn" title="Notifications" onclick="toggleCrmBellDropdown(event)">
      🔔
      <div class="crm-bell-dot" id="crm-bell-dot" style="display:none">0</div>
    </div>
    <div class="crm-bell-dropdown hidden" id="crm-bell-dropdown"></div>
  `;
  _crmNotifRenderBell();
}

function _crmNotifRenderBell() {
  const dot = document.getElementById('crm-bell-dot');
  if (!dot) return;
  const n = _crmNotifState.unread;
  if (n <= 0) { dot.style.display = 'none'; return; }
  dot.style.display = '';
  dot.textContent = n > 99 ? '99+' : String(n);
}

function toggleCrmBellDropdown(ev) {
  ev?.stopPropagation();
  const dd = document.getElementById('crm-bell-dropdown');
  if (!dd) return;
  const opening = dd.classList.contains('hidden');
  dd.classList.toggle('hidden');
  if (opening) {
    _crmNotifRenderDropdown();
    // auto-mark visible-unread as read on open
    _crmNotifMarkRead(_crmNotifState.rows.slice(0, 10).filter(r => !r.read_at).map(r => r.id));
  }
}

// Close dropdown on outside click
document.addEventListener('click', (e) => {
  const dd = document.getElementById('crm-bell-dropdown');
  if (!dd || dd.classList.contains('hidden')) return;
  if (e.target.closest('#crm-bell-dropdown') || e.target.closest('#crm-bell-btn')) return;
  dd.classList.add('hidden');
});
```

- [ ] **Step 2: Quick smoke check**

Open the app in the browser, navigate to CRM. The bell should appear; no badge if there are no rows. Click it; an empty dropdown shell should toggle.

- [ ] **Step 3: Commit**

```bash
git add src/crm.js
git commit -m "feat(crm): bell mount, badge render, dropdown toggle + outside-click dismiss"
```

---

### Task 13: Dropdown content render + navigate-to-lead

**Files:**
- Modify: `src/crm.js`

- [ ] **Step 1: Add render + click handler**

```javascript
function _crmNotifRenderDropdown() {
  const dd = document.getElementById('crm-bell-dropdown');
  if (!dd) return;
  const top10 = _crmNotifState.rows.slice(0, 10);
  const body = top10.length
    ? top10.map(_crmNotifRowHtml).join('')
    : '<div style="padding:24px;text-align:center;color:#9ca3af;font-size:13px">No notifications</div>';
  dd.innerHTML = `
    <div class="head">
      <span class="title">Notifications</span>
      <span class="markall" onclick="crmMarkAllNotifsRead()">Mark all read</span>
    </div>
    ${body}
    <div class="foot" onclick="nav('crm-notifications', document.getElementById('n-crm-notifications'))">View all notifications →</div>
  `;
}

function _crmNotifRowHtml(r) {
  const initials = (r.actor_name || '?').split(/\s+/).slice(0,2).map(s => s[0]||'').join('').toUpperCase();
  const pillCls  = r.type === 'reply' ? 'pill reply' : 'pill';
  const verb     = r.type === 'reply' ? 'replied to your comment on' : 'mentioned you on';
  // Lead name not stored on notification → fetch lazily via cache. For now show lead_id short.
  const leadLabel = (window._crmLeadNameCache && window._crmLeadNameCache[r.lead_id]) || 'Lead';
  return `<div class="crm-notif ${r.read_at ? '' : 'unread'}"
    onclick="crmOpenNotif('${r.id}','${r.lead_id}','${r.activity_id}')">
    <div class="avatar">${esc(initials)}</div>
    <div class="body">
      <div class="meta"><strong>${esc(r.actor_name)}</strong> ${verb} <strong>${esc(leadLabel)}</strong><span class="${pillCls}">${r.type}</span></div>
      <div class="snippet">${_crmRenderMentionedText(r.snippet)}</div>
      <div class="time">${_crmRelTime(r.created_at)}</div>
    </div>
  </div>`;
}

function _crmRelTime(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s/60) + ' min ago';
  if (s < 86400) return Math.floor(s/3600) + ' h ago';
  if (s < 7*86400) return Math.floor(s/86400) + ' d ago';
  return new Date(iso).toLocaleDateString('en-GB');
}

function _crmRenderMentionedText(text) {
  // Replace @[Name](uuid) with a chip.
  return esc(text).replace(/@\[([^\]]+)\]\(([0-9a-f-]+)\)/g,
    (_, name) => `<span class="act-mention-chip">@${esc(name)}</span>`);
}

async function crmOpenNotif(notifId, leadId, activityId) {
  await _crmNotifMarkRead([notifId]);
  document.getElementById('crm-bell-dropdown')?.classList.add('hidden');
  await viewLead(leadId);
  setTimeout(() => {
    const el = document.getElementById(`act-${activityId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.outline = '2px solid #2563eb';
      setTimeout(() => { el.style.outline = ''; }, 1500);
    }
  }, 200);
}
```

- [ ] **Step 2: Add lead-name cache populate after initial fetch**

In `_crmNotifFetchInitial()` after assigning `_crmNotifState.rows`, append:

```javascript
const leadIds = [...new Set(_crmNotifState.rows.map(r => r.lead_id))];
if (leadIds.length) {
  const { data: leads } = await sb.from('crm_leads').select('id,name').in('id', leadIds);
  window._crmLeadNameCache = window._crmLeadNameCache || {};
  (leads||[]).forEach(l => { window._crmLeadNameCache[l.id] = l.name; });
}
```

And in `_crmNotifSubscribe()` `INSERT` handler, before render calls, fetch any missing lead name:

```javascript
if (!window._crmLeadNameCache?.[row.lead_id]) {
  const { data: l } = await sb.from('crm_leads').select('id,name').eq('id', row.lead_id).maybeSingle();
  if (l) { window._crmLeadNameCache = window._crmLeadNameCache || {}; window._crmLeadNameCache[l.id] = l.name; }
}
```

(Make the handler `async` accordingly.)

- [ ] **Step 3: Modify `_renderActItem` to expose an id anchor**

Find `_renderActItem` (around line 828) and change the returned outer div to include `id="act-${a.id}"`:

```javascript
return `<div id="act-${a.id}" class="${cls}" data-method="${esc(a.method)}">
```

- [ ] **Step 4: Smoke test**

In the browser, manually insert a `crm_notifications` row via Supabase SQL editor for your own user. Open the bell — row should appear. Click it — should navigate to the lead and flash-highlight the activity.

- [ ] **Step 5: Commit**

```bash
git add src/crm.js
git commit -m "feat(crm): bell dropdown row render, lead-name cache, navigate + highlight"
```

---

### Task 14: Mark-read implementation

**Files:**
- Modify: `src/crm.js`

- [ ] **Step 1: Add the mark-read helpers**

```javascript
async function _crmNotifMarkRead(ids) {
  if (!ids || !ids.length) return;
  const now = new Date().toISOString();
  const { error } = await sb.from('crm_notifications')
    .update({ read_at: now })
    .in('id', ids).is('read_at', null);
  if (error) { console.warn('[crm-notif] mark read:', error); return; }
  // Update local cache
  ids.forEach(id => {
    const r = _crmNotifState.rows.find(x => x.id === id);
    if (r && !r.read_at) { r.read_at = now; _crmNotifState.unread = Math.max(0, _crmNotifState.unread - 1); }
  });
  _crmNotifRenderBell();
  _crmNotifRefreshHomeWidget();
}

async function crmMarkAllNotifsRead() {
  const now = new Date().toISOString();
  const { error } = await sb.from('crm_notifications')
    .update({ read_at: now })
    .eq('user_id', currentUser.id).is('read_at', null);
  if (error) { toast('Error: '+error.message,'error'); return; }
  _crmNotifState.rows.forEach(r => { if (!r.read_at) r.read_at = now; });
  _crmNotifState.unread = 0;
  _crmNotifRenderBell();
  _crmNotifRenderDropdown();
  _crmNotifRefreshHomeWidget();
  _crmNotifRefreshInboxIfActive();
  toast('All notifications marked read','success');
}
```

- [ ] **Step 2: Manual test**

Seed a couple of unread rows for your user. Click bell → confirm visible rows mark read after dropdown opens. Click "Mark all read" → badge clears.

- [ ] **Step 3: Commit**

```bash
git add src/crm.js
git commit -m "feat(crm): single + bulk mark-read for notifications"
```

---

## Phase 4 — Write Path: @ Autocomplete + Reply Wiring

### Task 15: Profile cache for mentionable users

**Files:**
- Modify: `src/crm.js`

- [ ] **Step 1: Add a session-cached fetch**

```javascript
let _crmMentionPool = null; // [{id, full_name, role}]
async function _crmGetMentionPool() {
  if (_crmMentionPool) return _crmMentionPool;
  const { data } = await sb.from('profiles')
    .select('id, full_name, role')
    .in('role', ['developer', 'sales', 'admin'])
    .neq('id', currentUser?.id || '00000000-0000-0000-0000-000000000000')
    .order('full_name');
  _crmMentionPool = data || [];
  return _crmMentionPool;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/crm.js
git commit -m "feat(crm): cache mentionable-user pool (developer/sales/admin)"
```

---

### Task 16: @ autocomplete popup attached to `#act-body`

**Files:**
- Modify: `src/crm.js`

- [ ] **Step 1: Add the autocomplete controller**

```javascript
let _crmAtState = { active: false, anchorStart: -1, query: '', idx: 0, items: [], chosen: [] };

function _crmAtInit(inputEl) {
  if (!inputEl) return;
  inputEl.dataset.atWired = '1';
  _crmAtState.chosen = [];
  inputEl.addEventListener('input', (e) => _crmAtOnInput(inputEl, e));
  inputEl.addEventListener('keydown', (e) => _crmAtOnKeyDown(inputEl, e));
  inputEl.addEventListener('blur', () => setTimeout(_crmAtClose, 150));
}

async function _crmAtOnInput(inputEl) {
  const val = inputEl.value;
  const caret = inputEl.selectionStart || val.length;
  // Look backward from caret for @ that starts a word
  let i = caret - 1;
  while (i >= 0 && /[A-Za-z0-9_]/.test(val[i])) i--;
  if (i < 0 || val[i] !== '@' || (i > 0 && /\w/.test(val[i-1]))) { _crmAtClose(); return; }
  const query = val.slice(i + 1, caret).toLowerCase();
  _crmAtState.active = true;
  _crmAtState.anchorStart = i;
  _crmAtState.query = query;
  const pool = await _crmGetMentionPool();
  _crmAtState.items = pool.filter(p => (p.full_name||'').toLowerCase().includes(query)).slice(0, 8);
  _crmAtState.idx = 0;
  _crmAtRender(inputEl);
}

function _crmAtRender(inputEl) {
  let pop = document.getElementById('crm-at-popup');
  if (!pop) {
    pop = document.createElement('div');
    pop.id = 'crm-at-popup';
    pop.className = 'crm-at-popup';
    document.body.appendChild(pop);
  }
  if (!_crmAtState.items.length) { _crmAtClose(); return; }
  pop.innerHTML = _crmAtState.items.map((p, i) => `
    <div class="crm-at-item ${i === _crmAtState.idx ? 'active' : ''}"
         onmousedown="event.preventDefault(); _crmAtPick(${i})">
      <span>${esc(p.full_name || p.id)}</span><span class="role">${esc(p.role||'')}</span>
    </div>
  `).join('');
  const rect = inputEl.getBoundingClientRect();
  pop.style.left = rect.left + 'px';
  pop.style.top = (rect.bottom + 4 + window.scrollY) + 'px';
  pop.style.display = '';
}

function _crmAtClose() {
  _crmAtState.active = false;
  const pop = document.getElementById('crm-at-popup');
  if (pop) pop.style.display = 'none';
}

function _crmAtOnKeyDown(inputEl, e) {
  if (!_crmAtState.active) return;
  if (e.key === 'ArrowDown') { e.preventDefault();
    _crmAtState.idx = (_crmAtState.idx + 1) % _crmAtState.items.length; _crmAtRender(inputEl); }
  else if (e.key === 'ArrowUp') { e.preventDefault();
    _crmAtState.idx = (_crmAtState.idx - 1 + _crmAtState.items.length) % _crmAtState.items.length; _crmAtRender(inputEl); }
  else if (e.key === 'Enter') { e.preventDefault(); _crmAtPick(_crmAtState.idx); }
  else if (e.key === 'Escape') { _crmAtClose(); }
}

window._crmAtPick = function(idx) {
  const inputEl = document.getElementById('act-body');
  if (!inputEl) return;
  const item = _crmAtState.items[idx];
  if (!item) return;
  const before = inputEl.value.slice(0, _crmAtState.anchorStart);
  const after  = inputEl.value.slice(inputEl.selectionStart || inputEl.value.length);
  const marker = `@[${item.full_name || item.id}](${item.id}) `;
  inputEl.value = before + marker + after;
  inputEl.focus();
  const caret = (before + marker).length;
  inputEl.setSelectionRange(caret, caret);
  if (!_crmAtState.chosen.find(c => c.id === item.id)) _crmAtState.chosen.push(item);
  _crmAtClose();
};
```

- [ ] **Step 2: Wire init into `viewLead()` (the lead detail modal)**

Find the spot inside `viewLead` where the modal markup has just been rendered (after `openModal(...)`). Right before the existing `setTimeout` that scrolls the feed to the bottom, add:

```javascript
setTimeout(() => {
  const inputEl = document.getElementById('act-body');
  if (inputEl && !inputEl.dataset.atWired) _crmAtInit(inputEl);
}, 80);
```

- [ ] **Step 3: Smoke test**

Open any lead. Type `@` in the activity input. A popup should appear with mentionable users; arrow keys + Enter should insert `@[Name](uuid)` into the input.

- [ ] **Step 4: Commit**

```bash
git add src/crm.js
git commit -m "feat(crm): @ autocomplete popup wired into lead activity input"
```

---

### Task 17: Submit mentions array + render chips in feed

**Files:**
- Modify: `src/crm.js`

- [ ] **Step 1: Update `addLeadActivity` to pass `mentions[]`**

Find the existing insert in `addLeadActivity` (around line 1007). Add `mentions` to the payload:

```javascript
const mentions = _crmAtState.chosen.map(c => c.id);
_crmAtState.chosen = []; // reset for next post

const {error} = await sb.from('crm_lead_activities').insert({
  lead_id: id,
  author_id: currentUser?.id,
  author_name: authorName,
  method,
  contacted_at: isTask ? new Date().toISOString() : (dateVal ? new Date(dateVal).toISOString() : new Date().toISOString()),
  due_at: isTask && dateVal ? new Date(dateVal).toISOString() : null,
  body,
  completed: false,
  parent_id: parentId,
  assigned_to: assignedToId,
  assigned_to_name: assignedToName,
  mentions,                  // ← new
});
```

Also handle the error case for the CHECK constraint cleanly:

```javascript
if(error) {
  _crmReplyTo = parentId;
  if ((error.message||'').includes('crm_activities_mentions_max_10')) {
    toast('Maximum 10 mentions per comment', 'error');
  } else {
    toast('Error: '+error.message, 'error');
  }
  return;
}
```

- [ ] **Step 2: Update `_renderActItem` to render mention chips**

Find the line that currently emits `<div class="act-body">${esc(a.body)}</div>` (around line 847). Replace with:

```javascript
<div class="act-body">${_crmRenderMentionedText(a.body || '')}</div>
```

`_crmRenderMentionedText` already exists from Task 13.

- [ ] **Step 3: Smoke test**

Post a comment containing `@[Someone Else](uuid)` on a lead. Activity feed should show the name as a blue chip. A `crm_notifications` row for that user should appear (verify via SQL).

- [ ] **Step 4: Commit**

```bash
git add src/crm.js
git commit -m "feat(crm): submit mentions[] on activity insert; render @[Name](uuid) chips"
```

---

## Phase 5 — Dashboard Widget

### Task 18: "Needs your attention" card on CRM Home

**Files:**
- Modify: `src/crm.js`

- [ ] **Step 1: Add the render function**

```javascript
function _crmNotifRefreshHomeWidget() {
  const slot = document.getElementById('ch-attn-slot');
  if (!slot) return;
  const unread = _crmNotifState.rows.filter(r => !r.read_at).slice(0, 5);
  if (!unread.length) { slot.innerHTML = ''; return; }
  slot.innerHTML = `
    <div class="ch-attn">
      <div class="ch-attn-hdr">
        🔔 Needs your attention
        <span class="ch-attn-badge">${_crmNotifState.unread}</span>
        <span class="ch-attn-markall" onclick="crmMarkAllNotifsRead()">Mark all read</span>
      </div>
      ${unread.map(_crmAttnRowHtml).join('')}
      ${_crmNotifState.unread > 5
        ? `<div style="text-align:center;padding-top:8px"><a href="#" onclick="nav('crm-notifications',document.getElementById('n-crm-notifications'));return false">+${_crmNotifState.unread - 5} more</a></div>`
        : ''}
    </div>
  `;
  // Auto-mark visible as read
  _crmNotifMarkRead(unread.map(r => r.id));
}

function _crmAttnRowHtml(r) {
  const initials = (r.actor_name || '?').split(/\s+/).slice(0,2).map(s => s[0]||'').join('').toUpperCase();
  const verb = r.type === 'reply' ? 'replied' : 'mentioned you';
  const leadLabel = (window._crmLeadNameCache && window._crmLeadNameCache[r.lead_id]) || 'Lead';
  return `<div class="ch-attn-row" onclick="crmOpenNotif('${r.id}','${r.lead_id}','${r.activity_id}')">
    <div class="crm-notif"><div class="avatar">${esc(initials)}</div></div>
    <div style="flex:1">
      <div class="lead">${esc(leadLabel)}</div>
      <div class="meta">${esc(r.actor_name)} ${verb} · ${_crmRelTime(r.created_at)}</div>
      <div class="snippet">"${_crmRenderMentionedText(r.snippet)}"</div>
    </div>
    <div class="open">Open →</div>
  </div>`;
}
```

- [ ] **Step 2: Add the slot to the CRM Home markup**

Open `renderCRMHome()` in `src/crm.js`. Find where the left column HTML is assembled (around line 262). Add a slot div at the very top of the left column:

```javascript
<div class="crm-home-left">
  <div id="ch-attn-slot"></div>
  <!-- existing overdue/dueToday/etc. blocks -->
```

After the page is inserted into the DOM (end of `renderCRMHome`), call:

```javascript
_crmNotifRefreshHomeWidget();
```

- [ ] **Step 3: Smoke test**

Open CRM Home with at least one unread notification. The card should appear above other content with up to 5 rows. Click "Open →" → navigates to lead.

- [ ] **Step 4: Commit**

```bash
git add src/crm.js
git commit -m "feat(crm-home): \"Needs your attention\" card surfaces unread notifications"
```

---

## Phase 6 — Inbox Page

### Task 19: Inbox page render with tabs

**Files:**
- Modify: `src/crm.js`

- [ ] **Step 1: Add render + tab state**

```javascript
let _crmInboxTab = 'all'; // all | mention | reply | unread

async function renderCrmNotifications() {
  initCrmNotifications();
  document.querySelectorAll('.notif-tab').forEach(btn => {
    btn.onclick = () => { _crmInboxTab = btn.dataset.tab; _crmInboxRender(); };
    btn.classList.toggle('active', btn.dataset.tab === _crmInboxTab);
  });
  const mark = document.getElementById('crm-notif-mark-all');
  if (mark) mark.onclick = crmMarkAllNotifsRead;
  _crmInboxRender();
}

function _crmInboxRender() {
  const list = document.getElementById('crm-notif-list');
  if (!list) return;
  let rows = _crmNotifState.rows;
  if (_crmInboxTab === 'mention') rows = rows.filter(r => r.type === 'mention');
  else if (_crmInboxTab === 'reply')   rows = rows.filter(r => r.type === 'reply');
  else if (_crmInboxTab === 'unread')  rows = rows.filter(r => !r.read_at);
  if (!rows.length) {
    list.innerHTML = '<div style="padding:32px;text-align:center;color:#9ca3af">Nothing here</div>';
    return;
  }
  list.innerHTML = rows.map(_crmNotifRowHtml).join('');

  // Auto-mark visible-unread as read
  const unreadIds = rows.filter(r => !r.read_at).map(r => r.id);
  if (unreadIds.length) _crmNotifMarkRead(unreadIds);
}

function _crmNotifRefreshInboxIfActive() {
  const sec = document.getElementById('sec-crm-notifications');
  if (sec && sec.style.display !== 'none') _crmInboxRender();
}
```

- [ ] **Step 2: Wire `renderCrmNotifications` into nav**

Find the central nav dispatcher (search `function nav(` in `index.html` or `src/`). Add a case for `crm-notifications`:

```javascript
} else if (page === 'crm-notifications') {
  renderCrmNotifications();
```

(Match the pattern of existing CRM cases.)

- [ ] **Step 3: Smoke test**

Click "View all notifications →" in the bell dropdown → should land on `#sec-crm-notifications`. Tabs should filter. Bell badge should shrink as items auto-mark on view.

- [ ] **Step 4: Commit**

```bash
git add src/crm.js index.html
git commit -m "feat(crm): inbox page with All/Mentions/Replies/Unread tabs"
```

---

### Task 20: Pagination "Load more"

**Files:**
- Modify: `src/crm.js`

- [ ] **Step 1: Add the load-more handler**

```javascript
async function _crmInboxLoadMore() {
  const offset = _crmNotifState.rows.length;
  const { data } = await sb.from('crm_notifications')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('read_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false })
    .range(offset, offset + 49);
  if (!data?.length) {
    document.getElementById('crm-notif-loadmore').style.display = 'none';
    return;
  }
  _crmNotifState.rows.push(...data);
  // populate name cache for new lead_ids
  const newLeadIds = [...new Set(data.map(r => r.lead_id))]
    .filter(id => !(window._crmLeadNameCache && window._crmLeadNameCache[id]));
  if (newLeadIds.length) {
    const { data: leads } = await sb.from('crm_leads').select('id,name').in('id', newLeadIds);
    window._crmLeadNameCache = window._crmLeadNameCache || {};
    (leads||[]).forEach(l => { window._crmLeadNameCache[l.id] = l.name; });
  }
  _crmInboxRender();
}
```

- [ ] **Step 2: Wire the button**

In `renderCrmNotifications()`, after the tab setup, add:

```javascript
const loadMoreBox = document.getElementById('crm-notif-loadmore');
if (loadMoreBox) {
  loadMoreBox.style.display = _crmNotifState.rows.length >= 50 ? '' : 'none';
  loadMoreBox.querySelector('button').onclick = _crmInboxLoadMore;
}
```

In `_crmInboxLoadMore` after append, also update the visible/hidden state:

```javascript
const box = document.getElementById('crm-notif-loadmore');
if (box) box.style.display = data.length >= 50 ? '' : 'none';
```

- [ ] **Step 3: Smoke test**

Seed ≥ 60 rows. Open inbox. Click "Load more" — appends next batch.

- [ ] **Step 4: Commit**

```bash
git add src/crm.js
git commit -m "feat(crm): paginate inbox with Load more (50 per page)"
```

---

## Phase 7 — Final Integration

### Task 21: Reply UX visual confirmation

**Files:**
- Modify: `src/crm.js`

The reply pipeline already exists (`startActReply`, `_crmReplyTo`, `cancelActReply`). Verify it still passes `parent_id` correctly now that `mentions[]` is also being sent.

- [ ] **Step 1: Manual smoke**

1. Log in as User A. Post a note on a lead.
2. Log out, log in as User B. Click "↩ Reply" on User A's note. Post a reply.
3. Confirm `crm_notifications` has one `reply` row for User A.
4. Log in as User A. Bell badge = 1. Open dropdown — row says "User B replied to your comment on <Lead>". Click → lands at the reply with flash highlight.

- [ ] **Step 2: If anything is broken, fix in this task and commit. Otherwise no code change.**

```bash
# only if changes were made
git add src/crm.js
git commit -m "fix(crm): reply UX integration with notifications"
```

---

### Task 22: End-to-end smoke test in a real browser

**Files:**
- No changes (verification only)

- [ ] **Step 1: Start the dev server**

This app is a static SPA — serve via:

```bash
npx http-server . -p 5500 -c-1
```

Open `http://localhost:5500/index.html`.

- [ ] **Step 2: Run the full flow as two users**

1. User A logs in, opens lead X, posts a comment that `@`-mentions User B.
2. Without reloading, User B (in a second browser/incognito) is also logged in on CRM Home. Within a second, the bell badge should bump to 1 and the "Needs your attention" card should populate via realtime.
3. User B clicks the notification → navigates to lead X → activity is highlighted.
4. Badge drops to 0; card disappears.

- [ ] **Step 3: Confirm test suite still green**

```bash
node --test tests/crm-notifications.test.js
node --test tests/contracts-crm-rls.test.js
```

Expected: all green.

- [ ] **Step 4: Final commit (if any tidy-up)**

```bash
git status
# only if cleanup edits were needed
git add -p && git commit -m "chore(crm): final tidy after mentions e2e"
```

---

## Out of Scope (per spec)

- Email notifications
- Watching/following a lead for all activity
- Push / browser notifications
- Per-user notification preferences
- Mention edits (changing `mentions[]` after insert)
- Cross-project notifications

## Done When

- All 22 task checkboxes are checked.
- `node --test tests/crm-notifications.test.js` and `node --test tests/contracts-crm-rls.test.js` pass.
- Bell + dropdown + dashboard widget + inbox page all visible and functional in the browser.
- Realtime delivers a new notification within ~2s across browser sessions.
