// The survey's questions and answers, shared by the pages (to render them) and
// the Worker (to validate what comes back). The `value` is what travels over the
// wire; the `label` is what lands in the CRM, so it should read well on a card.

export interface SurveyOption<V extends string = string> {
  value: V;
  label: string;
}

export const AI_STAGES = [
  { value: "researching", label: "Just researching" },
  { value: "tinkering", label: "Tinkering with ChatGPT" },
  { value: "pilots", label: "Running pilots in the business" },
  { value: "live", label: "Live, a few things in production" },
  { value: "stuck", label: "Tried it, didn't land" },
] as const satisfies readonly SurveyOption[];

export const BOTTLENECKS = [
  { value: "admin", label: "Admin and operations" },
  { value: "sales", label: "Sales and lead follow-up" },
  { value: "reporting", label: "Reporting and finance" },
  { value: "service", label: "Customer service" },
  { value: "unsure", label: "Not sure yet, that's the point" },
] as const satisfies readonly SurveyOption[];

export const TEAM_SIZES = [
  { value: "solo", label: "Just me" },
  { value: "2-10", label: "2–10" },
  { value: "11-50", label: "11–50" },
  { value: "50+", label: "50+" },
] as const satisfies readonly SurveyOption[];

export type AiStage = (typeof AI_STAGES)[number]["value"];
export type Bottleneck = (typeof BOTTLENECKS)[number]["value"];
export type TeamSize = (typeof TEAM_SIZES)[number]["value"];

export function labelFor(
  options: readonly SurveyOption[],
  value: unknown,
): string | null {
  if (typeof value !== "string") return null;
  return options.find((option) => option.value === value)?.label ?? null;
}

export function isOption<V extends string>(
  options: readonly SurveyOption<V>[],
  value: unknown,
): value is V {
  return typeof value === "string" && options.some((option) => option.value === value);
}

// Country codes offered next to the phone field. Australia first: that's who
// the ads reach. "Other" means the visitor types the full +number themselves.
export const PHONE_COUNTRIES = [
  { value: "+61", label: "AU +61" },
  { value: "+64", label: "NZ +64" },
  { value: "+44", label: "UK +44" },
  { value: "+1", label: "US/CA +1" },
  { value: "+65", label: "SG +65" },
  { value: "other", label: "Other" },
] as const satisfies readonly SurveyOption[];

/**
 * Turn what someone typed into an international number (+61412345678), or
 * null if it can't be one. A leading "+" wins over the country picker, so
 * pasting a full number always works.
 */
export function normalisePhone(raw: unknown, country: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const digits = trimmed.replace(/\D/g, "");
  let full: string;
  if (trimmed.startsWith("+") || trimmed.startsWith("00")) {
    full = trimmed.startsWith("00") ? digits.slice(2) : digits;
  } else {
    const code = typeof country === "string" && /^\+\d{1,3}$/.test(country) ? country.slice(1) : null;
    if (!code) return null;
    full = code + digits.replace(/^0+/, "");
  }
  // E.164 allows up to 15 digits; anything under 8 is not a real mobile.
  if (full.length < 8 || full.length > 15) return null;
  return `+${full}`;
}

/** "https://www.Acme.com.au/" -> "acme.com.au". Null if it isn't a plausible site. */
export function normaliseWebsite(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed.length > 200) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!host.includes(".") || host.endsWith(".")) return null;
  const path = url.pathname.replace(/\/+$/, "");
  return host + path;
}

/** First name as typed, minus anything that isn't plausibly part of a name. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw
    .replace(/<[^>]*>/g, "")
    .replace(/[^\p{L}\p{M}' .-]/gu, "")
    .trim()
    .slice(0, 40)
    .trim();
  return name === "" ? null : name;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function cleanEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return null;
  return email;
}
