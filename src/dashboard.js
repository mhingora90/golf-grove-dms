// ─── DASHBOARD ────────────────────────────────────────────────────
async function renderDash() {
  const today = new Date().toISOString().split('T')[0];
  const thirtyAgo = new Date(Date.now() - 30*86400000).toISOString().split('T')[0];

  // Counts only — head:true means Supabase returns count with zero payload
  const counts = await Promise.all([
    sb.from('drawings').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id),
    sb.from('submittals').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id),
    sb.from('inspections').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id),
    sb.from('ncrs').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id),
    sb.from('subcontractors').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id),
    sb.from('rfis').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id),
    // Status-filtered counts
    sb.from('submittals').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id).eq('status','Pending Review'),
    sb.from('inspections').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id).eq('status','Pending'),
    sb.from('ncrs').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id).eq('status','Open'),
    sb.from('rfis').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id).eq('status','Open'),
    sb.from('drawings').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id).eq('status','Approved'),
    sb.from('drawings').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id).eq('status','Issued for Construction'),
    sb.from('drawings').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id).eq('status','Under Review'),
    sb.from('drawings').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id).eq('status','Revise & Resubmit'),
    // Overdue counts
    sb.from('submittals').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id).lt('due_date',today).eq('status','Pending Review'),
    sb.from('inspections').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id).lt('due_date',today).eq('status','Pending'),
    sb.from('rfis').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id).lt('due_date',today).eq('status','Open'),
    sb.from('ncrs').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id).lt('raised_date',thirtyAgo).neq('status','Closed'),
  ]);
  const [drawCnt,subCnt,irCnt,ncrCnt,scCnt,rfiCnt,
         pSubCnt,pIRCnt,oNCRCnt,oRFICnt,
         apprCnt,ifcCnt,revCnt,r2rCnt,
         oSubCnt,oIRCnt,oRFIOvdCnt,oNCROvdCnt] = counts;

  // IPC summary — latest certified net amount
  const {data:ipcData} = await sb.from('payment_certificates').select('id,status,retention_pct,advance_recovery_pct,vat_pct,previously_paid,amount_paid').eq('project_id',currentProject.id).in('status',['Certified','Paid']);
  let ipcTotalCertified = 0;
  for(const pc of ipcData||[]) {
    const {data:pit} = await sb.from('payment_certificate_items').select('consultant_amount').eq('cert_id',pc.id);
    const gross = (pit||[]).reduce((s,i)=>s+(+i.consultant_amount||0),0);
    const ret = gross * (+pc.retention_pct||10)/100;
    const advRecovery = gross * (+pc.advance_recovery_pct||0)/100;
    const nbv = gross - ret - advRecovery - (+pc.previously_paid||0);
    ipcTotalCertified += nbv + nbv * (+pc.vat_pct||5)/100;
  }
  const ipcCount = (ipcData||[]).length;
  const ipcPaid = (ipcData||[]).filter(c=>c.status==='Paid').length;

  // Display rows — limited fields, limited count
  const rows = await Promise.all([
    sb.from('submittals').select('id,ref_no,title,status').eq('project_id',currentProject.id).eq('status','Pending Review').limit(5),
    sb.from('inspections').select('id,ref_no,elements,inspection_date').eq('project_id',currentProject.id).eq('status','Pending').limit(5),
    sb.from('ncrs').select('id,ref_no,title,severity').eq('project_id',currentProject.id).eq('status','Open').limit(5),
    sb.from('drawings').select('id,drawing_no,title,revision,status').eq('project_id',currentProject.id).order('created_at',{ascending:false}).limit(4),
    // Overdue rows for banner
    sb.from('submittals').select('ref_no,title,due_date').eq('project_id',currentProject.id).eq('status','Pending Review').lt('due_date',today).limit(20),
    sb.from('inspections').select('ref_no,elements:title,due_date').eq('project_id',currentProject.id).eq('status','Pending').lt('due_date',today).limit(20),
    sb.from('rfis').select('ref_no,subject:title,due_date').eq('project_id',currentProject.id).eq('status','Open').lt('due_date',today).limit(20),
  ]);
  const [pendSubs,pendIRs,openNCRs,recentDraws,
         oSubRows,oIRRows,oRFIRows] = rows;

  const overdueAll = [
    ...(oSubRows.data||[]).map(s=>({...s,_type:'Submittal'})),
    ...(oIRRows.data||[]).map(i=>({...i,_type:'Inspection'})),
    ...(oRFIRows.data||[]).map(r=>({...r,_type:'RFI'})),
  ];
  const slaRows = [
    {label:'Overdue IRs',     count:oIRCnt.count||0,  page:'ir'},
    {label:'Overdue NCRs',    count:oNCROvdCnt.count||0, page:'ncr'},
    {label:'Overdue RFIs',    count:oRFIOvdCnt.count||0, page:'rfi'},
    {label:'Overdue Submittals',count:oSubCnt.count||0,page:'sub'},
  ];
  const slaTotalOverdue = slaRows.reduce((s,r)=>s+r.count,0);
  document.getElementById('content').innerHTML = `
  ${overdueAll.length?`<div style="background:var(--amber-bg);border:0.5px solid #FAC775;border-radius:var(--radius-lg);padding:12px 16px;margin-bottom:16px">
    <div style="font-size:11px;font-weight:500;color:var(--amber);margin-bottom:8px">${overdueAll.length} overdue item${overdueAll.length>1?'s':''}</div>
    <div style="display:flex;flex-direction:column;gap:4px">
      ${overdueAll.map(o=>`<div style="display:flex;align-items:center;justify-content:space-between;font-size:11px">
        <span style="color:var(--text2)"><span class="badge badge-warning" style="margin-right:6px;font-size:9px">${o._type}</span>${o.ref_no||o.subject} – ${o.title||o.subject||''}</span>
        <span style="color:var(--amber);font-size:10px">Due ${o.due_date}</span>
      </div>`).join('')}
    </div>
  </div>`:''}
  <div class="stats">
    <div class="stat"><div class="stat-label">Drawings</div><div class="stat-value">${drawCnt.count||0}</div><div class="stat-sub">${apprCnt.count||0} approved</div></div>
    <div class="stat"><div class="stat-label">Submittals</div><div class="stat-value">${subCnt.count||0}</div><div class="stat-sub">${pSubCnt.count||0} pending review</div></div>
    <div class="stat"><div class="stat-label">Inspections</div><div class="stat-value">${irCnt.count||0}</div><div class="stat-sub">${pIRCnt.count||0} awaiting response</div></div>
    <div class="stat"><div class="stat-label">Open NCRs</div><div class="stat-value ${(oNCRCnt.count||0)>0?'danger':''}">${oNCRCnt.count||0}</div><div class="stat-sub">${(ncrCnt.count||0)-(oNCRCnt.count||0)} closed</div></div>
    <div class="stat"><div class="stat-label">Open RFIs</div><div class="stat-value ${(oRFICnt.count||0)>0?'danger':''}">${oRFICnt.count||0}</div><div class="stat-sub">${(rfiCnt.count||0)-(oRFICnt.count||0)} closed</div></div>
    <div class="stat" style="cursor:pointer" onclick="nav('ipc',document.getElementById('n-ipc'))"><div class="stat-label">Payment Certs</div><div class="stat-value">${ipcCount}</div><div class="stat-sub" style="color:var(--green)">${ipcTotalCertified>0?fmtAED(ipcTotalCertified)+' certified':ipcPaid+' paid'}</div></div>
  </div>
  <div id="compliance-widget" style="margin-bottom:12px"></div>
  <div class="dash-detail-grid" style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:16px">
    <div class="card" style="margin:0">
      <div style="padding:12px 14px 8px;border-bottom:0.5px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:12px;font-weight:500;color:var(--charcoal)">Drawing approval</span>
        <span style="font-size:11px;color:var(--text3)">${drawCnt.count||0} total</span>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:14px" id="donut-wrap">
        ${(()=>{
          const tot  = drawCnt.count||0;
          const appr = apprCnt.count||0;
          const ifc  = ifcCnt.count||0;
          const rev  = revCnt.count||0;
          const r2r  = r2rCnt.count||0;
          const other = Math.max(0, tot - appr - ifc - rev - r2r);
          const circ  = 2*Math.PI*52;
          const pct   = tot>0?Math.round(((appr+ifc)/tot)*100):0;
          // segment dash lengths
          const gap   = tot>0?1.5:0; // small visual gap between segments
          function seg(n){ return tot>0?(n/tot)*circ:0; }
          const aDash  = seg(appr);
          const fDash  = seg(ifc);
          const rDash  = seg(rev);
          const r2Dash = seg(r2r);
          const oDash  = seg(other);
          const start  = circ/4; // 12 o'clock
          // cumulative offsets (negate = clockwise)
          const oA  = start;
          const oF  = start - aDash;
          const oR  = start - aDash - fDash;
          const oR2 = start - aDash - fDash - rDash;
          const oO  = start - aDash - fDash - rDash - r2Dash;
          const arc = (dash,offset,color) =>
            dash>0.5?`<circle cx="65" cy="65" r="52" fill="none" stroke="${color}" stroke-width="14" stroke-dasharray="${(dash-gap).toFixed(1)} ${circ.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}" stroke-linecap="butt"/>`:'';
          return `<svg width="130" height="130" viewBox="0 0 130 130">
            <circle cx="65" cy="65" r="52" fill="none" stroke="var(--bg3)" stroke-width="14"/>
            ${tot>0?[
              arc(aDash,  oA,  '#3B6D11'),
              arc(fDash,  oF,  '#6FA832'),
              arc(rDash,  oR,  '#185FA5'),
              arc(r2Dash, oR2, '#C4863A'),
              arc(oDash,  oO,  '#B4A88C'),
            ].join(''):''}
            <text x="65" y="59" text-anchor="middle" font-size="22" font-weight="500" fill="var(--charcoal)" font-family="Plus Jakarta Sans,sans-serif">${pct}%</text>
            <text x="65" y="76" text-anchor="middle" font-size="11" fill="var(--text3)" font-family="Plus Jakarta Sans,sans-serif">IFC or better</text>
          </svg>
          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
            <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text2)"><div style="width:8px;height:8px;border-radius:50%;background:#3B6D11;flex-shrink:0"></div>Approved <span style="font-weight:500;color:var(--charcoal)">${appr}</span></div>
            <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text2)"><div style="width:8px;height:8px;border-radius:50%;background:#6FA832;flex-shrink:0"></div>IFC <span style="font-weight:500;color:var(--charcoal)">${ifc}</span></div>
            <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text2)"><div style="width:8px;height:8px;border-radius:50%;background:#185FA5;flex-shrink:0"></div>Under Review <span style="font-weight:500;color:var(--charcoal)">${rev}</span></div>
            <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text2)"><div style="width:8px;height:8px;border-radius:50%;background:#C4863A;flex-shrink:0"></div>Revise & Resubmit <span style="font-weight:500;color:var(--charcoal)">${r2r}</span></div>
            ${other>0?`<div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text2)"><div style="width:8px;height:8px;border-radius:50%;background:#B4A88C;flex-shrink:0"></div>Other <span style="font-weight:500;color:var(--charcoal)">${other}</span></div>`:''}
          </div>`;
        })()}
      </div>
    </div>
    <div class="card" style="margin:0">
      <div style="padding:12px 14px 8px;border-bottom:0.5px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:12px;font-weight:500;color:var(--charcoal)">Discipline completion</span>
        <span style="font-size:11px;color:var(--text3)">by approved drawings</span>
      </div>
      <div style="padding:12px 14px" id="disc-bars">
        <div style="color:var(--text3);font-size:11px;text-align:center;padding:12px">Loading...</div>
      </div>
    </div>
    <div class="card" style="margin:0">
      <div style="padding:12px 14px 8px;border-bottom:0.5px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:12px;font-weight:500;color:var(--charcoal)">Open items</span>
        <span style="font-size:11px;color:var(--text3)">NCRs + RFIs</span>
      </div>
      <div style="padding:12px 14px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div style="background:var(--bg3);border-radius:8px;padding:12px;text-align:center">
            <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">NCRs</div>
            <div style="font-size:28px;font-weight:500;color:${(oNCRCnt.count||0)>0?'var(--amber)':'var(--charcoal)'}">${oNCRCnt.count||0}</div>
            <div style="font-size:10px;color:var(--text3);margin-top:2px">${(ncrCnt.count||0)-(oNCRCnt.count||0)} closed</div>
          </div>
          <div style="background:var(--bg3);border-radius:8px;padding:12px;text-align:center">
            <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">RFIs</div>
            <div style="font-size:28px;font-weight:500;color:${(oRFICnt.count||0)>0?'var(--amber)':'var(--charcoal)'}">${oRFICnt.count||0}</div>
            <div style="font-size:10px;color:var(--text3);margin-top:2px">${(rfiCnt.count||0)-(oRFICnt.count||0)} closed</div>
          </div>
        </div>
        <div style="margin-top:10px;padding-top:10px;border-top:0.5px solid var(--border)">
          <div style="font-size:10px;color:var(--text3);margin-bottom:6px;text-transform:uppercase;letter-spacing:.08em">Submittals pending</div>
          <div style="display:flex;align-items:center;gap:8px">
            <div style="flex:1;height:6px;background:var(--bg3);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${(subCnt.count||0)>0?Math.round(((pSubCnt.count||0)/(subCnt.count||1))*100):0}%;background:var(--sand);border-radius:3px"></div>
            </div>
            <span style="font-size:11px;font-weight:500;color:var(--charcoal)">${pSubCnt.count||0}<span style="font-weight:400;color:var(--text3)">/${subCnt.count||0}</span></span>
          </div>
        </div>
      </div>
    </div>
    <div class="card" style="margin:0">
      <div style="padding:12px 14px 8px;border-bottom:0.5px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:12px;font-weight:500;color:var(--charcoal)">SLA Status</span>
        ${slaTotalOverdue>0?`<span style="font-size:11px;font-weight:600;color:var(--red)">${slaTotalOverdue} overdue</span>`:`<span style="font-size:11px;color:var(--green)">All clear</span>`}
      </div>
      <div style="padding:10px 14px;display:flex;flex-direction:column;gap:2px">
        ${slaRows.map(r=>`<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:0.5px solid var(--border)">
          <div style="width:6px;height:6px;border-radius:50%;background:${r.count>0?'var(--red)':'var(--border2)'};flex-shrink:0"></div>
          <span style="flex:1;font-size:11px;color:${r.count>0?'var(--text)':'var(--text3)'}">${r.label}</span>
          <span style="font-size:13px;font-weight:600;color:${r.count>0?'var(--red)':'var(--text3)'};min-width:20px;text-align:right">${r.count}</span>
          ${r.count>0?`<span style="font-size:10px;color:var(--blue-light);cursor:pointer;white-space:nowrap" onclick="nav('${r.page}',null,{filter:'overdue'})">View →</span>`:`<span style="font-size:10px;color:var(--border2)">—</span>`}
        </div>`).join('')}
      </div>
    </div>
  </div>
  <div class="dash-bottom-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
    <div>
      <div class="section-header" style="margin-bottom:8px"><div class="section-title" style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em">Pending submittals</div></div>
      <div class="card"><div class="tw"><table><tr><th>Ref</th><th>Title</th><th>Status</th></tr>
      ${pendSubs.length?pendSubs.map(s=>`<tr onclick="viewSub('${s.id}')"><td class="mono">${s.ref_no}</td><td>${s.title}</td><td>${sbadge(s.status)}</td></tr>`).join(''):'<tr><td colspan="3" class="empty-state">No pending submittals</td></tr>'}
      </table></div></div>
      <div class="section-header" style="margin-top:14px;margin-bottom:8px"><div class="section-title" style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em">Open NCRs</div></div>
      <div class="card"><div class="tw"><table><tr><th>Ref</th><th>Title</th><th>Severity</th></tr>
      ${openNCRs.length?openNCRs.map(n=>`<tr onclick="viewNCR('${n.id}')"><td class="mono">${n.ref_no}</td><td>${n.title}</td><td>${sbadge(n.severity)}</td></tr>`).join(''):'<tr><td colspan="3" class="empty-state">No open NCRs</td></tr>'}
      </table></div></div>
    </div>
    <div>
      <div class="section-header" style="margin-bottom:8px"><div class="section-title" style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em">Pending inspections</div></div>
      <div class="card"><div class="tw"><table><tr><th>Ref</th><th>Description</th><th>Date</th></tr>
      ${pendIRs.length?pendIRs.map(i=>`<tr onclick="viewIR('${i.id}')"><td class="mono">${i.ref_no}</td><td>${(i.elements||'').substring(0,45)}${(i.elements||'').length>45?'…':''}</td><td style="color:var(--text3);font-size:10px">${i.inspection_date||'—'}</td></tr>`).join(''):'<tr><td colspan="3" class="empty-state">No pending inspections</td></tr>'}
      </table></div></div>
      <div class="section-header" style="margin-top:14px;margin-bottom:8px"><div class="section-title" style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em">Recent drawings</div></div>
      <div class="card"><div class="tw"><table><tr><th>No.</th><th>Title</th><th>Rev</th><th>Status</th></tr>
      ${recentDraws.length?recentDraws.map(d=>`<tr onclick="viewDraw('${d.id}')"><td class="mono">${d.drawing_no}</td><td>${d.title}</td><td><span class="rev-chip">${d.revision}</span></td><td>${sbadge(d.status)}</td></tr>`).join(''):'<tr><td colspan="4" class="empty-state">No drawings uploaded yet</td></tr>'}
      </table></div></div>
    </div>
  </div>`;
  // Async: load compliance score widget
  (async () => {
    const [allDraws, publishedDraws, metaDraws] = await Promise.all([
      sb.from('drawings').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id),
      sb.from('drawings').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id).in('cde_state',['Published','Archived']),
      sb.from('drawings').select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id).not('originator','is',null).not('zone','is',null).not('level','is',null),
    ]);
    const total = allDraws.count||0;
    const published = publishedDraws.count||0;
    const withMeta = metaDraws.count||0;
    const pubPct = total>0?Math.round((published/total)*100):0;
    const metaPct = total>0?Math.round((withMeta/total)*100):0;
    const overallScore = Math.round((pubPct+metaPct)/2);
    const scoreColor = overallScore>=70?'var(--green)':overallScore>=40?'var(--amber)':' var(--red)';
    const el = document.getElementById('compliance-widget');
    if(!el) return;
    el.innerHTML = `<div style="background:var(--bg2);border:0.5px solid var(--border);border-radius:12px;padding:14px 18px;display:flex;align-items:center;gap:24px">
      <div style="text-align:center;min-width:56px">
        <div style="font-size:36px;font-weight:600;color:${scoreColor};line-height:1">${overallScore}%</div>
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-top:2px">ISO Compliance</div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;gap:8px">
        <div>
          <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px"><span style="color:var(--text2)">Published or Archived</span><span style="font-weight:500;color:var(--charcoal)">${pubPct}%</span></div>
          <div class="compliance-bar"><div class="compliance-fill" style="width:${pubPct}%;background:var(--green)"></div></div>
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px"><span style="color:var(--text2)">Complete metadata (ISO §5.3.2)</span><span style="font-weight:500;color:var(--charcoal)">${metaPct}%</span></div>
          <div class="compliance-bar"><div class="compliance-fill" style="width:${metaPct}%;background:var(--sand)"></div></div>
        </div>
      </div>
      <div style="font-size:10px;color:var(--text3);text-align:right;min-width:60px">${total} drawing${total!==1?'s':''}<br>tracked</div>
    </div>`;
  })();

  // Async: load discipline completion bars
  (async () => {
    const disciplines = ['Architecture','Structure','MEP','Civil','General','Interior Design'];
    const counts = await Promise.all(disciplines.map(d =>
      Promise.all([
        sb.from('drawings').select('*',{count:'exact',head:true}).eq('project_id',currentProject.id).eq('discipline',d),
        sb.from('drawings').select('*',{count:'exact',head:true}).eq('project_id',currentProject.id).eq('discipline',d).eq('status','Approved')
      ])
    ));
    const barsEl = document.getElementById('disc-bars');
    if(!barsEl) return;
    if(counts.every(c => (c[0].count||0) === 0)) {
      barsEl.innerHTML = '<div style="color:var(--text3);font-size:11px;text-align:center;padding:12px">No drawings yet</div>';
      return;
    }
    barsEl.innerHTML = disciplines.map((d,i) => {
      const total = counts[i][0].count||0;
      const approved = counts[i][1].count||0;
      const pct = total > 0 ? Math.round((approved/total)*100) : 0;
      return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:9px">'
        + '<div style="font-size:10px;color:var(--text3);width:80px;flex-shrink:0;text-transform:uppercase;letter-spacing:.04em">'+d+'</div>'
        + '<div style="flex:1;height:6px;background:var(--bg3);border-radius:3px;overflow:hidden">'
        + '<div style="height:100%;width:'+pct+'%;background:var(--sand);border-radius:3px"></div></div>'
        + '<div style="font-size:11px;font-weight:500;color:var(--charcoal);width:30px;text-align:right">'+pct+'%</div></div>';
    }).join('');
  })();
}
