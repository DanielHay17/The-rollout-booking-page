/**
 * Shared test plumbing.
 *
 * Tests drive the real Worker entry point (`src/index.ts`) with an explicitly
 * constructed `env`, which is what makes the fail-closed configuration tests
 * possible: a test can hand the Worker an env with `ALLOWED_EMAILS` genuinely
 * absent and watch what it does, without touching the pool's own bindings.
 *
 * A verified Cloudflare Access identity is simulated through the Access
 * binding that `verifyAccess` already supports (`ctx.access.getIdentity()`),
 * not by weakening anything: the allowlist check still runs in full, so a
 * request made `as` an address that is not on the allowlist is rejected exactly
 * as a real one would be. Tests that need the JWT path itself live in
 * `access-jwt.test.ts`, where a throwaway key pair is minted per run.
 */

import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../src/index';
import type { Env } from '../src/types';

export const ORIGIN = 'https://rollout-crm.test';

/** On the allowlist in vitest.config.ts. */
export const OPERATOR = 'operator@example.test';
/** A real, verified identity that is NOT on the allowlist. */
export const OUTSIDER = 'someone.else@example.test';

export const WEBHOOK_SECRET = 'test-webhook-secret-placeholder';

export type Bind = string | number | null;

export interface CallOptions {
  method?: string;
  /** Serialised as JSON unless it is already a string. */
  body?: unknown;
  headers?: Record<string, string>;
  /** The email a verified Access identity reports; omit for an anonymous request. */
  as?: string;
  /** Per-test env overrides. `undefined` genuinely unsets a binding. */
  env?: Record<string, unknown>;
}

/** Every route that must be behind Access + the allowlist, per API.md. */
export const PROTECTED_ROUTES: ReadonlyArray<{ method: string; path: string }> = [
  { method: 'GET', path: '/api/me' },
  { method: 'GET', path: '/api/board' },
  { method: 'GET', path: '/api/queue' },
  { method: 'GET', path: '/api/leads' },
  { method: 'GET', path: '/api/leads/1' },
  { method: 'PATCH', path: '/api/leads/1' },
  { method: 'POST', path: '/api/leads/1/stage' },
  { method: 'POST', path: '/api/leads/1/calls' },
  { method: 'POST', path: '/api/leads/1/deals' },
  { method: 'PATCH', path: '/api/deals/1' },
  { method: 'GET', path: '/api/metrics/summary' },
  { method: 'GET', path: '/api/metrics/daily' },
  { method: 'GET', path: '/api/campaigns' },
  { method: 'POST', path: '/api/sync/beehiiv' },
  { method: 'POST', path: '/api/sync/meta' },
];

export async function call(path: string, opts: CallOptions = {}): Promise<Response> {
  const headers = new Headers(opts.headers);
  let body: string | undefined;
  if (opts.body !== undefined) {
    body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  }

  const request = new Request(`${ORIGIN}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body,
  });

  const testEnv = { ...env, ...(opts.env ?? {}) } as unknown as Env;
  const ctx = createExecutionContext();
  if (opts.as !== undefined) {
    const email = opts.as;
    Object.assign(ctx, { access: { getIdentity: async () => ({ email }) } });
  }

  const response = await worker.fetch(request, testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

export interface JsonResponse<T> {
  status: number;
  /** The raw text, so a test can assert on what is NOT in the payload. */
  text: string;
  body: T;
}

export async function callJson<T = Record<string, unknown>>(
  path: string,
  opts: CallOptions = {},
): Promise<JsonResponse<T>> {
  const response = await call(path, opts);
  const text = await response.text();
  let body: T;
  try {
    body = JSON.parse(text) as T;
  } catch {
    throw new Error(`${path} did not return JSON (status ${response.status}): ${text.slice(0, 300)}`);
  }
  return { status: response.status, text, body };
}

// ----------------------------------------------------------------- seeding ---

function insert(table: string, fields: Record<string, Bind>): Promise<D1Result> {
  const cols = Object.keys(fields);
  if (cols.length === 0) throw new Error(`insert into ${table} with no columns`);
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
  return env.DB.prepare(sql)
    .bind(...cols.map((col) => fields[col] ?? null))
    .run();
}

async function insertReturningId(table: string, fields: Record<string, Bind>): Promise<number> {
  const result = await insert(table, fields);
  return Number(result.meta.last_row_id);
}

export function insertLead(fields: Record<string, Bind>): Promise<number> {
  return insertReturningId('leads', fields);
}

export function insertCall(fields: Record<string, Bind>): Promise<number> {
  return insertReturningId('calls', fields);
}

export function insertDeal(fields: Record<string, Bind>): Promise<number> {
  return insertReturningId('deals', fields);
}

export function insertEvent(fields: Record<string, Bind>): Promise<number> {
  return insertReturningId('lead_events', fields);
}

export async function insertCampaign(id: string, name: string): Promise<void> {
  await insert('campaigns', { id, name, platform: 'meta', status: 'ACTIVE' });
}

export async function insertSpend(
  campaignId: string,
  date: string,
  spendCents: number,
  extra: Record<string, Bind> = {},
): Promise<void> {
  await insert('campaign_spend', {
    campaign_id: campaignId,
    date,
    spend_cents: spendCents,
    ...extra,
  });
}

// ----------------------------------------------------------------- reading ---

export async function leadRow(id: number): Promise<Record<string, unknown> | null> {
  return env.DB.prepare('SELECT * FROM leads WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
}

export async function countRows(table: string, where = '', ...binds: Bind[]): Promise<number> {
  const sql = `SELECT COUNT(*) AS n FROM ${table}${where ? ` WHERE ${where}` : ''}`;
  const row = await env.DB.prepare(sql)
    .bind(...binds)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

/** The ids of a column, top to bottom, exactly as the board renders them. */
export async function columnOrder(stage: string): Promise<number[]> {
  const rows = await env.DB.prepare(
    `SELECT id FROM leads WHERE status = ?
      ORDER BY board_rank IS NULL, board_rank ASC, id ASC`,
  )
    .bind(stage)
    .all<{ id: number }>();
  return rows.results.map((row) => row.id);
}

export async function rankOf(id: number): Promise<number | null> {
  const row = await env.DB.prepare('SELECT board_rank FROM leads WHERE id = ?')
    .bind(id)
    .first<{ board_rank: number | null }>();
  return row?.board_rank ?? null;
}

export async function stageOf(id: number): Promise<string | null> {
  const row = await env.DB.prepare('SELECT status FROM leads WHERE id = ?')
    .bind(id)
    .first<{ status: string }>();
  return row?.status ?? null;
}

export async function stageChangesFor(id: number): Promise<Array<{ from: string | null; to: string | null }>> {
  const rows = await env.DB.prepare(
    `SELECT from_stage, to_stage FROM lead_events
      WHERE lead_id = ? AND type = 'stage_change' ORDER BY id ASC`,
  )
    .bind(id)
    .all<{ from_stage: string | null; to_stage: string | null }>();
  return rows.results.map((row) => ({ from: row.from_stage, to: row.to_stage }));
}
