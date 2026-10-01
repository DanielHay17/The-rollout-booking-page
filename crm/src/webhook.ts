/**
 * The inbound beehiiv webhook — the thing that stops the CRM going stale.
 *
 * Today the publication has ~296 active subscribers and the CRM holds 95
 * leads, because leads were only ever loaded by hand. With this wired into a
 * beehiiv automation ("Send webhook"), a new subscriber is a lead within
 * seconds, with their survey answers and phone number attached.
 *
 * Two things protect it:
 *   - the shared secret in `X-Rollout-Secret`, compared in constant time;
 *   - a UNIQUE `dedupe_key`, so beehiiv retrying a delivery is a no-op.
 *
 * Cloudflare Access sits in front of this hostname, so this exact path needs a
 * BYPASS policy in the Access application or beehiiv's POST is rejected at the
 * edge and never reaches this code. The secret is what actually guards it.
 *
 * Every delivery is recorded in `webhook_deliveries`, including the failures.
 * When Daniel says "I signed someone up and they are not in the CRM", that
 * table is the answer.
 */

import type { Env } from './types';
import { json, secretEquals, errorMessage, pickString, isRecord } from './util';
import { subscriberInputFrom, upsertSubscriber } from './subscribers';

const MAX_BODY_BYTES = 256 * 1024;

/** SQLite's UNIQUE violation, which here means "we have seen this delivery". */
function isUniqueViolation(err: unknown): boolean {
  return /UNIQUE constraint failed/i.test(errorMessage(err));
}

function eventTypeOf(payload: unknown): string {
  return (
    pickString(payload, 'event', 'event_type', 'type', 'data.event', 'data.event_type')
    ?? 'subscription'
  );
}

export async function handleBeehiivWebhook(request: Request, env: Env): Promise<Response> {
  if (!env.BEEHIIV_WEBHOOK_SECRET || env.BEEHIIV_WEBHOOK_SECRET.trim() === '') {
    return json(
      { error: 'misconfigured', detail: 'BEEHIIV_WEBHOOK_SECRET is not set' },
      503,
    );
  }
  if (!secretEquals(request.headers.get('x-rollout-secret'), env.BEEHIIV_WEBHOOK_SECRET)) {
    return json({ error: 'locked' }, 401);
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json({ error: 'payload too large' }, 413);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    await recordDelivery(env, {
      dedupeKey: null,
      eventType: 'unparseable',
      email: null,
      leadId: null,
      outcome: 'error',
      error: 'body was not valid JSON',
      payload: raw.slice(0, 20000),
    });
    return json({ error: 'bad body', detail: 'expected JSON' }, 400);
  }

  const eventType = eventTypeOf(payload);
  const input = subscriberInputFrom(payload);

  if (!input) {
    // No email means no lead. Log it loudly rather than 200-ing a silent loss:
    // a webhook that answers "fine" to junk is how data disappears.
    const attempted = isRecord(payload) ? JSON.stringify(payload).slice(0, 20000) : raw.slice(0, 20000);
    await recordDelivery(env, {
      dedupeKey: null,
      eventType,
      email: null,
      leadId: null,
      outcome: 'error',
      error: 'no email in payload',
      payload: attempted,
    });
    return json({ error: 'bad body', detail: 'no email in payload' }, 400);
  }

  // Dedupe on the beehiiv subscription id plus the event type. Claim the slot
  // FIRST: inserting before doing the work is what makes a retry a no-op
  // rather than a second upsert.
  //
  // With no subscription id there is nothing stable to dedupe on, so the key is
  // left NULL (SQLite permits many NULLs in a UNIQUE index). Keying on the
  // email instead would be worse: a legitimate second update for the same
  // subscriber would be thrown away.
  const dedupeKey = input.beehiiv_id ? `beehiiv:${input.beehiiv_id}:${eventType}` : null;

  let deliveryId: number | null = null;
  try {
    const claimed = await env.DB.prepare(
      `INSERT INTO webhook_deliveries (source, dedupe_key, event_type, email, outcome, payload)
       VALUES ('beehiiv', ?, ?, ?, 'pending', ?)`,
    )
      .bind(dedupeKey, eventType, input.email, input.survey_raw)
      .run();
    deliveryId = Number(claimed.meta.last_row_id);
  } catch (err) {
    if (isUniqueViolation(err)) {
      const prior = await env.DB.prepare(
        'SELECT lead_id FROM webhook_deliveries WHERE dedupe_key = ?',
      )
        .bind(dedupeKey)
        .first<{ lead_id: number | null }>();
      return json({ ok: true, outcome: 'ignored', lead_id: prior?.lead_id ?? null });
    }
    throw err;
  }

  try {
    const result = await upsertSubscriber(env, input);
    await env.DB.prepare(
      'UPDATE webhook_deliveries SET outcome = ?, lead_id = ? WHERE id = ?',
    )
      .bind(result.outcome, result.lead_id, deliveryId)
      .run();
    return json({ ok: true, outcome: result.outcome, lead_id: result.lead_id });
  } catch (err) {
    const detail = errorMessage(err);
    await env.DB.prepare('UPDATE webhook_deliveries SET outcome = ?, error = ? WHERE id = ?')
      .bind('error', detail.slice(0, 1000), deliveryId)
      .run();
    // 500 on purpose: beehiiv retries non-2xx, and the dedupe row now carries
    // the error for diagnosis. The retry will hit the UNIQUE key and be
    // ignored, so the operator has to look at webhook_deliveries — which is
    // exactly the table that explains what went wrong.
    return json({ error: 'upsert failed', detail }, 500);
  }
}

interface DeliveryRecord {
  dedupeKey: string | null;
  eventType: string;
  email: string | null;
  leadId: number | null;
  outcome: 'created' | 'updated' | 'ignored' | 'error' | 'pending';
  error: string | null;
  payload: string;
}

async function recordDelivery(env: Env, record: DeliveryRecord): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO webhook_deliveries
         (source, dedupe_key, event_type, email, lead_id, outcome, error, payload)
       VALUES ('beehiiv', ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        record.dedupeKey,
        record.eventType,
        record.email,
        record.leadId,
        record.outcome,
        record.error,
        record.payload,
      )
      .run();
  } catch {
    // Logging a failure must never turn into a second failure.
  }
}
