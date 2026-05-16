# Multi-Project Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project isolation so a developer can create multiple projects, each with all modules scoped to its own data, with a project selection landing page and in-app project switcher.

**Architecture:** New `projects` + `project_users` tables gate access. A `#project-screen` div (sibling to `#auth-screen` / `#app-screen`) shows the project grid; clicking a card calls `setCurrentProject()` which hides the grid and shows the existing app. All module `render*()` functions get a single `.eq('project_id', currentProject.id)` filter; all inserts get `project_id: currentProject.id`. The topbar gains a project-switcher pill.

**Tech Stack:** Vanilla JS, Supabase (PostgREST + RLS), single `index.html`; Python 3 patch scripts for multi-line HTML edits (app already uses DOM-writing extensively — follow existing render function patterns throughout).

---

## File Map

| File | Change |
|---|---|
| `supabase/migrations/20260516000001_create_projects.sql` | Create `projects` + `project_users` tables |
| `supabase/migrations/20260516000002_add_project_id.sql` | Add `project_id` column to 15 tables, backfill, set NOT NULL |
| `supabase/migrations/20260516000003_rls_projects.sql` | RLS for new tables + project-scoped policies on module tables |
| `index.html` | All app changes (state, HTML, CSS, functions) |
| `patch_project_screen.py` | Temp — adds project-screen HTML + state vars |
| `patch_topbar_switcher.py` | Temp — adds switcher pill to topbar |
| `patch_scope_modules.py` | Temp — adds project_id filter to all render + insert calls |

---

### Task 1: DB — Create projects + project_users tables

**Files:**
- Create: `supabase/migrations/20260516000001_create_projects.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260516000001_create_projects.sql
CREATE TABLE IF NOT EXISTS public.projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_at  timestamptz DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.project_users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (project_id, user_id)
);
```

- [ ] **Step 2: Push to Supabase**

```bash
npx supabase db push
```

Expected: `Applying migration 20260516000001_create_projects.sql... done`

- [ ] **Step 3: Verify in Supabase Dashboard SQL Editor**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('projects','project_users');
```

Expected: 2 rows returned.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260516000001_create_projects.sql
git commit -m "db: create projects and project_users tables"
```

---

### Task 2: DB — Add project_id to all module tables + backfill

**Files:**
- Create: `supabase/migrations/20260516000002_add_project_id.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260516000002_add_project_id.sql

-- 1. Add nullable project_id to all module tables
ALTER TABLE public.drawings             ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id);
ALTER TABLE public.submittals           ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id);
ALTER TABLE public.submittal_register   ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id);
ALTER TABLE public.inspections          ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id);
ALTER TABLE public.ncrs                 ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id);
ALTER TABLE public.rfis                 ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id);
ALTER TABLE public.transmittals         ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id);
ALTER TABLE public.correspondence       ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id);
ALTER TABLE public.punch_list           ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id);
ALTER TABLE public.method_statements    ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id);
ALTER TABLE public.subcontractors       ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id);
ALTER TABLE public.boq_bills            ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id);
ALTER TABLE public.payment_certificates ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id);
ALTER TABLE public.crm_leads            ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id);
ALTER TABLE public.units                ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id);

-- 2. Create the first project
INSERT INTO public.projects (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Golf Grove - DPC')
ON CONFLICT (id) DO NOTHING;

-- 3. Backfill all existing rows
UPDATE public.drawings             SET project_id = '00000000-0000-0000-0000-000000000001' WHERE project_id IS NULL;
UPDATE public.submittals           SET project_id = '00000000-0000-0000-0000-000000000001' WHERE project_id IS NULL;
UPDATE public.submittal_register   SET project_id = '00000000-0000-0000-0000-000000000001' WHERE project_id IS NULL;
UPDATE public.inspections          SET project_id = '00000000-0000-0000-0000-000000000001' WHERE project_id IS NULL;
UPDATE public.ncrs                 SET project_id = '00000000-0000-0000-0000-000000000001' WHERE project_id IS NULL;
UPDATE public.rfis                 SET project_id = '00000000-0000-0000-0000-000000000001' WHERE project_id IS NULL;
UPDATE public.transmittals         SET project_id = '00000000-0000-0000-0000-000000000001' WHERE project_id IS NULL;
UPDATE public.correspondence       SET project_id = '00000000-0000-0000-0000-000000000001' WHERE project_id IS NULL;
UPDATE public.punch_list           SET project_id = '00000000-0000-0000-0000-000000000001' WHERE project_id IS NULL;
UPDATE public.method_statements    SET project_id = '00000000-0000-0000-0000-000000000001' WHERE project_id IS NULL;
UPDATE public.subcontractors       SET project_id = '00000000-0000-0000-0000-000000000001' WHERE project_id IS NULL;
UPDATE public.boq_bills            SET project_id = '00000000-0000-0000-0000-000000000001' WHERE project_id IS NULL;
UPDATE public.payment_certificates SET project_id = '00000000-0000-0000-0000-000000000001' WHERE project_id IS NULL;
UPDATE public.crm_leads            SET project_id = '00000000-0000-0000-0000-000000000001' WHERE project_id IS NULL;
UPDATE public.units                SET project_id = '00000000-0000-0000-0000-000000000001' WHERE project_id IS NULL;

-- 4. Assign all existing auth users to the first project
INSERT INTO public.project_users (project_id, user_id)
SELECT '00000000-0000-0000-0000-000000000001', id FROM auth.users
ON CONFLICT (project_id, user_id) DO NOTHING;

-- 5. Set NOT NULL after backfill
ALTER TABLE public.drawings             ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE public.submittals           ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE public.submittal_register   ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE public.inspections          ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE public.ncrs                 ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE public.rfis                 ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE public.transmittals         ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE public.correspondence       ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE public.punch_list           ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE public.method_statements    ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE public.subcontractors       ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE public.boq_bills            ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE public.payment_certificates ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE public.crm_leads            ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE public.units                ALTER COLUMN project_id SET NOT NULL;
```

- [ ] **Step 2: Push**

```bash
npx supabase db push
```

Expected: `Applying migration 20260516000002_add_project_id.sql... done`

- [ ] **Step 3: Verify backfill**

```sql
SELECT COUNT(*) FROM public.crm_leads WHERE project_id IS NULL;
SELECT COUNT(*) FROM public.project_users;
SELECT name FROM public.projects;
```

Expected: `0`, `>0`, `Golf Grove - DPC`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260516000002_add_project_id.sql
git commit -m "db: add project_id to all module tables, backfill to Golf Grove - DPC"
```

---

### Task 3: DB — RLS for projects, project_users, and module table extensions

**Files:**
- Create: `supabase/migrations/20260516000003_rls_projects.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260516000003_rls_projects.sql

-- Helper: returns project IDs the calling user belongs to
CREATE OR REPLACE FUNCTION public.user_project_ids()
RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT project_id FROM public.project_users WHERE user_id = auth.uid();
$$;

-- ── projects ────────────────────────────────────────────────────────
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects: select own"        ON public.projects;
DROP POLICY IF EXISTS "projects: insert developer"  ON public.projects;
DROP POLICY IF EXISTS "projects: update developer"  ON public.projects;
DROP POLICY IF EXISTS "projects: delete developer"  ON public.projects;

CREATE POLICY "projects: select own" ON public.projects
  FOR SELECT TO authenticated
  USING (public.is_developer()
    OR id IN (SELECT project_id FROM public.project_users WHERE user_id = auth.uid()));

CREATE POLICY "projects: insert developer" ON public.projects
  FOR INSERT TO authenticated WITH CHECK (public.is_developer());

CREATE POLICY "projects: update developer" ON public.projects
  FOR UPDATE TO authenticated
  USING (public.is_developer()) WITH CHECK (public.is_developer());

CREATE POLICY "projects: delete developer" ON public.projects
  FOR DELETE TO authenticated USING (public.is_developer());

-- ── project_users ────────────────────────────────────────────────────
ALTER TABLE public.project_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_users: select"          ON public.project_users;
DROP POLICY IF EXISTS "project_users: insert developer" ON public.project_users;
DROP POLICY IF EXISTS "project_users: delete developer" ON public.project_users;

CREATE POLICY "project_users: select" ON public.project_users
  FOR SELECT TO authenticated
  USING (public.is_developer() OR user_id = auth.uid());

CREATE POLICY "project_users: insert developer" ON public.project_users
  FOR INSERT TO authenticated WITH CHECK (public.is_developer());

CREATE POLICY "project_users: delete developer" ON public.project_users
  FOR DELETE TO authenticated USING (public.is_developer());

-- ── Project-scope policy on every module table ───────────────────────
-- Adds a new ALL policy scoped by project membership.
-- Developer bypasses via is_developer(); others restricted to their projects.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'drawings','submittals','submittal_register','inspections','ncrs',
    'rfis','transmittals','correspondence','punch_list','method_statements',
    'subcontractors','boq_bills','payment_certificates','crm_leads','units'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "project scope: %1$s" ON public.%1$s', t);
    EXECUTE format($p$
      CREATE POLICY "project scope: %1$s" ON public.%1$s
        FOR ALL TO authenticated
        USING (public.is_developer()
          OR project_id IN (SELECT public.user_project_ids()))
        WITH CHECK (public.is_developer()
          OR project_id IN (SELECT public.user_project_ids()))
    $p$, t);
  END LOOP;
END $$;
```

- [ ] **Step 2: Push**

```bash
npx supabase db push
```

Expected: `Applying migration 20260516000003_rls_projects.sql... done`

- [ ] **Step 3: Verify**

```sql
SELECT policyname, tablename FROM pg_policies
WHERE policyname LIKE 'project scope%' ORDER BY tablename;
```

Expected: 15 rows.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260516000003_rls_projects.sql
git commit -m "db: RLS for projects, project_users, project-scope policies on module tables"
```

---

### Task 4: App — State variables + CSS + project-screen HTML

**Files:**
- Modify: `index.html` via Edit tool (state vars, CSS) and Python scripts (HTML blocks)

- [ ] **Step 1: Add state variables**

In `index.html` find:
```js
let currentProfile = null;
```

Replace with:
```js
let currentProfile = null;
let currentProject = null;  // { id, name } — null means project grid is shown
let userProjects    = [];    // [{ id, name }, …] — populated after login
```

- [ ] **Step 2: Add CSS**

In `index.html`, find the closing tag of the main `<style>` block — look for the line `</style>` that ends the large CSS section near the top of the file. Insert the following block immediately before it:

```css
/* ── PROJECT SCREEN ──────────────────────────── */
#project-screen{display:none;min-height:100vh;background:var(--bg);flex-direction:column}
.ps-header{padding:28px 32px 0;display:flex;align-items:flex-end;justify-content:space-between}
.ps-title{font-size:22px;font-weight:700;color:var(--charcoal);letter-spacing:-.01em}
.ps-sub{font-size:12px;color:var(--text2);margin-top:3px}
.ps-grid{padding:24px 32px;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}
.pc{background:var(--bg2);border:0.5px solid var(--border);border-radius:var(--radius-lg);overflow:hidden;cursor:pointer;transition:border-color .18s,box-shadow .18s,transform .15s}
.pc:hover{border-color:var(--sand);box-shadow:0 4px 20px rgba(139,115,85,.12);transform:translateY(-2px)}
.pc-top{padding:16px 16px 12px;border-bottom:0.5px solid var(--border)}
.pc-icon{font-size:22px;margin-bottom:8px}
.pc-name{font-size:13px;font-weight:700;color:var(--charcoal)}
.pc-status{font-size:11px;color:var(--green);font-weight:600;margin-top:2px;display:flex;align-items:center;gap:4px}
.pc-status::before{content:'';display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--green)}
.pc-bot{padding:9px 16px;display:flex;align-items:center;gap:6px}
.pc-ustack{display:flex}
.pc-uchip{width:22px;height:22px;border-radius:50%;background:var(--bg4);border:1.5px solid var(--bg2);font-size:8px;font-weight:700;color:var(--text2);display:flex;align-items:center;justify-content:center;margin-left:-5px}
.pc-uchip:first-child{margin-left:0}
.pc-mgr{margin-left:auto;font-size:10px;color:var(--text2);padding:2px 8px;border:0.5px solid var(--border2);border-radius:20px;cursor:pointer;transition:color .15s,border-color .15s}
.pc-mgr:hover{color:var(--sand);border-color:var(--sand)}
.pc-new{background:var(--bg2);border:0.5px dashed var(--border2);border-radius:var(--radius-lg);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:28px 16px;cursor:pointer;min-height:110px;transition:border-color .18s,background .18s}
.pc-new:hover{border-color:var(--sand);background:var(--bg3)}
.pc-new-icon{font-size:22px;color:var(--text3)}
.pc-new-label{font-size:12px;font-weight:600;color:var(--text3)}
/* ── PROJECT SWITCHER ─────────────────────────── */
.psw-wrap{position:relative}
.psw-pill{display:flex;align-items:center;gap:6px;background:var(--bg3);border:0.5px solid var(--border2);border-radius:var(--radius);padding:5px 10px;cursor:pointer;font-size:12px;font-weight:700;color:var(--charcoal);transition:border-color .15s;white-space:nowrap}
.psw-pill:hover{border-color:var(--sand)}
.psw-dot{width:8px;height:8px;border-radius:50%;background:var(--amber);flex-shrink:0}
.psw-caret{font-size:9px;color:var(--text3);margin-left:2px}
.psw-dd{position:absolute;top:calc(100% + 6px);left:0;background:var(--bg2);border:0.5px solid var(--border2);border-radius:var(--radius-lg);padding:5px;min-width:190px;z-index:200;box-shadow:0 8px 24px rgba(44,42,36,.12);display:none}
.psw-dd.open{display:block}
.psw-item{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:var(--radius);font-size:12px;cursor:pointer;color:var(--text2);transition:background .1s}
.psw-item:hover,.psw-all:hover,.psw-new:hover{background:var(--bg3);color:var(--charcoal)}
.psw-item.active{color:var(--charcoal);font-weight:700}
.psw-idot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.psw-idot.on{background:var(--amber)}.psw-idot.off{background:var(--border2)}
.psw-check{margin-left:auto;font-size:10px;color:var(--sand)}
.psw-div{height:0.5px;background:var(--border);margin:4px 0}
.psw-all{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:var(--radius);font-size:11px;cursor:pointer;color:var(--text2)}
.psw-new{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:var(--radius);font-size:11px;cursor:pointer;color:var(--sand);font-weight:600}
.tb-proj-div{width:0.5px;height:18px;background:var(--border2);flex-shrink:0}
```

- [ ] **Step 3: Add project-screen HTML element via Python**

Write `patch_project_screen.py`:

```python
# patch_project_screen.py
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

OLD = '<!-- MODAL -->'
SCREEN = (
    '<div id="project-screen">\n'
    '  <div class="ps-header">\n'
    '    <div>\n'
    '      <div class="ps-title">Projects</div>\n'
    '      <div class="ps-sub">Select a project to continue</div>\n'
    '    </div>\n'
    '    <button id="proj-new-btn" class="btn btn-primary" onclick="openNewProject()" style="display:none">+ New Project</button>\n'
    '  </div>\n'
    '  <div class="ps-grid" id="proj-grid"></div>\n'
    '</div>\n\n'
    '<!-- MODAL -->'
)

assert OLD in html, 'FAIL: anchor <!-- MODAL --> not found'
html = html.replace(OLD, SCREEN, 1)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)
print('OK')
```

Run:
```bash
python patch_project_screen.py
```

Expected: `OK`

- [ ] **Step 4: Add project switcher to topbar via Python**

Write `patch_topbar_switcher.py`:

```python
# patch_topbar_switcher.py
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

OLD = '      <div class="topbar-right">'
assert html.count(OLD) == 1, f'Expected 1 match, got {html.count(OLD)}'

NEW = (
    '      <div class="psw-wrap" id="psw-wrap" style="display:none">\n'
    '        <div class="psw-pill" onclick="toggleProjectDropdown()">\n'
    '          <div class="psw-dot"></div>\n'
    '          <span id="psw-name"></span>\n'
    '          <span class="psw-caret">&#9660;</span>\n'
    '        </div>\n'
    '        <div class="psw-dd" id="psw-dd"></div>\n'
    '      </div>\n'
    '      <div class="tb-proj-div" id="tb-proj-div" style="display:none"></div>\n'
    '      <div class="topbar-right">'
)

html = html.replace(OLD, NEW, 1)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)
print('OK')
```

Run:
```bash
python patch_topbar_switcher.py
```

Expected: `OK`

- [ ] **Step 5: Smoke-test in browser (no errors)**

```bash
npx http-server . -p 3000 --cors -s
```

Open `http://localhost:3000`. App should load normally. No console errors. Project-screen and switcher are present in DOM but hidden.

- [ ] **Step 6: Commit**

```bash
git add index.html patch_project_screen.py patch_topbar_switcher.py
git commit -m "feat: project-screen HTML, topbar switcher pill, CSS, state vars"
```

---

### Task 5: App — renderProjectGrid()

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add the function**

In `index.html`, find the line:
```js
let userProjects    = [];    // [{ id, name }, …] — populated after login
```

Add the following block immediately after that line. Follow the existing app pattern: build an HTML string, then assign it to the container element's content (the same approach used in `renderMS()`, `renderCRM()`, etc.):

```js

// ─── PROJECT GRID ─────────────────────────────────────────────────
async function renderProjectGrid() {
  document.getElementById('auth-screen').style.display    = 'none';
  document.getElementById('app-screen').style.display     = 'none';
  document.getElementById('project-screen').style.display = 'flex';
  document.getElementById('psw-wrap').style.display       = 'none';
  document.getElementById('tb-proj-div').style.display    = 'none';

  const isDev = currentProfile?.role === 'developer';
  if (isDev) document.getElementById('proj-new-btn').style.display = '';

  const grid = document.getElementById('proj-grid');
  grid.textContent = '';
  const loadDiv = document.createElement('div');
  loadDiv.className = 'loading';
  loadDiv.textContent = 'Loading projects...';
  grid.appendChild(loadDiv);

  const { data: projects, error } = await sb.from('projects').select('*').order('created_at');
  if (error) {
    grid.textContent = '';
    const errP = document.createElement('p');
    errP.style.cssText = 'color:var(--red);padding:24px';
    errP.textContent = 'Failed to load projects.';
    grid.appendChild(errP);
    return;
  }
  userProjects = projects.map(p => ({ id: p.id, name: p.name }));

  const { data: puRows } = await sb.from('project_users').select('project_id, user_id');
  const countByProject = {};
  (puRows || []).forEach(r => {
    countByProject[r.project_id] = (countByProject[r.project_id] || 0) + 1;
  });

  grid.textContent = '';

  projects.forEach(p => {
    const n = countByProject[p.id] || 0;
    const card = document.createElement('div');
    card.className = 'pc';
    card.onclick = () => setCurrentProject({ id: p.id, name: p.name });

    const top = document.createElement('div');
    top.className = 'pc-top';

    const icon = document.createElement('div');
    icon.className = 'pc-icon';
    icon.textContent = '\u{1F3D7}';

    const name = document.createElement('div');
    name.className = 'pc-name';
    name.textContent = p.name;

    const status = document.createElement('div');
    status.className = 'pc-status';
    status.textContent = 'Active';

    top.appendChild(icon);
    top.appendChild(name);
    top.appendChild(status);

    const bot = document.createElement('div');
    bot.className = 'pc-bot';

    const ustack = document.createElement('div');
    ustack.className = 'pc-ustack';
    const chip = document.createElement('div');
    chip.className = 'pc-uchip';
    chip.textContent = String(n);
    ustack.appendChild(chip);
    bot.appendChild(ustack);

    if (isDev) {
      const mgr = document.createElement('span');
      mgr.className = 'pc-mgr';
      mgr.textContent = 'Manage users';
      mgr.onclick = e => { e.stopPropagation(); openManageUsers(p.id, p.name); };
      bot.appendChild(mgr);
    }

    card.appendChild(top);
    card.appendChild(bot);
    grid.appendChild(card);
  });

  if (isDev) {
    const newCard = document.createElement('div');
    newCard.className = 'pc-new';
    newCard.onclick = openNewProject;
    const ni = document.createElement('div');
    ni.className = 'pc-new-icon';
    ni.textContent = '+';
    const nl = document.createElement('div');
    nl.className = 'pc-new-label';
    nl.textContent = 'New Project';
    newCard.appendChild(ni);
    newCard.appendChild(nl);
    grid.appendChild(newCard);
  }
}
```

- [ ] **Step 2: Verify renders in browser**

Log in. Project grid should appear showing "Golf Grove - DPC" card with a user count chip and "Manage users" button. No console errors.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: renderProjectGrid() using DOM APIs (no unsafe HTML assignment)"
```

---

### Task 6: App — loadApp() routing + setCurrentProject() + returnToProjects()

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Update loadApp() — replace the final nav call with project routing**

In `index.html` find the block at the end of `loadApp()`:
```js
  // Restore page from URL hash, or default to dash
  const hash = location.hash.replace('#','');
  const defaultPage = ['dash','draw','sub','sreg','ir','ncr','rfi','trans','corr','punch','ms','subs','users','ipc','boq','finance','usetup','ureg','srev','crm'].includes(hash) ? hash : 'dash';
  const navEl = document.getElementById('n-'+defaultPage);
  nav(defaultPage, navEl);
}
```

Replace with:
```js
  // Load projects then route
  const { data: projectRows } = await sb.from('projects').select('id, name').order('created_at');
  userProjects = (projectRows || []).map(p => ({ id: p.id, name: p.name }));

  if (userProjects.length === 1) {
    setCurrentProject(userProjects[0]); // single project — skip grid
  } else {
    renderProjectGrid();
  }
}
```

- [ ] **Step 2: Add setCurrentProject() and returnToProjects()**

Find the line:
```js
// ─── PROJECT GRID ─────────────────────────────────────────────────
```

Add the following two functions immediately BEFORE that line:

```js
function setCurrentProject(project) {
  currentProject = project;
  document.getElementById('project-screen').style.display = 'none';
  document.getElementById('app-screen').style.display     = 'flex';
  document.getElementById('psw-name').textContent         = project.name;
  document.getElementById('psw-wrap').style.display       = '';
  document.getElementById('tb-proj-div').style.display    = '';

  const hash = location.hash.replace('#', '');
  const validPages = ['dash','draw','sub','sreg','ir','ncr','rfi','trans','corr','punch','ms','subs','users','ipc','boq','finance','usetup','ureg','srev','crm'];
  const defaultPage = validPages.includes(hash) ? hash : 'dash';
  nav(defaultPage, document.getElementById('n-' + defaultPage));
}

function returnToProjects() {
  currentProject = null;
  closeProjectDropdown();
  renderProjectGrid();
}

```

- [ ] **Step 3: Verify routing in browser**

1. Log in → project grid appears
2. Click "Golf Grove - DPC" → app loads at Dashboard, switcher pill shows "Golf Grove - DPC"
3. Refresh page → same project loads (hash preserved)

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: loadApp() project routing, setCurrentProject(), returnToProjects()"
```

---

### Task 7: App — Project switcher dropdown functions

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add switcher functions after returnToProjects()**

Find:
```js
function returnToProjects() {
  currentProject = null;
  closeProjectDropdown();
  renderProjectGrid();
}
```

Add immediately after:

```js
function buildProjectDropdown() {
  const dd = document.getElementById('psw-dd');
  dd.textContent = '';

  userProjects.forEach(p => {
    const isActive = p.id === currentProject?.id;
    const item = document.createElement('div');
    item.className = 'psw-item' + (isActive ? ' active' : '');
    item.onclick = () => switchProject({ id: p.id, name: p.name });

    const dot = document.createElement('div');
    dot.className = 'psw-idot ' + (isActive ? 'on' : 'off');

    const label = document.createElement('span');
    label.textContent = p.name;

    item.appendChild(dot);
    item.appendChild(label);

    if (isActive) {
      const check = document.createElement('span');
      check.className = 'psw-check';
      check.textContent = '\u2713';
      item.appendChild(check);
    }
    dd.appendChild(item);
  });

  const divider1 = document.createElement('div');
  divider1.className = 'psw-div';
  dd.appendChild(divider1);

  const allLink = document.createElement('div');
  allLink.className = 'psw-all';
  allLink.textContent = '\u2190 All Projects';
  allLink.onclick = returnToProjects;
  dd.appendChild(allLink);

  if (currentProfile?.role === 'developer') {
    const divider2 = document.createElement('div');
    divider2.className = 'psw-div';
    dd.appendChild(divider2);

    const newLink = document.createElement('div');
    newLink.className = 'psw-new';
    newLink.textContent = '+ New Project';
    newLink.onclick = () => { closeProjectDropdown(); openNewProject(); };
    dd.appendChild(newLink);
  }
}

function toggleProjectDropdown() {
  const dd = document.getElementById('psw-dd');
  if (dd.classList.contains('open')) {
    dd.classList.remove('open');
  } else {
    buildProjectDropdown();
    dd.classList.add('open');
  }
}

function closeProjectDropdown() {
  document.getElementById('psw-dd')?.classList.remove('open');
}

function switchProject(project) {
  currentProject = project;
  document.getElementById('psw-name').textContent = project.name;
  closeProjectDropdown();
  render();
}

```

- [ ] **Step 2: Add outside-click listener to close dropdown**

Near the bottom of the `<script>` block, find `sb.auth.onAuthStateChange` or any existing `document.addEventListener`. Add:

```js
document.addEventListener('click', function(e) {
  if (!e.target.closest('.psw-wrap')) closeProjectDropdown();
});
```

- [ ] **Step 3: Verify switcher in browser**

1. Log in → select "Golf Grove - DPC"
2. Click the project pill in topbar → dropdown opens
3. Shows "Golf Grove - DPC ✓", "← All Projects", "+ New Project"
4. Click "← All Projects" → grid shown
5. Click "Golf Grove - DPC" → app resumes, same module
6. Click switcher → click outside → dropdown closes

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: project switcher dropdown — toggle, switch, return to grid"
```

---

### Task 8: App — openNewProject() + openManageUsers()

**Files:**
- Modify: `index.html`

Add these four functions before `renderProjectGrid()`. They follow the existing `openModal()` / `closeModal()` pattern used throughout the app.

- [ ] **Step 1: Add openNewProject() and doNewProject()**

Find:
```js
// ─── PROJECT GRID ─────────────────────────────────────────────────
```

Insert before it:

```js
function openNewProject() {
  openModal(
    '<div class="modal-header"><h2>New Project</h2></div>' +
    '<div class="modal-body">' +
    '<label style="font-size:11px;font-weight:600;color:var(--text2);display:block;margin-bottom:6px">Project name</label>' +
    '<input id="new-proj-name" class="reg-search" placeholder="e.g. Palm Grove Tower" style="width:100%">' +
    '</div>' +
    '<div class="modal-footer">' +
    '<button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" onclick="doNewProject()">Create</button>' +
    '</div>'
  );
  setTimeout(() => document.getElementById('new-proj-name')?.focus(), 50);
}

async function doNewProject() {
  const nameEl = document.getElementById('new-proj-name');
  const name = nameEl?.value.trim();
  if (!name) { toast('Enter a project name', 'warning'); return; }

  const { data: proj, error } = await sb.from('projects')
    .insert({ name, created_by: currentUser.id })
    .select('id, name')
    .single();
  if (error) { toast('Error: ' + error.message, 'error'); return; }

  await sb.from('project_users').insert({ project_id: proj.id, user_id: currentUser.id });
  userProjects.push({ id: proj.id, name: proj.name });
  closeModal();
  toast('Project created', 'success');
  renderProjectGrid();
}

```

- [ ] **Step 2: Add openManageUsers() and doManageUsers()**

Immediately after `doNewProject()` add:

```js
async function openManageUsers(projectId, projectName) {
  const [{ data: allProfiles }, { data: assigned }] = await Promise.all([
    sb.from('profiles').select('id, full_name, role, email').order('full_name'),
    sb.from('project_users').select('user_id').eq('project_id', projectId),
  ]);

  const assignedIds = new Set((assigned || []).map(r => r.user_id));

  let rows = '';
  (allProfiles || []).forEach(p => {
    const chk = assignedIds.has(p.id) ? ' checked' : '';
    rows +=
      '<label style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:0.5px solid var(--border);cursor:pointer;font-size:13px">' +
      '<input type="checkbox" data-uid="' + p.id + '"' + chk + ' style="accent-color:var(--sand)">' +
      '<span style="flex:1">' + esc(p.full_name || p.email || p.id) + '</span>' +
      '<span style="font-size:10px;color:var(--text3)">' + esc(p.role || '') + '</span>' +
      '</label>';
  });

  openModal(
    '<div class="modal-header"><h2>Users \u2014 ' + esc(projectName) + '</h2></div>' +
    '<div class="modal-body" style="max-height:60vh;overflow-y:auto">' + (rows || '<p style="color:var(--text2)">No profiles found.</p>') + '</div>' +
    '<div class="modal-footer">' +
    '<button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" onclick="doManageUsers(\'' + projectId + '\')">Save</button>' +
    '</div>'
  );
}

async function doManageUsers(projectId) {
  const checkboxes = document.querySelectorAll('#modal-body input[type=checkbox][data-uid]');
  const nowChecked  = new Set([...checkboxes].filter(c => c.checked).map(c => c.dataset.uid));

  const { data: existing } = await sb.from('project_users').select('user_id').eq('project_id', projectId);
  const wasAssigned = new Set((existing || []).map(r => r.user_id));

  const toAdd    = [...nowChecked].filter(id => !wasAssigned.has(id));
  const toRemove = [...wasAssigned].filter(id => !nowChecked.has(id));

  const ops = [];
  if (toAdd.length)    ops.push(sb.from('project_users').insert(toAdd.map(uid => ({ project_id: projectId, user_id: uid }))));
  if (toRemove.length) ops.push(sb.from('project_users').delete().eq('project_id', projectId).in('user_id', toRemove));

  if (ops.length) {
    const results = await Promise.all(ops);
    const err = results.find(r => r.error);
    if (err) { toast('Error: ' + err.error.message, 'error'); return; }
  }

  closeModal();
  toast('Users updated', 'success');
  renderProjectGrid();
}

```

- [ ] **Step 3: Verify new project + manage users in browser**

1. On grid, click "+ New Project" → modal opens
2. Enter "Test Project" → Create → card appears in grid
3. Click "Manage users" on "Golf Grove - DPC" → user list with checkboxes
4. Uncheck a user, Save → success toast, grid refreshes

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: openNewProject(), openManageUsers() — developer project management"
```

---

### Task 9: App — Scope all module SELECT + INSERT queries to currentProject.id

**Files:**
- Modify: `index.html` via `patch_scope_modules.py`

Every `render*()` function that queries a project-scoped table needs `.eq('project_id', currentProject.id)` added to its primary SELECT. Every `insert()` call on those tables needs `project_id: currentProject.id` in the payload.

- [ ] **Step 1: Grep to find exact SELECT strings for each module**

Run these to capture exact strings:

```bash
grep -n "sb.from('method_statements').select" index.html
grep -n "sb.from('drawings').select" index.html
grep -n "sb.from('submittals').select" index.html
grep -n "sb.from('submittal_register').select" index.html
grep -n "sb.from('inspections').select" index.html
grep -n "sb.from('ncrs').select" index.html
grep -n "sb.from('rfis').select" index.html
grep -n "sb.from('transmittals').select" index.html
grep -n "sb.from('correspondence').select" index.html
grep -n "sb.from('punch_list').select" index.html
grep -n "sb.from('subcontractors').select" index.html
grep -n "sb.from('boq_bills').select" index.html
grep -n "sb.from('payment_certificates').select" index.html
grep -n "sb.from('crm_leads').select" index.html
grep -n "sb.from('units').select" index.html
```

Note the exact strings that are the primary SELECT in each `render*()` function (not badge queries, not nested lookups).

- [ ] **Step 2: Write patch_scope_modules.py**

Using the exact strings from Step 1, write a patch script that:

1. For each `render*()` primary SELECT: inserts `.eq('project_id',currentProject.id)` before `.order(` or `.limit(` or `.in(` or `.single()` or `)` (whichever comes first after `.select(...)`).
2. For `renderCRM()` specifically: the query is built via a `let q =` chain. Find `let q = sb.from('crm_leads').select('*', { count: 'exact' });` and add `q = q.eq('project_id', currentProject.id);` on the next line.
3. For `updateBadges()`: scope its four parallel queries (submittals/inspections/ncrs/rfis status counts).
4. For `renderDash()`: scope its Promise.all queries for drawings/submittals/inspections/ncrs/subcontractors/rfis.
5. For all INSERT calls: add `project_id: currentProject.id` as first key in the payload object.

Template for the script:

```python
# patch_scope_modules.py
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

original = html
errors = []

def replace_one(old, new, label):
    global html
    if old not in html:
        errors.append(f'MISSING: {label}')
        return
    html = html.replace(old, new, 1)
    print(f'OK: {label}')

def replace_all(old, new, label):
    global html
    count = html.count(old)
    if count == 0:
        errors.append(f'MISSING: {label}')
        return
    html = html.replace(old, new)
    print(f'OK ({count}x): {label}')

# ── SELECTs — fill in EXACT strings from grep output in Step 1 ──
# Example pattern (replace with actual grep output):
# replace_one(
#   "await sb.from('method_statements').select('*').order('created_at',{ascending:false})",
#   "await sb.from('method_statements').select('*').eq('project_id',currentProject.id).order('created_at',{ascending:false})",
#   'method_statements SELECT'
# )

# CRM special case (query builder pattern):
replace_one(
  "let q = sb.from('crm_leads').select('*', { count: 'exact' });",
  "let q = sb.from('crm_leads').select('*', { count: 'exact' });\n  q = q.eq('project_id', currentProject.id);",
  'crm_leads project filter'
)

# ── INSERTs — add project_id to each table's insert payload ──
for table in ['method_statements','drawings','submittals','submittal_register',
              'inspections','ncrs','rfis','transmittals','correspondence',
              'punch_list','subcontractors','boq_bills','payment_certificates',
              'crm_leads','units']:
    replace_all(
      f"await sb.from('{table}').insert({{",
      f"await sb.from('{table}').insert({{project_id:currentProject.id,",
      f'{table} INSERT'
    )

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)

if errors:
    print('\nERRORS:')
    for e in errors: print(' ', e)
else:
    print(f'\nAll OK. File {"changed" if html != original else "UNCHANGED"}.')
```

- [ ] **Step 3: Fill in the SELECT replacements using the grep output from Step 1**

For each render function, add a `replace_one(...)` call with the exact string. For `updateBadges` and `renderDash`, add `replace_one` calls for each parallel query in their `Promise.all` arrays.

- [ ] **Step 4: Run the script**

```bash
python patch_scope_modules.py
```

All lines should print `OK`. For any `MISSING`, re-run the grep from Step 1 to find the exact string and update the script.

- [ ] **Step 5: Verify all modules in browser**

1. Log in → select "Golf Grove - DPC"
2. Visit every module: Dashboard, Drawings, Submittals, IR, NCR, RFI, Transmittals, Correspondence, Punch List, MS, BOQ, IPC, Finance, CRM, Unit Setup, Unit Register, Sales Revenue
3. Each should display existing data
4. Create a new project "Test" → visit CRM → "No leads found" (correct isolation)

- [ ] **Step 6: Commit**

```bash
git add index.html patch_scope_modules.py
git commit -m "feat: scope all module SELECT + INSERT queries to currentProject.id"
```

---

### Task 10: Cleanup + push

**Files:**
- Delete temp scripts
- Push to remote

- [ ] **Step 1: Remove temp patch scripts**

```bash
rm patch_project_screen.py patch_topbar_switcher.py patch_scope_modules.py
```

- [ ] **Step 2: End-to-end test — project isolation**

1. Developer logs in → sees project grid
2. Creates "Test Project" via "+ New Project"
3. Enters "Test Project" → all modules show empty state
4. Switches to "Golf Grove - DPC" via switcher → all data intact
5. Creates a new NCR in "Golf Grove - DPC" → switches to "Test Project" → NCR not visible

- [ ] **Step 3: End-to-end test — user assignment**

1. On project grid, click "Manage users" on "Test Project"
2. Uncheck all users except developer
3. Log in as another user → "Test Project" not visible in grid

- [ ] **Step 4: Commit and push**

```bash
git add -A
git commit -m "chore: remove temp patch scripts"
git push
```
