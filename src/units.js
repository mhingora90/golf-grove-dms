// ─── UNIT SETUP ──────────────────────────────────────────────────────────────

async function renderUnitSetup() {
  const {data:units, error} = await sb.from('units').select('*').eq('project_id',currentProject.id).order('floor').order('unit_no');
  if(error) {
    document.getElementById('content').innerHTML =
      '<div class="empty-state" style="padding:48px;text-align:center;color:var(--red)">Failed to load units: ' + esc(error.message) + '</div>';
    return;
  }
  const list = units||[];
  const totalSqft   = list.reduce((s,u)=>s+ +u.area_sqft,0);
  const totalGDV    = list.reduce((s,u)=>s+ +u.listed_price,0);
  const avgPpsf     = totalSqft ? Math.round(totalGDV/totalSqft) : 0;

  const toolbar =
    '<div class="fbar">' +
      '<button class="btn btn-primary" onclick="openAddUnitForm()">+ New Unit</button>' +
      '<button class="btn" onclick="downloadUnitCSVTemplate()">CSV Template</button>' +
      '<label class="btn" style="cursor:pointer;margin:0">Import CSV' +
        '<input type="file" accept=".csv" style="display:none" onchange="handleUnitCSV(event)">' +
      '</label>' +
    '</div>';

  if (!list.length) {
    document.getElementById('content').innerHTML =
      toolbar +
      '<div class="unit-empty">' +
        '<div class="unit-empty-emoji">🏢</div>' +
        '<div class="unit-empty-title">No units in this project yet</div>' +
        '<div class="unit-empty-sub">Add units one-by-one or bulk-import the master list via CSV. Each unit needs number, floor, type, area, and listed price.</div>' +
        '<button class="btn btn-primary" onclick="openAddUnitForm()">+ Add first unit</button>' +
      '</div>';
    return;
  }

  const statsBar =
    '<div class="module-bar">' +
      '<div class="module-stat"><div class="module-stat-val">' + list.length + '</div><div class="module-stat-label">Total Units</div></div>' +
      '<div class="module-stat"><div class="module-stat-val">' + totalSqft.toLocaleString() + '</div><div class="module-stat-label">Total Area (sqft)</div></div>' +
      '<div class="module-stat"><div class="module-stat-val">' + fmtCompact(totalGDV) + '</div><div class="module-stat-label">Total Listed Value</div></div>' +
      '<div class="module-stat"><div class="module-stat-val">' + fmtAED(avgPpsf) + '</div><div class="module-stat-label">Avg Price / sqft</div></div>' +
    '</div>';

  const rowsHTML = list.map(u =>
    '<tr>' +
    '<td style="font-weight:600">' + esc(u.unit_no) + '</td>' +
    '<td>' + esc(u.floor) + '</td>' +
    '<td>' + esc(u.unit_type) + '</td>' +
    '<td style="text-align:right;font-variant-numeric:tabular-nums">' + (+u.area_sqft).toLocaleString() + '</td>' +
    '<td style="text-align:right;font-variant-numeric:tabular-nums">' + fmtAED(u.listed_price) + '</td>' +
    '<td style="white-space:nowrap;text-align:right">' +
      '<button class="unit-icon-btn" title="Edit" onclick="openEditUnit(\'' + u.id + '\')">✎</button>' +
      '<button class="unit-icon-btn danger" title="Delete" onclick="deleteUnit(\'' + u.id + '\',\'' + esc(u.unit_no) + '\')" style="margin-left:2px">🗑</button>' +
    '</td></tr>'
  ).join('');

  document.getElementById('content').innerHTML =
    toolbar +
    statsBar +
    '<div class="card"><div class="tw"><table>' +
      '<tr><th>Unit No.</th><th>Floor</th><th>Type</th><th style="text-align:right">Area (sqft)</th><th style="text-align:right">Listed Price</th><th></th></tr>' +
      rowsHTML +
    '</table></div></div>';
}

async function openAddUnitForm() {
  const {data:existing} = await sb.from('units').select('unit_type').eq('project_id',currentProject.id);
  const types = [...new Set((existing||[]).map(u=>u.unit_type).filter(Boolean))].sort();
  const typeOpts = types.map(t=>'<option value="' + esc(t) + '"></option>').join('');
  openModal('Add Unit',
    '<div class="form-group"><label class="form-label">Unit No.</label><input id="uf-no" class="form-input" placeholder="e.g. 101" /></div>' +
    '<div class="form-group"><label class="form-label">Floor</label><input id="uf-floor" type="number" min="1" class="form-input" placeholder="1" /></div>' +
    '<div class="form-group"><label class="form-label">Type</label>' +
      '<input id="uf-type" class="form-input" list="uf-type-list" placeholder="e.g. Studio, 1BHK, 2BHK, Penthouse" />' +
      '<datalist id="uf-type-list">' + typeOpts + '</datalist>' +
      (types.length ? '<div style="font-size:10px;color:var(--text3);margin-top:3px">Existing: ' + types.map(esc).join(', ') + '</div>' : '') +
    '</div>' +
    '<div class="form-group"><label class="form-label">Area (sqft)</label><input id="uf-sqft" type="number" min="1" class="form-input" placeholder="490" /></div>' +
    '<div class="form-group"><label class="form-label">Listed Price (AED)</label><input id="uf-price" type="number" min="1" class="form-input" placeholder="625000" /></div>',
    '<button class="btn btn-primary" onclick="saveNewUnit()">Add Unit</button><button class="btn" onclick="closeModal()">Cancel</button>'
  );
}

async function saveNewUnit() {
  const unit_no      = document.getElementById('uf-no')?.value.trim();
  const floor        = parseInt(document.getElementById('uf-floor')?.value);
  const unit_type    = document.getElementById('uf-type')?.value?.trim();
  const area_sqft    = parseFloat(document.getElementById('uf-sqft')?.value);
  const listed_price = parseFloat(document.getElementById('uf-price')?.value);
  if(!unit_no || !floor || !unit_type || !area_sqft || !listed_price) { toast('Fill in all fields','error'); return; }
  const {error} = await sb.from('units').insert({project_id:currentProject.id,unit_no, floor, unit_type, area_sqft, listed_price});
  if(error) { toast('Error: ' + error.message,'error'); return; }
  toast('Unit added','success');
  closeModal();
  render();
}

async function openEditUnit(id) {
  const {data:u, error} = await sb.from('units').select('*').eq('id',id).single();
  if(error||!u) { toast('Failed to load unit','error'); return; }
  const {data:existing} = await sb.from('units').select('unit_type').eq('project_id',currentProject.id);
  const types = [...new Set((existing||[]).map(x=>x.unit_type).filter(Boolean))].sort();
  const typeOpts = types.map(t=>'<option value="' + esc(t) + '"></option>').join('');
  openModal('Edit Unit ' + esc(u.unit_no),
    '<div class="form-group"><label class="form-label">Unit No.</label><input id="eu-no" class="form-input" value="' + esc(u.unit_no) + '" /></div>' +
    '<div class="form-group"><label class="form-label">Floor</label><input id="eu-floor" type="number" class="form-input" value="' + esc(u.floor) + '" /></div>' +
    '<div class="form-group"><label class="form-label">Type</label>' +
      '<input id="eu-type" class="form-input" list="eu-type-list" value="' + esc(u.unit_type||'') + '" />' +
      '<datalist id="eu-type-list">' + typeOpts + '</datalist>' +
    '</div>' +
    '<div class="form-group"><label class="form-label">Area (sqft)</label><input id="eu-sqft" type="number" class="form-input" value="' + esc(u.area_sqft) + '" /></div>' +
    '<div class="form-group"><label class="form-label">Listed Price (AED)</label><input id="eu-price" type="number" class="form-input" value="' + esc(u.listed_price) + '" /></div>',
    '<button class="btn btn-primary" onclick="saveEditUnit(\'' + id + '\')">Save</button><button class="btn" onclick="closeModal()">Cancel</button>'
  );
}

async function saveEditUnit(id) {
  const unit_no      = document.getElementById('eu-no')?.value.trim();
  const floor        = parseInt(document.getElementById('eu-floor')?.value);
  const unit_type    = document.getElementById('eu-type')?.value?.trim();
  const area_sqft    = parseFloat(document.getElementById('eu-sqft')?.value);
  const listed_price = parseFloat(document.getElementById('eu-price')?.value);
  if(!unit_no || !floor || !unit_type || !area_sqft || !listed_price) { toast('Fill in all fields','error'); return; }
  const {error} = await sb.from('units').update({unit_no, floor, unit_type, area_sqft, listed_price}).eq('id',id);
  if(error) { toast('Error: ' + error.message,'error'); return; }
  toast('Unit updated','success');
  closeModal();
  render();
}

async function deleteUnit(id, unitNo) {
  const {count} = await sb.from('unit_sales').select('*',{head:true,count:'exact'}).eq('unit_id',id);
  if(count > 0) { toast('Unit ' + unitNo + ' has a sale record \u2014 remove it first','error'); return; }
  const ok = await confirmModal('Delete unit ' + unitNo + '? This cannot be undone.');
  if(!ok) return;
  const {error} = await sb.from('units').delete().eq('id',id);
  if(error) { toast('Error: ' + error.message,'error'); return; }
  toast('Unit deleted','success');
  render();
}

function downloadUnitCSVTemplate() {
  const csv = 'unit_no,floor,unit_type,area_sqft,listed_price\n101,1,Studio,490,625000\n201,2,1BHK,720,950000\n';
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'unit-import-template.csv';
  a.click();
}

async function handleUnitCSV(event) {
  const file = event.target.files[0];
  if(!file) return;
  const text = await file.text();
  const lines = text.trim().split('\n').filter(l=>l.trim());
  if(lines.length < 2) { toast('CSV is empty or has no data rows','error'); return; }
  const headers = lines[0].split(',').map(h=>h.trim().toLowerCase());
  const required = ['unit_no','floor','unit_type','area_sqft','listed_price'];
  const missing = required.filter(r=>!headers.includes(r));
  if(missing.length) { toast('CSV missing columns: ' + missing.join(', '),'error'); return; }
  const hasStatus = headers.includes('status');

  const rows = [];
  for(let i=1; i<lines.length; i++) {
    const vals = lines[i].split(',').map(v=>v.trim());
    const obj = {};
    headers.forEach((h,idx)=>{ obj[h]=vals[idx]??''; });
    if(!obj.unit_no || !obj.floor || !obj.unit_type || !obj.area_sqft || !obj.listed_price) {
      toast('Row ' + (i+1) + ' incomplete \u2014 skipped','warning');
      continue;
    }
    const statusRaw = (obj.status||'').toLowerCase().trim();
    let sale_status = 'available';
    if(statusRaw === 'sold') sale_status = 'sold';
    else if(statusRaw.includes('blocked')) sale_status = 'blocked_by_developer';
    rows.push({
      unit_no: obj.unit_no,
      floor: parseInt(obj.floor),
      unit_type: obj.unit_type,
      area_sqft: parseFloat(obj.area_sqft),
      listed_price: parseFloat(obj.listed_price),
      project_id: currentProject.id,
      sale_status,
      blocked: sale_status === 'blocked_by_developer',
    });
  }
  if(!rows.length) { toast('No valid rows to import','error'); return; }
  const {error} = await sb.from('units').upsert(rows, {onConflict:'unit_no,project_id'});
  if(error) { toast('Import error: ' + error.message,'error'); return; }
  const soldCount = rows.filter(r=>r.sale_status==='sold').length;
  toast('Imported ' + rows.length + ' units' + (soldCount ? ' (' + soldCount + ' sold)' : ''),'success');
  event.target.value = '';
  render();
}

// ─── UNIT REGISTER ───────────────────────────────────────────────────────────

function _unitSaleStatus(u) {
  if(u.sale_status) return u.sale_status;
  if(u.blocked) return 'blocked_by_developer';
  return u.unit_sales ? u.unit_sales.status : 'available';
}

function _unitStatusBadge(status) {
  const cfg = {
    available:            ['available','Available'],
    reserved:             ['reserved','Reserved'],
    sold:                 ['sold','Sold'],
    blocked_by_developer: ['blocked','Blocked'],
  };
  const [variant,label] = cfg[status]||cfg.available;
  return '<span class="unit-badge unit-badge--' + variant + '">' + label + '</span>';
}

function _spaBadge(s) {
  const cfg = {
    not_signed:   ['muted','Not Signed'],
    signed_buyer: ['warn','Signed — Buyer'],
    fully_signed: ['ok','Fully Signed'],
  };
  const [variant,label] = cfg[s||'not_signed']||cfg.not_signed;
  return '<span class="unit-badge unit-badge--' + variant + '">' + label + '</span>';
}

function _oqoodBadge(s) {
  const cfg = {
    not_registered: ['muted','Not Registered'],
    registered:     ['ok','Registered'],
  };
  const [variant,label] = cfg[s||'not_registered']||cfg.not_registered;
  return '<span class="unit-badge unit-badge--' + variant + '">' + label + '</span>';
}

async function renderUnitRegister() {
  const {data:units, error} = await sb
    .from('units')
    .select('*, unit_sales(*, payment_milestones(*), unit_sale_customers(is_primary, ownership_pct, customers(name)))')
    .eq('project_id', currentProject.id)
    .order('floor')
    .order('unit_no');
  if(error) {
    document.getElementById('content').innerHTML =
      '<div class="empty-state" style="padding:48px;text-align:center;color:var(--red)">Failed to load: ' + esc(error.message) + '</div>';
    return;
  }
  // Derive buyer_name from primary owner (unit_sale_customers) when present.
  // Falls back to legacy sale.buyer_name for records not yet migrated to the
  // join table. Joint owners get "Primary + N others" suffix for the register.
  for (const u of (units || [])) {
    const sale = u.unit_sales;
    if (!sale) continue;
    const owners = sale.unit_sale_customers || [];
    if (owners.length) {
      const primary = owners.find(o => o.is_primary) || owners[0];
      const primaryName = primary?.customers?.name;
      if (primaryName) {
        sale.buyer_name = owners.length > 1
          ? primaryName + ' +' + (owners.length - 1)
          : primaryName;
      }
    }
  }
  window._uregData = units||[];
  // Reset status segmented filter on entry — segmented chip is rendered fresh
  // and its state lives on window, so clearing prevents bleed across projects.
  window._uregStatusF = 'all';
  _renderUregTable();
}

function _setUregStatus(s) {
  window._uregStatusF = s;
  _renderUregTable();
}

function _renderUregTable() {
  const units  = window._uregData||[];
  let typeF    = document.getElementById('urf-type')?.value   || 'all';
  let floorF   = document.getElementById('urf-floor')?.value  || 'all';
  const statusF = window._uregStatusF || 'all';
  const searchEl = document.getElementById('urf-search');
  const savedRaw  = searchEl?.value || '';
  const savedCursor = searchEl?.selectionStart ?? savedRaw.length;
  const search  = savedRaw.toLowerCase().trim();

  const floors = [...new Set(units.map(u=>u.floor))].sort((a,b)=>a-b);
  const types  = [...new Set(units.map(u=>u.unit_type).filter(Boolean))].sort();

  // Clamp stale filter values (e.g. switched project, type no longer present).
  if (typeF !== 'all' && !types.includes(typeF)) typeF = 'all';
  if (floorF !== 'all' && !floors.map(String).includes(floorF)) floorF = 'all';

  // KPI counts on raw set (before filter)
  const total     = units.length;
  const sold      = units.filter(u=>_unitSaleStatus(u)==='sold').length;
  const reserved  = units.filter(u=>_unitSaleStatus(u)==='reserved').length;
  const available = units.filter(u=>_unitSaleStatus(u)==='available').length;
  const blocked   = units.filter(u=>_unitSaleStatus(u)==='blocked_by_developer').length;
  const contracted = units.reduce((s,u)=>{
    const st = _unitSaleStatus(u);
    if(st==='sold' || st==='reserved') return s + (+u.unit_sales?.sold_price||0);
    return s;
  },0);

  const filtered = units.filter(u => {
    const st = _unitSaleStatus(u);
    if(typeF !== 'all' && u.unit_type !== typeF) return false;
    if(statusF !== 'all' && st !== statusF) return false;
    if(floorF !== 'all' && String(u.floor) !== floorF) return false;
    if(search) {
      const buyer = (u.unit_sales?.buyer_name||'').toLowerCase();
      if(!u.unit_no.toLowerCase().includes(search) && !buyer.includes(search)) return false;
    }
    return true;
  });

  const rowsHTML = filtered.length
    ? filtered.map(u => {
        const sale = u.unit_sales;
        const st   = _unitSaleStatus(u);
        const rowCls = st==='sold' ? 'unit-row-tint--sold'
                    : st==='blocked_by_developer' ? 'unit-row-tint--blocked'
                    : st==='reserved' ? 'unit-row-tint--reserved' : '';
        const buyerCell = sale && sale.buyer_name
          ? '<span style="color:var(--charcoal);font-weight:500">' + esc(sale.buyer_name) + '</span>'
          : '<span style="color:var(--text3)">—</span>';
        return '<tr class="' + rowCls + '" style="cursor:pointer" onclick="openUnitModal(\'' + u.id + '\')">' +
          '<td style="font-weight:600">' + esc(u.unit_no) + '</td>' +
          '<td>' + esc(u.floor) + '</td>' +
          '<td>' + esc(u.unit_type) + '</td>' +
          '<td style="text-align:right;font-variant-numeric:tabular-nums">' + (+u.area_sqft).toLocaleString() + '</td>' +
          '<td style="text-align:right;font-variant-numeric:tabular-nums">' + fmtAED(u.listed_price) + '</td>' +
          '<td style="text-align:right;font-variant-numeric:tabular-nums">' + (sale && sale.sold_price ? fmtAED(sale.sold_price) : '<span style="color:var(--text3)">—</span>') + '</td>' +
          '<td>' + buyerCell + '</td>' +
          '<td>' + (sale ? _spaBadge(sale.spa_status) : '<span style="color:var(--text3);font-size:11px">—</span>') + '</td>' +
          '<td>' + (sale ? _oqoodBadge(sale.oqood_status) : '<span style="color:var(--text3);font-size:11px">—</span>') + '</td>' +
          '<td>' + _unitStatusBadge(st) + '</td>' +
          '</tr>';
      }).join('')
    : '<tr><td colspan="10" class="empty-state">No units match filters.</td></tr>';

  const floorOpts = floors.map(f=>'<option value="' + f + '">Floor ' + f + '</option>').join('');

  const kpiBar =
    '<div class="module-bar">' +
      '<div class="module-stat"><div class="module-stat-val">' + total + '</div><div class="module-stat-label">Total Units</div></div>' +
      '<div class="module-stat"><div class="module-stat-val" style="color:var(--green)">' + sold + '</div><div class="module-stat-label">Sold</div></div>' +
      '<div class="module-stat"><div class="module-stat-val warn">' + reserved + '</div><div class="module-stat-label">Reserved</div></div>' +
      '<div class="module-stat"><div class="module-stat-val" style="color:var(--blue)">' + available + '</div><div class="module-stat-label">Available</div></div>' +
      (blocked ? '<div class="module-stat"><div class="module-stat-val" style="color:var(--text2)">' + blocked + '</div><div class="module-stat-label">Blocked</div></div>' : '') +
      '<div class="module-stat"><div class="module-stat-val">' + fmtCompact(contracted) + '</div><div class="module-stat-label">Contracted AED</div></div>' +
    '</div>';

  const seg = (val,label,count) =>
    '<button class="' + (statusF===val?'active':'') + '" onclick="_setUregStatus(\'' + val + '\')">' + label + (count!=null?' <span style="opacity:.55;margin-left:3px">'+count+'</span>':'') + '</button>';

  const filterBar =
    '<div class="fbar">' +
      '<div class="unit-seg">' +
        seg('all','All',total) +
        seg('available','Available',available) +
        seg('reserved','Reserved',reserved) +
        seg('sold','Sold',sold) +
        (blocked ? seg('blocked_by_developer','Blocked',blocked) : '') +
      '</div>' +
      '<select id="urf-type" class="form-control" style="width:auto;padding:6px 8px;font-size:12px" onchange="_renderUregTable()">' +
        '<option value="all">All Types</option>' + types.map(t=>'<option value="' + esc(t) + '">' + esc(t) + '</option>').join('') +
      '</select>' +
      '<select id="urf-floor" class="form-control" style="width:auto;padding:6px 8px;font-size:12px" onchange="_renderUregTable()">' +
        '<option value="all">All Floors</option>' + floorOpts +
      '</select>' +
      '<input id="urf-search" class="form-control" style="width:200px;padding:6px 10px;font-size:12px;margin-left:auto" placeholder="Search unit / buyer…" oninput="_renderUregTable()" />' +
    '</div>';

  document.getElementById('content').innerHTML =
    kpiBar +
    filterBar +
    '<div class="card"><div class="tw"><table>' +
      '<tr><th>Unit</th><th>Floor</th><th>Type</th><th style="text-align:right">Sqft</th><th style="text-align:right">Listed Price</th><th style="text-align:right">Sold Price</th><th>Buyer</th><th>SPA</th><th>Oqood</th><th>Status</th></tr>' +
      rowsHTML +
    '</table></div></div>';

  const t = document.getElementById('urf-type');
  if(t) {
    t.value = typeF;
    document.getElementById('urf-floor').value  = floorF;
    const s = document.getElementById('urf-search');
    s.value = savedRaw;
    s.focus();
    s.setSelectionRange(savedCursor, savedCursor);
  }
}

// ─── UNIT DETAIL MODAL ───────────────────────────────────────────────────────

function openUnitModal(unitId) {
  const u = (window._uregData||[]).find(x=>x.id===unitId);
  if(!u) { toast('Unit not found','error'); return; }
  const sale   = u.unit_sales;
  const ms     = (sale?.payment_milestones||[]).sort((a,b)=>a.sort_order-b.sort_order);
  const canSell = currentProfile?.role==='developer' || currentProfile?.role==='admin';
  const status  = _unitSaleStatus(u);

  const field = (label, val, cls) =>
    '<div><div class="unit-field-label">' + label + '</div><div class="unit-field-val' + (cls?' '+cls:'') + '">' + val + '</div></div>';

  // Hero strip
  const hero =
    '<div class="unit-profile-hero">' +
      '<div class="unit-profile-mono">' + esc(u.unit_no) + '</div>' +
      '<div style="flex:1;min-width:0">' +
        '<div class="unit-profile-name">Unit ' + esc(u.unit_no) + '</div>' +
        '<div class="unit-profile-meta">' +
          '<span><b>' + esc(u.unit_type) + '</b></span><span>·</span>' +
          '<span>Floor <b>' + esc(u.floor) + '</b></span><span>·</span>' +
          '<span><b>' + (+u.area_sqft).toLocaleString() + '</b> sqft</span><span>·</span>' +
          '<span>Listed <b>' + fmtAED(u.listed_price) + '</b></span>' +
        '</div>' +
      '</div>' +
      _unitStatusBadge(status) +
    '</div>';

  // Sale details
  let saleSection = '';
  if(sale) {
    const commVal = ((+sale.sold_price||0) * (+sale.commission_pct||0) / 100);
    const discPct = (+u.listed_price) ? (((+sale.discount_amount||0) / (+u.listed_price)) * 100).toFixed(2) : '0.00';
    saleSection =
      '<div class="unit-section-hdr">Sale Details</div>' +
      '<div class="unit-card">' +
        '<div class="unit-grid">' +
          field('Buyer Name', esc(sale.buyer_name||'—')) +
          field('Sale Date', esc(sale.sale_date||'—')) +
          field('Sold Price', fmtAED(sale.sold_price||0), 'green') +
          field('Discount', fmtAED(sale.discount_amount||0) + ' (' + discPct + '%)', 'amber') +
          field('Commission %', (+sale.commission_pct||0).toFixed(2) + '%') +
          field('Commission Value', fmtAED(commVal), 'blue') +
          field('Broker Name', esc(sale.broker_name||'—')) +
          field('Brokerage', esc(sale.brokerage_name||'—')) +
        '</div>' +
      '</div>';
  }

  // SPA + Oqood
  let spaSection = '';
  if(sale) {
    spaSection =
      '<div class="unit-card-strip">' +
        '<div>' +
          '<div class="unit-field-label">SPA Status</div>' +
          _spaBadge(sale.spa_status) +
          '<div style="font-size:10px;color:var(--text3);margin-top:4px">Date: ' + esc(sale.spa_date||'—') + '</div>' +
        '</div>' +
        '<div>' +
          '<div class="unit-field-label">Oqood Status</div>' +
          _oqoodBadge(sale.oqood_status) +
          '<div style="font-size:10px;color:var(--text3);margin-top:4px">Date: ' + esc(sale.oqood_date||'—') + '</div>' +
        '</div>' +
      '</div>';
  }

  // Payment milestones
  let msSection = '';
  if(sale && ms.length) {
    const totalAmount = ms.reduce((s,m)=>s+(+m.amount||0),0);
    const totalPct    = ms.reduce((s,m)=>s+(+m.pct_of_sale||0),0);
    const msRows = ms.map(m =>
      '<tr>' +
      '<td>' + esc(m.milestone_name) + '</td>' +
      '<td class="num">' + fmtAED(m.amount) + '</td>' +
      '<td class="num" style="color:var(--text2)">' + (+m.pct_of_sale).toFixed(0) + '%</td>' +
      '<td style="color:' + (m.due_date?'inherit':'var(--text3)') + '">' + esc(m.due_date||'On Handover') + '</td>' +
      '</tr>'
    ).join('');
    msSection =
      '<div class="unit-section-hdr">Payment Plan Milestones <span class="meta">' + fmtAED(sale.sold_price||0) + ' contracted</span></div>' +
      '<div class="tw"><table class="ms-table">' +
        '<thead><tr><th>Milestone</th><th class="num">Amount</th><th class="num">%</th><th>Due Date</th></tr></thead>' +
        '<tbody>' + msRows + '</tbody>' +
        '<tfoot><tr><td>Total</td><td class="num">' + fmtAED(totalAmount) + '</td><td class="num">' + totalPct.toFixed(0) + '%</td><td></td></tr></tfoot>' +
      '</table></div>';
  }

  const availNote = !sale
    ? '<div style="padding:12px 14px;background:var(--green-bg);border:0.5px solid #C0DD97;border-radius:10px;font-size:12px;color:var(--green);margin-bottom:12px;display:flex;align-items:center;gap:8px"><span style="font-size:14px">✓</span>No sale recorded — unit is available.</div>'
    : '';

  const body = hero + availNote + saleSection + spaSection + msSection;

  const footer = canSell
    ? (sale
        ? '<button class="btn btn-danger" onclick="markUnitAvailable(\'' + sale.id + '\',\'' + esc(u.unit_no) + '\')">Mark Available</button>' +
          '<button class="btn" onclick="closeModal()" style="margin-left:auto">Close</button>' +
          '<button class="btn btn-primary" onclick="openSaleForm(\'' + u.id + '\',\'' + sale.id + '\')">Edit Sale</button>'
        : '<button class="btn" onclick="closeModal()" style="margin-right:auto">Close</button>' +
          '<button class="btn btn-primary" onclick="openSaleForm(\'' + u.id + '\',null)">+ Add Sale</button>')
    : '<button class="btn" onclick="closeModal()">Close</button>';

  openModal('Unit ' + esc(u.unit_no), body, footer, true);
}

// ─── SALE FORM ───────────────────────────────────────────────────────────────

function openSaleForm(unitId, saleId) {
  const u = (window._uregData||[]).find(x=>x.id===unitId);
  if(!u) { toast('Unit not found','error'); return; }
  const sale = u.unit_sales;
  const ms   = (sale?.payment_milestones||[]).sort((a,b)=>a.sort_order-b.sort_order);
  const isEdit = !!saleId;

  const defaultMS = [
    {milestone_name:'Booking Deposit', pct_of_sale:10, amount:'', due_date:'', sort_order:0},
    {milestone_name:'1st Instalment',  pct_of_sale:30, amount:'', due_date:'', sort_order:1},
    {milestone_name:'2nd Instalment',  pct_of_sale:30, amount:'', due_date:'', sort_order:2},
    {milestone_name:'Handover',        pct_of_sale:30, amount:'', due_date:'',  sort_order:3},
  ];
  const msSource = (isEdit && ms.length) ? ms : defaultMS;

  window._sfMsState = msSource.map(m => ({
    name:   m.milestone_name || '',
    pct:    m.pct_of_sale || '',
    amount: m.amount || '',
    due:    m.due_date || '',
  }));

  const sel = (id, opts, val) =>
    '<select id="' + id + '" class="form-input">' +
    opts.map(o=>'<option value="' + o[0] + '"' + (val===o[0]?' selected':'') + '>' + o[1] + '</option>').join('') +
    '</select>';

  const body =
    '<div class="unit-section-hdr">Owners</div>' +
    '<div id="sf-owners-host" style="margin-bottom:14px"></div>' +

    '<div class="unit-section-hdr">Sale & Brokerage</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:6px">' +
      '<div class="form-group" style="margin:0"><label class="form-label">Sale Date</label><input id="sf-saledate" type="date" class="form-input" value="' + esc(sale?.sale_date||'') + '" /></div>' +
      '<div class="form-group" style="margin:0"><label class="form-label">Sold Price (AED)</label><input id="sf-price" type="number" class="form-input" oninput="_sfPriceChanged()" value="' + (sale?.sold_price||'') + '" /></div>' +
      '<div class="form-group" style="margin:0"><label class="form-label">Discount (AED)</label><input id="sf-discount" type="number" class="form-input" oninput="_sfPreview()" value="' + (sale?.discount_amount||0) + '" /><div style="font-size:10px;color:var(--text3);margin-top:3px">Auto = Listed − Sold. Editable.</div></div>' +
      '<div class="form-group" style="margin:0"><label class="form-label">Commission %</label><input id="sf-commpct" type="number" step="0.01" class="form-input" oninput="_sfPreview()" value="' + (sale?.commission_pct ?? (isEdit ? 0 : 9)) + '" /></div>' +
      '<div class="form-group" style="margin:0"><label class="form-label">Broker Name</label><input id="sf-broker" class="form-input" value="' + esc(sale?.broker_name||'') + '" /></div>' +
      '<div class="form-group" style="margin:0"><label class="form-label">Brokerage</label><input id="sf-brokerage" class="form-input" value="' + esc(sale?.brokerage_name||'') + '" /></div>' +
    '</div>' +
    '<div id="sf-preview" style="display:flex;gap:14px;flex-wrap:wrap;padding:8px 12px;background:var(--bg3);border:0.5px solid var(--border);border-radius:8px;margin-bottom:14px;font-size:11px;color:var(--text2)">' +
      '<span>Commission: <b id="sf-pv-comm" style="color:var(--blue)">' + fmtAED(0) + '</b></span>' +
      '<span>Discount: <b id="sf-pv-disc" style="color:var(--amber)">0.00%</b></span>' +
      '<span>Listed: <b style="color:var(--charcoal)">' + fmtAED(u.listed_price) + '</b></span>' +
    '</div>' +

    '<div class="unit-section-hdr">Status & Documents</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">' +
      '<div class="form-group" style="margin:0"><label class="form-label">Unit Status</label>' + sel('sf-status',[['reserved','Reserved'],['sold','Sold'],['blocked_by_developer','Blocked by Developer']], sale?.status||'reserved') + '</div>' +
      '<div></div>' +
      '<div class="form-group" style="margin:0"><label class="form-label">SPA Status</label>' + sel('sf-spa',[['not_signed','Not Signed'],['signed_buyer','Signed \u2014 Buyer'],['fully_signed','Fully Signed']], sale?.spa_status||'not_signed') + '</div>' +
      '<div class="form-group" style="margin:0"><label class="form-label">SPA Date</label><input id="sf-spadate" type="date" class="form-input" value="' + esc(sale?.spa_date||'') + '" /></div>' +
      '<div class="form-group" style="margin:0"><label class="form-label">Oqood Status</label>' + sel('sf-oqood',[['not_registered','Not Registered'],['registered','Registered']], sale?.oqood_status||'not_registered') + '</div>' +
      '<div class="form-group" style="margin:0"><label class="form-label">Oqood Date</label><input id="sf-oqooddate" type="date" class="form-input" value="' + esc(sale?.oqood_date||'') + '" /></div>' +
    '</div>' +

    '<div class="unit-section-hdr">Payment Plan Milestones</div>' +
    '<div id="sf-ms-mount" style="margin-bottom:14px"></div>';

  openModal(
    (isEdit ? 'Edit Sale \u2014 Unit ' : 'Add Sale \u2014 Unit ') + esc(u.unit_no),
    body,
    '<button class="btn btn-primary" onclick="saveSaleForm(\'' + unitId + '\',\'' + (saleId||'') + '\')">Save</button><button class="btn" onclick="closeModal()">Cancel</button>',
    true
  );

  // Mount customer picker (replaces former buyer_name text input)
  (async () => {
    const host = document.getElementById('sf-owners-host');
    if (!host || !window.Customers?.pickCustomer) return;
    const initial = isEdit && saleId
      ? await window.Customers.loadOwnersForSale(saleId)
      : (sale?.buyer_name
          ? [{ customer_id: '__pending__', name: sale.buyer_name, is_primary: true, ownership_pct: null }]
          : []);
    // strip pending sentinel before mount if no saved owners yet
    const seeded = initial.filter(r => r.customer_id !== '__pending__');
    window._saleFormPicker = window.Customers.pickCustomer({ container: host, initial: seeded });
  })();

  window._sfListedPrice = +u.listed_price || 0;
  setTimeout(_sfPreview, 50);

  _sfRenderMs();
}

function _sfRenderMs() {
  const mount = document.getElementById('sf-ms-mount');
  if (!mount) return;
  const state = window._sfMsState || [];
  const price = parseFloat(document.getElementById('sf-price')?.value) || 0;

  const inStyleBase = 'width:100%;box-sizing:border-box;padding:4px 8px;font-size:11px;margin:0';
  const rowsHtml = state.map((m, i) =>
    '<tr>' +
      '<td style="padding:4px 0"><input class="form-control sf-ms-in" data-i="' + i + '" data-f="name" value="' + esc(m.name) + '" style="' + inStyleBase + '" /></td>' +
      '<td style="padding:4px 0"><input type="number" class="form-control sf-ms-in" data-i="' + i + '" data-f="amount" value="' + (m.amount||'') + '" style="' + inStyleBase + ';text-align:right" /></td>' +
      '<td style="padding:4px 0"><input type="number" class="form-control sf-ms-in" data-i="' + i + '" data-f="pct" value="' + (m.pct||'') + '" style="' + inStyleBase + ';text-align:right" /></td>' +
      '<td style="padding:4px 0"><input type="date" class="form-control sf-ms-in" data-i="' + i + '" data-f="due" value="' + (m.due||'') + '" style="' + inStyleBase + '" /></td>' +
      '<td style="padding:4px 2px;text-align:center"><button type="button" class="sf-ms-rm" data-i="' + i + '" style="padding:2px 10px;font-size:14px;color:#dc2626;border:1px solid #dc2626;background:transparent;border-radius:4px;cursor:pointer">×</button></td>' +
    '</tr>'
  ).join('');

  const thStyle = 'padding:6px 8px;font-size:11px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid var(--border)';
  mount.innerHTML =
    '<div class="tw"><table style="width:100%;table-layout:fixed;border-collapse:collapse;margin-bottom:8px">' +
      '<colgroup>' +
        '<col style="width:auto">' +
        '<col style="width:130px">' +
        '<col style="width:70px">' +
        '<col style="width:150px">' +
        '<col style="width:44px">' +
      '</colgroup>' +
      '<thead><tr>' +
        '<th style="' + thStyle + ';text-align:left">Milestone</th>' +
        '<th style="' + thStyle + ';text-align:right">Amount (AED)</th>' +
        '<th style="' + thStyle + ';text-align:right">%</th>' +
        '<th style="' + thStyle + ';text-align:left">Due Date</th>' +
        '<th style="' + thStyle + '"></th>' +
      '</tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody>' +
    '</table></div>' +
    '<div style="display:flex;gap:8px">' +
      '<button type="button" id="sf-ms-add-btn" style="padding:6px 14px;font-size:12px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:500">+ Add Milestone</button>' +
      '<span style="font-size:10px;color:var(--text3);align-self:center">Amount auto-computes from Sold Price × %. Editable.</span>' +
    '</div>';

  const addBtn = document.getElementById('sf-ms-add-btn');
  if (addBtn) {
    addBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window._sfMsState.push({name:'', pct:'', amount:'', due:''});
      _sfRenderMs();
    });
  }

  mount.querySelectorAll('.sf-ms-rm').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const i = +btn.dataset.i;
      window._sfMsState.splice(i, 1);
      _sfRenderMs();
    });
  });

  mount.querySelectorAll('.sf-ms-in').forEach(inp => {
    inp.addEventListener('input', () => {
      const i = +inp.dataset.i;
      const f = inp.dataset.f;
      window._sfMsState[i][f] = inp.value;
      if (f === 'pct') {
        const curPrice = parseFloat(document.getElementById('sf-price')?.value) || 0;
        const pct = parseFloat(inp.value) || 0;
        if (curPrice && pct) {
          const amt = Math.round(curPrice * pct / 100);
          window._sfMsState[i].amount = amt;
          const amtEl = mount.querySelector('.sf-ms-in[data-i="' + i + '"][data-f="amount"]');
          if (amtEl) amtEl.value = amt;
        }
      }
    });
  });
}

function _sfSyncMsAmounts() {
  const price = parseFloat(document.getElementById('sf-price')?.value) || 0;
  if (!price || !window._sfMsState) return;
  window._sfMsState.forEach(m => {
    const pct = parseFloat(m.pct) || 0;
    if (pct) m.amount = Math.round(price * pct / 100);
  });
  _sfRenderMs();
}

function _sfAutoDiscount() {
  const priceEl = document.getElementById('sf-price');
  const discEl  = document.getElementById('sf-discount');
  const listed  = window._sfListedPrice || 0;
  const price   = parseFloat(priceEl?.value) || 0;
  if (discEl && listed && price) {
    discEl.value = Math.max(0, listed - price);
  }
  _sfPreview();
}

function _sfPriceChanged() {
  _sfAutoDiscount();
  _sfSyncMsAmounts();
}

function _sfPreview() {
  const price = parseFloat(document.getElementById('sf-price')?.value) || 0;
  const disc  = parseFloat(document.getElementById('sf-discount')?.value) || 0;
  const pct   = parseFloat(document.getElementById('sf-commpct')?.value) || 0;
  const listed = window._sfListedPrice || 0;
  const commVal = price * pct / 100;
  const discPct = listed ? (disc / listed * 100) : 0;
  const cEl = document.getElementById('sf-pv-comm');
  const dEl = document.getElementById('sf-pv-disc');
  if (cEl) cEl.textContent = fmtAED(Math.round(commVal));
  if (dEl) dEl.textContent = discPct.toFixed(2) + '%';
}

async function saveSaleForm(unitId, saleId) {
  const ownersFromPicker = window._saleFormPicker?.getValue() || [];
  const primaryOwner     = ownersFromPicker.find(o => o.is_primary) || ownersFromPicker[0] || null;
  const buyer_name       = primaryOwner?.name || null;
  const sale_date       = document.getElementById('sf-saledate')?.value||null;
  const sold_price      = parseFloat(document.getElementById('sf-price')?.value)||null;
  const discount_amount = parseFloat(document.getElementById('sf-discount')?.value)||0;
  const commission_pct  = parseFloat(document.getElementById('sf-commpct')?.value)||0;
  const broker_name     = document.getElementById('sf-broker')?.value.trim()||null;
  const brokerage_name  = document.getElementById('sf-brokerage')?.value.trim()||null;
  const status          = document.getElementById('sf-status')?.value||'reserved';
  const spa_status      = document.getElementById('sf-spa')?.value||'not_signed';
  const spa_date        = document.getElementById('sf-spadate')?.value||null;
  const oqood_status    = document.getElementById('sf-oqood')?.value||'not_registered';
  const oqood_date      = document.getElementById('sf-oqooddate')?.value||null;

  const milestones = (window._sfMsState || [])
    .map((m,i)=>({
      milestone_name: (m.name||'').trim(),
      amount: parseFloat(m.amount)||0,
      pct_of_sale: parseFloat(m.pct)||0,
      due_date: m.due||null,
      sort_order: i,
    }))
    .filter(m=>m.milestone_name);

  const saleData = {
    unit_id:unitId, status, buyer_name, sale_date, sold_price, discount_amount,
    commission_pct, broker_name, brokerage_name, spa_status, spa_date, oqood_status,
    oqood_date, updated_at: new Date().toISOString()
  };

  let targetSaleId = saleId;
  if(saleId) {
    const {error} = await sb.from('unit_sales').update(saleData).eq('id',saleId);
    if(error) { toast('Save error: ' + error.message,'error'); return; }
  } else {
    const {data, error} = await sb.from('unit_sales').insert(saleData).select().single();
    if(error) { toast('Save error: ' + error.message,'error'); return; }
    targetSaleId = data.id;
  }

  // Replace milestones: delete all then insert fresh
  await sb.from('payment_milestones').delete().eq('unit_sale_id', targetSaleId);
  if(milestones.length) {
    const rows = milestones.map(m=>({...m, unit_sale_id:targetSaleId}));
    const {error:msErr} = await sb.from('payment_milestones').insert(rows);
    if(msErr) { toast('Milestone error: ' + msErr.message,'error'); return; }
  }

  // Sync joint owners → unit_sale_customers (replaces buyer_name free-text).
  // Returns the primary owner name; refresh buyer_name if it diverged.
  if (window.Customers?.syncSaleOwners) {
    const primaryName = await window.Customers.syncSaleOwners(targetSaleId, ownersFromPicker);
    if (primaryName && primaryName !== buyer_name) {
      await sb.from('unit_sales').update({ buyer_name: primaryName }).eq('id', targetSaleId);
    }
  }

  // Sync units.sale_status + blocked with the unit_sales status. Blocked-by-
  // developer rows keep the client_name on the sale row but flag the unit as
  // un-sellable so it drops out of the available pool.
  let newSaleStatus = 'available';
  let newBlocked    = false;
  if (status === 'sold') {
    newSaleStatus = 'sold';
  } else if (status === 'reserved') {
    newSaleStatus = 'reserved';
  } else if (status === 'blocked_by_developer') {
    newSaleStatus = 'blocked_by_developer';
    newBlocked    = true;
  }
  const {error: unitErr} = await sb.from('units')
    .update({sale_status: newSaleStatus, blocked: newBlocked})
    .eq('id', unitId);
  if(unitErr) { toast('Unit status error: ' + unitErr.message,'error'); return; }

  toast('Sale saved','success');
  closeModal();
  render();
}

async function markUnitAvailable(saleId, unitNo) {
  const ok = await confirmModal('Remove sale record for Unit ' + unitNo + ' and mark it Available? Payment milestones will also be deleted.');
  if(!ok) return;
  // Get unit_id before deleting
  const {data:sale, error:fetchErr} = await sb.from('unit_sales').select('unit_id').eq('id',saleId).single();
  if(fetchErr) { toast('Error: ' + fetchErr.message,'error'); return; }
  const {error} = await sb.from('unit_sales').delete().eq('id',saleId);
  if(error) { toast('Error: ' + error.message,'error'); return; }
  // Reset units.sale_status
  await sb.from('units').update({sale_status:'available'}).eq('id', sale.unit_id);
  toast('Unit ' + unitNo + ' is now available','success');
  closeModal();
  render();
}

// ─── SALES REVENUE ───────────────────────────────────────────────────────────

async function renderSalesRevenue() {
  const {data:units, error} = await sb
    .from('units')
    .select('*, unit_sales(*, payment_milestones(*))')
    .eq('project_id', currentProject.id);
  if(error) {
    document.getElementById('content').innerHTML =
      '<div class="empty-state" style="padding:48px;text-align:center;color:var(--red)">Failed to load: ' + esc(error.message) + '</div>';
    return;
  }
  const all = units||[];
  const soldUnits     = all.filter(u=>u.sale_status==='sold');
  const reservedUnits = all.filter(u=>u.sale_status==='reserved' || u.unit_sales?.status==='reserved');
  const availUnits    = all.filter(u=>u.sale_status==='available');
  const contracted    = [...soldUnits,...reservedUnits];
  const typeCounts    = all.reduce((acc,u)=>{ acc[u.unit_type]=(acc[u.unit_type]||0)+1; return acc; },{});
  const typeSubtitle  = Object.entries(typeCounts).sort((a,b)=>b[1]-a[1]).map(([t,n])=>n+' '+t).join(' \u00b7 ');

  const totalGDV        = all.reduce((s,u)=>s+(+u.listed_price||0),0);
  const totalContracted = contracted.reduce((s,u)=>s+(+u.unit_sales?.sold_price||0),0);
  const remainingGDV    = availUnits.reduce((s,u)=>s+(+u.listed_price||0),0);
  const contractedSqft  = contracted.reduce((s,u)=>s+(+u.area_sqft||0),0);
  const avgPsfAchieved  = contractedSqft ? Math.round(totalContracted / contractedSqft) : 0;
  const totalSqftSold   = soldUnits.reduce((s,u)=>s+(+u.area_sqft||0),0);
  const totalSqft       = all.reduce((s,u)=>s+(+u.area_sqft||0),0);
  const soldPct         = all.length ? (soldUnits.length/all.length*100).toFixed(1) : '0.0';
  const availPct        = all.length ? (availUnits.length/all.length*100).toFixed(1) : '0.0';

  // Commission
  const totalComm = contracted.reduce((s,u)=>s+((+u.unit_sales?.sold_price||0)*(+u.unit_sales?.commission_pct||0)/100),0);
  const commRates = contracted.filter(u=>+u.unit_sales?.commission_pct>0).map(u=>+u.unit_sales?.commission_pct);
  const avgComm   = commRates.length ? commRates.reduce((s,v)=>s+v,0)/commRates.length : 0;
  const withBroker= contracted.filter(u=>u.unit_sales?.broker_name).length;

  // Discount
  const totalDisc = contracted.reduce((s,u)=>s+(+u.unit_sales?.discount_amount||0),0);
  const discPcts  = contracted.filter(u=>+u.unit_sales?.discount_amount>0)
    .map(u=>((+u.unit_sales?.discount_amount)/(+u.listed_price||1))*100);
  const avgDisc   = discPcts.length ? discPcts.reduce((s,v)=>s+v,0)/discPcts.length : 0;
  const withDisc  = contracted.filter(u=>+u.unit_sales?.discount_amount>0).length;

  // Monthly expected revenue
  const monthMap = {};
  let onHandover = 0;
  for(const u of contracted) {
    for(const m of (u.unit_sales?.payment_milestones||[])) {
      if(!m.due_date) { onHandover += (+m.amount||0); continue; }
      const key = m.due_date.substring(0,7);
      monthMap[key] = (monthMap[key]||0) + (+m.amount||0);
    }
  }
  const sortedMonths = Object.keys(monthMap).sort();
  let cum = 0;
  const monthRowsHTML = sortedMonths.map(k=>{
    cum += monthMap[k];
    const [yr,mo] = k.split('-');
    const label = new Date(+yr,+mo-1,1).toLocaleDateString('en-GB',{month:'short',year:'numeric'});
    return '<tr style="border-bottom:0.5px solid var(--border)">' +
      '<td style="padding:5px 10px">' + label + '</td>' +
      '<td style="padding:5px 10px;text-align:right;font-weight:500">' + fmtAED(monthMap[k]) + '</td>' +
      '<td style="padding:5px 10px;text-align:right;color:var(--text2)">' + fmtAED(cum) + '</td>' +
      '</tr>';
  }).join('');
  const handoverRow = onHandover > 0
    ? '<tr style="border-top:1px solid var(--border2);font-style:italic">' +
        '<td style="padding:5px 10px;color:var(--text2)">On Handover (event-based)</td>' +
        '<td style="padding:5px 10px;text-align:right;font-weight:500">' + fmtAED(onHandover) + '</td>' +
        '<td style="padding:5px 10px;text-align:right;color:var(--text2)">\u2014</td>' +
      '</tr>'
    : '';

  // By type — dynamic across all unit types in current project
  const allTypes = [...new Set(all.map(u=>u.unit_type))].sort();
  const typeRows = allTypes.map(type=>{
    const ta   = all.filter(u=>u.unit_type===type);
    const ts   = ta.filter(u=>u.sale_status==='sold');
    const tc   = ta.filter(u=>u.sale_status==='sold'||u.sale_status==='reserved');
    const avgS = ta.length ? ta.reduce((s,u)=>s+(+u.area_sqft||0),0)/ta.length : 0;
    const avgP = ts.length ? ts.reduce((s,u)=>s+(+u.unit_sales?.sold_price||0),0)/ts.length : 0;
    const totR = tc.reduce((s,u)=>s+(+u.unit_sales?.sold_price||0),0);
    return '<tr style="border-bottom:0.5px solid var(--border)">' +
      '<td style="padding:6px 10px;font-weight:500">' + type + '</td>' +
      '<td style="padding:6px 10px;text-align:center">' + ta.length + '</td>' +
      '<td style="padding:6px 10px;text-align:center;color:var(--green);font-weight:500">' + ts.length + '</td>' +
      '<td style="padding:6px 10px;text-align:right">' + avgS.toFixed(0) + ' sqft</td>' +
      '<td style="padding:6px 10px;text-align:right">' + (ts.length ? fmtAED(Math.round(avgP)) : '\u2014') + '</td>' +
      '<td style="padding:6px 10px;text-align:right;font-weight:600">' + (totR > 0 ? fmtAED(totR) : '\u2014') + '</td>' +
      '</tr>';
  }).join('');

  // Totals row for Revenue by Unit Type table
  const totalAllUnits   = all.length;
  const totalAllSold    = soldUnits.length;
  const totalAvgSqft    = all.length ? Math.round(all.reduce((s,u)=>s+(+u.area_sqft||0),0)/all.length) : 0;
  const totalRevenue    = [...soldUnits,...reservedUnits].reduce((s,u)=>s+(+u.unit_sales?.sold_price||0),0);
  const totalsRow = '<tr style="border-top:1.5px solid var(--border);background:var(--bg3)">' +
    '<td style="padding:6px 10px;font-weight:700">Total</td>' +
    '<td style="padding:6px 10px;text-align:center;font-weight:700">' + totalAllUnits + '</td>' +
    '<td style="padding:6px 10px;text-align:center;font-weight:700;color:var(--green)">' + totalAllSold + '</td>' +
    '<td style="padding:6px 10px;text-align:right;font-weight:700">' + totalAvgSqft + ' sqft</td>' +
    '<td style="padding:6px 10px;text-align:right">—</td>' +
    '<td style="padding:6px 10px;text-align:right;font-weight:700">' + (totalRevenue > 0 ? fmtAED(totalRevenue) : '—') + '</td>' +
    '</tr>';

  // Helper: stat card
  const sc = (val,label,sub,valColor) =>
    '<div style="background:var(--bg2);border:0.5px solid var(--border);border-radius:8px;padding:12px">' +
    '<div style="font-size:20px;font-weight:700;color:' + (valColor||'var(--charcoal)') + '">' + val + '</div>' +
    '<div style="font-size:10px;color:var(--text2);margin-top:2px">' + label + '</div>' +
    (sub ? '<div style="font-size:10px;color:var(--text3);margin-top:4px">' + sub + '</div>' : '') +
    '</div>';

  const rc = (val,label,sub,bg,border,vc) =>
    '<div style="background:' + bg + ';border:0.5px solid ' + border + ';border-radius:8px;padding:12px">' +
    '<div style="font-size:18px;font-weight:700;color:' + vc + '">' + val + '</div>' +
    '<div style="font-size:10px;color:' + vc + ';margin-top:2px">' + label + '</div>' +
    (sub ? '<div style="font-size:10px;color:var(--text3);margin-top:4px">' + sub + '</div>' : '') +
    '</div>';

  document.getElementById('content').innerHTML =
    // Stats strip
    '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px">' +
      sc(all.length,'Total Units', typeSubtitle) +
      sc(soldUnits.length,'Sold', soldPct + '% of total','var(--green)') +
      sc(reservedUnits.length,'Reserved','SPA in progress','var(--amber)') +
      sc(availUnits.length,'Available', availPct + '% remaining','var(--blue)') +
      sc((totalSqftSold/1000).toFixed(1)+'K','Sqft Sold','of ' + (totalSqft/1000).toFixed(1) + 'K sqft total') +
    '</div>' +
    // Revenue strip
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">' +
      rc(fmtCompact(totalGDV),'Total GDV (Listed)','Gross Development Value','var(--green-bg)','#C0DD97','var(--green)') +
      rc(fmtCompact(totalContracted),'Total Contracted Revenue', contracted.length + ' units (sold + reserved)','var(--green-bg)','#C0DD97','var(--green)') +
      rc(fmtAED(avgPsfAchieved)+'/sqft','Avg Price/Sqft Achieved', contracted.length + ' units \u00b7 ' + (contractedSqft/1000).toFixed(1) + 'K sqft','var(--green-bg)','#C0DD97','var(--green)') +
      rc(fmtCompact(remainingGDV),'Remaining GDV (Unsold)', availUnits.length + ' available units','var(--bg3)','var(--border2)','var(--text2)') +
    '</div>' +
    // Monthly revenue table
    '<div class="card" style="margin-bottom:16px"><div style="padding:14px 18px">' +
      '<div style="font-size:11px;font-weight:600;color:var(--charcoal);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Expected Revenue by Month (Payment Plan)</div>' +
      (sortedMonths.length || onHandover > 0
        ? '<div class="tw"><table style="width:100%;font-size:11px;border-collapse:collapse"><tr style="background:var(--bg3)"><th style="padding:5px 10px;text-align:left">Month</th><th style="padding:5px 10px;text-align:right">Expected (AED)</th><th style="padding:5px 10px;text-align:right">Cumulative (AED)</th></tr>' + monthRowsHTML + handoverRow + '</table></div>'
        : '<div style="padding:8px 0;font-size:11px;color:var(--text3)">No payment milestones with due dates set yet.</div>') +
    '</div></div>' +
    // Commission + Discount
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">' +
      '<div class="card"><div style="padding:14px 18px">' +
        '<div style="font-size:11px;font-weight:600;color:var(--charcoal);margin-bottom:10px;text-transform:uppercase;letter-spacing:.04em">Commission Summary</div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:11px"><span style="color:var(--text2)">Total Commission Payable</span><span style="font-weight:600;color:var(--blue)">' + fmtAED(totalComm) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:11px"><span style="color:var(--text2)">Avg Commission Rate</span><span style="font-weight:600">' + avgComm.toFixed(2) + '%</span></div>' +
        '<div style="display:flex;justify-content:space-between;font-size:11px"><span style="color:var(--text2)">Units with broker</span><span style="color:var(--text2)">' + withBroker + ' of ' + contracted.length + ' contracted</span></div>' +
      '</div></div>' +
      '<div class="card"><div style="padding:14px 18px">' +
        '<div style="font-size:11px;font-weight:600;color:var(--charcoal);margin-bottom:10px;text-transform:uppercase;letter-spacing:.04em">Discount Summary</div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:11px"><span style="color:var(--text2)">Total Discount Given</span><span style="font-weight:600;color:var(--amber)">' + fmtAED(totalDisc) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:11px"><span style="color:var(--text2)">Avg Discount Rate</span><span style="font-weight:600">' + avgDisc.toFixed(2) + '%</span></div>' +
        '<div style="display:flex;justify-content:space-between;font-size:11px"><span style="color:var(--text2)">Units with discount</span><span style="color:var(--text2)">' + withDisc + ' of ' + contracted.length + ' contracted</span></div>' +
      '</div></div>' +
    '</div>' +
    // By unit type
    '<div class="card"><div style="padding:14px 18px">' +
      '<div style="font-size:11px;font-weight:600;color:var(--charcoal);margin-bottom:10px;text-transform:uppercase;letter-spacing:.06em">Revenue by Unit Type</div>' +
      '<div class="tw"><table style="width:100%;font-size:11px;border-collapse:collapse">' +
        '<thead><tr style="background:var(--bg3)"><th style="padding:6px 10px;text-align:left">Type</th><th style="padding:6px 10px;text-align:center">Total</th><th style="padding:6px 10px;text-align:center">Sold</th><th style="padding:6px 10px;text-align:right">Avg Sqft</th><th style="padding:6px 10px;text-align:right">Avg Sold Price</th><th style="padding:6px 10px;text-align:right">Total Revenue</th></tr></thead>' +
        '<tbody>' + typeRows + totalsRow + '</tbody>' +
      '</table></div>' +
    '</div></div>';
}

window._sfPriceChanged  = _sfPriceChanged;
window._sfAutoDiscount  = _sfAutoDiscount;
window._sfPreview       = _sfPreview;
window._sfRenderMs      = _sfRenderMs;
window._sfSyncMsAmounts = _sfSyncMsAmounts;
