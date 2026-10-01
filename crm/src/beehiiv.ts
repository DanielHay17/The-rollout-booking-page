/**
 * Subscriber backfill from the beehiiv API.
 *
 * The webhook keeps the CRM current from now on; this closes the ~200 lead gap
 * that built up before it existed, and acts as a self-heal if a webhook
 * delivery is ever lost. It runs hourly on cron and on demand from
 * /api/sync/beehiiv.
 *
 * It shares `upsertSubscriber` with the webhook, so the never-clobber-a-manual-
 * edit rule is identical in both paths by construction rather than by two
 * people remembering to keep two copies in step.
 */

import type { Env, BeehiivSyncResult } from './types';
import { errorMessage, isRecord } from './util';
import { subscriberInputFrom, upsertSubscriber } from './subscribers';

const PER_PAGE = 100;
/** Hard stop: 50 pages is 5000 subscribers, far beyond today's 296. */
const MAX_PAGES = 50;

interface PageShape {
  data: unknown[];
  totalPages: number | null;
}

function readPage(body: unknown): PageShape {
  if (!isRecord(body)) return { data: [], totalPages: null };
  const data = Array.isArray(body['data']) ? body['data'] : [];
  const rawTotal = body['total_pages'];
  const totalPages = typeof rawTotal === 'number' && Number.isFinite(rawTotal)
    ? Math.floor(rawTotal)
    : null;
  return { data, totalPages };
}

export async function syncBeehiiv(env: Env): Promise<BeehiivSyncResult> {
  const result: BeehiivSyncResult = { ok: false, created: 0, updated: 0, skipped: 0, errors: [] };

  const apiKey = env.BEEHIIV_API_KEY?.trim();
  if (!apiKey) {
    // Degrade, do not throw: the dashboard should say "beehiiv is not
    // connected", not show a 500 and leave the operator guessing.
    result.errors.push(
      'BEEHIIV_API_KEY is not configured. Run: wrangler secret put BEEHIIV_API_KEY',
    );
    return result;
  }
  const publicationId = env.BEEHIIV_PUBLICATION_ID?.trim();
  if (!publicationId) {
    result.errors.push('BEEHIIV_PUBLICATION_ID is not set in wrangler.jsonc vars');
    return result;
  }

  const startedAt = new Date().toISOString();
  let page = 1;
  let pagesFetched = 0;

  while (page <= MAX_PAGES) {
    const url = new URL(
      `https://api.beehiiv.com/v2/publications/${encodeURIComponent(publicationId)}/subscriptions`,
    );
    url.searchParams.set('limit', String(PER_PAGE));
    // beehiiv's documented parameter is `limit`; `per_page` is sent as well
    // because the two names have both been in circulation and an unknown query
    // parameter is ignored, while a missing one silently gives a short page.
    url.searchParams.set('per_page', String(PER_PAGE));
    url.searchParams.set('page', String(page));
    url.searchParams.append('expand[]', 'custom_fields');

    let body: unknown;
    try {
      const response = await fetch(url.toString(), {
        headers: {
          authorization: `Bearer ${apiKey}`,
          accept: 'application/json',
        },
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        result.errors.push(`beehiiv page ${page} returned ${response.status}: ${detail}`);
        break;
      }
      body = await response.json();
    } catch (err) {
      result.errors.push(`beehiiv page ${page} failed: ${errorMessage(err)}`);
      break;
    }

    const { data, totalPages } = readPage(body);
    pagesFetched += 1;

    for (const entry of data) {
      const input = subscriberInputFrom(entry);
      if (!input) {
        // A subscriber with no usable email cannot become a lead.
        result.skipped += 1;
        continue;
      }
      try {
        const upserted = await upsertSubscriber(env, input);
        if (upserted.outcome === 'created') result.created += 1;
        else result.updated += 1;
      } catch (err) {
        result.skipped += 1;
        if (result.errors.length < 25) {
          result.errors.push(`${input.email}: ${errorMessage(err)}`);
        }
      }
    }

    if (data.length === 0) break;
    if (totalPages !== null && page >= totalPages) break;
    if (totalPages === null && data.length < PER_PAGE) break;
    page += 1;
  }

  // A sync is only "ok" if nothing went wrong; partial progress is still kept,
  // because half the missing leads is better than none.
  result.ok = result.errors.length === 0;

  await recordSyncState(env, 'beehiiv', {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    pages: pagesFetched,
    created: result.created,
    updated: result.updated,
    skipped: result.skipped,
    ok: result.ok,
    errors: result.errors.slice(0, 5),
  });

  return result;
}

/** Progress cursor / last-run record, so the UI can show "last synced ...". */
export async function recordSyncState(
  env: Env,
  key: string,
  value: unknown,
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO sync_state (key, value, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    )
      .bind(key, JSON.stringify(value).slice(0, 8000))
      .run();
  } catch {
    // Bookkeeping must never fail the sync it is describing.
  }
}
