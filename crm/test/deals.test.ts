/**
 * Deals — the only way revenue, and therefore CAC and LTV, enters the system.
 *
 * The behaviour worth defending is the side effect: marking a deal won drags
 * the lead to `won` and stamps a close date. If that link breaks, the board
 * still looks right while every money figure on the dashboard quietly stops
 * moving, which is the hardest kind of bug to notice.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  OPERATOR, callJson, countRows, insertLead, leadRow, stageChangesFor,
} from './helpers';
import { operatorToday } from '../src/util';

const TODAY = operatorToday();

interface DealReply {
  ok?: boolean;
  deal?: {
    id: number; lead_id: number; amount_cents: number; status: string;
    closed_at: string | null; name: string | null; notes: string | null; currency: string;
  };
  error?: string;
  detail?: string;
}

function createDeal(leadId: number, body: unknown) {
  return callJson<DealReply>(`/api/leads/${leadId}/deals`, {
    method: 'POST', as: OPERATOR, body,
  });
}

function patchDeal(dealId: number, body: unknown) {
  return callJson<DealReply>(`/api/deals/${dealId}`, { method: 'PATCH', as: OPERATOR, body });
}

let leadId: number;

beforeEach(async () => {
  leadId = await insertLead({
    email: 'deal.lead@example.test', first_name: 'Callum', last_name: 'Ashgrove',
    status: 'booked', board_rank: 1000,
  });
});

describe('POST /api/leads/:id/deals', () => {
  it('creates an open deal without touching the lead', async () => {
    const res = await createDeal(leadId, { amount_cents: 450000, name: 'Quoting rollout' });
    expect(res.status).toBe(200);
    expect(res.body.deal).toMatchObject({
      lead_id: leadId, amount_cents: 450000, status: 'open', closed_at: null,
      name: 'Quoting rollout', currency: 'AUD',
    });

    expect(await leadRow(leadId).then((r) => r?.['status'])).toBe('booked');
    expect(await stageChangesFor(leadId)).toEqual([]);
    // An open deal is still auditable.
    expect(await countRows('lead_events', "lead_id = ? AND type = 'deal'", leadId)).toBe(1);
  });

  it('creating it already won drags the lead to won and stamps the close date', async () => {
    const res = await createDeal(leadId, { amount_cents: 450000, status: 'won' });
    expect(res.status).toBe(200);
    expect(res.body.deal?.status).toBe('won');
    expect(res.body.deal?.closed_at).toBe(`${TODAY} 12:00:00`);

    const lead = await leadRow(leadId);
    expect(lead?.['status']).toBe('won');
    expect(lead?.['won_at']).toBeTruthy();
    expect(await stageChangesFor(leadId)).toEqual([{ from: 'booked', to: 'won' }]);
  });

  it('honours an explicit close date, kept at midday so the Sydney day is right', async () => {
    // Midday UTC is the same calendar day in Sydney on either side of DST, so
    // the deal is reported on the day the operator meant.
    const res = await createDeal(leadId, {
      amount_cents: 450000, status: 'won', closed_at: '2026-09-26',
    });
    expect(res.body.deal?.closed_at).toBe('2026-09-26 12:00:00');
  });

  it('accepts a zero-amount deal', async () => {
    const res = await createDeal(leadId, { amount_cents: 0, status: 'won' });
    expect(res.status).toBe(200);
    expect(res.body.deal?.amount_cents).toBe(0);
  });

  it.each([
    [{}, 'bad amount_cents'],
    [{ amount_cents: -1 }, 'bad amount_cents'],
    [{ amount_cents: 1234.56 }, 'bad amount_cents'],
    [{ amount_cents: 'lots' }, 'bad amount_cents'],
    [{ amount_cents: null }, 'bad amount_cents'],
    [{ amount_cents: 1000, status: 'pending' }, 'bad status'],
    [{ amount_cents: 1000, closed_at: 'last Tuesday' }, 'bad closed_at'],
    [{ amount_cents: 1000, wibble: 1 }, 'unknown field'],
    [{ amount_cents: 1000, amount: 1000 }, 'unknown field'],
  ])('rejects %j with 400', async (body, error) => {
    const res = await createDeal(leadId, body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(error);
    expect(await countRows('deals')).toBe(0);
  });

  it('rejects a fractional amount, because money is integer cents everywhere', async () => {
    const res = await createDeal(leadId, { amount_cents: 450000.5 });
    expect(res.status).toBe(400);
  });

  it('is 404 for a lead that does not exist', async () => {
    const res = await createDeal(999999, { amount_cents: 1000 });
    expect(res.status).toBe(404);
    expect(await countRows('deals')).toBe(0);
  });
});

describe('PATCH /api/deals/:id', () => {
  let dealId: number;

  beforeEach(async () => {
    const created = await createDeal(leadId, { amount_cents: 450000 });
    dealId = created.body.deal?.id as number;
  });

  it('marking a deal won moves the lead to won and stamps closed_at', async () => {
    const res = await patchDeal(dealId, { status: 'won' });
    expect(res.status).toBe(200);
    expect(res.body.deal?.status).toBe('won');
    expect(res.body.deal?.closed_at).toBe(`${TODAY} 12:00:00`);

    const lead = await leadRow(leadId);
    expect(lead?.['status']).toBe('won');
    expect(await stageChangesFor(leadId)).toEqual([{ from: 'booked', to: 'won' }]);
  });

  it('does not re-stamp a close date that was already set', async () => {
    await patchDeal(dealId, { status: 'won', closed_at: '2026-09-20' });
    const again = await patchDeal(dealId, { amount_cents: 460000 });
    expect(again.body.deal?.closed_at).toBe('2026-09-20 12:00:00');
    expect(again.body.deal?.amount_cents).toBe(460000);
  });

  it('does not write a second stage_change for an already-won lead', async () => {
    await patchDeal(dealId, { status: 'won' });
    const second = await createDeal(leadId, { amount_cents: 120000, status: 'won' });
    expect(second.status).toBe(200);
    // One move into won, not two.
    expect(await stageChangesFor(leadId)).toEqual([{ from: 'booked', to: 'won' }]);
    expect(await leadRow(leadId).then((r) => r?.['status'])).toBe('won');
  });

  it('marking a deal lost does not move the lead', async () => {
    const res = await patchDeal(dealId, { status: 'lost' });
    expect(res.status).toBe(200);
    expect(await leadRow(leadId).then((r) => r?.['status'])).toBe('booked');
    expect(await stageChangesFor(leadId)).toEqual([]);
  });

  it('edits the amount, name and notes', async () => {
    const res = await patchDeal(dealId, {
      amount_cents: 500000, name: 'Expanded scope', notes: 'Two extra sites',
    });
    expect(res.body.deal).toMatchObject({
      amount_cents: 500000, name: 'Expanded scope', notes: 'Two extra sites',
    });
  });

  it('stores an empty name or note as NULL', async () => {
    await patchDeal(dealId, { name: 'Something' });
    const res = await patchDeal(dealId, { name: '' });
    expect(res.body.deal?.name).toBeNull();
  });

  it.each([
    [{ status: 'pending' }, 'bad status'],
    [{ amount_cents: -5 }, 'bad amount_cents'],
    [{ closed_at: 'soon' }, 'bad closed_at'],
    [{ lead_id: 1 }, 'unknown field'],
    [{}, 'bad body'],
  ])('rejects %j with 400', async (body, error) => {
    const res = await patchDeal(dealId, body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(error);
    // ...and changes nothing.
    expect(await countRows('deals', 'id = ? AND amount_cents = 450000', dealId)).toBe(1);
  });

  it('is 404 for a deal that does not exist', async () => {
    const res = await patchDeal(999999, { amount_cents: 1000 });
    expect(res.status).toBe(404);
  });
});

describe('won deal amounts reach the board card', () => {
  it('sums won deals into deal_amount_cents and ignores open ones', async () => {
    await createDeal(leadId, { amount_cents: 450000, status: 'won' });
    await createDeal(leadId, { amount_cents: 120000, status: 'won' });
    await createDeal(leadId, { amount_cents: 999999, status: 'open' });

    const res = await callJson<{
      stages: Array<{ id: string; leads: Array<{ id: number; deal_amount_cents: number }> }>;
    }>('/api/board', { as: OPERATOR });

    const card = res.body.stages
      .flatMap((s) => s.leads)
      .find((l) => l.id === leadId);
    expect(card?.deal_amount_cents).toBe(570000);
  });

  it('is 0, not null, for a lead with no deals', async () => {
    const res = await callJson<{ deal_amount_cents: number }>(`/api/leads/${leadId}`, {
      as: OPERATOR,
    });
    expect(res.body.deal_amount_cents).toBe(0);
  });
});
