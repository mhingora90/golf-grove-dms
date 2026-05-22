# CRM Dashboard — Design Spec
**Date:** 2026-05-22  
**Status:** Approved for implementation

## Overview

A Salesforce-style CRM Home page added as a new section inside the existing SPA (`index.html`). Replaces the CRM entry point — when a sales/admin user opens CRM, they land here first. Shows a full-picture daily summary: overdue tasks, today's tasks, weekly calendar, going-cold leads, pipeline breakdown, and recent activity.

## Data Sources

| Table | Used for |
|---|---|
| `crm_leads` | Pipeline counts, active leads, going cold, no-task-set list |
| `crm_lead_activities` | Tasks (method='task'), recent activity feed |

**Tasks** are `crm_lead_activities` rows where `method = 'task'`. No separate tasks table.  
**Scoping:** All queries filter to `author_id = auth.uid()` for tasks; `assigned_to = currentProfile.name` for leads (matches existing CRM pattern).

## Layout

### KPI Row (5 tiles)
| Tile | Query | Color |
|---|---|---|
| Overdue Tasks | activities: method=task, completed=false, due_at < now() | Amber |
| Due Today | activities: method=task, completed=false, due_at::date = today | Default |
| Active Leads | leads: stage NOT IN (closed_won, closed_lost) | Blue |
| Won This Month | leads: stage=closed_won, updated_at >= month start | Green |
| No Task Set | leads with no open task | Default |

*Won This Month uses `updated_at` as proxy — no stage-change history table exists.*

### Left Column (main content)

**Overdue** — table: lead name + task body, days overdue, stage badge, Open Lead button. Red tint rows.

**Due Today** — list: activity type icon, lead name, task body, time. Open Lead button.

**This Week** — 5-column day bar (Mon–Fri). Each column: day label + count of tasks due that day. Clickable to filter (future).

**Going Cold** — leads where `last_contacted_at < now() - 7 days` OR (`last_contacted_at IS NULL AND created_at < now() - 7 days`). Shows lead name, stage badge, days since last contact, Open Lead button.

### Right Sidebar

**Pipeline** — horizontal bar per stage showing count. 7 stages in order:
1. new_lead (amber)
2. contacted_responded (blue)
3. contacted_no_response (grey)
4. site_visit (green)
5. follow_up (sand)
6. closed_won (green-light)
7. closed_lost (red)

**Leads with No Task Set** — list of lead names with "Add Task" button each. Max 8 shown, "+N more" link.

**Recent Activity** — last 10 activity entries (all methods, not just tasks). Shows method icon, lead name, body snippet, relative time (e.g. "2h ago").

## Implementation Approach

### Where it lives
New page section in `index.html` with nav id `n-crm-home`. Added to the Sales nav group above the existing CRM leads view. Module id: `crm-home`.

### Data loading
Single JS function `loadCRMDashboard()` called when page becomes active. Runs 4 parallel Supabase queries:
1. Overdue + today's tasks (activities, joined to leads for name/stage)
2. This week's tasks (activities, due_at between Monday and Sunday)
3. Going cold leads
4. All leads (for pipeline counts + no-task-set)
5. Recent activity (last 10 activities)

Results cached in module-scoped variables, re-fetched on tab focus.

### Rendering
Pure DOM manipulation following existing SPA patterns (no framework). Reuses existing CSS variables and badge styles from the CRM module. No new dependencies.

### Navigation
- Default landing for `crm` nav becomes `crm-home` (already done for admin role; apply to sales too)
- "Open Lead" buttons navigate to existing lead detail view

## Stages Reference
```javascript
const CRM_STAGES = [
  { key: 'new_lead',              label: 'New Lead',    color: 'var(--amber)' },
  { key: 'contacted_responded',   label: 'Contacted',   color: 'var(--blue)' },
  { key: 'contacted_no_response', label: 'No Response', color: 'var(--text3)' },
  { key: 'site_visit',            label: 'Site Visit',  color: 'var(--green)' },
  { key: 'follow_up',             label: 'Follow-Up',   color: 'var(--sand)' },
  { key: 'closed_won',            label: 'Closed Won',  color: 'var(--green)' },
  { key: 'closed_lost',           label: 'Closed Lost', color: 'var(--red)' },
];
```

## Out of Scope
- Filtering/sorting on dashboard (future)
- Push notifications for overdue
- Cross-user views (admin sees all — future)
- Charts library — pipeline uses CSS bar widths only
