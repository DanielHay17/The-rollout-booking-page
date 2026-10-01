/**
 * The inbound beehiiv webhook.
 *
 * This is the thing that stops the CRM going stale (296 beehiiv subscribers
 * against 95 leads today), so the tests care about two separate properties:
 * that a new subscriber arrives complete — phone number and both survey
 * answers attached, acquisition channel mapped — and that an existing lead is
 * never damaged by one. Daniel rings these people and fixes their details by
 * hand; a sync that pushed beehiiv's version back over the top of his
 * corrections would quietly undo his work every hour.
 *
 * Every subscriber in this file is invented.
 */

import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { WEBHOOK_SECRET, callJson, countRows, insertLead, leadRow } from './helpers';
import { mapAcquisitionSource, readCustomFields, subscriberInputFrom } from '../src/subscribers';

const CREATED_ISO = '2026-09-20T02:00:00Z';
const CREATED_UNIX = Math.floor(Date.parse(CREATED_ISO) / 1000);

interface PayloadOverrides {
  id?: string | null;
  email?: string | null;
  acquisition_source?: string | null;
  custom_fields?: unknown;
  created?: unknown;
  status?: string;
  event?: string;
}

function beehiivPayload(overrides: PayloadOverrides = {}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    status: overrides.status ?? 'active',
    created: overrides.created ?? CREATED_ISO,
  };
  if (overrides.id !== null) payload['id'] = overrides.id ?? 'sub_jess_carmody';
  if (overrides.email !== null) payload['email'] = overrides.email ?? 'jess.carmody@example.test';
  if (overrides.acquisition_source !== null) {
    payload['acquisition_source'] = overrides.acquisition_source ?? 'website: facebook / paid';
  }
  if (overrides.event !== undefined) payload['event'] = overrides.event;
  payload['custom_fields'] = overrides.custom_fields ?? [
    { name: 'first_name', value: 'Jess' },
    { name: 'last_name', value: 'Carmody' },
    { name: 'phone_number', value: '+61 412 333 101' },
    { name: 'company_name', value: 'Carmody Plumbing' },
    {
      name: 'what_would_you_like_the_rollout_to_help_you_with?',
      value: 'Stop losing quotes in my inbox',
    },
    { name: 'where_are_you_with_ai_right_now?', value: 'Tinkering with ChatGPT' },
  ];
  return payload;
}

interface WebhookReply {
  ok?: boolean;
  outcome?: string;
  lead_id?: number | null;
  error?: string;
  detail?: string;
}

function postWebhook(payload: unknown, secret: string = WEBHOOK_SECRET) {
  return callJson<WebhookReply>('/api/webhooks/beehiiv', {
    method: 'POST',
    body: payload,
    headers: { 'x-rollout-secret': secret },
  });
}

describe('a well-formed delivery creates a complete lead', () => {
  it('maps every custom field onto its column', async () => {
    const res = await postWebhook(beehiivPayload());
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('created');
    expect(typeof res.body.lead_id).toBe('number');

    const lead = await leadRow(res.body.lead_id as number);
    expect(lead).not.toBeNull();
    expect(lead).toMatchObject({
      email: 'jess.carmody@example.test',
      first_name: 'Jess',
      last_name: 'Carmody',
      phone: '+61 412 333 101',
      company: 'Carmody Plumbing',
      survey_help: 'Stop losing quotes in my inbox',
      survey_ai_stage: 'Tinkering with ChatGPT',
      source: 'fb paid',
      beehiiv_id: 'sub_jess_carmody',
      beehiiv_status: 'active',
      status: 'new',
    });
    // The whole payload is retained, so a mapping that changes later can be
    // replayed against what beehiiv actually sent.
    expect(String(lead?.['survey_raw'])).toContain('Carmody Plumbing');
  });

  it('normalises the subscription date whether it arrives as ISO or unix seconds', async () => {
    const iso = await postWebhook(beehiivPayload({ id: 'sub_iso', email: 'iso@example.test' }));
    const unix = await postWebhook(
      beehiivPayload({ id: 'sub_unix', email: 'unix@example.test', created: CREATED_UNIX }),
    );

    const a = await leadRow(iso.body.lead_id as number);
    const b = await leadRow(unix.body.lead_id as number);
    expect(a?.['subscribed_at']).toBe('2026-09-20 02:00:00');
    expect(b?.['subscribed_at']).toBe('2026-09-20 02:00:00');
  });

  it('lands at the bottom of New with a board rank, never unranked', async () => {
    await insertLead({ email: 'already.there@example.test', status: 'new', board_rank: 1000 });
    const res = await postWebhook(beehiivPayload());
    const lead = await leadRow(res.body.lead_id as number);
    expect(typeof lead?.['board_rank']).toBe('number');
    expect(Number(lead?.['board_rank'])).toBeGreaterThan(1000);
  });

  it('writes a created event so the lead is visible in historical reports', async () => {
    const res = await postWebhook(beehiivPayload());
    const events = await countRows(
      'lead_events',
      "lead_id = ? AND type = 'created' AND actor = 'beehiiv'",
      res.body.lead_id ?? 0,
    );
    expect(events).toBe(1);
  });

  it('accepts the nested payload shape and the object custom-field shape', async () => {
    const res = await postWebhook({
      data: {
        id: 'sub_nested',
        email: 'nested@example.test',
        acquisition_source: 'website: ig / social',
        custom_fields: {
          first_name: 'Mia',
          phone_number: '0412 333 102',
          company_name: 'Northside Dental',
        },
      },
    });
    expect(res.status).toBe(200);
    const lead = await leadRow(res.body.lead_id as number);
    expect(lead).toMatchObject({
      email: 'nested@example.test',
      first_name: 'Mia',
      phone: '0412 333 102',
      company: 'Northside Dental',
      source: 'ig social',
    });
  });
});

describe('acquisition_source mapping', () => {
  it('turns "website: facebook / paid" into "fb paid"', async () => {
    const res = await postWebhook(
      beehiivPayload({
        id: 'sub_fb',
        email: 'fb@example.test',
        acquisition_source: 'website: facebook / paid',
      }),
    );
    const lead = await leadRow(res.body.lead_id as number);
    expect(lead?.['source']).toBe('fb paid');
  });

  it('turns "website: ig / social" into "ig social"', async () => {
    const res = await postWebhook(
      beehiivPayload({
        id: 'sub_ig',
        email: 'ig@example.test',
        acquisition_source: 'website: ig / social',
      }),
    );
    const lead = await leadRow(res.body.lead_id as number);
    expect(lead?.['source']).toBe('ig social');
  });

  // Unit-level, because this mapping is the one piece of beehiiv's shape the
  // dashboard's paid/organic split depends on.
  it.each([
    ['website: facebook / paid', 'fb paid'],
    ['website: ig / social', 'ig social'],
    ['website: instagram / paid', 'ig paid'],
    ['website: fb / paid', 'fb paid'],
    ['Website: Facebook / Paid', 'fb paid'],
    ['website: organic / search', 'organic search'],
  ])('maps %s to %s', (raw, expected) => {
    expect(mapAcquisitionSource(raw)).toBe(expected);
  });

  it('keeps an unrecognised channel verbatim rather than dropping it', () => {
    // Discarding it would make a paid lead look organic, which would understate
    // cost per lead for everyone else.
    expect(mapAcquisitionSource('referral_from_a_mate')).toBe('referral_from_a_mate');
    expect(mapAcquisitionSource('')).toBeNull();
    expect(mapAcquisitionSource(null)).toBeNull();
    expect(mapAcquisitionSource(undefined)).toBeNull();
  });

  it('reads both custom-field shapes identically', () => {
    const fromArray = readCustomFields([{ name: 'phone_number', value: '0412 000 111' }]);
    const fromObject = readCustomFields({ phone_number: '0412 000 111' });
    expect(fromArray.get('phone_number')).toBe('0412 000 111');
    expect(fromObject.get('phone_number')).toBe('0412 000 111');
  });
});

describe('idempotency', () => {
  it('ignores an identical replay and creates no duplicate', async () => {
    const payload = beehiivPayload();
    const first = await postWebhook(payload);
    expect(first.body.outcome).toBe('created');

    const replay = await postWebhook(payload);
    expect(replay.status).toBe(200);
    expect(replay.body.outcome).toBe('ignored');
    expect(replay.body.lead_id).toBe(first.body.lead_id);

    expect(await countRows('leads')).toBe(1);
    // The replay wrote nothing: the UNIQUE dedupe_key is what stops a second
    // delivery row appearing.
    expect(await countRows('webhook_deliveries', 'dedupe_key IS NOT NULL')).toBe(1);
  });

  it('ignores a replay repeatedly, not just the second time', async () => {
    const payload = beehiivPayload();
    await postWebhook(payload);
    for (let i = 0; i < 3; i += 1) {
      const replay = await postWebhook(payload);
      expect(replay.body.outcome).toBe('ignored');
    }
    expect(await countRows('leads')).toBe(1);
  });

  it('does not confuse a different event for the same subscriber with a replay', async () => {
    // A `subscription.confirmed` after a `subscription.created` is a real
    // second delivery and must be processed, not swallowed.
    const created = await postWebhook(beehiivPayload({ event: 'subscription.created' }));
    const confirmed = await postWebhook(beehiivPayload({ event: 'subscription.confirmed' }));
    expect(created.body.outcome).toBe('created');
    expect(confirmed.body.outcome).toBe('updated');
    expect(confirmed.body.lead_id).toBe(created.body.lead_id);
    expect(await countRows('leads')).toBe(1);
  });
});

describe('a payload with no resolvable email', () => {
  it('is 400 when the email is absent', async () => {
    const res = await postWebhook(beehiivPayload({ email: null }));
    expect(res.status).toBe(400);
    expect(await countRows('leads')).toBe(0);
  });

  it('is 400 when the email is not an email', async () => {
    const res = await postWebhook(beehiivPayload({ email: 'not-an-email' }));
    expect(res.status).toBe(400);
    expect(await countRows('leads')).toBe(0);
  });

  it('is 400 when the body is empty or not JSON', async () => {
    for (const body of ['', 'not json at all', '[1,2,3]']) {
      const res = await callJson<WebhookReply>('/api/webhooks/beehiiv', {
        method: 'POST',
        body,
        headers: { 'x-rollout-secret': WEBHOOK_SECRET },
      });
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(await countRows('leads')).toBe(0);
  });

  it('records the failure rather than losing it silently', async () => {
    // "I signed someone up and they are not in the CRM" has to be answerable.
    await postWebhook(beehiivPayload({ email: null }));
    expect(await countRows('webhook_deliveries', "outcome = 'error'")).toBe(1);

    const row = await env.DB.prepare(
      "SELECT error, payload FROM webhook_deliveries WHERE outcome = 'error'",
    ).first<{ error: string; payload: string }>();
    expect(row?.error).toContain('no email');
    expect(row?.payload).toContain('Carmody Plumbing');
  });

  it('subscriberInputFrom refuses the same payloads at unit level', () => {
    expect(subscriberInputFrom({})).toBeNull();
    expect(subscriberInputFrom({ email: '   ' })).toBeNull();
    expect(subscriberInputFrom({ email: 'nope' })).toBeNull();
    expect(subscriberInputFrom(null)).toBeNull();
    expect(subscriberInputFrom([])).toBeNull();
  });
});

describe('a webhook never damages a lead a human has worked on', () => {
  const HAND_PHONE = '+61 412 999 888';
  const HAND_COMPANY = 'Carmody Plumbing & Gas';

  let leadId: number;

  beforeEach(async () => {
    leadId = await insertLead({
      email: 'jess.carmody@example.test',
      // first_name deliberately absent: a sync SHOULD fill a blank.
      phone: HAND_PHONE,
      company: HAND_COMPANY,
      status: 'engaged',
      notes: 'Spoke Tuesday, wants a call back after the long weekend.',
      next_action: 'Ring back re quoting workflow',
      next_action_at: '2026-10-07',
      owner: 'operator@example.test',
      priority: 'high',
      board_rank: 2500,
      source: 'ig social',
    });
  });

  it('does not overwrite a phone number or company corrected by hand', async () => {
    const res = await postWebhook(beehiivPayload());
    expect(res.body.outcome).toBe('updated');
    expect(res.body.lead_id).toBe(leadId);

    const lead = await leadRow(leadId);
    expect(lead?.['phone']).toBe(HAND_PHONE);
    expect(lead?.['company']).toBe(HAND_COMPANY);
    // ...and does not invent a second lead instead.
    expect(await countRows('leads')).toBe(1);
  });

  it('does fill a column the CRM has nothing in', async () => {
    await postWebhook(beehiivPayload());
    const lead = await leadRow(leadId);
    expect(lead?.['first_name']).toBe('Jess');
    expect(lead?.['last_name']).toBe('Carmody');
    expect(lead?.['survey_help']).toBe('Stop losing quotes in my inbox');
    expect(lead?.['survey_ai_stage']).toBe('Tinkering with ChatGPT');
  });

  it('never changes status, notes, next_action, owner, priority or board_rank', async () => {
    const before = await leadRow(leadId);
    await postWebhook(beehiivPayload());
    const after = await leadRow(leadId);

    for (const column of [
      'status', 'notes', 'next_action', 'next_action_at', 'owner', 'priority', 'board_rank',
    ]) {
      expect(after?.[column], column).toEqual(before?.[column]);
    }
    expect(after?.['status']).toBe('engaged');
  });

  it('does not overwrite a source that is already recorded', async () => {
    // The lead came in as ig social. beehiiv now reports fb paid; the paid /
    // organic split must not be rewritten under the operator.
    await postWebhook(beehiivPayload());
    const lead = await leadRow(leadId);
    expect(lead?.['source']).toBe('ig social');
  });

  it('treats an empty-string column as fillable, not as a value worth keeping', async () => {
    const blank = await insertLead({
      email: 'blank.fields@example.test',
      first_name: '',
      company: '',
      status: 'new',
    });
    await postWebhook(beehiivPayload({ id: 'sub_blank', email: 'blank.fields@example.test' }));
    const lead = await leadRow(blank);
    expect(lead?.['first_name']).toBe('Jess');
    expect(lead?.['company']).toBe('Carmody Plumbing');
  });
});

describe('email matching is case-insensitive', () => {
  it('Foo@x.test does not create a second lead alongside foo@x.test', async () => {
    const existing = await insertLead({
      email: 'foo@x.test',
      status: 'attempting',
      board_rank: 1000,
    });

    const res = await postWebhook(beehiivPayload({ id: 'sub_case_probe', email: 'Foo@X.test' }));
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('updated');
    expect(res.body.lead_id).toBe(existing);
    expect(await countRows('leads')).toBe(1);

    const lead = await leadRow(existing);
    expect(lead?.['email']).toBe('foo@x.test');
    expect(lead?.['status']).toBe('attempting');
    // Matching on email also backfills the beehiiv id, so the next delivery
    // dedupes properly.
    expect(lead?.['beehiiv_id']).toBe('sub_case_probe');
  });

  it('matches on beehiiv_id even when the subscriber changed their email', async () => {
    const existing = await insertLead({
      email: 'old.address@example.test',
      beehiiv_id: 'sub_jess_carmody',
      status: 'engaged',
    });
    const res = await postWebhook(beehiivPayload({ email: 'new.address@example.test' }));
    expect(res.body.lead_id).toBe(existing);
    expect(await countRows('leads')).toBe(1);
  });

  it('stores a mixed-case address lower-cased on create', async () => {
    const res = await postWebhook(beehiivPayload({ id: 'sub_mixed', email: 'MiXeD.CaSe@Example.Test' }));
    const lead = await leadRow(res.body.lead_id as number);
    expect(lead?.['email']).toBe('mixed.case@example.test');
  });
});
