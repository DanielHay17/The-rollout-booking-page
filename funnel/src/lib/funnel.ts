import {
  AI_STAGES,
  BOTTLENECKS,
  TEAM_SIZES,
  cleanEmail,
  cleanName,
  isOption,
  type AiStage,
  type Bottleneck,
  type TeamSize,
} from "@shared/survey";

/*
 * What the funnel remembers between pages. It lives in sessionStorage, so it
 * belongs to this browser tab only and is gone when the tab closes.
 */
export interface FunnelState {
  /** Lets this tab add answers to the lead it just created. */
  token?: string;
  email?: string;
  name?: string;
  stage?: AiStage;
  bottleneck?: Bottleneck;
  team?: TeamSize;
  website?: string;
  phone?: string;
  utm?: Record<string, string>;
  /** Set on subscribe, cleared once /welcome has told Meta about it. */
  pendingSubscribeEvent?: boolean;
  /** So a refresh of /booked doesn't count a second booking. */
  scheduleTracked?: boolean;
}

const STORAGE_KEY = "rollout-funnel";

export function readState(): FunnelState {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FunnelState) : {};
  } catch {
    return {};
  }
}

export function writeState(patch: Partial<FunnelState>): FunnelState {
  const next = { ...readState(), ...patch };
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode or storage blocked: the funnel still works, just less personal.
  }
  return next;
}

/**
 * beehiiv only fills in {{email}} in links; other merge tags arrive as
 * literal "{{first name}}". Treat anything still in braces as absent.
 */
function urlParam(params: URLSearchParams, key: string): string {
  const value = params.get(key) ?? "";
  return value.includes("{") || value.includes("}") ? "" : value;
}

/**
 * Stored answers, topped up from the URL (?name=&stage=&email=) for people
 * who arrive from an email link rather than through the survey.
 */
export function currentState(): FunnelState {
  const stored = readState();
  const params = new URLSearchParams(window.location.search);
  const fromUrl: FunnelState = {};
  const name = cleanName(urlParam(params, "name"));
  if (name) fromUrl.name = name;
  const email = cleanEmail(urlParam(params, "email"));
  if (email) fromUrl.email = email;
  const stage = urlParam(params, "stage").toLowerCase().trim();
  if (isOption(AI_STAGES, stage)) fromUrl.stage = stage;
  const bottleneck = urlParam(params, "focus").toLowerCase().trim();
  if (isOption(BOTTLENECKS, bottleneck)) fromUrl.bottleneck = bottleneck;
  const team = urlParam(params, "team").toLowerCase().trim();
  if (isOption(TEAM_SIZES, team)) fromUrl.team = team;
  return { ...fromUrl, ...stripEmpty(stored) };
}

function stripEmpty(state: FunnelState): FunnelState {
  return Object.fromEntries(
    Object.entries(state).filter(([, value]) => value !== undefined && value !== ""),
  ) as FunnelState;
}

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

/** The ad's tracking tags from the current URL, so the CRM can attribute the lead. */
export function utmFromUrl(): Record<string, string> {
  const params = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const value = urlParam(params, key).trim();
    if (value) out[key] = value.slice(0, 200);
  }
  return out;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function postJson<T>(
  path: string,
  body: unknown,
  { timeoutMs = 8000, keepalive = false }: { timeoutMs?: number; keepalive?: boolean } = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      keepalive,
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new ApiError(data.error ?? `HTTP ${response.status}`, response.status);
    return data as T;
  } finally {
    window.clearTimeout(timer);
  }
}

export type FunnelEvent =
  | "page_welcome"
  | "page_sprint"
  | "page_booked"
  | "vsl_play"
  | "vsl_25"
  | "vsl_50"
  | "vsl_75"
  | "vsl_95"
  | "book_click"
  | "text_click";

/** Fire-and-forget funnel analytics. Survives the page being closed. */
export function sendEvent(event: FunnelEvent) {
  const { token } = readState();
  const body = JSON.stringify({ event, token: token ?? null, path: window.location.pathname });
  try {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon?.("/api/event", blob)) return;
  } catch {
    // fall through to fetch
  }
  fetch("/api/event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}
