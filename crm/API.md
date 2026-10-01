# rollout-crm API contract

Single Cloudflare Worker. Static assets in `public/` are served directly; anything
that is not an asset falls through to the Worker, which owns `/api/*` and serves
`index.html` for every other path.

Money is **always integer cents** across the wire and the database. Currency is
AUD (the Meta ad account's currency). Dates are `YYYY-MM-DD`; timestamps are
`YYYY-MM-DD HH:MM:SS` (SQLite `datetime('now')`, UTC).

## Auth

| Route | Protection |
|---|---|
| `GET /api/health` | public (no DB secrets in the response) |
| `POST /api/webhooks/beehiiv` | `X-Rollout-Secret` must equal `BEEHIIV_WEBHOOK_SECRET`, compared in constant time |
| everything else under `/api/` | Cloudflare Access JWT, then an allowlist check against `ALLOWED_EMAILS` |

Access failures return `401 {"error":"locked"}`; a verified identity that is not
allowlisted returns `403 {"error":"not allowed"}`. Missing server configuration
returns `503 {"error":"misconfigured","detail":"<which var>"}` — never fail open.

## Pipeline stages

Ordered board columns. `status` on `leads` holds these.

| id | label | meaning |
|---|---|---|
| `new` | New | never contacted |
| `attempting` | Attempting | tried, no pickup yet |
| `engaged` | Engaged | real two-way contact, working toward a booking |
| `booked` | Booked | call is in the diary |
| `won` | Won | they bought |
| `lost` | Lost | dead |
| `parked` | Parked | revisit later |

Legacy values `never_called` / `follow_up` / `done` may still exist in the
database. Normalise on read: `never_called`→`new`, `follow_up`→`attempting`,
`done`→`lost`. Never write a legacy value.

## Endpoints

### `GET /api/health`
`{ ok: true, version: string, db: { leads: number, calls: number } }`

### `GET /api/me`
`{ email: string }`

### `GET /api/board`
The Kanban payload, one round trip.
```
{
  stages: [ { id, label, count, leads: LeadCard[] } ],   // in the order above
  totals: { leads, booked, won, due_today, overdue, never_contacted }
}
```

`LeadCard`:
```
{
  id, first_name, last_name, company, role, phone, email,
  status,                       // normalised stage id
  priority, source, segment, owner,
  subscribed_at, next_action, next_action_at,
  board_rank,                   // REAL, ascending within a column
  attempts,                     // count of rows in calls
  last_contact,                 // MAX(calls.called_at) or null
  survey_help, survey_ai_stage, // the two beehiiv survey answers
  deal_amount_cents,            // summed won deals, 0 if none
  is_overdue                    // next_action_at < today
}
```

### `GET /api/leads`
Query: `stage`, `q` (matches name / company / email / phone), `source`, `owner`,
`due` (`today` | `overdue` | `week`), `limit` (default 200, max 1000), `offset`.
Returns `{ leads: LeadCard[], total: number }`.

### `GET /api/leads/:id`
`{ ...all lead columns, calls: Call[], events: LeadEvent[], deals: Deal[] }`
ordered newest first. `404 {"error":"Not found"}` when absent.

### `PATCH /api/leads/:id`
Body may contain any of: `status`, `priority`, `notes`, `next_action`,
`next_action_at`, `phone`, `first_name`, `last_name`, `company`, `role`,
`website`, `owner`, `segment`, `lost_reason`, `board_rank`.

- `""` is stored as `NULL`.
- Unknown keys are rejected with `400`; they are never silently dropped.
- An invalid `status` returns `400 {"error":"bad status"}`.
- A `status` change writes a `stage_change` row to `lead_events` and maintains
  `booked_at` / `won_at` / `lost_at` / `stage_changed_at`.
- Returns `{ ok: true, lead: LeadCard }`.

### `POST /api/leads/:id/stage`
Drag-and-drop. Body `{ to: stageId, before_id?: number, after_id?: number }`.
The server computes `board_rank` as the midpoint of the neighbours' ranks
(`after` = the card above, `before` = the card below). With no neighbours it
appends. When the gap between neighbours is `< 0.0001` the whole destination
column is renumbered to `1000, 2000, 3000…` first, then the insert is retried,
so ranks can never collapse. Same side effects as a `status` PATCH.
Returns `{ ok: true, lead: LeadCard }`.

### `POST /api/leads/:id/calls`
Body `{ channel, outcome, notes?, duration_s? }`.
`channel` ∈ `call | email | sms | linkedin | meeting | whatsapp`.
`outcome` ∈ `no_answer | voicemail | recall | connected | booked | no_show | wrong_number | not_interested | sent | replied | other`.

Logging a contact advances the stage, but **never downgrades a later stage**:

| outcome | stage becomes |
|---|---|
| `booked` | `booked` |
| `connected`, `replied`, `sent` | `engaged` (only from `new`/`attempting`) |
| `no_answer`, `voicemail`, `recall`, `wrong_number` | `attempting` (only from `new`) |
| `not_interested` | `lost` |
| `no_show`, `other` | unchanged |

A lead already in `won` is never moved by a contact log. Writes a `contact`
event. Returns `{ ok: true, lead: LeadCard }`.

### `POST /api/leads/:id/deals` / `PATCH /api/deals/:id`
Body `{ amount_cents, status?, name?, notes?, closed_at? }`. `amount_cents` must
be a non-negative integer. Marking a deal `won` sets the lead to `won` and
stamps `closed_at` if absent. Returns `{ ok: true, deal: Deal }`.

### `GET /api/queue`
The call list, already prioritised. `{ overdue: LeadCard[], today: LeadCard[], next: LeadCard[] }`
where `next` is leads with no `next_action_at` that are in `new` or `attempting`,
ordered: has a phone number first, then fewest attempts, then newest subscriber.

### `GET /api/metrics/summary?from=&to=`
Defaults to the last 30 days inclusive. **Every ratio is `null` when its
denominator is zero** — the UI renders `—`. Never `0`, never `Infinity`.

```
{
  window: { from, to, days },
  currency: "AUD",
  spend_cents,
  leads:        { total, paid, organic },
  contacted, booked, won, lost,          // flow: counted from lead_events in window
  revenue_cents,                          // won deals closed in window
  cost_per_lead_cents,                    // spend / paid leads        (acquisition)
  cost_per_booked_cents,                  // spend / booked in window
  cac_cents,                              // spend / customers won     (true CAC)
  ltv_cents,                              // ALL-TIME: won revenue / distinct won leads
  ltv_cac_ratio,                          // ltv_cents / cac_cents
  roas,                                   // revenue_cents / spend_cents
  funnel: {
    lead_to_contacted, contacted_to_booked, booked_to_won   // fractions 0..1 or null
  },
  pipeline: { new, attempting, engaged, booked, won, lost, parked }  // current stock
}
```

`ltv_cents` is deliberately all-time, not windowed: a 30-day window usually
contains too few closed deals for a windowed average to mean anything. It is
`SUM(won amount) / COUNT(DISTINCT lead_id having a won deal)`, so a repeat
customer counts once.

### `GET /api/metrics/daily?from=&to=`
`{ days: [ { date, spend_cents, new_leads, paid_leads, contacts, booked, won, revenue_cents } ] }`
One row per calendar day in the window, **including days with no activity**
(zero-filled) so a chart has no gaps.

### `GET /api/campaigns?from=&to=`
```
{
  window: { from, to },
  currency: "AUD",
  attribution_note: string,     // see below — the UI must display this
  campaigns: [ {
    id, name, status, objective,
    spend_cents, impressions, clicks, results,
    ctr,            // clicks / impressions, null when no impressions
    cpc_cents,      // spend / clicks, null when no clicks
    cpl_cents       // spend / results — the AD PLATFORM's own attribution
  } ],
  totals: { spend_cents, impressions, clicks, results }
}
```

**Attribution honesty.** beehiiv records acquisition only as a channel string
(`"website: facebook / paid"`), with no campaign id and no UTM parameters. So a
CRM lead cannot be traced to a specific campaign. Therefore:
- per-campaign `cpl_cents` comes from the ad platform's own conversion counts and
  must be labelled as such;
- blended `cost_per_lead_cents` in `/api/metrics/summary` comes from CRM leads and
  total spend, and is the number to trust for "what does a lead cost us";
- the API returns `attribution_note` and the UI must surface it rather than
  implying per-campaign CRM attribution exists.

### `POST /api/sync/beehiiv` / `POST /api/sync/meta`
Manual triggers for the same code the cron runs.
`{ ok, created, updated, skipped, errors: string[] }` for beehiiv;
`{ ok, campaigns, days, errors: string[] }` for meta.

### `POST /api/webhooks/beehiiv`
Accepts a beehiiv automation "Send webhook" POST (JSON). The payload shape is
not contractually fixed by beehiiv, so parsing is defensive: pull `email` from
the first present of `email`, `data.email`, `subscription.email`, `subscriber.email`;
same pattern for `id`/`subscription_id` and `custom_fields`.

- No resolvable email → `400`, logged with outcome `error`.
- Upsert by `beehiiv_id` first, else by lower-cased `email`.
- Existing leads: only fill **empty** CRM fields. A webhook never overwrites a
  phone number or company that someone has already corrected by hand, and never
  changes `status`, `notes`, `owner` or `next_action`.
- Idempotent: `dedupe_key` = beehiiv subscription id + event type, enforced by a
  UNIQUE index. A replay returns `200 { outcome: "ignored" }` and writes nothing.
- Maps custom fields → columns: `first_name`, `last_name`, `phone_number`→`phone`,
  `company_name`→`company`, `what_would_you_like_the_rollout_to_help_you_with?`→
  `survey_help`, `where_are_you_with_ai_right_now?`→`survey_ai_stage`. The whole
  payload is kept in `survey_raw`.
- `acquisition_source` → `source` via: `"website: facebook / paid"` → `fb paid`,
  `"website: ig / social"` → `ig social`, i.e. drop a leading `website: `, map
  `facebook`→`fb`, `instagram`→`ig`, join the two halves with a space. Unknown
  shapes are stored verbatim rather than discarded.
- Returns `{ ok: true, outcome: "created"|"updated"|"ignored", lead_id }`.

Cloudflare Access sits in front of this hostname, so this path needs a **Bypass**
policy in the Access application or beehiiv's POST is rejected at the edge before
the Worker runs. The shared secret is what actually protects it.
