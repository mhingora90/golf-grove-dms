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

# ──────────────────────────────────────────────────────────────────
# SELECT scoping — primary render queries only
# ──────────────────────────────────────────────────────────────────

# method_statements — renderMS main query (line 1550)
replace_one(
    "const {data} = await sb.from('method_statements').select('*').order('created_at',{ascending:false});",
    "const {data} = await sb.from('method_statements').select('*').eq('project_id',currentProject.id).order('created_at',{ascending:false});",
    "method_statements SELECT render"
)

# drawings — main render query (line 2224)
replace_one(
    "const {data} = await sb.from('drawings').select('*').order('drawing_no',{ascending:true});",
    "const {data} = await sb.from('drawings').select('*').eq('project_id',currentProject.id).order('drawing_no',{ascending:true});",
    "drawings SELECT render"
)

# submittals — main render query (line 2441)
replace_one(
    "const {data} = await sb.from('submittals').select('*').order('created_at',{ascending:false});",
    "const {data} = await sb.from('submittals').select('*').eq('project_id',currentProject.id).order('created_at',{ascending:false});",
    "submittals SELECT render"
)

# submittal_register — main render query (line 4062)
replace_one(
    "const {data} = await sb.from('submittal_register').select('*').order('spec_ref',{ascending:true});",
    "const {data} = await sb.from('submittal_register').select('*').eq('project_id',currentProject.id).order('spec_ref',{ascending:true});",
    "submittal_register SELECT render"
)

# inspections — main render query (line 2510)
replace_one(
    "const {data} = await sb.from('inspections').select('*, subcontractors(name)').order('created_at',{ascending:false});",
    "const {data} = await sb.from('inspections').select('*, subcontractors(name)').eq('project_id',currentProject.id).order('created_at',{ascending:false});",
    "inspections SELECT render"
)

# ncrs — main render query (line 2586)
replace_one(
    "const {data} = await sb.from('ncrs').select('*').order('created_at',{ascending:false});",
    "const {data} = await sb.from('ncrs').select('*').eq('project_id',currentProject.id).order('created_at',{ascending:false});",
    "ncrs SELECT render"
)

# rfis — main render query (line 4392)
replace_one(
    "const {data} = await sb.from('rfis').select('*').order('created_at',{ascending:false});",
    "const {data} = await sb.from('rfis').select('*').eq('project_id',currentProject.id).order('created_at',{ascending:false});",
    "rfis SELECT render"
)

# transmittals — main render query (line 4523)
replace_one(
    "const {data} = await sb.from('transmittals').select('*').order('created_at',{ascending:false});",
    "const {data} = await sb.from('transmittals').select('*').eq('project_id',currentProject.id).order('created_at',{ascending:false});",
    "transmittals SELECT render"
)

# correspondence — main render query (line 4634)
replace_one(
    "const {data} = await sb.from('correspondence').select('*').order('created_at',{ascending:false});",
    "const {data} = await sb.from('correspondence').select('*').eq('project_id',currentProject.id).order('created_at',{ascending:false});",
    "correspondence SELECT render"
)

# punch_list — main render query (line 4813)
replace_one(
    "const {data} = await sb.from('punch_list').select('*').order('created_at',{ascending:false});",
    "const {data} = await sb.from('punch_list').select('*').eq('project_id',currentProject.id).order('created_at',{ascending:false});",
    "punch_list SELECT render"
)

# subcontractors — main render query (line 2667)
replace_one(
    "const {data} = await sb.from('subcontractors').select('*').order('created_at',{ascending:false});",
    "const {data} = await sb.from('subcontractors').select('*').eq('project_id',currentProject.id).order('created_at',{ascending:false});",
    "subcontractors SELECT render"
)

# boq_bills — main render query (line 5748)
replace_one(
    "sb.from('boq_bills').select('*').order('sort_order').order('created_at'),",
    "sb.from('boq_bills').select('*').eq('project_id',currentProject.id).order('sort_order').order('created_at'),",
    "boq_bills SELECT render (first)"
)

# payment_certificates — main render query (line 6092)
replace_one(
    "sb.from('payment_certificates').select('*').order('cert_no'),",
    "sb.from('payment_certificates').select('*').eq('project_id',currentProject.id).order('cert_no'),",
    "payment_certificates SELECT render (first)"
)

# units — main render query (line 6951)
replace_one(
    "const {data:units, error} = await sb.from('units').select('*').order('floor').order('unit_no');",
    "const {data:units, error} = await sb.from('units').select('*').eq('project_id',currentProject.id).order('floor').order('unit_no');",
    "units SELECT render"
)

# crm_leads — scope main query (line 7658)
replace_one(
    'let q = sb.from("crm_leads").select("*", { count: "exact" });',
    'let q = sb.from("crm_leads").select("*", { count: "exact" });\n  q = q.eq("project_id", currentProject.id);',
    "crm_leads SELECT main q"
)

# ──────────────────────────────────────────────────────────────────
# updateBadges() — scope badge queries to currentProject
# ──────────────────────────────────────────────────────────────────

replace_one(
    "sb.from('submittals').select('*',{count:'exact',head:true}).eq('status','Pending Review'),\n    sb.from('inspections').select('*',{count:'exact',head:true}).eq('status','Pending'),\n    sb.from('ncrs').select('*',{count:'exact',head:true}).eq('status','Open'),\n    sb.from('rfis').select('*',{count:'exact',head:true}).eq('status','Open'),",
    "sb.from('submittals').select('*',{count:'exact',head:true}).eq('project_id',currentProject.id).eq('status','Pending Review'),\n    sb.from('inspections').select('*',{count:'exact',head:true}).eq('project_id',currentProject.id).eq('status','Pending'),\n    sb.from('ncrs').select('*',{count:'exact',head:true}).eq('project_id',currentProject.id).eq('status','Open'),\n    sb.from('rfis').select('*',{count:'exact',head:true}).eq('project_id',currentProject.id).eq('status','Open'),",
    "updateBadges badge queries"
)

# ──────────────────────────────────────────────────────────────────
# renderDash() — scope all dashboard count + row queries
# ──────────────────────────────────────────────────────────────────

replace_one(
    "sb.from('drawings').select('*',{head:true,count:'exact'}),\n    sb.from('submittals').select('*',{head:true,count:'exact'}),\n    sb.from('inspections').select('*',{head:true,count:'exact'}),\n    sb.from('ncrs').select('*',{head:true,count:'exact'}),\n    sb.from('subcontractors').select('*',{head:true,count:'exact'}),\n    sb.from('rfis').select('*',{head:true,count:'exact'}),\n    // Status-filtered counts\n    sb.from('submittals').select('*',{head:true,count:'exact'}).eq('status','Pending Review'),\n    sb.from('inspections').select('*',{head:true,count:'exact'}).eq('status','Pending'),\n    sb.from('ncrs').select('*',{head:true,count:'exact'}).eq('status','Open'),\n    sb.from('rfis').select('*',{head:true,count:'exact'}).eq('status','Open'),\n    sb.from('drawings').select('*',{head:true,count:'exact'}).eq('status','Approved'),\n    sb.from('drawings').select('*',{head:true,count:'exact'}).eq('status','Issued for Construction'),\n    sb.from('drawings').select('*',{head:true,count:'exact'}).eq('status','Under Review'),\n    sb.from('drawings').select('*',{head:true,count:'exact'}).eq('status','Revise & Resubmit'),\n    // Overdue counts\n    sb.from('submittals').select('*',{head:true,count:'exact'}).lt('due_date',today).eq('status','Pending Review'),\n    sb.from('inspections').select('*',{head:true,count:'exact'}).lt('due_date',today).eq('status','Pending'),\n    sb.from('rfis').select('*',{head:true,count:'exact'}).lt('due_date',today).eq('status','Open'),\n    sb.from('ncrs').select('*',{head:true,count:'exact'}).lt('raised_date',thirtyAgo).neq('status','Closed'),",
    "sb.from('drawings').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id),\n    sb.from('submittals').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id),\n    sb.from('inspections').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id),\n    sb.from('ncrs').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id),\n    sb.from('subcontractors').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id),\n    sb.from('rfis').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id),\n    // Status-filtered counts\n    sb.from('submittals').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id).eq('status','Pending Review'),\n    sb.from('inspections').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id).eq('status','Pending'),\n    sb.from('ncrs').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id).eq('status','Open'),\n    sb.from('rfis').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id).eq('status','Open'),\n    sb.from('drawings').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id).eq('status','Approved'),\n    sb.from('drawings').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id).eq('status','Issued for Construction'),\n    sb.from('drawings').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id).eq('status','Under Review'),\n    sb.from('drawings').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id).eq('status','Revise & Resubmit'),\n    // Overdue counts\n    sb.from('submittals').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id).lt('due_date',today).eq('status','Pending Review'),\n    sb.from('inspections').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id).lt('due_date',today).eq('status','Pending'),\n    sb.from('rfis').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id).lt('due_date',today).eq('status','Open'),\n    sb.from('ncrs').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id).lt('raised_date',thirtyAgo).neq('status','Closed'),",
    "renderDash count queries"
)

replace_one(
    "sb.from('submittals').select('id,ref_no,title,status').eq('status','Pending Review').limit(5),\n    sb.from('inspections').select('id,ref_no,elements,inspection_date').eq('status','Pending').limit(5),\n    sb.from('ncrs').select('id,ref_no,title,severity').eq('status','Open').limit(5),\n    sb.from('drawings').select('id,drawing_no,title,revision,status').order('created_at',{ascending:false}).limit(4),\n    // Overdue rows for banner\n    sb.from('submittals').select('ref_no,title,due_date').eq('status','Pending Review').lt('due_date',today).limit(20),\n    sb.from('inspections').select('ref_no,elements:title,due_date').eq('status','Pending').lt('due_date',today).limit(20),\n    sb.from('rfis').select('ref_no,subject:title,due_date').eq('status','Open').lt('due_date',today).limit(20),",
    "sb.from('submittals').select('id,ref_no,title,status').eq('project_id',currentProject.id).eq('status','Pending Review').limit(5),\n    sb.from('inspections').select('id,ref_no,elements,inspection_date').eq('project_id',currentProject.id).eq('status','Pending').limit(5),\n    sb.from('ncrs').select('id,ref_no,title,severity').eq('project_id',currentProject.id).eq('status','Open').limit(5),\n    sb.from('drawings').select('id,drawing_no,title,revision,status').eq('project_id',currentProject.id).order('created_at',{ascending:false}).limit(4),\n    // Overdue rows for banner\n    sb.from('submittals').select('ref_no,title,due_date').eq('project_id',currentProject.id).eq('status','Pending Review').lt('due_date',today).limit(20),\n    sb.from('inspections').select('ref_no,elements:title,due_date').eq('project_id',currentProject.id).eq('status','Pending').lt('due_date',today).limit(20),\n    sb.from('rfis').select('ref_no,subject:title,due_date').eq('project_id',currentProject.id).eq('status','Open').lt('due_date',today).limit(20),",
    "renderDash row queries"
)

# ──────────────────────────────────────────────────────────────────
# INSERT scoping — all tables
# ──────────────────────────────────────────────────────────────────

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
    print(f'\nAll OK. {"changed" if html != original else "UNCHANGED"}.')
