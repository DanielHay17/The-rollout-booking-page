// The only place that talks to the Worker. Paths and field names follow API.md.

export class ApiError extends Error {
  constructor(status, payload, fallback) {
    const detail = payload && typeof payload === 'object'
      ? [payload.error, payload.detail].filter(Boolean).join(': ')
      : '';
    super(detail || fallback || `Request failed (${status})`);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }

  /** Cloudflare Access said no, or the signed-in identity is not allowlisted. */
  get isAuth() { return this.status === 401 || this.status === 403; }
  get isMisconfigured() { return this.status === 503; }
  get isNotFound() { return this.status === 404; }
}

function qs(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value === null || value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

async function request(method, path, body) {
  const init = {
    method,
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(path, init);
  } catch (cause) {
    const err = new ApiError(0, null, 'Could not reach the server. Check the connection and try again.');
    err.cause = cause;
    throw err;
  }

  const type = res.headers.get('content-type') || '';
  if (!type.includes('json')) {
    // Access intercepts with an HTML login page rather than a JSON error.
    if (res.status === 401 || res.status === 403 || res.ok) {
      throw new ApiError(res.ok ? 401 : res.status, { error: 'locked' },
        'Cloudflare Access did not let this request through.');
    }
    throw new ApiError(res.status, null, `The server returned ${res.status}.`);
  }

  let payload = null;
  try { payload = await res.json(); } catch { payload = null; }
  if (!res.ok) throw new ApiError(res.status, payload);
  return payload;
}

export const api = {
  me: () => request('GET', '/api/me'),
  health: () => request('GET', '/api/health'),

  board: () => request('GET', '/api/board'),
  queue: () => request('GET', '/api/queue'),

  leads: (params) => request('GET', `/api/leads${qs(params)}`),
  lead: (id) => request('GET', `/api/leads/${encodeURIComponent(id)}`),
  patchLead: (id, patch) => request('PATCH', `/api/leads/${encodeURIComponent(id)}`, patch),
  setStage: (id, move) => request('POST', `/api/leads/${encodeURIComponent(id)}/stage`, move),
  logCall: (id, entry) => request('POST', `/api/leads/${encodeURIComponent(id)}/calls`, entry),
  createDeal: (id, deal) => request('POST', `/api/leads/${encodeURIComponent(id)}/deals`, deal),
  updateDeal: (dealId, deal) => request('PATCH', `/api/deals/${encodeURIComponent(dealId)}`, deal),

  summary: (range) => request('GET', `/api/metrics/summary${qs(range)}`),
  daily: (range) => request('GET', `/api/metrics/daily${qs(range)}`),
  campaigns: (range) => request('GET', `/api/campaigns${qs(range)}`),

  syncBeehiiv: () => request('POST', '/api/sync/beehiiv'),
  syncMeta: () => request('POST', '/api/sync/meta'),
};
