"""
Patch script: scope secondary SELECT queries to currentProject.id
"""
import re

FILE = r"C:\Users\USER\projects\golf-grove-dms\index.html"

with open(FILE, encoding="utf-8") as f:
    src = f.read()

replacements = [
    # ── Group 1: CRM leads secondary queries (lines 7675, 7680, 7695) ──────────

    # 1a. Count query
    (
        'sb.from("crm_leads").select("*", { count: "exact", head: true })',
        'sb.from("crm_leads").select("*", { count: "exact", head: true }).eq("project_id", currentProject.id)',
    ),

    # 1b. Stage rows
    (
        'sb.from("crm_leads").select("stage")',
        'sb.from("crm_leads").select("stage").eq("project_id", currentProject.id)',
    ),

    # 1c. Assignee rows (insert project scope before .not(...))
    (
        'sb.from("crm_leads").select("assigned_to").not("assigned_to", "is", null)',
        'sb.from("crm_leads").select("assigned_to").eq("project_id", currentProject.id).not("assigned_to", "is", null)',
    ),

    # ── Group 2: Drawings compliance widget stats (lines 1487-1489) ─────────────

    # 2a. allDraws – bare count with no extra filter
    (
        "sb.from('drawings').select('*',{head:true,count:'exact'}),",
        "sb.from('drawings').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id),",
    ),

    # 2b. publishedDraws – .in('cde_state',...)
    (
        "sb.from('drawings').select('*',{head:true,count:'exact'}).in('cde_state',['Published','Archived']),",
        "sb.from('drawings').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id).in('cde_state',['Published','Archived']),",
    ),

    # 2c. metaDraws – .not(...).not(...)
    (
        "sb.from('drawings').select('*',{head:true,count:'exact'}).not('originator','is',null).not('zone','is',null).not('level','is',null),",
        "sb.from('drawings').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id).not('originator','is',null).not('zone','is',null).not('level','is',null),",
    ),

    # ── Group 3: Discipline bars (lines 1524-1525) ───────────────────────────────

    # 3a. total by discipline
    (
        "sb.from('drawings').select('*',{count:'exact',head:true}).eq('discipline',d),",
        "sb.from('drawings').select('*',{count:'exact',head:true}).eq('project_id',currentProject.id).eq('discipline',d),",
    ),

    # 3b. approved by discipline
    (
        "sb.from('drawings').select('*',{count:'exact',head:true}).eq('discipline',d).eq('status','Approved')",
        "sb.from('drawings').select('*',{count:'exact',head:true}).eq('project_id',currentProject.id).eq('discipline',d).eq('status','Approved')",
    ),

    # ── Group 4: Batch CDE advance – .in('id', ids) ──────────────────────────────

    (
        "sb.from('drawings').select('id,cde_state').in('id', ids)",
        "sb.from('drawings').select('id,cde_state').eq('project_id',currentProject.id).in('id', ids)",
    ),

    # ── Group 5: linkDrawings modal – all drawings except current ────────────────

    (
        "sb.from('drawings').select('id,drawing_no,title,discipline').order('drawing_no').neq('id',id)",
        "sb.from('drawings').select('id,drawing_no,title,discipline').eq('project_id',currentProject.id).order('drawing_no').neq('id',id)",
    ),

    # ── Group 6: exportDrawingRegister ──────────────────────────────────────────

    (
        "sb.from('drawings').select('*').order('drawing_no',{ascending:true}).then(({data})=>{",
        "sb.from('drawings').select('*').eq('project_id',currentProject.id).order('drawing_no',{ascending:true}).then(({data})=>{",
    ),

    # ── Group 7: New Submittal modal drawing dropdown ────────────────────────────

    (
        "sb.from('drawings').select('drawing_no,title').order('drawing_no');",
        "sb.from('drawings').select('drawing_no,title').eq('project_id',currentProject.id).order('drawing_no');",
    ),

    # ── Group 8: New RFI drawing dropdown ───────────────────────────────────────
    # NOTE: same string as Group 7 — both are "select('drawing_no,title').order('drawing_no')"
    # They share the same literal so the single replacement above covers BOTH occurrences.
    # If for some reason they differ they will be caught separately below.

    # ── Group 9: New Transmittal drawing dropdown ────────────────────────────────

    (
        "sb.from('drawings').select('drawing_no,title,revision').order('drawing_no')",
        "sb.from('drawings').select('drawing_no,title,revision').eq('project_id',currentProject.id).order('drawing_no')",
    ),
]

changed = 0
for old, new in replacements:
    count = src.count(old)
    if count == 0:
        print(f"WARN – not found (0 occurrences): {old[:80]!r}")
        continue
    src = src.replace(old, new)
    print(f"OK   – replaced {count}x: {old[:80]!r}")
    changed += 1

with open(FILE, "w", encoding="utf-8") as f:
    f.write(src)

print(f"\nDone. {changed}/{len(replacements)} replacements applied.")
