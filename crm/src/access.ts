/**
 * Cloudflare Access verification plus the email allowlist.
 *
 * ================== DO NOT MAKE THIS FAIL OPEN ==================
 * If ACCESS_TEAM_DOMAIN or ALLOWED_EMAILS is missing or empty this module
 * returns 503, it does NOT let the request through. An unset allowlist means
 * "nobody is allowed", never "everybody is allowed".
 *
 * This is written down because it is exactly the kind of thing a later edit
 * breaks: someone adds a local-dev convenience like
 *     if (!env.ALLOWED_EMAILS) return { ok: true, email: 'dev@local' }
 * and the whole CRM — every lead's name, phone number and survey answer — is
 * then public to anyone who finds the hostname. Access is in front of this
 * Worker, but the Worker must not depend on that being true. If you need a dev
 * bypass, put a real email in ALLOWED_EMAILS in `.dev.vars` instead.
 * ================================================================
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Env } from './types';
import { errorMessage, json } from './util';

export interface Identity {
  email: string;
}

export type AccessResult = { ok: true; identity: Identity } | { ok: false; response: Response };

const LOCKED = { error: 'locked' } as const;
const NOT_ALLOWED = { error: 'not allowed' } as const;

function misconfigured(detail: string): Response {
  return json({ error: 'misconfigured', detail }, 503);
}

/**
 * One JWKS per team domain, cached in module scope so `jose` can reuse the
 * fetched signing keys across requests on the same isolate instead of hitting
 * Cloudflare's certs endpoint on every API call.
 */
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwksFor(teamDomain: string): ReturnType<typeof createRemoteJWKSet> {
  const cached = jwksCache.get(teamDomain);
  if (cached) return cached;
  const created = createRemoteJWKSet(
    new URL(`https://${teamDomain}/cdn-cgi/access/certs`),
    { cacheMaxAge: 10 * 60 * 1000 },
  );
  jwksCache.set(teamDomain, created);
  return created;
}

/** Strips a scheme or trailing slash someone may have pasted into the secret. */
function normaliseTeamDomain(raw: string): string {
  return raw.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

/**
 * The optional Workers Access binding. Modelled structurally rather than with
 * `any`, because it is only present on some accounts and we must not crash when
 * it is absent.
 */
interface AccessIdentityBinding {
  getIdentity(): Promise<unknown>;
}

function accessBindingOf(candidate: unknown): AccessIdentityBinding | null {
  if (typeof candidate !== 'object' || candidate === null) return null;
  const maybe = (candidate as { access?: unknown }).access;
  if (typeof maybe !== 'object' || maybe === null) return null;
  const getIdentity = (maybe as { getIdentity?: unknown }).getIdentity;
  if (typeof getIdentity !== 'function') return null;
  return maybe as AccessIdentityBinding;
}

function emailFromIdentity(identity: unknown): string | null {
  if (typeof identity !== 'object' || identity === null) return null;
  const record = identity as Record<string, unknown>;
  const direct = record['email'];
  if (typeof direct === 'string' && direct.includes('@')) return direct;
  // Some shapes nest it one level down.
  const nested = record['identity'];
  if (typeof nested === 'object' && nested !== null) {
    const inner = (nested as Record<string, unknown>)['email'];
    if (typeof inner === 'string' && inner.includes('@')) return inner;
  }
  return null;
}

/** The allowlist, lower-cased. An empty list is a configuration error. */
export function allowlist(env: Env): string[] {
  return (env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== '');
}

/**
 * Pulls the Access JWT off the request.
 *
 * `cf-access-jwt-assertion` is the header Access injects. The `CF_Authorization`
 * cookie carries the same token for a browser session; accepting it as a
 * fallback cannot weaken anything because it is verified by exactly the same
 * code path.
 */
function tokenFrom(request: Request): string | null {
  const header = request.headers.get('cf-access-jwt-assertion');
  if (header && header.trim() !== '') return header.trim();

  const cookie = request.headers.get('cookie');
  if (!cookie) return null;
  for (const part of cookie.split(';')) {
    const [rawName, ...rest] = part.split('=');
    if (rawName === undefined) continue;
    if (rawName.trim() !== 'CF_Authorization') continue;
    const value = rest.join('=').trim();
    if (value !== '') return value;
  }
  return null;
}

/**
 * Verifies the caller and checks the allowlist.
 *
 * @param ctx the Worker's ExecutionContext, which on some accounts also carries
 *            the Access binding as `ctx.access`.
 */
export async function verifyAccess(
  request: Request,
  env: Env,
  ctx?: unknown,
): Promise<AccessResult> {
  const teamDomainRaw = env.ACCESS_TEAM_DOMAIN ?? '';
  const allowed = allowlist(env);

  // Fail closed on missing configuration, naming the variable at fault.
  if (allowed.length === 0) {
    return {
      ok: false,
      response: misconfigured('ALLOWED_EMAILS is not set; refusing to allow anyone in'),
    };
  }
  if (normaliseTeamDomain(teamDomainRaw) === '') {
    return {
      ok: false,
      response: misconfigured('ACCESS_TEAM_DOMAIN is not set; cannot verify an Access token'),
    };
  }
  const teamDomain = normaliseTeamDomain(teamDomainRaw);

  let email: string | null = null;

  const token = tokenFrom(request);
  if (token) {
    const issuer = `https://${teamDomain}`;
    // ACCESS_AUD pins the token to ONE Access application. Without it, a token
    // minted for any other application in the same Cloudflare team verifies
    // here too, and only the email allowlist stands between that token and
    // every lead's phone number. Set it.
    const audience = env.ACCESS_AUD?.trim();
    try {
      const { payload } = await jwtVerify(token, jwksFor(teamDomain), {
        issuer,
        ...(audience ? { audience } : {}),
      });
      email = emailFromIdentity(payload);
    } catch (err) {
      // A present but unverifiable token is a locked door, not a 500. The
      // reason is logged because "why am I locked out" is otherwise
      // undiagnosable from the outside: a bad signature, an expired token and
      // a failed fetch of the certs endpoint all look identical to the caller.
      console.warn('access: jwt rejected:', errorMessage(err));
      return { ok: false, response: json(LOCKED, 401) };
    }
  }

  // Fallback for accounts where Access is wired in as a Worker binding rather
  // than as an edge application injecting the assertion header.
  if (!email) {
    const binding = accessBindingOf(ctx) ?? accessBindingOf(env);
    if (binding) {
      try {
        email = emailFromIdentity(await binding.getIdentity());
      } catch {
        email = null;
      }
    }
  }

  if (!email) return { ok: false, response: json(LOCKED, 401) };

  const normalised = email.trim().toLowerCase();
  if (!allowed.includes(normalised)) {
    return { ok: false, response: json(NOT_ALLOWED, 403) };
  }

  return { ok: true, identity: { email: normalised } };
}
