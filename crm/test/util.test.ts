/**
 * The pure helpers in src/util.ts.
 *
 * These are unit tests rather than HTTP tests on purpose, and for one specific
 * reason: `JSON.stringify` turns both `NaN` and `Infinity` into `null`. So an
 * assertion made against a response body genuinely cannot tell "this ratio is
 * correctly null" from "this ratio is NaN and JSON hid it". The only place that
 * distinction can be tested is here, against the functions themselves.
 */

import { describe, expect, it } from 'vitest';
import {
  addDays, blankToNull, centsPer, daysInclusive, eachDate, isCalendarDate,
  likeTerm, moneyStringToCents, normaliseStamp, operatorToday, parseWindow,
  ratio, safeInt, secretEquals, stampToLocalDate, windowToUtcRange,
} from '../src/util';

describe('moneyStringToCents', () => {
  it('converts a two-decimal ad-platform string to exact cents', () => {
    // 205.51 * 100 is 20551.000000000004 in IEEE 754, so the rounding is
    // load-bearing: a bare truncation loses a cent on most values.
    expect(moneyStringToCents('205.51')).toBe(20551);
    expect(moneyStringToCents('0.07')).toBe(7);
  });

  it.each([
    ['367.70', 36770],
    ['367.7', 36770],
    ['0.01', 1],
    ['0.00', 0],
    ['0', 0],
    ['1.10', 110],
    ['12.34', 1234],
    ['99.99', 9999],
    ['1234.56', 123456],
    ['1,234.56', 123456],
    ['  8.25  ', 825],
  ])('converts %s to %d cents', (input, expected) => {
    expect(moneyStringToCents(input)).toBe(expected);
  });

  it('never returns a fractional cent', () => {
    for (let i = 0; i < 400; i += 1) {
      const value = (i / 100).toFixed(2);
      const cents = moneyStringToCents(value);
      expect(Number.isInteger(cents), value).toBe(true);
      expect(cents, value).toBe(i);
    }
  });

  it('accepts a number as well as a string', () => {
    expect(moneyStringToCents(205.51)).toBe(20551);
    expect(moneyStringToCents(0.07)).toBe(7);
  });

  it('treats junk as zero rather than NaN cents', () => {
    for (const junk of ['', '   ', 'abc', null, undefined, {}, [], NaN, Infinity]) {
      const cents = moneyStringToCents(junk);
      expect(cents, String(junk)).toBe(0);
      expect(Number.isNaN(cents)).toBe(false);
    }
  });

  it('sums without drifting, which is the reason cents are stored as integers', () => {
    const daily = ['12.34', '0.07', '205.51', '8.25', '0.01'];
    const total = daily.reduce((acc, v) => acc + moneyStringToCents(v), 0);
    expect(total).toBe(1234 + 7 + 20551 + 825 + 1);
    expect(Number.isInteger(total)).toBe(true);
  });
});

describe('ratio', () => {
  it('is null — not 0, not NaN, not Infinity — when the denominator is zero', () => {
    for (const numerator of [0, 1, 100, -5]) {
      const value = ratio(numerator, 0);
      expect(value, `ratio(${numerator}, 0)`).toBeNull();
      // Explicitly NOT the three wrong answers.
      expect(value).not.toBe(0);
      expect(Number.isNaN(value as number)).toBe(false);
      expect(value).not.toBe(Infinity);
    }
  });

  it('computes and rounds a real ratio', () => {
    expect(ratio(1, 2)).toBe(0.5);
    expect(ratio(2, 3)).toBe(0.6667);
    expect(ratio(300000, 100000)).toBe(3);
    expect(ratio(0, 5)).toBe(0);
  });
});

describe('centsPer', () => {
  it('is null — not 0, not NaN, not Infinity — when there are no units', () => {
    for (const total of [0, 1, 100000]) {
      const value = centsPer(total, 0);
      expect(value, `centsPer(${total}, 0)`).toBeNull();
      expect(value).not.toBe(0);
      expect(Number.isNaN(value as number)).toBe(false);
      expect(value).not.toBe(Infinity);
    }
  });

  it('returns whole cents', () => {
    expect(centsPer(100000, 4)).toBe(25000);
    expect(centsPer(100000, 3)).toBe(33333);
    expect(centsPer(100000, 2)).toBe(50000);
    expect(centsPer(100000, 7)).toBe(14286);
    expect(Number.isInteger(centsPer(100000, 7) as number)).toBe(true);
  });
});

describe('secretEquals', () => {
  it('never lets a missing or empty secret be satisfied', () => {
    expect(secretEquals('anything', undefined)).toBe(false);
    expect(secretEquals('anything', '')).toBe(false);
    expect(secretEquals('', '')).toBe(false);
    expect(secretEquals(null, 'the-secret')).toBe(false);
    expect(secretEquals('', 'the-secret')).toBe(false);
  });

  it('matches only an exact value', () => {
    expect(secretEquals('the-secret', 'the-secret')).toBe(true);
    expect(secretEquals('the-secre', 'the-secret')).toBe(false);
    expect(secretEquals('the-secret ', 'the-secret')).toBe(false);
    expect(secretEquals('The-Secret', 'the-secret')).toBe(false);
    expect(secretEquals('the-secretX', 'the-secret')).toBe(false);
  });
});

describe('calendar dates', () => {
  it('accepts real dates and rejects impossible ones', () => {
    expect(isCalendarDate('2026-10-01')).toBe(true);
    expect(isCalendarDate('2024-02-29')).toBe(true);
    for (const bad of ['2026-02-30', '2026-13-01', '2026-00-10', '2026-1-1', 'tomorrow', '', '2026-10-01T00:00:00Z']) {
      expect(isCalendarDate(bad), bad).toBe(false);
    }
  });

  it('adds and counts days', () => {
    expect(addDays('2026-10-01', 1)).toBe('2026-10-02');
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysInclusive('2026-10-01', '2026-10-01')).toBe(1);
    expect(daysInclusive('2026-09-01', '2026-09-30')).toBe(30);
    // Spans the Sydney DST change on 2026-10-04 — the count must not shift.
    expect(daysInclusive('2026-10-01', '2026-10-08')).toBe(8);
  });

  it('eachDate is inclusive at both ends and has no gaps', () => {
    expect(eachDate('2026-10-01', '2026-10-05')).toEqual([
      '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05',
    ]);
    expect(eachDate('2026-10-01', '2026-10-01')).toEqual(['2026-10-01']);
    expect(eachDate('2026-10-02', '2026-10-01')).toEqual([]);
    expect(eachDate('2026-09-01', '2026-09-30')).toHaveLength(30);
  });
});

describe('the Sydney timezone policy', () => {
  it('turns a calendar window into a half-open UTC range', () => {
    // Sydney is UTC+10 before 2026-10-04 and UTC+11 after, so this window
    // spans the DST change and the two ends have different offsets.
    expect(windowToUtcRange('2026-10-01', '2026-10-05')).toEqual({
      start: '2026-09-30 14:00:00',
      end: '2026-10-05 13:00:00',
    });
    expect(windowToUtcRange('2026-09-01', '2026-09-30')).toEqual({
      start: '2026-08-31 14:00:00',
      end: '2026-09-30 14:00:00',
    });
  });

  it('files a UTC timestamp under the Sydney day it belongs to', () => {
    // A Sydney working day (09:00-18:00 local) is 22:00-07:00 UTC and straddles
    // two UTC dates, with most of it on the EARLIER one. Bucketing on the UTC
    // date would file Thursday's calls under Wednesday.
    expect(stampToLocalDate('2026-09-30 13:59:59')).toBe('2026-09-30');
    expect(stampToLocalDate('2026-09-30 14:00:00')).toBe('2026-10-01');
    expect(stampToLocalDate('2026-09-30 23:00:00')).toBe('2026-10-01');
    expect(stampToLocalDate('2026-10-01 02:00:00')).toBe('2026-10-01');
    // After the DST change the boundary moves an hour earlier in UTC.
    expect(stampToLocalDate('2026-10-05 12:59:59')).toBe('2026-10-05');
    expect(stampToLocalDate('2026-10-05 13:00:00')).toBe('2026-10-06');
  });

  it('leaves a date-only value alone instead of shifting it', () => {
    expect(stampToLocalDate('2026-10-01')).toBe('2026-10-01');
    expect(stampToLocalDate(null)).toBeNull();
    expect(stampToLocalDate('')).toBeNull();
  });

  it('normalises every timestamp shape this database actually holds', () => {
    expect(normaliseStamp('2026-09-30 10:00:00')).toBe('2026-09-30 10:00:00');
    expect(normaliseStamp('2026-09-30T10:00:00Z')).toBe('2026-09-30 10:00:00');
    expect(normaliseStamp('2026-09-30T10:00:00.123Z')).toBe('2026-09-30 10:00:00');
    expect(normaliseStamp('2026-09-30')).toBe('2026-09-30');
    // beehiiv hands out unix seconds, sometimes as a string.
    const seconds = Math.floor(Date.parse('2026-09-20T02:00:00Z') / 1000);
    expect(normaliseStamp(seconds)).toBe('2026-09-20 02:00:00');
    expect(normaliseStamp(String(seconds))).toBe('2026-09-20 02:00:00');
    expect(normaliseStamp(seconds * 1000)).toBe('2026-09-20 02:00:00');
    expect(normaliseStamp(null)).toBeNull();
    expect(normaliseStamp('')).toBeNull();
  });

  it('operatorToday reports the Sydney date, not the UTC one', () => {
    // 2026-09-30 23:00 UTC is already 2026-10-01 in Sydney.
    expect(operatorToday(new Date('2026-09-30T23:00:00Z'))).toBe('2026-10-01');
    expect(operatorToday(new Date('2026-09-30T13:00:00Z'))).toBe('2026-09-30');
  });
});

describe('parseWindow', () => {
  const at = new Date('2026-10-01T02:00:00Z');

  function windowFor(query: string) {
    return parseWindow(new URL(`https://rollout-crm.test/api/metrics/summary${query}`), at);
  }

  it('defaults to the last 30 operator-days inclusive', () => {
    const win = windowFor('');
    expect(win).toEqual({ from: '2026-09-02', to: '2026-10-01', days: 30 });
  });

  it('reads an explicit window', () => {
    expect(windowFor('?from=2026-09-12&to=2026-10-01')).toEqual({
      from: '2026-09-12', to: '2026-10-01', days: 20,
    });
  });

  it('rejects junk and an inverted window with a 400 rather than guessing', () => {
    for (const query of [
      '?from=not-a-date',
      '?from=2026-13-40',
      '?from=2026-09-01&to=garbage',
      '?from=2026-10-02&to=2026-10-01',
      '?from=2020-01-01&to=2026-10-01',
      '?to=2026-02-30',
    ]) {
      const win = windowFor(query);
      expect(win instanceof Response, query).toBe(true);
      expect((win as Response).status, query).toBe(400);
    }
  });

  /**
   * KNOWN DEFECT in src/util.ts — parseWindow, around line 418.
   *
   *     const to   = rawTo   && rawTo   !== '' ? rawTo : today;
   *     const from = rawFrom && rawFrom !== '' ? rawFrom : addDays(to, -29);
   *     if (!isCalendarDate(from)) return badRequest('bad from', ...);
   *     if (!isCalendarDate(to))   return badRequest('bad to', ...);
   *
   * `addDays(to, -29)` runs BEFORE `to` is validated. `addDays` does
   * `new Date(`${date}T00:00:00Z`).toISOString()`, and `toISOString()` throws
   * `RangeError: Invalid time value` on an Invalid Date. So a `to` that does
   * not parse at all, with no `from` supplied, throws out of `parseWindow`
   * instead of returning the documented 400, and index.ts's catch-all turns it
   * into `500 {"error":"server error","detail":"Invalid time value"}`.
   *
   * Note `?to=2026-02-30` does NOT trigger it (it parses, then rolls over to
   * 2026-03-02, so `addDays` succeeds and the later `isCalendarDate` check
   * catches it). It needs a `to` that is unparseable, e.g. `?to=garbage` or
   * `?to=2026-13-40`.
   *
   * The fix is to validate before computing: move the two `isCalendarDate`
   * guards above the `from` default, or default `from` from `today` rather than
   * from the unvalidated `to`.
   *
   * This test is marked `.fails` so the defect stays visible and the suite
   * stays honest. It is NOT weakened — it still asserts the correct behaviour.
   * When the defect is fixed this test will start FAILING, which is the signal
   * to delete the `.fails` marker and fold these cases into the test above.
   */
  it.fails('returns 400 for an unparseable `to` with no `from` (KNOWN DEFECT: throws, 500s)', () => {
    for (const query of ['?to=garbage', '?to=2026-13-40', '?to=0000-00-00']) {
      const win = windowFor(query);
      expect(win instanceof Response, query).toBe(true);
      expect((win as Response).status, query).toBe(400);
    }
  });
});

describe('small parsers', () => {
  it('blankToNull turns empty and whitespace into null', () => {
    expect(blankToNull('')).toBeNull();
    expect(blankToNull('   ')).toBeNull();
    expect(blankToNull(' x ')).toBe('x');
    expect(blankToNull(null)).toBeNull();
    expect(blankToNull(5)).toBeNull();
  });

  it('safeInt rejects floats, NaN, Infinity and junk', () => {
    expect(safeInt('5')).toBe(5);
    expect(safeInt(5)).toBe(5);
    expect(safeInt('5.5')).toBeNull();
    expect(safeInt(5.5)).toBeNull();
    expect(safeInt('abc')).toBeNull();
    expect(safeInt('')).toBeNull();
    expect(safeInt(NaN)).toBeNull();
    expect(safeInt(Infinity)).toBeNull();
    expect(safeInt(null)).toBeNull();
    expect(safeInt(5, { min: 6 })).toBeNull();
    expect(safeInt(5, { max: 4 })).toBeNull();
  });

  it('likeTerm escapes the wildcards so searching "%" means a percent sign', () => {
    expect(likeTerm('%')).toBe('%\\%%');
    expect(likeTerm('_')).toBe('%\\_%');
    expect(likeTerm('a_b')).toBe('%a\\_b%');
    expect(likeTerm('plumbing')).toBe('%plumbing%');
  });
});
