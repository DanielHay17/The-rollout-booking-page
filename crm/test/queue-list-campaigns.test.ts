/**
 * The three read endpoints that are not in the priority list above but whose
 * contracts are easy to break silently: the filtered list, the prioritised call
 * queue, and campaign reporting.
 *
 * The campaign tests exist mostly to defend one thing: `attribution_note`.
 * beehiiv gives no campaign id and no UTM data, so a CRM lead CANNOT be traced
 * to a campaign, and the per-campaign CPL column is the ad platform grading its
 * own homework. If that note ever gets dropped to tidy up a layout, the screen
 * starts implying an attribution that does not exist.
 */

import { describe, expect, it } from 'vitest';
import {
  OPERATOR, callJson, insertCall, insertCampaign, insertLead, insertSpend,
} from './helpers';
import { operatorToday } from '../src/util';

const TODAY = operatorToday();

interface ListReply {
  leads: Array<{ id: number; email: string; phone: string | null; attempts: number; is_overdue: boolean }>;
  total: number;
}

function list(query = '') {
  return callJson<ListReply>(`/api/leads${query}`, { as: OPERATOR });
}

describe('GET /api/leads', () => {
  it('filters by stage, including rows still stored with a legacy status', async () => {
    const current = await insertLead({ email: 'current@example.test', status: 'new', board_rank: 1000 });
    const legacy = await insertLead({ email: 'legacy@example.test', status: 'never_called', board_rank: 2000 });
    await insertLead({ email: 'other@example.test', status: 'engaged', board_rank: 1000 });

    const res = await list('?stage=new');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.leads.map((l) => l.id).sort()).toEqual([current, legacy].sort());
  });

  it('rejects an unknown stage rather than returning everything', async () => {
    const res = await callJson<{ error: string }>('/api/leads?stage=zombie', { as: OPERATOR });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('bad stage');
  });

  it('searches name, company, email and phone', async () => {
    const id = await insertLead({
      email: 'hamish.trenoweth@example.test', first_name: 'Hamish', last_name: 'Trenoweth',
      company: 'Trenoweth Civil', phone: '+61 491 570 021', status: 'engaged', board_rank: 1000,
    });
    await insertLead({ email: 'nobody@example.test', first_name: 'Nobody', status: 'new', board_rank: 1000 });

    for (const q of ['trenoweth', 'Hamish', 'civil', 'hamish.tren', '491570021']) {
      const res = await list(`?q=${encodeURIComponent(q)}`);
      expect(res.body.leads.map((l) => l.id), q).toEqual([id]);
    }
  });

  it('matches a phone number typed with different spacing', async () => {
    const id = await insertLead({
      email: 'spaced@example.test', phone: '+61 491 570 021', status: 'new', board_rank: 1000,
    });
    for (const q of ['491 570 021', '491570021', '570021', '+61 491 570 021']) {
      const res = await list(`?q=${encodeURIComponent(q)}`);
      expect(res.body.leads.map((l) => l.id), q).toEqual([id]);
    }
  });

  /**
   * KNOWN DEFECT in src/leads.ts — `listLeads`, the phone clause around line 206.
   *
   * The comment directly above that code states the requirement:
   *     "searching "0412 345" has to find "+61 412 345 678""
   * and that exact example returns nothing.
   *
   * The clause normalises only the STORED value, and only for spaces, hyphens
   * and brackets:
   *     replace(replace(replace(replace(COALESCE(l.phone,''),' ',''),'-',''),'(',''),')','')
   * so '+61 491 570 021' becomes '+61491570021' (the '+' survives). The search
   * term meanwhile is reduced to bare digits with `rawQ.replace(/\D/g,'')` and
   * matched verbatim. Nothing reconciles the Australian leading '0' with the
   * '+61' country code, so '0491570021' is looked for inside '+61491570021' —
   * and there is no '0' before the '491'.
   *
   * Impact: 04xx xxx xxx is how every Australian writes their own mobile, and
   * beehiiv supplies many numbers in +61 form. Typing the number off a missed
   * call returns ZERO results rather than an error, so it reads as "that lead
   * is not in the CRM" when it is. Dropping the leading 0 happens to work,
   * which is why this can sit unnoticed.
   *
   * Fix: canonicalise BOTH sides before comparing — also strip '+', then make a
   * leading '0' and a leading '61' equivalent (e.g. compare the last nine
   * digits), rather than normalising the column alone.
   *
   * Fixed: both sides are now reduced to the national significant number by
   * phoneSearchDigits() and phoneDigitsExpr(). Those two must stay in step.
   */
  it('finds a +61 number typed in 04xx form', async () => {
    const id = await insertLead({
      email: 'aussie@example.test', phone: '+61 412 345 678', status: 'new', board_rank: 1000,
    });
    for (const q of ['0412 345', '0412345678', '0412 345 678']) {
      const res = await list(`?q=${encodeURIComponent(q)}`);
      expect(res.body.leads.map((l) => l.id), q).toEqual([id]);
    }
  });

  it('treats a % in the search term as a literal percent sign', async () => {
    await insertLead({ email: 'plain@example.test', first_name: 'Plain', status: 'new', board_rank: 1000 });
    const pct = await insertLead({
      email: 'pct@example.test', company: '100% Plumbing', status: 'new', board_rank: 2000,
    });

    // Unescaped, '%' would match every lead.
    const res = await list('?q=100%25');
    expect(res.body.leads.map((l) => l.id)).toEqual([pct]);
  });

  it('filters by source and owner, case-insensitively', async () => {
    const id = await insertLead({
      email: 'owned@example.test', source: 'fb paid', owner: 'Operator@Example.Test',
      status: 'new', board_rank: 1000,
    });
    await insertLead({ email: 'unowned@example.test', source: 'ig social', status: 'new', board_rank: 2000 });

    expect((await list('?source=FB%20PAID')).body.leads.map((l) => l.id)).toEqual([id]);
    expect((await list('?owner=operator@example.test')).body.leads.map((l) => l.id)).toEqual([id]);
  });

  it('filters by due=today, due=overdue and due=week', async () => {
    const overdue = await insertLead({
      email: 'overdue@example.test', status: 'attempting',
      next_action_at: '2026-09-01', board_rank: 1000,
    });
    const today = await insertLead({
      email: 'today@example.test', status: 'attempting', next_action_at: TODAY, board_rank: 2000,
    });
    // A closed lead with an old due date must not show up as work to do.
    await insertLead({
      email: 'closed@example.test', status: 'lost', next_action_at: '2026-09-01', board_rank: 1000,
    });

    expect((await list('?due=overdue')).body.leads.map((l) => l.id)).toEqual([overdue]);
    expect((await list('?due=today')).body.leads.map((l) => l.id)).toEqual([today]);
    expect((await list('?due=week')).body.leads.map((l) => l.id)).toContain(today);
  });

  it('rejects an unknown due filter', async () => {
    const res = await callJson<{ error: string }>('/api/leads?due=someday', { as: OPERATOR });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('bad due');
  });

  it('marks a lead overdue only when its due date is in the past', async () => {
    const past = await insertLead({
      email: 'past@example.test', status: 'attempting', next_action_at: '2026-09-01', board_rank: 1000,
    });
    const now = await insertLead({
      email: 'now@example.test', status: 'attempting', next_action_at: TODAY, board_rank: 2000,
    });
    const res = await list('?stage=attempting');
    const byId = new Map(res.body.leads.map((l) => [l.id, l]));
    expect(byId.get(past)?.is_overdue).toBe(true);
    expect(byId.get(now)?.is_overdue).toBe(false);
  });

  it('reports the true total alongside a limited page', async () => {
    for (let i = 0; i < 5; i += 1) {
      await insertLead({ email: `page${i}@example.test`, status: 'new', board_rank: (i + 1) * 1000 });
    }
    const res = await list('?limit=2');
    expect(res.body.leads).toHaveLength(2);
    expect(res.body.total).toBe(5);

    const page2 = await list('?limit=2&offset=2');
    expect(page2.body.leads).toHaveLength(2);
    expect(page2.body.total).toBe(5);
    const firstIds = res.body.leads.map((l) => l.id);
    expect(page2.body.leads.every((l) => !firstIds.includes(l.id))).toBe(true);
  });
});

describe('GET /api/queue', () => {
  interface QueueReply {
    overdue: Array<{ id: number }>;
    today: Array<{ id: number }>;
    next: Array<{ id: number }>;
  }

  it('splits overdue, due today and unscheduled', async () => {
    const overdue = await insertLead({
      email: 'q.overdue@example.test', status: 'attempting',
      next_action_at: '2026-09-01', phone: '+61 491 570 010', board_rank: 1000,
    });
    const today = await insertLead({
      email: 'q.today@example.test', status: 'engaged',
      next_action_at: TODAY, phone: '+61 491 570 011', board_rank: 1000,
    });
    const unscheduled = await insertLead({
      email: 'q.next@example.test', status: 'new', phone: '+61 491 570 012', board_rank: 1000,
    });

    const res = await callJson<QueueReply>('/api/queue', { as: OPERATOR });
    expect(res.status).toBe(200);
    expect(res.body.overdue.map((l) => l.id)).toEqual([overdue]);
    expect(res.body.today.map((l) => l.id)).toEqual([today]);
    expect(res.body.next.map((l) => l.id)).toEqual([unscheduled]);
  });

  it('orders `next` by callable first, then fewest attempts, then newest subscriber', async () => {
    // Deliberately inserted in the WRONG order, so a missing ORDER BY shows up.
    const noPhone = await insertLead({
      email: 'q.nophone@example.test', status: 'new', phone: null,
      subscribed_at: '2026-09-30 02:00:00',
    });
    const triedTwice = await insertLead({
      email: 'q.tried@example.test', status: 'new', phone: '+61 491 570 020',
      subscribed_at: '2026-09-30 02:00:00',
    });
    const freshest = await insertLead({
      email: 'q.freshest@example.test', status: 'new', phone: '+61 491 570 021',
      subscribed_at: '2026-09-30 06:00:00',
    });
    const older = await insertLead({
      email: 'q.older@example.test', status: 'new', phone: '+61 491 570 022',
      subscribed_at: '2026-09-20 02:00:00',
    });
    await insertCall({ lead_id: triedTwice, channel: 'call', outcome: 'no_answer' });
    await insertCall({ lead_id: triedTwice, channel: 'call', outcome: 'no_answer' });

    const res = await callJson<QueueReply>('/api/queue', { as: OPERATOR });
    expect(res.body.next.map((l) => l.id)).toEqual([freshest, older, triedTwice, noPhone]);
  });

  it('excludes won and lost leads from the queue entirely', async () => {
    for (const status of ['won', 'lost']) {
      await insertLead({
        email: `q.${status}@example.test`, status, next_action_at: '2026-09-01', board_rank: 1000,
      });
    }
    const res = await callJson<QueueReply>('/api/queue', { as: OPERATOR });
    expect(res.body.overdue).toHaveLength(0);
    expect(res.body.today).toHaveLength(0);
    expect(res.body.next).toHaveLength(0);
  });

  it('does not put engaged or booked leads in `next`', async () => {
    // `next` is "never rung, still worth ringing" — new and attempting only.
    await insertLead({ email: 'q.engaged@example.test', status: 'engaged', board_rank: 1000 });
    await insertLead({ email: 'q.booked@example.test', status: 'booked', board_rank: 1000 });
    const chase = await insertLead({ email: 'q.chase@example.test', status: 'attempting', board_rank: 1000 });

    const res = await callJson<QueueReply>('/api/queue', { as: OPERATOR });
    expect(res.body.next.map((l) => l.id)).toEqual([chase]);
  });
});

describe('GET /api/campaigns', () => {
  interface CampaignsReply {
    window: { from: string; to: string };
    currency: string;
    attribution_note: string;
    campaigns: Array<{
      id: string; name: string; status: string | null;
      spend_cents: number; impressions: number; clicks: number; results: number;
      ctr: number | null; cpc_cents: number | null; cpl_cents: number | null;
    }>;
    totals: { spend_cents: number; impressions: number; clicks: number; results: number };
  }

  const WINDOW = '?from=2026-09-12&to=2026-10-01';

  function campaigns(query = WINDOW) {
    return callJson<CampaignsReply>(`/api/campaigns${query}`, { as: OPERATOR });
  }

  it('always returns the attribution note', async () => {
    // Required by API.md: without it the per-campaign CPL column implies a
    // lead-level attribution that beehiiv simply does not provide.
    const res = await campaigns();
    expect(res.status).toBe(200);
    expect(typeof res.body.attribution_note).toBe('string');
    expect(res.body.attribution_note.length).toBeGreaterThan(80);
    expect(res.body.attribution_note).toContain('beehiiv');
    expect(res.body.attribution_note.toLowerCase()).toContain('campaign id');
    expect(res.body.currency).toBe('AUD');
  });

  it('returns the note even when there are no campaigns at all', async () => {
    const res = await campaigns();
    expect(res.body.campaigns).toEqual([]);
    expect(res.body.attribution_note).toContain('beehiiv');
    expect(res.body.totals).toEqual({ spend_cents: 0, impressions: 0, clicks: 0, results: 0 });
  });

  it('aggregates spend within the window and derives ctr, cpc and cpl', async () => {
    await insertCampaign('c_one', 'Rollout | Xero Reel MAIN | Sep26');
    await insertSpend('c_one', '2026-09-20', 10000, { impressions: 4000, clicks: 200, results: 8 });
    await insertSpend('c_one', '2026-09-21', 10000, { impressions: 6000, clicks: 300, results: 12 });
    // Outside the window.
    await insertSpend('c_one', '2026-08-20', 99999, { impressions: 1, clicks: 1, results: 1 });

    const res = await campaigns();
    const row = res.body.campaigns.find((c) => c.id === 'c_one');
    expect(row?.spend_cents).toBe(20000);
    expect(row?.impressions).toBe(10000);
    expect(row?.clicks).toBe(500);
    expect(row?.results).toBe(20);
    expect(row?.ctr).toBe(0.05);
    expect(row?.cpc_cents).toBe(40);
    expect(row?.cpl_cents).toBe(1000);
    expect(res.body.totals.spend_cents).toBe(20000);
  });

  it('nulls ctr, cpc and cpl rather than dividing by zero', async () => {
    await insertCampaign('c_quiet', 'Rollout | Operations | Hook test | Oct26');
    await insertSpend('c_quiet', '2026-09-20', 500, { impressions: 0, clicks: 0, results: 0 });

    const res = await campaigns();
    const row = res.body.campaigns.find((c) => c.id === 'c_quiet');
    expect(row?.spend_cents).toBe(500);
    expect(row?.ctr).toBeNull();
    expect(row?.cpc_cents).toBeNull();
    expect(row?.cpl_cents).toBeNull();
    expect(res.text).not.toContain('Infinity');
  });

  it('shows a live campaign that has not spent anything yet', async () => {
    // The point of the screen is "what is running right now", which includes
    // something switched on this morning.
    await insertCampaign('c_fresh', 'Xero Real Footage | 1 Oct');
    const res = await campaigns();
    const row = res.body.campaigns.find((c) => c.id === 'c_fresh');
    expect(row).toBeDefined();
    expect(row?.spend_cents).toBe(0);
    expect(row?.cpl_cents).toBeNull();
  });

  it('orders by spend, biggest first', async () => {
    await insertCampaign('c_big', 'Big');
    await insertCampaign('c_small', 'Small');
    await insertSpend('c_big', '2026-09-20', 21332);
    await insertSpend('c_small', '2026-09-20', 325);

    const res = await campaigns();
    const ids = res.body.campaigns.map((c) => c.id);
    expect(ids.indexOf('c_big')).toBeLessThan(ids.indexOf('c_small'));
  });
});
