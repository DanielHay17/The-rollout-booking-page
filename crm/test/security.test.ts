/**
 * The most important tests in the suite.
 *
 * Everything else here protects a number being right. These protect every
 * lead's name, phone number and survey answer from being readable by anyone who
 * finds the hostname. If one of these ever goes red, nothing else matters until
 * it is green again.
 *
 * The shape of the disaster being guarded against is specific and it is written
 * down in access.ts: somebody adds a local-dev convenience like
 *     if (!env.ALLOWED_EMAILS) return { ok: true, email: 'dev@local' }
 * and the whole CRM is public. So these tests do not merely check a status
 * code — they also assert that the seeded lead's phone number does not appear
 * anywhere in the response body.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  OPERATOR, OUTSIDER, PROTECTED_ROUTES, WEBHOOK_SECRET,
  call, callJson, countRows, insertCall, insertLead,
} from './helpers';

/** Values that must never appear in a response the caller was not entitled to. */
const SECRET_PHONE = '+61491570157';
const SECRET_EMAIL = 'private.lead@example.test';
const SECRET_SURVEY = 'wants help automating quote follow-ups';

beforeEach(async () => {
  const id = await insertLead({
    email: SECRET_EMAIL,
    first_name: 'Private',
    last_name: 'Lead',
    phone: SECRET_PHONE,
    company: 'Confidential Pty Ltd',
    survey_help: SECRET_SURVEY,
    status: 'engaged',
    board_rank: 1000,
    subscribed_at: '2026-09-20 02:00:00',
    source: 'fb paid',
  });
  await insertCall({ lead_id: id, channel: 'call', outcome: 'connected' });
});

/** No lead data of any kind leaked into this payload. */
function leaksNothing(text: string): void {
  expect(text).not.toContain(SECRET_PHONE);
  expect(text).not.toContain(SECRET_EMAIL);
  expect(text).not.toContain(SECRET_SURVEY);
  expect(text).not.toContain('Confidential Pty Ltd');
}

describe('anonymous requests are locked out', () => {
  it('GET /api/board with no Access credentials is 401, not 200', async () => {
    const res = await callJson('/api/board');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'locked' });
    leaksNothing(res.text);
  });

  it.each(PROTECTED_ROUTES)('$method $path is 401 without credentials', async ({ method, path }) => {
    const res = await callJson(path, {
      method,
      body: method === 'GET' ? undefined : {},
    });
    expect(res.status).toBe(401);
    leaksNothing(res.text);
  });

  it('a malformed Access token is 401, not a 500 and not a pass', async () => {
    const res = await callJson('/api/board', {
      headers: { 'cf-access-jwt-assertion': 'not.a.jwt' },
    });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'locked' });
    leaksNothing(res.text);
  });

  it('an Access token in the CF_Authorization cookie is verified, not trusted', async () => {
    const res = await callJson('/api/board', {
      headers: { cookie: `CF_Authorization=not.a.jwt; other=x` },
    });
    expect(res.status).toBe(401);
    leaksNothing(res.text);
  });
});

describe('fail closed on missing configuration', () => {
  // This is the fail-closed guarantee. If it ever regresses, every lead's
  // phone number is public. 503 means "refusing to decide", which is the only
  // safe answer; 200 would be a breach and 401 would hide a real outage.
  it('an unset ALLOWED_EMAILS is 503 and does not let the request through', async () => {
    const res = await callJson<{ error: string; detail: string }>('/api/board', {
      as: OPERATOR,
      env: { ALLOWED_EMAILS: undefined },
    });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('misconfigured');
    expect(res.body.detail).toContain('ALLOWED_EMAILS');
    leaksNothing(res.text);
    // Belt and braces: not merely "no secret phone number", but no board at all.
    expect(res.text).not.toContain('"stages"');
    expect(res.text).not.toContain('"leads"');
  });

  it.each([
    ['empty string', ''],
    ['commas only', ',,,'],
    ['commas and whitespace only', ' , ,\t,\n'],
    ['a single comma', ','],
  ])('ALLOWED_EMAILS that is %s is 503, never a wildcard', async (_label, value) => {
    const res = await callJson<{ error: string }>('/api/board', {
      as: OPERATOR,
      env: { ALLOWED_EMAILS: value },
    });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('misconfigured');
    leaksNothing(res.text);
  });

  it('a missing allowlist locks out an anonymous caller too', async () => {
    const res = await callJson('/api/board', { env: { ALLOWED_EMAILS: undefined } });
    expect([401, 503]).toContain(res.status);
    expect(res.status).not.toBe(200);
    leaksNothing(res.text);
  });

  it('an unset ACCESS_TEAM_DOMAIN is 503, not an unverified pass', async () => {
    const res = await callJson<{ error: string; detail: string }>('/api/board', {
      as: OPERATOR,
      env: { ACCESS_TEAM_DOMAIN: undefined },
    });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('misconfigured');
    expect(res.body.detail).toContain('ACCESS_TEAM_DOMAIN');
    leaksNothing(res.text);
  });

  it('the 503 names the variable but never prints the allowlist itself', async () => {
    const res = await callJson('/api/board', {
      as: OPERATOR,
      env: { ALLOWED_EMAILS: '' },
    });
    expect(res.text).not.toContain(OPERATOR);
    expect(res.text).not.toContain('example.test');
  });

  it('every protected route fails closed, not just the board', async () => {
    for (const { method, path } of PROTECTED_ROUTES) {
      const res = await callJson(path, {
        method,
        as: OPERATOR,
        body: method === 'GET' ? undefined : {},
        env: { ALLOWED_EMAILS: undefined },
      });
      expect(res.status, `${method} ${path}`).toBe(503);
    }
  });
});

describe('the allowlist', () => {
  it('a verified identity that is not allowlisted gets 403', async () => {
    const res = await callJson('/api/board', { as: OUTSIDER });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'not allowed' });
    leaksNothing(res.text);
  });

  it('an allowlisted identity gets through', async () => {
    const res = await callJson<{ stages: unknown[] }>('/api/board', { as: OPERATOR });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.stages)).toBe(true);
    // The whole point of the allowlist is that this caller DOES see the data.
    expect(res.text).toContain(SECRET_PHONE);
  });

  it('matches case-insensitively and ignores surrounding whitespace', async () => {
    const res = await callJson('/api/me', {
      as: ' OPERATOR@Example.Test ',
      env: { ALLOWED_EMAILS: ' operator@example.test , other@example.test ' },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ email: OPERATOR });
  });

  it('does not match a prefix, a suffix or a lookalike domain', async () => {
    for (const impostor of [
      'operator@example.test.evil.test',
      'notoperator@example.test',
      'operator@example.tes',
      'operator@example.test ',
    ]) {
      const res = await callJson('/api/board', {
        as: impostor,
        env: { ALLOWED_EMAILS: 'operator@example.test' },
      });
      const expected = impostor.trim() === 'operator@example.test' ? 200 : 403;
      expect(res.status, impostor).toBe(expected);
    }
  });
});

describe('the beehiiv webhook secret', () => {
  const payload = {
    id: 'sub_security_probe',
    email: 'probe@example.test',
    custom_fields: [{ name: 'first_name', value: 'Probe' }],
  };

  it('rejects a missing X-Rollout-Secret', async () => {
    const before = await countRows('leads');
    const res = await callJson('/api/webhooks/beehiiv', { method: 'POST', body: payload });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'locked' });
    expect(await countRows('leads')).toBe(before);
    expect(await countRows('webhook_deliveries')).toBe(0);
  });

  it('rejects a wrong X-Rollout-Secret and writes nothing', async () => {
    const before = await countRows('leads');
    const res = await callJson('/api/webhooks/beehiiv', {
      method: 'POST',
      body: payload,
      headers: { 'x-rollout-secret': 'definitely-not-the-secret' },
    });
    expect(res.status).toBe(401);
    expect(await countRows('leads')).toBe(before);
    expect(await countRows('webhook_deliveries')).toBe(0);
  });

  it('rejects a secret that is a prefix of the real one', async () => {
    const res = await call('/api/webhooks/beehiiv', {
      method: 'POST',
      body: payload,
      headers: { 'x-rollout-secret': WEBHOOK_SECRET.slice(0, -1) },
    });
    expect(res.status).toBe(401);
  });

  it('an empty header never satisfies an unset secret', async () => {
    // Both halves matter: an unconfigured secret must not be satisfiable, and
    // the answer must not be 200.
    const res = await callJson('/api/webhooks/beehiiv', {
      method: 'POST',
      body: payload,
      headers: { 'x-rollout-secret': '' },
      env: { BEEHIIV_WEBHOOK_SECRET: undefined },
    });
    expect(res.status).toBe(503);
    expect(await countRows('leads', "email = 'probe@example.test'")).toBe(0);
  });

  it('accepts the right secret', async () => {
    const res = await callJson<{ ok: boolean; outcome: string }>('/api/webhooks/beehiiv', {
      method: 'POST',
      body: payload,
      headers: { 'x-rollout-secret': WEBHOOK_SECRET },
    });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('created');
  });

  it('the webhook is not a back door into reading leads', async () => {
    const res = await call('/api/webhooks/beehiiv', {
      method: 'POST',
      body: payload,
      headers: { 'x-rollout-secret': WEBHOOK_SECRET },
    });
    const text = await res.text();
    leaksNothing(text);
  });
});

describe('GET /api/health', () => {
  it('is reachable with no credentials', async () => {
    const res = await callJson<{ ok: boolean; version: string; db: { leads: number; calls: number } }>(
      '/api/health',
    );
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.db.leads).toBe(1);
    expect(res.body.db.calls).toBe(1);
  });

  it('leaks no configuration', async () => {
    const res = await callJson<Record<string, unknown>>('/api/health');

    // An exact key list, so adding a field to the one endpoint the whole
    // internet can reach is a deliberate decision rather than an accident.
    expect(Object.keys(res.body).sort()).toEqual(['db', 'ok', 'version']);
    expect(Object.keys(res.body['db'] as object).sort()).toEqual(['calls', 'leads']);

    for (const secret of [
      'test-webhook-secret-placeholder',
      'test-beehiiv-key-placeholder',
      'test-meta-token-placeholder',
      'test-access-aud-placeholder',
      'rollout-test.cloudflareaccess.test',
      'operator@example.test',
      'pub_',
      '1378462499217593',
    ]) {
      expect(res.text, `health leaked ${secret}`).not.toContain(secret);
    }
    leaksNothing(res.text);
  });

  it('still works when every secret is missing, and still says nothing', async () => {
    const res = await callJson('/api/health', {
      env: {
        ALLOWED_EMAILS: undefined,
        ACCESS_TEAM_DOMAIN: undefined,
        BEEHIIV_WEBHOOK_SECRET: undefined,
      },
    });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['db', 'ok', 'version']);
  });
});

describe('unknown /api paths', () => {
  it('answer in JSON rather than with the app shell', async () => {
    const res = await callJson('/api/not-a-real-endpoint', { as: OPERATOR });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Unknown endpoint' });
  });

  it('are still behind Access', async () => {
    const res = await callJson('/api/not-a-real-endpoint');
    expect(res.status).toBe(401);
  });
});
