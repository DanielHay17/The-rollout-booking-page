/**
 * Campaign reporting: what is running, what it cost, and an honest statement of
 * what the numbers can and cannot tell you.
 *
 * ATTRIBUTION. beehiiv records acquisition as a channel string — literally
 * "website: facebook / paid" — with no campaign id and no UTM parameters on the
 * subscriber. There is therefore NO join between a CRM lead and a Meta
 * campaign, and no amount of SQL will create one. So:
 *
 *   - per-campaign `cpl_cents` here is Meta's OWN attributed conversion count
 *     divided by Meta's own spend. It is the ad platform grading its own
 *     homework, and it is labelled as such.
 *   - the number to trust for "what does a lead actually cost us" is the
 *     blended `cost_per_lead_cents` in /api/metrics/summary, which divides real
 *     spend by real CRM leads.
 *
 * `attribution_note` ships in the response because the UI is required to show
 * it. Do not quietly drop it to tidy up a layout: without it the per-campaign
 * CPL column implies a lead-level attribution that does not exist.
 */

import type { Env } from './types';
import { json, ratio, centsPer } from './util';
import type { Window } from './util';

export const ATTRIBUTION_NOTE =
  'beehiiv records acquisition only as a channel string (for example "website: facebook / paid") '
  + 'with no campaign id and no UTM parameters, so an individual CRM lead cannot be traced back to '
  + 'a specific campaign. Cost per lead in this table is Meta’s own attributed conversion '
  + 'count, not CRM data. For "what does a lead actually cost us", use the blended cost per lead on '
  + 'the summary, which divides total spend by paid CRM leads.';

interface CampaignRow {
  id: string;
  name: string;
  status: string | null;
  objective: string | null;
  spend_cents: number | null;
  impressions: number | null;
  clicks: number | null;
  results: number | null;
}

export async function getCampaigns(env: Env, win: Window): Promise<Response> {
  // A campaign appears when it spent money inside the window OR when it is
  // live right now. The second half is the point of the screen: "exactly what
  // campaigns are happening" has to include one switched on this morning that
  // has not spent anything yet.
  const rows = await env.DB.prepare(
    `SELECT c.id, c.name, c.status, c.objective,
            SUM(s.spend_cents) AS spend_cents,
            SUM(s.impressions) AS impressions,
            SUM(s.clicks)      AS clicks,
            SUM(s.results)     AS results
       FROM campaigns c
       LEFT JOIN campaign_spend s
         ON s.campaign_id = c.id AND s.date BETWEEN ? AND ?
      GROUP BY c.id, c.name, c.status, c.objective
     HAVING COALESCE(SUM(s.spend_cents), 0) > 0
         OR COALESCE(SUM(s.impressions), 0) > 0
         OR upper(COALESCE(c.status, '')) = 'ACTIVE'
      ORDER BY COALESCE(SUM(s.spend_cents), 0) DESC, c.name ASC`,
  )
    .bind(win.from, win.to)
    .all<CampaignRow>();

  let totalSpend = 0;
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalResults = 0;

  const campaigns = rows.results.map((row) => {
    const spendCents = Number(row.spend_cents ?? 0);
    const impressions = Number(row.impressions ?? 0);
    const clicks = Number(row.clicks ?? 0);
    const results = Number(row.results ?? 0);

    totalSpend += spendCents;
    totalImpressions += impressions;
    totalClicks += clicks;
    totalResults += results;

    return {
      id: row.id,
      name: row.name,
      status: row.status,
      objective: row.objective,
      spend_cents: spendCents,
      impressions,
      clicks,
      results,
      ctr: ratio(clicks, impressions),
      cpc_cents: centsPer(spendCents, clicks),
      // The ad platform's own attribution, by definition. Null, not zero, when
      // the platform reported no conversions.
      cpl_cents: centsPer(spendCents, results),
    };
  });

  return json({
    window: { from: win.from, to: win.to },
    currency: 'AUD',
    attribution_note: ATTRIBUTION_NOTE,
    campaigns,
    totals: {
      spend_cents: totalSpend,
      impressions: totalImpressions,
      clicks: totalClicks,
      results: totalResults,
    },
  });
}
