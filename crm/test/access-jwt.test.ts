/**
 * The real Cloudflare Access JWT path, end to end.
 *
 * A throwaway RSA key pair is minted per run and the team's certs endpoint is
 * mocked, so these tests verify the thing production actually depends on: the
 * signature, the issuer, and — the one that is easy to get wrong — the
 * `ACCESS_AUD` pin. Without that pin a token minted for ANY other Access
 * application in the same Cloudflare team verifies here too, and only the email
 * allowlist stands between that token and every lead's phone number.
 *
 * No real key, token or team domain appears in this file.
 */

import { fetchMock } from 'cloudflare:test';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import type { JWK, KeyLike } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OPERATOR, OUTSIDER, callJson, insertLead } from './helpers';

const TEAM_DOMAIN = 'rollout-test.cloudflareaccess.test';
const ISSUER = `https://${TEAM_DOMAIN}`;
const AUD = 'test-access-aud-placeholder';
const KID = 'test-signing-key';

let privateKey: KeyLike | CryptoKey;
let otherPrivateKey: KeyLike | CryptoKey;

interface ClaimOverrides {
  email?: string | null;
  issuer?: string;
  audience?: string;
  expiresIn?: number;
  key?: KeyLike | CryptoKey;
  kid?: string;
}

async function mintToken(overrides: ClaimOverrides = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = overrides.expiresIn ?? 3600;
  const claims: Record<string, unknown> = {
    sub: 'test-subject',
    identity_nonce: 'test-nonce',
  };
  if (overrides.email !== null) claims['email'] = overrides.email ?? OPERATOR;

  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: overrides.kid ?? KID })
    .setIssuer(overrides.issuer ?? ISSUER)
    .setAudience(overrides.audience ?? AUD)
    .setIssuedAt(now - 60)
    .setExpirationTime(now + expiresIn)
    .sign(overrides.key ?? privateKey);
}

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true });
  const other = await generateKeyPair('RS256', { extractable: true });
  privateKey = pair.privateKey;
  otherPrivateKey = other.privateKey;

  const jwk = (await exportJWK(pair.publicKey)) as JWK;
  const jwks = JSON.stringify({ keys: [{ ...jwk, kid: KID, alg: 'RS256', use: 'sig' }] });

  // Nothing in this suite may reach the real internet.
  fetchMock.activate();
  fetchMock.disableNetConnect();
  fetchMock
    .get(ISSUER)
    .intercept({ path: '/cdn-cgi/access/certs', method: 'GET' })
    .reply(200, jwks, { headers: { 'content-type': 'application/json' } })
    .persist();
});

afterAll(() => {
  fetchMock.deactivate();
});

beforeEach(async () => {
  await insertLead({
    email: 'jwt.fixture@example.test',
    first_name: 'Fixture',
    phone: '+61491570158',
    status: 'new',
    board_rank: 1000,
  });
});

describe('a valid Access token', () => {
  it('is accepted when the email is allowlisted', async () => {
    const token = await mintToken();
    const res = await callJson<{ email: string }>('/api/me', {
      headers: { 'cf-access-jwt-assertion': token },
    });
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(OPERATOR);
  });

  it('is accepted from the CF_Authorization cookie as well as the header', async () => {
    const token = await mintToken();
    const res = await callJson<{ email: string }>('/api/me', {
      headers: { cookie: `someother=1; CF_Authorization=${token}; trailing=2` },
    });
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(OPERATOR);
  });

  it('is 403, not 200, when the verified email is not allowlisted', async () => {
    const token = await mintToken({ email: OUTSIDER });
    const res = await callJson('/api/board', {
      headers: { 'cf-access-jwt-assertion': token },
    });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'not allowed' });
    expect(res.text).not.toContain('+61491570158');
  });

  it('is 401 when the token carries no email claim', async () => {
    const token = await mintToken({ email: null });
    const res = await callJson('/api/board', {
      headers: { 'cf-access-jwt-assertion': token },
    });
    expect(res.status).toBe(401);
    expect(res.text).not.toContain('+61491570158');
  });
});

describe('an invalid Access token is 401, never a pass', () => {
  it('rejects a token minted for a different Access application (wrong aud)', async () => {
    // This is the ACCESS_AUD pin. A token from any other application in the
    // same Cloudflare team must not open this one.
    const token = await mintToken({ audience: 'some-other-access-application' });
    const res = await callJson('/api/board', {
      headers: { 'cf-access-jwt-assertion': token },
    });
    expect(res.status).toBe(401);
    expect(res.text).not.toContain('+61491570158');
  });

  it('rejects a token from another team domain (wrong iss)', async () => {
    const token = await mintToken({ issuer: 'https://someone-else.cloudflareaccess.test' });
    const res = await callJson('/api/board', {
      headers: { 'cf-access-jwt-assertion': token },
    });
    expect(res.status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const token = await mintToken({ expiresIn: -120 });
    const res = await callJson('/api/board', {
      headers: { 'cf-access-jwt-assertion': token },
    });
    expect(res.status).toBe(401);
  });

  it('rejects a token signed by a key the team does not publish', async () => {
    const token = await mintToken({ key: otherPrivateKey });
    const res = await callJson('/api/board', {
      headers: { 'cf-access-jwt-assertion': token },
    });
    expect(res.status).toBe(401);
  });

  it('rejects an unsigned ("alg: none") token', async () => {
    const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const payload = btoa(JSON.stringify({
      iss: ISSUER, aud: AUD, email: OPERATOR, exp: Math.floor(Date.now() / 1000) + 3600,
    })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const res = await callJson('/api/board', {
      headers: { 'cf-access-jwt-assertion': `${header}.${payload}.` },
    });
    expect(res.status).toBe(401);
  });

  it('a present-but-bad token does not fall back to the Access binding', async () => {
    // A rejected token is a locked door. It must not be retried as though no
    // token had been presented at all.
    const token = await mintToken({ key: otherPrivateKey });
    const res = await callJson('/api/board', {
      as: OPERATOR,
      headers: { 'cf-access-jwt-assertion': token },
    });
    expect(res.status).toBe(401);
  });
});

describe('ACCESS_AUD', () => {
  it('with the pin removed, any audience in the team verifies — which is why it is set', async () => {
    // Documents the actual consequence of leaving ACCESS_AUD unset, so nobody
    // removes it believing it to be decorative. With no pin the token from
    // another application is accepted and only the allowlist is left.
    const token = await mintToken({ audience: 'some-other-access-application' });
    const pinned = await callJson('/api/me', {
      headers: { 'cf-access-jwt-assertion': token },
    });
    expect(pinned.status).toBe(401);

    const unpinned = await callJson('/api/me', {
      headers: { 'cf-access-jwt-assertion': token },
      env: { ACCESS_AUD: undefined },
    });
    expect(unpinned.status).toBe(200);
  });
});
