// Formatting. Money is integer cents everywhere; currency is AUD.
// A null ratio or a null money value renders as an em dash — never as 0.

export const EM_DASH = '—';

const AU = 'en-AU';

function pad2(n) { return String(n).padStart(2, '0'); }

/** Integer cents -> "$1,234" or "$1,234.50". Null -> em dash. */
export function money(cents, { showCents = 'auto' } = {}) {
  if (cents === null || cents === undefined || !Number.isFinite(Number(cents))) return EM_DASH;
  const n = Math.round(Number(cents));
  const sign = n < 0 ? '−' : '';
  const abs = Math.abs(n);
  const dollars = Math.floor(abs / 100);
  const rest = abs % 100;
  const wantCents = showCents === true || (showCents === 'auto' && rest !== 0);
  return `${sign}$${dollars.toLocaleString(AU)}${wantCents ? `.${pad2(rest)}` : ''}`;
}

/** Compact money for axis ticks: $0, $85, $1.2k. */
export function moneyTick(cents) {
  if (cents === null || cents === undefined) return EM_DASH;
  const dollars = Number(cents) / 100;
  const abs = Math.abs(dollars);
  if (abs >= 1000) {
    const k = dollars / 1000;
    return `$${(Math.abs(k) >= 10 ? Math.round(k) : Math.round(k * 10) / 10).toLocaleString(AU)}k`;
  }
  return `$${(Math.round(dollars * 100) / 100).toLocaleString(AU)}`;
}

export function int(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return EM_DASH;
  return Math.round(Number(n)).toLocaleString(AU);
}

/** A 0..1 fraction -> "12.4%". Null -> em dash. */
export function pct(fraction, digits = 1) {
  if (fraction === null || fraction === undefined || !Number.isFinite(Number(fraction))) return EM_DASH;
  const v = Number(fraction) * 100;
  if (Math.abs(v) >= 10 || Number.isInteger(v)) return `${Math.round(v)}%`;
  return `${v.toFixed(digits)}%`;
}

/** A multiple -> "3.2x". Null -> em dash. */
export function ratio(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return EM_DASH;
  const v = Number(n);
  return `${(Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString(AU)}×`;
}

/** Tolerant parse of the API's date (YYYY-MM-DD) and timestamp (UTC) forms. */
export function parseWhen(value) {
  if (!value) return null;
  const s = String(value).trim();
  let date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    date = new Date(`${s}T00:00:00`);            // a plain date is the operator's local day
  } else if (/^\d{4}-\d{2}-\d{2}[ T]/.test(s)) {
    const iso = s.replace(' ', 'T');
    date = new Date(/([zZ]|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`);  // SQLite datetime('now') is UTC
  } else {
    date = new Date(s);
  }
  return Number.isNaN(date.getTime()) ? null : date;
}

export function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function shiftISO(days, from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + days);
  return todayISO(d);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "1 Oct" — with the year only when it is not the current one. */
export function shortDate(value) {
  const d = parseWhen(value);
  if (!d) return EM_DASH;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${sameYear ? '' : ` ${d.getFullYear()}`}`;
}

/** "Wed 1 Oct 2026" */
export function longDate(value) {
  const d = parseWhen(value);
  if (!d) return EM_DASH;
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "1 Oct, 2:40pm" */
export function dateTime(value) {
  const d = parseWhen(value);
  if (!d) return EM_DASH;
  let h = d.getHours();
  const suffix = h >= 12 ? 'pm' : 'am';
  h = h % 12 === 0 ? 12 : h % 12;
  return `${shortDate(value)}, ${h}:${pad2(d.getMinutes())}${suffix}`;
}

function dayDiff(value) {
  const d = parseWhen(value);
  if (!d) return null;
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const now = new Date();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / 86400000);
}

/** Day-granular relative label: "today", "3d ago", "in 2d", then a date. */
export function relativeDay(value) {
  const diff = dayDiff(value);
  if (diff === null) return EM_DASH;
  if (diff === 0) return 'today';
  if (diff === -1) return 'yesterday';
  if (diff === 1) return 'tomorrow';
  if (diff < 0) return diff >= -29 ? `${-diff}d ago` : shortDate(value);
  return diff <= 29 ? `in ${diff}d` : shortDate(value);
}

export function daysOverdue(value) {
  const diff = dayDiff(value);
  return diff === null || diff >= 0 ? 0 : -diff;
}

export function fullName(lead) {
  const name = [lead?.first_name, lead?.last_name].filter(Boolean).join(' ').trim();
  if (name) return name;
  const email = lead?.email ? String(lead.email) : '';
  return email ? email.split('@')[0] : `Lead ${lead?.id ?? ''}`.trim();
}

/** A line of context: "Hartley Plumbing · Director" */
export function companyLine(lead) {
  return [lead?.company, lead?.role].filter(Boolean).join(' · ');
}

export function telHref(phone) {
  if (!phone) return null;
  const cleaned = String(phone).replace(/[^\d+]/g, '');
  return cleaned.length >= 6 ? `tel:${cleaned}` : null;
}

export const STAGES = [
  { id: 'new', label: 'New', blurb: 'never contacted' },
  { id: 'attempting', label: 'Attempting', blurb: 'tried, no pickup yet' },
  { id: 'engaged', label: 'Engaged', blurb: 'real two-way contact' },
  { id: 'booked', label: 'Booked', blurb: 'call is in the diary' },
  { id: 'won', label: 'Won', blurb: 'they bought' },
  { id: 'lost', label: 'Lost', blurb: 'dead' },
  { id: 'parked', label: 'Parked', blurb: 'revisit later' },
];

const STAGE_LABELS = new Map(STAGES.map((s) => [s.id, s.label]));
export function stageLabel(id) { return STAGE_LABELS.get(id) || (id ? String(id) : EM_DASH); }

export const CHANNELS = [
  ['call', 'Phone call'],
  ['sms', 'Text message'],
  ['whatsapp', 'WhatsApp'],
  ['email', 'Email'],
  ['linkedin', 'LinkedIn'],
  ['meeting', 'Meeting'],
];

export const OUTCOMES = [
  ['no_answer', 'No answer'],
  ['voicemail', 'Left a voicemail'],
  ['recall', 'Call back later'],
  ['connected', 'Spoke to them'],
  ['booked', 'Booked a call'],
  ['replied', 'They replied'],
  ['sent', 'Sent a message'],
  ['no_show', 'No show'],
  ['wrong_number', 'Wrong number'],
  ['not_interested', 'Not interested'],
  ['other', 'Something else'],
];

const CHANNEL_LABELS = new Map(CHANNELS);
const OUTCOME_LABELS = new Map(OUTCOMES);
export function channelLabel(id) { return CHANNEL_LABELS.get(id) || (id ? String(id) : 'Contact'); }
export function outcomeLabel(id) { return OUTCOME_LABELS.get(id) || (id ? String(id) : 'logged'); }

export function duration(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return null;
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const rest = Math.round(s % 60);
  return rest ? `${m}m ${rest}s` : `${m}m`;
}

/** Dollars typed by a human -> integer cents. Returns null when unparseable. */
export function dollarsToCents(input) {
  if (input === null || input === undefined) return null;
  const cleaned = String(input).replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  if (!/^-?\d*(\.\d{0,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function centsToDollarInput(cents) {
  if (cents === null || cents === undefined) return '';
  const n = Math.round(Number(cents));
  if (!Number.isFinite(n)) return '';
  return (n % 100 === 0) ? String(n / 100) : (n / 100).toFixed(2);
}
