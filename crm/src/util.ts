/**
 * Small shared helpers: JSON responses, safe parsing, ratio maths and the date
 * handling that the whole command center depends on.
 *
 * TIMEZONE POLICY — read this before changing any date code.
 *
 * Timestamps in the database are UTC (`datetime('now')`), exactly as API.md
 * says. But every CALENDAR concept the operator sees — "today", "overdue",
 * "last 30 days", one row of the daily report — is a day in *his* timezone,
 * Australia/Sydney (UTC+10/+11). Those two facts are not in conflict, they just
 * have to be converted between deliberately.
 *
 * It matters more than it looks. A Sydney working day (09:00-18:00 local) is
 * 22:00-07:00 UTC, which straddles two UTC dates with most of it on the
 * EARLIER one. A daily report bucketed on UTC dates would file Monday's calls
 * under Sunday. So:
 *
 *   - calendar inputs/outputs (`from`, `to`, `date`, `next_action_at`) are
 *     Sydney calendar dates, `YYYY-MM-DD`;
 *   - a window is turned into a half-open UTC timestamp range with
 *     `windowToUtcRange()` and compared in SQL against stored UTC timestamps;
 *   - a stored UTC timestamp is turned back into the day it belongs to with
 *     `stampToLocalDate()`.
 *
 * DST is handled by asking Intl for the real offset at that instant rather than
 * hardcoding +10 or +11 — Sydney flips on 2026-10-04, inside the default
 * 30-day window, so a hardcoded offset would be wrong within days.
 */

/** The operator's timezone. Every calendar day in this API is a day here. */
export const OPERATOR_TZ = 'Australia/Sydney';

// --------------------------------------------------------------- responses --

export function json(body: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set('content-type', 'application/json; charset=utf-8');
  if (!headers.has('cache-control')) headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(body), { status, headers });
}

export function badRequest(error: string, detail?: string): Response {
  return json(detail === undefined ? { error } : { error, detail }, 400);
}

export function notFound(error = 'Not found'): Response {
  return json({ error }, 404);
}

export function methodNotAllowed(allow: string[]): Response {
  return json({ error: 'method not allowed' }, 405, { allow: allow.join(', ') });
}

export function serverError(detail: string): Response {
  return json({ error: 'server error', detail }, 500);
}

// ------------------------------------------------------------- comparisons --

/**
 * Compares two secrets without leaking where they first differ.
 *
 * Uses the runtime's `crypto.subtle.timingSafeEqual` when it exists (it does on
 * workerd) and otherwise a branch-free XOR accumulation. An empty or missing
 * expected secret NEVER compares equal, so an unconfigured webhook secret
 * cannot be satisfied by sending an empty header.
 */
export function secretEquals(provided: string | null, expected: string | undefined): boolean {
  if (!expected || !provided) return false;

  const enc = new TextEncoder();
  const a = enc.encode(provided);
  const b = enc.encode(expected);

  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (x: ArrayBufferView, y: ArrayBufferView) => boolean;
  };
  if (a.byteLength === b.byteLength && typeof subtle.timingSafeEqual === 'function') {
    return subtle.timingSafeEqual(a, b);
  }

  // Length is not secret; the contents are.
  let diff = a.byteLength ^ b.byteLength;
  const n = Math.max(a.byteLength, b.byteLength);
  for (let i = 0; i < n; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

// ------------------------------------------------------------------ parsing --

/** `""` and whitespace-only become `null`; everything else is trimmed. */
export function blankToNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** Reads a non-negative integer, rejecting `NaN`, floats, `Infinity` and junk. */
export function safeInt(value: unknown, opts?: { min?: number; max?: number }): number | null {
  let n: number;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && value.trim() !== '') n = Number(value);
  else return null;

  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  if (opts?.min !== undefined && n < opts.min) return null;
  if (opts?.max !== undefined && n > opts.max) return null;
  return n;
}

/** Reads a finite number (used for `board_rank`, which is a SQLite REAL). */
export function safeFloat(value: unknown): number | null {
  let n: number;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && value.trim() !== '') n = Number(value);
  else return null;
  return Number.isFinite(n) ? n : null;
}

/** Clamps a `limit` query parameter. */
export function clampLimit(raw: string | null, fallback: number, max: number): number {
  const n = safeInt(raw, { min: 1, max });
  return n ?? fallback;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads `body.a.b.c` without throwing on a missing level. */
export function pickString(source: unknown, ...paths: string[]): string | null {
  for (const path of paths) {
    let cursor: unknown = source;
    for (const key of path.split('.')) {
      if (!isRecord(cursor)) {
        cursor = undefined;
        break;
      }
      cursor = cursor[key];
    }
    if (typeof cursor === 'string') {
      const trimmed = cursor.trim();
      if (trimmed !== '') return trimmed;
    } else if (typeof cursor === 'number' && Number.isFinite(cursor)) {
      return String(cursor);
    }
  }
  return null;
}

/** Reads the first path that holds an object or an array. */
export function pickObject(source: unknown, ...paths: string[]): unknown {
  for (const path of paths) {
    let cursor: unknown = source;
    for (const key of path.split('.')) {
      if (!isRecord(cursor)) {
        cursor = undefined;
        break;
      }
      cursor = cursor[key];
    }
    if (isRecord(cursor) || Array.isArray(cursor)) return cursor;
  }
  return undefined;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'unknown error';
  }
}

// -------------------------------------------------------------------- maths --

/** Rounds a unitless ratio so JSON does not carry float noise. */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * A ratio, or `null` when the denominator is zero.
 * Never `0` for "no data", never `Infinity`. The UI renders `null` as an em dash.
 */
export function ratio(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  const v = numerator / denominator;
  return Number.isFinite(v) ? round4(v) : null;
}

/** Integer cents per unit, or `null` when there are no units. */
export function centsPer(totalCents: number, units: number): number | null {
  if (!units) return null;
  const v = totalCents / units;
  return Number.isFinite(v) ? Math.round(v) : null;
}

/**
 * A decimal money string from an ad platform to integer cents.
 *
 * `"205.51"` must become exactly `20551`. The rounding is load-bearing, not
 * decoration: `205.51 * 100` is `20551.000000000004` in IEEE 754, so a bare
 * truncation would lose a cent on most values.
 *
 * Known limit: a value with three or more decimals sitting exactly on a half
 * cent can round the "wrong" way, because `parseFloat('1.005') * 100` is
 * `100.49999999999999`. Meta reports spend to two decimals, so this cannot
 * arise from the only caller; if a source with finer precision is ever added,
 * parse the decimal string digit-wise instead of going through a float.
 */
export function moneyStringToCents(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value * 100) : 0;
  }
  if (typeof value !== 'string') return 0;
  const n = parseFloat(value.replace(/,/g, '').trim());
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

// --------------------------------------------------------------------- time --

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validates a `YYYY-MM-DD` string and checks it is a real calendar date. */
export function isCalendarDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** `YYYY-MM-DD HH:MM:SS`, UTC — the format every timestamp column uses. */
export function utcStamp(at: Date = new Date()): string {
  return at.toISOString().slice(0, 19).replace('T', ' ');
}

interface TzParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function tzParts(at: Date, tz: string): TzParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(at);

  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((p) => p.type === type);
    return found ? Number(found.value) : 0;
  };

  // Some ICU builds render midnight as hour 24 under hour12:false.
  const hour = read('hour') % 24;
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour,
    minute: read('minute'),
    second: read('second'),
  };
}

/** Minutes the timezone is ahead of UTC at a given instant (DST-aware). */
function tzOffsetMinutes(at: Date, tz: string): number {
  const p = tzParts(at, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/** The operator's current calendar date, `YYYY-MM-DD`. */
export function operatorToday(now: Date = new Date(), tz = OPERATOR_TZ): string {
  const p = tzParts(now, tz);
  const mm = String(p.month).padStart(2, '0');
  const dd = String(p.day).padStart(2, '0');
  return `${p.year}-${mm}-${dd}`;
}

/**
 * The UTC instant of a local wall-clock time in the operator's timezone.
 * Two passes, because the offset that applies depends on the instant you are
 * still trying to find (this is how every correct local->UTC conversion works).
 */
export function localToUtc(date: string, time = '00:00:00', tz = OPERATOR_TZ): Date {
  const naive = new Date(`${date}T${time}Z`);
  const firstGuess = new Date(naive.getTime() - tzOffsetMinutes(naive, tz) * 60000);
  const secondOffset = tzOffsetMinutes(firstGuess, tz);
  return new Date(naive.getTime() - secondOffset * 60000);
}

/**
 * A half-open UTC timestamp range `[start, end)` covering the operator's
 * calendar days `from..to` inclusive. Half-open so a day boundary cannot be
 * counted twice or dropped.
 */
export function windowToUtcRange(from: string, to: string): { start: string; end: string } {
  return {
    start: utcStamp(localToUtc(from, '00:00:00')),
    end: utcStamp(localToUtc(addDays(to, 1), '00:00:00')),
  };
}

/** Which of the operator's calendar days a stored timestamp belongs to. */
export function stampToLocalDate(stamp: string | null, tz = OPERATOR_TZ): string | null {
  const normalised = normaliseStamp(stamp);
  if (!normalised) return null;
  // A date-only value is already a calendar date; converting it would shift it.
  if (normalised.length <= 10) return normalised.slice(0, 10);
  const at = new Date(`${normalised.replace(' ', 'T')}Z`);
  if (Number.isNaN(at.getTime())) return null;
  return operatorToday(at, tz);
}

/**
 * Coerces the shapes a timestamp column can actually hold in this database
 * (`2026-09-30 10:00:00`, `2026-09-30T10:00:00Z`, `2026-09-30`) into a
 * lexically-comparable `YYYY-MM-DD HH:MM:SS`. Returns `null` for anything that
 * does not start with a calendar date, so a stray epoch number is ignored
 * rather than silently mis-sorted.
 */
export function normaliseStamp(stamp: unknown): string | null {
  if (typeof stamp === 'number' && Number.isFinite(stamp)) {
    // beehiiv hands out unix seconds; be tolerant of milliseconds too.
    const ms = stamp > 1e11 ? stamp : stamp * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : utcStamp(d);
  }
  if (typeof stamp !== 'string') return null;
  const cleaned = stamp.trim().replace('T', ' ').replace(/Z$/i, '').replace(/\.\d+$/, '');
  if (cleaned === '') return null;
  // beehiiv's `created` is unix seconds, and JSON sometimes carries it as a
  // string. Route it back through the numeric branch instead of losing it.
  if (/^\d{9,13}$/.test(cleaned)) return normaliseStamp(Number(cleaned));
  if (!DATE_RE.test(cleaned.slice(0, 10))) {
    // Last resort: a fully-formed date string in some other shape.
    const d = new Date(stamp);
    return Number.isNaN(d.getTime()) ? null : utcStamp(d);
  }
  return cleaned.slice(0, 19);
}

/**
 * The same coercion as `normaliseStamp`, expressed in SQL, so timestamp
 * comparisons inside a query are correct for legacy rows that were written with
 * an ISO `T` separator. Without it `'2026-09-01T05:00:00Z' > '2026-09-01 13:00'`
 * compares true, because `'T'` sorts above `' '`.
 *
 * `column` MUST be a literal column or expression written in this source file —
 * never a value that came from a request. Request values are always bound.
 */
export function tsExpr(column: string): string {
  return `substr(replace(replace(${column}, 'T', ' '), 'Z', ''), 1, 19)`;
}

/** `YYYY-MM-DD` plus/minus whole days, using UTC arithmetic so DST cannot bite. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Inclusive day count between two calendar dates. */
export function daysInclusive(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.floor((b - a) / 86400000) + 1;
}

/**
 * Every calendar day from `from` to `to` inclusive. This is the spine the daily
 * report is zero-filled against, which is why it is generated here in
 * TypeScript instead of with a recursive CTE: the chart must have no gaps even
 * for days where nothing at all happened, and SQL can only return days that
 * exist in the data.
 */
export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  let cursor = from;
  // Hard stop so a silly window cannot spin forever.
  for (let i = 0; i < 1000 && cursor <= to; i += 1) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

export interface Window {
  from: string;
  to: string;
  days: number;
}

export const MAX_WINDOW_DAYS = 400;

/**
 * Reads `?from=&to=`, defaulting to the last 30 operator-days inclusive.
 * Returns a `Response` instead of throwing when the parameters are unusable.
 */
export function parseWindow(url: URL, now: Date = new Date()): Window | Response {
  const rawFrom = url.searchParams.get('from');
  const rawTo = url.searchParams.get('to');

  const today = operatorToday(now);
  const to = rawTo && rawTo !== '' ? rawTo : today;

  // `to` is validated BEFORE it is used to derive the default `from`, and the
  // order is load-bearing. `addDays` ends in `toISOString()`, which throws
  // RangeError on an Invalid Date, so deriving `from` from an unvalidated `to`
  // turned `?to=garbage` into a 500 "server error" instead of this 400.
  if (!isCalendarDate(to)) return badRequest('bad to', 'expected YYYY-MM-DD');

  const from = rawFrom && rawFrom !== '' ? rawFrom : addDays(to, -29);
  if (!isCalendarDate(from)) return badRequest('bad from', 'expected YYYY-MM-DD');
  if (from > to) return badRequest('bad window', 'from is after to');

  const days = daysInclusive(from, to);
  if (days > MAX_WINDOW_DAYS) {
    return badRequest('bad window', `at most ${MAX_WINDOW_DAYS} days`);
  }
  return { from, to, days };
}

export function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

/**
 * Escapes a user-supplied search term for a SQL `LIKE ... ESCAPE '\'` clause,
 * so typing `%` searches for a percent sign instead of matching everything.
 */
export function likeTerm(raw: string): string {
  const escaped = raw.replace(/[\\%_]/g, (c) => `\\${c}`);
  return `%${escaped}%`;
}

/**
 * Reduces a phone number to its national significant number: digits only, with
 * an Australian country code (`61`) or trunk prefix (`0`) removed.
 *
 * This is what makes phone search actually work. Every Australian writes their
 * own mobile as `0412 345 678`, but beehiiv hands many of them over as
 * `+61 412 345 678`. Matching on digits alone fails, because `0412345` does not
 * appear anywhere inside `61412345678` — there is no `0` before the `412`. So
 * typing a number straight off a missed call used to return nothing at all,
 * which reads as "that lead isn't in the CRM" rather than as a bug.
 *
 * Both sides of the comparison must be reduced the same way, hence the matching
 * SQL in `phoneDigitsExpr`. Keep the two in step.
 */
export function phoneSearchDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('61')) return digits.slice(2);
  if (digits.startsWith('0')) return digits.slice(1);
  return digits;
}

/** The SQL counterpart of `phoneSearchDigits`, applied to a phone column. */
export function phoneDigitsExpr(column: string): string {
  // SQLite has no regex, so the separators are stripped by nesting replace().
  // '+' must be in this list: leaving it in was the original bug.
  const digits = [" ", "-", "(", ")", "+", ".", "/"].reduce(
    (acc, ch) => `replace(${acc}, '${ch}', '')`,
    `COALESCE(${column}, '')`,
  );
  return `CASE
            WHEN ${digits} LIKE '61%' THEN substr(${digits}, 3)
            WHEN ${digits} LIKE '0%'  THEN substr(${digits}, 2)
            ELSE ${digits}
          END`;
}
