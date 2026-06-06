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

    const unitChips = (c.unit_sale_customers || []).map(link => {
      const u = link.unit_sales?.units;
      const projName = u?.projects?.name || '';
      const unitNo = u?.unit_no || '';
      const primaryTag = link.is_primary
        ? '<span class="role-badge" style="margin-left:6px;background:#d4b87a;color:#fff;font-size:10px;padding:2px 6px;border-radius:8px">PRIMARY</span>'
        : '';
      return `<span style="display:inline-flex;align-items:center;gap:4px;background:#f4efe2;padding:6px 12px;border-radius:6px;color:#5a3a16;font-size:13px;border:1px solid #e0d4b0;margin-right:6px;margin-bottom:6px">
        <strong>${esc(projName)} · ${esc(unitNo)}</strong>${primaryTag}
      </span>`;
    }).join('');

    openModal('Customer — ' + esc(c.name), `
      <div class="detail-grid">
        <div class="detail-item"><div class="detail-label">Phone</div><div class="detail-value">${esc(c.phone || '—')}</div></div>
        <div class="detail-item"><div class="detail-label">Email</div><div class="detail-value">${esc(c.email || '—')}</div></div>
        <div class="detail-item"><div class="detail-label">Nationality</div><div class="detail-value">${esc(c.nationality || '—')}</div></div>
      </div>
      <div style="margin-top:14px">
        <div style="font-size:11px;font-weight:600;color:var(--charcoal);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Units owned</div>
        <div>${unitChips || '<span style="color:var(--text3);font-size:13px">No units linked yet</span>'}</div>
      </div>
      <div id="cust-feed-container" style="margin-top:14px"></div>`,
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
