-- Command-center upgrade.
--
-- 1. Widens the lead pipeline from the original 5 statuses to a real Kanban
--    pipeline, including the won/lost split so a booked call can be followed up
--    with "did they actually buy".
-- 2. Adds campaign + spend + deal tables so CAC and LTV are computed from real
--    numbers instead of being typed in by hand.
-- 3. Adds an event log, a webhook delivery log (for idempotent beehiiv
--    deliveries) and a sync cursor table.
--
-- SQLite cannot ALTER a CHECK constraint, so `leads` and `calls` are rebuilt.
-- The old status values stay permitted so that the currently-deployed worker
-- keeps functioning until the new one replaces it.

-- IMPORTANT, do not reorder the statements below.
--
-- `calls.lead_id` is declared ON DELETE CASCADE. In SQLite, DROP TABLE performs an
-- implicit DELETE FROM first, which FIRES cascade actions. So dropping `leads`
-- while `calls` still references it silently deletes every call record.
-- `PRAGMA defer_foreign_keys` does NOT prevent this: it defers constraint
-- VIOLATION checks to commit time, it does not suppress cascade actions.
-- (Verified: an earlier ordering of this migration destroyed all 21 call rows
-- when replayed against a copy of production.)
--
-- So: park the children in a FK-free temp table, drop the child, rebuild the
-- parent, then rebuild the child against the new parent. At no point is a table
-- dropped while something still references it.
PRAGMA defer_foreign_keys = true;

-- 1. Park the call history somewhere with no foreign key of its own.
CREATE TABLE calls_tmp (
  id        INTEGER PRIMARY KEY,
  lead_id   INTEGER NOT NULL,
  called_at TEXT,
  channel   TEXT,
  outcome   TEXT,
  notes     TEXT
);
INSERT INTO calls_tmp (id, lead_id, called_at, channel, outcome, notes)
SELECT id, lead_id, called_at, channel, outcome, notes FROM calls;

-- 2. Drop the child first, so nothing references `leads`.
DROP TABLE calls;

-- ---------------------------------------------------------------- leads ----
CREATE TABLE leads_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT NOT NULL UNIQUE,
  first_name      TEXT,
  last_name       TEXT,
  company         TEXT,
  role            TEXT,
  phone           TEXT,
  website         TEXT,
  source          TEXT,
  subscribed_at   TEXT,
  beehiiv_id      TEXT UNIQUE,
  survey_help     TEXT,
  survey_ai_stage TEXT,
  survey_raw      TEXT,
  status          TEXT NOT NULL DEFAULT 'new'
                  CHECK (status IN (
                    -- current pipeline
                    'new', 'attempting', 'engaged', 'booked', 'won', 'lost', 'parked',
                    -- legacy values, still accepted so the previously deployed
                    -- worker cannot 500 while it is still serving traffic
                    'never_called', 'follow_up', 'done'
                  )),
  priority        TEXT,
  segment         TEXT,
  next_action_at  TEXT,
  research_brief  TEXT,
  flags           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  notes           TEXT,
  next_action     TEXT,
  research_confidence TEXT,
  call_opener     TEXT,
  email_subject   TEXT,
  email_draft     TEXT,
  -- new in 0003
  board_rank      REAL,              -- manual ordering inside a Kanban column
  owner           TEXT,              -- email of whoever is working the lead
  location        TEXT,              -- from beehiiv
  referral_url    TEXT,              -- from beehiiv
  beehiiv_status  TEXT,              -- active / inactive / unsubscribed
  campaign_id     TEXT,              -- set only when attribution is available
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  booked_at       TEXT,
  won_at          TEXT,
  lost_at         TEXT,
  lost_reason     TEXT,
  stage_changed_at TEXT
);

INSERT INTO leads_new (
  id, email, first_name, last_name, company, role, phone, website, source,
  subscribed_at, beehiiv_id, survey_help, survey_ai_stage, survey_raw,
  status, priority, segment, next_action_at, research_brief, flags,
  created_at, updated_at, notes, next_action, research_confidence,
  call_opener, email_subject, email_draft, board_rank, booked_at, stage_changed_at
)
SELECT
  l.id, l.email, l.first_name, l.last_name, l.company, l.role, l.phone,
  l.website, l.source, l.subscribed_at, l.beehiiv_id, l.survey_help,
  l.survey_ai_stage, l.survey_raw,
  CASE l.status
    WHEN 'never_called' THEN 'new'
    WHEN 'booked'       THEN 'booked'
    WHEN 'parked'       THEN 'parked'
    WHEN 'done'         THEN 'lost'
    -- 'follow_up' conflated "no pickup, keep trying" with "we actually spoke".
    -- Split it on the call log: a real two-way contact means engaged.
    WHEN 'follow_up'    THEN (
      CASE WHEN EXISTS (
        SELECT 1 FROM calls_tmp c
        WHERE c.lead_id = l.id
          AND c.outcome IN ('sent', 'replied', 'booked', 'connected')
      ) THEN 'engaged' ELSE 'attempting' END
    )
    ELSE 'new'
  END,
  l.priority, l.segment, l.next_action_at, l.research_brief, l.flags,
  l.created_at, l.updated_at, l.notes, l.next_action, l.research_confidence,
  l.call_opener, l.email_subject, l.email_draft,
  l.id * 1000.0,
  CASE WHEN l.status = 'booked'
       THEN (SELECT MAX(c.called_at) FROM calls_tmp c
             WHERE c.lead_id = l.id AND c.outcome = 'booked')
       END,
  l.updated_at
FROM leads l;

DROP TABLE leads;
ALTER TABLE leads_new RENAME TO leads;

CREATE INDEX idx_leads_status       ON leads (status);
CREATE INDEX idx_leads_next_action  ON leads (next_action_at);
CREATE INDEX idx_leads_subscribed   ON leads (subscribed_at);
CREATE INDEX idx_leads_source       ON leads (source);
CREATE INDEX idx_leads_board        ON leads (status, board_rank);

-- ---------------------------------------------------------------- calls ----
-- Rebuilt against the new `leads`, and widened so "we got through but they did
-- not book" is recordable instead of being flattened into 'other'.
CREATE TABLE calls (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id     INTEGER NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
  called_at   TEXT NOT NULL DEFAULT (datetime('now')),
  channel     TEXT NOT NULL DEFAULT 'call'
              CHECK (channel IN ('call', 'email', 'sms', 'linkedin', 'meeting', 'whatsapp')),
  outcome     TEXT NOT NULL
              CHECK (outcome IN ('no_answer', 'voicemail', 'recall', 'connected',
                                 'booked', 'no_show', 'wrong_number',
                                 'not_interested', 'sent', 'replied', 'other')),
  notes       TEXT,
  actor       TEXT,
  duration_s  INTEGER
);

INSERT INTO calls (id, lead_id, called_at, channel, outcome, notes)
SELECT id, lead_id, called_at, channel, outcome, notes FROM calls_tmp;

DROP TABLE calls_tmp;

CREATE INDEX idx_calls_lead ON calls (lead_id);
CREATE INDEX idx_calls_when ON calls (called_at);

-- ------------------------------------------------------------ campaigns ----
CREATE TABLE campaigns (
  id            TEXT PRIMARY KEY,          -- platform's own campaign id
  platform      TEXT NOT NULL DEFAULT 'meta',
  account_id    TEXT,
  name          TEXT NOT NULL,
  objective     TEXT,
  status        TEXT,                      -- ACTIVE / PAUSED / ...
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Money is stored in integer minor units (cents) so that summing spend never
-- accumulates floating point error.
CREATE TABLE campaign_spend (
  campaign_id TEXT NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  date        TEXT NOT NULL,               -- YYYY-MM-DD, the platform's own day
  spend_cents INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks      INTEGER NOT NULL DEFAULT 0,
  results     INTEGER,                     -- platform-attributed conversions
  currency    TEXT NOT NULL DEFAULT 'AUD',
  synced_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (campaign_id, date)
);

CREATE INDEX idx_spend_date ON campaign_spend (date);

-- ---------------------------------------------------------------- deals ----
-- Drives LTV. Created when a lead is marked won; amount can be edited later.
CREATE TABLE deals (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id     INTEGER NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
  name        TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency    TEXT NOT NULL DEFAULT 'AUD',
  status      TEXT NOT NULL DEFAULT 'open'
              CHECK (status IN ('open', 'won', 'lost')),
  closed_at   TEXT,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_deals_lead   ON deals (lead_id);
CREATE INDEX idx_deals_status ON deals (status, closed_at);

-- ----------------------------------------------------------- lead_events ---
-- Append-only audit trail. Powers "what actually moved today" in the daily
-- report, which cannot be reconstructed from current state alone.
CREATE TABLE lead_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id    INTEGER NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
  type       TEXT NOT NULL,                -- created | stage_change | contact | deal | note
  from_stage TEXT,
  to_stage   TEXT,
  detail     TEXT,
  actor      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_events_lead ON lead_events (lead_id);
CREATE INDEX idx_events_when ON lead_events (created_at);
CREATE INDEX idx_events_type ON lead_events (type, created_at);

-- Seed the trail so existing leads are not invisible in historical reports.
INSERT INTO lead_events (lead_id, type, to_stage, detail, actor, created_at)
SELECT id, 'created', status, 'backfilled from existing record', 'migration',
       COALESCE(subscribed_at, created_at)
FROM leads;

-- ---------------------------------------------------- webhook_deliveries ---
-- Every inbound webhook is recorded. `dedupe_key` makes replays no-ops.
CREATE TABLE webhook_deliveries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source      TEXT NOT NULL,               -- 'beehiiv'
  dedupe_key  TEXT UNIQUE,
  event_type  TEXT,
  email       TEXT,
  lead_id     INTEGER,
  outcome     TEXT NOT NULL,               -- created | updated | ignored | error
  error       TEXT,
  payload     TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_webhooks_when ON webhook_deliveries (received_at);

-- ----------------------------------------------------------- sync_state ----
CREATE TABLE sync_state (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
