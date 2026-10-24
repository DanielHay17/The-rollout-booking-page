import {
  AI_STAGES,
  BOTTLENECKS,
  TEAM_SIZES,
  cleanCompany,
  cleanEmail,
  cleanName,
  labelFor,
  normalisePhone,
  normaliseWebsite,
} from "../shared/survey";
import { addToBeehiiv, retryBeehiivSoon, updateBeehiivFields, type Utm } from "./beehiiv";
import { shortLinkRedirect } from "./links";
import { serveVideo } from "./video";
import {
  funnelEvent,
  json,
  metaCampaignId,
  readJsonObject,
  sameOrigin,
  sourceFromReferrer,
  sourceFromUtm,
  str,
} from "./util";

/*
 * The funnel's API. Three small endpoints the pages call, all writing into
 * the CRM's D1 database (binding DB), so subscribers, survey answers and
 * funnel steps show up in rollout-crm the moment they happen.
 *
 *   POST /api/subscribe  email in, lead + session token out
 *   POST /api/answers    survey answers for that lead
 *   POST /api/event      page views and VSL progress, for the funnel numbers
 *   GET  /api/health     is beehiiv configured, can we reach the database
 */

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  BEEHIIV_API_KEY?: string;
  BEEHIIV_PUBLICATION_ID?: string;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      // Videos come through here so iPhones get the byte ranges they ask for.
      if (url.pathname.endsWith(".mp4")) return serveVideo(request, env.ASSETS);
      // Otherwise only paths with no matching page reach the Worker; short links are those.
      return shortLinkRedirect(url) ?? env.ASSETS.fetch(request);
    }
    try {
      return await handleApi(request, env, ctx, url);
    } catch (err) {
      console.error("api error", url.pathname, err instanceof Error ? err.message : String(err));
      return json({ error: "server error" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

async function handleApi(request: Request, env: Env, ctx: ExecutionContext, url: URL) {
  const route = url.pathname.replace(/\/+$/, "");

  if (route === "/api/health") {
    if (request.method !== "GET") return json({ error: "method not allowed" }, 405);
    const db = await env.DB.prepare("SELECT 1 AS ok")
      .first<{ ok: number }>()
      .then((row) => row?.ok === 1)
      .catch(() => false);
    return json({
      ok: db,
      db,
      beehiiv: Boolean(env.BEEHIIV_API_KEY?.trim() && env.BEEHIIV_PUBLICATION_ID?.trim()),
    });
  }

  const handlers: Record<string, (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>> = {
    "/api/subscribe": subscribe,
    "/api/answers": answers,
    "/api/event": event,
  };
  const handler = handlers[route];
  if (!handler) return json({ error: "not found" }, 404);
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
  // Only our own pages may post here; stops other sites scripting signups.
  if (!sameOrigin(request, url)) return json({ error: "forbidden" }, 403);
  return handler(request, env, ctx);
}

/* ---------------------------------------------------------------- subscribe */

async function subscribe(request: Request, env: Env, ctx: ExecutionContext) {
  const body = await readJsonObject(request);
  if (!body) return json({ error: "bad request" }, 400);

  // A hidden field people never see. Anything in it is a bot: pretend it
  // worked and store nothing.
  if (str(body.company_fax)) return json({ ok: true, token: null });

  const email = cleanEmail(body.email);
  if (!email) return json({ error: "invalid email" }, 400);

  const utm: Utm = {
    utm_source: str(body.utm_source, 200),
    utm_medium: str(body.utm_medium, 200),
    utm_campaign: str(body.utm_campaign, 200),
    utm_content: str(body.utm_content, 200),
    utm_term: str(body.utm_term, 200),
  };
  const referrer = str(body.referrer, 300);
  const landing = str(body.landing, 100);
  // No tags: credit it the way beehiiv's own form does (direct, or the
  // referring site), so beehiiv's acquisition reports read the same as before.
  if (!utm.utm_source) {
    const fallback = sourceFromReferrer(referrer);
    utm.utm_source = fallback.source;
    utm.utm_medium = utm.utm_medium ?? fallback.medium;
  }
  const campaignId = metaCampaignId(str(body.utm_id, 40), utm.utm_campaign);

  const { leadId, created } = await upsertLead(env.DB, email, utm, referrer, campaignId);
  const token = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO funnel_sessions (token, lead_id, created_lead) VALUES (?, ?, ?)").bind(
      token,
      leadId,
      created ? 1 : 0,
    ),
    funnelEvent(env.DB, leadId, "subscribe", { new_lead: created, landing, ...compact(utm) }),
  ]);

  ctx.waitUntil(addToBeehiiv(env, { leadId, email, utm, referrer }));
  ctx.waitUntil(retryBeehiivSoon(env));
  return json({ ok: true, token });
}

async function upsertLead(
  db: D1Database,
  email: string,
  utm: Utm,
  referrer: string | null,
  campaignId: string | null,
) {
  const findLead = () =>
    db.prepare("SELECT id FROM leads WHERE lower(email) = ?").bind(email).first<{ id: number }>();

  const existing = await findLead();
  if (existing) return { leadId: existing.id, created: false };

  const source = sourceFromUtm(utm.utm_source, utm.utm_medium) ?? "funnel";
  try {
    // Same shape as a lead the CRM creates from beehiiv: new, top of the board.
    const inserted = await db
      .prepare(
        `INSERT INTO leads (
           email, source, subscribed_at, utm_source, utm_medium, utm_campaign,
           campaign_id, referral_url, status, stage_changed_at, board_rank
         ) VALUES (
           ?, ?, datetime('now'), ?, ?, ?, ?, ?, 'new', datetime('now'),
           (SELECT COALESCE(MAX(board_rank), 0) + 1000 FROM leads
             WHERE status IN ('new', 'never_called'))
         )`,
      )
      .bind(email, source, utm.utm_source, utm.utm_medium, utm.utm_campaign, campaignId, referrer)
      .run();
    const leadId = Number(inserted.meta.last_row_id);
    await db
      .prepare(
        `INSERT INTO lead_events (lead_id, type, to_stage, detail, actor)
         VALUES (?, 'created', 'new', ?, 'funnel')`,
      )
      .bind(leadId, source === "funnel" ? "subscribed via the funnel" : `subscribed via the funnel (${source})`)
      .run();
    return { leadId, created: true };
  } catch (err) {
    // Two tabs subscribing the same email at once: the other one won.
    const raced = await findLead();
    if (raced) return { leadId: raced.id, created: false };
    throw err;
  }
}

/* ------------------------------------------------------------------ answers */

interface Session {
  lead_id: number;
  created_lead: number;
  email: string;
  survey_completed_at: string | null;
}

async function findSession(db: D1Database, token: unknown) {
  if (typeof token !== "string" || token.length === 0 || token.length > 64) return null;
  return db
    .prepare(
      `SELECT s.lead_id, s.created_lead, l.email, l.survey_completed_at
         FROM funnel_sessions s JOIN leads l ON l.id = s.lead_id
        WHERE s.token = ?`,
    )
    .bind(token)
    .first<Session>();
}

async function answers(request: Request, env: Env, ctx: ExecutionContext) {
  const body = await readJsonObject(request);
  if (!body) return json({ error: "bad request" }, 400);
  const session = await findSession(env.DB, body.token);
  if (!session) return json({ error: "unknown session" }, 404);

  const given = (typeof body.answers === "object" && body.answers !== null ? body.answers : {}) as Record<
    string,
    unknown
  >;
  const stage = labelFor(AI_STAGES, given.stage);
  const bottleneck = labelFor(BOTTLENECKS, given.bottleneck);
  const team = labelFor(TEAM_SIZES, given.team);
  const firstName = cleanName(given.first_name);
  const company = cleanCompany(given.company);
  const website = normaliseWebsite(given.website);
  const phone = normalisePhone(given.phone, null);
  const complete = body.complete === true;
  const firstCompletion = complete && !session.survey_completed_at;

  const sets: string[] = [];
  const binds: (string | number)[] = [];

  // Survey answers are what they just told us: always take the latest.
  for (const [column, value] of [
    ["survey_ai_stage", stage],
    ["survey_bottleneck", bottleneck],
    ["team_size", team],
  ] as const) {
    if (value) {
      sets.push(`${column} = ?`);
      binds.push(value);
    }
  }

  // Contact details on a lead that existed before this visit only fill
  // gaps, so nobody can overwrite a known lead's phone by typing their email.
  for (const [column, value] of [
    ["first_name", firstName],
    ["company", company],
    ["website", website],
    ["phone", phone],
  ] as const) {
    if (!value) continue;
    sets.push(session.created_lead ? `${column} = ?` : `${column} = COALESCE(NULLIF(${column}, ''), ?)`);
    binds.push(value);
  }

  if (complete) sets.push("survey_completed_at = COALESCE(survey_completed_at, datetime('now'))");

  const statements: D1PreparedStatement[] = [];
  if (sets.length) {
    statements.push(
      env.DB.prepare(`UPDATE leads SET ${sets.join(", ")}, updated_at = datetime('now') WHERE id = ?`).bind(
        ...binds,
        session.lead_id,
      ),
    );
  }

  const fields = Object.entries({ stage, bottleneck, team, first_name: firstName, company, website, phone })
    .filter(([, value]) => value)
    .map(([key]) => key);
  if (!complete && fields.length) {
    statements.push(funnelEvent(env.DB, session.lead_id, "survey_answer", { fields }));
  }
  if (firstCompletion) {
    statements.push(funnelEvent(env.DB, session.lead_id, "survey_complete", { phone: Boolean(phone) }));
    if (phone) statements.push(funnelEvent(env.DB, session.lead_id, "phone_given", null));
    const summary = [company, stage, bottleneck, team && `team ${team}`, phone ? "left a mobile" : "no mobile"]
      .filter(Boolean)
      .join(" · ");
    statements.push(
      env.DB.prepare(
        `INSERT INTO lead_events (lead_id, type, detail, actor) VALUES (?, 'survey', ?, 'funnel')`,
      ).bind(session.lead_id, summary),
    );
  }
  if (statements.length) await env.DB.batch(statements);

  if (firstCompletion) {
    ctx.waitUntil(updateBeehiivFields(env, session.email, { firstName, stage, company }));
  }
  ctx.waitUntil(retryBeehiivSoon(env));
  return json({ ok: true });
}

/* -------------------------------------------------------------------- event */

const EVENTS = new Set([
  "page_welcome",
  "page_sprint",
  "page_booked",
  "vsl_play",
  "vsl_25",
  "vsl_50",
  "vsl_75",
  "vsl_95",
  "book_click",
  "text_click",
]);

async function event(request: Request, env: Env) {
  const body = await readJsonObject(request);
  const name = body?.event;
  if (!body || typeof name !== "string" || !EVENTS.has(name)) return json({ error: "bad request" }, 400);
  const session = await findSession(env.DB, body.token);
  const path = str(body.path, 100);
  await funnelEvent(env.DB, session?.lead_id ?? null, name, path ? { path } : null).run();
  return new Response(null, { status: 204 });
}

/* ------------------------------------------------------------------ helpers */

function compact(record: object) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== null && value !== ""));
}
