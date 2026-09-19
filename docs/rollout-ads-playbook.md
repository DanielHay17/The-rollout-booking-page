# The Rollout: Meta ads to booked calls, working playbook

Last updated 19 September 2026. This repo is public, so this file holds method only.
No lead names, phone numbers, client names, account IDs or live performance figures belong here.
That context lives in Claude's project memory for this folder and loads automatically in a new chat.

## What this project is

The Rollout (the-rollout.co) is a weekly newsletter on real AI rollouts in established businesses.
It feeds Phlo (phloing.com), the AI consultancy. The chain we are building and measuring:

Meta ad, subscribe, survey, phone call, "call 1" booked, free system sprint, paid client.

## Goals and KPIs

| Step | KPI | Target |
|---|---|---|
| Ad to subscriber | Cost per subscriber | Under AU$2 |
| Subscriber to survey | Real survey completions | Track weekly |
| Survey to phone | Real phone numbers left | Track weekly |
| Phone to call 1 | Cost per booked call (ad spend / booked calls) | AU$50 to AU$100 |
| Call 1 to client | Sprint to paid conversion | Assumption: 1 in 3, first project about AU$2,000 |

Rules of thumb agreed so far:

- Use first-project revenue, not lifetime value, until someone buys twice.
- Count founder hours as acquisition cost. A sprint is roughly four hours.
- Scale ads only when cost per booked call holds under AU$100 for four weeks and there is capacity to run the sprints.
- Cash constrains spend. Turn budgets down or off. Do not repurpose freed budget onto other ads unless asked.

## Audience and creative rules

- ICP: established SME owners, roughly 35 to 65, Australia only. Never name age in copy.
- Direct callouts work ("If you run a business..."). Story ads beat generic ones by a wide margin.
- Accounting and bookkeeping firms are the strongest segment by far.
- Brand: cream #F8F4F0, black, sage #7BB5A8, Playfair Display + Inter, pixel-art illustration, real lockup. Never Phlo teal.
- Anonymise client businesses and towns in video unless permission is explicit.

## Reporting method

A single branded HTML report is republished to the same artifact URL each time ("report N").

1. Pull ad-level totals since launch: spend, impressions, reach, link clicks, landing page views, results.
2. Pull campaign-level daily rows for the by-day table. The ad account reports in Perth time; the owner is in Sydney.
3. Pull the newsletter platform's subscriber history and acquisition sources, and reconcile daily counts against Meta.
4. Compute frequency as impressions / reach per ad. Rising frequency on the lead ad is the early fatigue signal.
5. Report the full ladder, not just ads: subscribers, real surveys, real phones, contacted, call 1 booked.
6. Judge a "plateau" by subscribers per dollar, not subscribers per day, whenever budgets have changed.

Attribution trick: the newsletter platform records only "facebook / paid". To guess which ad a subscriber clicked, match their sign-up time to ad-level hourly link clicks, converting to the ad account's time zone.

Gotcha: editing a campaign budget through the ads API force-pauses the campaign. Re-activate straight after. Keep budget changes under about 20% a day.

## Lead follow-up method

- Anyone who leaves a real phone number gets a call within 24 hours, with a one-page sheet prepared first.
- Sheet format: contact, how they got here (ad + survey answers), who they are, opener, three questions, one idea to lead with, close, watch-outs.
- Open with permission ("bad time, or two minutes?"), lead with work built rather than credentials, and close on a day and time rather than "I'll send an email".
- Peers and competitors (other automation or AI consultancies) are referral or case-study conversations, not sprint pitches.
- Junk filter: fake company names, blank or single-character company, obviously fake numbers. Park them; do not call.
- No deal in the CRM until call 1 is booked. Before that, status lives on the contact.
- Statuses used in the tracker: BOOKED, CALLBACK PROMISED, WAIT, NO ANSWER / TEXTED, TO CALL, EMAIL FIRST, PEER / JUNK / LOW. Every row carries a next-action date.

## Video pipeline (narrated Reels)

1. Script first, reviewed in text before any audio. Hook in the first two seconds. Natural CTA to the-rollout.co, never "it's free".
2. Voice: ElevenLabs "Archie". For energy, add exclamation marks on punch lines and speed up about 6% in ffmpeg.
3. Stills: Recraft, 9:16, brand palette, consistent style suffix, "no text" in every prompt. Captions are added in ffmpeg.
4. Animation: one clip per beat. MiniMax for most shots. Google Veo 3.1 (best-quality variant) for the hook, with an imaginative visual rather than ambient motion.
5. Assembly in the generation platform's sandbox: whisper for timings, fit each clip to its voiceover slot, burn captions, mux, upload.
6. No backing music. Voice plus any native clip sound only.
7. Check one still per shot before delivery, and say plainly that motion and audio were not reviewed.

Known tooling quirks: list-type and numeric tool parameters can be rejected, so send single jobs and poll one job at a time; the sandbox does not persist between calls, so assemble in one command; always use a fresh upload slot for a re-render; decline preset suggestions that would change the visual style.

## Parked ideas

- Story-specific subscribe pages, with a proper Meta A/B test against the generic page.
- An instant "here is the write-up you clicked" email, branched on a tag, replacing the generic welcome.
- Survey thank-you screen asks "want ideas for your business?" rather than "book a sprint".
- A small custom lead tool: survey webhook in, AI flags junk, writes the one-line brief, queue with click-to-call and follow-up dates.
