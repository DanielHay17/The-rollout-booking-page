-- Baseline schema, reconstructed to match what is already applied in production.
-- Production recorded this migration on 2026-09-28; it is replayed only on fresh
-- (local / preview) databases, so it must stay byte-compatible with live prod.

CREATE TABLE leads (
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
  status          TEXT NOT NULL DEFAULT 'never_called'
                  CHECK (status IN ('never_called', 'follow_up', 'booked', 'done', 'parked')),
  priority        TEXT,
  segment         TEXT,
  next_action_at  TEXT,
  research_brief  TEXT,
  flags           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE calls (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id     INTEGER NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
  called_at   TEXT NOT NULL DEFAULT (datetime('now')),
  channel     TEXT NOT NULL DEFAULT 'call'
              CHECK (channel IN ('call', 'email', 'sms', 'linkedin', 'meeting')),
  outcome     TEXT NOT NULL
              CHECK (outcome IN ('no_answer', 'recall', 'booked', 'wrong_number',
                                 'not_interested', 'sent', 'replied', 'other')),
  notes       TEXT
);

CREATE INDEX idx_calls_lead ON calls (lead_id);
CREATE INDEX idx_leads_status ON leads (status);
