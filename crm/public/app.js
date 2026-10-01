// The command center shell: hash routing, the search box, the global keyboard
// map and the one place that turns an Access failure into a readable screen.

import { api, ApiError } from './api.js';
import { el, clear, append, stateBlock } from './dom.js';
import { companyLine, fullName, int, stageLabel } from './format.js';
import { toast } from './toast.js';
import { createDrawer } from './drawer.js';
import { createTodayView } from './view-today.js';
import { createBoardView } from './view-board.js';
import { createDashboardView } from './view-dashboard.js';

const VIEWS = {
  today: { title: 'Today', create: createTodayView },
  board: { title: 'Board', create: createBoardView },
  dashboard: { title: 'Dashboard', create: createDashboardView },
};
const DEFAULT_VIEW = 'today';
const RANGES = [7, 30, 90];
const DEFAULT_RANGE = 30;

const mountEl = document.getElementById('view');
const tabsEl = document.getElementById('tabs');
const searchInput = document.getElementById('search');
const searchWrap = document.getElementById('search-wrap');
const resultsEl = document.getElementById('search-results');
const identityEl = document.getElementById('identity');
const footVersion = document.getElementById('foot-version');
const refreshBtn = document.getElementById('refresh');
const badgeEl = document.getElementById('tab-badge-today');

const state = { view: DEFAULT_VIEW, range: DEFAULT_RANGE, q: '', leadId: null };
let applied = { view: null, range: null, q: null, leadId: null };
const instances = new Map();
const staleViews = new Set();
let current = null;
let locked = false;

/* ------------------------------------------------------------------- hash */

function parseHash() {
  const raw = String(location.hash || '').replace(/^#\/?/, '');
  const [path, search] = raw.split('?');
  const params = new URLSearchParams(search || '');
  const rangeValue = Number(params.get('range'));
  const leadValue = Number(params.get('lead'));
  return {
    view: Object.prototype.hasOwnProperty.call(VIEWS, path) ? path : DEFAULT_VIEW,
    range: RANGES.includes(rangeValue) ? rangeValue : DEFAULT_RANGE,
    q: params.get('q') || '',
    leadId: Number.isFinite(leadValue) && leadValue > 0 ? leadValue : null,
  };
}

function buildHash(next) {
  const params = new URLSearchParams();
  if (next.view === 'dashboard' && next.range !== DEFAULT_RANGE) params.set('range', String(next.range));
  if (next.q) params.set('q', next.q);
  if (next.leadId) params.set('lead', String(next.leadId));
  const search = params.toString();
  return `#/${next.view}${search ? `?${search}` : ''}`;
}

function navigate(patch, { replace = false } = {}) {
  const next = { ...state, ...patch };
  const hash = buildHash(next);
  if (hash === location.hash) { apply(); return; }
  if (replace) {
    history.replaceState(null, '', hash);
    apply();
  } else {
    location.hash = hash;        // fires hashchange, which calls apply()
  }
}

/* ------------------------------------------------------------------ chrome */

function updateTabs() {
  for (const tab of tabsEl.querySelectorAll('.tab')) {
    tab.setAttribute('aria-selected', tab.dataset.view === state.view ? 'true' : 'false');
  }
  document.title = `${VIEWS[state.view].title} | The Rollout command center`;
}

function setBadge(count) {
  const n = Number(count) || 0;
  badgeEl.hidden = n <= 0;
  badgeEl.textContent = n > 0 ? String(n) : '';
  badgeEl.setAttribute('aria-label', `${n} overdue`);
}

function lockScreen({ title, body }) {
  locked = true;
  if (current) { current.destroy(); current.root.remove(); current = null; }
  instances.clear();
  drawer.close();
  clear(mountEl);
  append(mountEl, stateBlock({
    alert: true,
    title,
    body,
    actions: [
      el('button', {
        class: 'btn btn-primary', type: 'button', text: 'Reload',
        onClick: () => window.location.reload(),
      }),
    ],
  }));
  updateTabs();
}

/** Returns true when the error has been turned into a whole-screen message. */
function fatal(error) {
  if (!(error instanceof ApiError)) return false;
  if (error.status === 403) {
    lockScreen({
      title: 'This account is not on the allowlist',
      body: 'Cloudflare Access let you in, but this email is not in ALLOWED_EMAILS for the'
        + ' worker, so the API refused the request. Add it with `wrangler secret put'
        + ' ALLOWED_EMAILS`, then reload.',
    });
    return true;
  }
  if (error.status === 401) {
    lockScreen({
      title: 'Sign in through Cloudflare Access',
      body: 'This session is not authenticated. Open the site in a normal browser tab and'
        + ' complete the Cloudflare Access sign-in, then come back and reload.',
    });
    return true;
  }
  if (error.isMisconfigured) {
    lockScreen({
      title: 'The worker is missing configuration',
      body: `${error.message}. Set it as a secret with wrangler and redeploy — the API`
        + ' refuses to fail open, so nothing will load until it is set.',
    });
    return true;
  }
  return false;
}

/* -------------------------------------------------------------- the drawer */

const ctx = {
  state,
  notify: toast,
  fatal,
  go(view) { navigate({ view }); },
  setRange(range) { navigate({ range }); },
  setLead(leadId) {
    if ((state.leadId ?? null) === (leadId ?? null)) return;
    navigate({ leadId: leadId ?? null }, { replace: !leadId });
  },
  openLead(id) { navigate({ leadId: Number(id) }); },
  setBadge,
  onDataChanged() {
    for (const name of Object.keys(VIEWS)) {
      if (name !== state.view) staleViews.add(name);
    }
  },
};

const drawer = createDrawer(ctx);

/* --------------------------------------------------------------- view host */

function mountView(name) {
  if (current) current.root.remove();
  let instance = instances.get(name);
  const isNew = !instance;
  if (isNew) {
    instance = VIEWS[name].create(ctx);
    instances.set(name, instance);
  }
  current = instance;
  clear(mountEl);
  mountEl.classList.toggle('is-board', name === 'board');
  mountEl.appendChild(instance.root);
  if (isNew) instance.load();
  else if (staleViews.has(name)) { staleViews.delete(name); instance.refresh(); }
}

function apply() {
  const next = parseHash();
  Object.assign(state, next);
  if (locked) { updateTabs(); return; }

  if (next.view !== applied.view) mountView(next.view);
  else if (next.view === 'dashboard' && next.range !== applied.range && current) current.refresh();

  if (next.q !== applied.q) {
    if (searchInput.value !== next.q) searchInput.value = next.q;
    searchWrap.classList.toggle('has-q', Boolean(next.q));
    if (current && current.onQuery) current.onQuery(next.q);
  }

  if ((next.leadId ?? null) !== (applied.leadId ?? null)) {
    if (next.leadId) drawer.open(next.leadId);
    else drawer.close();
  }

  applied = { ...next };
  updateTabs();
}

/* ------------------------------------------------------------------ search */

let searchTimer = 0;
let searchSeq = 0;
let hits = [];

function hideResults() {
  resultsEl.hidden = true;
  clear(resultsEl);
  searchInput.setAttribute('aria-expanded', 'false');
  hits = [];
}

function renderResults(leads) {
  clear(resultsEl);
  hits = leads;
  if (!leads.length) {
    append(resultsEl, el('div', { class: 'search-empty', text: 'No lead matches that.' }));
  } else {
    append(resultsEl, leads.map((lead) => el('button', {
      class: 'search-hit', type: 'button', role: 'option', 'aria-selected': 'false',
      onClick: () => { hideResults(); ctx.openLead(lead.id); },
    }, [
      el('div', { class: 'search-hit-name', text: fullName(lead) }),
      el('div', {
        class: 'search-hit-sub',
        text: [companyLine(lead), stageLabel(lead.status), lead.phone].filter(Boolean).join(' · '),
      }),
    ])));
  }
  resultsEl.hidden = false;
  searchInput.setAttribute('aria-expanded', 'true');
}

async function runSearch(term) {
  const seq = ++searchSeq;
  try {
    const result = await api.leads({ q: term, limit: 12 });
    if (seq !== searchSeq) return;
    renderResults(Array.isArray(result.leads) ? result.leads : []);
  } catch (error) {
    if (seq !== searchSeq) return;
    if (fatal(error)) return;
    clear(resultsEl);
    append(resultsEl, el('div', { class: 'search-empty', text: error.message }));
    resultsEl.hidden = false;
  }
}

searchInput.addEventListener('input', () => {
  const term = searchInput.value.trim();
  searchWrap.classList.toggle('has-q', Boolean(searchInput.value));
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    navigate({ q: searchInput.value }, { replace: true });
    if (term.length >= 2) runSearch(term);
    else hideResults();
  }, 200);
});

searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    if (resultsEl.hidden && !searchInput.value) { searchInput.blur(); return; }
    searchInput.value = '';
    hideResults();
    navigate({ q: '' }, { replace: true });
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const first = resultsEl.querySelector('.search-hit');
    if (first) first.click();
    return;
  }
  if (event.key === 'ArrowDown') {
    const first = resultsEl.querySelector('.search-hit');
    if (first) { event.preventDefault(); first.focus(); }
  }
});

resultsEl.addEventListener('keydown', (event) => {
  const options = [...resultsEl.querySelectorAll('.search-hit')];
  const index = options.indexOf(document.activeElement);
  if (event.key === 'ArrowDown') { event.preventDefault(); options[Math.min(options.length - 1, index + 1)]?.focus(); }
  else if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (index <= 0) searchInput.focus();
    else options[index - 1].focus();
  } else if (event.key === 'Escape') { event.preventDefault(); hideResults(); searchInput.focus(); }
});

document.addEventListener('pointerdown', (event) => {
  if (!searchWrap.contains(event.target)) hideResults();
});

/* ---------------------------------------------------------------- keyboard */

function isTyping(target) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable
    || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && drawer.leadId !== null) {
    event.preventDefault();
    drawer.close();
    return;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (isTyping(event.target)) return;

  if (event.key === '/') { event.preventDefault(); searchInput.focus(); searchInput.select(); }
  else if (event.key === 'r' && current) { event.preventDefault(); current.refresh(); }
  else if (event.key === '1') { event.preventDefault(); ctx.go('today'); }
  else if (event.key === '2') { event.preventDefault(); ctx.go('board'); }
  else if (event.key === '3') { event.preventDefault(); ctx.go('dashboard'); }
});

tabsEl.addEventListener('click', (event) => {
  const tab = event.target.closest('.tab');
  if (tab) ctx.go(tab.dataset.view);
});

refreshBtn.addEventListener('click', () => {
  if (current) current.refresh();
  loadHealth();
});

window.addEventListener('hashchange', apply);

/* -------------------------------------------------------------------- boot */

async function loadHealth() {
  try {
    const health = await api.health();
    const parts = [`v${health.version || '?'}`];
    if (health.db) parts.push(`${int(health.db.leads)} leads`, `${int(health.db.calls)} contacts logged`);
    footVersion.textContent = `The Rollout command center · ${parts.join(' · ')}`;
  } catch {
    footVersion.textContent = 'The Rollout command center';
  }
}

async function boot() {
  try {
    const me = await api.me();
    identityEl.textContent = me.email || '';
    identityEl.title = me.email || '';
  } catch (error) {
    if (fatal(error)) return;
    toast(error.message || 'Could not confirm who you are signed in as.', { alert: true });
  }
  clear(mountEl);
  if (!location.hash) history.replaceState(null, '', buildHash(state));
  apply();
  loadHealth();
}

boot();
