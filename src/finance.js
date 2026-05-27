// ─── FINANCE OVERVIEW ────────────────────────────────────────────
async function renderFinance() {
  document.getElementById('content').innerHTML = `<div class="loading"><div class="spinner"></div>Loading financial data…</div>`;

  const [contractsRes, billsRes, certsRes] = await Promise.all([
    sb.from('contracts').select('*').eq('project_id', currentProject.id).order('sort_order').order('created_at'),
    sb.from('boq_bills').select('id,contract_id').eq('project_id', currentProject.id),
    sb.from('payment_certificates').select('*').eq('project_id', currentProject.id).order('cert_no'),
  ]);
  const contracts = contractsRes.data||[];
  const _billIds = (billsRes.data||[]).map(b=>b.id);
  const _certIds = (certsRes.data||[]).map(c=>c.id);
  const [boqItemsRes, allItemsRes] = await Promise.all([
    _billIds.length ? sb.from('boq_items').select('bill_id,total').in('bill_id', _billIds) : Promise.resolve({data:[]}),
    _certIds.length ? sb.from('payment_certificate_items').select('cert_id,contractor_amount,consultant_amount').in('cert_id', _certIds) : Promise.resolve({data:[]}),
  ]);
  const boqItems = boqItemsRes.data;
  const certs = certsRes.data;
  const allItems = allItemsRes.data;

  // Bill → contract lookup
  const billContractMap = {}; for(const b of billsRes.data||[]) billContractMap[b.id]=b.contract_id;
  // BOQ total per contract (from items)
  const boqTotalByContract = {};
  for(const i of boqItems||[]) {
    const cid = billContractMap[i.bill_id]||'__none__';
    boqTotalByContract[cid] = (boqTotalByContract[cid]||0) + (+i.total||0);
  }
  const contractSum = (boqItems||[]).reduce((s,i)=>s+(+i.total||0),0);
  const doneCerts   = (certs||[]).filter(c=>c.status==='Certified'||c.status==='Paid');
  const paidCerts   = (certs||[]).filter(c=>c.status==='Paid');

  // Build per-cert aggregates
  const certAmt = {}; // cert_id → {claimed, certified}
  for(const it of allItems||[]) {
    if(!certAmt[it.cert_id]) certAmt[it.cert_id]={claimed:0,certified:0};
    certAmt[it.cert_id].claimed   += +it.contractor_amount||0;
    certAmt[it.cert_id].certified += +it.consultant_amount||0;
  }

  function netOfCert(c) {
    const gross   = certAmt[c.id]?.certified||0;
    const ret     = gross * (+c.retention_pct||0) / 100;
    const adv     = gross * (+c.advance_recovery_pct||0) / 100;
    const prev    = +c.previously_paid||0;
    const nbv     = gross - ret - adv - prev;
    return nbv + nbv * (+c.vat_pct||0) / 100;
  }
  function balanceOfCert(c) {
    return Math.max(0, netOfCert(c) - (+c.amount_paid||0));
  }

  let totalCertified=0, totalAmountPaid=0, totalRetention=0, totalAdvRecovered=0, totalNetPayable=0;
  for(const c of doneCerts) {
    const gross = certAmt[c.id]?.certified||0;
    totalCertified    += gross;
    totalRetention    += gross * (+c.retention_pct||0)/100;
    totalAdvRecovered += gross * (+c.advance_recovery_pct||0)/100;
    totalNetPayable   += netOfCert(c);
    totalAmountPaid   += +c.amount_paid||0;
  }
  const totalBalance = Math.max(0, totalNetPayable - totalAmountPaid);

  const mobAdvance = (certs||[]).reduce((s,c)=>Math.max(s,+c.mobilisation_advance||0),0);
  const pctComplete = contractSum>0 ? (totalCertified/contractSum*100) : 0;
  // Outstanding = unpaid balance across all Certified certs (including partial payments)
  const certifiedOnly = (certs||[]).filter(c=>c.status==='Certified');
  const outstanding = certifiedOnly.reduce((s,c)=>s+balanceOfCert(c),0);

  // ── Per-contract stats helper ───────────────────────────────────
  function contractStats(cid) {
    const cs = cid
      ? (certs||[]).filter(c=>c.contract_id===cid)
      : (certs||[]);
    const done = cs.filter(c=>c.status==='Certified'||c.status==='Paid');
    const certOnly = cs.filter(c=>c.status==='Certified');
    let cert=0,ret=0,adv=0,netP=0,paid=0;
    for(const c of done) {
      const gross = certAmt[c.id]?.certified||0;
      cert += gross;
      ret  += gross*(+c.retention_pct||0)/100;
      adv  += gross*(+c.advance_recovery_pct||0)/100;
      netP += netOfCert(c);
      paid += +c.amount_paid||0;
    }
    const mob = cs.reduce((s,c)=>Math.max(s,+c.mobilisation_advance||0),0);
    const outstanding = certOnly.reduce((s,c)=>s+balanceOfCert(c),0);
    return {cert,ret,adv,netP,paid,mob,outstanding};
  }

  // ── Summary strip ───────────────────────────────────────────────
  // Use sum of contracts.contract_value if contracts exist, else BOQ items total
  const totalContractValue = contracts.length
    ? contracts.reduce((s,c)=>s+(+c.contract_value||0),0)
    : contractSum;
  const pctCompleteTotal = totalContractValue>0 ? (totalCertified/totalContractValue*100) : pctComplete;

  const summaryHTML = `
  <div class="module-bar" style="flex-wrap:wrap;gap:10px;margin-bottom:20px">
    <div class="module-stat" style="flex:1;min-width:140px">
      <div class="module-stat-val" style="color:var(--sand)" title="${fmtAED(totalContractValue)}">${fmtCompact(totalContractValue)}</div>
      <div class="module-stat-label">${contracts.length?'Total Contract Value':'Contract Sum (BOQ)'}</div>
    </div>
    <div class="module-stat" style="flex:1;min-width:140px">
      <div class="module-stat-val" title="${fmtAED(totalCertified)}">${fmtCompact(totalCertified)}</div>
      <div class="module-stat-label">Total Certified (Gross)</div>
    </div>
    <div class="module-stat" style="flex:1;min-width:140px">
      <div class="module-stat-val" style="color:var(--green)" title="${fmtAED(totalAmountPaid+mobAdvance)}">${fmtCompact(totalAmountPaid+mobAdvance)}</div>
      <div class="module-stat-label">Total Paid (Net + Mob. Advance)</div>
    </div>
    <div class="module-stat" style="flex:1;min-width:140px">
      <div class="module-stat-val ${outstanding>0?'warn':''}" title="${fmtAED(Math.max(0,outstanding))}">${fmtCompact(Math.max(0,outstanding))}</div>
      <div class="module-stat-label">Outstanding (Certified–Paid)</div>
    </div>
    <div class="module-stat" style="flex:1;min-width:140px">
      <div class="module-stat-val" title="${fmtAED(totalRetention)}">${fmtCompact(totalRetention)}</div>
      <div class="module-stat-label">Retention Held</div>
    </div>
    <div class="module-stat" style="flex:1;min-width:140px">
      <div class="module-stat-val">${pctCompleteTotal.toFixed(1)}%</div>
      <div class="module-stat-label">% Certified vs Contract</div>
    </div>
  </div>
  <div class="card" style="padding:14px 18px;margin-bottom:20px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <span style="font-size:11px;font-weight:500;color:var(--charcoal)">Overall Project Progress</span>
      <span style="font-size:11px;color:var(--text2)">${fmtAED(totalCertified)} of ${fmtAED(totalContractValue)}</span>
    </div>
    <div style="height:10px;background:var(--bg3);border-radius:5px;overflow:hidden">
      <div style="height:100%;width:${Math.min(pctCompleteTotal,100).toFixed(1)}%;background:var(--green);border-radius:5px;transition:width .4s"></div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:10px;color:var(--text3)">
      <span>0</span><span>${fmtAED(totalContractValue)}</span>
    </div>
  </div>`;

  // ── Per-contract breakdown (only when contracts exist) ──────────
  const contractBreakdownHTML = contracts.length < 1 ? '' : (()=>{
    const TYPE_LABEL = {main:'Main Contract',enabling_works:'Enabling Works',specialist:'Specialist',other:'Other'};
    const cards = contracts.map(c=>{
      const s = contractStats(c.id);
      const awarded = +c.contract_value||0;
      const boqTotal = boqTotalByContract[c.id]||0;
      const pct = awarded>0 ? Math.min(s.cert/awarded*100,100) : 0;
      const certCount = (certs||[]).filter(x=>x.contract_id===c.id).length;
      return `
      <div class="card" style="padding:16px 18px;flex:1;min-width:260px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--charcoal)">${esc(c.name)}</div>
            <div style="font-size:11px;color:var(--text2);margin-top:2px">${c.contractor?esc(c.contractor):'—'}</div>
          </div>
          <div style="font-size:10px;color:var(--text3);background:var(--bg3);padding:3px 8px;border-radius:4px;white-space:nowrap">${TYPE_LABEL[c.contract_type]||c.contract_type||'Contract'}</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 14px;margin-bottom:12px">
          <div><div style="font-size:10px;color:var(--text3)">Awarded Value</div><div style="font-size:12px;font-weight:600;color:var(--sand)">${awarded?fmtAED(awarded):'—'}</div></div>
          <div><div style="font-size:10px;color:var(--text3)">BOQ Total</div><div style="font-size:12px;color:var(--charcoal)">${boqTotal?fmtAED(boqTotal):'—'}</div></div>
          <div><div style="font-size:10px;color:var(--text3)">Gross Certified</div><div style="font-size:12px;font-weight:600;color:var(--charcoal)">${s.cert?fmtAED(s.cert):'—'}</div></div>
          <div><div style="font-size:10px;color:var(--text3)">Amount Paid</div><div style="font-size:12px;color:var(--green)">${(s.paid+s.mob)?fmtAED(s.paid+s.mob):'—'}</div></div>
          <div><div style="font-size:10px;color:var(--text3)">Retention Held</div><div style="font-size:12px;color:var(--charcoal)">${s.ret?fmtAED(s.ret):'—'}</div></div>
          <div><div style="font-size:10px;color:var(--text3)">Outstanding</div><div style="font-size:12px;${s.outstanding>0?'color:var(--amber,#C4863A);font-weight:600':'color:var(--text3)'}">${s.outstanding>0?fmtAED(s.outstanding):'—'}</div></div>
        </div>
        ${awarded>0?`
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text3);margin-bottom:4px">
          <span>${pct.toFixed(1)}% certified</span><span>${certCount} IPC${certCount!==1?'s':''}</span>
        </div>
        <div style="height:6px;background:var(--bg3);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${pct.toFixed(1)}%;background:var(--green);border-radius:3px"></div>
        </div>`:''}
        ${s.mob>0?`<div style="margin-top:10px;padding-top:10px;border-top:0.5px solid var(--border);font-size:10px;color:var(--text3)">Mob. Advance: <b style="color:var(--charcoal)">${fmtAED(s.mob)}</b> · Recovered: <b style="color:var(--green)">${fmtAED(s.adv)}</b> (${s.mob>0?(s.adv/s.mob*100).toFixed(0):0}%)</div>`:''}
        ${c.award_date?`<div style="margin-top:6px;font-size:10px;color:var(--text3)">Awarded ${new Date(c.award_date).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</div>`:''}
      </div>`;
    }).join('');
    return `<div style="margin-bottom:20px">
      <div style="font-size:12px;font-weight:500;color:var(--charcoal);margin-bottom:10px">Contract Breakdown</div>
      <div style="display:flex;gap:14px;flex-wrap:wrap">${cards}</div>
    </div>`;
  })();

  // ── Monthly bar chart ───────────────────────────────────────────
  const monthMap = {}; // 'YYYY-MM' → {claimed, certified, paid}
  function ensureMonth(ym) { if(!monthMap[ym]) monthMap[ym]={claimed:0,certified:0,paid:0}; }
  for(const c of certs||[]) {
    const a = certAmt[c.id]||{claimed:0,certified:0};
    const claimDate = c.submitted_date||c.certified_date;
    if(claimDate) { const ym=claimDate.slice(0,7); ensureMonth(ym); monthMap[ym].claimed+=a.claimed; }
    if(c.certified_date) { const ym=c.certified_date.slice(0,7); ensureMonth(ym); monthMap[ym].certified+=a.certified; }
    if(c.paid_date)      { const ym=c.paid_date.slice(0,7);      ensureMonth(ym); monthMap[ym].paid+=netOfCert(c); }
  }
  const months = Object.keys(monthMap).sort();
  const barChartHTML = months.length < 1 ? '' : (()=>{
    const maxVal = Math.max(...months.map(m=>Math.max(monthMap[m].claimed,monthMap[m].certified,monthMap[m].paid)),1);
    // Scale bar width up when there are few months so chart fills space naturally
    const BAR_W = months.length<=3 ? 32 : months.length<=6 ? 24 : 18;
    const BAR_GAP=4, GROUP_W=BAR_W*3+BAR_GAP*2, GROUP_GAP=months.length<=3?32:20;
    const svgW = months.length*(GROUP_W+GROUP_GAP)+60;
    const svgH = 180;
    const plotH = 130;
    const plotTop = 16;

    // Y-axis labels
    const ySteps = 4;
    const yLabels = Array.from({length:ySteps+1},(_,i)=>{
      const v = maxVal*(ySteps-i)/ySteps;
      return `<text x="52" y="${plotTop+plotH*i/ySteps+4}" text-anchor="end" font-size="9" fill="#B4A88C">${v>=1e6?(v/1e6).toFixed(1)+'M':v>=1e3?(v/1e3).toFixed(0)+'K':v.toFixed(0)}</text>
      <line x1="56" y1="${plotTop+plotH*i/ySteps}" x2="${svgW}" y2="${plotTop+plotH*i/ySteps}" stroke="#E8E4DC" stroke-width="0.5"/>`;
    }).join('');

    const bars = months.map((m,mi)=>{
      const x0 = 60 + mi*(GROUP_W+GROUP_GAP);
      const d = monthMap[m];
      const bh = (v)=>Math.max(0,(v/maxVal)*plotH);
      const monthLabel = new Date(m+'-01').toLocaleDateString('en-GB',{month:'short',year:'numeric'});
      const bar = (x,h,color,tip)=>h>0?`<rect x="${x}" y="${plotTop+plotH-h}" width="${BAR_W}" height="${h}" rx="2" fill="${color}" style="cursor:default" onmouseenter="showBarTip(event,'${tip}')" onmouseleave="hideBarTip()"/>`:'' ;
      const label = new Date(m+'-01').toLocaleDateString('en-GB',{month:'short',year:'2-digit'});
      return bar(x0, bh(d.claimed), '#C4A882', `${monthLabel} · Claimed: AED ${d.claimed.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})}`)
           + bar(x0+BAR_W+BAR_GAP, bh(d.certified), '#3B6D11', `${monthLabel} · Certified: AED ${d.certified.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})}`)
           + bar(x0+(BAR_W+BAR_GAP)*2, bh(d.paid), '#185FA5', `${monthLabel} · Paid: AED ${d.paid.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})}`)
           + `<text x="${x0+GROUP_W/2}" y="${plotTop+plotH+14}" text-anchor="middle" font-size="9" fill="#7A6E5F">${label}</text>`;
    }).join('');

    return `<div class="card" style="padding:16px 18px;margin-bottom:20px;overflow-x:auto;position:relative">
      <div style="font-size:12px;font-weight:500;color:var(--charcoal);margin-bottom:12px">Monthly Claimed / Certified / Paid</div>
      <div style="display:flex;gap:16px;margin-bottom:10px;flex-wrap:wrap">
        <span style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text2)"><span style="width:10px;height:10px;border-radius:2px;background:var(--sand-light);flex-shrink:0"></span>Claimed</span>
        <span style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text2)"><span style="width:10px;height:10px;border-radius:2px;background:var(--green);flex-shrink:0"></span>Certified</span>
        <span style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text2)"><span style="width:10px;height:10px;border-radius:2px;background:var(--blue);flex-shrink:0"></span>Paid</span>
      </div>
      <svg width="${svgW}" height="${svgH+30}" style="min-width:${svgW}px;display:block" onmousemove="moveBarTip(event)">
        ${yLabels}${bars}
      </svg>
    </div>`;
  })();

  // ── S-curve ─────────────────────────────────────────────────────
  const sCurveHTML = (()=>{
    const pts = doneCerts
      .filter(c=>c.certified_date)
      .sort((a,b)=>a.certified_date.localeCompare(b.certified_date));
    if(!pts.length) return '';
    if(pts.length < 2) return `<div class="card" style="padding:16px 18px;margin-bottom:20px">
      <div style="font-size:12px;font-weight:500;color:var(--charcoal);margin-bottom:8px">Cumulative Certified (S-Curve)</div>
      <div style="font-size:11px;color:var(--text3);padding:20px 0;text-align:center">Need at least 2 certified certificates to plot an S-curve.</div>
    </div>`;
    let cum = 0;
    const points = pts.map(c=>{ cum+=certAmt[c.id]?.certified||0; return {date:c.certified_date.slice(0,7),cum,label:c.ref_no}; });
    const maxCum = Math.max(cum,1);
    const PAD_L=60, PAD_B=42, PAD_T=16;
    // Scale width with number of points; min 320, grows 60px per cert
    const W=Math.max(320,points.length*60+PAD_L+20);
    const H=130+PAD_B;
    const plotW=W-PAD_L, plotH=H-PAD_B-PAD_T;
    const px=(i)=>PAD_L+i*(plotW/(points.length-1));
    const py=(v)=>PAD_T+plotH-(v/maxCum)*plotH;
    const polyline = points.map((p,i)=>`${px(i).toFixed(1)},${py(p.cum).toFixed(1)}`).join(' ');
    const dots = points.map((p,i)=>`<circle cx="${px(i).toFixed(1)}" cy="${py(p.cum).toFixed(1)}" r="3" fill="var(--green)" stroke="var(--bg2)" stroke-width="1.5"/>`).join('');
    // Rotate x-axis labels to prevent overlap
    const xLabels = points.map((p,i)=>{
      const x=px(i).toFixed(1), y=(PAD_T+plotH+14).toFixed(1);
      return `<text transform="rotate(-35,${x},${y})" x="${x}" y="${y}" text-anchor="end" font-size="9" fill="#7A6E5F">${p.label}</text>`;
    }).join('');
    const ySteps=4;
    const yGrid = Array.from({length:ySteps+1},(_,i)=>{
      const v=maxCum*(ySteps-i)/ySteps;
      const y=(PAD_T+plotH*i/ySteps).toFixed(1);
      return `<line x1="${PAD_L}" y1="${y}" x2="${W}" y2="${y}" stroke="#E8E4DC" stroke-width="0.5"/>
      <text x="${PAD_L-4}" y="${+y+4}" text-anchor="end" font-size="9" fill="#B4A88C">${v>=1e6?(v/1e6).toFixed(1)+'M':v>=1e3?(v/1e3).toFixed(0)+'K':v.toFixed(0)}</text>`;
    }).join('');
    // shaded area under curve
    const areaPath = `M${px(0).toFixed(1)},${PAD_T+plotH} `+points.map((p,i)=>`L${px(i).toFixed(1)},${py(p.cum).toFixed(1)}`).join(' ')+` L${px(points.length-1).toFixed(1)},${PAD_T+plotH} Z`;
    return `<div class="card" style="padding:16px 18px;margin-bottom:20px;overflow-x:auto">
      <div style="font-size:12px;font-weight:500;color:var(--charcoal);margin-bottom:12px">Cumulative Certified (S-Curve)</div>
      <svg width="${W}" height="${H}" style="display:block;min-width:${W}px">
        ${yGrid}
        <path d="${areaPath}" fill="var(--green)" opacity="0.08"/>
        <polyline points="${polyline}" fill="none" stroke="var(--green)" stroke-width="2" stroke-linejoin="round"/>
        ${dots}
        ${xLabels}
      </svg>
    </div>`;
  })();

  // ── Retention & Advance ─────────────────────────────────────────
  const retAdvHTML = `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
    <div class="card" style="padding:16px 18px">
      <div style="font-size:12px;font-weight:500;color:var(--charcoal);margin-bottom:14px">Retention</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text2)">
          <span>Withheld to Date</span><span style="font-weight:600;color:var(--charcoal)">${fmtAED(totalRetention)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text2)">
          <span>On Practical Completion (50%)</span><span>${fmtAED(totalRetention*0.5)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text2)">
          <span>On Defects Liability (50%)</span><span>${fmtAED(totalRetention*0.5)}</span>
        </div>
      </div>
    </div>
    <div class="card" style="padding:16px 18px">
      <div style="font-size:12px;font-weight:500;color:var(--charcoal);margin-bottom:14px">Mobilisation Advance</div>
      ${mobAdvance>0 ? `
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text2);margin-bottom:6px">
        <span>Advance Issued</span><span style="font-weight:600;color:var(--charcoal)">${fmtAED(mobAdvance)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text2);margin-bottom:8px">
        <span>Recovered to Date</span><span style="color:var(--green)">${fmtAED(totalAdvRecovered)}</span>
      </div>
      <div style="height:8px;background:var(--bg3);border-radius:4px;overflow:hidden;margin-bottom:6px">
        <div style="height:100%;width:${Math.min(mobAdvance>0?totalAdvRecovered/mobAdvance*100:0,100).toFixed(1)}%;background:var(--green);border-radius:4px"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text3)">
        <span>${(mobAdvance>0?totalAdvRecovered/mobAdvance*100:0).toFixed(1)}% recovered</span>
        <span>${fmtAED(Math.max(0,mobAdvance-totalAdvRecovered))} outstanding</span>
      </div>` : `<div style="font-size:11px;color:var(--text3);padding:20px 0;text-align:center">No mobilisation advance recorded</div>`}
    </div>
  </div>`;

  // ── Contractor vs Consultant variance per bill ──────────────────
  const {data:bills} = await sb.from('boq_bills').select('id,bill_no,title').eq('project_id',currentProject.id).order('sort_order').order('created_at');
  const sortedBills = (bills||[]).sort((a,b)=>(+a.bill_no||0)-(+b.bill_no||0)||a.bill_no.localeCompare(b.bill_no));

  // Build per-bill sums across all certs
  const _varBillIds = (bills||[]).map(b=>b.id);
  const {data:allBoqItems} = _varBillIds.length ? await sb.from('boq_items').select('id,bill_id,total').in('bill_id',_varBillIds) : {data:[]};
  const boqItemBill = {}; for(const i of allBoqItems||[]) boqItemBill[i.id]=i.bill_id;

  const billClaimed={}, billCertified={};
  for(const c of doneCerts) {
    const items = (allItems||[]).filter(i=>i.cert_id===c.id);
    for(const it of items) {
      const bid = boqItemBill[it.boq_item_id]; if(!bid) continue;
      billClaimed[bid]  = (billClaimed[bid]||0)  + (+it.contractor_amount||0);
      billCertified[bid]= (billCertified[bid]||0) + (+it.consultant_amount||0);
    }
  }

  const varianceRows = sortedBills.map(b=>{
    const claimed   = billClaimed[b.id]||0;
    const certified = billCertified[b.id]||0;
    if(!claimed && !certified) return '';
    const maxVal = Math.max(claimed,certified,1);
    const variance = certified - claimed;
    const varPct   = claimed>0 ? (variance/claimed*100) : 0;
    return `<tr>
      <td style="font-size:11px;white-space:nowrap">${esc(b.bill_no)}. ${esc(b.title)}</td>
      <td style="width:200px;padding:8px 14px">
        <div style="display:flex;flex-direction:column;gap:3px">
          <div style="display:flex;align-items:center;gap:6px">
            <div style="width:${(claimed/maxVal*140).toFixed(0)}px;height:6px;background:var(--sand-light);border-radius:3px;min-width:2px"></div>
            <span style="font-size:10px;color:var(--text2);white-space:nowrap">${fmtAED(claimed)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <div style="width:${(certified/maxVal*140).toFixed(0)}px;height:6px;background:var(--green);border-radius:3px;min-width:2px"></div>
            <span style="font-size:10px;color:var(--text2);white-space:nowrap">${fmtAED(certified)}</span>
          </div>
        </div>
      </td>
      <td style="text-align:right;font-size:11px;font-variant-numeric:tabular-nums;color:${variance<0?'var(--red)':variance>0?'var(--green)':'var(--text3)'};white-space:nowrap">
        ${variance!==0?(variance>0?'+':'')+fmtAED(Math.abs(variance)):'—'}
      </td>
      <td style="text-align:right;font-size:10px;color:var(--text3);white-space:nowrap">${varPct!==0?varPct.toFixed(1)+'%':'—'}</td>
    </tr>`;
  }).join('');

  const varianceHTML = varianceRows ? `<div class="card" style="margin-bottom:20px">
    <div style="padding:14px 18px 10px;border-bottom:0.5px solid var(--border);display:flex;gap:16px;align-items:center">
      <span style="font-size:12px;font-weight:500;color:var(--charcoal)">Contractor vs Consultant — by Bill</span>
      <span style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text2)"><span style="width:10px;height:6px;border-radius:2px;background:var(--sand-light);display:inline-block"></span>Claimed</span>
      <span style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text2)"><span style="width:10px;height:6px;border-radius:2px;background:var(--green);display:inline-block"></span>Certified</span>
    </div>
    <div class="tw"><table>
      <tr><th>Bill</th><th>Claimed vs Certified</th><th style="text-align:right">Variance</th><th style="text-align:right">%</th></tr>
      ${varianceRows}
    </table></div>
  </div>` : '';

  // ── IPC summary table ───────────────────────────────────────────
  const ipcTableRows = (certs||[]).filter(c=>c.status==='Certified'||c.status==='Paid').map(c=>{
    const a = certAmt[c.id]||{claimed:0,certified:0};
    const gross = a.certified;
    const ret   = gross*(+c.retention_pct||0)/100;
    const adv   = gross*(+c.advance_recovery_pct||0)/100;
    const net   = netOfCert(c);
    const paid  = +c.amount_paid||0;
    const bal   = Math.max(0, net - paid);
    const partPaid = c.status==='Certified' && paid>0;
    const badgeLabel = partPaid ? 'Part Paid' : c.status;
    return `<tr>
      <td class="mono" style="color:var(--sand);font-weight:500">${esc(c.ref_no)}</td>
      <td style="font-size:11px;color:var(--text2)">${c.certified_date?new Date(c.certified_date).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):'—'}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums">${fmtAED(a.claimed)}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums">${fmtAED(gross)}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums;color:var(--red)">(${fmtAED(ret)})</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums;color:var(--red)">(${fmtAED(adv)})</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:600">${fmtAED(net)}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums;color:var(--green)">${paid>0?fmtAED(paid):'—'}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:600;color:${bal>0?'var(--amber, #C4863A)':'var(--text3)'}">${bal>0?fmtAED(bal):'—'}</td>
      <td>${sbadge(badgeLabel)}</td>
    </tr>`;
  }).join('');

  const ipcTableHTML = ipcTableRows ? `<div class="card" style="margin-bottom:20px">
    <div style="padding:14px 18px 10px;border-bottom:0.5px solid var(--border)">
      <span style="font-size:12px;font-weight:500;color:var(--charcoal)">Certificate Ledger</span>
    </div>
    <div class="tw"><table>
      <tr><th>Ref</th><th>Certified Date</th><th style="text-align:right">Claimed</th><th style="text-align:right">Gross Certified</th><th style="text-align:right">Retention</th><th style="text-align:right">Adv. Recovery</th><th style="text-align:right">Net Certified</th><th style="text-align:right">Paid</th><th style="text-align:right">Balance Due</th><th>Status</th></tr>
      ${ipcTableRows}
      <tr style="background:var(--bg3)">
        <td colspan="2" style="font-weight:600;font-size:11px">Totals</td>
        <td style="text-align:right;font-weight:600;font-variant-numeric:tabular-nums">${fmtAED((certs||[]).filter(c=>c.status==='Certified'||c.status==='Paid').reduce((s,c)=>s+(certAmt[c.id]?.claimed||0),0))}</td>
        <td style="text-align:right;font-weight:600;font-variant-numeric:tabular-nums">${fmtAED(totalCertified)}</td>
        <td style="text-align:right;font-weight:600;font-variant-numeric:tabular-nums;color:var(--red)">(${fmtAED(totalRetention)})</td>
        <td style="text-align:right;font-weight:600;font-variant-numeric:tabular-nums;color:var(--red)">(${fmtAED(totalAdvRecovered)})</td>
        <td style="text-align:right;font-weight:600;font-variant-numeric:tabular-nums">${fmtAED(totalNetPayable)}</td>
        <td style="text-align:right;font-weight:600;font-variant-numeric:tabular-nums;color:var(--green)">${fmtAED(totalAmountPaid)}</td>
        <td style="text-align:right;font-weight:600;font-variant-numeric:tabular-nums;color:var(--amber,#C4863A)">${totalBalance>0?fmtAED(totalBalance):'—'}</td>
        <td></td>
      </tr>
    </table></div>
  </div>` : `<div class="empty-state" style="padding:48px;text-align:center;color:var(--text3);font-size:12px">No certified or paid certificates yet.</div>`;

  document.getElementById('content').innerHTML = summaryHTML + contractBreakdownHTML + barChartHTML + sCurveHTML + retAdvHTML + varianceHTML + ipcTableHTML;
}

