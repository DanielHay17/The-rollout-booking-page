/**
 * Drag-and-drop ordering: POST /api/leads/:id/stage.
 *
 * Every test here asserts the resulting ORDER of the column, not just that the
 * request returned 200. A midpoint insert that returns a number which happens
 * to sort wrongly is the exact failure this endpoint exists to prevent, and a
 * status-code-only test would sail straight past it.
 *
 * The renumbering case is the one that matters most over time: halving a 1000
 * gap about twenty-four times exhausts the usable precision of a REAL, so a
 * column that has been reordered enough WILL collapse, and the recovery has to
 * put the card where the operator dropped it.
 */

import { describe, expect, it } from 'vitest';
import { OPERATOR, callJson, columnOrder, insertLead, rankOf, stageChangesFor } from './helpers';

interface StageReply {
  ok?: boolean;
  lead?: { id: number; status: string; board_rank: number | null };
  error?: string;
}

function drop(
  id: number,
  to: string,
  neighbours: { after_id?: number | null; before_id?: number | null } = {},
) {
  return callJson<StageReply>(`/api/leads/${id}/stage`, {
    method: 'POST',
    as: OPERATOR,
    body: { to, ...neighbours },
  });
}

/** Three ranked cards in `engaged`, plus one card sitting in `new`. */
async function threeInEngaged(): Promise<{ a: number; b: number; c: number; moving: number }> {
  const a = await insertLead({ email: 'a@example.test', status: 'engaged', board_rank: 1000 });
  const b = await insertLead({ email: 'b@example.test', status: 'engaged', board_rank: 2000 });
  const c = await insertLead({ email: 'c@example.test', status: 'engaged', board_rank: 3000 });
  const moving = await insertLead({ email: 'moving@example.test', status: 'new', board_rank: 1000 });
  return { a, b, c, moving };
}

describe('dropping between two cards', () => {
  it('gives a rank strictly between the neighbours', async () => {
    const { a, b, moving } = await threeInEngaged();
    const res = await drop(moving, 'engaged', { after_id: a, before_id: b });

    expect(res.status).toBe(200);
    const rank = res.body.lead?.board_rank;
    expect(typeof rank).toBe('number');
    expect(rank as number).toBeGreaterThan(1000);
    expect(rank as number).toBeLessThan(2000);
  });

  it('and lands in that position in the column', async () => {
    const { a, b, c, moving } = await threeInEngaged();
    await drop(moving, 'engaged', { after_id: a, before_id: b });
    expect(await columnOrder('engaged')).toEqual([a, moving, b, c]);
  });

  it('tolerates a client that sends the two neighbours the wrong way round', async () => {
    const { a, b, c, moving } = await threeInEngaged();
    await drop(moving, 'engaged', { after_id: b, before_id: a });
    expect(await columnOrder('engaged')).toEqual([a, moving, b, c]);
  });

  it('writes a stage_change event when the column changes', async () => {
    const { a, b, moving } = await threeInEngaged();
    await drop(moving, 'engaged', { after_id: a, before_id: b });
    expect(await stageChangesFor(moving)).toEqual([{ from: 'new', to: 'engaged' }]);
  });

  it('writes no stage_change event for a reorder inside one column', async () => {
    const { a, b, c } = await threeInEngaged();
    await drop(c, 'engaged', { after_id: a, before_id: b });
    expect(await stageChangesFor(c)).toEqual([]);
    expect(await columnOrder('engaged')).toEqual([a, c, b]);
  });

  it('reorders within a column, moving a card upwards', async () => {
    const { a, b, c } = await threeInEngaged();
    await drop(c, 'engaged', { after_id: a, before_id: b });
    expect(await columnOrder('engaged')).toEqual([a, c, b]);
  });

  it('reorders within a column, moving a card downwards', async () => {
    const { a, b, c } = await threeInEngaged();
    await drop(a, 'engaged', { after_id: b, before_id: c });
    expect(await columnOrder('engaged')).toEqual([b, a, c]);
  });
});

describe('dropping into an empty column', () => {
  it('works and starts the column at the rank step', async () => {
    const { moving } = await threeInEngaged();
    const res = await drop(moving, 'parked');
    expect(res.status).toBe(200);
    expect(res.body.lead?.status).toBe('parked');
    // Not 0: an empty column starts at 1000 so something can still be dropped
    // above the first card later.
    expect(res.body.lead?.board_rank).toBe(1000);
    expect(await columnOrder('parked')).toEqual([moving]);
  });

  it('works when the client still names stale neighbours from the old column', async () => {
    // A drag-and-drop library commonly reports the neighbours it saw last. A
    // neighbour that is not in the destination column must be ignored, not
    // allowed to compute a nonsense rank.
    const { a, b, moving } = await threeInEngaged();
    const res = await drop(moving, 'parked', { after_id: a, before_id: b });
    expect(res.status).toBe(200);
    expect(res.body.lead?.board_rank).toBe(1000);
    expect(await columnOrder('parked')).toEqual([moving]);
  });

  it('works when the client names the dragged card as its own neighbour', async () => {
    const { moving } = await threeInEngaged();
    const res = await drop(moving, 'parked', { after_id: moving, before_id: moving });
    expect(res.status).toBe(200);
    expect(await columnOrder('parked')).toEqual([moving]);
  });

  it('is ignored for a neighbour id that does not exist', async () => {
    const { moving } = await threeInEngaged();
    const res = await drop(moving, 'parked', { after_id: 987654 });
    expect(res.status).toBe(200);
    expect(await columnOrder('parked')).toEqual([moving]);
  });
});

describe('dropping at the very top', () => {
  it('lands above every existing card', async () => {
    const { a, b, c, moving } = await threeInEngaged();
    const res = await drop(moving, 'engaged', { before_id: a });
    expect(res.status).toBe(200);
    expect(res.body.lead?.board_rank as number).toBeLessThan(1000);
    expect(await columnOrder('engaged')).toEqual([moving, a, b, c]);
  });

  it('keeps working when the top rank is already at or below zero', async () => {
    // Ranks are a REAL column and are perfectly happy going negative, which is
    // what makes repeated drops at the top cheap instead of forcing a renumber.
    const top = await insertLead({ email: 'top@example.test', status: 'engaged', board_rank: 0 });
    const one = await insertLead({ email: 'one@example.test', status: 'new', board_rank: 1000 });
    const two = await insertLead({ email: 'two@example.test', status: 'new', board_rank: 2000 });

    await drop(one, 'engaged', { before_id: top });
    await drop(two, 'engaged', { before_id: one });
    expect(await columnOrder('engaged')).toEqual([two, one, top]);
    expect(await rankOf(two) as number).toBeLessThan(await rankOf(one) as number);
  });
});

describe('dropping at the very bottom', () => {
  it('lands below every existing card', async () => {
    const { a, b, c, moving } = await threeInEngaged();
    const res = await drop(moving, 'engaged', { after_id: c });
    expect(res.status).toBe(200);
    expect(res.body.lead?.board_rank as number).toBeGreaterThan(3000);
    expect(await columnOrder('engaged')).toEqual([a, b, c, moving]);
  });

  it('appends when no neighbours are given at all', async () => {
    const { a, b, c, moving } = await threeInEngaged();
    const res = await drop(moving, 'engaged');
    expect(res.status).toBe(200);
    expect(res.body.lead?.board_rank).toBe(4000);
    expect(await columnOrder('engaged')).toEqual([a, b, c, moving]);
  });
});

describe('a destination column whose ranks have collapsed', () => {
  /**
   * Two neighbours closer together than MIN_GAP (0.0001). This is what a column
   * looks like after enough midpoint inserts between the same two cards.
   */
  async function collapsedColumn(): Promise<{ a: number; b: number; c: number; moving: number }> {
    const a = await insertLead({ email: 'ca@example.test', status: 'engaged', board_rank: 1000 });
    const b = await insertLead({
      email: 'cb@example.test', status: 'engaged', board_rank: 1000.00004,
    });
    const c = await insertLead({ email: 'cc@example.test', status: 'engaged', board_rank: 5000 });
    const moving = await insertLead({ email: 'cm@example.test', status: 'new', board_rank: 1000 });
    return { a, b, c, moving };
  }

  it('is renumbered and the insert still lands in the requested position', async () => {
    const { a, b, c, moving } = await collapsedColumn();
    const res = await drop(moving, 'engaged', { after_id: a, before_id: b });
    expect(res.status).toBe(200);

    // The ORDER is the contract, not the status code.
    expect(await columnOrder('engaged')).toEqual([a, moving, b, c]);
  });

  it('and the column comes out on clean, well-separated ranks', async () => {
    const { a, b, c, moving } = await collapsedColumn();
    await drop(moving, 'engaged', { after_id: a, before_id: b });

    const ranks = await Promise.all([a, moving, b, c].map(rankOf));
    expect(ranks.every((r) => typeof r === 'number')).toBe(true);
    const numeric = ranks as number[];
    // Strictly ascending in the order the cards now appear...
    for (let i = 1; i < numeric.length; i += 1) {
      expect(numeric[i] as number).toBeGreaterThan(numeric[i - 1] as number);
    }
    // ...and no longer collapsed, so the next drop does not need a renumber.
    expect((numeric[2] as number) - (numeric[1] as number)).toBeGreaterThan(0.0001);
    expect(numeric[0]).toBe(1000);
    expect(numeric[3]).toBe(3000);
  });

  it('survives repeated drops between the same two cards', async () => {
    // The precision-exhaustion scenario, driven for real rather than asserted
    // about: twenty-five successive midpoint inserts between the top two cards.
    const a = await insertLead({ email: 'ra@example.test', status: 'engaged', board_rank: 1000 });
    const b = await insertLead({ email: 'rb@example.test', status: 'engaged', board_rank: 2000 });

    let above = a;
    const dropped: number[] = [];
    for (let i = 0; i < 25; i += 1) {
      const id = await insertLead({
        email: `rep${i}@example.test`, status: 'new', board_rank: 1000,
      });
      const res = await drop(id, 'engaged', { after_id: above, before_id: b });
      expect(res.status, `drop ${i}`).toBe(200);
      dropped.push(id);
      above = id;
    }

    // Each card was dropped directly beneath the previous one, so the column
    // must read a, then the dropped cards in order, then b.
    expect(await columnOrder('engaged')).toEqual([a, ...dropped, b]);
  });

  it('handles a neighbour that has no rank at all', async () => {
    // Leads can arrive unranked (an old row, or a hand-written INSERT). The
    // column has to be numbered before a drop between two of them can be placed.
    const a = await insertLead({ email: 'na@example.test', status: 'engaged', board_rank: null });
    const b = await insertLead({ email: 'nb@example.test', status: 'engaged', board_rank: null });
    const moving = await insertLead({ email: 'nm@example.test', status: 'new', board_rank: 1000 });

    const res = await drop(moving, 'engaged', { after_id: a, before_id: b });
    expect(res.status).toBe(200);
    expect(await columnOrder('engaged')).toEqual([a, moving, b]);
    expect(await rankOf(a)).not.toBeNull();
    expect(await rankOf(b)).not.toBeNull();
  });

  it('renumbers legacy-status rows in the same column, not just current ones', async () => {
    // `engaged` has no legacy equivalent, but `new` does (`never_called`), and a
    // renumber that skipped those rows would scramble the column.
    const legacy = await insertLead({
      email: 'legacy@example.test', status: 'never_called', board_rank: 1000,
    });
    const current = await insertLead({
      email: 'current@example.test', status: 'new', board_rank: 1000.00002,
    });
    const moving = await insertLead({
      email: 'mover@example.test', status: 'engaged', board_rank: 1000,
    });

    const res = await drop(moving, 'new', { after_id: legacy, before_id: current });
    expect(res.status).toBe(200);

    // The board normalises `never_called` into `new`, so this is the order the
    // operator actually sees. A renumber that skipped the legacy row would put
    // the dropped card in the wrong place here.
    const board = await callJson<{
      stages: Array<{ id: string; leads: Array<{ id: number }> }>;
    }>('/api/board', { as: OPERATOR });
    const column = board.body.stages.find((s) => s.id === 'new');
    expect(column?.leads.map((l) => l.id)).toEqual([legacy, moving, current]);

    const numeric = (await Promise.all([legacy, moving, current].map(rankOf))) as number[];
    for (let i = 1; i < numeric.length; i += 1) {
      expect(numeric[i] as number).toBeGreaterThan(numeric[i - 1] as number);
    }
  });
});

describe('POST /api/leads/:id/stage validates its input', () => {
  it('rejects a missing or invalid destination', async () => {
    const { moving } = await threeInEngaged();
    for (const to of [undefined, '', 'nowhere', 'never_called', 42, null]) {
      const res = await callJson<StageReply>(`/api/leads/${moving}/stage`, {
        method: 'POST',
        as: OPERATOR,
        body: to === undefined ? {} : { to },
      });
      expect(res.status, String(to)).toBe(400);
      expect(res.body.error).toBe('bad status');
    }
  });

  it('rejects a non-numeric neighbour id rather than silently appending', async () => {
    const { moving } = await threeInEngaged();
    const res = await callJson<StageReply>(`/api/leads/${moving}/stage`, {
      method: 'POST',
      as: OPERATOR,
      body: { to: 'engaged', after_id: 'abc' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('bad after_id');
  });

  it('is 404 for a lead that does not exist', async () => {
    const res = await drop(999999, 'engaged');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/board renders the column order it was given', () => {
  it('returns each column in board_rank order', async () => {
    const { a, b, c, moving } = await threeInEngaged();
    await drop(moving, 'engaged', { after_id: a, before_id: b });

    const res = await callJson<{
      stages: Array<{ id: string; count: number; leads: Array<{ id: number }> }>;
    }>('/api/board', { as: OPERATOR });

    const engaged = res.body.stages.find((s) => s.id === 'engaged');
    expect(engaged?.leads.map((l) => l.id)).toEqual([a, moving, b, c]);
    expect(engaged?.count).toBe(4);

    // And the seven columns come back in the documented order.
    expect(res.body.stages.map((s) => s.id)).toEqual([
      'new', 'attempting', 'engaged', 'booked', 'won', 'lost', 'parked',
    ]);
  });
});
