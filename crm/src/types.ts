/**
 * Shared types for the rollout-crm Worker.
 *
 * Money is ALWAYS integer cents, everywhere, in AUD (the Meta ad account's
 * currency). Any value named `*_cents` is an integer; any value named `ratio`,
 * `ctr`, `roas` or a `funnel.*` key is a unitless fraction that is `null`
 * whenever its denominator is zero.
 */

export interface Env {
  // --- bindings -----------------------------------------------------------
  DB: D1Database;
  ASSETS: Fetcher;

  // --- vars (wrangler.jsonc, safe to keep in source control) --------------
  BEEHIIV_PUBLICATION_ID: string;
  META_AD_ACCOUNT_ID: string;
  META_API_VERSION: string;
  APP_VERSION: string;

  // --- secrets (wrangler secret put; absent in local dev) -----------------
  // Declared optional on purpose: the code must detect a missing secret and
  // fail closed with a 503 rather than silently behaving as if it were set.
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ALLOWED_EMAILS?: string;
  BEEHIIV_API_KEY?: string;
  BEEHIIV_WEBHOOK_SECRET?: string;
  META_ACCESS_TOKEN?: string;
}

// ---------------------------------------------------------------- stages ---

/** The seven live Kanban columns, in board order. */
export const STAGES = [
  'new',
  'attempting',
  'engaged',
  'booked',
  'won',
  'lost',
  'parked',
] as const;

export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Readonly<Record<Stage, string>> = {
  new: 'New',
  attempting: 'Attempting',
  engaged: 'Engaged',
  booked: 'Booked',
  won: 'Won',
  lost: 'Lost',
  parked: 'Parked',
};

/**
 * Statuses that still exist in the live database from before the pipeline was
 * widened. They are accepted on read and translated; they are NEVER written.
 */
export const LEGACY_STATUSES = ['never_called', 'follow_up', 'done'] as const;
export type LegacyStatus = (typeof LEGACY_STATUSES)[number];

/**
 * Explicit stage ordering, used so "logging a contact never downgrades a lead"
 * is a comparison instead of a pile of special cases.
 *
 * `won` is deliberately the maximum: nothing a contact log can say moves a
 * customer back into the pipeline. `lost` and `parked` sit above `booked` so
 * that an "I rang them and they did not answer" style outcome cannot drag a
 * dead or deliberately-parked lead back into the working columns; the two
 * outcomes that are allowed to do that (`booked`, `not_interested`) are
 * unconditional in the contact table and do not consult this ordering.
 */
export const STAGE_ORDER: Readonly<Record<Stage, number>> = {
  new: 0,
  attempting: 1,
  engaged: 2,
  booked: 3,
  lost: 4,
  parked: 5,
  won: 6,
};

// -------------------------------------------------------- contact channels --

export const CHANNELS = [
  'call',
  'email',
  'sms',
  'linkedin',
  'meeting',
  'whatsapp',
] as const;
export type Channel = (typeof CHANNELS)[number];

export const OUTCOMES = [
  'no_answer',
  'voicemail',
  'recall',
  'connected',
  'booked',
  'no_show',
  'wrong_number',
  'not_interested',
  'sent',
  'replied',
  'other',
] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const DEAL_STATUSES = ['open', 'won', 'lost'] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export type EventType = 'created' | 'stage_change' | 'contact' | 'deal' | 'note';

// ------------------------------------------------------------- wire shapes --

/** One card on the Kanban board. `status` is always a normalised `Stage`. */
export interface LeadCard {
  id: number;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  role: string | null;
  phone: string | null;
  email: string;
  status: Stage;
  priority: string | null;
  source: string | null;
  segment: string | null;
  owner: string | null;
  subscribed_at: string | null;
  next_action: string | null;
  next_action_at: string | null;
  board_rank: number | null;
  attempts: number;
  last_contact: string | null;
  survey_help: string | null;
  survey_ai_stage: string | null;
  deal_amount_cents: number;
  is_overdue: boolean;
}

export interface Call {
  id: number;
  lead_id: number;
  called_at: string;
  channel: string;
  outcome: string;
  notes: string | null;
  actor: string | null;
  duration_s: number | null;
}

export interface LeadEvent {
  id: number;
  lead_id: number;
  type: string;
  from_stage: string | null;
  to_stage: string | null;
  detail: string | null;
  actor: string | null;
  created_at: string;
}

export interface Deal {
  id: number;
  lead_id: number;
  name: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  closed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BoardColumn {
  id: Stage;
  label: string;
  count: number;
  leads: LeadCard[];
}

export interface BoardTotals {
  leads: number;
  booked: number;
  won: number;
  due_today: number;
  overdue: number;
  never_contacted: number;
}

/** `POST /api/sync/beehiiv` */
export interface BeehiivSyncResult {
  ok: boolean;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

/** `POST /api/sync/meta` */
export interface MetaSyncResult {
  ok: boolean;
  campaigns: number;
  days: number;
  errors: string[];
}

/**
 * A beehiiv subscriber flattened into the handful of CRM columns we are willing
 * to write. Both the inbound webhook and the API backfill produce this shape
 * and hand it to one shared upsert, so the "never clobber a manual edit" rule
 * only exists in one place.
 */
export interface SubscriberInput {
  beehiiv_id: string | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  company: string | null;
  survey_help: string | null;
  survey_ai_stage: string | null;
  source: string | null;
  subscribed_at: string | null;
  location: string | null;
  referral_url: string | null;
  beehiiv_status: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  /** The whole inbound payload, JSON-encoded, kept in `leads.survey_raw`. */
  survey_raw: string;
}

export type UpsertOutcome = 'created' | 'updated';

export interface UpsertResult {
  outcome: UpsertOutcome;
  lead_id: number;
}
