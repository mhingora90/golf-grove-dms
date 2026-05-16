# Multi-Project Support — Design Spec

**Date:** 2026-05-16  
**Status:** Approved

---

## Problem

App is hard-coded to a single project (Golf Grove – DPC). Developer needs to manage multiple construction projects, each with isolated data. Non-developer users should only see projects they've been assigned to.

---

## Decision

Add a `projects` table and `project_users` join table. Scope every module's data by `project_id`. Add a project selection landing page (shown after login) and a project switcher in the topbar (shown when inside a project). All module UIs remain unchanged.

---

## Screens

### Screen 1 — Project Grid (shown after login, or when `currentProject === null`)

- Logo in topbar only (no module nav)
- "Projects" heading + "Select a project to open it" subtitle
- Grid of project cards (auto-fill columns, min 220px)
- Each card shows: emoji icon, project name, active status dot
- Card footer: avatar initials of assigned users + "Manage users" pill (developer only)
- "+ New Project" button top-right — developer only; opens modal
- Users with 1 assigned project skip the grid and go straight in on login

### Screen 2 — Inside a Project (current app UI, unchanged)

Topbar gains two new elements between logo and module tabs:

```
[Golf Grove DMS]  |  [🟡 Golf Grove – DPC ▾]  |  [BOQ] [IPC] [CRM] … [avatar]
```

- **Project switcher pill** — click opens dropdown listing user's assigned projects, active project has ✓, "+ New Project" at bottom (developer only), "All Projects" link returns to grid
- **Dividers** (0.5px `var(--border2)`) between logo, switcher, and module tabs
- Switching project reloads the current module scoped to the new project
- All module tabs, layout, interactions: **unchanged**

---

## Data Model

### New tables

```sql
CREATE TABLE projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_at  timestamptz DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id)
);

CREATE TABLE project_users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (project_id, user_id)
);
```

### Tables that get `project_id` column

All existing project-scoped tables receive:
```sql
ALTER TABLE <table> ADD COLUMN project_id uuid REFERENCES projects(id);
```

Tables: `drawings`, `submittals`, `submittal_register`, `inspections`, `ncrs`, `rfis`, `transmittals`, `correspondence`, `punch_list`, `method_statements`, `subcontractors`, `boq_bills`, `payment_certificates`, `crm_leads`, `units`

Child tables (`drawing_revisions`, `boq_items`, `payment_certificate_items`, `unit_sales`, `payment_milestones`) inherit project scope via their FK parent — no column needed.

Global tables (no `project_id`): `profiles`, `attachments`, `comments`, `document_audit_log`

### Migration: seed first project

```sql
INSERT INTO projects (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'Golf Grove – DPC');
-- Assign all existing rows to this project
UPDATE drawings              SET project_id = '00000000-0000-0000-0000-000000000001';
UPDATE submittals            SET project_id = '00000000-0000-0000-0000-000000000001';
UPDATE submittal_register    SET project_id = '00000000-0000-0000-0000-000000000001';
UPDATE inspections           SET project_id = '00000000-0000-0000-0000-000000000001';
UPDATE ncrs                  SET project_id = '00000000-0000-0000-0000-000000000001';
UPDATE rfis                  SET project_id = '00000000-0000-0000-0000-000000000001';
UPDATE transmittals          SET project_id = '00000000-0000-0000-0000-000000000001';
UPDATE correspondence        SET project_id = '00000000-0000-0000-0000-000000000001';
UPDATE punch_list            SET project_id = '00000000-0000-0000-0000-000000000001';
UPDATE method_statements     SET project_id = '00000000-0000-0000-0000-000000000001';
UPDATE subcontractors        SET project_id = '00000000-0000-0000-0000-000000000001';
UPDATE boq_bills             SET project_id = '00000000-0000-0000-0000-000000000001';
UPDATE payment_certificates  SET project_id = '00000000-0000-0000-0000-000000000001';
UPDATE crm_leads             SET project_id = '00000000-0000-0000-0000-000000000001';
UPDATE units                 SET project_id = '00000000-0000-0000-0000-000000000001';
-- Add all existing profiles to the project
INSERT INTO project_users (project_id, user_id)
  SELECT '00000000-0000-0000-0000-000000000001', id FROM auth.users;
-- Make project_id NOT NULL after backfill
ALTER TABLE drawings             ALTER COLUMN project_id SET NOT NULL;
-- (repeat for all tables above)
```

### RLS

- `projects`: `SELECT` — developer sees all; others see only projects in their `project_users` rows. `INSERT/UPDATE/DELETE` — developer only.
- `project_users`: `SELECT` — developer sees all; others see own rows. `INSERT/DELETE` — developer only.
- All module tables: existing policies extended with `project_id IN (SELECT project_id FROM project_users WHERE user_id = auth.uid())`. Developer bypasses via `is_developer()` (existing helper).

---

## App State

```js
let currentProject = null;  // { id, name } — null = show project grid
let userProjects    = [];    // [{ id, name }, …] — fetched once after login, used by switcher
```

### Routing

`renderApp()` (or equivalent top-level router) checks:
```js
if (!currentProject) { renderProjectGrid(); return; }
// else fall through to existing module routing
```

### Topbar

Current topbar renders module tabs only. When `currentProject !== null`, prepend:
```
[divider] [project switcher pill] [divider]
```
before the module tab list. No other topbar changes.

### All render functions

Every module `render*()` function that queries a project-scoped table adds:
```js
q = q.eq('project_id', currentProject.id);
```

Every module insert/create adds:
```js
project_id: currentProject.id
```

No other changes to module logic.

---

## Components

### `renderProjectGrid()`

Queries `projects` (filtered by `project_users` via RLS). Renders grid of cards. Developer sees "+ New Project" button and "Manage users" per card.

### `openNewProject()`

Modal with single text input "Project name". On confirm: `INSERT INTO projects`, then `INSERT INTO project_users` to assign current user, then refresh grid.

### `openManageUsers(projectId)`

Modal listing `profiles` joined to `project_users` for this project. Checkboxes to add/remove users. On save: diff and INSERT/DELETE `project_users` rows. Developer only.

### Project switcher pill

```html
<div class="proj-switcher" onclick="toggleProjectDropdown()">
  <div class="proj-dot"></div>
  <span id="proj-switcher-name">{currentProject.name}</span>
  <span class="proj-caret">▾</span>
</div>
```

Dropdown (`id="proj-dropdown"`) built from user's projects list (fetched once at login, stored in `userProjects[]`). Clicking a row calls `switchProject(project)`.

### `switchProject(project)`

```js
function switchProject(project) {
  currentProject = project;
  closeProjectDropdown();
  // re-render current module
  const handlers = { crm: renderCRM, ms: renderMS, ... };
  (handlers[currentPage] || (() => {}))();
}
```

### `returnToProjects()`

```js
function returnToProjects() {
  currentProject = null;
  renderProjectGrid();
}
```

---

## What's Unchanged

- All module render functions (only add 1 filter line each)
- All module UIs, modals, forms
- Auth flow (`initAuth`, `onAuthStateChange`)
- Role/permission system (`can()`, `currentProfile`)
- Design system tokens, CSS

---

## Out of Scope

- Project archiving / soft-delete
- Per-project roles (same role applies across all projects)
- Project-level settings (currency, timezone, etc.)
- Activity feed across projects
