# The Rollout funnel

Four pages and a small API, deployed as one Cloudflare Worker (`rollout-funnel`):

| Page | File | What it does |
| ---- | ---- | ------------ |
| `/` | `index.html` + `src/pages/subscribe.ts` | Email-only subscribe page, a copy of the-rollout.co/subscribe. Plain HTML so it paints instantly from an ad. |
| `/welcome` | `src/pages/welcome.tsx` | The survey: three multiple-choice taps (AI stage, where the manual work is, team size), then name, website and mobile on one screen. |
| `/sprint` | `src/pages/sprint.tsx` | VSL and the iClosed calendar, personalised from the survey. Works without a VSL until you add one. |
| `/booked` | `src/pages/booked.tsx` | After booking: accept the invite, what to prepare, a few case studies to read. |

Every subscribe and answer is written straight into the **rollout-crm** database
(same D1 database, bound as `DB`), so it shows up in the CRM within seconds.
The database schema lives in the rollout-crm repo (`migrations/0007_funnel.sql`).

```
ad ─▶ /  ──POST /api/subscribe──▶ lead in the CRM + added to beehiiv
      /welcome ──POST /api/answers──▶ answers on that lead (Slack "call now" once done)
      /sprint  ──iClosed──▶ booking webhook ──▶ rollout-crm marks it booked
      /booked
```

## Going live (all in the Cloudflare dashboard, no terminal)

1. **Database first.** Migration `0007_funnel.sql` (rollout-crm repo) must be
   applied before this Worker takes traffic. Done on the live database on
   12 Oct 2026; for a fresh database, see rollout-crm's README ("The one
   rule: migrations go first").
2. **Create the Worker.** Workers & Pages → Create → Import a repository →
   `The-rollout-booking-page`. Set:
   - Project name: `rollout-funnel` (must match `name` in `wrangler.jsonc`)
   - Production branch: the branch that has this `funnel/` folder. This repo
     has no `main`; the funnel lives on `claude/happy-brown-mx6m51`.
   - Root directory: `funnel`
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`

   Changing the production branch doesn't start a build on its own; the next
   push to that branch does. Anything pushed to it goes live.
3. **Add the beehiiv key.** Workers & Pages → rollout-funnel → Settings →
   Variables and Secrets → Add → type *Secret*, name `BEEHIIV_API_KEY`, the
   same value rollout-crm uses. Without it, signups still reach the CRM but
   **not beehiiv**, so they won't get the newsletter.
4. **Check it.** Open `https://<your-worker-url>/api/health`. You want
   `{"ok":true,"db":true,"beehiiv":true}`.
5. **Domain (optional).** Settings → Domains & Routes → add
   `start.the-rollout.co` if the domain's DNS is on Cloudflare. Otherwise the
   `*.workers.dev` URL works fine.
6. **iClosed.** In the event's settings, Confirmation page → "Redirect to an
   external URL" → `https://<your-funnel>/booked`. And connect iClosed's
   booking webhook to the CRM (rollout-crm README, section 3b), so bookings
   land on the lead automatically.
7. **Point the ads** at the new `/` URL. Keep the same `utm_*` tags; they are
   carried through to the CRM and to iClosed.

## Links and tracking

Every signup is credited to where it came from, in **beehiiv** (source, medium,
campaign, term, content and referring site, the same fields its own form
fills; the "channel" shows `api`), in the **CRM** (source label plus the Meta
campaign ID) and in **iClosed** (the tags ride along to the booking).

**Short links for bios** redirect to the subscribe page with tags added:

| Link | Use it in | Tags |
| ---- | --------- | ---- |
| `/ig` | Instagram bio | `ig` / `social` / `bio` (what Instagram has always used) |
| `/li` | LinkedIn bio | `linkedin` / `social` / `bio` |
| `/yt`, `/x`, `/fb` | YouTube, X, Facebook page | `<network>` / `social` / `bio` |
| `/call` | links inside the newsletter | goes to `/sprint`, tagged `the-rollout` / `email` / `newsletter` |

For a one-off, add a tag to any short link: `/li?utm_campaign=post-xero`
tracks that one LinkedIn post. New short links live in `worker/links.ts`.

**Meta ads**: in each ad, Destination → URL parameters:

```
utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}&utm_id={{campaign.id}}
```

beehiiv shows the readable names; `utm_id` gives the CRM the campaign ID, so
cost per lead and per booking work per campaign.

**No tags at all?** The funnel records it the way beehiiv's own form does:
`direct`, or the referring site with `referral` (or `organic` for search
engines). And a tagged visit is remembered for 30 days in that browser, so
someone who clicks an ad and comes back later by typing the address still
counts for the ad.

**Meta pixel**: one pixel ("The rollout") for every domain. Don't make a new
one: the ad sets' learning and audiences live on this one. Do verify each new
domain in Meta Business Settings → Brand safety → Domains (one DNS record).

## Filling things in later

Everything optional lives in `src/config.ts`. Leave a value empty and that part
of the page just doesn't show:

- `vsl.src`: the VSL as an `.mp4` URL (an R2 bucket with public access is
  easiest). Until then, add `?preview` to `/sprint` to see where it will sit.
- `expectationsVideo.src`: the 90-second "what to expect" video on `/booked`.
- `linkedinUrl`, `textNumber` (for "Text me confirmed"), `danielPhoto`.

## Tracking

The Meta pixel ("The rollout") fires the same `Subscribe` event beehiiv's page
does, so ad optimisation carries over. On top of that: `Lead` when someone
leaves a mobile, `Schedule` on `/booked`, and custom `SprintView`, `VSLPlay`,
`VSL50` events for retargeting. Every step is also recorded in the CRM's
`funnel_events` table.

## Components

shadcn/ui components live in `src/components/ui` (the path `components.json`
points the shadcn CLI at), so `npx shadcn@latest add <component>` drops new ones
in the same place and the `@/components/ui/...` imports keep working.
`multistep-form.tsx` is the survey's progress bar, step transitions and
tap-to-advance questions; the survey content itself is in `src/pages/welcome.tsx`.

## Working on it locally

```sh
npm install
npm run build && npx wrangler dev   # the whole funnel on http://localhost:8787
npm run dev                          # or: live-reloading pages on :5173 (API via wrangler on :8787)
npm test                             # unit tests
```

For a local database, apply rollout-crm's migrations to it once:
`for f in ../../rollout-crm/migrations/*.sql; do npx wrangler d1 execute rollout-crm --local --file="$f"; done`
