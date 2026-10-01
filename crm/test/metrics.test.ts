/**
 * The numbers.
 *
 * Three cost-per figures exist and they are NOT interchangeable — collapsing
 * them is the easiest way to make this dashboard lie, so the central fixture
 * here deliberately gives all three DIFFERENT denominators and asserts all
 * three values. If a refactor ever made two of them share a denominator, two of
 * these assertions go red immediately.
 *
 * On null ratios: a response body cannot prove "null" rather than "NaN",
 * because `JSON.stringify` renders NaN and Infinity as `null`. The HTTP tests
 * below assert the field is null by name; the accompanying proof that the
 * helpers return a real `null` and not a disguised NaN lives in util.test.ts.
 */

import { describe, expect, it } from 'vitest';
import {
  OPERATOR, callJson, insertCall, insertCampaign, insertDeal, insertEvent,
  insertLead, insertSpend,
} from './helpers';

// Window used by the main fixture. Sydney dates; the UTC range it becomes is
// [2026-08-31 14:00:00, 2026-09-30 14:00:00).
const FROM = '2026-09-01';
const TO = '2026-09-30';
const WINDOW = `?from=${FROM}&to=${TO}`;

/** Comfortably inside the window in both UTC and Sydney terms. */
const MID = '2026-09-15 02:00:00';

interface Summary {
  window: { from: string; to: string; days: number };
  currency: string;
  spend_cents: number;
  leads: { total: number; paid: number; organic: number };
  contacted: number;
  booked: number;
  won: number;
  lost: number;
  revenue_cents: number;
  cost_per_lead_cents: number | null;
  cost_per_booked_cents: number | null;
  cac_cents: number | null;
  ltv_cents: number | null;
  ltv_cac_ratio: number | null;
  roas: number | null;
  funnel: {
    lead_to_contacted: number | null;
    contacted_to_booked: number | null;
    booked_to_won: number | null;
  };
  pipeline: Record<string, number>;
}

function summary(query = WINDOW) {
  return callJson<Summary>(`/api/metrics/summary${query}`, { as: OPERATOR });
}

interface Daily {
  days: Array<{
    date: string;
    spend_cents: number;
    new_leads: number;
    paid_leads: number;
    contacts: number;
    booked: number;
    won: number;
    revenue_cents: number;
  }>;
}

function daily(query: string) {
  return callJson<Daily>(`/api/metrics/daily${query}`, { as: OPERATOR });
}

// ------------------------------------------------------------- empty state ---

describe('with zero spend and nothing won', () => {
  it('every ratio is null — not 0, not Infinity, not NaN', async () => {
    const res = await summary();
    expect(res.status).toBe(200);
    const b = res.body;

    // Asserted by name, one at a time, so a field that silently disappears
    // from the payload cannot pass by being undefined.
    expect(b.cost_per_lead_cents).toBeNull();
    expect(b.cost_per_booked_cents).toBeNull();
    expect(b.cac_cents).toBeNull();
    expect(b.ltv_cents).toBeNull();
    expect(b.ltv_cac_ratio).toBeNull();
    expect(b.roas).toBeNull();
    expect(b.funnel.lead_to_contacted).toBeNull();
    expect(b.funnel.contacted_to_booked).toBeNull();
    expect(b.funnel.booked_to_won).toBeNull();

    for (const key of [
      'cost_per_lead_cents', 'cost_per_booked_cents', 'cac_cents', 'ltv_cents',
      'ltv_cac_ratio', 'roas',
    ] as const) {
      expect(Object.hasOwn(b, key), `${key} missing from the payload`).toBe(true);
      expect(b[key], key).not.toBe(0);
    }
    for (const key of ['lead_to_contacted', 'contacted_to_booked', 'booked_to_won'] as const) {
      expect(Object.hasOwn(b.funnel, key), `funnel.${key} missing`).toBe(true);
      expect(b.funnel[key], key).not.toBe(0);
    }

    // Nothing serialised as a literal NaN or Infinity either.
    expect(res.text).not.toContain('NaN');
    expect(res.text).not.toContain('Infinity');
  });

  it('the counts are zero, which is a different thing from null', async () => {
    const b = (await summary()).body;
    expect(b.spend_cents).toBe(0);
    expect(b.revenue_cents).toBe(0);
    expect(b.leads).toEqual({ total: 0, paid: 0, organic: 0 });
    expect(b.contacted).toBe(0);
    expect(b.booked).toBe(0);
    expect(b.won).toBe(0);
    expect(b.lost).toBe(0);
    expect(b.pipeline).toEqual({
      new: 0, attempting: 0, engaged: 0, booked: 0, won: 0, lost: 0, parked: 0,
    });
  });

  it('spend with no leads still yields null, never a divide-by-zero', async () => {
    await insertCampaign('c_lonely', 'Lonely spend');
    await insertSpend('c_lonely', '2026-09-15', 20551);

    const b = (await summary()).body;
    expect(b.spend_cents).toBe(20551);
    // No denominator, so no answer.
    expect(b.cost_per_lead_cents).toBeNull();
    expect(b.cost_per_booked_cents).toBeNull();
    expect(b.cac_cents).toBeNull();

    // roas is the one that is legitimately ZERO here, and the distinction is
    // the whole point of the null convention: spend is the denominator, and it
    // is not zero, so "we spent AUD 205.51 and earned nothing" has a real
    // answer — 0. A null here would hide a real result behind an em dash.
    expect(b.roas).toBe(0);
  });

  it('roas is null only when there was no spend to divide by', async () => {
    const lead = await insertLead({ email: 'revenue.no.spend@example.test', status: 'won' });
    await insertDeal({
      lead_id: lead, amount_cents: 100000, status: 'won', closed_at: '2026-09-17 12:00:00',
    });

    const b = (await summary()).body;
    expect(b.spend_cents).toBe(0);
    expect(b.revenue_cents).toBe(100000);
    // Revenue with no spend is an infinite return; null, never Infinity.
    expect(b.roas).toBeNull();
    expect(b.cac_cents).toBeNull();
  });

  it('echoes the window it was given', async () => {
    const b = (await summary()).body;
    expect(b.window).toEqual({ from: FROM, to: TO, days: 30 });
    expect(b.currency).toBe('AUD');
  });

  it('defaults to the last 30 days when no window is given', async () => {
    const b = (await summary('')).body;
    expect(b.window.days).toBe(30);
  });
});

// ------------------------------------------------- the three cost-per numbers --

/**
 * A fixture built so that cost_per_lead, cost_per_booked and cac have three
 * DIFFERENT denominators: 4 paid leads, 3 leads booked, 2 customers won.
 */
async function threeDenominators(): Promise<number[]> {
  await insertCampaign('c_main', 'Rollout — Cold Traffic');
  await insertSpend('c_main', '2026-09-12', 60000, { impressions: 40000, clicks: 900, results: 30 });
  await insertSpend('c_main', '2026-09-20', 40000, { impressions: 26000, clicks: 600, results: 18 });
  // Total spend: AUD 1000.00 = 100000 cents.

  const ids: number[] = [];
  for (let i = 1; i <= 4; i += 1) {
    ids.push(
      await insertLead({
        email: `paid${i}@example.test`,
        first_name: `Paid${i}`,
        source: 'fb paid',
        subscribed_at: MID,
        status: i <= 2 ? 'won' : i === 3 ? 'booked' : 'engaged',
        board_rank: i * 1000,
      }),
    );
  }
  // One organic lead, so leads.total and leads.paid differ too.
  ids.push(
    await insertLead({
      email: 'organic1@example.test',
      source: 'ig social',
      subscribed_at: MID,
      status: 'new',
      board_rank: 5000,
    }),
  );

  const [l1, l2, l3, l4] = ids as [number, number, number, number, number];

  // contacted: 4 distinct leads, from 5 event rows — the duplicate proves the
  // count is DISTINCT leads and not event rows.
  for (const id of [l1, l2, l3, l4, l1]) {
    await insertEvent({ lead_id: id, type: 'contact', detail: 'call/connected', created_at: MID });
  }

  // booked: 3 distinct leads, again with a duplicate.
  for (const id of [l1, l2, l3, l1]) {
    await insertEvent({
      lead_id: id, type: 'stage_change', from_stage: 'engaged', to_stage: 'booked',
      created_at: '2026-09-16 02:00:00',
    });
  }

  // won: 2 distinct leads.
  for (const id of [l1, l2]) {
    await insertEvent({
      lead_id: id, type: 'stage_change', from_stage: 'booked', to_stage: 'won',
      created_at: '2026-09-17 02:00:00',
    });
  }

  await insertDeal({
    lead_id: l1, amount_cents: 200000, status: 'won', closed_at: '2026-09-17 12:00:00',
  });
  await insertDeal({
    lead_id: l2, amount_cents: 100000, status: 'won', closed_at: '2026-09-18 12:00:00',
  });

  return ids;
}

describe('cost_per_lead, cost_per_booked and cac', () => {
  it('are three different numbers when their denominators differ', async () => {
    await threeDenominators();
    const b = (await summary()).body;

    expect(b.spend_cents).toBe(100000);
    expect(b.leads).toEqual({ total: 5, paid: 4, organic: 1 });
    expect(b.booked).toBe(3);
    expect(b.won).toBe(2);

    // spend / paid leads — "what does it cost to get someone's email"
    expect(b.cost_per_lead_cents).toBe(25000);
    // spend / leads booked — "what does it cost to get a call in the diary"
    expect(b.cost_per_booked_cents).toBe(33333);
    // spend / customers won — true CAC
    expect(b.cac_cents).toBe(50000);

    // And pairwise distinct, so a refactor that collapsed two of them fails
    // here even if the individual expectations were updated.
    const three = [b.cost_per_lead_cents, b.cost_per_booked_cents, b.cac_cents];
    expect(new Set(three).size).toBe(3);
  });

  it('counts distinct leads, not event rows, in the flow figures', async () => {
    await threeDenominators();
    const b = (await summary()).body;
    // Five contact events across four leads, four booked events across three.
    expect(b.contacted).toBe(4);
    expect(b.booked).toBe(3);
  });

  it('keeps the funnel fractions at or below 1', async () => {
    await threeDenominators();
    const b = (await summary()).body;
    expect(b.funnel.lead_to_contacted).toBe(0.8);
    expect(b.funnel.contacted_to_booked).toBe(0.75);
    expect(b.funnel.booked_to_won).toBe(0.6667);
    for (const value of Object.values(b.funnel)) {
      expect(value as number).toBeLessThanOrEqual(1);
    }
  });

  it('reports revenue, roas and the pipeline stock alongside the flow', async () => {
    await threeDenominators();
    const b = (await summary()).body;
    expect(b.revenue_cents).toBe(300000);
    expect(b.roas).toBe(3);
    // Stock: where every lead sits right now. Deliberately does not add up to
    // the flow figures above.
    expect(b.pipeline).toEqual({
      new: 1, attempting: 0, engaged: 1, booked: 1, won: 2, lost: 0, parked: 0,
    });
  });

  it('excludes spend and leads from outside the window', async () => {
    await threeDenominators();
    await insertCampaign('c_old', 'Last month');
    await insertSpend('c_old', '2026-08-15', 999999);
    await insertLead({
      email: 'outside@example.test', source: 'fb paid', subscribed_at: '2026-08-15 02:00:00',
      status: 'new',
    });

    const b = (await summary()).body;
    expect(b.spend_cents).toBe(100000);
    expect(b.leads.paid).toBe(4);
  });

  it('includes a lead acquired on the first and last day of the window', async () => {
    // Inclusive at both ends: 2026-09-01 00:30 and 2026-09-30 23:30 Sydney.
    await insertLead({
      email: 'firstday@example.test', source: 'fb paid',
      subscribed_at: '2026-08-31 14:30:00', status: 'new',
    });
    await insertLead({
      email: 'lastday@example.test', source: 'fb paid',
      subscribed_at: '2026-09-30 13:30:00', status: 'new',
    });
    // One hour outside each end.
    await insertLead({
      email: 'justbefore@example.test', source: 'fb paid',
      subscribed_at: '2026-08-31 13:30:00', status: 'new',
    });
    await insertLead({
      email: 'justafter@example.test', source: 'fb paid',
      subscribed_at: '2026-09-30 14:30:00', status: 'new',
    });

    const b = (await summary()).body;
    expect(b.leads.total).toBe(2);
    expect(b.leads.paid).toBe(2);
  });

  it('falls back to created_at when a lead has no subscribed_at', async () => {
    await insertLead({
      email: 'nosubdate@example.test', source: 'fb paid',
      subscribed_at: null, created_at: MID, status: 'new',
    });
    const b = (await summary()).body;
    expect(b.leads.total).toBe(1);
  });

  it.each([
    ['fb paid', true],
    ['ig paid', true],
    ['google cpc', true],
    ['linkedin ppc', true],
    ['FB PAID', true],
    ['ig social', false],
    ['organic search', false],
    ['referral', false],
    [null, false],
  ])('classifies source %s as paid=%s', async (source, isPaid) => {
    await insertLead({
      email: 'classify@example.test', source: source as string | null,
      subscribed_at: MID, status: 'new',
    });
    const b = (await summary()).body;
    expect(b.leads.total).toBe(1);
    expect(b.leads.paid).toBe(isPaid ? 1 : 0);
    expect(b.leads.organic).toBe(isPaid ? 0 : 1);
  });
});

// --------------------------------------------------------------------- LTV ----

describe('ltv_cents', () => {
  it('counts a repeat customer once: two won deals on one lead sum, they do not average', async () => {
    const lead = await insertLead({ email: 'repeat@example.test', status: 'won', board_rank: 1000 });
    await insertDeal({
      lead_id: lead, amount_cents: 200000, status: 'won', closed_at: '2026-09-17 12:00:00',
    });
    await insertDeal({
      lead_id: lead, amount_cents: 100000, status: 'won', closed_at: '2026-09-25 12:00:00',
    });

    const b = (await summary()).body;
    // SUM(won) / COUNT(DISTINCT lead_id with a won deal) = 300000 / 1.
    expect(b.ltv_cents).toBe(300000);
    // Emphatically NOT the average of two imaginary customers.
    expect(b.ltv_cents).not.toBe(150000);
  });

  it('averages across customers, not across deals', async () => {
    const repeat = await insertLead({ email: 'repeat@example.test', status: 'won' });
    const single = await insertLead({ email: 'single@example.test', status: 'won' });
    await insertDeal({ lead_id: repeat, amount_cents: 200000, status: 'won', closed_at: '2026-09-17 12:00:00' });
    await insertDeal({ lead_id: repeat, amount_cents: 100000, status: 'won', closed_at: '2026-09-25 12:00:00' });
    await insertDeal({ lead_id: single, amount_cents: 100000, status: 'won', closed_at: '2026-09-26 12:00:00' });

    const b = (await summary()).body;
    // 400000 over two customers, not over three deals (which would be 133333).
    expect(b.ltv_cents).toBe(200000);
  });

  it('ignores open and lost deals', async () => {
    const lead = await insertLead({ email: 'mixed@example.test', status: 'engaged' });
    await insertDeal({ lead_id: lead, amount_cents: 500000, status: 'open' });
    await insertDeal({ lead_id: lead, amount_cents: 500000, status: 'lost', closed_at: '2026-09-20 12:00:00' });
    const b = (await summary()).body;
    expect(b.ltv_cents).toBeNull();
    expect(b.revenue_cents).toBe(0);
  });

  it('is all-time, so a deal closed outside the window still counts towards it', async () => {
    const lead = await insertLead({ email: 'oldcustomer@example.test', status: 'won' });
    await insertDeal({
      lead_id: lead, amount_cents: 250000, status: 'won', closed_at: '2026-06-01 12:00:00',
    });
    const b = (await summary()).body;
    // LTV sees it...
    expect(b.ltv_cents).toBe(250000);
    // ...while windowed revenue does not.
    expect(b.revenue_cents).toBe(0);
  });

  it('is null when nobody has bought, and so is the ltv/cac ratio', async () => {
    await insertCampaign('c_x', 'Spend with no customers');
    await insertSpend('c_x', '2026-09-15', 100000);
    const b = (await summary()).body;
    expect(b.ltv_cents).toBeNull();
    expect(b.cac_cents).toBeNull();
    expect(b.ltv_cac_ratio).toBeNull();
  });

  it('gives a real ltv/cac ratio when both sides exist', async () => {
    await threeDenominators();
    const b = (await summary()).body;
    // ltv 150000 (300000 over two customers) against cac 50000.
    expect(b.ltv_cents).toBe(150000);
    expect(b.cac_cents).toBe(50000);
    expect(b.ltv_cac_ratio).toBe(3);
  });
});

// ------------------------------------------------------------ daily report ----

describe('GET /api/metrics/daily', () => {
  it('returns exactly one row per day in the window, including empty days', async () => {
    const res = await daily('?from=2026-09-28&to=2026-10-01');
    expect(res.status).toBe(200);
    expect(res.body.days.map((d) => d.date)).toEqual([
      '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01',
    ]);
    expect(res.body.days).toHaveLength(4);
  });

  it('is inclusive at both ends', async () => {
    const res = await daily(`?from=${FROM}&to=${TO}`);
    const dates = res.body.days.map((d) => d.date);
    expect(dates[0]).toBe(FROM);
    expect(dates[dates.length - 1]).toBe(TO);
    expect(dates).toHaveLength(30);
  });

  it('has no duplicate and no missing days across a long window', async () => {
    // Spans the Sydney DST change on 2026-10-04.
    const res = await daily('?from=2026-09-01&to=2026-10-31');
    const dates = res.body.days.map((d) => d.date);
    expect(dates).toHaveLength(61);
    expect(new Set(dates).size).toBe(61);
    for (let i = 1; i < dates.length; i += 1) {
      expect(dates[i] as string > (dates[i - 1] as string), `${dates[i - 1]} -> ${dates[i]}`).toBe(true);
    }
  });

  it('zero-fills a day with no activity rather than omitting it', async () => {
    await insertCampaign('c_daily', 'Daily');
    await insertSpend('c_daily', '2026-09-29', 5000);

    const res = await daily('?from=2026-09-28&to=2026-10-01');
    const byDate = new Map(res.body.days.map((d) => [d.date, d]));

    expect(byDate.get('2026-09-28')).toEqual({
      date: '2026-09-28', spend_cents: 0, new_leads: 0, paid_leads: 0,
      contacts: 0, booked: 0, won: 0, revenue_cents: 0,
    });
    expect(byDate.get('2026-09-29')?.spend_cents).toBe(5000);
    expect(byDate.get('2026-09-30')?.spend_cents).toBe(0);
  });

  it('puts each kind of activity on the right day', async () => {
    await insertCampaign('c_daily', 'Daily');
    await insertSpend('c_daily', '2026-09-29', 5000);

    const lead = await insertLead({
      email: 'dailylead@example.test', source: 'fb paid',
      subscribed_at: '2026-09-29 02:00:00', status: 'won', board_rank: 1000,
    });
    await insertCall({ lead_id: lead, channel: 'call', outcome: 'connected', called_at: '2026-09-29 03:00:00' });
    await insertEvent({
      lead_id: lead, type: 'stage_change', to_stage: 'booked', created_at: '2026-09-30 02:00:00',
    });
    await insertEvent({
      lead_id: lead, type: 'stage_change', to_stage: 'won', created_at: '2026-10-01 02:00:00',
    });
    await insertDeal({
      lead_id: lead, amount_cents: 150000, status: 'won', closed_at: '2026-10-01 12:00:00',
    });

    const res = await daily('?from=2026-09-28&to=2026-10-01');
    const byDate = new Map(res.body.days.map((d) => [d.date, d]));

    expect(byDate.get('2026-09-29')).toMatchObject({
      spend_cents: 5000, new_leads: 1, paid_leads: 1, contacts: 1, booked: 0, won: 0,
    });
    expect(byDate.get('2026-09-30')).toMatchObject({ booked: 1, won: 0 });
    expect(byDate.get('2026-10-01')).toMatchObject({ won: 1, revenue_cents: 150000 });
  });

  it('files activity under the Sydney day, not the UTC day', async () => {
    // 2026-09-30 14:30 UTC is 2026-10-01 00:30 in Sydney. A UTC-bucketed
    // report would file this call under the 30th.
    const lead = await insertLead({ email: 'latecall@example.test', status: 'engaged', board_rank: 1000 });
    await insertCall({
      lead_id: lead, channel: 'call', outcome: 'connected', called_at: '2026-09-30 14:30:00',
    });
    await insertCall({
      lead_id: lead, channel: 'call', outcome: 'connected', called_at: '2026-09-30 13:30:00',
    });

    const res = await daily('?from=2026-09-28&to=2026-10-01');
    const byDate = new Map(res.body.days.map((d) => [d.date, d]));
    expect(byDate.get('2026-10-01')?.contacts).toBe(1);
    expect(byDate.get('2026-09-30')?.contacts).toBe(1);
  });

  it('counts one booking per lead per day, however many times the card was dragged', async () => {
    const lead = await insertLead({ email: 'draggy@example.test', status: 'booked', board_rank: 1000 });
    for (let i = 0; i < 3; i += 1) {
      await insertEvent({
        lead_id: lead, type: 'stage_change', to_stage: 'booked', created_at: '2026-09-29 02:00:00',
      });
    }
    const res = await daily('?from=2026-09-28&to=2026-10-01');
    const day = res.body.days.find((d) => d.date === '2026-09-29');
    expect(day?.booked).toBe(1);
  });

  it('rejects a window that is too long rather than returning a huge payload', async () => {
    const res = await daily('?from=2020-01-01&to=2026-10-01');
    expect(res.status).toBe(400);
  });
});

// --------------------------------------------------- window validation (API) ---

describe('window validation on the metrics endpoints', () => {
  it.each([
    '/api/metrics/summary?from=not-a-date',
    '/api/metrics/summary?from=2026-10-02&to=2026-10-01',
    '/api/metrics/summary?from=2026-09-01&to=rubbish',
    '/api/metrics/daily?from=not-a-date',
    '/api/campaigns?from=not-a-date',
  ])('%s is 400', async (path) => {
    const res = await callJson(path, { as: OPERATOR });
    expect(res.status).toBe(400);
  });

  /**
   * KNOWN DEFECT, same root cause as the `.fails` test in util.test.ts:
   * `parseWindow` computes `addDays(to, -29)` before validating `to`, so an
   * unparseable `to` with no `from` throws `RangeError: Invalid time value`
   * and index.ts's catch-all turns it into a 500. Every endpoint that takes a
   * window is affected.
   *
   * Fixed in src/util.ts by validating `to` before deriving `from`. Kept as a
   * regression guard at the HTTP layer, since the symptom was a 500.
   */
  it.each([
    '/api/metrics/summary?to=garbage',
    '/api/metrics/daily?to=garbage',
    '/api/campaigns?to=garbage',
  ])('%s is 400, not 500', async (path) => {
    const res = await callJson<{ error: string }>(path, { as: OPERATOR });
    expect(res.status).toBe(400);
    expect(res.body.error).not.toBe('server error');
  });
});
