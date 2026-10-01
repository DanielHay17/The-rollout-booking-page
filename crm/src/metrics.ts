/**
 * The numbers: blended acquisition cost, true CAC, LTV and the daily report.
 *
 * Three cost-per numbers exist and they are NOT interchangeable. Collapsing
 * them is the single easiest way to make this dashboard lie:
 *
 *   cost_per_lead_cents    spend / paid leads acquired in the window
 *                          -> "what does it cost to get someone's email"
 *   cost_per_booked_cents  spend / leads booked in the window
 *                          -> "what does it cost to get a call in the diary"
 *   cac_cents              spend / customers won in the window
 *                          -> "what does it cost to get a customer" (true CAC)
 *
 * Flow vs stock also matters. `contacted / booked / won / lost` are FLOW: they
 * count things that HAPPENED inside the window, read from the `lead_events`
 * audit trail, so moving a lead twice in a month is visible. `pipeline` is
 * STOCK: where every lead sits right now, read from `leads.status`. They do not
 * add up to each other and are not supposed to.
 */

import type { Env, Stage } from './types';
import { normaliseStage } from './stages';
import {
  json, ratio, centsPer, tsExpr, windowToUtcRange, eachDate, stampToLocalDate,
} from './util';
import type { Window } from './util';

/**
 * Whether a lead's acquisition channel says it was paid for.
 *
 * beehiiv hands over a channel STRING ("website: facebook / paid"), never a
 * campaign id, so a substring test is genuinely the best signal available.
 * Keep the SQL and the TypeScript versions in step.
 */
const PAID_PATTERNS = ['paid', 'cpc', 'ppc'] as const;

const PAID_SOURCE_SQL = PAID_PATTERNS
  .map((pattern) => `lower(COALESCE(source, '')) LIKE '%${pattern}%'`)
  .join(' OR ');

export function isPaidSource(source: string | null): boolean {
  if (!source) return false;
  const lowered = source.toLowerCase();
  return PAID_PATTERNS.some((pattern) => lowered.includes(pattern));
}

/** `COALESCE(subscribed_at, created_at)` — when we actually acquired the lead. */
const ACQUIRED_AT = tsExpr('COALESCE(subscribed_at, created_at)');
const EVENT_AT = tsExpr('created_at');
const CALLED_AT = tsExpr('called_at');
const CLOSED_AT = tsExpr('closed_at');

interface FlowRow {
  contacted: number;
  booked: number;
  won: number;
  lost: number;
}

export async function getSummary(env: Env, win: Window): Promise<Response> {
  const { start, end } = windowToUtcRange(win.from, win.to);

  const [spendRow, leadRow, flowRow, revenueRow, ltvRow, pipelineRows] = await Promise.all([
    env.DB.prepare(
      'SELECT COALESCE(SUM(spend_cents), 0) AS spend_cents FROM campaign_spend WHERE date BETWEEN ? AND ?',
    )
      .bind(win.from, win.to)
      .first<{ spend_cents: number }>(),

    env.DB.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN ${PAID_SOURCE_SQL} THEN 1 ELSE 0 END) AS paid
         FROM leads
        WHERE ${ACQUIRED_AT} >= ? AND ${ACQUIRED_AT} < ?`,
    )
      .bind(start, end)
      .first<{ total: number; paid: number | null }>(),

    // Distinct leads, not event rows: the funnel fractions below are
    // lead-to-lead conversion rates, so counting one lead twice would push
    // contacted_to_booked above 1.
    env.DB.prepare(
      `SELECT
         (SELECT COUNT(DISTINCT lead_id) FROM lead_events
           WHERE type = 'contact'
             AND ${EVENT_AT} >= ? AND ${EVENT_AT} < ?) AS contacted,
         (SELECT COUNT(DISTINCT lead_id) FROM lead_events
           WHERE type = 'stage_change' AND to_stage = 'booked'
             AND ${EVENT_AT} >= ? AND ${EVENT_AT} < ?) AS booked,
         (SELECT COUNT(DISTINCT lead_id) FROM lead_events
           WHERE type = 'stage_change' AND to_stage = 'won'
             AND ${EVENT_AT} >= ? AND ${EVENT_AT} < ?) AS won,
         (SELECT COUNT(DISTINCT lead_id) FROM lead_events
           WHERE type = 'stage_change' AND to_stage = 'lost'
             AND ${EVENT_AT} >= ? AND ${EVENT_AT} < ?) AS lost`,
    )
      .bind(start, end, start, end, start, end, start, end)
      .first<FlowRow>(),

    env.DB.prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS revenue_cents
         FROM deals
        WHERE status = 'won' AND closed_at IS NOT NULL
          AND ${CLOSED_AT} >= ? AND ${CLOSED_AT} < ?`,
    )
      .bind(start, end)
      .first<{ revenue_cents: number }>(),

    // LTV is deliberately ALL-TIME. A 30-day window almost never contains
    // enough closed deals for an average to mean anything, and a repeat
    // customer must count once, hence COUNT(DISTINCT lead_id).
    env.DB.prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS revenue_cents,
              COUNT(DISTINCT lead_id) AS customers
         FROM deals WHERE status = 'won'`,
    ).first<{ revenue_cents: number; customers: number }>(),

    env.DB.prepare('SELECT status, COUNT(*) AS n FROM leads GROUP BY status')
      .all<{ status: string; n: number }>(),
  ]);

  const spendCents = Number(spendRow?.spend_cents ?? 0);
  const leadsTotal = Number(leadRow?.total ?? 0);
  const leadsPaid = Number(leadRow?.paid ?? 0);
  const leadsOrganic = Math.max(0, leadsTotal - leadsPaid);

  const contacted = Number(flowRow?.contacted ?? 0);
  const booked = Number(flowRow?.booked ?? 0);
  const won = Number(flowRow?.won ?? 0);
  const lost = Number(flowRow?.lost ?? 0);

  const revenueCents = Number(revenueRow?.revenue_cents ?? 0);
  const ltvRevenue = Number(ltvRow?.revenue_cents ?? 0);
  const ltvCustomers = Number(ltvRow?.customers ?? 0);
  const ltvCents = centsPer(ltvRevenue, ltvCustomers);

  const cacCents = centsPer(spendCents, won);

  const pipeline: Record<Stage, number> = {
    new: 0, attempting: 0, engaged: 0, booked: 0, won: 0, lost: 0, parked: 0,
  };
  for (const row of pipelineRows.results) {
    const stage = normaliseStage(row.status);
    pipeline[stage] += Number(row.n ?? 0);
  }

  return json({
    window: { from: win.from, to: win.to, days: win.days },
    currency: 'AUD',
    spend_cents: spendCents,
    leads: { total: leadsTotal, paid: leadsPaid, organic: leadsOrganic },
    contacted,
    booked,
    won,
    lost,
    revenue_cents: revenueCents,
    cost_per_lead_cents: centsPer(spendCents, leadsPaid),
    cost_per_booked_cents: centsPer(spendCents, booked),
    cac_cents: cacCents,
    ltv_cents: ltvCents,
    // Guarded on both sides: a null CAC (nothing won) and a zero CAC (won
    // something while spending nothing) both make the ratio meaningless.
    ltv_cac_ratio: ltvCents === null || cacCents === null ? null : ratio(ltvCents, cacCents),
    roas: ratio(revenueCents, spendCents),
    funnel: {
      lead_to_contacted: ratio(contacted, leadsTotal),
      contacted_to_booked: ratio(booked, contacted),
      booked_to_won: ratio(won, booked),
    },
    pipeline,
  });
}

// ------------------------------------------------------------ daily report ---

export interface DailyRow {
  date: string;
  spend_cents: number;
  new_leads: number;
  paid_leads: number;
  contacts: number;
  booked: number;
  won: number;
  revenue_cents: number;
}

/** Guard against a pathological window dragging the whole table into memory. */
const DAILY_ROW_CAP = 50000;

export async function getDaily(env: Env, win: Window): Promise<Response> {
  const { start, end } = windowToUtcRange(win.from, win.to);

  const [spendRows, leadRows, callRows, stageRows, dealRows] = await Promise.all([
    // campaign_spend.date is already a calendar date from the ad platform, so
    // it is grouped directly rather than converted.
    env.DB.prepare(
      `SELECT date, COALESCE(SUM(spend_cents), 0) AS spend_cents
         FROM campaign_spend WHERE date BETWEEN ? AND ? GROUP BY date`,
    )
      .bind(win.from, win.to)
      .all<{ date: string; spend_cents: number }>(),

    env.DB.prepare(
      `SELECT ${ACQUIRED_AT} AS at, source FROM leads
        WHERE ${ACQUIRED_AT} >= ? AND ${ACQUIRED_AT} < ? LIMIT ${DAILY_ROW_CAP}`,
    )
      .bind(start, end)
      .all<{ at: string | null; source: string | null }>(),

    // Contact VOLUME for the day comes from the calls table, not from
    // lead_events: the 21 calls logged before this upgrade have no `contact`
    // event (migration 0003 only backfilled `created` events), and a daily
    // chart that showed zero calls on days the operator knows he made calls
    // would read as a broken dashboard. The summary's `contacted` is a
    // different measure — distinct leads, from the audit trail, as specified.
    env.DB.prepare(
      `SELECT ${CALLED_AT} AS at FROM calls
        WHERE ${CALLED_AT} >= ? AND ${CALLED_AT} < ? LIMIT ${DAILY_ROW_CAP}`,
    )
      .bind(start, end)
      .all<{ at: string | null }>(),

    env.DB.prepare(
      `SELECT ${EVENT_AT} AS at, to_stage, lead_id FROM lead_events
        WHERE type = 'stage_change' AND to_stage IN ('booked', 'won')
          AND ${EVENT_AT} >= ? AND ${EVENT_AT} < ? LIMIT ${DAILY_ROW_CAP}`,
    )
      .bind(start, end)
      .all<{ at: string | null; to_stage: string | null; lead_id: number }>(),

    env.DB.prepare(
      `SELECT ${CLOSED_AT} AS at, amount_cents FROM deals
        WHERE status = 'won' AND closed_at IS NOT NULL
          AND ${CLOSED_AT} >= ? AND ${CLOSED_AT} < ? LIMIT ${DAILY_ROW_CAP}`,
    )
      .bind(start, end)
      .all<{ at: string | null; amount_cents: number }>(),
  ]);

  // The spine. Generated here so that EVERY calendar day in the window gets a
  // row, including the ones where nothing happened — a chart with holes in it
  // reads as missing data rather than as a quiet day.
  const dates = eachDate(win.from, win.to);
  const byDate = new Map<string, DailyRow>();
  for (const date of dates) {
    byDate.set(date, {
      date,
      spend_cents: 0,
      new_leads: 0,
      paid_leads: 0,
      contacts: 0,
      booked: 0,
      won: 0,
      revenue_cents: 0,
    });
  }

  for (const row of spendRows.results) {
    const day = byDate.get(row.date);
    if (day) day.spend_cents += Number(row.spend_cents ?? 0);
  }

  for (const row of leadRows.results) {
    const date = stampToLocalDate(row.at);
    const day = date ? byDate.get(date) : undefined;
    if (!day) continue;
    day.new_leads += 1;
    if (isPaidSource(row.source)) day.paid_leads += 1;
  }

  for (const row of callRows.results) {
    const date = stampToLocalDate(row.at);
    const day = date ? byDate.get(date) : undefined;
    if (day) day.contacts += 1;
  }

  // Distinct leads per day, so two drags of the same card into Booked on the
  // same day is one booking.
  const bookedSeen = new Map<string, Set<number>>();
  const wonSeen = new Map<string, Set<number>>();
  for (const row of stageRows.results) {
    const date = stampToLocalDate(row.at);
    const day = date ? byDate.get(date) : undefined;
    if (!day || !date) continue;
    const bucket = row.to_stage === 'won' ? wonSeen : bookedSeen;
    let seen = bucket.get(date);
    if (!seen) {
      seen = new Set<number>();
      bucket.set(date, seen);
    }
    if (seen.has(row.lead_id)) continue;
    seen.add(row.lead_id);
    if (row.to_stage === 'won') day.won += 1;
    else day.booked += 1;
  }

  for (const row of dealRows.results) {
    const date = stampToLocalDate(row.at);
    const day = date ? byDate.get(date) : undefined;
    if (day) day.revenue_cents += Number(row.amount_cents ?? 0);
  }

  return json({ days: dates.map((date) => byDate.get(date)).filter((d): d is DailyRow => !!d) });
}

/** Used by `/api/health`, which must not touch anything secret. */
export async function healthCounts(env: Env): Promise<{ leads: number; calls: number }> {
  const row = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM leads) AS leads, (SELECT COUNT(*) FROM calls) AS calls`,
  ).first<{ leads: number; calls: number }>();
  return { leads: Number(row?.leads ?? 0), calls: Number(row?.calls ?? 0) };
}
