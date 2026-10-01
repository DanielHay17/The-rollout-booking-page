# The Rollout — CRM command center

Live at **https://rollout-crm.danmatt429.workers.dev**

A Cloudflare Worker plus a D1 database. Three views:

- **Today** — the call queue. Overdue first, then due today, then who to call
  next. Tap a number to dial it. The survey answers are on screen because
  that's what you read out on the phone.
- **Board** — the pipeline, as a Kanban board. Drag a lead across, or use the
  stage menu on the card if you're on a phone.
- **Dashboard** — spend, acquisition cost, LTV, the funnel, the daily report
  and which campaigns are running.

Everything is behind Cloudflare Access, so only the email addresses on the
allowlist can open it.

---

## How the numbers are worked out

Read this once. The three cost numbers are **not** the same thing, and treating
them as one is the easiest way to flatter the business into a bad decision.

| On screen | Formula | What it answers |
|---|---|---|
| **Cost per lead** | ad spend ÷ paid leads acquired | What it costs to get someone's email |
| **Cost per booked call** | ad spend ÷ calls booked | What it costs to get a call in the diary |
| **True CAC** | ad spend ÷ customers won | What it costs to get a paying customer |

Cost per lead is always the smallest and true CAC always the largest. If anyone
quotes "our CAC is $11", they almost certainly mean cost per lead.

**LTV** is all-time won revenue ÷ the number of distinct customers who bought.
A repeat customer counts once, not twice. It's deliberately all-time rather
than last-30-days: in any given month you close too few deals for an average
to mean anything, so a windowed LTV would swing wildly on one sale.

**LTV:CAC** is the ratio of those two. **ROAS** is revenue ÷ spend.

**A dash (—) means "not enough data yet", never zero.** If you haven't won a
customer in the window, true CAC is a dash, because dividing by zero customers
isn't $0 — it's unknown. This matters: a CAC of $0 would look like free
customers.

Money is **AUD**. A "day" is a **Sydney** day, so your morning calls land on the
day you actually made them.

### The one thing the numbers can't tell you

**Which campaign a specific lead came from.** beehiiv records how someone
arrived only as a channel string — `"website: facebook / paid"` — with no
campaign ID and no UTM parameters. So a lead in this CRM genuinely cannot be
traced back to one ad.

What that means in practice:

- **Blended cost per lead is trustworthy.** It's your real spend over the real
  leads that landed in the CRM.
- **Per-campaign cost per lead comes from Meta's own attribution**, not from
  this CRM. The campaigns table says so on screen. Treat it as Meta's opinion,
  which is optimistic by nature.

If you want true per-campaign CAC, the fix is to add UTM parameters to the ad
URLs and carry them through the subscribe form into the CRM. The database
columns for that already exist (`campaign_id`, `utm_source`, `utm_medium`,
`utm_campaign`) and are sitting empty, waiting. Ask and it can be wired up.

---

## One-time setup

### 1. The Cloudflare API token

Dashboard → My Profile → API Tokens → Create Token → Custom token. It needs
**all three** of:

- Workers Scripts : **Edit**
- D1 : **Edit**
- Account Settings : **Read**

> Without **D1: Edit** the database migrations cannot run. A deploy would then
> push new code against an old schema and the CRM would error on nearly every
> screen. The deploy refuses to run rather than let that happen.

### 2. The secrets

Run these inside `crm/`. Each prompts for the value and nothing is written to
disk:

```sh
npx wrangler secret put ACCESS_TEAM_DOMAIN      # e.g. yourteam.cloudflareaccess.com
npx wrangler secret put ACCESS_AUD              # the Access application's AUD tag
npx wrangler secret put ALLOWED_EMAILS          # comma-separated, who may open the CRM
npx wrangler secret put BEEHIIV_API_KEY         # beehiiv → Settings → Integrations → API
npx wrangler secret put BEEHIIV_WEBHOOK_SECRET  # any long random string, your choice
npx wrangler secret put META_ACCESS_TOKEN       # a Meta token that can read ad insights
```

These are **secrets**, not vars, on purpose. Vars get replaced on every deploy;
secrets survive one. The earlier deployment had `ACCESS_TEAM_DOMAIN`,
`ACCESS_AUD` and `ALLOWED_EMAILS` stored as plain vars, which is exactly why
they had to be supplied again — a deploy would have silently wiped them.

What breaks without each one:

| Secret | If it's missing |
|---|---|
| `ACCESS_TEAM_DOMAIN` | Nobody can log in. The API returns 503 naming it. |
| `ACCESS_AUD` | Still works, but a login from *any* Access app in your team is accepted. Set it. |
| `ALLOWED_EMAILS` | Nobody can log in. It fails closed on purpose — an unset allowlist means "nobody", never "everybody". |
| `BEEHIIV_API_KEY` | The subscriber backfill can't run. The webhook still works. |
| `BEEHIIV_WEBHOOK_SECRET` | New subscribers are rejected at the webhook. |
| `META_ACCESS_TOKEN` | Spend stops refreshing, so CAC quietly goes stale. Previously synced spend is kept, never wiped. |

### 3. Let the webhook through Cloudflare Access

Access guards the whole hostname, so beehiiv's POST would be blocked at the
edge before the Worker ever sees it.

Zero Trust → Access → Applications → your CRM app → Policies → Add a policy:

- Action: **Bypass**
- Include: **Everyone**
- Path: `/api/webhooks/beehiiv`

This is safe. That path is protected by the shared secret in the
`X-Rollout-Secret` header, which is checked in constant time, and it only ever
accepts subscriber data — it cannot read anything out.

### 4. Point beehiiv at it

In beehiiv: **Audience → Automations → New automation**.

1. Trigger: **Signup** (so every new subscriber flows through).
2. Add an action: **Send webhook**.
3. Destination URL:
   `https://rollout-crm.danmatt429.workers.dev/api/webhooks/beehiiv`
4. Request method: **POST**. Content type: **JSON**.
5. Add a custom header: `X-Rollout-Secret` set to your
   `BEEHIIV_WEBHOOK_SECRET` value.
6. Press **Test Webhook**. You should get a success, and a lead should appear.

Webhooks are a **paid-plan** beehiiv feature.

> Until this is switched on, new subscribers never reach the CRM. That is why
> it had drifted about 200 leads behind beehiiv. To catch up the backlog in one
> go, `POST /api/sync/beehiiv` (or wait for the hourly cron, which does the
> same thing).

---

## Running it locally

```sh
cd crm
npm install
npx wrangler d1 migrations apply rollout-crm --local
npm run seed:local     # invented leads + the real campaign spend, for a populated UI
npm run dev
```

Local dev uses its own throwaway database. It never touches production.

For a local login, put a real email in `ALLOWED_EMAILS` in `crm/.dev.vars`
(gitignored). Don't add a code path that skips the allowlist — see the comment
at the top of `src/access.ts`.

## Deploying

`.github/workflows/deploy-crm.yml` deploys on a push to `main` touching
`crm/**`, or on demand from the Actions tab. It runs typecheck, then the tests,
then the **migrations**, then the deploy — in that order, deliberately, so new
code is never served against an old schema.

It needs these repository secrets (Settings → Secrets and variables → Actions):
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, plus the six above. It refuses
to deploy if any are missing, rather than overwriting live values with blanks.

To deploy by hand instead:

```sh
cd crm
npx wrangler d1 migrations apply rollout-crm --remote   # migrations FIRST
npx wrangler deploy
```

## Troubleshooting

**"locked" / I can't get in.** Your email isn't on `ALLOWED_EMAILS`, or
`ACCESS_TEAM_DOMAIN` is wrong. Check with
`npx wrangler secret list`, which shows the names that are set (not the
values). The Worker logs the reason a login was rejected — `npx wrangler tail`
to watch it live.

**A 503 saying "misconfigured".** The response body names the missing variable.
Set it and redeploy.

**New subscribers aren't appearing.** The beehiiv webhook isn't set up, or the
Access bypass is missing, or the secret doesn't match, or you're on a free
beehiiv plan. Check `GET /api/health` is reachable, then run
`POST /api/sync/beehiiv` to pull them in directly and see the error if there
is one.

**Spend isn't updating, or CAC shows a dash.** `META_ACCESS_TOKEN` is missing or
expired — Meta tokens expire. Previously synced spend is never wiped, so the
dashboard keeps showing the last known numbers rather than dropping to zero.
A dash on CAC specifically means no customers have been marked won in the
window, which is a data question, not a bug.

**The board shows no cards.** Check `GET /api/health` returns a lead count. If
it returns zero, the migration may not have run.

## Housekeeping

An empty table `_probe_multi` was left in the database by a capability check
during development. It is harmless and unused. To remove it:

```sh
npx wrangler d1 execute rollout-crm --remote --command "DROP TABLE IF EXISTS _probe_multi"
```

## Layout

```
crm/
  src/            the Worker: router, auth, leads, metrics, campaigns, syncs
  public/         the single-page UI, served straight off static assets
  migrations/     D1 schema, applied in order
  test/           vitest, running against a real Worker + D1
  API.md          the API contract — the source of truth for both halves
```
