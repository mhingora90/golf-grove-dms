// ─── ACTIVITY FEED (reusable) ────────────────────────────────────
// Shared composer + thread renderer + @mention autocomplete used by
// both the CRM (lead profile) and the Customers module (customer profile).
//
// Public surface (window.ActivityFeed):
//   render({ container, parentType, parentId, opts })
//   reload(parentType, parentId, containerOrSelector)
//   addActivity(parentType, parentId)
//   load(parentType, parentId)
//   initMentionAutocomplete(inputEl)
//   buildFeedHtml(acts, parentType, parentId)
//   renderActItem(a, parentType, parentId, now, isThreaded)
//   renderMentionedText(text)
//
// parentType ∈ { 'lead', 'customer' } controls which FK column
// (lead_id vs customer_id) is written / queried on crm_lead_activities.
// The fan-out trigger handles writing the same FK on crm_notifications.
//
// The composer DOM IDs (act-method, act-body, act-contacted-at,
// act-feed, act-reply-banner, act-reply-preview, act-assignee,
// act-assignee-row, act-hdr-tasks, act-hdr-past) are kept identical to
// the original CRM markup so existing CSS + inline-handler globals
// (filterActFeed, onActMethodChange, completeTask, quickSchedule,
// cancelActReply, startActReply) keep working.

(function () {
  const ACT_METHODS = {
    call:       { icon: '📞', label: 'Call' },
    whatsapp:   { icon: '💬', label: 'WhatsApp' },
    email:      { icon: '✉️', label: 'Email' },
    sms:        { icon: '📱', label: 'SMS' },
    in_person:  { icon: '🤝', label: 'In Person' },
    meeting:    { icon: '🗓️', label: 'Meeting' },
    site_visit: { icon: '🏠', label: 'Site Visit' },
    note:       { icon: '📝', label: 'Note' },
    task:       { icon: '✅', label: 'Task' },
  };

  function _nowLocal() {
    return new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
      .toISOString().slice(0, 16);
  }
  function _tomorrowLocal() {
    return new Date(Date.now() + 86400000 - new Date().getTimezoneOffset() * 60000)
      .toISOString().slice(0, 16);
  }

  // FK column on crm_lead_activities for the given parent type.
  function _fkCol(parentType) {
    return parentType === 'customer' ? 'customer_id' : 'lead_id';
  }

  // ─── feed render ────────────────────────────────────────────────
  function renderMentionedText(text) {
    return esc(text || '').replace(
      /@\[([^\]]+)\]\(([0-9a-f-]+)\)/g,
      (_, name) => `<span class="act-mention-chip">@${esc(name)}</span>`
    );
  }

  function renderActItem(a, parentType, parentId, now, isThreaded = false) {
    const m = ACT_METHODS[a.method] || ACT_METHODS.note;
    const isTask = a.method === 'task';
    const overdue = isTask && !a.completed && a.due_at && new Date(a.due_at) < now;
    const cls = ['act-item', overdue ? 'act-overdue' : '', a.completed ? 'act-completed' : '', isThreaded ? 'act-threaded' : '']
      .filter(Boolean).join(' ');
    const dateStr = isTask && a.due_at
      ? new Date(a.due_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : new Date(a.contacted_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const overdueTag = overdue ? `<span class="act-overdue-tag">Overdue</span>` : '';
    const doneBtn = isTask && !a.completed
      ? `<button class="act-done-btn" onclick="ActivityFeed.completeTask('${a.id}','${parentType}','${parentId}')">✓ Done</button>` : '';
    const replyBtn = !isThreaded
      ? `<button class="act-reply-btn" style="margin-left:6px" onclick="startActReply('${a.id}',this.closest('.act-item').querySelector('.act-body').textContent)">↩ Reply</button>` : '';
    return `<div id="act-${esc(a.id)}" class="${cls}" data-method="${esc(a.method)}">
      <div class="act-meta">
        <span>${m.icon}</span><span class="act-badge">${m.label}</span>
        <span>·</span><span>${esc(a.author_name)}</span>
        <span>·</span><span>${isTask ? 'Due: ' : ''}<b>${dateStr}</b></span>
        ${overdueTag}${doneBtn}${replyBtn}
      </div>
      <div class="act-body">${renderMentionedText(a.body || '')}</div>
    </div>`;
  }

  function buildFeedHtml(acts, parentType, parentId) {
    const now = new Date();
    const replyMap = {};
    const topLevel = [];
    (acts || []).forEach(a => {
      if (a.parent_id) { (replyMap[a.parent_id] = replyMap[a.parent_id] || []).push(a); }
      else topLevel.push(a);
    });
    const renderWithReplies = (a, threaded = false) =>
      renderActItem(a, parentType, parentId, now, threaded) +
      (replyMap[a.id] || []).sort((x, y) => new Date(x.contacted_at) - new Date(y.contacted_at))
        .map(r => renderActItem(r, parentType, parentId, now, true)).join('');

    const tasks = topLevel.filter(a => a.method === 'task' && !a.completed)
      .sort((a, b) => new Date(a.due_at || 0) - new Date(b.due_at || 0));
    const past  = topLevel.filter(a => a.method !== 'task' || a.completed)
      .sort((a, b) => new Date(a.contacted_at) - new Date(b.contacted_at));
    let html = '';
    if (tasks.length) html += `<div class="act-section-hdr" id="act-hdr-tasks">📋 Tasks</div>` + tasks.map(a => renderWithReplies(a)).join('');
    if (past.length)  html += `<div class="act-section-hdr" id="act-hdr-past">Past Activity</div>` + past.map(a => renderWithReplies(a)).join('');
    return html || '<div style="color:var(--text3);font-size:12px;padding:4px 0">No activity yet</div>';
  }

  // ─── data ───────────────────────────────────────────────────────
  async function load(parentType, parentId) {
    const col = _fkCol(parentType);
    const { data } = await sb.from('crm_lead_activities')
      .select('*')
      .eq(col, parentId)
      .order('contacted_at', { ascending: true });
    return data || [];
  }

  async function addActivity(parentType, parentId) {
    const body = document.getElementById('act-body')?.value?.trim();
    const method = document.getElementById('act-method')?.value || 'note';
    const dateVal = document.getElementById('act-contacted-at')?.value;
    if (!body) return;
    const isTask = method === 'task';
    const authorName = currentProfile?.full_name || currentUser?.email || 'Unknown';
    // Reuse the existing CRM reply-banner state when present so the
    // composer reply UX is shared between modules.
    const parentActId = (typeof _crmReplyTo !== 'undefined' && _crmReplyTo) || null;
    if (typeof _crmReplyTo !== 'undefined') _crmReplyTo = null;

    let assignedToId = null, assignedToName = null;
    if (isTask) {
      const assigneeSel = document.getElementById('act-assignee');
      if (assigneeSel?.value) {
        assignedToId = assigneeSel.value;
        assignedToName = assigneeSel.options[assigneeSel.selectedIndex]?.dataset?.name || null;
      } else {
        assignedToId = currentUser?.id;
        assignedToName = authorName;
      }
    }
    const mentions = (_atState?.chosen || []).map(c => c.id);

    const payload = {
      author_id: currentUser?.id,
      author_name: authorName,
      method,
      contacted_at: isTask
        ? new Date().toISOString()
        : (dateVal ? new Date(dateVal).toISOString() : new Date().toISOString()),
      due_at: isTask && dateVal ? new Date(dateVal).toISOString() : null,
      body,
      completed: false,
      parent_id: parentActId,
      assigned_to: assignedToId,
      assigned_to_name: assignedToName,
      mentions,
    };
    payload[_fkCol(parentType)] = parentId;

    const { error } = await sb.from('crm_lead_activities').insert(payload);
    if (error) {
      if (typeof _crmReplyTo !== 'undefined') _crmReplyTo = parentActId;
      if ((error.message || '').includes('crm_activities_mentions_max_10')) {
        toast('Maximum 10 mentions per comment', 'error');
      } else {
        toast('Error: ' + error.message, 'error');
      }
      return;
    }
    _atState.chosen = [];

    // Only leads get last_contacted_at — customers have no equivalent column today.
    if (!isTask && parentType === 'lead') {
      await sb.from('crm_leads').update({
        last_contacted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', parentId);
    }

    const bodyEl = document.getElementById('act-body');
    if (bodyEl) bodyEl.value = '';
    const dtEl = document.getElementById('act-contacted-at');
    if (dtEl) dtEl.value = _nowLocal();
    const banner = document.getElementById('act-reply-banner');
    if (banner) banner.style.display = 'none';

    await reload(parentType, parentId);
  }

  async function completeTask(actId, parentType, parentId) {
    const { error } = await sb.from('crm_lead_activities').update({ completed: true }).eq('id', actId);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    toast('Task done', 'success');
    // For leads, the original behaviour re-opened the lead modal (viewLead);
    // keep that to preserve UX on the CRM side.
    if (parentType === 'lead' && typeof viewLead === 'function') {
      viewLead(parentId);
    } else {
      await reload(parentType, parentId);
    }
  }

  // ─── composer + render entry point ─────────────────────────────
  async function reload(parentType, parentId, containerOrSelector) {
    const acts = await load(parentType, parentId);
    const feedEl = document.getElementById('act-feed');
    if (feedEl) {
      feedEl.innerHTML = buildFeedHtml(acts, parentType, parentId);
      feedEl.scrollTop = feedEl.scrollHeight;
    } else if (containerOrSelector) {
      // Fallback: full re-render in caller-supplied container.
      const container = typeof containerOrSelector === 'string'
        ? document.querySelector(containerOrSelector)
        : containerOrSelector;
      if (container) render({ container, parentType, parentId });
    }
  }

  function _composerHtml(parentType, parentId, feedHtml, opts) {
    const methods = opts?.methods || Object.keys(ACT_METHODS);
    const methodOpts = methods.map(k => {
      const v = ACT_METHODS[k]; if (!v) return '';
      return `<option value="${k}"${k === 'note' ? ' selected' : ''}>${v.icon} ${v.label}</option>`;
    }).join('');
    const projectMembers = (typeof _crmProjectMembers !== 'undefined' && _crmProjectMembers) || [];
    const myName = (typeof currentProfile !== 'undefined' && currentProfile?.full_name) || 'me';

    return `
      <div class="act-filter-bar">
        <button class="act-filter-btn active" data-filter="all" onclick="filterActFeed('all')">All</button>
        <button class="act-filter-btn" data-filter="tasks" onclick="filterActFeed('tasks')">Tasks</button>
        <button class="act-filter-btn" data-filter="calls" onclick="filterActFeed('calls')">Calls</button>
        <button class="act-filter-btn" data-filter="emails" onclick="filterActFeed('emails')">Emails</button>
        <button class="act-filter-btn" data-filter="other" onclick="filterActFeed('other')">Other</button>
      </div>
      <div class="act-feed" id="act-feed">${feedHtml}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
        <button class="act-quick-btn" onclick="quickSchedule('call')">📞 Schedule Call</button>
        <button class="act-quick-btn" onclick="quickSchedule('whatsapp')">💬 Schedule WhatsApp</button>
        <button class="act-quick-btn" onclick="quickSchedule('meeting')">🤝 Schedule Meeting</button>
      </div>
      <div class="act-reply-banner" id="act-reply-banner">
        <span style="flex-shrink:0">↩ Replying to:</span>
        <span id="act-reply-preview" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-style:italic"></span>
        <button onclick="cancelActReply()" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:16px;line-height:1;padding:0 2px">×</button>
      </div>
      <div class="act-input-row">
        <select class="form-control" id="act-method" onchange="onActMethodChange()">${methodOpts}</select>
        <div><div class="act-dt-label" id="act-dt-label">Contact time</div><input type="datetime-local" class="form-control" id="act-contacted-at" value="${_nowLocal()}"/></div>
        <input type="text" class="form-control" id="act-body" placeholder="Add activity note…" onkeydown="if(event.key==='Enter')ActivityFeed.addActivity('${parentType}','${parentId}')"/>
        <button class="btn btn-primary" onclick="ActivityFeed.addActivity('${parentType}','${parentId}')">Add</button>
      </div>
      <div id="act-assignee-row" style="display:none;margin-top:6px">
        <select class="form-control" id="act-assignee" style="font-size:12px">
          <option value="">Assign task to: ${esc(myName)} (default)</option>
          ${projectMembers.map(p => `<option value="${esc(p.id)}" data-name="${esc(p.full_name || p.id)}">${esc(p.full_name || p.id)}</option>`).join('')}
        </select>
      </div>`;
  }

  // Main entry: renders feed + composer into a container element.
  // For backward compatibility with the existing CRM lead modal,
  // callers may pre-build the composer themselves and only ask for the
  // feed HTML via buildFeedHtml(); this function is for the new
  // Customers module and any other callsite that wants a full feed.
  async function render({ container, parentType, parentId, opts }) {
    if (!container) return;
    const acts = await load(parentType, parentId);
    const feedHtml = buildFeedHtml(acts, parentType, parentId);
    container.innerHTML = `
      <div class="activity-feed-component" data-parent-type="${esc(parentType)}" data-parent-id="${esc(parentId)}">
        <div style="font-size:11px;font-weight:600;color:var(--charcoal);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Activity</div>
        ${_composerHtml(parentType, parentId, feedHtml, opts)}
      </div>`;
    setTimeout(() => {
      const feed = container.querySelector('#act-feed');
      if (feed) feed.scrollTop = feed.scrollHeight;
      const inputEl = container.querySelector('#act-body');
      if (inputEl && !inputEl.dataset.atWired) initMentionAutocomplete(inputEl);
    }, 60);
  }

  // ─── @mention autocomplete ──────────────────────────────────────
  let _mentionPool = null;
  async function _getMentionPool() {
    if (_mentionPool) return _mentionPool;
    const { data } = await sb.from('profiles')
      .select('id, full_name, role')
      .in('role', ['developer', 'sales', 'admin'])
      .neq('id', currentUser?.id || '00000000-0000-0000-0000-000000000000')
      .order('full_name');
    _mentionPool = data || [];
    return _mentionPool;
  }

  const _atState = { active: false, anchorStart: -1, query: '', idx: 0, items: [], chosen: [], inputEl: null };

  function initMentionAutocomplete(inputEl) {
    if (!inputEl) return;
    inputEl.dataset.atWired = '1';
    _atState.chosen = [];
    inputEl.addEventListener('input', () => _atOnInput(inputEl));
    inputEl.addEventListener('keydown', (e) => _atOnKeyDown(inputEl, e));
    inputEl.addEventListener('blur', () => setTimeout(_atClose, 150));
  }

  async function _atOnInput(inputEl) {
    const val = inputEl.value;
    const caret = inputEl.selectionStart || val.length;
    let i = caret - 1;
    while (i >= 0 && /[A-Za-z0-9_]/.test(val[i])) i--;
    if (i < 0 || val[i] !== '@' || (i > 0 && /\w/.test(val[i - 1]))) { _atClose(); return; }
    const query = val.slice(i + 1, caret).toLowerCase();
    _atState.active = true;
    _atState.anchorStart = i;
    _atState.query = query;
    _atState.inputEl = inputEl;
    const pool = await _getMentionPool();
    _atState.items = pool.filter(p => (p.full_name || '').toLowerCase().includes(query)).slice(0, 8);
    _atState.idx = 0;
    _atRender(inputEl);
  }

  function _atRender(inputEl) {
    let pop = document.getElementById('crm-at-popup');
    if (!pop) {
      pop = document.createElement('div');
      pop.id = 'crm-at-popup';
      pop.className = 'crm-at-popup';
      document.body.appendChild(pop);
    }
    if (!_atState.items.length) { _atClose(); return; }
    pop.innerHTML = _atState.items.map((p, i) => `
      <div class="crm-at-item ${i === _atState.idx ? 'active' : ''}"
           onmousedown="event.preventDefault(); ActivityFeed._atPick(${i})">
        <span>${esc(p.full_name || p.id)}</span><span class="role">${esc(p.role || '')}</span>
      </div>
    `).join('');
    const rect = inputEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Reset so we measure natural size.
    pop.style.maxHeight = '';
    pop.style.display = '';
    pop.style.left = '0px';
    pop.style.top = '0px';
    const popW = pop.offsetWidth || 260;
    const popH = pop.offsetHeight || 0;
    // Clamp height to the larger of space-below / space-above, minus 12px gutter.
    const spaceBelow = vh - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const flipUp = popH > spaceBelow && spaceAbove > spaceBelow;
    const maxH = Math.max(120, flipUp ? spaceAbove : spaceBelow);
    pop.style.maxHeight = maxH + 'px';
    pop.style.overflowY = 'auto';
    // Re-measure after clamp.
    const finalH = Math.min(popH, maxH);
    let left = rect.left;
    if (left + popW + 8 > vw) left = Math.max(8, vw - popW - 8);
    const top = flipUp ? (rect.top - finalH - 4) : (rect.bottom + 4);
    pop.style.left = (left + window.scrollX) + 'px';
    pop.style.top = (top + window.scrollY) + 'px';
  }

  function _atClose() {
    _atState.active = false;
    const pop = document.getElementById('crm-at-popup');
    if (pop) pop.style.display = 'none';
  }

  function _atOnKeyDown(inputEl, e) {
    if (!_atState.active) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _atState.idx = (_atState.idx + 1) % _atState.items.length; _atRender(inputEl);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _atState.idx = (_atState.idx - 1 + _atState.items.length) % _atState.items.length; _atRender(inputEl);
    } else if (e.key === 'Enter') {
      e.preventDefault(); _atPick(_atState.idx);
    } else if (e.key === 'Escape') {
      _atClose();
    }
  }

  function _atPick(idx) {
    const inputEl = _atState.inputEl || document.getElementById('act-body');
    if (!inputEl) return;
    const item = _atState.items[idx];
    if (!item) return;
    const before = inputEl.value.slice(0, _atState.anchorStart);
    const after  = inputEl.value.slice(inputEl.selectionStart || inputEl.value.length);
    const marker = `@[${item.full_name || item.id}](${item.id}) `;
    inputEl.value = before + marker + after;
    inputEl.focus();
    const caret = (before + marker).length;
    inputEl.setSelectionRange(caret, caret);
    if (!_atState.chosen.find(c => c.id === item.id)) _atState.chosen.push(item);
    _atClose();
  }

  // ─── public surface ────────────────────────────────────────────
  window.ActivityFeed = {
    METHODS: ACT_METHODS,
    render,
    reload,
    load,
    addActivity,
    completeTask,
    buildFeedHtml,
    renderActItem,
    renderMentionedText,
    initMentionAutocomplete,
    _atPick,           // exposed for inline onmousedown handlers
    _atState,          // exposed so the legacy CRM can read chosen mentions
    _nowLocal,
    _tomorrowLocal,
  };

  // Spec-named alias.
  window.renderActivityFeed = render;
})();
