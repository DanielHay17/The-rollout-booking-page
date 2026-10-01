# The Rollout command center

Live at **https://rollout-crm.danmatt429.workers.dev**

One Cloudflare Worker with one database behind it. It holds every beehiiv
subscriber as a lead, every call you log, every deal you close, and the Meta ad
spend that paid for them. Sign in with your Google account through Cloudflare
Access; only the email addresses on the allowlist can get in.

There are three views, in the order you use them:

- **Today** is the call queue. Overdue first, then what is due today, then
  suggested next calls (phone numbers first, then fewest attempts, then newest
  subscribers). This is the screen to open in the morning.
- **Board** is the pipeline: New, Attempting, Engaged, Booked, Won, Lost,
  Parked. Drag a card between columns, or use the menu on the card if dragging
  is fiddly on a phone. Moving a card is what feeds the numbers, so move cards.
- **Dashboard** is the numbers. Last 7, 30 or 90 days. Spend, cost per lead,
  cost per booked call, true CAC, LTV, the funnel, and a table of Meta
  campaigns. Read the next section before you make a decision off it.

Money is **always AUD**. Days are **Sydney days**.

---

## How the numbers are worked out

This is the section worth re-reading. The dashboard shows three different
"what does this cost" numbers on purpose, because they answer three different
questions and they are not interchangeable.

### The three cost numbers

| On screen | The sum | The question it answers |
|---|---|---|
| **Cost per lead** | ad spend ÷ paid leads acquired in the window | What does it cost to get someone's email address? |
| **Cost per booked call** | ad spend ÷ calls booked in the window | What does it cost to get a call in the diary? |
| **True CAC** | ad spend ÷ customers won in the window | What does it cost to get a paying customer? |

Same spend on top every time. A different, smaller number on the bottom each
time, so each number is bigger than the last. True CAC is the only one of the
three that is the cost of a customer.

Why this matters: if you quote cost per lead as if it were CAC, you flatter the
business by the exact size of your drop-off. Say 100 leads cost you $300. That
is $3 a lead. If 20 of them book and 4 of them buy, the same $300 is $15 per
booked call and **$75 per customer**. Three dollars and seventy-five dollars
are both true. Only $75 is the number to compare against what a customer is
worth to you.

A "paid lead" means the lead's acquisition channel says paid, cpc or ppc.
Everything else counts as organic. Cost per lead divides spend by paid leads
only, because organic leads did not cost you ad money.

### LTV

**LTV = all-time won revenue ÷ the number of distinct customers who bought.**

A customer who buys twice counts as one customer, so repeat business raises LTV
instead of inventing a second customer.

It is deliberately all-time, not the 7/30/90-day window. In any 30-day stretch
you will have closed a handful of deals at most, and the average of a handful of
numbers moves wildly with one big or small deal. An all-time average is slower
to move and actually means something. So LTV does not change when you change the
date range. Everything else on the dashboard does.

### LTV:CAC and ROAS

- **LTV:CAC** is LTV ÷ true CAC — what a customer is worth for every dollar it
  costs to win one. Above about 3 is healthy; near 1 means you are buying
  revenue at cost.
- **ROAS** is revenue closed in the window ÷ spend in the window.

### A dash means "not enough data", never zero

Every ratio on the dashboard is blank (`—`) when the bottom of the sum is zero.
No customers won in the window means **no** CAC, so you see a dash. That is
honest. A zero there would read as "it costs us nothing to win a customer",
which is the opposite of the truth. Treat a dash as "ask again when more has
happened", not as a bug.

### The honest limitation: you cannot trace a lead to a campaign

beehiiv records how someone arrived as a plain channel string, for example
`website: facebook / paid`. There is no campaign id and no UTM data in it. So
nothing in this CRM can tell you *which* Facebook campaign a specific lead came
from. That is a beehiiv data limit, not something the code is hiding.

What follows from that:

- **Blended cost per lead is trustworthy.** It divides your real total spend by
  your real CRM leads. Use it for "what does a lead cost us".
- **Per-campaign cost per lead is Meta's own number.** The Cost/lead column in
  the campaign table comes from Meta's attribution of its own conversions, not
  from CRM leads. The UI labels that column "(Meta)" and prints this
  limitation in a "How to read this" box with the table. Do not read it as CRM
  data.
- **True per-campaign CAC does not exist yet.** If you want it, the fix is to
  put UTM parameters on your ad URLs (`?utm_source=facebook&utm_campaign=...`)
  and carry them through to the beehiiv subscribe form so they land on the
  subscriber record. Then each lead carries its campaign and the CRM can divide
  per campaign. Until that is done, per-campaign CAC is Meta's guess.

### Window and timezone

- Every amount is AUD, because that is the currency of the Meta ad account.
- A "day" is a Sydney day. The database stores timestamps in UTC and the Worker
  converts, so "today" on the Today view and one bar on a daily chart both mean
  midnight-to-midnight in Sydney, including across the daylight-saving change.
- Spend comes from Meta's own daily figures for those dates.

One more distinction worth knowing, because the two sets of numbers do not add
up to each other and are not supposed to. **Contacted / booked / won / lost**
count things that *happened inside the window*. **Pipeline right now** counts
where every lead sits *today*, regardless of when it got there.

---

## 1. One-time setup

Run everything from inside the `crm/` folder.

**Step 1 — get the code running locally**

```sh
cd crm
npm install
```

**Step 2 — log wrangler in to Cloudflare**

Either sign in through the browser:

```sh
npx wrangler login
```

or, if you would rather use an API token, put it in your shell only — never in
a file in this repo:

```sh
export CLOUDFLARE_API_TOKEN=paste-your-token-here
export CLOUDFLARE_ACCOUNT_ID=<your account id>   # Cloudflare dashboard -> Workers -> right sidebar
```

**Step 3 — the Cloudflare API token needs three permissions**

In the Cloudflare dashboard: My Profile → API Tokens → Create Token → Custom
token. Give it:

- **Workers Scripts : Edit** — upload the Worker itself.
- **D1 : Edit** — run database migrations.
- **Account Settings : Read** — let wrangler confirm which account it is in.

All three. **Without D1:Edit the migrations cannot run.** A deploy would then
push the new code on top of the old database shape, and the CRM would error on
nearly every screen, because the new code reads tables and columns that are not
there yet. The deploy would look like it succeeded. The app would not work.

**Step 4 — set the six secrets**

Each command prompts you to paste the value, then stores it in Cloudflare. The
value is never written into this repo.

```sh
cd crm
npx wrangler secret put ACCESS_TEAM_DOMAIN
npx wrangler secret put ACCESS_AUD
npx wrangler secret put ALLOWED_EMAILS
npx wrangler secret put BEEHIIV_API_KEY
npx wrangler secret put BEEHIIV_WEBHOOK_SECRET
npx wrangler secret put META_ACCESS_TOKEN
```

What each one is, and what breaks without it:

| Secret | What to paste | What breaks without it |
|---|---|---|
| `ACCESS_TEAM_DOMAIN` | your Zero Trust team domain, e.g. `yourteam.cloudflareaccess.com` | Nobody can sign in. Every page returns 503 "misconfigured". |
| `ACCESS_AUD` | the Access application's AUD tag (Zero Trust → Access → Applications → your app → Overview) | Sign-in still works, but a login token issued for *any other* app in your Cloudflare team would also be accepted here. Set it. |
| `ALLOWED_EMAILS` | comma-separated list, e.g. `danmatt429@gmail.com,daniel.hay@phloing.com` | Nobody gets in. An empty list means "nobody is allowed", never "everybody" — that is deliberate. |
| `BEEHIIV_API_KEY` | beehiiv → Settings → Integrations → API | The hourly subscriber backfill and the "Pull beehiiv subscribers" button stop working. New subscribers still arrive if the webhook is on. |
| `BEEHIIV_WEBHOOK_SECRET` | any long random string you invent; paste the same string into beehiiv in step 2 below | The webhook endpoint returns 503 and beehiiv's deliveries are rejected, so new subscribers never reach the CRM. |
| `META_ACCESS_TOKEN` | a Meta token that can read ad account insights | No ad spend comes in. Spend shows 0 and cost per lead, cost per booked call, CAC and ROAS all show a dash. |

**Why secrets and not vars.** Plain text vars in `wrangler.jsonc` are replaced
on *every* deploy — whatever is in the file wins. Secrets are stored separately
and a deploy leaves them alone. The previous deployment had
`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` and `ALLOWED_EMAILS` as plain vars, which is
why they have to be re-supplied now: the next deploy would otherwise blank them
and lock everyone out. Setting them as secrets means that cannot happen again.

Check which secrets exist (names only, never values):

```sh
cd crm
npx wrangler secret list
```

---

## 2. The beehiiv webhook

This is the piece that keeps the CRM current. **Until it is switched on, a new
subscriber does not reach the CRM at all.** That is exactly why the CRM had
drifted to 95 leads while the publication had 296 active subscribers — roughly
200 people were signing up and never appearing on the Board.

Webhooks require a **paid beehiiv plan**. On a free plan the "Send webhook"
action is not available, and you have to rely on the hourly backfill and the
"Pull beehiiv subscribers" button instead.

In beehiiv:

1. Go to **Audience → Automations**.
2. Create a **new automation**.
3. Set the trigger to **a subscriber signing up** (new subscription).
4. Add an action: **Send webhook**.
5. Method: **POST**. Format: **JSON**.
6. Destination URL:
   `https://rollout-crm.danmatt429.workers.dev/api/webhooks/beehiiv`
7. Add a **custom header**:
   - Name: `X-Rollout-Secret`
   - Value: the exact same string you put into `BEEHIIV_WEBHOOK_SECRET`
8. Save, then press beehiiv's **Test Webhook** button. A success means the
   Worker accepted it. A 401 means the secret does not match. A 503 means the
   secret is not set on the Worker. A redirect or a login page means the
   Cloudflare Access bypass in the next section is missing.
9. Turn the automation on.

Deliveries are idempotent: if beehiiv retries, the second copy is ignored
instead of creating a duplicate lead. A webhook also never overwrites something
you have corrected by hand — it only fills blank fields, and it never touches a
lead's stage, notes, owner or next action.

---

## 3. The Cloudflare Access bypass the webhook needs

Cloudflare Access sits in front of the whole hostname. That is what keeps the
CRM private, but it also means beehiiv's POST gets stopped at the edge and
bounced to a login page **before the Worker ever runs**. A robot cannot log in
with Google, so the webhook silently never arrives.

So the webhook path needs a bypass. In **Zero Trust → Access →
Applications**:

1. Add a **self-hosted application**.
2. Domain: `rollout-crm.danmatt429.workers.dev`, and set the **path** to
   `api/webhooks/beehiiv`.
3. Give it one policy: **Action: Bypass**, **Include: Everyone**.
4. Save. Cloudflare matches the more specific path first, so this one
   application covers just the webhook URL and your existing application keeps
   protecting everything else, including the whole UI.

(If your Access app already supports adding a path-scoped policy directly, a
Bypass / Everyone policy on `api/webhooks/beehiiv` there does the same job.)

**Is that safe?** Yes, and it is the intended design. That path is protected by
the shared secret instead: the Worker compares `X-Rollout-Secret` against
`BEEHIIV_WEBHOOK_SECRET` in constant time and rejects anything that does not
match with a 401. It is the only path that is bypassed, it only accepts
subscriber data, and it cannot read anything back out. Keep the secret long and
random and treat it like a password.

---

## 4. Running it on your own machine

```sh
cd crm
npm install
npx wrangler d1 migrations apply rollout-crm --local
npm run seed:local     # loads fake leads from scripts/seed-local.sql; skip it to start empty
npm run dev
```

`--local` means a throwaway database on your laptop. It never touches the live
one.

One honest caveat: there is no Cloudflare Access in front of `wrangler dev`, and
the Worker refuses to fake a login — by design, because a dev bypass that got
deployed would make every lead's phone number public. So locally, `/api/health`
and the webhook endpoint work, and the rest of the API answers `locked`. Local
dev is for checking the code builds and the migrations apply, not for clicking
through the app. Use the live URL for that.

```sh
npm run typecheck   # TypeScript
npm run test        # tests
```

---

## 5. Deploying

Deploys run from GitHub Actions: **`.github/workflows/deploy-crm.yml`**. Every
push to `main` that touches `crm/**` deploys itself, and you can also run it by
hand from the repo's Actions tab ("Deploy CRM" → Run workflow).

The workflow needs these **repository** secrets, under Settings → Secrets and
variables → Actions:

| Repo secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | the token from setup step 3 (Workers Scripts:Edit + D1:Edit + Account Settings:Read) |
| `CLOUDFLARE_ACCOUNT_ID` | find it in the Cloudflare dashboard, Workers page, right-hand sidebar |
| `ACCESS_TEAM_DOMAIN` | same value as the Worker secret |
| `ACCESS_AUD` | same value as the Worker secret |
| `ALLOWED_EMAILS` | same value as the Worker secret |
| `BEEHIIV_API_KEY` | same value as the Worker secret |
| `BEEHIIV_WEBHOOK_SECRET` | same value as the Worker secret |
| `META_ACCESS_TOKEN` | same value as the Worker secret |

The workflow re-uploads those six as Worker secrets on each deploy, which is why
the GitHub copies have to stay in step with the Cloudflare ones. If you rotate a
token, change it in both places. The job refuses to start if a required secret
is missing, rather than pushing an empty string over a good value and locking
you out.

What it does, in order:

1. Checks the required repo secrets are present.
2. `typecheck` — the code compiles.
3. `test` — the tests pass.
4. **Applies the D1 migrations** to the live database.
5. Deploys the Worker.

Migrations run **before** the deploy on purpose, and a failure at step 4 stops
the job. New code is therefore never served against an old database shape. The
reverse order would give you a successful-looking deploy and a CRM that errors
on nearly every screen.

Note on the current state: migration `0003_command_center.sql` has **not** been
applied to the live database yet. The live database still has migrations 0001
and 0002, with 95 leads and 21 calls. The first run of this workflow is what
applies 0003. Until then the new code is not live.

---

## 6. Troubleshooting

### "locked", or you cannot get in at all

**Cause.** Your email is not on the allowlist, or the team domain / AUD is
wrong, so your login token is rejected.

**Fix.**
- Confirm the email Google signed you in with is in `ALLOWED_EMAILS`,
  comma-separated and spelled exactly. Re-set it with
  `npx wrangler secret put ALLOWED_EMAILS` if unsure.
- Confirm `ACCESS_TEAM_DOMAIN` is your team domain only, like
  `yourteam.cloudflareaccess.com`, with no `https://` and no trailing slash.
- Confirm `ACCESS_AUD` matches the AUD tag of the Access application that is
  actually protecting this hostname. A stale AUD rejects every token.
- Watch the reason live: `cd crm && npx wrangler tail`, then reload the page.
  A rejected token logs `access: jwt rejected: ...` with the real cause.

### A 503 that says "misconfigured"

**Cause.** A required secret is not set. The Worker fails closed rather than
letting anyone in.

**Fix.** The response body names the variable, for example
`{"error":"misconfigured","detail":"ALLOWED_EMAILS is not set; refusing to allow anyone in"}`.
Set that one secret with `npx wrangler secret put <NAME>` and reload. Also add
it to the GitHub repo secrets so the next deploy does not undo it.

### The beehiiv webhook is not arriving

**Cause.** One of three things, in order of likelihood: the Cloudflare Access
bypass is missing, so Cloudflare rejects the POST before the Worker runs; the
`X-Rollout-Secret` header does not match `BEEHIIV_WEBHOOK_SECRET`; or you are on
a free beehiiv plan where webhooks are not available.

**Fix.** Press **Test Webhook** in beehiiv and read what comes back. A login
page or redirect means the bypass (section 3). A 401 means the secret. A 503
means the secret is not set on the Worker. No webhook action at all means the
plan. Every delivery, including the failures, is recorded — this is the table
that answers "I signed someone up and they are not in the CRM":

```sh
cd crm
npx wrangler d1 execute rollout-crm --remote --command \
  "SELECT received_at, event_type, email, outcome, error FROM webhook_deliveries ORDER BY id DESC LIMIT 20"
```

### Spend is not updating, or CAC shows a dash

**Cause.** `META_ACCESS_TOKEN` is missing or has expired. Meta tokens expire.

**Fix.** Press **Pull Meta spend** on the Dashboard — it reports the actual
error. If it mentions the token, mint a new one in Meta, then:

```sh
cd crm
npx wrangler secret put META_ACCESS_TOKEN
```

and update the `META_ACCESS_TOKEN` repo secret in GitHub too. Then press Pull
Meta spend again.

Remember that a dash can also just mean no customers were won in the window.
Check the Won count before assuming the token is broken.

### New subscribers are not appearing as leads

**Cause.** The webhook is not set up yet (sections 2 and 3), or a delivery was
lost.

**Fix.** Press **Pull beehiiv subscribers** on the Dashboard, which calls
`POST /api/sync/beehiiv` and pulls everyone across from beehiiv. This also runs
automatically every hour, and it will never overwrite an edit you made by hand.
Then fix the webhook so you are not relying on the backfill.

### Useful commands

```sh
cd crm
npx wrangler tail                  # live logs from the Worker
npx wrangler secret list           # which secrets are set (names only)
curl https://rollout-crm.danmatt429.workers.dev/api/health
```

`/api/health` is the one public endpoint. It returns the version and the lead
and call counts, and nothing secret.

---

## Housekeeping

A capability check left an empty table called `_probe_multi` in the live
database. It is harmless and unused. Drop it whenever convenient:

```sh
cd crm
npx wrangler d1 execute rollout-crm --remote --command "DROP TABLE IF EXISTS _probe_multi"
```

Where things are, if you ever need to point someone at them:

| File | What it is |
|---|---|
| `crm/API.md` | the API contract, endpoint by endpoint |
| `crm/wrangler.jsonc` | bindings, non-secret settings, the two cron schedules |
| `crm/migrations/` | the database shape, in order |
| `crm/src/` | the Worker |
| `crm/public/` | the three views |
| `.github/workflows/deploy-crm.yml` | the deploy |

Two scheduled jobs run on their own: beehiiv subscribers hourly, Meta spend
every three hours. Nothing needs to be pressed for the numbers to stay current.
