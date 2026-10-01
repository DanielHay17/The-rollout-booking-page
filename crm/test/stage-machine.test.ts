/**
 * The stage machine.
 *
 * The rule that matters is "logging a contact never downgrades a lead". It is
 * the rule an operator notices immediately when it breaks: he rings a booked
 * lead to confirm, gets no answer, logs it, and the card he spent a week
 * getting into Booked drops back into Attempting. Each of the ways that can
 * happen gets its own assertion here.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { OPERATOR, callJson, countRows, insertLead, leadRow, stageChangesFor } from './helpers';
import { stageAfterContact } from '../src/leads';
import { normaliseStage, parseStage } from '../src/stages';
import { OUTCOMES, STAGES } from '../src/types';
import type { Outcome, Stage } from '../src/types';

interface LeadReply {
  ok?: boolean;
  lead?: { id: number; status: Stage };
  error?: string;
  detail?: string;
}

function logContact(id: number, outcome: string, channel = 'call') {
  return callJson<LeadReply>(`/api/leads/${id}/calls`, {
    method: 'POST',
    as: OPERATOR,
    body: { channel, outcome },
  });
}

function patchLead(id: number, body: unknown) {
  return callJson<LeadReply>(`/api/leads/${id}`, { method: 'PATCH', as: OPERATOR, body });
}

// ---------------------------------------------------------------- pure rules --

describe('stageAfterContact', () => {
  it('never downgrades: a no_answer against a booked lead moves nothing', () => {
    expect(stageAfterContact('booked', 'no_answer')).toBeNull();
    expect(stageAfterContact('booked', 'voicemail')).toBeNull();
    expect(stageAfterContact('booked', 'recall')).toBeNull();
    expect(stageAfterContact('booked', 'wrong_number')).toBeNull();
    expect(stageAfterContact('booked', 'connected')).toBeNull();
    expect(stageAfterContact('booked', 'replied')).toBeNull();
    expect(stageAfterContact('booked', 'sent')).toBeNull();
  });

  it('never moves a won lead, whatever the outcome', () => {
    for (const outcome of OUTCOMES) {
      expect(stageAfterContact('won', outcome), outcome).toBeNull();
    }
  });

  it('moves not_interested to lost from anywhere still in play', () => {
    for (const stage of ['new', 'attempting', 'engaged', 'booked', 'parked'] as Stage[]) {
      expect(stageAfterContact(stage, 'not_interested'), stage).toBe('lost');
    }
    // Already there, or already a customer: no move.
    expect(stageAfterContact('lost', 'not_interested')).toBeNull();
    expect(stageAfterContact('won', 'not_interested')).toBeNull();
  });

  it('lifts a new or attempting lead to engaged on real two-way contact', () => {
    for (const outcome of ['connected', 'replied', 'sent'] as Outcome[]) {
      expect(stageAfterContact('new', outcome), outcome).toBe('engaged');
      expect(stageAfterContact('attempting', outcome), outcome).toBe('engaged');
      expect(stageAfterContact('engaged', outcome), outcome).toBeNull();
    }
  });

  it('only lifts a never-tried lead to attempting', () => {
    for (const outcome of ['no_answer', 'voicemail', 'recall', 'wrong_number'] as Outcome[]) {
      expect(stageAfterContact('new', outcome), outcome).toBe('attempting');
      expect(stageAfterContact('attempting', outcome), outcome).toBeNull();
      expect(stageAfterContact('engaged', outcome), outcome).toBeNull();
      // A deliberately parked or dead lead is not dragged back by a missed call.
      expect(stageAfterContact('parked', outcome), outcome).toBeNull();
      expect(stageAfterContact('lost', outcome), outcome).toBeNull();
    }
  });

  it('books from anywhere, including reviving a lost lead', () => {
    for (const stage of ['new', 'attempting', 'engaged', 'lost', 'parked'] as Stage[]) {
      expect(stageAfterContact(stage, 'booked'), stage).toBe('booked');
    }
    expect(stageAfterContact('booked', 'booked')).toBeNull();
  });

  it('says nothing about the stage for no_show and other', () => {
    for (const stage of STAGES) {
      expect(stageAfterContact(stage, 'no_show'), stage).toBeNull();
      expect(stageAfterContact(stage, 'other'), stage).toBeNull();
    }
  });

  it('only ever returns a live stage, never a legacy one', () => {
    for (const stage of STAGES) {
      for (const outcome of OUTCOMES) {
        const next = stageAfterContact(stage, outcome);
        if (next !== null) expect(STAGES).toContain(next);
      }
    }
  });
});

describe('legacy statuses', () => {
  it('normalise on read and are never produced by parseStage', () => {
    expect(normaliseStage('never_called')).toBe('new');
    expect(normaliseStage('follow_up')).toBe('attempting');
    expect(normaliseStage('done')).toBe('lost');
    expect(normaliseStage(null)).toBe('new');
    expect(normaliseStage('nonsense')).toBe('new');

    expect(parseStage('never_called')).toBeNull();
    expect(parseStage('follow_up')).toBeNull();
    expect(parseStage('done')).toBeNull();
  });

  it('a lead stored as never_called reads as new through the API', async () => {
    const id = await insertLead({ email: 'legacy@example.test', status: 'never_called' });
    const res = await callJson<{ status: string }>(`/api/leads/${id}`, { as: OPERATOR });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('new');
  });
});

// -------------------------------------------------------- through the API ----

describe('POST /api/leads/:id/calls does not downgrade', () => {
  let bookedId: number;

  beforeEach(async () => {
    bookedId = await insertLead({
      email: 'booked.lead@example.test',
      first_name: 'Harriet',
      status: 'booked',
      board_rank: 1000,
      booked_at: '2026-09-28 03:00:00',
    });
  });

  it('a no_answer against a booked lead leaves it booked', async () => {
    const res = await logContact(bookedId, 'no_answer');
    expect(res.status).toBe(200);
    expect(res.body.lead?.status).toBe('booked');
    expect(await leadRow(bookedId).then((r) => r?.['status'])).toBe('booked');
  });

  it('and writes no stage_change event at all', async () => {
    await logContact(bookedId, 'no_answer');
    expect(await stageChangesFor(bookedId)).toEqual([]);
    // The call itself IS recorded — the attempt is not lost, only the downgrade.
    expect(await countRows('calls', 'lead_id = ?', bookedId)).toBe(1);
    expect(await countRows('lead_events', "lead_id = ? AND type = 'contact'", bookedId)).toBe(1);
  });

  it('and does not clear booked_at', async () => {
    await logContact(bookedId, 'no_answer');
    const lead = await leadRow(bookedId);
    expect(lead?.['booked_at']).toBe('2026-09-28 03:00:00');
  });

  it.each(['no_answer', 'voicemail', 'recall', 'wrong_number', 'connected', 'replied', 'sent', 'no_show', 'other'])(
    'outcome %s leaves a booked lead booked',
    async (outcome) => {
      const res = await logContact(bookedId, outcome, outcome === 'sent' || outcome === 'replied' ? 'email' : 'call');
      expect(res.status).toBe(200);
      expect(res.body.lead?.status).toBe('booked');
    },
  );
});

describe('POST /api/leads/:id/calls never moves a won lead', () => {
  let wonId: number;

  beforeEach(async () => {
    wonId = await insertLead({
      email: 'won.lead@example.test',
      status: 'won',
      board_rank: 1000,
      won_at: '2026-09-25 03:00:00',
    });
  });

  it.each(OUTCOMES)('outcome %s leaves the customer won', async (outcome) => {
    const channel = outcome === 'sent' || outcome === 'replied' ? 'email' : 'call';
    const res = await logContact(wonId, outcome, channel);
    expect(res.status).toBe(200);
    expect(res.body.lead?.status).toBe('won');
    expect(await stageChangesFor(wonId)).toEqual([]);
  });

  it('keeps won_at intact after a whole round of logging', async () => {
    for (const outcome of OUTCOMES) {
      await logContact(wonId, outcome, outcome === 'sent' || outcome === 'replied' ? 'email' : 'call');
    }
    const lead = await leadRow(wonId);
    expect(lead?.['status']).toBe('won');
    expect(lead?.['won_at']).toBe('2026-09-25 03:00:00');
  });
});

describe('POST /api/leads/:id/calls moves a lead forward when it should', () => {
  it('not_interested moves the lead to lost and stamps lost_at', async () => {
    const id = await insertLead({ email: 'nope@example.test', status: 'engaged', board_rank: 1000 });
    const res = await logContact(id, 'not_interested');
    expect(res.status).toBe(200);
    expect(res.body.lead?.status).toBe('lost');

    const lead = await leadRow(id);
    expect(lead?.['status']).toBe('lost');
    expect(lead?.['lost_at']).toBeTruthy();
    expect(await stageChangesFor(id)).toEqual([{ from: 'engaged', to: 'lost' }]);
  });

  it('connected lifts a new lead to engaged', async () => {
    const id = await insertLead({ email: 'fresh@example.test', status: 'new', board_rank: 1000 });
    const res = await logContact(id, 'connected');
    expect(res.body.lead?.status).toBe('engaged');
    expect(await stageChangesFor(id)).toEqual([{ from: 'new', to: 'engaged' }]);
  });

  it('booked moves a lead to booked and stamps booked_at', async () => {
    const id = await insertLead({ email: 'diary@example.test', status: 'attempting', board_rank: 1000 });
    const res = await logContact(id, 'booked');
    expect(res.body.lead?.status).toBe('booked');
    const lead = await leadRow(id);
    expect(lead?.['booked_at']).toBeTruthy();
  });

  it('a legacy follow_up lead advances from attempting, not from new', async () => {
    const id = await insertLead({ email: 'legacy.followup@example.test', status: 'follow_up' });
    const res = await logContact(id, 'no_answer');
    // Already "attempting" once normalised, so nothing moves.
    expect(res.body.lead?.status).toBe('attempting');
    expect(await stageChangesFor(id)).toEqual([]);
  });

  it('records the attempt count the board shows', async () => {
    const id = await insertLead({ email: 'attempts@example.test', status: 'new', board_rank: 1000 });
    await logContact(id, 'no_answer');
    await logContact(id, 'voicemail');
    const res = await callJson<{ attempts: number }>(`/api/leads/${id}`, { as: OPERATOR });
    expect(res.body.attempts).toBe(2);
  });
});

describe('contact logging validates its input', () => {
  let id: number;
  beforeEach(async () => {
    id = await insertLead({ email: 'validate@example.test', status: 'new', board_rank: 1000 });
  });

  it.each([
    [{ channel: 'carrier-pigeon', outcome: 'no_answer' }, 'bad channel'],
    [{ channel: 'call', outcome: 'ghosted' }, 'bad outcome'],
    [{ channel: 'call' }, 'bad outcome'],
    [{ outcome: 'no_answer' }, 'bad channel'],
    [{ channel: 'call', outcome: 'no_answer', duration_s: -1 }, 'bad duration_s'],
    [{ channel: 'call', outcome: 'no_answer', duration_s: 1.5 }, 'bad duration_s'],
  ])('rejects %j with 400', async (body, error) => {
    const res = await callJson<LeadReply>(`/api/leads/${id}/calls`, {
      method: 'POST',
      as: OPERATOR,
      body,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(error);
    expect(await countRows('calls', 'lead_id = ?', id)).toBe(0);
  });

  it('is 404 for a lead that does not exist', async () => {
    const res = await callJson(`/api/leads/999999/calls`, {
      method: 'POST',
      as: OPERATOR,
      body: { channel: 'call', outcome: 'no_answer' },
    });
    expect(res.status).toBe(404);
  });
});

// -------------------------------------------------------------- PATCH rules ---

describe('PATCH /api/leads/:id', () => {
  let id: number;

  beforeEach(async () => {
    id = await insertLead({
      email: 'patch.me@example.test',
      status: 'new',
      board_rank: 1000,
      priority: null,
    });
  });

  it.each(['zombie', 'never_called', 'follow_up', 'done', '', 'NEW ME', 'win', 'won!', 'wo n'])(
    'rejects an invalid stage %j with 400 bad status',
    async (status) => {
      const res = await patchLead(id, { status });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('bad status');
      expect(await leadRow(id).then((r) => r?.['status'])).toBe('new');
    },
  );

  it.each([' won ', 'WON', 'Booked', '\tengaged\n'])(
    'accepts %j — case and surrounding whitespace are deliberately tolerated',
    async (status) => {
      // parseStage trims and lower-cases on purpose, so a UI that sends the
      // label casing does not get a spurious 400. The stage STORED is always
      // the canonical lower-case id.
      const res = await patchLead(id, { status });
      expect(res.status).toBe(200);
      expect(await leadRow(id).then((r) => r?.['status'])).toBe(status.trim().toLowerCase());
    },
  );

  it('rejects a non-string status', async () => {
    for (const status of [1, true, null, {}, []]) {
      const res = await patchLead(id, { status });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('bad status');
    }
  });

  it('accepts each of the seven live stages', async () => {
    for (const stage of STAGES) {
      const res = await patchLead(id, { status: stage });
      expect(res.status, stage).toBe(200);
      expect(res.body.lead?.status).toBe(stage);
    }
  });

  it('rejects an unknown body key with 400 rather than ignoring it', async () => {
    const res = await patchLead(id, { wibble: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('unknown field');
    expect(res.body.detail).toContain('wibble');
  });

  it('rejects an unknown key even when a valid key is present, and applies neither', async () => {
    // A typo that quietly does nothing is worse than an error: the operator
    // believes the edit was saved.
    const res = await patchLead(id, { priority: 'high', wibbel: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('unknown field');
    const lead = await leadRow(id);
    expect(lead?.['priority']).toBeNull();
  });

  it.each(['email', 'id', 'created_at', 'survey_raw', 'beehiiv_id', 'won_at', 'attempts'])(
    'refuses to edit %s',
    async (field) => {
      const res = await patchLead(id, { [field]: 'x' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('unknown field');
    },
  );

  it('rejects an empty body', async () => {
    const res = await patchLead(id, {});
    expect(res.status).toBe(400);
  });

  it('writes a stage_change event and maintains the stage timestamps', async () => {
    await patchLead(id, { status: 'booked' });
    await patchLead(id, { status: 'won' });
    await patchLead(id, { status: 'lost' });

    expect(await stageChangesFor(id)).toEqual([
      { from: 'new', to: 'booked' },
      { from: 'booked', to: 'won' },
      { from: 'won', to: 'lost' },
    ]);
    const lead = await leadRow(id);
    expect(lead?.['booked_at']).toBeTruthy();
    expect(lead?.['won_at']).toBeTruthy();
    expect(lead?.['lost_at']).toBeTruthy();
    expect(lead?.['stage_changed_at']).toBeTruthy();
  });

  it('writes no stage_change event when the status is unchanged', async () => {
    await patchLead(id, { status: 'new', priority: 'high' });
    expect(await stageChangesFor(id)).toEqual([]);
    expect(await leadRow(id).then((r) => r?.['priority'])).toBe('high');
  });

  it('stores an empty string as NULL', async () => {
    await patchLead(id, { notes: 'something' });
    await patchLead(id, { notes: '' });
    expect(await leadRow(id).then((r) => r?.['notes'])).toBeNull();
  });

  it('rejects a next_action_at that is not a calendar date', async () => {
    for (const bad of ['tomorrow', '2026-13-01', '2026-02-30', '01/10/2026']) {
      const res = await patchLead(id, { next_action_at: bad });
      expect(res.status, bad).toBe(400);
      expect(res.body.error).toBe('bad next_action_at');
    }
  });

  it('keeps next_action_at as a date, dropping any time component', async () => {
    await patchLead(id, { next_action_at: '2026-10-07T09:30:00Z' });
    expect(await leadRow(id).then((r) => r?.['next_action_at'])).toBe('2026-10-07');
  });

  it('is 404 for a lead that does not exist', async () => {
    const res = await patchLead(999999, { priority: 'high' });
    expect(res.status).toBe(404);
  });
});
