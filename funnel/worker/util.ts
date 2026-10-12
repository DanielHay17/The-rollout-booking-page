const MAX_BODY_BYTES = 8 * 1024;

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/** The request body as a plain object, or null if it isn't small, valid JSON. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return null;
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES || raw.trim() === "") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** A trimmed, length-capped string, or null for anything else or empty. */
export function str(value: unknown, max = 500): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed.slice(0, max);
}

/**
 * Browsers send Origin on every POST. If it's there it must be this site; a
 * missing one (curl, server-to-server) is let through, since the endpoints
 * only ever add data.
 */
export function sameOrigin(request: Request, url: URL) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === url.host;
  } catch {
    return false;
  }
}

/*
 * Same source labels the CRM gives beehiiv subscribers (src/subscribers.ts in
 * rollout-crm), so "fb paid" means the same thing whichever way a lead came in.
 */
const CHANNEL_ALIASES: Record<string, string> = {
  facebook: "fb",
  fb: "fb",
  instagram: "ig",
  ig: "ig",
};

function platformToken(raw: string) {
  const bare = raw
    .trim()
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\.(com|net|org|co|io|com\.au|co\.uk)$/, "");
  return CHANNEL_ALIASES[bare] ?? bare;
}

export function sourceFromUtm(utmSource: string | null, utmMedium: string | null): string | null {
  if (!utmSource) return null;
  const platform = platformToken(utmSource);
  const medium = utmMedium?.trim().toLowerCase() ?? "";
  return medium === "" || medium === platform ? platform : `${platform} ${medium}`;
}

/** One row in funnel_events: the step-by-step record the funnel numbers come from. */
export function funnelEvent(db: D1Database, leadId: number | null, name: string, detail: unknown) {
  return db
    .prepare("INSERT INTO funnel_events (lead_id, event, detail) VALUES (?, ?, ?)")
    .bind(leadId, name, detail === null || detail === undefined ? null : JSON.stringify(detail).slice(0, 2000));
}
