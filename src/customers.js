// ─── CUSTOMERS ──────────────────────────────────────────────────
// Post-sale customer interaction tracking. Renders the list view into
// #content (matching the rest of the app) and opens a profile drawer
// for each customer. The activity feed inside the drawer is provided
// by window.ActivityFeed.

window.Customers = (function () {
  let _custCache = null;
  let _lastCache = null;
  let _custSearch = '';
  let _custRecency = '';

  async function loadCustomers() {
    const { data, error } = await sb
      .from('customers')
      .select('id, name, phone, email, nationality, unit_sale_customers(unit_sale_id, is_primary, unit_sales(units(project_id)))')
      .order('name');
    if (error) { toast('Failed to load customers: ' + error.message, 'error'); return []; }
    const projectId = window.currentProject?.id;
    if (!projectId) return data || [];
    // Scope to currentProject: keep customers with at least one linked unit in
    // this project, plus orphans (no unit links — manual entries belong to all).
    return (data || []).filter(c => {
      const links = c.unit_sale_customers || [];
      if (links.length === 0) return true;
      return links.some(l => l.unit_sales?.units?.project_id === projectId);
    });
  }

  async function loadLastInteractions(customerIds) {
    if (!customerIds.length) return {};
    const { data, error } = await sb
      .from('crm_lead_activities')
      .select('customer_id, method, contacted_at')
      .in('customer_id', customerIds)
      .order('contacted_at', { ascending: false });
    if (error) return {};
    const out = {};
    for (const a of data || []) if (!out[a.customer_id]) out[a.customer_id] = a;
    return out;
  }

  function buildListHtml(customers, last, totalAll) {
    const statsSrc = _custCache || customers;
    const total = totalAll ?? statsSrc.length;
    const fresh = statsSrc.filter(c => _bucket(last[c.id]?.contacted_at) === 'fresh').length;
    const stale = statsSrc.filter(c => _bucket(last[c.id]?.contacted_at) === 'cold').length;
    const noTouch = statsSrc.filter(c => !last[c.id]).length;

    const stats = `
      <div class="cust-stats">
        <div class="cust-stat">
          <div class="cust-stat-label">Total Customers</div>
          <div class="cust-stat-val">${total}</div>
          <div class="cust-stat-sub">across all projects</div>
        </div>
        <div class="cust-stat is-fresh">
          <div class="cust-stat-label">Touched &lt; 30 d</div>
          <div class="cust-stat-val">${fresh}</div>
          <div class="cust-stat-sub">recent engagement</div>
        </div>
        <div class="cust-stat is-warn">
          <div class="cust-stat-label">Cold (60 d+)</div>
          <div class="cust-stat-val">${stale}</div>
          <div class="cust-stat-sub">needs follow-up</div>
        </div>
        <div class="cust-stat is-danger">
          <div class="cust-stat-label">No Interactions</div>
          <div class="cust-stat-val">${noTouch}</div>
          <div class="cust-stat-sub">never contacted</div>
        </div>
      </div>`;

    const grid = customers.length === 0
      ? `<div class="cust-empty">
           <div class="cust-empty-emoji">🪶</div>
           <div class="cust-empty-title">No customers yet</div>
           <div class="cust-empty-sub">${_custSearch || _custRecency ? 'Nothing matches your filters. Try clearing them.' : 'Customers appear here once units are sold, or add them manually below.'}</div>
         </div>`
      : `<div class="cust-grid">${customers.map(c => _cardHtml(c, last[c.id])).join('')}</div>`;

    return `
      <div class="cust-page">
        <div class="cust-header">
          <div class="cust-header-lede">
            <div class="cust-eyebrow">Post-sale Ledger</div>
            <div class="cust-h1">Customers</div>
            <div class="cust-sub">Track every interaction with your buyers — calls, meetings, WhatsApps. Joint owners stay linked to the right unit.</div>
          </div>
          <div class="cust-header-tools">
            <input id="cust-search" class="form-control" placeholder="Search name, phone, email…"
                   value="${esc(_custSearch)}" style="width:240px"
                   oninput="Customers.onSearch(this.value)"/>
            <select id="cust-recency" class="form-control" style="width:170px"
                    onchange="Customers.onRecency(this.value)">
              <option value="">Any recency</option>
              <option value="30" ${_custRecency==='30'?'selected':''}>&lt; 30 days</option>
              <option value="60" ${_custRecency==='60'?'selected':''}>&lt; 60 days</option>
              <option value="90" ${_custRecency==='90'?'selected':''}>&lt; 90 days</option>
              <option value="none" ${_custRecency==='none'?'selected':''}>No interactions</option>
            </select>
            <button class="btn btn-primary" onclick="Customers.openCreate()">+ New Customer</button>
          </div>
        </div>
        ${stats}
        ${grid}
      </div>`;
  }

  function _cardHtml(c, lastAct) {
    const unitCount = (c.unit_sale_customers || []).length;
    const lastTs = lastAct?.contacted_at;
    const methodIcon = (window.ActivityFeed?.METHODS?.[lastAct?.method]?.icon) || '·';
    const methodLabel = (window.ActivityFeed?.METHODS?.[lastAct?.method]?.label) || '';
    const touch = _touchChip(lastTs, methodIcon, methodLabel);
    const unitsCls = unitCount === 0 ? ' is-zero' : '';

    return `<div class="cust-card" onclick="Customers.openProfile('${esc(c.id)}')">
      <div class="cust-card-head">
        <div class="cust-mono">${_initials(c.name)}</div>
        <div style="min-width:0;flex:1">
          <div class="cust-card-name">${esc(c.name)}</div>
          ${c.nationality ? `<div class="cust-card-nat">${esc(c.nationality)}</div>` : ''}
        </div>
      </div>
      <div class="cust-card-contact">
        ${c.phone ? `<div><span class="ico">☎</span><span class="val">${esc(c.phone)}</span></div>` : ''}
        ${c.email ? `<div><span class="ico">✉</span><span class="val">${esc(c.email)}</span></div>` : ''}
        ${!c.phone && !c.email ? `<div style="color:var(--text3);font-style:italic">No contact info</div>` : ''}
      </div>
      <div class="cust-card-foot">
        <span class="cust-units-chip${unitsCls}">${unitCount} unit${unitCount === 1 ? '' : 's'}</span>
        ${touch}
      </div>
    </div>`;
  }

  function _initials(name) {
    return esc((name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase() || '?');
  }

  function _bucket(ts) {
    if (!ts) return 'never';
    const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
    if (days < 30) return 'fresh';
    if (days < 60) return 'week';
    if (days < 90) return 'warn';
    return 'cold';
  }

  function _touchChip(ts, icon, label) {
    if (!ts) return `<span class="cust-touch is-cold" title="No interactions">✕ never</span>`;
    const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
    const cls = _bucket(ts);
    let text;
    if (days === 0) text = 'today';
    else if (days === 1) text = '1 d ago';
    else if (days < 30) text = days + ' d ago';
    else if (days < 60) text = Math.floor(days / 7) + ' w ago';
    else if (days < 90) text = Math.floor(days / 30) + ' mo ago';
    else text = Math.floor(days / 30) + ' mo ago';
    return `<span class="cust-touch is-${cls}" title="${esc(label || 'Last contact')}">${icon} ${text}</span>`;
  }

  function _applyFilters(customers, last) {
    let out = customers;
    if (_custSearch) {
      const q = _custSearch.toLowerCase();
      out = out.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q));
    }
    if (_custRecency === 'none') {
      out = out.filter(c => !last[c.id]);
    } else if (_custRecency) {
      const cutoff = Date.now() - Number(_custRecency) * 86400000;
      out = out.filter(c => {
        const ts = last[c.id]?.contacted_at;
        return ts && new Date(ts).getTime() >= cutoff;
      });
    }
    return out;
  }

  function _rerender() {
    const root = document.getElementById('content');
    if (!root || !_custCache) return;
    const filtered = _applyFilters(_custCache, _lastCache || {});
    const focused = document.activeElement;
    const wasSearchFocused = focused?.id === 'cust-search';
    const caret = wasSearchFocused ? focused.selectionStart : null;
    root.innerHTML = buildListHtml(filtered, _lastCache || {}, _custCache.length);
    if (wasSearchFocused) {
      const el = document.getElementById('cust-search');
      if (el) {
        el.focus();
        const pos = caret ?? _custSearch.length;
        try { el.setSelectionRange(pos, pos); } catch (_) {}
      }
    }
  }

  async function init() {
    const root = document.getElementById('content');
    if (!root) return;
    root.innerHTML = '<div class="empty-state">Loading customers…</div>';
    _custCache = await loadCustomers();
    _lastCache = await loadLastInteractions(_custCache.map(c => c.id));
    _rerender();
  }

  function onSearch(val) { _custSearch = val || ''; _rerender(); }
  function onRecency(val) { _custRecency = val || ''; _rerender(); }

  async function openProfile(id) {
    const { data: c, error } = await sb
      .from('customers')
      .select(`
        id, name, phone, email, nationality,
        unit_sale_customers(
          is_primary, ownership_pct,
          unit_sales(
            id, buyer_name,
            units(id, unit_no, project_id, projects(name))
          )
        )
      `)
      .eq('id', id)
      .maybeSingle();
    if (error || !c) { toast('Customer not found', 'error'); return; }

    const unitCount = (c.unit_sale_customers || []).length;
    const unitChips = (c.unit_sale_customers || []).map(link => {
      const u = link.unit_sales?.units;
      const projName = u?.projects?.name || '';
      const unitNo = u?.unit_no || '';
      const pct = link.ownership_pct != null ? ` <span style="color:var(--text3);font-size:10px">· ${link.ownership_pct}%</span>` : '';
      const primaryTag = link.is_primary ? '<span class="cust-unit-pri">PRIMARY</span>' : '';
      return `<span class="cust-unit-chip">
        <strong>${esc(projName)}</strong>
        <span style="color:var(--text2)">·</span>
        <span>${esc(unitNo)}</span>${pct}
        ${primaryTag}
      </span>`;
    }).join('');

    const summary = [
      c.phone ? c.phone : null,
      c.email ? c.email : null,
      c.nationality ? c.nationality : null,
    ].filter(Boolean).join('  ·  ');

    openModal('Customer Profile', `
      <div class="cust-profile-hero">
        <div class="cust-profile-mono">${_initials(c.name)}</div>
        <div style="flex:1;min-width:0">
          <div class="cust-profile-name">${esc(c.name)}</div>
          <div class="cust-profile-meta">${esc(summary || 'No contact details on file')}</div>
        </div>
        <span class="cust-units-chip${unitCount === 0 ? ' is-zero' : ''}">${unitCount} unit${unitCount === 1 ? '' : 's'}</span>
      </div>

      <div class="detail-grid">
        <div class="detail-item"><div class="detail-label">Phone</div><div class="detail-value">${esc(c.phone || '—')}</div></div>
        <div class="detail-item"><div class="detail-label">Email</div><div class="detail-value">${esc(c.email || '—')}</div></div>
        <div class="detail-item"><div class="detail-label">Nationality</div><div class="detail-value">${esc(c.nationality || '—')}</div></div>
      </div>

      <div class="cust-section-hdr">Units Owned</div>
      <div>${unitChips || '<span style="color:var(--text3);font-size:12px;font-style:italic">No units linked yet</span>'}</div>

      <div class="cust-section-hdr">Activity</div>
      <div id="cust-feed-container"></div>`,
      `<button class="btn btn-danger" onclick="Customers.doDelete('${esc(c.id)}')">Delete</button>
       <button class="btn" onclick="closeModal()">Close</button>`,
      true);

    setTimeout(() => {
      const container = document.getElementById('cust-feed-container');
      if (container && window.ActivityFeed) {
        window.ActivityFeed.render({ container, parentType: 'customer', parentId: id });
      }
    }, 60);
  }

  async function doDelete(id) {
    if (!confirm('Delete this customer? Linked sales will keep their buyer_name text but lose the customer link.')) return;
    const { error } = await sb.from('customers').delete().eq('id', id);
    if (error) { toast('Failed: ' + error.message, 'error'); return; }
    toast('Customer deleted', 'success');
    closeModal();
    await init();
  }

  function openCreate() {
    if (typeof openModal !== 'function') return;
    openModal('New Customer', `
      <div class="form-group"><label class="form-label-dark">Name *</label>
        <input type="text" class="form-control" id="cust-new-name" required/></div>
      <div class="frow">
        <div class="form-group"><label class="form-label-dark">Phone</label>
          <input type="tel" class="form-control" id="cust-new-phone"/></div>
        <div class="form-group"><label class="form-label-dark">Email</label>
          <input type="email" class="form-control" id="cust-new-email"/></div>
      </div>
      <div class="form-group"><label class="form-label-dark">Nationality</label>
        <input type="text" class="form-control" id="cust-new-nat"/></div>`,
      `<button class="btn btn-primary" onclick="Customers.doCreate()">Create</button>
       <button class="btn" onclick="closeModal()">Cancel</button>`);
  }

  async function doCreate() {
    const name = document.getElementById('cust-new-name')?.value?.trim();
    if (!name) { toast('Name is required', 'error'); return; }
    const phone = document.getElementById('cust-new-phone')?.value?.trim() || null;
    const email = document.getElementById('cust-new-email')?.value?.trim() || null;
    const nationality = document.getElementById('cust-new-nat')?.value?.trim() || null;
    const { error } = await sb.from('customers').insert({
      name, phone, email, nationality, created_by: currentUser?.id,
    });
    if (error) { toast('Failed: ' + error.message, 'error'); return; }
    toast('Customer added', 'success');
    closeModal();
    await init();
  }

  // ─── pickCustomer widget (used by Unit Register sale form) ─────
  async function loadOwnersForSale(saleId) {
    if (!saleId) return [];
    const { data, error } = await sb
      .from('unit_sale_customers')
      .select('customer_id, is_primary, ownership_pct, customers(name)')
      .eq('unit_sale_id', saleId);
    if (error) return [];
    return (data || []).map(r => ({
      customer_id: r.customer_id,
      name: r.customers?.name || '(unknown)',
      is_primary: !!r.is_primary,
      ownership_pct: r.ownership_pct,
    }));
  }

  async function syncSaleOwners(saleId, owners) {
    await sb.from('unit_sale_customers').delete().eq('unit_sale_id', saleId);
    if (!owners?.length) return null;
    const rows = owners.map(o => ({
      unit_sale_id: saleId,
      customer_id: o.customer_id,
      is_primary: !!o.is_primary,
      ownership_pct: o.ownership_pct,
    }));
    const { error } = await sb.from('unit_sale_customers').insert(rows);
    if (error) { toast('Owner link error: ' + error.message, 'error'); return null; }
    const primary = owners.find(o => o.is_primary) || owners[0];
    return primary?.name || null;
  }

  function pickCustomer({ container, initial = [] }) {
    let rows = (initial || []).map(r => ({ ...r }));

    function _rowHtml(r) {
      const tag = r.is_primary
        ? '<span style="background:#d4b87a;color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">PRIMARY</span>'
        : '<span style="background:#aaa;color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">JOINT</span>';
      return `<div data-row-id="${esc(r.customer_id)}" style="display:flex;gap:8px;align-items:center;background:#fff;padding:8px;border-radius:6px;border:1px solid #e8e3d6;margin-bottom:6px">
        ${tag}
        <span style="flex:1;font-size:13px;color:#3d2817">${esc(r.name)}</span>
        <input class="form-input pk-pct" type="number" min="0" max="100" placeholder="%" value="${r.ownership_pct ?? ''}" style="max-width:80px">
        <button type="button" class="pk-rm" style="background:none;border:none;color:#c44545;cursor:pointer;font-size:14px">✕</button>
      </div>`;
    }

    function render() {
      container.innerHTML = `
        <div style="border:1px solid #e0d4b0;background:#faf6ea;border-radius:8px;padding:12px;margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <strong style="font-size:11px;color:var(--charcoal);text-transform:uppercase;letter-spacing:.05em">Owners</strong>
          </div>
          <div>${rows.length ? rows.map(_rowHtml).join('') : '<div style="font-size:12px;color:var(--text3);padding:4px 0">No owners linked yet</div>'}</div>
          <div style="position:relative;margin-top:10px">
            <input id="pk-search" class="form-input" placeholder="Search customers or type a new name…" autocomplete="off">
            <div id="pk-results" style="position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid #e0d4b0;border-radius:6px;margin-top:4px;box-shadow:0 4px 12px rgba(0,0,0,.08);display:none;z-index:10;max-height:240px;overflow-y:auto"></div>
          </div>
        </div>`;
      _wire();
    }

    async function _search(term) {
      const safe = term.replace(/[,%]/g, '');
      const { data, error } = await sb
        .from('customers')
        .select('id, name, phone, email')
        .or(`name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`)
        .order('name')
        .limit(8);
      if (error) return [];
      return data || [];
    }

    function _wire() {
      const search = container.querySelector('#pk-search');
      const results = container.querySelector('#pk-results');
      let timer = null;

      search.addEventListener('input', () => {
        clearTimeout(timer);
        const term = search.value.trim();
        if (!term) { results.style.display = 'none'; return; }
        timer = setTimeout(async () => {
          const hits = await _search(term);
          const hitHtml = hits.map(c => `
            <div data-id="${esc(c.id)}" data-name="${esc(c.name)}" class="pk-hit" style="padding:8px 12px;border-bottom:1px solid #f0ead7;cursor:pointer">
              <div style="font-size:13px;color:#5a3a16;font-weight:500">${esc(c.name)}</div>
              <div style="font-size:11px;color:#7a6438">${esc(c.phone || c.email || '')}</div>
            </div>`).join('');
          results.innerHTML = hitHtml + `
            <div data-create="${esc(term)}" class="pk-hit" style="padding:8px 12px;cursor:pointer;background:#faf6ea">
              <div style="font-size:13px;color:#3d2817;font-weight:600">+ Create new customer "${esc(term)}"</div>
            </div>`;
          results.style.display = '';
          results.querySelectorAll('.pk-hit').forEach(el => el.addEventListener('mousedown', async (e) => {
            e.preventDefault();
            let id = el.dataset.id;
            let name = el.dataset.name;
            const createName = el.dataset.create;
            if (createName) {
              const { data, error } = await sb.from('customers')
                .insert({ name: createName, created_by: currentUser?.id })
                .select().single();
              if (error) { toast('Create failed: ' + error.message, 'error'); return; }
              id = data.id; name = data.name;
            }
            if (!rows.some(r => r.customer_id === id)) {
              rows.push({ customer_id: id, name, is_primary: rows.length === 0, ownership_pct: null });
            }
            search.value = '';
            results.style.display = 'none';
            render();
          }));
        }, 220);
      });

      search.addEventListener('blur', () => setTimeout(() => { results.style.display = 'none'; }, 220));

      container.querySelectorAll('.pk-pct').forEach(inp => inp.addEventListener('input', () => {
        const id = inp.closest('[data-row-id]').dataset.rowId;
        const r = rows.find(x => x.customer_id === id);
        if (r) { const v = parseFloat(inp.value); r.ownership_pct = isNaN(v) ? null : v; }
      }));

      container.querySelectorAll('.pk-rm').forEach(btn => btn.addEventListener('click', () => {
        const id = btn.closest('[data-row-id]').dataset.rowId;
        rows = rows.filter(r => r.customer_id !== id);
        if (rows.length && !rows.some(r => r.is_primary)) rows[0].is_primary = true;
        render();
      }));
    }

    render();
    return { getValue: () => rows };
  }

  return {
    init, openProfile, openCreate, doCreate, doDelete, onSearch, onRecency,
    pickCustomer, loadOwnersForSale, syncSaleOwners,
  };
})();
