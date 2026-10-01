/**
 * Meta campaign spend ingestion — the denominator under every cost number on
 * the dashboard.
 *
 * Runs every three hours on cron over a TRAILING WINDOW, not just yesterday.
 * Meta revises recent figures as late conversions and billing adjustments land,
 * so re-reading the last week and overwriting is how the numbers end up right.
 * That is only safe because the write is an upsert keyed on
 * (campaign_id, date): re-running it is idempotent.
 *
 * THE RULE WHEN META IS DOWN: a failed sync must never destroy good data. There
 * is deliberately no DELETE anywhere in this file. If the token has expired or
 * Graph returns a 500, the previously synced spend stays exactly where it is,
 * the error comes back in the response, and the dashboard keeps showing the
 * last known truth instead of a day of fake zeroes that would make CAC look
 * wonderful.
 */

import type { Env, MetaSyncResult } from './types';
import {
  errorMessage, isRecord, moneyStringToCents, operatorToday, addDays, isCalendarDate, safeInt,
} from './util';
import { recordSyncState } from './beehiiv';

/** Page cap, so a wide window cannot spin against Graph forever. */
const MAX_PAGES = 25;

interface CampaignMeta {
  id: string;
  name: string;
  status: string | null;
  objective: string | null;
}

interface SpendRow {
  campaignId: string;
  date: string;
  spendCents: number;
  impressions: number;
  clicks: number;
  results: number | null;
}

function graphBase(env: Env): string {
  const version = env.META_API_VERSION?.trim() || 'v21.0';
  return `https://graph.facebook.com/${version}`;
}

function accountPath(env: Env): string {
  const account = env.META_AD_ACCOUNT_ID?.trim() ?? '';
  // Tolerate the id being stored either bare or already prefixed.
  return account.startsWith('act_') ? account : `act_${account}`;
}

async function graphFetch(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    // Graph puts a usable explanation in error.message; surface it rather than
    // just the status code, because "token expired" and "rate limited" need
    // completely different responses from a human.
    const message = isRecord(parsed) && isRecord(parsed['error'])
      ? String(parsed['error']['message'] ?? '')
      : text.slice(0, 300);
    throw new Error(`Meta ${response.status}: ${message || 'request failed'}`);
  }
  return parsed;
}

function nextPage(body: unknown): string | null {
  if (!isRecord(body)) return null;
  const paging = body['paging'];
  if (!isRecord(paging)) return null;
  const next = paging['next'];
  return typeof next === 'string' && next !== '' ? next : null;
}

function dataOf(body: unknown): unknown[] {
  if (!isRecord(body)) return [];
  return Array.isArray(body['data']) ? body['data'] : [];
}

/** Campaign names, objectives and on/off state. Insights do not carry these. */
async function fetchCampaignMeta(env: Env, token: string): Promise<Map<string, CampaignMeta>> {
  const out = new Map<string, CampaignMeta>();
  const first = new URL(`${graphBase(env)}/${accountPath(env)}/campaigns`);
  first.searchParams.set('fields', 'id,name,status,objective');
  first.searchParams.set('limit', '200');
  first.searchParams.set('access_token', token);

  let url: string | null = first.toString();
  for (let page = 0; page < MAX_PAGES && url; page += 1) {
    const body: unknown = await graphFetch(url);
    for (const entry of dataOf(body)) {
      if (!isRecord(entry)) continue;
      const id = typeof entry['id'] === 'string' ? entry['id'] : null;
      if (!id) continue;
      out.set(id, {
        id,
        name: typeof entry['name'] === 'string' ? entry['name'] : id,
        status: typeof entry['status'] === 'string' ? entry['status'] : null,
        objective: typeof entry['objective'] === 'string' ? entry['objective'] : null,
      });
    }
    url = nextPage(body);
  }
  return out;
}

/**
 * Lead conversions out of the `actions` array.
 *
 * Meta reports several overlapping lead-ish action types for one real lead
 * (`lead`, `offsite_conversion.fb_pixel_lead`, `onsite_conversion.lead_grouped`
 * ...), so SUMMING them double counts. Prefer the plain `lead` aggregate when
 * it is present and otherwise take the LARGEST single lead-type count, which is
 * the closest available stand-in.
 *
 * Returns `null`, not `0`, when Meta reported no lead actions at all: "no
 * conversions were attributed" and "zero people converted" are different
 * claims, and `campaign_spend.results` is nullable precisely so the difference
 * survives into the cost-per-lead column.
 */
export function leadResultsFrom(actions: unknown): number | null {
  if (!Array.isArray(actions)) return null;
  let exact: number | null = null;
  let largest: number | null = null;

  for (const entry of actions) {
    if (!isRecord(entry)) continue;
    const type = typeof entry['action_type'] === 'string' ? entry['action_type'] : '';
    if (!type.toLowerCase().includes('lead')) continue;
    const value = Number(entry['value']);
    if (!Number.isFinite(value)) continue;
    const rounded = Math.round(value);
    if (type === 'lead') exact = rounded;
    largest = largest === null ? rounded : Math.max(largest, rounded);
  }
  return exact ?? largest;
}

async function fetchInsights(
  env: Env,
  token: string,
  since: string,
  until: string,
): Promise<{ rows: SpendRow[]; names: Map<string, string> }> {
  const rows: SpendRow[] = [];
  const names = new Map<string, string>();

  const first = new URL(`${graphBase(env)}/${accountPath(env)}/insights`);
  first.searchParams.set('level', 'campaign');
  first.searchParams.set('time_increment', '1');
  first.searchParams.set('fields', 'campaign_id,campaign_name,spend,impressions,clicks,actions');
  first.searchParams.set('time_range', JSON.stringify({ since, until }));
  first.searchParams.set('limit', '500');
  first.searchParams.set('access_token', token);

  let url: string | null = first.toString();
  for (let page = 0; page < MAX_PAGES && url; page += 1) {
    const body: unknown = await graphFetch(url);
    for (const entry of dataOf(body)) {
      if (!isRecord(entry)) continue;
      const campaignId = typeof entry['campaign_id'] === 'string' ? entry['campaign_id'] : null;
      // With time_increment=1 each row is one campaign-day.
      const date = typeof entry['date_start'] === 'string' ? entry['date_start'] : null;
      if (!campaignId || !date || !isCalendarDate(date)) continue;

      if (typeof entry['campaign_name'] === 'string' && entry['campaign_name'] !== '') {
        names.set(campaignId, entry['campaign_name']);
      }

      rows.push({
        campaignId,
        date,
        // "205.51" must land as exactly 20551 cents.
        spendCents: moneyStringToCents(entry['spend']),
        impressions: safeInt(entry['impressions'], { min: 0 }) ?? 0,
        clicks: safeInt(entry['clicks'], { min: 0 }) ?? 0,
        results: leadResultsFrom(entry['actions']),
      });
    }
    url = nextPage(body);
  }

  return { rows, names };
}

/**
 * @param days how many trailing days to re-read. The cron passes 7 so that late
 *             attribution corrections are picked up instead of being frozen in
 *             whatever they looked like the first time we asked.
 */
export async function syncMeta(env: Env, days = 7): Promise<MetaSyncResult> {
  const result: MetaSyncResult = { ok: false, campaigns: 0, days: 0, errors: [] };

  const token = env.META_ACCESS_TOKEN?.trim();
  if (!token) {
    result.errors.push(
      'META_ACCESS_TOKEN is not configured. Run: wrangler secret put META_ACCESS_TOKEN',
    );
    return result;
  }
  if (!env.META_AD_ACCOUNT_ID?.trim()) {
    result.errors.push('META_AD_ACCOUNT_ID is not set in wrangler.jsonc vars');
    return result;
  }

  const until = operatorToday();
  const since = addDays(until, -(Math.max(1, Math.min(days, 90)) - 1));

  // Campaign metadata is nice to have; spend is the point. If the metadata call
  // fails we carry on with names from the insights rows.
  let meta = new Map<string, CampaignMeta>();
  try {
    meta = await fetchCampaignMeta(env, token);
  } catch (err) {
    result.errors.push(`campaign metadata: ${errorMessage(err)}`);
  }

  let rows: SpendRow[] = [];
  let names = new Map<string, string>();
  try {
    const insights = await fetchInsights(env, token, since, until);
    rows = insights.rows;
    names = insights.names;
  } catch (err) {
    result.errors.push(`insights: ${errorMessage(err)}`);
    // Nothing is written, and crucially nothing is deleted either: the spend
    // already in the table is still the best information we have.
    await recordSyncState(env, 'meta', {
      finished_at: new Date().toISOString(),
      since,
      until,
      ok: false,
      errors: result.errors.slice(0, 5),
    });
    return result;
  }

  // Every campaign we learned about from either call, so a campaign that is
  // paused (and therefore missing from an ACTIVE-only view) still gets its
  // spend recorded.
  const campaignIds = new Set<string>([...meta.keys(), ...rows.map((row) => row.campaignId)]);
  const accountId = accountPath(env).replace(/^act_/, '');

  const campaignStatements = [...campaignIds].map((id) => {
    const known = meta.get(id);
    return env.DB.prepare(
      `INSERT INTO campaigns (id, platform, account_id, name, objective, status)
       VALUES (?, 'meta', ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name        = excluded.name,
         objective   = COALESCE(excluded.objective, campaigns.objective),
         status      = COALESCE(excluded.status, campaigns.status),
         account_id  = COALESCE(excluded.account_id, campaigns.account_id),
         last_seen_at = datetime('now')`,
    ).bind(
      id,
      accountId,
      known?.name ?? names.get(id) ?? id,
      known?.objective ?? null,
      known?.status ?? null,
    );
  });

  try {
    // Campaigns first: campaign_spend has a foreign key onto them.
    for (let i = 0; i < campaignStatements.length; i += 50) {
      const chunk = campaignStatements.slice(i, i + 50);
      if (chunk.length > 0) await env.DB.batch(chunk);
    }
    result.campaigns = campaignIds.size;
  } catch (err) {
    result.errors.push(`campaign upsert: ${errorMessage(err)}`);
    return result;
  }

  const spendStatements = rows.map((row) =>
    env.DB.prepare(
      `INSERT INTO campaign_spend
         (campaign_id, date, spend_cents, impressions, clicks, results, currency, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, 'AUD', datetime('now'))
       ON CONFLICT(campaign_id, date) DO UPDATE SET
         spend_cents = excluded.spend_cents,
         impressions = excluded.impressions,
         clicks      = excluded.clicks,
         results     = excluded.results,
         currency    = excluded.currency,
         synced_at   = datetime('now')`,
    ).bind(
      row.campaignId,
      row.date,
      row.spendCents,
      row.impressions,
      row.clicks,
      row.results,
    ),
  );

  try {
    for (let i = 0; i < spendStatements.length; i += 50) {
      const chunk = spendStatements.slice(i, i + 50);
      if (chunk.length > 0) await env.DB.batch(chunk);
    }
  } catch (err) {
    result.errors.push(`spend upsert: ${errorMessage(err)}`);
    return result;
  }

  result.days = new Set(rows.map((row) => row.date)).size;
  result.ok = result.errors.length === 0;

  await recordSyncState(env, 'meta', {
    finished_at: new Date().toISOString(),
    since,
    until,
    campaigns: result.campaigns,
    days: result.days,
    spend_rows: rows.length,
    ok: result.ok,
    errors: result.errors.slice(0, 5),
  });

  return result;
}
