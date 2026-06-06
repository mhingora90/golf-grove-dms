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
      .select('id, name, phone, email, nationality, unit_sale_customers(unit_sale_id, is_primary)')
      .order('name');
    if (error) { toast('Failed to load customers: ' + error.message, 'error'); return []; }
    return data || [];
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

  function buildListHtml(customers, last) {
    return `
      <div class="page-section">
        <div class="page-section-header" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <h2 style="margin:0;flex:1">Customers</h2>
          <input id="cust-search" class="form-control" placeholder="Search name, phone, email…"
                 value="${esc(_custSearch)}" style="max-width:280px"
                 oninput="Customers.onSearch(this.value)"/>
          <select id="cust-recency" class="form-control" style="max-width:180px"
                  onchange="Customers.onRecency(this.value)">
            <option value="">Any recency</option>
            <option value="30" ${_custRecency==='30'?'selected':''}>&lt; 30 days</option>
            <option value="60" ${_custRecency==='60'?'selected':''}>&lt; 60 days</option>
            <option value="90" ${_custRecency==='90'?'selected':''}>&lt; 90 days</option>
            <option value="none" ${_custRecency==='none'?'selected':''}>No interactions</option>
          </select>
          <button class="btn btn-primary" onclick="Customers.openCreate()">+ New Customer</button>
        </div>
        <div class="page-section-body">
          ${customers.length === 0
            ? '<div class="empty-state">No customers yet. They will appear here once a unit is sold.</div>'
            : `<table class="data-table">
                 <thead><tr>
                   <th>Name</th><th>Phone</th><th>Email</th>
                   <th style="text-align:center">Units</th>
                   <th>Last contact</th><th style="text-align:center">Method</th>
                 </tr></thead>
                 <tbody>
                   ${customers.map(c => _rowHtml(c, last[c.id])).join('')}
                 </tbody>
               </table>`}
        </div>
      </div>`;
  }

  function _rowHtml(c, lastAct) {
    const unitCount = (c.unit_sale_customers || []).length;
    const lastTs = lastAct?.contacted_at;
    const lastMethod = lastAct?.method;
    const methodIcon = (window.ActivityFeed?.METHODS?.[lastMethod]?.icon) || '—';
    return `<tr data-customer-id="${esc(c.id)}" style="cursor:pointer"
                onclick="Customers.openProfile('${esc(c.id)}')">
      <td>${esc(c.name)}</td>
      <td>${esc(c.phone || '')}</td>
      <td>${esc(c.email || '')}</td>
      <td style="text-align:center">${unitCount}</td>
      <td>${_fmtRel(lastTs)}</td>
      <td style="text-align:center">${methodIcon}</td>
    </tr>`;
  }

  function _fmtRel(ts) {
    if (!ts) return '<span style="color:#c44545">never</span>';
    const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return days + ' days ago';
    if (days < 60) return Math.floor(days / 7) + ' weeks ago';
    return '<span style="color:#c44545">' + days + ' days ago</span>';
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
    root.innerHTML = buildListHtml(filtered, _lastCache || {});
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
    // Drawer implementation lands in Task 11. For now, a stub modal
    // so the row click + nav route round-trip can be smoke-tested.
    const c = (_custCache || []).find(x => x.id === id);
    if (!c) { toast('Customer not found', 'error'); return; }
    if (typeof openModal === 'function') {
      openModal('Customer — ' + esc(c.name), `
        <div class="detail-grid">
          <div class="detail-item"><div class="detail-label">Phone</div><div class="detail-value">${esc(c.phone || '—')}</div></div>
          <div class="detail-item"><div class="detail-label">Email</div><div class="detail-value">${esc(c.email || '—')}</div></div>
          <div class="detail-item"><div class="detail-label">Nationality</div><div class="detail-value">${esc(c.nationality || '—')}</div></div>
          <div class="detail-item"><div class="detail-label">Units</div><div class="detail-value">${(c.unit_sale_customers || []).length}</div></div>
        </div>
        <div style="margin-top:12px;color:var(--text3);font-size:12px">Profile drawer + interaction feed coming in next task.</div>`,
        `<button class="btn" onclick="closeModal()">Close</button>`);
    }
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

  return { init, openProfile, openCreate, doCreate, onSearch, onRecency };
})();
