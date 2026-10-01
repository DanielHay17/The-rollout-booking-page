/**
 * rollout-crm — the Worker entry point.
 *
 * One Worker owns everything: `/api/*` is the CRM API, every other path serves
 * the single-page app so a client-side route survives a refresh, and
 * `scheduled()` runs the two syncs that keep the numbers current.
 *
 * Route table, matching API.md exactly:
 *
 *   PUBLIC
 *     GET    /api/health
 *     POST   /api/webhooks/beehiiv        (shared secret, not Access)
 *   BEHIND CLOUDFLARE ACCESS + THE EMAIL ALLOWLIST
 *     GET    /api/me
 *     GET    /api/board
 *     GET    /api/leads
 *     GET    /api/leads/:id
 *     PATCH  /api/leads/:id
 *     POST   /api/leads/:id/stage
 *     POST   /api/leads/:id/calls
 *     POST   /api/leads/:id/deals
 *     PATCH  /api/deals/:id
 *     GET    /api/queue
 *     GET    /api/metrics/summary
 *     GET    /api/metrics/daily
 *     GET    /api/campaigns
 *     POST   /api/sync/beehiiv
 *     POST   /api/sync/meta
 */

import type { Env } from './types';
import { verifyAccess } from './access';
import {
  json, notFound, badRequest, methodNotAllowed, serverError, safeInt,
  parseWindow, isResponse, errorMessage,
} from './util';
import {
  getBoard, listLeads, getLeadDetail, patchLead, moveStage, logContact,
  createDeal, patchDeal, getQueue,
} from './leads';
import { getSummary, getDaily, healthCounts } from './metrics';
import { getCampaigns } from './campaigns';
import { handleBeehiivWebhook } from './webhook';
import { syncBeehiiv } from './beehiiv';
import { syncMeta } from './meta';

/** Cron expressions from wrangler.jsonc, matched exactly. */
const CRON_BEEHIIV = '7 * * * *';
const CRON_META = '23 */3 * * *';

/** The trailing window the Meta cron re-reads, for late attribution fixes. */
const META_CRON_DAYS = 7;
/** A manual Meta sync covers the whole default dashboard window. */
const META_MANUAL_DAYS = 30;

const BAD_JSON = Symbol('bad-json');

async function readJsonBody(request: Request): Promise<unknown | typeof BAD_JSON> {
  const raw = await request.text();
  if (raw.trim() === '') return {};
  try {
    return JSON.parse(raw);
  } catch {
    return BAD_JSON;
  }
}

/**
 * Non-API paths serve index.html.
 *
 * Real files in public/ are matched by the assets binding before the Worker
 * even runs (`not_found_handling: "none"` in wrangler.jsonc), so arriving here
 * means the path is a client-side route — /board, /lead/42 — and the app has to
 * boot and read the URL itself.
 */
async function serveApp(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return methodNotAllowed(['GET', 'HEAD']);
  }

  const indexRequest = new Request(new URL('/index.html', url.origin).toString(), {
    method: 'GET',
    headers: request.headers,
  });
  const response = await env.ASSETS.fetch(indexRequest);

  if (response.status === 404) {
    // No front end deployed yet (public/ is empty until the UI ships).
    return new Response('rollout-crm: no index.html in public/ yet', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  // The shell must not be cached, or a deploy leaves stale JavaScript pointing
  // at an API that has moved on. The hashed assets it pulls in can cache.
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'no-cache');
  return new Response(request.method === 'HEAD' ? null : response.body, {
    status: response.status,
    headers,
  });
}

async function handleApi(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  url: URL,
): Promise<Response> {
  const segments = url.pathname.split('/').filter((part) => part !== '');
  const method = request.method.toUpperCase();
  const rest = segments.slice(1);

  // ---------------------------------------------------------- public routes --

  if (rest.length === 1 && rest[0] === 'health') {
    if (method !== 'GET') return methodNotAllowed(['GET']);
    // Deliberately says nothing about secrets or configuration: this is the one
    // endpoint anybody on the internet can reach.
    return json({ ok: true, version: env.APP_VERSION, db: await healthCounts(env) });
  }

  if (rest.length === 2 && rest[0] === 'webhooks' && rest[1] === 'beehiiv') {
    if (method !== 'POST') return methodNotAllowed(['POST']);
    return handleBeehiivWebhook(request, env);
  }

  // ------------------------------------------------- everything else is shut --

  const access = await verifyAccess(request, env, ctx);
  if (!access.ok) return access.response;
  const actor = access.identity.email;

  if (rest.length === 1 && rest[0] === 'me') {
    if (method !== 'GET') return methodNotAllowed(['GET']);
    return json({ email: actor });
  }

  if (rest.length === 1 && rest[0] === 'board') {
    if (method !== 'GET') return methodNotAllowed(['GET']);
    return getBoard(env);
  }

  if (rest.length === 1 && rest[0] === 'queue') {
    if (method !== 'GET') return methodNotAllowed(['GET']);
    return getQueue(env);
  }

  if (rest.length === 1 && rest[0] === 'campaigns') {
    if (method !== 'GET') return methodNotAllowed(['GET']);
    const win = parseWindow(url);
    if (isResponse(win)) return win;
    return getCampaigns(env, win);
  }

  if (rest.length === 2 && rest[0] === 'metrics') {
    if (method !== 'GET') return methodNotAllowed(['GET']);
    const win = parseWindow(url);
    if (isResponse(win)) return win;
    if (rest[1] === 'summary') return getSummary(env, win);
    if (rest[1] === 'daily') return getDaily(env, win);
    return notFound('Unknown endpoint');
  }

  if (rest.length === 2 && rest[0] === 'sync') {
    if (method !== 'POST') return methodNotAllowed(['POST']);
    if (rest[1] === 'beehiiv') {
      return json(await syncBeehiiv(env));
    }
    if (rest[1] === 'meta') {
      const requested = safeInt(url.searchParams.get('days'), { min: 1, max: 90 });
      return json(await syncMeta(env, requested ?? META_MANUAL_DAYS));
    }
    return notFound('Unknown endpoint');
  }

  // ---------------------------------------------------------------- leads ----

  if (rest[0] === 'leads') {
    if (rest.length === 1) {
      if (method !== 'GET') return methodNotAllowed(['GET']);
      return listLeads(env, url);
    }

    const id = safeInt(rest[1], { min: 1 });
    if (id === null) return badRequest('bad id', 'expected a numeric lead id');

    if (rest.length === 2) {
      if (method === 'GET') return getLeadDetail(env, id);
      if (method === 'PATCH') {
        const body = await readJsonBody(request);
        if (body === BAD_JSON) return badRequest('bad body', 'expected JSON');
        return patchLead(env, id, body, actor);
      }
      return methodNotAllowed(['GET', 'PATCH']);
    }

    if (rest.length === 3) {
      if (method !== 'POST') return methodNotAllowed(['POST']);
      const body = await readJsonBody(request);
      if (body === BAD_JSON) return badRequest('bad body', 'expected JSON');
      if (rest[2] === 'stage') return moveStage(env, id, body, actor);
      if (rest[2] === 'calls') return logContact(env, id, body, actor);
      if (rest[2] === 'deals') return createDeal(env, id, body, actor);
    }

    return notFound('Unknown endpoint');
  }

  // ---------------------------------------------------------------- deals ----

  if (rest[0] === 'deals' && rest.length === 2) {
    if (method !== 'PATCH') return methodNotAllowed(['PATCH']);
    const dealId = safeInt(rest[1], { min: 1 });
    if (dealId === null) return badRequest('bad id', 'expected a numeric deal id');
    const body = await readJsonBody(request);
    if (body === BAD_JSON) return badRequest('bad body', 'expected JSON');
    return patchDeal(env, dealId, body, actor);
  }

  // An unknown /api path answers in JSON, never with the HTML app shell: a
  // fetch() that got HTML back where it expected JSON is a miserable debug.
  return notFound('Unknown endpoint');
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, ctx, url);
      } catch (err) {
        console.error('api error', url.pathname, errorMessage(err));
        return serverError(errorMessage(err));
      }
    }

    return serveApp(request, env, url);
  },

  /**
   * Two crons, routed by expression. Each is wrapped on its own so a beehiiv
   * outage cannot stop the Meta spend sync (and the reverse), which is exactly
   * the failure that would otherwise silently freeze CAC.
   */
  async scheduled(event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const runBeehiiv = event.cron === CRON_BEEHIIV || event.cron === '';
    const runMeta = event.cron === CRON_META || event.cron === '';
    // An unrecognised expression runs both rather than nothing: a renamed cron
    // should degrade to "sync too often", not to "stopped syncing in silence".
    const unknown = !runBeehiiv && !runMeta;

    if (runBeehiiv || unknown) {
      try {
        const result = await syncBeehiiv(env);
        console.log('cron beehiiv', JSON.stringify(result));
      } catch (err) {
        console.error('cron beehiiv failed', errorMessage(err));
      }
    }

    if (runMeta || unknown) {
      try {
        const result = await syncMeta(env, META_CRON_DAYS);
        console.log('cron meta', JSON.stringify(result));
      } catch (err) {
        console.error('cron meta failed', errorMessage(err));
      }
    }
  },
} satisfies ExportedHandler<Env>;
