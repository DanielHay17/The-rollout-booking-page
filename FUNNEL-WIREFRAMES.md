# The Rollout: booked-call funnel wireframes

The goal is more booked (and attended) System Sprint calls from the subscriber traffic
the ads already bring in.

Everything lives on one subdomain, e.g. `start.the-rollout.co`. The main site
(the-rollout.co) stays the newsletter. These pages have no nav, no "Log in", and no search.
Each page has one job and one next step.

```
  AD ──▶ 1. SUBSCRIBE ──▶ 2. SURVEY ──▶ 3. VSL + BOOK ──▶ 4. BOOKED
         email only       4 taps +       watch, then        show-up
                          phone          pick a slot        page
             │                │               │
             ▼                ▼               ▼
         (subscriber)   (has phone, no   (watched, no
         email nurture   booking) Daniel  booking) retarget
         → step 3        texts in <10min  ads + email
```

Every wireframe below is **mobile-first**, since most paid traffic arrives on a phone.
Desktop notes follow each one.

---

## 0. Feedback on the plan

You've got the shape right: newsletter first, then survey, then VSL, then book. I'd make
four changes.

1. **Don't put the VSL on the survey page.** Someone who just subscribed expects a
   newsletter, not a sales video. If you ask them to watch five minutes before answering,
   fewer of them reach the phone field. Get the answers first while they're still keen,
   then show a VSL that's tailored to what they just told you. The survey page can carry
   a photo of you and one line in your voice, which builds trust without slowing them down.
2. **Host the survey on your own page, not beehiiv's.** The beehiiv redirect only fills in
   `{{email}}` (`index.html` already has to work around literal `{{first name}}` tags).
   With your own survey you hold every answer, so iClosed arrives prefilled with name,
   email, phone and company, and you can fire ad pixel events at each step. The answers
   still go into beehiiv as custom fields through its API.
3. **Add step 4, a confirmation page built for show-ups.** A booked call that no-shows is
   worth nothing. What happens between the booking and the call matters as much as the
   booking.
4. **Optimise the ads for booked calls, not subscribes.** Once steps 2 and 3 fire events
   (Lead, Schedule), you can move Meta optimisation down the funnel. That's how "the ads
   work" turns into "the ads book calls."

---

## Step 1: Subscribe (email only)

**Job:** turn ad clicks into subscribers with as little friction as possible.
**Fires:** `Subscribe`, the same event beehiiv's page sends today, so ad optimisation carries over.

```
┌──────────────────────────────────────┐
│ ◎ THE Rollout                        │  logo only, no nav
├──────────────────────────────────────┤
│                                      │
│  How AI is being rolled out across   │  H1 Playfair, same as now
│  modern companies.                   │  (match the ad's promise)
│                                      │
│  Join 5,000+ business owners and     │
│  operators reading one email a week  │
│  on how real companies are actually  │
│  implementing AI.                    │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ Your work email                  │ │  one field, type=email,
│ └──────────────────────────────────┘ │  autofocus on desktop only
│ ┌──────────────────────────────────┐ │
│ │      Send me the next issue →    │ │  full-width sage button
│ └──────────────────────────────────┘ │
│  Free · One email a week ·           │  reassurance line, muted
│  Unsubscribe anytime                 │
│                                      │
│  Bonus: the interviews and tutorials │  make it concrete if possible:
│  showing how companies rolled it out │  "the 3-part Saig teardown"
│                                      │
│  As featured in THE AUSTRALIAN       │  authority under the fold line
│  BUSINESS JOURNAL                    │
│                                      │
│   ┌───────────────┐                  │  phone mockup of a real issue
│   │ [issue mock]  │   [ChatGPT]      │  sits BELOW the form on mobile
│   │               │   [Claude]       │  (on desktop it stays on the right)
│   └───────────────┘                  │
│                                      │
│  "One subscriber quote, name + role" │  optional, one line
│                                      │
│  © PHLOING PTY LTD                   │
└──────────────────────────────────────┘
```

**Notes**
- Email is the only field. Don't add first name here; step 2 asks for it.
- On submit, call beehiiv's create-subscription API from a small server function, keep the
  email in `sessionStorage`, and go straight to step 2. Don't send them through beehiiv's
  own welcome or survey screens.
- The live page's form needs to sit above the fold on a 390px-wide phone. Check it, because
  the mockup image currently competes for that space.
- Message match: the headline should repeat the promise in whichever ad they clicked. If
  ads run different angles, give each its own `?a=` variant headline.

---

## Step 2: Survey (`/welcome`)

**Job:** get the phone number and the four answers that make the call (and the VSL) personal.
**Fires:** `Lead` when the phone is submitted. Every answer is saved as soon as it's tapped,
so partial answers aren't lost (the email is already known).

To the visitor it feels like two parts:

- **Part A, a quick tap quiz.** Three multiple-choice questions, one at a time. Tapping an
  answer moves straight to the next question, so there's no Next button and no scrolling.
  All three take about five seconds.
- **Part B, one details screen.** Name, website and phone together, so the phone keyboard
  opens once rather than three times.

It's all one page at one URL. The questions swap in place instantly, with no page loads, and
there's a progress bar (no "1 of 5" count) and a back arrow.

**Why this split**
- **Not one long form:** on a phone, five questions plus a phone field reads as homework, and
  the phone field is visible before they've given you anything. That's the moment people leave.
- **Not one typed field per screen:** the keyboard closing and reopening between name, website
  and phone is friction, and each extra Next tap is a chance to quit.
- **Taps first:** the tap answers are almost effortless and get them invested, so the typed
  screen feels like the last small step rather than the whole ask.

If building it as literally two screens is easier (all three taps stacked as compact buttons,
then details), that's fine too. The difference will be small. What matters is taps before
typing, the phone last, and saving each answer as it comes in.

### Screen 2.0 (Part A starts: intro and first tap question)

```
┌──────────────────────────────────────┐
│ ◎ THE Rollout        [Claude Partner]│
├──────────────────────────────────────┤
│ ←  ▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░    │  back arrow + progress bar
│                                      │
│  ┌────┐  You're in. Now let me       │  small round photo of Daniel
│  │ 🙂 │  actually help.              │  H2 Playfair
│  └────┘                              │
│  I read every one of these myself.   │  your current copy, which works
│  Three quick taps and I'll send you  │
│  the automations I'd build first.    │
│                                      │
│  Where are you with AI right now?    │  Q1
│ ┌──────────────────────────────────┐ │
│ │ Just researching                 │ │  big tap targets (min 48px),
│ ├──────────────────────────────────┤ │  white cards, sage border
│ │ Tinkering with ChatGPT           │ │  when selected
│ ├──────────────────────────────────┤ │
│ │ Running pilots in the business   │ │
│ ├──────────────────────────────────┤ │
│ │ Live, a few things in production │ │
│ ├──────────────────────────────────┤ │
│ │ Tried it, didn't land            │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

### Screens 2.1 to 2.3

```
 PART A (continued): taps, auto-advance

 2.1 (Q2) Where's the most manual           2.2 (Q3) How big is the team?
     work in your business?
 ┌────────────────────────────────┐        ┌────────────────────────────────┐
 │ Admin and operations           │        │ Just me                        │
 │ Sales and lead follow-up       │        │ 2–10                           │
 │ Reporting and finance          │        │ 11–50                          │
 │ Customer service               │        │ 50+                            │
 │ Not sure yet, that's the point │        └────────────────────────────────┘
 └────────────────────────────────┘

 PART B: one details screen

 2.3 Last bit. Where should I send
     your ideas?
 ┌────────────────────────────────┐
 │ First name                     │  autocomplete="given-name"
 └────────────────────────────────┘
 ┌────────────────────────────────┐
 │ Company website                │  type="url", autocomplete="url"
 └────────────────────────────────┘
 ┌────────────────────────────────┐
 │ [🇦🇺 +61 ▾] Mobile number       │  type="tel", autocomplete="tel"
 └────────────────────────────────┘  (phone autofill means most people
 I'll look at your site before we     tap once instead of typing)
 talk, and only text if I spot
 something worth a quick chat.
 No spam, reply STOP anytime.
 ┌────────────────────────────────┐
 │    Show me what you'd build →  │  Fires Lead when the phone is given
 └────────────────────────────────┘
      Continue without my number      small, muted link
```

**What changed from the current survey, and why**

| Current | New | Why |
|---|---|---|
| "What would you like The Rollout to help you with?" (content preference) | "Where's the most manual work in your business?" | Content preference doesn't help sell a build. The bottleneck answer drives the VSL headline, the call and your follow-up text. |
| No qualifier | Team size | Tells you who to text first. Later, once the calendar is full, you can send "Just me" to a lighter path. |
| Company name | Company website | You can actually look at a website. It's also what makes "I had a look at your site" true in your follow-up. |
| All five questions on one long screen, name first | Three taps first, then name, website and phone on one screen | Taps feel effortless and build momentum, so the typed screen feels like a small last step. The phone isn't visible until they've already answered three questions. |
| Phone required, framed as "reach out" | Phone on the last screen, framed as where the ideas go, with "Continue without my number" | Those who skip still reach the VSL and can book (iClosed asks for the phone anyway). A hard wall loses people you could have booked. Track the skip rate. |
| beehiiv chrome (Log in, Subscribe, search) | No nav | Someone who just subscribed shouldn't see a Subscribe button and a way out. |

**Notes**
- The consent line under the phone field matters in Australia (Spam Act). Keep "reply STOP",
  and make sure your texts say who they're from.
- On the final submit, write everything to beehiiv custom fields and to your CRM or sheet in
  one server call. Then redirect to step 3 with the data in `sessionStorage` (not the URL, so
  phone numbers don't end up in analytics or browser history).

---

## Step 3: VSL and booking (`/sprint`)

**Job:** turn a keen subscriber into a booked call.
**Fires:** `ViewContent` on load, custom `VSL25` / `VSL50` / `VSL75` events at those points in
the video (retargeting audiences), and `Schedule` on booking.

This is the page that matters most. Put the video first, the calendar directly under it, and
the proof under the calendar for anyone who needs more convincing before they scroll back up.

```
┌──────────────────────────────────────┐
│ ◎ THE Rollout        [Claude Partner]│
├──────────────────────────────────────┤
│  Sam, watch this before you book.    │  eyebrow, uses their name
│                                      │
│  How we'd find 10+ hours a week in   │  H1 Playfair, personalised by Q2:
│  your admin and operations.          │  "...in your sales follow-up", etc.
│                                      │
│ ┌──────────────────────────────────┐ │
│ │                                  │ │  VSL, 16:9 (or 4:5 on mobile)
│ │      [ Daniel, face to camera ]  │ │  autoplays muted, captions
│ │                                  │ │  burned in
│ │      ┌──────────────────────┐    │ │
│ │      │ 🔇 Tap to unmute     │    │ │  big overlay, the #1 VSL fix
│ │      └──────────────────────┘    │ │  on mobile
│ │  ▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░  4:52  │ │  progress bar, no scrubbing
│ └──────────────────────────────────┘ │  needed
│                                      │
│ ┌──────────────────────────────────┐ │
│ │   Book my free System Sprint →   │ │  scrolls to the calendar
│ └──────────────────────────────────┘ │
│  Free · 20 minutes · You keep the    │
│  plan either way                     │
│                                      │
│  ★★★★★ Moushumi, CFO · Justin ·      │  one-line proof strip
│  Craig, Consulting CFO               │  (avatars + stars)
│                                      │
├──────────────────────────────────────┤
│  Pick a time for call one            │  H2, id="book"
│  I'll have read your answers before  │
│  we talk.                            │
│ ┌──────────────────────────────────┐ │
│ │                                  │ │  iClosed inline widget,
│ │   [ iClosed calendar ]           │ │  prefilled with name, email,
│ │                                  │ │  phone (and answers if iClosed
│ │                                  │ │  supports it), plus UTMs
│ └──────────────────────────────────┘ │
├──────────────────────────────────────┤
│  How the Sprint works                │  H2, three numbered cards
│  ① Call one · 20 min                 │
│    We look at your business and find │
│    where the hours are hiding.       │
│  ② We map it                         │
│    My team scopes the 1–3            │
│    automations worth building.       │
│  ③ Call two                          │
│    We walk you through what we'd     │
│    build and what it'd save you.     │
│    If it's a fit, we build it. If    │
│    not, you keep the plan.           │
├──────────────────────────────────────┤
│  Businesses we've built for          │  H2, case-study cards:
│ ┌──────────────────────────────────┐ │  name, the problem, what we
│ │ SAIG                        -80% │ │  built, ONE hard number,
│ │ AI operations costs              │ │  and a quote or a "what didn't
│ │ "quote from the client" — Name   │ │  work" line (brand rule)
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ HASH FINANCIAL GROUP             │ │
│ │ Investor onboarding + KYC,       │ │
│ │ automated  [add the number]      │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ STUDYFIN                         │ │
│ │ Full platform, 7 products        │ │
│ └──────────────────────────────────┘ │
├──────────────────────────────────────┤
│  What people say                     │  existing LinkedIn review
│  [ LinkedIn review cards, swipe ]    │  screenshots (auto-cycling)
├──────────────────────────────────────┤
│  ┌────┐ Daniel                       │  LinkedIn profile card:
│  │ 🙂 │ Founder, The Rollout · Phlo  │  headshot, headline, follower
│  └────┘ [X] followers on LinkedIn    │  count, link to profile.
│  [ screenshot of 1–2 top posts ]     │  This is where your LinkedIn
│  Claude Partner Network · As featured│  earns its keep.
│  in The Australian Business Journal  │
├──────────────────────────────────────┤
│  Questions                           │  FAQ, collapsed
│  ▸ Why is it free?                   │  (the "reason why" matters
│  ▸ Is this a sales call?             │  most for a free offer)
│  ▸ Who's on the call?                │
│  ▸ What do I need to prepare?        │
│  ▸ What if we're too small?          │
├──────────────────────────────────────┤
│ ┌──────────────────────────────────┐ │
│ │   Book my free System Sprint →   │ │  repeat CTA, scrolls to #book
│ └──────────────────────────────────┘ │
│  The builds are done by Phlo...      │  footer, as now
└──────────────────────────────────────┘

 ┌──────────────────────────────────────┐
 │  Book my free call →                 │  sticky bottom bar on mobile,
 └──────────────────────────────────────┘  appears after scrolling past
                                            the first CTA, hides at #book
```

**Notes**
- **Don't hide the calendar until the video ends.** That trick suits cold traffic and paid
  offers. These are warm subscribers being offered something free, so friction costs more
  than it gains. If you want to test it, test it against the always-visible version.
- **Honesty helps conversion here.** The current page says "No pitch," but call two is where
  you offer to build. "No hard sell. If it's a fit, we'll offer to build it. If not, you keep
  the plan" is truer, and people who aren't surprised show up and buy more.
- **FAQ answers, in your voice**
  - *Why is it free?* "We've just joined the Claude Partner Network, and I want more real
    rollouts to write about in The Rollout. Your business might be the next case study (only
    with your OK)."
  - *Is this a sales call?* "Call one is a diagnosis. If there's something worth building, I'll
    tell you what it'd cost on call two. Plenty of people just take the plan and run it
    themselves."
  - *Who's on the call?* "Me. Not an SDR."
  - *What do I need to prepare?* "Nothing. I'll have read your answers and had a look at your
    site."
  - *What if we're too small?* Answer honestly, based on who you actually want on the calendar.
- **Desktop:** two columns above the fold, with the VSL on the left (about 60%) and headline,
  CTA and proof strip on the right. Everything below that is one centred column, max 720px,
  like the current page.

### VSL script outline (target 4–5 minutes, one take, face to camera plus screen recordings)

This is the pitch you already give on calls, said once on camera. Keep it in your voice:
casual, specific, a mate showing you something.

| Time | Beat | What you say / show |
|---|---|---|
| 0:00 | **Hook** | "You just told me you're [stage]. In the next four minutes I'll show you how we find the 10+ hours a week hiding in a business like yours, and why we're doing it for free right now." (Record one opening per stage, or keep it generic.) |
| 0:20 | **Who I am** | Founder of The Rollout (5,000+ subscribers), run Phlo, Claude Partner Network, featured in The Australian Business Journal. Fifteen seconds, no more. |
| 0:40 | **The problem** | Most businesses already pay for AI tools and nothing has changed. The bottleneck isn't the tool, it's knowing where to point it. Use the exact words that land on your calls. |
| 1:30 | **Proof** | Walk through one case study on screen: Saig cut AI ops costs 80%. Name the person, show the before and after, and say what didn't work first. Then 20 seconds on Hash Financial Group. |
| 3:00 | **The offer** | The System Sprint. Call one, 20 minutes, diagnosis. My team maps the 1–3 builds. Call two, what we'd build and what it saves. You keep the plan either way. |
| 3:45 | **Why free** | Claude Partner Network, plus you want real rollouts to write about. Only mention limited spots if it's true. |
| 4:10 | **Who it's for** | "Probably a fit if you've got a team and repetitive work. Probably not if you're pre-revenue." |
| 4:30 | **CTA** | "Pick a time just below this video. I'll have read your answers before we talk." |

Record a 30-second cut too, for the ads retargeting people who watched under 50%.

---

## Step 4: Booked (`/booked`)

**Job:** get them to turn up, prepared and already sold on you.
**Fires:** `Schedule` (if it wasn't fired from the widget callback).

Set this as the iClosed post-booking redirect.

```
┌──────────────────────────────────────┐
│ ◎ THE Rollout                        │
├──────────────────────────────────────┤
│  ✓ You're booked, Sam.               │  H1 Playfair
│  Thursday 16 Oct, 10:30am AEST       │  only if iClosed passes the time
│                                      │  in the redirect; otherwise
│                                      │  "Check your inbox for the invite"
│  Three quick things so we get the    │
│  most out of the 20 minutes:         │
│                                      │
│  ① Accept the calendar invite        │  checklist cards
│     It's in your inbox now. If it's  │
│     not, check spam and mark it safe.│
│                                      │
│  ② Watch this 90-second video        │
│ ┌──────────────────────────────────┐ │  "What to expect on the call":
│ │   [ Daniel, what happens on the  │ │  who you are, the agenda, and
│ │     call and what I'll ask you ] │ │  "have whoever runs ops with
│ └──────────────────────────────────┘ │  you if you can"
│                                      │
│  ③ Text me "confirmed"               │  micro-commitment that lifts
│ ┌──────────────────────────────────┐ │  show rate and opens the SMS
│ │   💬 Text Daniel                 │ │  thread (sms: or WhatsApp link)
│ └──────────────────────────────────┘ │
├──────────────────────────────────────┤
│  While you wait                      │  pre-call reading: 2–3 of your
│  [ Saig case study ]  Read →         │  best Rollout issues or case
│  [ Hash Financial ]   Read →         │  studies, matched to Q2 if you can
├──────────────────────────────────────┤
│  Connect with me on LinkedIn →       │  they'll see your posts before
│                                      │  the call: free authority
└──────────────────────────────────────┘
```

**Reminders** (set up in iClosed or your SMS tool): email and SMS at 24 hours, a text from you
at 2 hours ("Looking forward to it, had a look at [website] already"), and an SMS with the link
10 minutes before.

---

## Follow-up for people who don't book

| Who | What happens | When |
|---|---|---|
| Gave a phone number, didn't book within 10 minutes | You text them personally: "Hey Sam, Daniel from The Rollout. Saw you're running pilots at Acme and had a quick look at your site. Got a couple of ideas around your sales follow-up. Worth 20 minutes this week?" | Under 10 minutes, during business hours. This is likely the biggest single lever in the funnel. |
| Watched 50%+ of the VSL, didn't book | Meta retargeting: the 30-second VSL cut and case-study ads, linking straight to `/sprint` | 7–14 days |
| Subscribed, skipped the survey | beehiiv welcome automation. Email 1 (immediately): welcome, plus "I recorded a 4-minute video on how we find hours in businesses like yours" linking to `/sprint`. Email 2 (day 2): a case study. Email 3 (day 5): why the Sprint is free, plus the link. | Days 0–5 |
| Everyone | The weekly issue carries a "Brought to you by Phlo" block linking to `/sprint` | Weekly |

---

## Trust and authority: what goes where

| Asset | Step 1 | Step 2 | Step 3 | Step 4 |
|---|:-:|:-:|:-:|:-:|
| 5,000+ subscribers | ✓ | | in the VSL | |
| Claude Partner Network badge | | ✓ top bar | ✓ top bar + FAQ | |
| The Australian Business Journal | ✓ | | ✓ | |
| Daniel's photo / face | | ✓ small | ✓ VSL + LinkedIn card | ✓ video |
| LinkedIn reviews (Moushumi, Justin, Craig) | | | ✓ strip + carousel | |
| LinkedIn profile card + top posts | | | ✓ | ✓ "connect" |
| Case studies with numbers (Saig, Hash, Studyfin) | | | ✓ VSL + cards | ✓ reading |
| A real issue (phone mockup) | ✓ | | | ✓ reading |

**Brand note:** step 1 is a Rollout page, so the wordmark leads and there's no face (per the
brand guide). Steps 2 to 4 are the Sprint, and you're the person on the call, so your face and
voice lead there. That's deliberate. Keep the cream, black and sage palette throughout, with
Playfair for headings and Inter for body, and nothing in Phlo's teal.

**Biggest trust gap right now:** the case studies are one line each. Ask Saig and Hash for
a 30-second Loom testimonial each, or at least a named quote with a number. That's worth more
than any layout change here.

---

## Tracking and data

```
Step 1 submit ──▶ server fn ──▶ beehiiv: create subscriber
                            └─▶ Meta pixel: Subscribe
Step 2 answers ─▶ server fn ──▶ beehiiv: custom fields (stage, bottleneck, team, site, phone)
                            ├─▶ CRM / Google Sheet (one row per lead)
                            └─▶ Meta CAPI: Lead (on phone submit)
Step 3 booking ─▶ iClosed ────▶ Meta: Schedule (pixel on /booked + CAPI, shared event_id
                                to dedupe)
```

- **Carry data in `sessionStorage`**, with `?email=` as a fallback so the beehiiv email links
  into `/sprint` still prefill. The existing `index.html` already prefills `iclosedName` and
  `iclosedEmail`. Check iClosed's docs (or ask their support) whether phone and custom answers
  can be prefilled the same way; I couldn't confirm that publicly.
- **Keep UTMs** from step 1 all the way through to iClosed, so you can see which ad books calls,
  not just which ad gets subscribers.
- **The ads lever:** once `Lead` or `Schedule` fires often enough for Meta to optimise on it,
  test a campaign optimised for that event against the current subscribe-optimised one.

### The numbers to watch, weekly

| Step | Metric |
|---|---|
| 1 | Ad click → subscribe % |
| 2 | Subscribe → survey started %, → phone given % |
| 3 | `/sprint` views → VSL 50% watched % → booked % |
| 4 | Booked → showed % |
| — | Showed → call two %, → closed % |

Fix the step with the biggest drop first.

---

## Build order

1. **Step 4 (`/booked`) and the reminders.** Smallest build, protects every call you already book.
2. **Step 2 (own survey) and the "under 10 minutes" text habit.** Gets you every answer plus the
   phone, and makes the iClosed prefill complete.
3. **Step 3 VSL.** Record it, then drop it above the existing calendar in `index.html`. The rest
   of that page is already most of the wireframe.
4. **Step 1 polish** (move the form above the fold on mobile, reassurance line, button copy) and
   switching the ads' optimisation event.

## A/B tests, in order

1. VSL above the calendar vs no VSL (does the video earn its place?)
2. Phone required vs "Continue without my number"
3. Survey as tap quiz plus details screen vs everything on one screen (only if survey
   completion looks low)
4. Headline personalised by bottleneck vs generic
5. Calendar always visible vs revealed at 50% of the VSL

---

**Built:** these wireframes are implemented in [`funnel/`](funnel/README.md), a Cloudflare
Worker that writes straight into the rollout-crm database.
