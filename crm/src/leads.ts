/**
 * Everything that reads or writes a lead: the Kanban board, the filtered list,
 * the detail view, field edits, drag-and-drop ordering, contact logging and
 * deals.
 *
 * Two invariants hold throughout:
 *   1. every `status` leaving here has been through `normaliseStage`;
 *   2. every `status` written here is one of the seven live stages.
 */

import type { Env, Stage, LeadCard, Call, LeadEvent, Deal, BoardColumn, BoardTotals, Outcome, Channel } from './types';
import { STAGES, STAGE_LABELS, CHANNELS, OUTCOMES, DEAL_STATUSES } from './types';
import { normaliseStage, parseStage, dbValuesForStage, dbValuesForStages, CLOSED_STAGES, stageOrder } from './stages';
import {
  json, badRequest, notFound, isRecord, blankToNull, safeInt, safeFloat,
  clampLimit, isCalendarDate, likeTerm, tsExpr, addDays, operatorToday,
} from './util';

/**
 * How many cards one board column returns. `count` on the column is always the
 * TRUE total, so the UI can say "500 of 812" rather than quietly lying; the
 * full set is reachable through `/api/leads`. At today's volume (a few hundred
 * leads) nothing is ever truncated — this only stops the board payload growing
 * without bound later.
 */
const BOARD_COLUMN_LIMIT = 500;

/** Cap on `queue.next`, which is otherwise "every lead we have never rung". */
const QUEUE_NEXT_LIMIT = 200;

const SQL_ESCAPE = "ESCAPE '\\'";

// ------------------------------------------------------------- card loading --

const LEAD_CARD_SQL = `
  SELECT
    l.id, l.first_name, l.last_name, l.company, l.role, l.phone, l.email,
    l.status, l.priority, l.source, l.segment, l.owner,
    l.subscribed_at, l.next_action, l.next_action_at, l.board_rank,
    l.survey_help, l.survey_ai_stage,
    (SELECT COUNT(*)           FROM calls c WHERE c.lead_id = l.id) AS attempts,
    (SELECT MAX(c.called_at)   FROM calls c WHERE c.lead_id = l.id) AS last_contact,
    COALESCE((SELECT SUM(d.amount_cents) FROM deals d
              WHERE d.lead_id = l.id AND d.status = 'won'), 0)      AS deal_amount_cents
  FROM leads l`;

interface LeadCardRow {
  id: number;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  role: string | null;
  phone: string | null;
  email: string;
  status: string;
  priority: string | null;
  source: string | null;
  segment: string | null;
  owner: string | null;
  subscribed_at: string | null;
  next_action: string | null;
  next_action_at: string | null;
  board_rank: number | null;
  survey_help: string | null;
  survey_ai_stage: string | null;
  attempts: number;
  last_contact: string | null;
  deal_amount_cents: number;
}

function rowToCard(row: LeadCardRow, today: string): LeadCard {
  const due = row.next_action_at ? row.next_action_at.slice(0, 10) : null;
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    company: row.company,
    role: row.role,
    phone: row.phone,
    email: row.email,
    status: normaliseStage(row.status),
    priority: row.priority,
    source: row.source,
    segment: row.segment,
    owner: row.owner,
    subscribed_at: row.subscribed_at,
    next_action: row.next_action,
    next_action_at: row.next_action_at,
    board_rank: row.board_rank,
    attempts: Number(row.attempts ?? 0),
    last_contact: row.last_contact,
    survey_help: row.survey_help,
    survey_ai_stage: row.survey_ai_stage,
    deal_amount_cents: Number(row.deal_amount_cents ?? 0),
    is_overdue: due !== null && due < today,
  };
}

/** Reloads one card, which is what every write endpoint returns. */
export async function getLeadCard(env: Env, id: number, today: string): Promise<LeadCard | null> {
  const row = await env.DB.prepare(`${LEAD_CARD_SQL} WHERE l.id = ?`)
    .bind(id)
    .first<LeadCardRow>();
  return row ? rowToCard(row, today) : null;
}

function placeholders(n: number): string {
  return new Array(n).fill('?').join(', ');
}

// ----------------------------------------------------------------- the board --

export async function getBoard(env: Env): Promise<Response> {
  const today = operatorToday();
  const openStages = dbValuesForStages(STAGES.filter((s) => !CLOSED_STAGES.includes(s)));
  const openPh = placeholders(openStages.length);

  const [cardsResult, countsResult, totalsRow] = await Promise.all([
    env.DB.prepare(
      `${LEAD_CARD_SQL} ORDER BY l.board_rank IS NULL, l.board_rank ASC, l.id DESC LIMIT 5000`,
    ).all<LeadCardRow>(),
    env.DB.prepare('SELECT status, COUNT(*) AS n FROM leads GROUP BY status')
      .all<{ status: string; n: number }>(),
    env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM leads) AS leads,
         (SELECT COUNT(*) FROM leads WHERE status = 'booked') AS booked,
         (SELECT COUNT(*) FROM leads WHERE status = 'won') AS won,
         (SELECT COUNT(*) FROM leads
           WHERE substr(next_action_at, 1, 10) = ? AND status IN (${openPh})) AS due_today,
         (SELECT COUNT(*) FROM leads
           WHERE next_action_at IS NOT NULL
             AND substr(next_action_at, 1, 10) < ?
             AND status IN (${openPh})) AS overdue,
         (SELECT COUNT(*) FROM leads l
           WHERE l.status IN (${openPh})
             AND NOT EXISTS (SELECT 1 FROM calls c WHERE c.lead_id = l.id)) AS never_contacted`,
    )
      .bind(today, ...openStages, today, ...openStages, ...openStages)
      .first<BoardTotals>(),
  ]);

  // True per-column totals, independent of the card cap.
  const counts = new Map<Stage, number>(STAGES.map((s) => [s, 0]));
  for (const row of countsResult.results) {
    const stage = normaliseStage(row.status);
    counts.set(stage, (counts.get(stage) ?? 0) + Number(row.n ?? 0));
  }

  const grouped = new Map<Stage, LeadCard[]>(STAGES.map((s) => [s, []]));
  for (const row of cardsResult.results) {
    const bucket = grouped.get(normaliseStage(row.status));
    if (bucket && bucket.length < BOARD_COLUMN_LIMIT) bucket.push(rowToCard(row, today));
  }

  const stages: BoardColumn[] = STAGES.map((id) => ({
    id,
    label: STAGE_LABELS[id],
    count: counts.get(id) ?? 0,
    leads: grouped.get(id) ?? [],
  }));

  const totals: BoardTotals = {
    leads: Number(totalsRow?.leads ?? 0),
    booked: Number(totalsRow?.booked ?? 0),
    won: Number(totalsRow?.won ?? 0),
    due_today: Number(totalsRow?.due_today ?? 0),
    overdue: Number(totalsRow?.overdue ?? 0),
    never_contacted: Number(totalsRow?.never_contacted ?? 0),
  };

  return json({ stages, totals });
}

// ------------------------------------------------------------------ the list --

type Bind = string | number | null;

export async function listLeads(env: Env, url: URL): Promise<Response> {
  const today = operatorToday();
  const wheres: string[] = [];
  const binds: Bind[] = [];

  const rawStage = url.searchParams.get('stage');
  if (rawStage && rawStage !== '') {
    const stage = parseStage(rawStage);
    if (!stage) return badRequest('bad stage', `expected one of ${STAGES.join(', ')}`);
    const values = dbValuesForStage(stage);
    wheres.push(`l.status IN (${placeholders(values.length)})`);
    binds.push(...values);
  }

  const rawQ = url.searchParams.get('q');
  if (rawQ && rawQ.trim() !== '') {
    const term = likeTerm(rawQ.trim().toLowerCase());
    const clauses = [
      `lower(COALESCE(l.first_name, '') || ' ' || COALESCE(l.last_name, '')) LIKE ? ${SQL_ESCAPE}`,
      `lower(COALESCE(l.company, '')) LIKE ? ${SQL_ESCAPE}`,
      `lower(l.email) LIKE ? ${SQL_ESCAPE}`,
      `lower(COALESCE(l.phone, '')) LIKE ? ${SQL_ESCAPE}`,
    ];
    binds.push(term, term, term, term);

    // Phone numbers are stored however beehiiv supplied them, so also compare
    // digits-only: searching "0412 345" has to find "+61 412 345 678".
    const digits = rawQ.replace(/\D/g, '');
    if (digits.length >= 3) {
      clauses.push(
        `replace(replace(replace(replace(COALESCE(l.phone, ''), ' ', ''), '-', ''), '(', ''), ')', '') LIKE ? ${SQL_ESCAPE}`,
      );
      binds.push(`%${digits}%`);
    }
    wheres.push(`(${clauses.join(' OR ')})`);
  }

  const rawSource = url.searchParams.get('source');
  if (rawSource && rawSource.trim() !== '') {
    wheres.push("lower(COALESCE(l.source, '')) = ?");
    binds.push(rawSource.trim().toLowerCase());
  }

  const rawOwner = url.searchParams.get('owner');
  if (rawOwner && rawOwner.trim() !== '') {
    wheres.push("lower(COALESCE(l.owner, '')) = ?");
    binds.push(rawOwner.trim().toLowerCase());
  }

  const rawDue = url.searchParams.get('due');
  let orderBy = `${tsExpr('COALESCE(l.subscribed_at, l.created_at)')} DESC, l.id DESC`;
  if (rawDue && rawDue !== '') {
    const open = dbValuesForStages(STAGES.filter((s) => !CLOSED_STAGES.includes(s)));
    const openPh = placeholders(open.length);
    if (rawDue === 'today') {
      wheres.push(`substr(l.next_action_at, 1, 10) = ? AND l.status IN (${openPh})`);
      binds.push(today, ...open);
    } else if (rawDue === 'overdue') {
      wheres.push(
        `l.next_action_at IS NOT NULL AND substr(l.next_action_at, 1, 10) < ? AND l.status IN (${openPh})`,
      );
      binds.push(today, ...open);
    } else if (rawDue === 'week') {
      wheres.push(
        `substr(l.next_action_at, 1, 10) BETWEEN ? AND ? AND l.status IN (${openPh})`,
      );
      binds.push(today, addDays(today, 6), ...open);
    } else {
      return badRequest('bad due', 'expected today, overdue or week');
    }
    orderBy = 'substr(l.next_action_at, 1, 10) ASC, l.id ASC';
  }

  const where = wheres.length > 0 ? ` WHERE ${wheres.join(' AND ')}` : '';
  const limit = clampLimit(url.searchParams.get('limit'), 200, 1000);
  const offset = safeInt(url.searchParams.get('offset'), { min: 0 }) ?? 0;

  const [rows, totalRow] = await Promise.all([
    env.DB.prepare(`${LEAD_CARD_SQL}${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
      .bind(...binds, limit, offset)
      .all<LeadCardRow>(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM leads l${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
  ]);

  return json({
    leads: rows.results.map((row) => rowToCard(row, today)),
    total: Number(totalRow?.n ?? 0),
  });
}

// ---------------------------------------------------------------- the detail --

export async function getLeadDetail(env: Env, id: number): Promise<Response> {
  const today = operatorToday();
  const lead = await env.DB.prepare('SELECT * FROM leads WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!lead) return notFound();

  const [calls, events, deals, card] = await Promise.all([
    env.DB.prepare('SELECT * FROM calls WHERE lead_id = ? ORDER BY called_at DESC, id DESC')
      .bind(id)
      .all<Call>(),
    env.DB.prepare(
      'SELECT * FROM lead_events WHERE lead_id = ? ORDER BY created_at DESC, id DESC LIMIT 200',
    )
      .bind(id)
      .all<LeadEvent>(),
    env.DB.prepare('SELECT * FROM deals WHERE lead_id = ? ORDER BY created_at DESC, id DESC')
      .bind(id)
      .all<Deal>(),
    getLeadCard(env, id, today),
  ]);

  const rawStatus = typeof lead['status'] === 'string' ? lead['status'] : null;

  return json({
    ...lead,
    // Normalised, so the detail view and the board never disagree about a
    // lead still stored as `never_called`.
    status: normaliseStage(rawStatus),
    attempts: card?.attempts ?? 0,
    last_contact: card?.last_contact ?? null,
    deal_amount_cents: card?.deal_amount_cents ?? 0,
    is_overdue: card?.is_overdue ?? false,
    calls: calls.results,
    events: events.results,
    deals: deals.results,
  });
}

// ------------------------------------------------------------ stage plumbing --

/**
 * The writes that a stage change implies: the status itself, the
 * `stage_changed_at` clock, the stage's own timestamp, and the audit row that
 * the daily report is later rebuilt from.
 */
function stageChangeStatements(
  env: Env,
  leadId: number,
  from: Stage,
  to: Stage,
  actor: string,
  detail: string,
): D1PreparedStatement[] {
  const extra: string[] = [];
  if (to === 'booked') extra.push("booked_at = datetime('now')");
  if (to === 'won') extra.push("won_at = datetime('now')");
  if (to === 'lost') extra.push("lost_at = datetime('now')");
  const extraSql = extra.length > 0 ? `, ${extra.join(', ')}` : '';

  return [
    env.DB.prepare(
      `UPDATE leads
          SET status = ?, stage_changed_at = datetime('now'), updated_at = datetime('now')${extraSql}
        WHERE id = ?`,
    ).bind(to, leadId),
    env.DB.prepare(
      `INSERT INTO lead_events (lead_id, type, from_stage, to_stage, detail, actor)
       VALUES (?, 'stage_change', ?, ?, ?, ?)`,
    ).bind(leadId, from, to, detail, actor),
  ];
}

// ------------------------------------------------------------------- PATCH ----

const PATCH_FIELDS = [
  'status', 'priority', 'notes', 'next_action', 'next_action_at', 'phone',
  'first_name', 'last_name', 'company', 'role', 'website', 'owner', 'segment',
  'lost_reason', 'board_rank',
] as const;

type PatchField = (typeof PATCH_FIELDS)[number];

const INVALID = Symbol('invalid');

/**
 * `next_action_at` is a due DATE — the contract compares it against today — so
 * any time component is dropped rather than stored and then ignored.
 */
function parseDueDate(value: unknown): string | null | typeof INVALID {
  if (value === null) return null;
  if (typeof value !== 'string') return INVALID;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const datePart = trimmed.replace('T', ' ').slice(0, 10);
  return isCalendarDate(datePart) ? datePart : INVALID;
}

export async function patchLead(
  env: Env,
  id: number,
  body: unknown,
  actor: string,
): Promise<Response> {
  if (!isRecord(body)) return badRequest('bad body', 'expected a JSON object');

  const keys = Object.keys(body);
  const unknown = keys.filter((k) => !(PATCH_FIELDS as readonly string[]).includes(k));
  // Never silently drop a field: a typo that quietly does nothing is worse than
  // an error, because the operator believes the edit was saved.
  if (unknown.length > 0) {
    return badRequest('unknown field', `not editable: ${unknown.join(', ')}`);
  }
  if (keys.length === 0) return badRequest('bad body', 'no fields to update');

  const existing = await env.DB.prepare('SELECT id, status FROM leads WHERE id = ?')
    .bind(id)
    .first<{ id: number; status: string }>();
  if (!existing) return notFound();
  const currentStage = normaliseStage(existing.status);

  const sets: string[] = [];
  const binds: Bind[] = [];
  let nextStage: Stage | null = null;

  for (const key of keys as PatchField[]) {
    const value = body[key];

    if (key === 'status') {
      const stage = parseStage(value);
      if (!stage) return badRequest('bad status');
      nextStage = stage;
      continue;
    }

    if (key === 'board_rank') {
      if (value === null) {
        sets.push('board_rank = NULL');
        continue;
      }
      const rank = safeFloat(value);
      if (rank === null) return badRequest('bad board_rank', 'expected a finite number');
      sets.push('board_rank = ?');
      binds.push(rank);
      continue;
    }

    if (key === 'next_action_at') {
      const due = parseDueDate(value);
      if (due === INVALID) return badRequest('bad next_action_at', 'expected YYYY-MM-DD');
      sets.push('next_action_at = ?');
      binds.push(due);
      continue;
    }

    // Everything else is free text; "" means NULL, per the contract.
    if (value !== null && typeof value !== 'string') {
      return badRequest(`bad ${key}`, 'expected a string or null');
    }
    sets.push(`${key} = ?`);
    binds.push(value === null ? null : blankToNull(value));
  }

  const statements: D1PreparedStatement[] = [];
  if (sets.length > 0) {
    statements.push(
      env.DB.prepare(
        `UPDATE leads SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
      ).bind(...binds, id),
    );
  }
  if (nextStage && nextStage !== currentStage) {
    statements.push(
      ...stageChangeStatements(env, id, currentStage, nextStage, actor, 'edited'),
    );
  }

  // One batch, one transaction: the field edit and its audit row land together.
  if (statements.length > 0) await env.DB.batch(statements);

  const card = await getLeadCard(env, id, operatorToday());
  if (!card) return notFound();
  return json({ ok: true, lead: card });
}

// ------------------------------------------------------------- board ranking --

/** Below this, two neighbours' ranks are too close to insert between. */
const MIN_GAP = 0.0001;
const RANK_STEP = 1000;

interface NeighbourRow {
  id: number;
  board_rank: number | null;
  status: string;
}

/** A neighbour that is usable for arithmetic: in the column, and ranked. */
interface RankedNeighbour {
  id: number;
  board_rank: number;
}

async function neighbourIn(
  env: Env,
  stage: Stage,
  id: number | null,
  movingId: number,
): Promise<RankedNeighbour | null | 'needs-renumber'> {
  if (id === null) return null;
  // A card cannot be its own neighbour. A drag-and-drop library that reports
  // the dragged card as the one above or below it would otherwise have the
  // card's own rank fed into the midpoint, pinning it where it already was.
  if (id === movingId) return null;
  const row = await env.DB.prepare('SELECT id, board_rank, status FROM leads WHERE id = ?')
    .bind(id)
    .first<NeighbourRow>();
  // A neighbour that does not exist, or that the client thinks is in a column
  // it is not actually in, is treated as absent rather than as an error: the
  // drop still has to land somewhere sensible.
  if (!row) return null;
  if (normaliseStage(row.status) !== stage) return null;
  // A neighbour with no rank at all cannot be used for arithmetic, so the
  // column has to be numbered before the drop can be placed.
  if (row.board_rank === null) return 'needs-renumber';
  return { id: row.id, board_rank: row.board_rank };
}

/**
 * Rewrites a whole column's ranks to 1000, 2000, 3000... preserving the current
 * visual order. Called when the gap between two neighbours has collapsed below
 * `MIN_GAP`, which after enough midpoint inserts is inevitable: halving 1000
 * about 24 times exhausts the usable precision.
 */
async function renumberColumn(env: Env, stage: Stage): Promise<void> {
  const values = dbValuesForStage(stage);
  const rows = await env.DB.prepare(
    `SELECT id FROM leads
      WHERE status IN (${placeholders(values.length)})
      ORDER BY board_rank IS NULL, board_rank ASC, id ASC`,
  )
    .bind(...values)
    .all<{ id: number }>();

  const statements = rows.results.map((row, index) =>
    env.DB.prepare('UPDATE leads SET board_rank = ? WHERE id = ?')
      .bind((index + 1) * RANK_STEP, row.id),
  );
  // Chunked so a very long column cannot overflow one batch.
  for (let i = 0; i < statements.length; i += 50) {
    const chunk = statements.slice(i, i + 50);
    if (chunk.length > 0) await env.DB.batch(chunk);
  }
}

async function appendRank(env: Env, stage: Stage, movingId: number): Promise<number> {
  const values = dbValuesForStage(stage);
  const row = await env.DB.prepare(
    `SELECT MAX(board_rank) AS top FROM leads
      WHERE status IN (${placeholders(values.length)}) AND id <> ?`,
  )
    .bind(...values, movingId)
    .first<{ top: number | null }>();
  // An empty destination column starts at RANK_STEP rather than 0, leaving room
  // to drop something above it later.
  return (row?.top ?? 0) + RANK_STEP;
}

/**
 * The midpoint insert from API.md.
 *
 * `after_id` is the card ABOVE the drop, `before_id` the card BELOW it, so the
 * new rank belongs between them. Four shapes have to work:
 *   - between two cards        -> the midpoint
 *   - at the very bottom       -> above-card's rank + RANK_STEP
 *   - at the very top          -> below-card's rank - RANK_STEP (may go negative,
 *                                 which a REAL column is perfectly happy with)
 *   - into an empty column     -> RANK_STEP
 * When the midpoint would be unrepresentable the column is renumbered and the
 * whole calculation is retried once, against the fresh ranks.
 */
async function computeBoardRank(
  env: Env,
  stage: Stage,
  movingId: number,
  afterId: number | null,
  beforeId: number | null,
  allowRetry = true,
): Promise<number> {
  const above = await neighbourIn(env, stage, afterId, movingId);
  const below = await neighbourIn(env, stage, beforeId, movingId);

  if (above === 'needs-renumber' || below === 'needs-renumber') {
    if (!allowRetry) return appendRank(env, stage, movingId);
    await renumberColumn(env, stage);
    return computeBoardRank(env, stage, movingId, afterId, beforeId, false);
  }

  if (above && below) {
    // Tolerate a client that has the two the wrong way round.
    const lo = Math.min(above.board_rank, below.board_rank);
    const hi = Math.max(above.board_rank, below.board_rank);
    if (hi - lo < MIN_GAP) {
      if (!allowRetry) return appendRank(env, stage, movingId);
      await renumberColumn(env, stage);
      return computeBoardRank(env, stage, movingId, afterId, beforeId, false);
    }
    return lo + (hi - lo) / 2;
  }

  if (above) return above.board_rank + RANK_STEP;
  if (below) return below.board_rank - RANK_STEP;
  return appendRank(env, stage, movingId);
}

export async function moveStage(
  env: Env,
  id: number,
  body: unknown,
  actor: string,
): Promise<Response> {
  if (!isRecord(body)) return badRequest('bad body', 'expected a JSON object');

  const stage = parseStage(body['to']);
  if (!stage) return badRequest('bad status');

  const afterId = body['after_id'] === undefined || body['after_id'] === null
    ? null
    : safeInt(body['after_id'], { min: 1 });
  const beforeId = body['before_id'] === undefined || body['before_id'] === null
    ? null
    : safeInt(body['before_id'], { min: 1 });
  if (body['after_id'] !== undefined && body['after_id'] !== null && afterId === null) {
    return badRequest('bad after_id', 'expected a lead id');
  }
  if (body['before_id'] !== undefined && body['before_id'] !== null && beforeId === null) {
    return badRequest('bad before_id', 'expected a lead id');
  }

  const existing = await env.DB.prepare('SELECT id, status FROM leads WHERE id = ?')
    .bind(id)
    .first<{ id: number; status: string }>();
  if (!existing) return notFound();
  const currentStage = normaliseStage(existing.status);

  const rank = await computeBoardRank(env, stage, id, afterId, beforeId);

  const statements: D1PreparedStatement[] = [
    env.DB.prepare("UPDATE leads SET board_rank = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(rank, id),
  ];
  if (stage !== currentStage) {
    statements.push(...stageChangeStatements(env, id, currentStage, stage, actor, 'dragged'));
  }
  await env.DB.batch(statements);

  const card = await getLeadCard(env, id, operatorToday());
  if (!card) return notFound();
  return json({ ok: true, lead: card });
}

// ---------------------------------------------------------- contact logging --

interface ContactRule {
  target: Stage;
  /**
   * When true the move only happens if the lead is currently EARLIER in the
   * pipeline than the target — this is what implements API.md's "only from
   * new/attempting" columns without a second rule language.
   */
  onlyIfEarlier: boolean;
}

const CONTACT_RULES: Readonly<Record<Outcome, ContactRule | null>> = {
  // A booking is a booking, wherever the lead was sitting.
  booked: { target: 'booked', onlyIfEarlier: false },
  // Real two-way contact: only lifts a lead out of new/attempting.
  connected: { target: 'engaged', onlyIfEarlier: true },
  replied: { target: 'engaged', onlyIfEarlier: true },
  sent: { target: 'engaged', onlyIfEarlier: true },
  // Tried and failed: only moves a lead that has never been tried.
  no_answer: { target: 'attempting', onlyIfEarlier: true },
  voicemail: { target: 'attempting', onlyIfEarlier: true },
  recall: { target: 'attempting', onlyIfEarlier: true },
  wrong_number: { target: 'attempting', onlyIfEarlier: true },
  // An explicit no.
  not_interested: { target: 'lost', onlyIfEarlier: false },
  // Say nothing about the stage.
  no_show: null,
  other: null,
};

/**
 * The stage a contact log moves a lead to, or `null` to leave it alone.
 * Pure, so it can be reasoned about (and tested) without a database.
 */
export function stageAfterContact(current: Stage, outcome: Outcome): Stage | null {
  // A customer is never dragged back into the pipeline by a contact log.
  if (current === 'won') return null;
  const rule = CONTACT_RULES[outcome];
  if (!rule) return null;
  if (rule.target === current) return null;
  if (rule.onlyIfEarlier && stageOrder(current) >= stageOrder(rule.target)) return null;
  return rule.target;
}

export async function logContact(
  env: Env,
  id: number,
  body: unknown,
  actor: string,
): Promise<Response> {
  if (!isRecord(body)) return badRequest('bad body', 'expected a JSON object');

  const rawChannel = typeof body['channel'] === 'string' ? body['channel'].trim() : '';
  const rawOutcome = typeof body['outcome'] === 'string' ? body['outcome'].trim() : '';
  if (!(CHANNELS as readonly string[]).includes(rawChannel)) {
    return badRequest('bad channel', `expected one of ${CHANNELS.join(', ')}`);
  }
  if (!(OUTCOMES as readonly string[]).includes(rawOutcome)) {
    return badRequest('bad outcome', `expected one of ${OUTCOMES.join(', ')}`);
  }
  const channel = rawChannel as Channel;
  const outcome = rawOutcome as Outcome;

  const notes = blankToNull(body['notes']);
  let durationS: number | null = null;
  if (body['duration_s'] !== undefined && body['duration_s'] !== null) {
    durationS = safeInt(body['duration_s'], { min: 0, max: 86400 });
    if (durationS === null) return badRequest('bad duration_s', 'expected seconds as an integer');
  }

  const existing = await env.DB.prepare('SELECT id, status FROM leads WHERE id = ?')
    .bind(id)
    .first<{ id: number; status: string }>();
  if (!existing) return notFound();
  const currentStage = normaliseStage(existing.status);
  const nextStage = stageAfterContact(currentStage, outcome);

  const detailParts = [`${channel}/${outcome}`];
  if (notes) detailParts.push(notes.slice(0, 500));
  const detail = detailParts.join(' — ');

  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO calls (lead_id, channel, outcome, notes, actor, duration_s)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(id, channel, outcome, notes, actor, durationS),
    env.DB.prepare(
      `INSERT INTO lead_events (lead_id, type, from_stage, to_stage, detail, actor)
       VALUES (?, 'contact', ?, ?, ?, ?)`,
    ).bind(id, currentStage, nextStage ?? currentStage, detail, actor),
    env.DB.prepare("UPDATE leads SET updated_at = datetime('now') WHERE id = ?").bind(id),
  ];
  if (nextStage) {
    statements.push(
      ...stageChangeStatements(env, id, currentStage, nextStage, actor, `contact: ${outcome}`),
    );
  }
  await env.DB.batch(statements);

  const card = await getLeadCard(env, id, operatorToday());
  if (!card) return notFound();
  return json({ ok: true, lead: card });
}

// ------------------------------------------------------------------- deals ----

/**
 * `closed_at` is stored at midday UTC when only a date is supplied. Midday UTC
 * is the same calendar day in Sydney whichever side of DST it falls, so the
 * deal is reported on the day the operator meant.
 */
function parseClosedAt(value: unknown): string | null | typeof INVALID {
  if (value === null) return null;
  if (typeof value !== 'string') return INVALID;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const cleaned = trimmed.replace('T', ' ').replace(/Z$/i, '');
  const datePart = cleaned.slice(0, 10);
  if (!isCalendarDate(datePart)) return INVALID;
  if (cleaned.length <= 10) return `${datePart} 12:00:00`;
  return cleaned.slice(0, 19);
}

const DEAL_FIELDS = ['amount_cents', 'status', 'name', 'notes', 'closed_at'] as const;

async function dealById(env: Env, dealId: number): Promise<Deal | null> {
  return env.DB.prepare('SELECT * FROM deals WHERE id = ?').bind(dealId).first<Deal>();
}

export async function createDeal(
  env: Env,
  leadId: number,
  body: unknown,
  actor: string,
): Promise<Response> {
  if (!isRecord(body)) return badRequest('bad body', 'expected a JSON object');
  const unknown = Object.keys(body).filter((k) => !(DEAL_FIELDS as readonly string[]).includes(k));
  if (unknown.length > 0) return badRequest('unknown field', `not editable: ${unknown.join(', ')}`);

  const amount = safeInt(body['amount_cents'], { min: 0 });
  if (amount === null) {
    return badRequest('bad amount_cents', 'expected a non-negative integer number of cents');
  }

  let status = 'open';
  if (body['status'] !== undefined && body['status'] !== null) {
    const raw = typeof body['status'] === 'string' ? body['status'].trim() : '';
    if (!(DEAL_STATUSES as readonly string[]).includes(raw)) {
      return badRequest('bad status', `expected one of ${DEAL_STATUSES.join(', ')}`);
    }
    status = raw;
  }

  const closedAt = parseClosedAt(body['closed_at'] ?? null);
  if (closedAt === INVALID) return badRequest('bad closed_at', 'expected YYYY-MM-DD');

  const lead = await env.DB.prepare('SELECT id, status FROM leads WHERE id = ?')
    .bind(leadId)
    .first<{ id: number; status: string }>();
  if (!lead) return notFound();

  const stamped = status === 'won' ? (closedAt ?? `${operatorToday()} 12:00:00`) : closedAt;

  const inserted = await env.DB.prepare(
    `INSERT INTO deals (lead_id, name, amount_cents, status, closed_at, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(leadId, blankToNull(body['name']), amount, status, stamped, blankToNull(body['notes']))
    .run();

  const dealId = Number(inserted.meta.last_row_id);
  await applyDealSideEffects(env, leadId, lead.status, status, amount, dealId, actor);

  const deal = await dealById(env, dealId);
  if (!deal) return notFound('deal not found after insert');
  return json({ ok: true, deal });
}

export async function patchDeal(
  env: Env,
  dealId: number,
  body: unknown,
  actor: string,
): Promise<Response> {
  if (!isRecord(body)) return badRequest('bad body', 'expected a JSON object');
  const keys = Object.keys(body);
  const unknown = keys.filter((k) => !(DEAL_FIELDS as readonly string[]).includes(k));
  if (unknown.length > 0) return badRequest('unknown field', `not editable: ${unknown.join(', ')}`);
  if (keys.length === 0) return badRequest('bad body', 'no fields to update');

  const existing = await dealById(env, dealId);
  if (!existing) return notFound();

  const sets: string[] = [];
  const binds: Bind[] = [];
  let nextStatus: string | null = null;
  let amount = existing.amount_cents;

  if (body['amount_cents'] !== undefined) {
    const parsed = safeInt(body['amount_cents'], { min: 0 });
    if (parsed === null) {
      return badRequest('bad amount_cents', 'expected a non-negative integer number of cents');
    }
    amount = parsed;
    sets.push('amount_cents = ?');
    binds.push(parsed);
  }

  if (body['status'] !== undefined) {
    const raw = typeof body['status'] === 'string' ? body['status'].trim() : '';
    if (!(DEAL_STATUSES as readonly string[]).includes(raw)) {
      return badRequest('bad status', `expected one of ${DEAL_STATUSES.join(', ')}`);
    }
    nextStatus = raw;
    sets.push('status = ?');
    binds.push(raw);
  }

  if (body['closed_at'] !== undefined) {
    const parsed = parseClosedAt(body['closed_at']);
    if (parsed === INVALID) return badRequest('bad closed_at', 'expected YYYY-MM-DD');
    sets.push('closed_at = ?');
    binds.push(parsed);
  }

  for (const key of ['name', 'notes'] as const) {
    if (body[key] !== undefined) {
      if (body[key] !== null && typeof body[key] !== 'string') {
        return badRequest(`bad ${key}`, 'expected a string or null');
      }
      sets.push(`${key} = ?`);
      binds.push(blankToNull(body[key]));
    }
  }

  // Marking a deal won stamps the close date if nobody supplied one.
  const becomingWon = nextStatus === 'won' && existing.status !== 'won';
  if (becomingWon && body['closed_at'] === undefined && existing.closed_at === null) {
    sets.push('closed_at = ?');
    binds.push(`${operatorToday()} 12:00:00`);
  }

  if (sets.length > 0) {
    await env.DB.prepare(
      `UPDATE deals SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
    )
      .bind(...binds, dealId)
      .run();
  }

  const lead = await env.DB.prepare('SELECT id, status FROM leads WHERE id = ?')
    .bind(existing.lead_id)
    .first<{ id: number; status: string }>();
  if (lead) {
    await applyDealSideEffects(
      env,
      existing.lead_id,
      lead.status,
      nextStatus ?? existing.status,
      amount,
      dealId,
      actor,
    );
  }

  const deal = await dealById(env, dealId);
  if (!deal) return notFound();
  return json({ ok: true, deal });
}

/** A won deal drags the lead to `won` and leaves an audit trail either way. */
async function applyDealSideEffects(
  env: Env,
  leadId: number,
  rawLeadStatus: string,
  dealStatus: string,
  amountCents: number,
  dealId: number,
  actor: string,
): Promise<void> {
  const currentStage = normaliseStage(rawLeadStatus);
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO lead_events (lead_id, type, from_stage, to_stage, detail, actor)
       VALUES (?, 'deal', ?, ?, ?, ?)`,
    ).bind(
      leadId,
      currentStage,
      dealStatus === 'won' ? 'won' : currentStage,
      `deal #${dealId} ${dealStatus} ${amountCents} cents`,
      actor,
    ),
  ];
  if (dealStatus === 'won' && currentStage !== 'won') {
    statements.push(
      ...stageChangeStatements(env, leadId, currentStage, 'won', actor, `deal #${dealId} won`),
    );
  }
  await env.DB.batch(statements);
}

// ------------------------------------------------------------------- queue ----

export async function getQueue(env: Env): Promise<Response> {
  const today = operatorToday();
  const open = dbValuesForStages(STAGES.filter((s) => !CLOSED_STAGES.includes(s)));
  const openPh = placeholders(open.length);
  const chase = dbValuesForStages(['new', 'attempting']);
  const chasePh = placeholders(chase.length);

  const [overdue, dueToday, next] = await Promise.all([
    env.DB.prepare(
      `${LEAD_CARD_SQL}
        WHERE l.next_action_at IS NOT NULL
          AND substr(l.next_action_at, 1, 10) < ?
          AND l.status IN (${openPh})
        ORDER BY substr(l.next_action_at, 1, 10) ASC, l.id ASC`,
    )
      .bind(today, ...open)
      .all<LeadCardRow>(),
    env.DB.prepare(
      `${LEAD_CARD_SQL}
        WHERE substr(l.next_action_at, 1, 10) = ?
          AND l.status IN (${openPh})
        ORDER BY l.board_rank IS NULL, l.board_rank ASC, l.id ASC`,
    )
      .bind(today, ...open)
      .all<LeadCardRow>(),
    // Nothing scheduled, still worth a call. Ordered exactly as API.md says:
    // someone we can actually ring first, then whoever we have bothered least,
    // then the freshest subscriber (while they still remember signing up).
    env.DB.prepare(
      `${LEAD_CARD_SQL}
        WHERE l.next_action_at IS NULL
          AND l.status IN (${chasePh})
        ORDER BY
          CASE WHEN COALESCE(l.phone, '') = '' THEN 1 ELSE 0 END ASC,
          attempts ASC,
          ${tsExpr('COALESCE(l.subscribed_at, l.created_at)')} DESC,
          l.id DESC
        LIMIT ?`,
    )
      .bind(...chase, QUEUE_NEXT_LIMIT)
      .all<LeadCardRow>(),
  ]);

  return json({
    overdue: overdue.results.map((row) => rowToCard(row, today)),
    today: dueToday.results.map((row) => rowToCard(row, today)),
    next: next.results.map((row) => rowToCard(row, today)),
  });
}
