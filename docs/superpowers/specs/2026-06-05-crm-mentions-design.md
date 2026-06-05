# CRM Mentions & Notifications — Design Spec

**Date:** 2026-06-05
**Status:** Approved for implementation
**Module:** CRM (`#crm`, `#crm-home`)

## Overview

Slack-style @mentions and reply notifications on lead comments. Users who are mentioned or whose comment is replied to receive an in-app notification visible via:

1. **Bell icon with unread badge** in the CRM toolbar (every CRM page).
2. **Dropdown panel** showing the 10 most recent notifications.
3. **"Needs your attention" card** on the CRM Home dashboard.
4. **Full inbox page** at `#crm-notifications` for filtered history.

No email notifications in V1.

## Decisions (from brainstorming)

| Question | Choice | Reason |
|---|---|---|
| Trigger | Reply auto-notifies parent author **plus** explicit `@mention` | Slack default; users expect replies to notify even without `@` |
| Surfaces | Bell badge **plus** dashboard widget | Bell is always-visible; widget surfaces unread on the landing page |
| Read state | Auto-mark on view (open dropdown / open widget) | Slack-style — least friction |
| Email | None in V1 | Internal CRM; users already in the app most of the day |
| Mention pool | `developer` + `sales` + `admin` roles | All current CRM-access roles via `has_crm_access()` |
| Write path | Postgres trigger on `crm_lead_activities` insert | Decoupled, can't be bypassed by future insert paths (mobile, sync, Zoho) |

## Data Model

### New column on `crm_lead_activities`

```sql
ALTER TABLE crm_lead_activities
  ADD COLUMN mentions uuid[] NOT NULL DEFAULT '{}',
  ADD CONSTRAINT crm_activities_mentions_max_10
    CHECK (array_length(mentions, 1) IS NULL OR array_length(mentions, 1) <= 10);
```

Client populates `mentions` from the `@` autocomplete at insert time. Trigger reads the array; no body parsing.

### New table `crm_notifications`

```sql
CREATE TABLE crm_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('mention', 'reply')),
  lead_id     uuid NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES crm_lead_activities(id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name  text NOT NULL,
  snippet     text NOT NULL,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX crm_notifications_user_unread_idx
  ON crm_notifications (user_id, read_at NULLS FIRST, created_at DESC);

CREATE INDEX crm_notifications_activity_idx
  ON crm_notifications (activity_id);
```

`snippet` = `LEFT(body, 140)` — denormalized for fast render without joins. `actor_name` denormalized for the same reason and to survive actor deletion.

### RLS

```sql
ALTER TABLE crm_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own notifications: select"
  ON crm_notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "own notifications: update read_at"
  ON crm_notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

No INSERT policy — only the `SECURITY DEFINER` trigger writes. No DELETE policy — cascade only.

## Trigger Logic

```sql
CREATE OR REPLACE FUNCTION fan_out_crm_notifications()
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
  IF NEW.method <> 'comment' THEN
    RETURN NEW;
  END IF;

  v_actor_name := COALESCE(NEW.author_name, 'Someone');
  v_snippet    := LEFT(COALESCE(NEW.body, ''), 140);

  FOREACH v_recipient IN ARRAY NEW.mentions LOOP
    IF v_recipient <> NEW.author_id THEN
      INSERT INTO crm_notifications
        (user_id, type, lead_id, activity_id, actor_id, actor_name, snippet)
      VALUES
        (v_recipient, 'mention', NEW.lead_id, NEW.id,
         NEW.author_id, v_actor_name, v_snippet)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  IF NEW.parent_id IS NOT NULL THEN
    SELECT author_id INTO v_parent_author
    FROM crm_lead_activities
    WHERE id = NEW.parent_id;

    IF v_parent_author IS NOT NULL
       AND v_parent_author <> NEW.author_id
       AND NOT (v_parent_author = ANY(NEW.mentions))
    THEN
      INSERT INTO crm_notifications
        (user_id, type, lead_id, activity_id, actor_id, actor_name, snippet)
      VALUES
        (v_parent_author, 'reply', NEW.lead_id, NEW.id,
         NEW.author_id, v_actor_name, v_snippet);
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_fan_out_crm_notifications
  AFTER INSERT ON crm_lead_activities
  FOR EACH ROW
  EXECUTE FUNCTION fan_out_crm_notifications();
```

**Rules enforced:**

- Fires only when `method = 'comment'`.
- Self-actions skipped (`recipient <> actor`).
- Same person mentioned **and** parent author → single `mention` row (de-dupe block).
- Atomic with the comment insert; trigger failure rolls back the comment.

## UI Components

### 1. Bell + badge in CRM toolbar

- Visible on `#crm-home`, `#crm`, `#crm-notifications` (and any new CRM sub-page).
- Badge: red circle with unread count. Hidden when count = 0. Cap display at `99+`.
- Click opens dropdown panel anchored below the bell.

### 2. Bell dropdown

- Width ~380px, max-height ~520px scrollable.
- Header: title + "Mark all read" link.
- Body: up to 10 most recent (unread first, then read). Each row:
  - Actor avatar (initials, color by hash of name)
  - Meta line: **Actor** mentioned you on **Lead Name** + pill (`mention` blue / `reply` green)
  - Snippet: 140-char body excerpt, mentions rendered as colored chips
  - Relative time
- Footer: "View all notifications →" → `#crm-notifications`
- Opening the dropdown auto-marks all currently visible unread rows as read.

### 3. CRM Home "Needs your attention" card

- New section in `src/crm.js` `loadCRMDashboard()`.
- Position: top of left column, above "Overdue Tasks". Hidden if 0 unread.
- Shows up to 5 unread items. "+N more" link → `#crm-notifications`.
- Same per-row layout as dropdown rows. "Open →" pill jumps to lead.
- Opening CRM Home auto-marks visible rows as read.

### 4. Full inbox page (`#crm-notifications`)

- New nav id `n-crm-notifications` under Sales group (next to `n-crm-home`).
- Tabs: **All** | **Mentions** | **Replies** | **Unread** (client-side filter on cached list).
- Initial load: 50 rows. "Load more" appends next 50.
- Per-row layout: same as dropdown but wider, with "Open Lead" button explicit.
- "Mark all read" button in header.

### 5. Comment box `@` autocomplete

- Trigger character: `@` followed by 1+ alphanumeric.
- Popup positioned at caret. Up/Down to navigate, Enter or click to select. Esc to dismiss.
- Source: `SELECT id, full_name, role FROM profiles WHERE role IN ('developer','sales','admin') AND id <> auth.uid() ORDER BY full_name`. Cache in memory for the session.
- Selecting inserts a token of the form `@[Full Name](user-uuid)` into the body string and pushes `user-uuid` into a tracked `mentions[]` array. Display in the textarea uses a contenteditable shim that renders the token as a colored chip; submitted body keeps the marker form.
- Renderer for the activity feed parses `@[Name](uuid)` and emits a blue mention chip. Plain `@text` (no marker) renders as literal text.
- On submit: insert into `crm_lead_activities` with `body` (marker form) + `mentions` (uuid[]) + `parent_id` if replying.

### 6. Reply UX

- Existing comments already render with `parent_id` threading in `src/crm.js`. Add a "Reply" button per comment that:
  - Sets `replyingTo = comment.id` in the comment box state
  - Shows "Replying to **Author Name** · cancel" strip above the Post button
  - On submit, sets `parent_id = replyingTo` in the insert

## Realtime Sync

```javascript
const channel = sb
  .channel(`crm-notifs-${userId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'crm_notifications',
    filter: `user_id=eq.${userId}`
  }, (payload) => {
    bumpBadge();
    prependToDropdown(payload.new);
    refreshHomeWidget();
  })
  .subscribe();
```

- Subscription started after auth on any CRM page.
- One channel per user — no per-lead subscriptions.
- Initial load fetches 50 most recent (unread first) and unread count via a separate `COUNT(*)`.

## Read State Mechanics

| Action | Effect |
|---|---|
| Open bell dropdown | `UPDATE … SET read_at = now() WHERE id = ANY($visible) AND read_at IS NULL` |
| Open CRM Home | Same, for the 5 rows shown in widget |
| Open inbox page | Same, for currently visible rows in selected tab |
| Click notification | Single-row update + navigate to lead + scroll to `#activity-${id}` + flash highlight 1.5s |
| "Mark all read" button | `UPDATE … SET read_at = now() WHERE user_id = me AND read_at IS NULL` |

## Edge Cases

- **Comment edited** — no new notification (trigger is `AFTER INSERT` only). Acceptable: edits are rare and rarely change mentions.
- **Comment deleted** — notifications cascade-delete.
- **Mentioned user deleted** — notifications cascade-delete.
- **Trigger error** — comment insert rolls back; user sees a generic error toast and can retry.
- **Mentioning self** — skipped silently.
- **Same person mentioned & parent author** — single `mention` row.
- **More than 10 mentions** — CHECK constraint rejects insert; client shows "Maximum 10 mentions per comment".

## Files Touched

- `supabase/migrations/20260606000001_crm_notifications.sql` — new table, RLS, trigger
- `supabase/migrations/20260606000002_crm_activities_mentions.sql` — column + constraint on `crm_lead_activities`
- `src/crm.js` — bell component, dropdown, widget integration, `@` autocomplete, reply UX, realtime subscription, inbox page
- `index.html` — nav item `n-crm-notifications` added to Sales nav group; bell DOM element mounted into the existing CRM toolbar bar (same row as "+ New Lead" / "↻ Sync" / "↓ Export Excel" buttons) so it appears across `#crm`, `#crm-home`, and `#crm-notifications`
- `tests/contracts-crm-rls.test.js` — extend with `crm_notifications` RLS coverage
- `tests/crm-notifications.test.js` — new: trigger fan-out, dedupe, self-skip

## Out of Scope (V1)

- Email notifications (Q4 = A)
- Watching / following a lead for all activity (Q1 = B, not C)
- Push / browser notifications
- Notification preferences per user
- Mentions on tasks (`method='task'`) — only `comment` triggers
- Cross-project notifications — CRM is single-project context
- Mention edits (changing `mentions[]` after insert) — no re-fan-out

## Stages Reference (unchanged)

See `docs/superpowers/specs/2026-05-22-crm-dashboard-design.md` for the canonical `CRM_STAGES` list. Notifications inherit the same stage badges where shown.
