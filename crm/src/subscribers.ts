/**
 * The ONE place a beehiiv subscriber becomes a CRM lead.
 *
 * Both the inbound webhook and the API backfill funnel through
 * `upsertSubscriber`, deliberately. The rule it enforces is the whole reason
 * this file exists:
 *
 *   A SYNC NEVER OVERWRITES SOMETHING A HUMAN TYPED.
 *
 * Daniel rings these people. He fixes a mangled phone number, he writes the
 * company name properly, he leaves himself notes. If a nightly sync pushed
 * beehiiv's version back over the top of that, the CRM would quietly undo his
 * work every hour and he would stop trusting it. So every human-editable
 * column is fill-only: it is written when the CRM has nothing, and left alone
 * otherwise. `status`, `notes`, `owner`, `next_action` and `next_action_at` are
 * never touched at all.
 *
 * If you add a column here, decide which of the two lists it belongs in and
 * write it in the right one.
 */

import type { Env, SubscriberInput, UpsertResult } from './types';
import { blankToNull, isRecord, normaliseStamp, pickObject, pickString } from './util';

// ------------------------------------------------------- acquisition source --

const CHANNEL_ALIASES: Readonly<Record<string, string>> = {
  facebook: 'fb',
  fb: 'fb',
  instagram: 'ig',
  ig: 'ig',
};

/**
 * beehiiv's acquisition channel string to the short source we store.
 *
 *   "website: facebook / paid"  -> "fb paid"
 *   "website: ig / social"      -> "ig social"
 *
 * Drop a leading `website:`, map the platform token, join the halves with a
 * space. Anything that does not look like that shape is stored VERBATIM rather
 * than discarded — an unrecognised channel is still information, and silently
 * dropping it would make a lead look organic when it was not.
 */
export function mapAcquisitionSource(raw: unknown): string | null {
  const value = blankToNull(raw);
  if (value === null) return null;

  const lowered = value.toLowerCase();
  const looksLikeChannel = lowered.startsWith('website:') || lowered.includes('/');
  if (!looksLikeChannel) return value;

  const withoutPrefix = lowered.replace(/^website:\s*/, '');
  const parts = withoutPrefix
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map((part) => CHANNEL_ALIASES[part] ?? part);

  return parts.length > 0 ? parts.join(' ') : value;
}

// ----------------------------------------------------------- custom fields ---

/**
 * beehiiv sends custom fields either as `[{ name, value }, ...]` (the API) or as
 * a plain `{ name: value }` object (some webhook payloads). Accept both; the
 * payload shape is not contractually fixed by beehiiv, so being strict here
 * would mean losing a phone number to a vendor-side change.
 */
export function readCustomFields(raw: unknown): Map<string, string> {
  const out = new Map<string, string>();

  const add = (name: unknown, value: unknown): void => {
    if (typeof name !== 'string') return;
    const key = name.trim().toLowerCase();
    if (key === '') return;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed !== '') out.set(key, trimmed);
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      out.set(key, String(value));
    } else if (typeof value === 'boolean') {
      out.set(key, value ? 'true' : 'false');
    }
  };

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!isRecord(entry)) continue;
      add(entry['name'] ?? entry['key'] ?? entry['field'], entry['value']);
    }
  } else if (isRecord(raw)) {
    for (const [key, value] of Object.entries(raw)) add(key, value);
  }

  return out;
}

/** The six custom fields that exist on this publication. */
const FIELD_FIRST_NAME = 'first_name';
const FIELD_LAST_NAME = 'last_name';
const FIELD_PHONE = 'phone_number';
const FIELD_COMPANY = 'company_name';
const FIELD_SURVEY_HELP = 'what_would_you_like_the_rollout_to_help_you_with?';
const FIELD_SURVEY_AI = 'where_are_you_with_ai_right_now?';

/** Tolerates a field name that lost or gained its trailing question mark. */
function customField(fields: Map<string, string>, ...names: string[]): string | null {
  for (const name of names) {
    const direct = fields.get(name);
    if (direct !== undefined) return direct;
    const withoutQuestion = name.replace(/\?$/, '');
    const alt = fields.get(withoutQuestion) ?? fields.get(`${withoutQuestion}?`);
    if (alt !== undefined) return alt;
  }
  return null;
}

/**
 * Flattens either payload shape into the columns we are willing to write.
 * Returns `null` when no email can be resolved, which is the one thing we
 * genuinely cannot work without.
 */
export function subscriberInputFrom(payload: unknown): SubscriberInput | null {
  const email = pickString(
    payload,
    'email',
    'data.email',
    'subscription.email',
    'subscriber.email',
    'data.subscription.email',
  );
  if (!email || !email.includes('@')) return null;

  const beehiivId = pickString(
    payload,
    'id',
    'subscription_id',
    'data.id',
    'data.subscription_id',
    'subscription.id',
    'subscriber.id',
  );

  const fields = readCustomFields(
    pickObject(
      payload,
      'custom_fields',
      'data.custom_fields',
      'subscription.custom_fields',
      'subscriber.custom_fields',
    ),
  );

  const acquisition = pickString(
    payload,
    'acquisition_source',
    'data.acquisition_source',
    'subscription.acquisition_source',
    'subscriber.acquisition_source',
    'utm_channel',
    'data.utm_channel',
  );

  const subscribedRaw =
    pickString(payload, 'created', 'created_at', 'data.created', 'data.created_at', 'subscription.created')
    ?? null;

  return {
    beehiiv_id: beehiivId,
    email: email.toLowerCase(),
    first_name: customField(fields, FIELD_FIRST_NAME)
      ?? pickString(payload, 'first_name', 'data.first_name'),
    last_name: customField(fields, FIELD_LAST_NAME)
      ?? pickString(payload, 'last_name', 'data.last_name'),
    phone: customField(fields, FIELD_PHONE, 'phone')
      ?? pickString(payload, 'phone_number', 'data.phone_number'),
    company: customField(fields, FIELD_COMPANY, 'company')
      ?? pickString(payload, 'company_name', 'data.company_name'),
    survey_help: customField(fields, FIELD_SURVEY_HELP),
    survey_ai_stage: customField(fields, FIELD_SURVEY_AI),
    source: mapAcquisitionSource(acquisition),
    subscribed_at: normaliseStamp(subscribedRaw),
    location: pickString(payload, 'location', 'data.location', 'subscription.location'),
    referral_url: pickString(
      payload,
      'referring_site',
      'referral_url',
      'data.referring_site',
      'data.referral_url',
    ),
    beehiiv_status: pickString(payload, 'status', 'data.status', 'subscription.status'),
    // beehiiv does not populate these for this publication, but if it ever
    // starts, this is where real per-campaign attribution would arrive.
    utm_source: pickString(payload, 'utm_source', 'data.utm_source'),
    utm_medium: pickString(payload, 'utm_medium', 'data.utm_medium'),
    utm_campaign: pickString(payload, 'utm_campaign', 'data.utm_campaign'),
    survey_raw: JSON.stringify(payload).slice(0, 20000),
  };
}

// ------------------------------------------------------------------ upsert ---

async function findLeadId(env: Env, input: SubscriberInput): Promise<number | null> {
  if (input.beehiiv_id) {
    const byId = await env.DB.prepare('SELECT id FROM leads WHERE beehiiv_id = ?')
      .bind(input.beehiiv_id)
      .first<{ id: number }>();
    if (byId) return byId.id;
  }
  const byEmail = await env.DB.prepare('SELECT id FROM leads WHERE lower(email) = ?')
    .bind(input.email)
    .first<{ id: number }>();
  return byEmail ? byEmail.id : null;
}

/**
 * Columns a sync may FILL but never overwrite. `COALESCE(NULLIF(col, ''), ?)`
 * means: keep what is there unless it is NULL or an empty string.
 *
 * Note what is NOT in this list and never will be: status, notes, owner,
 * next_action, next_action_at, priority, board_rank, lost_reason. Those are the
 * operator's working state, not beehiiv's data.
 */
const FILL_ONLY_COLUMNS: ReadonlyArray<readonly [string, keyof SubscriberInput]> = [
  ['first_name', 'first_name'],
  ['last_name', 'last_name'],
  ['phone', 'phone'],
  ['company', 'company'],
  ['survey_help', 'survey_help'],
  ['survey_ai_stage', 'survey_ai_stage'],
  ['source', 'source'],
  ['subscribed_at', 'subscribed_at'],
  ['location', 'location'],
  ['referral_url', 'referral_url'],
  ['utm_source', 'utm_source'],
  ['utm_medium', 'utm_medium'],
  ['utm_campaign', 'utm_campaign'],
];

async function updateExisting(env: Env, leadId: number, input: SubscriberInput): Promise<void> {
  const sets: string[] = [];
  const binds: (string | number | null)[] = [];

  for (const [column, key] of FILL_ONLY_COLUMNS) {
    const value = input[key];
    if (typeof value !== 'string' || value === '') continue;
    sets.push(`${column} = COALESCE(NULLIF(${column}, ''), ?)`);
    binds.push(value);
  }

  // beehiiv_id is an identifier, not an edit: fill it in if we matched on email.
  if (input.beehiiv_id) {
    sets.push('beehiiv_id = COALESCE(beehiiv_id, ?)');
    binds.push(input.beehiiv_id);
  }
  // Platform state and the raw payload are beehiiv's to own, so they refresh.
  if (input.beehiiv_status) {
    sets.push('beehiiv_status = ?');
    binds.push(input.beehiiv_status);
  }
  sets.push('survey_raw = ?');
  binds.push(input.survey_raw);

  await env.DB.prepare(
    `UPDATE leads SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
  )
    .bind(...binds, leadId)
    .run();
}

async function insertNew(env: Env, input: SubscriberInput): Promise<number> {
  // A brand new lead lands at the bottom of the New column. The scalar
  // subquery keeps it one step below whatever is already there, so an inbound
  // subscriber never jumps the queue Daniel has arranged by hand.
  const inserted = await env.DB.prepare(
    `INSERT INTO leads (
       email, first_name, last_name, company, phone, source, subscribed_at,
       beehiiv_id, survey_help, survey_ai_stage, survey_raw, beehiiv_status,
       location, referral_url, utm_source, utm_medium, utm_campaign,
       status, stage_changed_at, board_rank
     ) VALUES (
       ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')),
       ?, ?, ?, ?, ?,
       ?, ?, ?, ?, ?,
       'new', datetime('now'),
       (SELECT COALESCE(MAX(board_rank), 0) + 1000 FROM leads
         WHERE status IN ('new', 'never_called'))
     )`,
  )
    .bind(
      input.email,
      input.first_name,
      input.last_name,
      input.company,
      input.phone,
      input.source,
      input.subscribed_at,
      input.beehiiv_id,
      input.survey_help,
      input.survey_ai_stage,
      input.survey_raw,
      input.beehiiv_status,
      input.location,
      input.referral_url,
      input.utm_source,
      input.utm_medium,
      input.utm_campaign,
    )
    .run();

  const leadId = Number(inserted.meta.last_row_id);
  await env.DB.prepare(
    `INSERT INTO lead_events (lead_id, type, to_stage, detail, actor)
     VALUES (?, 'created', 'new', ?, 'beehiiv')`,
  )
    .bind(leadId, input.source ? `subscribed via ${input.source}` : 'subscribed')
    .run();
  return leadId;
}

export async function upsertSubscriber(env: Env, input: SubscriberInput): Promise<UpsertResult> {
  const existingId = await findLeadId(env, input);
  if (existingId !== null) {
    await updateExisting(env, existingId, input);
    return { outcome: 'updated', lead_id: existingId };
  }

  try {
    return { outcome: 'created', lead_id: await insertNew(env, input) };
  } catch (err) {
    // Lost a race (or a case-variant email already held the UNIQUE slot).
    // Look again before giving up, so a duplicate webhook delivery under load
    // updates the lead instead of failing the request.
    const raced = await findLeadId(env, input);
    if (raced === null) throw err;
    await updateExisting(env, raced, input);
    return { outcome: 'updated', lead_id: raced };
  }
}
