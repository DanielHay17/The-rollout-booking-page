// Board — the Kanban over GET /api/board, moved with POST /api/leads/:id/stage.
//
// Dragging uses Pointer Events so it works with touch as well as a mouse, but
// touch dragging is fragile, so every card also carries a stage menu. The menu
// is the reliable path; the drag is the fast one.

import { api } from './api.js';
import { el, clear, append, svg, skeleton, stateBlock } from './dom.js';
import {
  companyLine, daysOverdue, fullName, int, relativeDay, STAGES, stageLabel,
} from './format.js';
import { dealChip, phoneLink, sourceChip } from './lead-ui.js';

const COLLAPSE_KEY = 'rollout.crm.collapsedColumns';
const DRAG_THRESHOLD = 5;
const LONG_PRESS_MS = 320;
const EDGE = 64;

function readCollapsed() {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed.filter((id) => typeof id === 'string'));
    }
  } catch { /* private browsing, blocked storage: fall through to the default */ }
  return new Set(['lost', 'parked']);
}

function writeCollapsed(set) {
  try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...set])); } catch { /* ignore */ }
}

function gripIcon() {
  return svg('svg', { width: 10, height: 14, viewBox: '0 0 10 14', 'aria-hidden': 'true', focusable: 'false' },
    [1, 5, 9].flatMap((y) => [2, 8].map((x) =>
      svg('circle', { cx: x, cy: y + 1, r: 1.3, fill: 'currentColor' }))));
}

function dotsIcon() {
  return svg('svg', { width: 14, height: 14, viewBox: '0 0 14 14', 'aria-hidden': 'true', focusable: 'false' },
    [3, 7, 11].map((y) => svg('circle', { cx: 7, cy: y, r: 1.3, fill: 'currentColor' })));
}

function chevronIcon(open) {
  return svg('svg', { width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': 'true', focusable: 'false' },
    svg('path', {
      d: open ? 'M8.5 2 3.5 6l5 4' : 'M3.5 2l5 4-5 4',
      fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }));
}

export function createBoardView(ctx) {
  const root = el('div', { class: 'view-board' });
  const collapsed = readCollapsed();
  const columns = new Map();      // stage id -> { col, list, countEl, empty }
  const leads = new Map();        // lead id (string) -> LeadCard
  let payload = null;
  let loading = false;
  let boardEl = null;
  let totalsEl = null;
  let query = ctx.state.q || '';
  let drag = null;
  let menu = null;
  let autoScrollFrame = 0;

  /* ----------------------------------------------------------- card markup */

  function cardNode(lead) {
    const id = String(lead.id);
    leads.set(id, lead);
    const overdue = Boolean(lead.is_overdue) || daysOverdue(lead.next_action_at) > 0;

    const grip = el('button', {
      class: 'card-grip', type: 'button', tabindex: '-1', 'aria-hidden': 'true',
      title: 'Drag to move',
    }, gripIcon());

    const menuBtn = el('button', {
      class: 'icon-btn card-menu-btn', type: 'button',
      'aria-haspopup': 'menu', 'aria-expanded': 'false',
      'aria-label': `Move ${fullName(lead)} to another stage`,
    }, dotsIcon());

    const node = el('article', {
      class: `card${overdue ? ' is-overdue' : ''}`,
      dataset: { leadId: id, stage: lead.status || 'new' },
      tabindex: '0',
      'aria-label': `${fullName(lead)}, ${stageLabel(lead.status)}`,
    }, [
      el('div', { class: 'card-top' }, [
        grip,
        el('button', {
          class: 'card-name', type: 'button', text: fullName(lead),
          onClick: () => ctx.openLead(lead.id),
        }),
        menuBtn,
      ]),
      companyLine(lead) ? el('div', { class: 'card-sub', text: companyLine(lead) }) : null,
      el('div', { class: 'card-chips' }, [
        sourceChip(lead),
        phoneLink(lead),
        lead.status === 'won' ? dealChip(lead) : null,
      ]),
      lead.next_action || lead.next_action_at
        ? el('div', { class: `card-next${overdue ? ' is-overdue' : ''}` }, [
          el('b', { text: lead.next_action || 'Follow up' }),
          lead.next_action_at
            ? el('span', {
              text: overdue
                ? ` · overdue ${daysOverdue(lead.next_action_at)}d`
                : ` · ${relativeDay(lead.next_action_at)}`,
            })
            : null,
        ])
        : null,
      el('div', { class: 'card-foot' }, [
        el('span', {
          text: (Number(lead.attempts) || 0) === 0
            ? 'no attempts'
            : `${int(lead.attempts)} ${Number(lead.attempts) === 1 ? 'attempt' : 'attempts'}`,
        }),
        el('span', {
          text: lead.last_contact ? `last ${relativeDay(lead.last_contact)}` : 'never contacted',
        }),
      ]),
    ]);

    menuBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      openStageMenu(menuBtn, node);
    });

    node.addEventListener('keydown', (event) => {
      if (event.target !== node) return;
      if (event.key === 'Enter') { event.preventDefault(); ctx.openLead(lead.id); }
      else if (event.key === 'm' || event.key === 'M') { event.preventDefault(); openStageMenu(menuBtn, node); }
    });

    grip.addEventListener('pointerdown', (event) => beginPointer(event, node, true));
    node.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button, a, input, select')) return;
      beginPointer(event, node, false);
    });

    return node;
  }

  function cardLead(node) { return leads.get(node.dataset.leadId) || { id: node.dataset.leadId }; }

  function replaceCard(node, lead) {
    const fresh = cardNode(lead);
    node.replaceWith(fresh);
    applyFilter();
    return fresh;
  }

  /* ------------------------------------------------------------- dragging */

  function beginPointer(event, node, fromGrip) {
    if (drag || event.button > 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const touch = event.pointerType !== 'mouse';
    let armed = fromGrip || !touch;
    let timer = 0;

    if (touch && !fromGrip) {
      timer = setTimeout(() => { armed = true; startDrag(node, { clientX: startX, clientY: startY, pointerId: event.pointerId }); }, LONG_PRESS_MS);
    }

    const onMove = (moveEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return;
      const dx = Math.abs(moveEvent.clientX - startX);
      const dy = Math.abs(moveEvent.clientY - startY);
      if (!drag) {
        if (touch && !fromGrip) {
          if (dx > 8 || dy > 8) { clearTimeout(timer); cleanup(); }  // they are scrolling
          return;
        }
        if (!armed || (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD)) return;
        startDrag(node, moveEvent);
      }
      moveDrag(moveEvent);
      moveEvent.preventDefault();
    };

    const onUp = (upEvent) => {
      if (upEvent.pointerId !== event.pointerId) return;
      clearTimeout(timer);
      cleanup();
      if (drag) endDrag(false);
    };

    const onCancel = () => { clearTimeout(timer); cleanup(); if (drag) endDrag(true); };

    function cleanup() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    }

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }

  function startDrag(node, event) {
    closeStageMenu();
    const rect = node.getBoundingClientRect();
    const clone = node.cloneNode(true);
    clone.classList.add('card-drag-clone');
    clone.style.width = `${rect.width}px`;
    clone.removeAttribute('tabindex');
    document.body.appendChild(clone);

    const slot = el('div', { class: 'drop-slot' });
    slot.style.height = `${rect.height}px`;

    const parent = node.parentElement;
    const next = node.nextElementSibling;
    parent.insertBefore(slot, next);
    node.hidden = true;

    drag = {
      node,
      clone,
      slot,
      pointerId: event.pointerId,
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
      pointer: { x: event.clientX, y: event.clientY },
      origin: {
        parent,
        next,
        stage: node.dataset.stage,
        prevId: previousCardId(slot),
        nextId: nextCardId(slot),
      },
    };
    document.body.classList.add('is-dragging');
    for (const entry of columns.values()) entry.empty.hidden = true;
    window.addEventListener('touchmove', blockTouchScroll, { passive: false });
    window.addEventListener('keydown', onDragKey, true);
    positionClone();
    highlight(parent);
    startAutoScroll();
  }

  function blockTouchScroll(event) { if (drag) event.preventDefault(); }

  function onDragKey(event) {
    if (event.key !== 'Escape' || !drag) return;
    event.preventDefault();
    event.stopPropagation();
    endDrag(true);
  }

  function positionClone() {
    if (!drag) return;
    drag.clone.style.left = `${drag.pointer.x - drag.dx}px`;
    drag.clone.style.top = `${drag.pointer.y - drag.dy}px`;
  }

  function moveDrag(event) {
    if (!drag) return;
    drag.pointer = { x: event.clientX, y: event.clientY };
    positionClone();
    const under = document.elementFromPoint(event.clientX, event.clientY);
    if (!under) return;

    let list = under.closest('.col-list');
    if (!list) {
      const col = under.closest('.col');
      if (col && col.classList.contains('is-collapsed')) {
        setCollapsed(col.dataset.stage, false);
        list = columns.get(col.dataset.stage)?.list || null;
      }
      if (!list) return;
    }

    const siblings = [...list.children].filter((child) =>
      child.classList.contains('card') && !child.hidden && !child.classList.contains('is-filtered'));
    let before = null;
    for (const sibling of siblings) {
      const rect = sibling.getBoundingClientRect();
      if (event.clientY < rect.top + rect.height / 2) { before = sibling; break; }
    }
    if (before !== drag.slot) list.insertBefore(drag.slot, before);
    highlight(list);
  }

  function highlight(list) {
    for (const entry of columns.values()) entry.list.classList.toggle('is-drop-target', entry.list === list);
  }

  function startAutoScroll() {
    cancelAnimationFrame(autoScrollFrame);
    const step = () => {
      if (!drag) return;
      const { x, y } = drag.pointer;
      if (boardEl) {
        const rect = boardEl.getBoundingClientRect();
        if (x < rect.left + EDGE) boardEl.scrollLeft -= Math.ceil((rect.left + EDGE - x) / 6);
        else if (x > rect.right - EDGE) boardEl.scrollLeft += Math.ceil((x - (rect.right - EDGE)) / 6);
      }
      const list = drag.slot.parentElement;
      if (list && list.scrollHeight > list.clientHeight) {
        const rect = list.getBoundingClientRect();
        if (y < rect.top + 44) list.scrollTop -= Math.ceil((rect.top + 44 - y) / 4);
        else if (y > rect.bottom - 44) list.scrollTop += Math.ceil((y - (rect.bottom - 44)) / 4);
      }
      autoScrollFrame = requestAnimationFrame(step);
    };
    autoScrollFrame = requestAnimationFrame(step);
  }

  function previousCardId(anchor) {
    let cursor = anchor.previousElementSibling;
    while (cursor) {
      if (cursor.classList.contains('card') && !cursor.hidden && !cursor.classList.contains('is-filtered')) {
        return cursor.dataset.leadId;
      }
      cursor = cursor.previousElementSibling;
    }
    return null;
  }

  function nextCardId(anchor) {
    let cursor = anchor.nextElementSibling;
    while (cursor) {
      if (cursor.classList.contains('card') && !cursor.hidden && !cursor.classList.contains('is-filtered')) {
        return cursor.dataset.leadId;
      }
      cursor = cursor.nextElementSibling;
    }
    return null;
  }

  function endDrag(cancelled) {
    const current = drag;
    drag = null;
    cancelAnimationFrame(autoScrollFrame);
    document.body.classList.remove('is-dragging');
    window.removeEventListener('touchmove', blockTouchScroll);
    window.removeEventListener('keydown', onDragKey, true);
    current.clone.remove();
    current.node.hidden = false;
    for (const entry of columns.values()) entry.list.classList.remove('is-drop-target');

    const list = current.slot.parentElement;
    const toStage = list ? list.dataset.stage : null;

    if (cancelled || !toStage) {
      restore(current.node, current.origin);
      current.slot.remove();
      refreshCounts();
      return;
    }

    const afterId = previousCardId(current.slot);
    const beforeId = nextCardId(current.slot);
    list.insertBefore(current.node, current.slot);
    current.slot.remove();

    const unchanged = toStage === current.origin.stage
      && afterId === current.origin.prevId
      && beforeId === current.origin.nextId;
    if (unchanged) { refreshCounts(); renderTotals(); return; }

    const move = { to: toStage };
    if (afterId) move.after_id = Number(afterId);
    if (beforeId) move.before_id = Number(beforeId);
    commit(current.node, move, current.origin);
  }

  function restore(node, origin) {
    const anchor = origin.next && origin.next.parentElement === origin.parent ? origin.next : null;
    origin.parent.insertBefore(node, anchor);
    refreshCounts();
  }

  async function commit(node, move, origin) {
    const lead = cardLead(node);
    node.classList.add('is-saving');
    node.dataset.stage = move.to;
    refreshCounts();
    try {
      const result = await api.setStage(lead.id, move);
      const fresh = replaceCard(node, result.lead);
      fresh.classList.remove('is-saving');
      refreshCounts();
      renderTotals();
      ctx.onDataChanged();
    } catch (err) {
      node.classList.remove('is-saving');
      node.dataset.stage = origin.stage;
      if (ctx.fatal(err)) return;
      restore(node, origin);
      renderTotals();
      node.classList.add('is-rejected');
      setTimeout(() => node.classList.remove('is-rejected'), 2200);
      ctx.notify(`${fullName(lead)} stayed in ${stageLabel(origin.stage)} — ${err.message}`, { alert: true });
    }
  }

  async function moveToStage(node, stage) {
    const origin = {
      parent: node.parentElement,
      next: node.nextElementSibling,
      stage: node.dataset.stage,
    };
    if (origin.stage === stage) return;
    const target = columns.get(stage);
    if (!target) return;
    setCollapsed(stage, false);
    target.list.insertBefore(node, target.empty);
    refreshCounts();
    await commit(node, { to: stage }, origin);
  }

  /* ----------------------------------------------------------- stage menu */

  function closeStageMenu() {
    if (!menu) return;
    const { node, anchor } = menu;
    node.remove();
    if (anchor && anchor.isConnected) anchor.setAttribute('aria-expanded', 'false');
    window.removeEventListener('pointerdown', menu.onOutside, true);
    window.removeEventListener('resize', menu.onClose);
    window.removeEventListener('scroll', menu.onClose, true);
    menu = null;
  }

  function openStageMenu(anchor, card) {
    if (menu && menu.anchor === anchor) { closeStageMenu(); return; }
    closeStageMenu();
    const lead = cardLead(card);

    const items = STAGES.map((stage) => el('button', {
      type: 'button',
      role: 'menuitem',
      'aria-current': stage.id === card.dataset.stage ? 'true' : 'false',
      onClick: () => { closeStageMenu(); moveToStage(card, stage.id); },
    }, [
      el('span', { class: `stage-swatch stage-${stage.id}` }),
      el('span', { text: stage.label }),
    ]));

    const details = el('button', {
      type: 'button', role: 'menuitem',
      onClick: () => { closeStageMenu(); ctx.openLead(lead.id); },
    }, [el('span', { class: 'stage-swatch is-blank' }), el('span', {}, 'Open details')]);

    const node = el('div', { class: 'stage-menu', role: 'menu', 'aria-label': `Move ${fullName(lead)}` }, [
      el('div', { class: 'eyebrow menu-head', text: 'Move to' }),
      ...items,
      el('div', { class: 'menu-rule' }),
      details,
    ]);
    document.body.appendChild(node);

    const rect = anchor.getBoundingClientRect();
    const width = node.offsetWidth;
    const height = node.offsetHeight;
    const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
    const below = rect.bottom + 6;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 6) : below;
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
    anchor.setAttribute('aria-expanded', 'true');

    const all = [...items, details];
    const onOutside = (event) => { if (!node.contains(event.target) && event.target !== anchor) closeStageMenu(); };
    const onClose = () => closeStageMenu();
    menu = { node, anchor, onOutside, onClose };
    window.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, true);

    node.addEventListener('keydown', (event) => {
      const index = all.indexOf(document.activeElement);
      if (event.key === 'Escape') { event.preventDefault(); closeStageMenu(); anchor.focus(); }
      else if (event.key === 'ArrowDown') { event.preventDefault(); all[(index + 1 + all.length) % all.length].focus(); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); all[(index - 1 + all.length) % all.length].focus(); }
    });
    all[0].focus();
  }

  /* -------------------------------------------------------------- columns */

  function setCollapsed(stage, value) {
    const entry = columns.get(stage);
    if (!entry) return;
    if (value) collapsed.add(stage); else collapsed.delete(stage);
    entry.col.classList.toggle('is-collapsed', value);
    entry.toggle.setAttribute('aria-expanded', value ? 'false' : 'true');
    clear(entry.toggle);
    entry.toggle.appendChild(chevronIcon(!value));
    writeCollapsed(collapsed);
  }

  function columnNode(stage, stageLeads, meta) {
    const countEl = el('span', { class: 'col-count nums' });
    const toggle = el('button', {
      class: 'icon-btn col-toggle', type: 'button',
      'aria-expanded': collapsed.has(stage.id) ? 'false' : 'true',
      'aria-label': `Collapse or expand ${stage.label}`,
      title: `Collapse or expand ${stage.label}`,
    }, chevronIcon(!collapsed.has(stage.id)));

    const list = el('div', {
      class: 'col-list', role: 'list', dataset: { stage: stage.id },
      'aria-label': `${stage.label} leads`,
    }, stageLeads.map(cardNode));

    const empty = el('div', { class: 'col-empty', text: 'Nothing in here', hidden: stageLeads.length > 0 });
    list.appendChild(empty);

    const col = el('div', {
      class: `col${collapsed.has(stage.id) ? ' is-collapsed' : ''}`,
      dataset: { stage: stage.id },
    }, [
      el('div', { class: 'col-head' }, [
        el('span', { class: 'col-label', text: meta?.label || stage.label }),
        countEl,
        toggle,
      ]),
      list,
    ]);

    toggle.addEventListener('click', () => setCollapsed(stage.id, !collapsed.has(stage.id)));
    columns.set(stage.id, {
      col, list, countEl, empty, toggle,
      label: meta?.label || stage.label,
      serverCount: Number.isFinite(Number(meta?.count)) ? Number(meta.count) : null,
      truncated: Number.isFinite(Number(meta?.count)) && Number(meta.count) > stageLeads.length,
    });
    return col;
  }

  function refreshCounts({ fromServer = false } = {}) {
    for (const entry of columns.values()) {
      const all = [...entry.list.children].filter((child) => child.classList.contains('card'));
      const shown = all.filter((child) => !child.classList.contains('is-filtered'));
      if (!fromServer) entry.serverCount = null;        // the DOM is now the truth
      let label;
      if (query && shown.length !== all.length) label = `${shown.length}/${all.length}`;
      else if (fromServer && entry.serverCount !== null) label = String(entry.serverCount);
      else label = String(all.length);
      entry.countEl.textContent = label;
      entry.empty.hidden = shown.length > 0;
      entry.empty.textContent = query && all.length ? 'No match here' : 'Nothing in here';
      if (entry.truncated) entry.countEl.title = `${entry.serverCount ?? all.length} in this stage, showing ${all.length}`;
    }
  }

  const TOTAL_FIELDS = [
    ['leads', 'in the pipeline'], ['overdue', 'overdue'], ['due_today', 'due today'],
    ['booked', 'booked'], ['won', 'won'], ['never_contacted', 'never contacted'],
  ];

  /** Recount from the cards on screen, so an optimistic move updates the strip. */
  function renderTotals() {
    if (!totalsEl) return;
    const totals = {
      leads: 0, booked: 0, won: 0, overdue: 0, never_contacted: 0,
      due_today: payload?.totals?.due_today ?? 0,
    };
    for (const entry of columns.values()) {
      for (const node of entry.list.children) {
        if (!node.classList.contains('card')) continue;
        const lead = cardLead(node);
        totals.leads += 1;
        if (node.dataset.stage === 'booked') totals.booked += 1;
        if (node.dataset.stage === 'won') totals.won += 1;
        if (Number(lead.attempts) === 0) totals.never_contacted += 1;
        if (lead.is_overdue) totals.overdue += 1;
      }
    }
    clear(totalsEl);
    append(totalsEl, TOTAL_FIELDS.map(([key, label]) => el('span', {}, [
      el('b', { text: int(totals[key] ?? 0) }), ` ${label}`,
    ])));
  }

  function applyFilter({ fromServer = false } = {}) {
    const needle = query.trim().toLowerCase();
    for (const node of root.querySelectorAll('.card')) {
      if (!needle) { node.classList.remove('is-filtered'); continue; }
      const lead = cardLead(node);
      const haystack = [fullName(lead), lead.company, lead.role, lead.email, lead.phone, lead.source]
        .filter(Boolean).join(' ').toLowerCase();
      node.classList.toggle('is-filtered', !haystack.includes(needle));
    }
    refreshCounts({ fromServer });
  }

  /* --------------------------------------------------------------- render */

  function render() {
    closeStageMenu();
    clear(root);
    columns.clear();
    leads.clear();

    const totals = payload.totals || {};
    const stages = Array.isArray(payload.stages) ? payload.stages : [];

    append(root, el('div', { class: 'view-head' }, [
      el('div', {}, [
        el('span', { class: 'eyebrow', text: 'Pipeline' }),
        el('h1', { text: 'Board' }),
      ]),
    ]));

    totalsEl = el('div', { class: 'totals' }, TOTAL_FIELDS.map(([key, label]) => el('span', {}, [
      el('b', { text: int(totals[key] ?? 0) }), ` ${label}`,
    ])));

    append(root, el('div', { class: 'board-bar' }, [
      totalsEl,
      el('span', {
        class: 'board-hint',
        text: 'Drag by the grip, long-press on touch, or use the ⋮ menu on any card.',
      }),
    ]));

    const orderedStages = STAGES.map((stage) => {
      const match = stages.find((s) => s.id === stage.id);
      return { stage, meta: match || null, leads: match && Array.isArray(match.leads) ? match.leads : [] };
    });

    boardEl = el('div', { class: 'board' }, orderedStages.map(({ stage, leads: stageLeads, meta }) =>
      columnNode(stage, stageLeads, meta)));
    append(root, boardEl);

    if (!leads.size) {
      append(root, stateBlock({
        title: 'No leads in the pipeline yet',
        body: 'Once beehiiv subscribers land in the CRM they appear here. Run a beehiiv'
          + ' sync from the Dashboard to pull the back catalogue in.',
        actions: [el('button', { class: 'btn btn-primary', type: 'button', text: 'Open the dashboard', onClick: () => ctx.go('dashboard') })],
      }));
    }

    applyFilter({ fromServer: true });
    renderTotals();
  }

  async function fetchBoard({ soft }) {
    if (loading) return;
    loading = true;
    if (soft && payload) root.classList.add('is-stale');
    else if (!payload) { clear(root); append(root, skeleton(5)); }
    try {
      payload = await api.board();
      ctx.setBadge(payload.totals?.overdue ?? 0);
      render();
    } catch (err) {
      if (ctx.fatal(err)) return;
      clear(root);
      append(root, stateBlock({
        alert: true,
        title: 'The board did not load',
        body: err.message,
        actions: [el('button', { class: 'btn', type: 'button', text: 'Try again', onClick: () => fetchBoard({ soft: false }) })],
      }));
    } finally {
      loading = false;
      root.classList.remove('is-stale');
    }
  }

  return {
    root,
    load: () => fetchBoard({ soft: false }),
    refresh: () => fetchBoard({ soft: true }),
    onQuery(next) { query = next || ''; applyFilter(); },
    destroy() {
      closeStageMenu();
      cancelAnimationFrame(autoScrollFrame);
      window.removeEventListener('touchmove', blockTouchScroll);
      window.removeEventListener('keydown', onDragKey, true);
      if (drag) {
        drag.clone.remove();
        drag.slot.remove();
        drag = null;
        document.body.classList.remove('is-dragging');
      }
    },
  };
}
