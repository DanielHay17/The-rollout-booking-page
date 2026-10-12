import type { Env } from "./index";
import { funnelEvent } from "./util";

/*
 * beehiiv is where the newsletter goes out, so every funnel signup must reach
 * it. The subscribe request adds them straight away; if that fails (beehiiv
 * down, key missing), the cron in wrangler.jsonc retries every 10 minutes for
 * a day. The CRM is the source of truth either way.
 */

export interface Utm {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
}

const MAX_ATTEMPTS = 5;

function beehiivConfig(env: Env) {
  const key = env.BEEHIIV_API_KEY?.trim();
  const publication = env.BEEHIIV_PUBLICATION_ID?.trim();
  return key && publication ? { key, publication } : null;
}

function beehiivFetch(config: { key: string; publication: string }, path: string, init: RequestInit) {
  return fetch(
    `https://api.beehiiv.com/v2/publications/${encodeURIComponent(config.publication)}${path}`,
    {
      ...init,
      headers: {
        authorization: `Bearer ${config.key}`,
        "content-type": "application/json",
        accept: "application/json",
      },
    },
  );
}

export async function addToBeehiiv(
  env: Env,
  lead: { leadId: number; email: string; utm: Partial<Utm>; referrer: string | null },
) {
  const config = beehiivConfig(env);
  if (!config) {
    console.error(`beehiiv: BEEHIIV_API_KEY not set, lead ${lead.leadId} saved to the CRM only`);
    return;
  }
  try {
    const response = await beehiivFetch(config, "/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        email: lead.email,
        // They just filled in the subscribe form, so an old unsubscribe
        // shouldn't silently swallow this one.
        reactivate_existing: true,
        send_welcome_email: true,
        utm_source: lead.utm.utm_source ?? undefined,
        utm_medium: lead.utm.utm_medium ?? undefined,
        utm_campaign: lead.utm.utm_campaign ?? undefined,
        utm_content: lead.utm.utm_content ?? undefined,
        utm_term: lead.utm.utm_term ?? undefined,
        referring_site: lead.referrer ?? undefined,
      }),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      console.error(`beehiiv: subscribe for lead ${lead.leadId} returned ${response.status}`);
      await funnelEvent(env.DB, lead.leadId, "beehiiv_error", { status: response.status, detail }).run();
      return;
    }
    const data = (await response.json().catch(() => null)) as { data?: { id?: unknown } } | null;
    const subscriptionId = typeof data?.data?.id === "string" ? data.data.id : null;
    const statements = [funnelEvent(env.DB, lead.leadId, "beehiiv_subscribed", null)];
    if (subscriptionId) {
      statements.unshift(
        env.DB.prepare("UPDATE leads SET beehiiv_id = COALESCE(beehiiv_id, ?) WHERE id = ?").bind(
          subscriptionId,
          lead.leadId,
        ),
      );
    }
    await env.DB.batch(statements).catch(async (err: unknown) => {
      // beehiiv_id is unique; if another lead row already holds this
      // subscription the CRM's hourly sync will sort it out. Still record success.
      console.warn("beehiiv: could not store subscription id", err instanceof Error ? err.message : err);
      await funnelEvent(env.DB, lead.leadId, "beehiiv_subscribed", null).run();
    });
  } catch (err) {
    console.error(`beehiiv: subscribe for lead ${lead.leadId} failed`, err instanceof Error ? err.message : err);
    await funnelEvent(env.DB, lead.leadId, "beehiiv_error", {
      detail: err instanceof Error ? err.message.slice(0, 300) : "unknown",
    })
      .run()
      .catch(() => {});
  }
}

/** Funnel signups from the last day that haven't reached beehiiv yet. */
export async function retryBeehiiv(env: Env) {
  if (!beehiivConfig(env)) return;
  const { results } = await env.DB.prepare(
    `SELECT l.id, l.email, l.utm_source, l.utm_medium, l.utm_campaign, l.referral_url
       FROM leads l
      WHERE l.beehiiv_id IS NULL
        AND EXISTS (
          SELECT 1 FROM funnel_sessions s
           WHERE s.lead_id = l.id
             AND s.created_at >= datetime('now', '-1 day')
             AND s.created_at <= datetime('now', '-5 minutes'))
        AND NOT EXISTS (
          SELECT 1 FROM funnel_events e
           WHERE e.lead_id = l.id AND e.event = 'beehiiv_subscribed')
        AND (SELECT COUNT(*) FROM funnel_events e
              WHERE e.lead_id = l.id AND e.event = 'beehiiv_error') < ?
      LIMIT 20`,
  )
    .bind(MAX_ATTEMPTS)
    .all<{
      id: number;
      email: string;
      utm_source: string | null;
      utm_medium: string | null;
      utm_campaign: string | null;
      referral_url: string | null;
    }>();

  for (const row of results) {
    await addToBeehiiv(env, {
      leadId: row.id,
      email: row.email,
      utm: { utm_source: row.utm_source, utm_medium: row.utm_medium, utm_campaign: row.utm_campaign },
      referrer: row.referral_url,
    });
  }
  if (results.length) console.log(`beehiiv: retried ${results.length} funnel signups`);
}

/**
 * Copy the answers beehiiv already has fields for onto the subscription, so
 * emails can be segmented by them. Everything else lives in the CRM.
 */
export async function updateBeehiivFields(
  env: Env,
  email: string,
  answers: { firstName: string | null; stage: string | null },
) {
  const config = beehiivConfig(env);
  if (!config) return;
  // beehiiv's docs show fields addressed by their display name, while the
  // publication lists an internal name too. Send both: an unknown name only
  // produces a warning, never a failed update.
  const fields: { name: string; value: string }[] = [];
  if (answers.firstName) {
    fields.push({ name: "First Name", value: answers.firstName }, { name: "first_name", value: answers.firstName });
  }
  if (answers.stage) {
    fields.push(
      { name: "Where are you with AI right now?", value: answers.stage },
      { name: "where_are_you_with_ai_right_now?", value: answers.stage },
    );
  }
  if (!fields.length) return;
  try {
    const response = await beehiivFetch(config, `/subscriptions/by_email/${encodeURIComponent(email)}`, {
      method: "PUT",
      body: JSON.stringify({ custom_fields: fields }),
    });
    if (!response.ok) console.warn(`beehiiv: field update returned ${response.status}`);
  } catch (err) {
    console.warn("beehiiv: field update failed", err instanceof Error ? err.message : err);
  }
}
