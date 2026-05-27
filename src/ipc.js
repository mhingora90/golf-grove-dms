// ─── PAYMENT CERTIFICATES ─────────────────────────────────────────
async function renderIPC() {
  const [contractsRes, certsAllRes, allItemsRes] = await Promise.all([
    sb.from('contracts').select('*').eq('project_id',currentProject.id).order('sort_order').order('created_at'),
    sb.from('payment_certificates').select('*').eq('project_id',currentProject.id).order('cert_no'),
    sb.from('payment_certificate_items').select('cert_id,contractor_amount,consultant_amount'),
  ]);
  const contracts = contractsRes.data||[];
  const allCerts  = certsAllRes.data||[];

  // Pre-aggregate amounts per cert
  const amtMap = {};
  for(const it of allItemsRes.data||[]) {
    if(!amtMap[it.cert_id]) amtMap[it.cert_id]={claimed:0,certified:0};
    amtMap[it.cert_id].claimed   += +it.contractor_amount||0;
    amtMap[it.cert_id].certified += +it.consultant_amount||0;
  }

  // Contract tab state — reset if stored ID not in current project's contracts
  if(contracts.length) {
    if(!window._selectedIPCContractId || !contracts.find(c=>c.id===window._selectedIPCContractId))
      window._selectedIPCContractId = contracts[0].id;
  } else {
    window._selectedIPCContractId = null;
  }

  const certs = contracts.length
    ? allCerts.filter(c=>c.contract_id === window._selectedIPCContractId)
    : allCerts;

  const draft      = certs.filter(c=>c.status==='Draft').length;
  const submitted  = certs.filter(c=>c.status==='Submitted').length;
  const underReview= certs.filter(c=>c.status==='Under Review').length;
  const certified  = certs.filter(c=>c.status==='Certified').length;
  const paid       = certs.filter(c=>c.status==='Paid').length;

  const activeContract = contracts.find(c=>c.id===window._selectedIPCContractId);

  const tabsHtml = contracts.length > 1 ? `
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">
      ${contracts.map(c=>{
        const count = allCerts.filter(cert=>cert.contract_id===c.id).length;
        const active = c.id===window._selectedIPCContractId;
        return `<button class="btn${active?' btn-primary':''}" style="font-size:12px;padding:5px 14px" onclick="selectIPCContract('${c.id}')">
          ${esc(c.name)}<span style="margin-left:6px;opacity:0.6">${count}</span>
        </button>`;
      }).join('')}
    </div>` : '';

  const contractBanner = activeContract ? `
    <div style="font-size:11px;color:var(--text2);margin-bottom:12px;padding:8px 12px;background:var(--card2);border-radius:6px;display:flex;gap:18px">
      <span><b>${esc(activeContract.name)}</b></span>
      ${activeContract.contractor?`<span>${esc(activeContract.contractor)}</span>`:''}
      ${activeContract.contract_value?`<span>${fmtAED(activeContract.contract_value)}</span>`:''}
      ${activeContract.award_date?`<span>Awarded ${new Date(activeContract.award_date).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</span>`:''}
    </div>` : '';

  document.getElementById('content').innerHTML = `
  <div class="module-bar">
    <div class="module-stat"><div class="module-stat-val">${certs.length}</div><div class="module-stat-label">Total IPCs</div></div>
    <div class="module-stat"><div class="module-stat-val ${draft>0?'warn':''}">${draft}</div><div class="module-stat-label">Draft</div></div>
    <div class="module-stat"><div class="module-stat-val ${submitted>0?'warn':''}">${submitted}</div><div class="module-stat-label">Submitted</div></div>
    <div class="module-stat"><div class="module-stat-val ${underReview>0?'warn':''}">${underReview}</div><div class="module-stat-label">Under Review</div></div>
    <div class="module-stat"><div class="module-stat-val">${certified}</div><div class="module-stat-label">Certified</div></div>
    <div class="module-stat"><div class="module-stat-val">${paid}</div><div class="module-stat-label">Paid</div></div>
  </div>
  <div class="card">
    ${tabsHtml}${contractBanner}
    <div class="tw"><table>
    <tr><th>Ref No.</th><th>Submission Date</th><th>Submitted By</th><th style="text-align:right">Contractor Claimed</th><th style="text-align:right">Consultant Certified</th><th>Status</th><th>Actions</th></tr>
    ${certs.length ? certs.map(c=>{
      const a = amtMap[c.id]||{claimed:0,certified:0};
      return `<tr class="ipc-list-row" onclick="viewIPC('${c.id}')">
      <td class="mono" style="font-weight:500;color:var(--sand)">${esc(c.ref_no)}<span style="font-size:10px;color:var(--text3);margin-left:5px">#${c.cert_no}</span></td>
      <td style="font-size:11px;color:var(--text2)">${c.submitted_date ? new Date(c.submitted_date).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '&mdash;'}</td>
      <td style="font-size:11px;color:var(--text2)">${esc(c.submitted_by_name||'—')}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums;color:var(--charcoal)">${a.claimed ? fmtAED(a.claimed) : '&mdash;'}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums;color:var(--green)">${a.certified ? fmtAED(a.certified) : '&mdash;'}</td>
      <td>${sbadge(c.status)}</td>
      <td><button class="btn btn-sm" onclick="event.stopPropagation();viewIPC('${c.id}')">View</button></td>
    </tr>`;}).join('') : '<tr><td colspan="7" class="empty-state">No payment certificates yet. Click + New to create the first IPC.</td></tr>'}
  </table></div></div>`;
}

function selectIPCContract(id) {
  window._selectedIPCContractId = id;
  renderIPC();
}

async function openNewIPC() {
  // Load contracts for this project
  const {data:contracts} = await sb.from('contracts').select('*').eq('project_id',currentProject.id).order('sort_order').order('created_at');

  if(contracts?.length) {
    // Project has contracts — require selecting one
    if(contracts.length === 1) {
      await _openNewIPCForContract(contracts[0]);
    } else {
      openModal('New Payment Application', `
        <p style="font-size:13px;color:var(--text2);margin-bottom:14px">Which contract is this application for?</p>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${contracts.map(c=>`
            <button class="btn" style="text-align:left;padding:12px 16px;border:0.5px solid var(--border2)" onclick="closeModal();_openNewIPCForContract(${JSON.stringify(c).replace(/"/g,'&quot;')})">
              <div style="font-weight:600;font-size:13px">${esc(c.name)}</div>
              <div style="font-size:11px;color:var(--text2);margin-top:2px">${esc(c.contractor||'No contractor')} · ${fmtAED(c.contract_value||0)}</div>
            </button>`).join('')}
        </div>`,
        `<button class="btn" onclick="closeModal()">Cancel</button>`);
    }
  } else {
    // No contracts defined — legacy project-level flow
    await _openNewIPCLegacy();
  }
}

async function _openNewIPCForContract(contract) {
  const cid = contract.id;

  const {count:openCount} = await sb.from('payment_certificates')
    .select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id).eq('contract_id',cid).in('status',['Draft','Submitted']);
  if(openCount > 0) { toast('An application for this contract is already in progress.','warning'); return; }

  const {data:cBills} = await sb.from('boq_bills').select('id').eq('contract_id',cid);
  const cBillIds = (cBills||[]).map(b=>b.id);
  const {count:boqCount} = cBillIds.length
    ? await sb.from('boq_items').select('*',{head:true,count:'exact'}).in('bill_id',cBillIds)
    : {count:0};
  if(!boqCount) { toast('No BOQ loaded for this contract. Add bills in BOQ Setup first.','warning'); return; }

  const {data:lastCert} = await sb.from('payment_certificates').select('cert_no')
    .eq('project_id',currentProject.id).eq('contract_id',cid).order('cert_no',{ascending:false}).limit(1);
  const nextNo = ((lastCert?.[0]?.cert_no)||0) + 1;
  const refNo = 'IPC-' + String(nextNo).padStart(3,'0');
  const isFirst = nextNo === 1;

  // prevPaid from prior certified/paid certs for this contract
  const {data:priorCerts} = await sb.from('payment_certificates')
    .select('id,retention_pct,advance_recovery_pct,vat_pct')
    .eq('project_id',currentProject.id).eq('contract_id',cid).in('status',['Certified','Paid']);
  let prevPaid = 0;
  for(const pc of priorCerts||[]) {
    const {data:pit} = await sb.from('payment_certificate_items').select('consultant_amount').eq('cert_id',pc.id);
    const gross = (pit||[]).reduce((s,i)=>s+(+i.consultant_amount||0),0);
    const nbv = gross - gross*(+pc.retention_pct||10)/100 - gross*(+pc.advance_recovery_pct||10)/100;
    prevPaid += nbv + nbv*(+pc.vat_pct||5)/100;
  }

  if(isFirst) {
    openModal(`New Application — ${esc(contract.name)}`, `
      <div class="detail-grid" style="margin-bottom:14px">
        <div class="detail-item"><div class="detail-label">Contract</div><div class="detail-value">${esc(contract.name)}</div></div>
        <div class="detail-item"><div class="detail-label">Reference</div><div class="detail-value mono" style="color:var(--sand);font-weight:600">${esc(refNo)}</div></div>
      </div>
      <div class="frow">
        <div class="form-group"><label class="form-label-dark">Retention (%)</label><input type="number" min="0" max="100" step="0.5" class="form-control" id="ipc-new-ret" value="10" /></div>
        <div class="form-group"><label class="form-label-dark">Advance Recovery (%)</label><input type="number" min="0" max="100" step="0.5" class="form-control" id="ipc-new-adv" value="10" /></div>
      </div>
      <div class="frow">
        <div class="form-group"><label class="form-label-dark">Mobilisation Advance (AED)</label><input type="number" min="0" class="form-control" id="ipc-new-mob" value="0" /></div>
        <div class="form-group"><label class="form-label-dark">VAT (%)</label><input type="number" min="0" max="30" step="0.5" class="form-control" id="ipc-new-vat" value="5" /></div>
      </div>
      <p style="font-size:12px;color:var(--text2);margin-top:8px;line-height:1.6">Set once for this contract — carried forward automatically to all subsequent applications.</p>`,
      `<button class="btn btn-primary" onclick="doNewIPC('${esc(refNo)}',${nextNo},${prevPaid},'${cid}')">Create Application</button>
       <button class="btn" onclick="closeModal()">Cancel</button>`);
  } else {
    // Inherit settings from last IPC for this contract — no form shown
    const {data:prev} = await sb.from('payment_certificates')
      .select('retention_pct,advance_recovery_pct,mobilisation_advance,vat_pct')
      .eq('project_id',currentProject.id).eq('contract_id',cid).order('created_at',{ascending:false}).limit(1);
    await doNewIPC(refNo, nextNo, prevPaid, cid,
      prev?.[0]?.retention_pct??10, prev?.[0]?.advance_recovery_pct??10,
      prev?.[0]?.mobilisation_advance??0, prev?.[0]?.vat_pct??5);
  }
}

async function _openNewIPCLegacy() {
  // Legacy flow for projects with no contracts defined
  const {count:openCount} = await sb.from('payment_certificates')
    .select('*',{head:true,count:'exact'}).eq('project_id',currentProject.id).in('status',['Draft','Submitted']);
  if(openCount > 0) { toast('An application is already in progress. Complete or retract it first.','warning'); return; }

  const {data:projBills} = await sb.from('boq_bills').select('id').eq('project_id',currentProject.id);
  const projBillIds = (projBills||[]).map(b=>b.id);
  const {count:boqCount} = projBillIds.length
    ? await sb.from('boq_items').select('*',{head:true,count:'exact'}).in('bill_id',projBillIds)
    : {count:0};
  if(!boqCount) { toast('No BOQ loaded. Go to BOQ Setup and import your Bill of Quantities first.','warning'); return; }

  const {data:last} = await sb.from('payment_certificates').select('cert_no').eq('project_id',currentProject.id).order('cert_no',{ascending:false}).limit(1);
  const nextNo = ((last?.[0]?.cert_no)||0) + 1;
  const refNo = 'IPC-' + String(nextNo).padStart(3,'0');
  const isFirst = nextNo === 1;

  const {data:priorCerts} = await sb.from('payment_certificates')
    .select('id,retention_pct,advance_recovery_pct,vat_pct').eq('project_id',currentProject.id).in('status',['Certified','Paid']);
  let prevPaid = 0;
  for(const pc of priorCerts||[]) {
    const {data:pit} = await sb.from('payment_certificate_items').select('consultant_amount').eq('cert_id',pc.id);
    const gross = (pit||[]).reduce((s,i)=>s+(+i.consultant_amount||0),0);
    const nbv = gross - gross*(+pc.retention_pct||10)/100 - gross*(+pc.advance_recovery_pct||10)/100;
    prevPaid += nbv + nbv*(+pc.vat_pct||5)/100;
  }

  if(isFirst) {
    openModal('New Payment Application', `
      <div class="detail-grid" style="margin-bottom:14px">
        <div class="detail-item"><div class="detail-label">Reference</div><div class="detail-value mono" style="color:var(--sand);font-weight:600">${esc(refNo)}</div></div>
        <div class="detail-item"><div class="detail-label">Previously Paid</div><div class="detail-value">${fmtAED(prevPaid)}</div></div>
      </div>
      <div class="frow">
        <div class="form-group"><label class="form-label-dark">Retention (%)</label><input type="number" min="0" max="100" step="0.5" class="form-control" id="ipc-new-ret" value="10" /></div>
        <div class="form-group"><label class="form-label-dark">Advance Recovery (%)</label><input type="number" min="0" max="100" step="0.5" class="form-control" id="ipc-new-adv" value="10" /></div>
      </div>
      <div class="frow">
        <div class="form-group"><label class="form-label-dark">Mobilisation Advance (AED)</label><input type="number" min="0" class="form-control" id="ipc-new-mob" value="0" /></div>
        <div class="form-group"><label class="form-label-dark">VAT (%)</label><input type="number" min="0" max="30" step="0.5" class="form-control" id="ipc-new-vat" value="5" /></div>
      </div>
      <p style="font-size:12px;color:var(--text2);margin-top:8px;line-height:1.6">Set once — carried forward automatically to all subsequent applications.</p>`,
      `<button class="btn btn-primary" onclick="doNewIPC('${esc(refNo)}',${nextNo},${prevPaid},null)">Create Application</button>
       <button class="btn" onclick="closeModal()">Cancel</button>`);
  } else {
    const {data:prev} = await sb.from('payment_certificates')
      .select('retention_pct,advance_recovery_pct,mobilisation_advance,vat_pct')
      .eq('project_id',currentProject.id).order('created_at',{ascending:false}).limit(1);
    await doNewIPC(refNo, nextNo, prevPaid, null,
      prev?.[0]?.retention_pct??10, prev?.[0]?.advance_recovery_pct??10,
      prev?.[0]?.mobilisation_advance??0, prev?.[0]?.vat_pct??5);
  }
}

async function doNewIPC(refNo, certNo, prevPaid, contractId, retPct, advPct, mobAmt, vatPct) {
  retPct = retPct ?? +(document.getElementById('ipc-new-ret')?.value ?? 10);
  advPct = advPct ?? +(document.getElementById('ipc-new-adv')?.value ?? 10);
  mobAmt = mobAmt ?? +(document.getElementById('ipc-new-mob')?.value ?? 0);
  vatPct = vatPct ?? +(document.getElementById('ipc-new-vat')?.value ?? 5);

  const {data:cert, error:certErr} = await sb.from('payment_certificates').insert({
    project_id:currentProject.id, contract_id:contractId||null,
    cert_no:certNo, ref_no:refNo, status:'Draft', previously_paid:prevPaid,
    retention_pct:retPct, advance_recovery_pct:advPct, mobilisation_advance:mobAmt, vat_pct:vatPct
  }).select('id').single();
  if(certErr) { toast('Error creating IPC: '+certErr.message,'error'); return; }

  // BOQ items: scoped to contract if set, else all project bills
  const billQ = contractId
    ? sb.from('boq_bills').select('id').eq('contract_id',contractId)
    : sb.from('boq_bills').select('id').eq('project_id',currentProject.id);
  const {data:billsForCert} = await billQ;
  const billIdsForCert = (billsForCert||[]).map(b=>b.id);
  const {data:boqItems} = billIdsForCert.length
    ? await sb.from('boq_items').select('id').in('bill_id',billIdsForCert)
    : {data:[]};
  const certItems = (boqItems||[]).map(i=>({cert_id:cert.id, boq_item_id:i.id, contractor_pct:0, contractor_amount:0}));
  if(certItems.length) {
    const {error:iErr} = await sb.from('payment_certificate_items').insert(certItems);
    if(iErr) { toast('Error initialising IPC items: '+iErr.message,'error'); return; }
  }
  toast(`${refNo} created`,'success'); closeModal(); viewIPC(cert.id);
}

async function viewIPC(id) {
  const [{data:cert},{data:pitems},{data:bills},{data:boqItems}] = await Promise.all([
    sb.from('payment_certificates').select('*').eq('id',id).single(),
    sb.from('payment_certificate_items').select('*').eq('cert_id',id),
    sb.from('boq_bills').select('*').eq('project_id',currentProject.id).order('sort_order').order('created_at'),
    sb.from('boq_items').select('*').order('sort_order').order('created_at')
  ]);
  if(!cert) { toast('Certificate not found','error'); return; }

  const role = currentProfile?.role;
  const canEditContractor = (role==='contractor'||role==='developer') && (cert.status==='Draft'||cert.status==='Submitted');
  // Consultant/developer can edit certified %s when Under Review
  const canEditConsultant = (role==='consultant'||role==='developer') && cert.status==='Under Review';

  const sortedBills = (bills||[]).sort((a,b)=>(+a.bill_no||0)-(+b.bill_no||0)||a.bill_no.localeCompare(b.bill_no));

  const itemMap = {};
  (pitems||[]).forEach(pi => itemMap[pi.boq_item_id] = pi);
  window._ipcPitems = itemMap;
  window._ipcBoqItems = boqItems||[];
  window._ipcCert = cert;

  const billRows = sortedBills.map(b => {
    const bItems = (boqItems||[]).filter(i=>i.bill_id===b.id);
    const billContrAmt = bItems.reduce((s,i)=>s+(+itemMap[i.id]?.contractor_amount||0),0);
    const billConsAmt  = bItems.reduce((s,i)=>s+(+itemMap[i.id]?.consultant_amount||0),0);

    const itemRows = bItems.map(item => {
      const pi = itemMap[item.id]||{};
      const ctrPct = pi.contractor_pct??0;
      const csPct  = pi.consultant_pct??'';
      return `<tr data-item-id="${item.id}" data-boq-total="${item.total}" data-bill-id="${b.id}">
        <td class="mono" style="width:80px">${esc(item.item_no)}</td>
        <td style="min-width:200px">${esc(item.description)}</td>
        <td style="text-align:right;width:60px;color:var(--text2)">${+item.qty||'—'}</td>
        <td style="width:50px;color:var(--text2)">${esc(item.unit||'—')}</td>
        <td style="text-align:right;width:90px">${fmtAED(item.total)}</td>
        <td style="text-align:right;width:80px">${canEditContractor
          ? `<input type="number" min="0" max="100" step="0.5" class="form-control" style="width:70px;text-align:right;padding:3px 6px" value="${+ctrPct}" onchange="setModalDirty();recalcIPCRow(this,'contractor')">`
          : `${(+ctrPct).toFixed(1)}%`}</td>
        <td style="text-align:right;width:110px;font-variant-numeric:tabular-nums" id="contr-amt-${item.id}">${fmtAED(+pi.contractor_amount||0)}</td>
        <td style="text-align:right;width:80px">${canEditConsultant
          ? `<input type="number" min="0" max="100" step="0.5" class="form-control" style="width:70px;text-align:right;padding:3px 6px" value="${csPct!==''?+csPct:''}" onchange="setModalDirty();recalcIPCRow(this,'consultant')">`
          : `${csPct!==''?(+csPct).toFixed(1)+'%':'&mdash;'}`}</td>
        <td style="text-align:right;width:110px;font-variant-numeric:tabular-nums" id="consult-amt-${item.id}">${pi.consultant_amount!=null?fmtAED(+pi.consultant_amount):'&mdash;'}</td>
      </tr>`;
    }).join('');

    return `<tr class="boq-bill-header" data-bill-id="${b.id}">
      <td colspan="4" style="padding:8px 14px">${esc(b.bill_no)}. ${esc(b.title)}</td>
      <td></td>
      <td colspan="2" style="text-align:right;padding:8px 14px;font-variant-numeric:tabular-nums" id="bill-contr-${b.id}">${fmtAED(billContrAmt)}</td>
      <td colspan="2" style="text-align:right;padding:8px 14px;font-variant-numeric:tabular-nums" id="bill-cons-${b.id}">${billConsAmt?fmtAED(billConsAmt):'&mdash;'}</td>
    </tr>${itemRows}`;
  }).join('');

  // Financial summary calcs
  const allPitems = (pitems||[]);
  const grossContr = allPitems.reduce((s,i)=>s+(+i.contractor_amount||0),0);
  const gross = allPitems.reduce((s,i)=>s+(+i.consultant_amount||0),0);
  const retPct = +cert.retention_pct||10;
  const advPct = +cert.advance_recovery_pct||10;
  const vatPct = +cert.vat_pct||5;
  const prevPaid = +cert.previously_paid||0;
  // Consultant side calculations (always the accepted/final values)
  const consRetention = gross * retPct / 100;
  const consAdvRecovery = gross * advPct / 100;
  const consNetBeforeVat = gross - consRetention - consAdvRecovery - prevPaid;
  const consVat = consNetBeforeVat * vatPct / 100;
  const consNet = consNetBeforeVat + consVat;
  // Contractor side calculations
  const ctrRetention = grossContr * retPct / 100;
  const ctrAdvRecovery = grossContr * advPct / 100;
  const ctrNetBeforeVat = grossContr - ctrRetention - ctrAdvRecovery - prevPaid;
  const ctrVat = ctrNetBeforeVat * vatPct / 100;
  const ctrNet = ctrNetBeforeVat + ctrVat;

  // When consultant has entered amounts OR status allows consultant editing, show comparison table
  const hasConsultant = gross > 0 || canEditConsultant;
  const compRow = (label, ctrVal, consVal, ded, id) => {
    const ctr = ded ? '('+fmtAED(ctrVal)+')' : fmtAED(ctrVal);
    const cons = ded ? '('+fmtAED(consVal)+')' : fmtAED(consVal);
    return `<div class="ipc-row${ded?' deduct':''}" id="${id}">
      <span class="ipc-label">${label}</span>
      <span class="ipc-val">${ctrVal?ctr:'—'}</span>
      <span class="ipc-val" style="font-weight:600;color:var(--charcoal)">${consVal?cons:'—'}</span>
    </div>`;
  };
  const totalRow = (label, ctrVal, consVal) => {
    const ctr = fmtAED(ctrVal);
    const cons = fmtAED(consVal);
    return `<div class="ipc-row total" id="${label.replace(/\s+/g,'-')}">
      <span class="ipc-label">${label}</span>
      <span class="ipc-val">${ctrVal?ctr:'—'}</span>
      <span class="ipc-val" style="font-weight:700;color:var(--green)">${consVal?cons:'—'}</span>
    </div>`;
  };

  const comparisonHTML = hasConsultant ? `
    <div class="ipc-summary" id="ipc-financial-summary" data-compare="true">
      <div style="font-size:11px;font-weight:600;color:var(--charcoal);margin-bottom:6px">Financial Summary</div>
      <div style="display:grid;grid-template-columns:1fr 130px 130px;gap:8px;padding:6px 0;border-bottom:0.5px solid var(--border);font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em">
        <span></span><span style="text-align:right">Contractor</span><span style="text-align:right;color:var(--charcoal)">Consultant</span>
      </div>
      ${compRow('Value of Works', grossContr, gross, false, 'sum-gross')}
      ${compRow('Less: Retention', ctrRetention, consRetention, true, 'sum-retention')}
      ${compRow('Less: Advance Recovery', ctrAdvRecovery, consAdvRecovery, true, 'sum-advance')}
      ${compRow('Less: Previously Paid', prevPaid, prevPaid, true, 'sum-prev')}
      <div style="height:1px;background:var(--border);margin:4px 0"></div>
      ${compRow('Net Before VAT', ctrNetBeforeVat, consNetBeforeVat, false, 'sum-net-before-vat')}
      ${compRow('VAT', ctrVat, consVat, false, 'sum-vat')}
      ${totalRow('NET CERTIFIED', ctrNet, consNet)}
    </div>` : `
    <div class="ipc-summary" id="ipc-financial-summary">
      <div style="font-size:11px;font-weight:600;color:var(--charcoal);margin-bottom:6px">Financial Summary</div>
      <div class="ipc-row"><span class="ipc-label">Contractor Claimed</span><span class="ipc-val" id="sum-contractor">${fmtAED(grossContr)}</span></div>
      <div class="ipc-row"><span class="ipc-label">Value of Works</span><span class="ipc-val" id="sum-gross">${grossContr?fmtAED(grossContr):'&mdash;'}</span></div>
      <div class="ipc-row deduct"><span class="ipc-label">Less: Retention (${retPct}%)</span><span class="ipc-val deduct" id="sum-retention">${grossContr?'('+fmtAED(ctrRetention)+')':'&mdash;'}</span></div>
      <div class="ipc-row deduct"><span class="ipc-label">Less: Advance Recovery (${advPct}%)</span><span class="ipc-val deduct" id="sum-advance">${grossContr?'('+fmtAED(ctrAdvRecovery)+')':'&mdash;'}</span></div>
      <div class="ipc-row deduct"><span class="ipc-label">Less: Previously Paid</span><span class="ipc-val deduct" id="sum-prev">${prevPaid?'('+fmtAED(prevPaid)+')':'&mdash;'}</span></div>
      <div class="ipc-row"><span class="ipc-label">Net Before VAT</span><span class="ipc-val" id="sum-net-before-vat">${grossContr?fmtAED(ctrNetBeforeVat):'&mdash;'}</span></div>
      <div class="ipc-row vat"><span class="ipc-label">VAT (${vatPct}%)</span><span class="ipc-val vat" id="sum-vat">${grossContr?fmtAED(ctrVat):'&mdash;'}</span></div>
      <div class="ipc-row total"><span class="ipc-label">NET CERTIFIED</span><span class="ipc-val total" id="sum-net">${grossContr?fmtAED(ctrNet):'&mdash;'}</span></div>
    </div>`;

  const summaryHTML = comparisonHTML;

  const ipcChipsHTML = (bills||[]).length ? `<div class="fbar" style="margin-bottom:10px">
    <select class="filter-sel" onchange="filtIPC(this.value)">
      <option value="all">All Bills</option>
      ${sortedBills.map(b=>`<option value="${b.id}">${esc(b.bill_no)}. ${esc(b.title)}</option>`).join('')}
    </select>
  </div>` : '';

  const headerHTML = `<div class="detail-grid">
    <div class="detail-item"><div class="detail-label">Reference</div><div class="detail-value mono" style="font-weight:600;color:var(--sand)">${esc(cert.ref_no)}</div></div>
    <div class="detail-item"><div class="detail-label">Status</div><div class="detail-value">${sbadge(cert.status)}</div></div>
    ${cert.submitted_date?`<div class="detail-item"><div class="detail-label">Submitted</div><div class="detail-value">${new Date(cert.submitted_date).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})} by ${esc(cert.submitted_by_name||'—')}</div></div>`:''}
    ${cert.certified_date?`<div class="detail-item"><div class="detail-label">Certified</div><div class="detail-value">${new Date(cert.certified_date).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})} by ${esc(cert.certified_by_name||'—')}</div></div>`:''}
    ${cert.paid_date?`<div class="detail-item"><div class="detail-label">Paid</div><div class="detail-value">${esc(cert.paid_date)} &middot; Ref: ${esc(cert.payment_ref||'—')}</div></div>`:''}
    ${cert.notes?`<div class="detail-item" style="grid-column:span 2"><div class="detail-label">Notes</div><div class="detail-value">${esc(cert.notes)}</div></div>`:''}
  </div>`;

  window._onModalClose = () => { if(currentPage==='ipc') renderIPC(); };
  openModal(`${esc(cert.ref_no)} — Payment Application`, `
    ${headerHTML}
    <div class="detail-section">
      <div class="section-header"><span class="section-title">Bill of Quantities — Progress Claims</span></div>
      ${ipcChipsHTML}
      <div class="tw" style="overflow-x:auto;max-height:380px;overflow-y:auto;border:0.5px solid var(--border);border-radius:var(--radius)">
        <table style="font-size:11px">
          <tr><th>Item No.</th><th>Description</th><th style="text-align:right">Qty</th><th>Unit</th><th style="text-align:right">BOQ Total</th><th style="text-align:right">Contr. %</th><th style="text-align:right">Contr. Amt</th><th style="text-align:right">Consult. %</th><th style="text-align:right">Consult. Amt</th></tr>
          ${billRows}
        </table>
      </div>
    </div>
    <div class="detail-section">${summaryHTML}</div>`,
    ipcActionButtons(cert, id), true);
}

function ipcActionButtons(cert, id) {
  const role = currentProfile?.role;
  const s = cert.status;
  let btns = `<button class="btn" onclick="closeModal()">Close</button>`;
  const canDelete = role==='developer' || (s==='Draft' && role==='contractor');
  if(canDelete)
    btns = `<button class="btn btn-danger" onclick="deleteIPC('${id}')" style="margin-right:auto">Delete</button>` + btns;
  if(s==='Draft' && (role==='contractor'||role==='developer'))
    btns = `<button class="btn btn-primary" onclick="saveIPCClaims('${id}','submit')">Save &amp; Submit</button>
            <button class="btn" onclick="saveIPCClaims('${id}','draft')">Save Draft</button>` + btns;
  if(s==='Submitted' && (role==='contractor'||role==='developer'))
    btns = `<button class="btn btn-danger" onclick="retractIPC('${id}')">Retract to Draft</button>` + btns;
  if(s==='Submitted' && (role==='consultant'||role==='developer'))
    btns = `<button class="btn btn-primary" onclick="beginReviewIPC('${id}')">Begin Review</button>` + btns;
  if(s==='Under Review' && (role==='consultant'||role==='developer'))
    btns = `<button class="btn btn-success" onclick="saveIPCCertification('${id}','certify')">Issue Certificate</button>
            <button class="btn" onclick="saveIPCCertification('${id}','return')">Return to Contractor</button>` + btns;
  if(s==='Certified' && role==='developer')
    btns = `<button class="btn btn-primary" onclick="openRecordPayment('${id}')">Record Payment</button>` + btns;
  return btns;
}

async function deleteIPC(id) {
  const ok = await confirmModal('Permanently delete this payment application? This cannot be undone.');
  if(!ok) return;
  const {error} = await sb.from('payment_certificates').delete().eq('id',id);
  if(error) { toast('Error deleting IPC: '+error.message,'error'); return; }
  toast('Application deleted','success'); closeModal(); render();
}

function recalcIPCRow(input, party) {
  const tr = input.closest('tr');
  const boqTotal = +tr.dataset.boqTotal||0;
  const itemId = tr.dataset.itemId;
  const billId = tr.dataset.billId;
  const pct = +input.value||0;
  const amt = boqTotal * pct / 100;
  if(party==='contractor') {
    const el = document.getElementById('contr-amt-'+itemId);
    if(el) el.textContent = fmtAED(amt);
    if(window._ipcPitems[itemId]) { window._ipcPitems[itemId].contractor_pct=pct; window._ipcPitems[itemId].contractor_amount=amt; }
  } else {
    const el = document.getElementById('consult-amt-'+itemId);
    if(el) el.textContent = fmtAED(amt);
    if(window._ipcPitems[itemId]) { window._ipcPitems[itemId].consultant_pct=pct; window._ipcPitems[itemId].consultant_amount=amt; }
  }
  // Refresh bill-header subtotals so the group totals stay in sync
  if(billId) {
    const billBoqIds = (window._ipcBoqItems||[]).filter(b=>b.bill_id===billId).map(b=>b.id);
    const billContr = billBoqIds.reduce((s,k)=>s+(+window._ipcPitems[k]?.contractor_amount||0),0);
    const billCons  = billBoqIds.reduce((s,k)=>s+(+window._ipcPitems[k]?.consultant_amount||0),0);
    const hContr = document.getElementById('bill-contr-'+billId);
    const hCons  = document.getElementById('bill-cons-'+billId);
    if(hContr) hContr.textContent = fmtAED(billContr);
    if(hCons)  hCons.textContent  = billCons ? fmtAED(billCons) : '—';
  }
  recalcIPCSummary();
}

function recalcIPCSummary() {
  const pitems = Object.values(window._ipcPitems||{});
  const cert = window._ipcCert||{};
  const grossContr = pitems.reduce((s,i)=>s+(+i.contractor_amount||0),0);
  const gross = pitems.reduce((s,i)=>s+(+i.consultant_amount||0),0);
  const retPct = +cert.retention_pct||10;
  const advPct = +cert.advance_recovery_pct||10;
  const vatPct = +cert.vat_pct||5;
  const prevPaid = +cert.previously_paid||0;

  const ctrRetention = grossContr * retPct / 100;
  const ctrAdvRecovery = grossContr * advPct / 100;
  const ctrNetBeforeVat = grossContr - ctrRetention - ctrAdvRecovery - prevPaid;
  const ctrVat = ctrNetBeforeVat * vatPct / 100;
  const ctrNet = ctrNetBeforeVat + ctrVat;

  const consRetention = gross * retPct / 100;
  const consAdvRecovery = gross * advPct / 100;
  const consNetBeforeVat = gross - consRetention - consAdvRecovery - prevPaid;
  const consVat = consNetBeforeVat * vatPct / 100;
  const consNet = consNetBeforeVat + consVat;

  const set = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  const hasConsultant = gross > 0;
  if(hasConsultant) {
    // Comparison mode: update both columns
    const setPair = (id, ctrVal, consVal) => {
      const el = document.getElementById(id);
      if(el) { const vals = el.querySelectorAll('.ipc-val'); if(vals[0]) vals[0].textContent=ctrVal; if(vals[1]) vals[1].textContent=consVal; };
    };
    setPair('sum-gross', fmtAED(grossContr), fmtAED(gross));
    setPair('sum-retention', '('+fmtAED(ctrRetention)+')', '('+fmtAED(consRetention)+')');
    setPair('sum-advance', '('+fmtAED(ctrAdvRecovery)+')', '('+fmtAED(consAdvRecovery)+')');
    setPair('sum-prev', '('+fmtAED(prevPaid)+')', '('+fmtAED(prevPaid)+')');
    setPair('sum-net-before-vat', fmtAED(ctrNetBeforeVat), fmtAED(consNetBeforeVat));
    setPair('sum-vat', fmtAED(ctrVat), fmtAED(consVat));
    setPair('NET-CERTIFIED', fmtAED(ctrNet), fmtAED(consNet)+' ✓');
  } else {
    // Single column mode
    set('sum-gross', grossContr ? fmtAED(grossContr) : '—');
    set('sum-retention', grossContr ? '('+fmtAED(ctrRetention)+')' : '—');
    set('sum-advance', grossContr ? '('+fmtAED(ctrAdvRecovery)+')' : '—');
    set('sum-net-before-vat', grossContr ? fmtAED(ctrNetBeforeVat) : '—');
    set('sum-vat', grossContr ? fmtAED(ctrVat) : '—');
    set('sum-net', grossContr ? fmtAED(ctrNet) : '—');
  }
}

async function saveIPCClaims(id, action) {
  const cert = window._ipcCert||{};

  // Save item-level claims
  const rows = document.querySelectorAll('tr[data-item-id]');
  for(const tr of rows) {
    const itemId = tr.dataset.itemId;
    const boqTotal = +tr.dataset.boqTotal||0;
    const input = tr.querySelector('input[type=number]');
    const pct = input ? +input.value||0 : (+window._ipcPitems[itemId]?.contractor_pct||0);
    const amt = boqTotal * pct / 100;
    await sb.from('payment_certificate_items')
      .update({contractor_pct:pct, contractor_amount:amt})
      .eq('cert_id',id).eq('boq_item_id',itemId);
  }
  if(action==='submit') {
    const {error} = await sb.from('payment_certificates').update({
      status:'Submitted',
      submitted_by_name: currentProfile?.full_name||currentUser?.email,
      submitted_date: new Date().toISOString()
    }).eq('id',id);
    if(error) { toast('Error: '+error.message,'error'); return; }
    toast('Application submitted to consultant','success');
  } else {
    toast('Draft saved','success');
  }
  _modalDirty = false; closeModal(); render();
}

async function beginReviewIPC(id) {
  const ok = await confirmModal('Begin review? The contractor will no longer be able to edit this application.');
  if(!ok) return;
  const {error} = await sb.from('payment_certificates').update({status:'Under Review'}).eq('id',id);
  if(error) { toast('Error: '+error.message,'error'); return; }
  toast('Review started','success'); closeModal(); viewIPC(id);
}

async function retractIPC(id) {
  const ok = await confirmModal('Retract this application back to Draft? The consultant will no longer see it as submitted.');
  if(!ok) return;
  const {error} = await sb.from('payment_certificates').update({status:'Draft',submitted_date:null,submitted_by_name:null}).eq('id',id);
  if(error) { toast('Error: '+error.message,'error'); return; }
  toast('Application retracted to Draft','success'); closeModal(); render();
}

async function saveIPCCertification(id, action) {
  const cert = window._ipcCert||{};
  const rows = document.querySelectorAll('tr[data-item-id]');
  for(const tr of rows) {
    const itemId = tr.dataset.itemId;
    const boqTotal = +tr.dataset.boqTotal||0;
    const input = tr.querySelector('input[type=number]');
    if(!input) continue;
    const pct = +input.value||0;
    await sb.from('payment_certificate_items')
      .update({consultant_pct:pct, consultant_amount:boqTotal*pct/100})
      .eq('cert_id',id).eq('boq_item_id',itemId);
  }

  if(action==='certify') {
    const {error} = await sb.from('payment_certificates').update({
      status:'Certified',
      certified_by_name: currentProfile?.full_name||currentUser?.email,
      certified_date: new Date().toISOString()
    }).eq('id',id);
    if(error) { toast('Error: '+error.message,'error'); return; }
    toast('IPC certified and issued','success'); _modalDirty=false; closeModal(); render();
  } else {
    await sb.from('payment_certificates').update({status:'Submitted'}).eq('id',id);
    toast('Application returned to contractor','info'); _modalDirty=false; closeModal(); render();
  }
}

function openRecordPayment(id) {
  const cert = window._ipcCert||{};
  const pitems = window._ipcPitems||{};
  const gross = Object.values(pitems).reduce((s,pi)=>s+(+pi.consultant_amount||0),0);
  const ret = gross*(+cert.retention_pct||0)/100;
  const adv = gross*(+cert.advance_recovery_pct||0)/100;
  const prev = +cert.previously_paid||0;
  const nbv = gross-ret-adv-prev;
  const netCertified = Math.round((nbv+nbv*(+cert.vat_pct||0)/100)*100)/100;
  const alreadyPaid = Math.round((+cert.amount_paid||0)*100)/100;
  const remaining = Math.max(0, Math.round((netCertified-alreadyPaid)*100)/100);
  window._payCtx = {id, netCertified, alreadyPaid};
  openModal('Record Payment', `
    <div style="background:var(--bg3);border-radius:6px;padding:10px 14px;margin-bottom:14px;font-size:12px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
      <div><div style="color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">Net Certified</div><div style="font-weight:600;color:var(--charcoal)">${fmtAED(netCertified)}</div></div>
      <div><div style="color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">Already Paid</div><div style="font-weight:600;color:var(--text2)">${fmtAED(alreadyPaid)}</div></div>
      <div><div style="color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">Balance Due</div><div style="font-weight:600;color:var(--green)">${fmtAED(remaining)}</div></div>
    </div>
    <div class="frow">
      <div class="form-group"><label class="form-label-dark">Amount Being Paid (AED)</label><input type="number" class="form-control" id="pay-amount" value="${remaining.toFixed(2)}" min="0.01" step="0.01" /></div>
      <div class="form-group"><label class="form-label-dark">Payment Date</label><input type="date" class="form-control" id="pay-date" value="${new Date().toISOString().split('T')[0]}" /></div>
    </div>
    <div class="form-group"><label class="form-label-dark">Payment Reference</label><input type="text" class="form-control" id="pay-ref" placeholder="Bank ref / cheque no." /></div>`,
    `<button class="btn btn-primary" onclick="doRecordPayment()">Confirm Payment</button>
     <button class="btn" onclick="closeModal()">Cancel</button>`);
}

async function doRecordPayment() {
  const {id, netCertified, alreadyPaid} = window._payCtx||{};
  const amtNow = parseFloat(document.getElementById('pay-amount').value)||0;
  const date   = document.getElementById('pay-date').value;
  const ref    = document.getElementById('pay-ref').value.trim();
  if(!date) { toast('Payment date is required','error'); return; }
  if(amtNow <= 0) { toast('Amount must be greater than 0','error'); return; }
  const newTotal = Math.round((alreadyPaid + amtNow)*100)/100;
  const newStatus = newTotal >= netCertified ? 'Paid' : 'Certified';
  const {error} = await sb.from('payment_certificates').update({
    amount_paid: newTotal, paid_date: date, payment_ref: ref, status: newStatus
  }).eq('id',id);
  if(error) { toast('Error: '+error.message,'error'); return; }
  toast(newStatus==='Paid'?'Payment recorded — certificate fully paid':'Partial payment recorded','success');
  closeModal(); render();
}
