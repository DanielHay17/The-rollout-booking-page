import "../index.css";

import * as React from "react";
import { ArrowRight, Check } from "lucide-react";

import { ProjectGrid, REVIEW_COUNT, Stars } from "@/components/projects";
import { CtaLink, PageColumn, SiteFooter, mountPage } from "@/components/site";
import { config } from "@/config";
import { attribution, currentState } from "@/lib/funnel";
import { initPixel, trackPixel, trackPixelCustom } from "@/lib/pixel";
import { cn } from "@/lib/utils";

/*
 * The Black Friday offer page: three months of 1-on-1 calls for $999.
 * The emails, texts and ads link here, and Daniel shares it on sales calls.
 *
 * It is the long version of the emails. The emails tell one story each; this
 * page has room for all of it (Neville, 19 Nov: "long-form detail belongs on
 * a landing page"). Top to bottom:
 *
 *   black hero     the deal: price, countdown, checkout button
 *   two stories    what one call did for Shaun and for Glen
 *   five problems  boring jobs AI is good at, "which one is you?"
 *   the grid       every build with the client's review (shared with /sprint)
 *   three months   how the calls run
 *   offer card     the deal again, with everything that's included
 *   questions
 *
 * Everything that changes (the Stripe link, the deadline, when the courses
 * open) lives in config.blackFriday. With no Stripe link the buttons book a
 * free call instead, and once the deadline passes the page says so and stops
 * offering the price.
 */

const offer = config.blackFriday;

function BlackFridayPage() {
  const state = React.useMemo(() => currentState(), []);
  const heroCta = React.useRef<HTMLAnchorElement>(null);
  const offerBlock = React.useRef<HTMLElement>(null);
  const remaining = useCountdown(offer.endsAt);
  const ended = remaining === null;
  // ?preview also shows the empty slots in the project grid, as on /sprint.
  const preview = new URLSearchParams(window.location.search).has("preview") || import.meta.env.DEV;

  React.useEffect(() => {
    initPixel({ email: state.email, firstName: state.name, phone: state.phone });
    trackPixelCustom("BlackFridayView");
  }, []);

  // A link ending in #offer (the one the texts use) opens at the price. The
  // browser can't do that itself: the block doesn't exist until this renders.
  // Fonts arriving afterwards move it a little, so land on it again then.
  React.useEffect(() => {
    if (window.location.hash !== "#offer") return;
    let cancelled = false;
    const jump = () => {
      if (!cancelled) offerBlock.current?.scrollIntoView();
    };
    const stop = () => {
      cancelled = true;
    };
    jump();
    void document.fonts?.ready.then(jump);
    window.addEventListener("load", jump, { once: true });
    // Once they scroll themselves, leave the page where they put it.
    window.addEventListener("touchstart", stop, { once: true, passive: true });
    window.addEventListener("wheel", stop, { once: true, passive: true });
    return () => {
      stop();
      window.removeEventListener("load", jump);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("wheel", stop);
    };
  }, []);

  const utm = React.useMemo(() => {
    const tags = state.utm && Object.keys(state.utm).length ? state.utm : attribution().utm;
    return Object.keys(tags).length
      ? tags
      : { utm_source: "the-rollout", utm_medium: "web", utm_campaign: "black-friday" };
  }, [state]);

  const callHref = React.useMemo(() => withParams("/sprint", utm), [utm]);
  // Stripe keeps utm_* tags from the link on the payment, so a sale can be
  // traced back to the email, text or call it came from.
  const payHref = React.useMemo(() => (offer.payUrl ? withParams(offer.payUrl, utm) : ""), [utm]);
  const canPay = Boolean(payHref) && !ended;

  const cta = canPay
    ? { href: payHref, label: `Check out now: ${offer.price}` }
    : { href: callHref, label: "Book a free call to get started" };
  const onCta = () => {
    trackPixelCustom(canPay ? "BlackFridayCheckout" : "BlackFridayCall");
    // A standard event too, so a Meta campaign sent to this page has something to optimise on.
    if (canPay) trackPixel("InitiateCheckout", { value: 999, currency: "AUD" });
  };

  return (
    <>
      {/* The deal, in black: this is the Black Friday part of the page. */}
      <div className="bg-foreground text-background">
        <div className="mx-auto w-full max-w-[960px] px-4 pt-6 pb-10 sm:px-5 sm:pt-10 sm:pb-14">
          <header className="flex items-center justify-between gap-4">
            <img
              src="/assets/rollout-logo.png"
              alt="The Rollout"
              width={600}
              height={200}
              className="h-9 w-auto brightness-0 invert sm:h-10"
            />
            <img
              src="/assets/claude-partner-logo.svg"
              alt="Claude Partner Network"
              width={363}
              height={28}
              className="h-auto w-[min(50vw,280px)] brightness-0 invert"
            />
          </header>

          <section className="mt-7 grid gap-6 sm:mt-12 sm:grid-cols-[minmax(0,1fr)_23.5rem] sm:items-center sm:gap-10">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-primary px-3.5 py-1.5 text-[0.8125rem] font-semibold tracking-[0.08em] text-primary uppercase">
                <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
                {ended ? "Black Friday has ended" : "Black Friday sale"}
              </p>
              <h1 className="mt-4 text-[2.25rem] leading-[1.1] font-bold sm:text-[3.5rem]">
                Let me automate boring tasks in your business.
              </h1>
              <p className="mt-4 text-background/75 sm:text-lg">
                It&apos;s like a tutor, but for AI in your business. You get 3 one-hour video calls with me,
                one a month. On each call you pick one boring job, we share screens, and we set Claude up
                to do it on your own files.
              </p>
              <HeroStars className="mt-5 hidden sm:flex" />
            </div>

            {/* Price, clock and button together, so the whole deal is one glance. */}
            <div className="rounded-xl border-2 border-primary px-5 py-5 sm:px-6 sm:py-6">
              <DealPrice ended={ended} />
              {remaining !== null ? <Clock remaining={remaining} className="mt-5" /> : null}
              <CtaLink
                ref={heroCta}
                href={cta.href}
                onClick={onCta}
                className="mt-5 min-h-14 px-4 text-base text-foreground sm:w-full sm:text-lg"
              >
                {cta.label} <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </CtaLink>
              <p className="mt-3 text-center text-sm text-background/65">
                {ended ? (
                  <>Tutoring is {offer.after}.</>
                ) : (
                  <>
                    Paid once at checkout. From Saturday it&apos;s {offer.was}.{" "}
                    <a href="#offer" className="underline decoration-primary underline-offset-4 hover:text-primary">
                      See what you get
                    </a>
                  </>
                )}
              </p>
            </div>
            <HeroStars className="flex justify-center sm:hidden" />
          </section>
        </div>
      </div>

      {/* As wide as /sprint, so the project grid gets two real columns. */}
      <PageColumn className="sm:max-w-[960px]">
        {/* One story per client, the result first */}
        <section className="mt-6 sm:mt-4">
          <SectionHeading>One call. One boring job, gone.</SectionHeading>
          <p className="max-w-[44rem] text-muted-foreground">
            Each of these was set up on a single one-hour call, on the client&apos;s own files.
          </p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {STORIES.map((story) => (
              <Story key={story.title} story={story} />
            ))}
          </div>
        </section>

        {/* The reader's own problem, then who already fixed it */}
        <section className="mt-14">
          <SectionHeading>5 boring jobs AI is really good at</SectionHeading>
          <p className="max-w-[44rem] text-muted-foreground">Which one is you?</p>
          <ol className="mt-5 divide-y rounded-md border bg-card">
            {PROBLEMS.map((problem, index) => (
              <li key={problem.you} className="grid gap-x-4 px-4 py-5 sm:grid-cols-[2.5rem_minmax(0,1fr)] sm:px-6">
                <span className="font-serif text-2xl leading-none font-bold text-primary sm:text-3xl" aria-hidden="true">
                  {index + 1}
                </span>
                <div className="mt-2 sm:mt-0">
                  <h3 className="text-lg font-bold sm:text-xl">{problem.you}</h3>
                  <p className="mt-1.5 text-[0.9375rem] text-muted-foreground">{problem.today}</p>
                  <p className="mt-3 flex gap-2.5 text-[0.9375rem]">
                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                    <span>
                      <strong>{problem.label}</strong> {problem.after}
                      {problem.proof ? <strong className="mt-1.5 block">{problem.proof}</strong> : null}
                    </span>
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-[0.9375rem] text-muted-foreground">
            Your numbers won&apos;t be these numbers. You&apos;ll have your own.
          </p>
          <div className="mt-6 flex flex-col gap-4 rounded-xl bg-foreground px-5 py-5 text-background sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <p className="font-serif text-xl font-bold sm:text-2xl">
              Which job do you want off your desk first?
              {ended ? null : (
                <span className="mt-1 block font-sans text-sm font-normal text-background/70">
                  {offer.price} for 3 months, down from {offer.was}. Ends {offer.endsShort}.
                </span>
              )}
            </p>
            <CtaLink href={cta.href} onClick={onCta} className="shrink-0 text-foreground">
              {cta.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </CtaLink>
          </div>
        </section>

        {/* The same proof as /sprint: every build, in the client's own words */}
        <section className="mt-14">
          <SectionHeading>What we&apos;ve built for businesses like yours</SectionHeading>
          <p className="max-w-[44rem] text-muted-foreground">
            Real builds, from bookkeeping practices to car dealerships, in the clients&apos; own words.
          </p>
          <p className="mt-2 mb-5 flex items-center gap-2 text-sm">
            <Stars small /> <strong>5.0</strong>
            <span className="text-muted-foreground">from {REVIEW_COUNT} client reviews</span>
          </p>
          <ProjectGrid preview={preview} />
        </section>

        {/* What the three months look like */}
        <section className="mt-14">
          <SectionHeading>How the 3 months go</SectionHeading>
          <ol className="grid gap-4 sm:grid-cols-3">
            {MONTHS.map((month, index) => (
              <li key={month.title} className="rounded-md border bg-card px-4 py-4 sm:px-5">
                <Eyebrow>Month {index + 1}</Eyebrow>
                <p className="mt-1.5 font-serif text-lg font-bold">{month.title}</p>
                <p className="mt-1.5 text-[0.9375rem] text-muted-foreground">{month.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* The deal again, with everything in it */}
        <section ref={offerBlock} id="offer" className="mt-14 scroll-mt-6">
          <div className="grid rounded-xl bg-foreground px-5 py-7 text-background sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-x-10 sm:px-8 sm:py-9">
            <div>
              <p className="text-xs font-semibold tracking-[0.08em] text-primary uppercase">
                {ended ? "Black Friday has ended" : `Black Friday · ends ${offer.endsShort}`}
              </p>
              <h2 className="mt-2 text-2xl font-bold sm:text-[1.75rem]">The Rollout Workshop</h2>
              <p className="mt-1 text-background/75">3 months of 1-on-1 AI tutoring with me.</p>
              <DealPrice ended={ended} perCall className="mt-5" />
              {remaining !== null ? <Clock remaining={remaining} className="mt-5" /> : null}
            </div>
            <ul className="mt-6 mb-6 space-y-3 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:my-0">
              {INCLUDED.map((item) => (
                <li key={item.title} className="flex gap-3">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <span>
                    <strong>{item.title}.</strong> <span className="text-background/70">{item.body}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="sm:col-start-1 sm:row-start-2 sm:mt-6 sm:self-end">
              <CtaLink href={cta.href} onClick={onCta} className="min-h-14 px-4 text-base text-foreground sm:w-full sm:text-lg">
                {cta.label} <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </CtaLink>
              <p className="mt-3 text-sm text-background/65">
                {ended ? <>Tutoring is {offer.after}.</> : <>Paid once at checkout. From Saturday it&apos;s {offer.was}.</>}
              </p>
            </div>
          </div>

          <p className="mt-4 rounded-md border-l-[3px] border-primary bg-card px-4 py-3 text-[0.9375rem]">
            <strong>Book your first call as soon as you&apos;ve paid.</strong> After checkout you land in the
            members&apos; portal, where you pick a time. The courses open on {offer.coursesOpen}.
          </p>
          {canPay ? (
            <p className="mt-4 text-[0.9375rem]">
              Want to talk first?{" "}
              <a href={callHref} className="underline decoration-primary underline-offset-4 hover:text-primary">
                Book a free 30-minute call
              </a>
            </p>
          ) : null}
        </section>

        {/* The questions people actually ask */}
        <section className="mt-14">
          <SectionHeading>Questions</SectionHeading>
          <div className="divide-y rounded-md border bg-card">
            {FAQS.map((faq) => (
              <details key={faq.q} className="group px-4 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 font-medium">
                  {faq.q}
                  <span
                    aria-hidden="true"
                    className="text-xl leading-none text-primary transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="pb-4 text-[0.9375rem] text-muted-foreground">{faq.a}</p>
              </details>
            ))}
          </div>
        </section>
      </PageColumn>

      <SiteFooter />
      <StickyCta heroCta={heroCta} offerBlock={offerBlock} href={cta.href} onClick={onCta} canPay={canPay} remaining={remaining} />
    </>
  );
}

interface StoryData {
  title: string;
  body: string;
  bars: { label: string; value: string; width: string; after?: boolean }[];
  image: { src: string; alt: string };
}

// The same two stories as the emails, with the same graphics.
const STORIES: StoryData[] = [
  {
    title: "Shaun got 4 hours a week back.",
    body: "Shaun runs a bookkeeping practice in Sydney. One employee reimbursement took him 8 steps by hand. In one hour we had Claude doing 5 of them. Shaun still checks everything before it posts.",
    bars: [
      { label: "By hand", value: "4 hrs a week", width: "100%" },
      { label: "With Claude, and Shaun checking", value: "30 min", width: "12.5%", after: true },
    ],
    image: {
      src: "/assets/bf/shaun-steps.png",
      alt: "8 steps for one employee reimbursement. Claude now does 5; Shaun approves the claim, checks the totals and posts.",
    },
  },
  {
    title: "Glen stopped paying an ad agency $1,000+ a month.",
    body: "Glen is an architect in Melbourne. An agency ran his Meta ads, and it wasn't working. On our first call we connected Claude to his ad account and it built his first campaign. Glen picks the budget, checks the creative and presses publish.",
    bars: [
      { label: "Ad agency", value: "$1,000+ a month", width: "100%" },
      { label: "Glen and Claude", value: "one Claude subscription", width: "6%", after: true },
    ],
    image: {
      src: "/assets/bf/glen-steps.png",
      alt: "8 steps to run Meta ads. Claude now does 6; Glen picks the budget, checks the creative and presses publish.",
    },
  },
];

function Story({ story }: { story: StoryData }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-md border bg-card">
      <div className="px-4 pt-5 sm:px-5">
        <h3 className="text-xl font-bold sm:text-2xl">{story.title}</h3>
        <dl className="mt-4 space-y-2.5">
          {story.bars.map((bar) => (
            <div key={bar.label}>
              <dt className="text-sm font-semibold">{bar.label}</dt>
              <dd className="mt-1 flex items-center gap-2.5">
                <span
                  className={cn("h-4 min-w-2 rounded-sm", bar.after ? "bg-primary" : "bg-subtle-foreground/60")}
                  style={{ width: `calc(${bar.width} * 0.6)` }}
                  aria-hidden="true"
                />
                <span className="text-sm font-semibold whitespace-nowrap">{bar.value}</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 mb-4 text-[0.9375rem] text-muted-foreground">{story.body}</p>
      </div>
      <img
        src={story.image.src}
        alt={story.image.alt}
        width={1560}
        height={1155}
        loading="lazy"
        className="mt-auto h-auto w-full border-t bg-white"
      />
    </article>
  );
}

// "Is this you?" first, the client who already has it second.
const PROBLEMS = [
  {
    you: "You build the same report by hand, every month",
    today: "You pull the numbers. You build the report. You answer the same questions. Next month you do it all again.",
    label: "Three months from now:",
    after: "a live dashboard your clients log into, and an AI that answers their questions for you.",
    proof: "Craig at Real Balance already has this. 3+ hours back per client, every month.",
  },
  {
    you: "You're months behind on the books",
    today: "The bank feed is a backlog. Finding one invoice takes an afternoon. You keep meaning to catch up.",
    label: "Three months from now:",
    after: "Claude codes every bank line and writes down why. You approve each page.",
    proof: "Moushumi at Ethical CFO already has this. 5 years of bank lines, reconciled in Xero.",
  },
  {
    you: "Your business runs on one giant spreadsheet",
    today: "Every person and every job sits in one colour-coded sheet. When it changes, you hunt for what moved.",
    label: "Three months from now:",
    after: "a live calendar of every person and job. Upload the new roster and it shows you what changed.",
    proof: "Justin at Remedy already has this. 6 new jobs and 11 changes, caught from one upload.",
  },
  {
    you: "Every proposal takes you two hours",
    today: "One client sends five a week. That was ten hours gone before any real work.",
    label: "Now:",
    after: "each one takes 30 minutes.",
    proof: "Ten hours a week became two and a half.",
  },
  {
    you: "Your cash is sitting in stock you ordered too early",
    today: "A truck builder in Perth was ordering axles the day a job was signed. The axle is the last part to go on.",
    label: "Fixing that freed up $75,000.",
    after: "",
    proof: "",
  },
];

const MONTHS = [
  { title: "The job that eats your week", body: "We pick it on the first call and get it working." },
  { title: "The next jobs", body: "You drive, I steer." },
  { title: "On your own", body: "You're building by yourself, and I help you finish." },
];

const INCLUDED = [
  {
    title: "3 one-hour video calls with me, one a month",
    body: "You pick one boring job, we share screens, and we set Claude up to do it.",
  },
  {
    title: "Ask questions between calls",
    body: "Message me in the portal any time.",
  },
  {
    title: "All of my skills, prompts and templates",
    body: "Download them to your Claude, and it imports and uses them for you.",
  },
  {
    title: "All of my AI courses",
    body: `Claude for Beginners and more, to get you up to speed. They open on ${offer.coursesOpen}.`,
  },
];

const FAQS = [
  {
    q: "What happens after I pay?",
    a: `You're taken straight to the members' portal. Sign in with the email you paid with, then book your first call. The courses open on ${offer.coursesOpen}.`,
  },
  {
    q: "What if I don't know what to automate?",
    a: "That's what the first call is for. We go through your week together and pick the job that costs you the most time.",
  },
  {
    q: "What happens after the three months?",
    a: `The ${offer.price} is paid once and nothing renews on its own. If you want to keep going, it's ${offer.after}.`,
  },
  {
    q: "Do I need to be technical?",
    a: "No. If you can share your screen and describe how you do a job today, that's enough.",
  },
];

/** The time left until `endsAt`, ticking every second; null once it has passed. */
function useCountdown(endsAt: string) {
  const end = React.useMemo(() => new Date(endsAt).getTime(), [endsAt]);
  const read = React.useCallback(() => {
    const ms = end - Date.now();
    return ms > 0 ? ms : null;
  }, [end]);
  const [remaining, setRemaining] = React.useState(read);

  React.useEffect(() => {
    const timer = window.setInterval(() => setRemaining(read()), 1000);
    return () => window.clearInterval(timer);
  }, [read]);

  return remaining;
}

function clockParts(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return [
    { value: Math.floor(seconds / 86_400), label: "days" },
    { value: Math.floor((seconds % 86_400) / 3600), label: "hours" },
    { value: Math.floor((seconds % 3600) / 60), label: "mins" },
    { value: seconds % 60, label: "secs" },
  ];
}

/** The short form for the phone bar: "5d 8h left". */
function formatRemaining(ms: number) {
  const [days, hours, minutes] = clockParts(ms).map((part) => part.value);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${Math.max(minutes, 1)}m left`;
}

/** The countdown as four boxes. Only ever shown on black. */
function Clock({ remaining, className }: { remaining: number; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold text-background/65">Ends {offer.endsLabel}</p>
      <div className="mt-2 grid grid-cols-4 gap-2" role="timer" aria-label={formatRemaining(remaining)}>
        {clockParts(remaining).map((part) => (
          <div key={part.label} className="rounded-md bg-background/10 px-1 py-2 text-center">
            <span className="block font-serif text-2xl leading-none font-bold tabular-nums sm:text-3xl">
              {String(part.value).padStart(2, "0")}
            </span>
            <span className="mt-1 block text-[0.6875rem] tracking-wide text-background/65 uppercase">{part.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The price, as big as the page allows. Only ever shown on black. */
function DealPrice({ ended, perCall = false, className }: { ended: boolean; perCall?: boolean; className?: string }) {
  if (ended) {
    return (
      <p className={cn("font-serif text-5xl leading-none font-bold", className)}>
        $500 <span className="font-sans text-base font-normal text-background/65">+ GST a month</span>
      </p>
    );
  }
  return (
    <div className={className}>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-2xl text-background/55 line-through">{offer.was}</span>
        <span className="rounded-full bg-primary px-3 py-1 text-sm font-bold tracking-wide text-foreground uppercase">
          Save {offer.saving}
        </span>
      </p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
        <span className="font-serif text-[4.5rem] leading-none font-bold sm:text-[5rem]">
          {offer.price.replace(" + GST", "")}
        </span>
        <span className="text-background/75">+ GST for 3 months</span>
      </p>
      {perCall ? <p className="mt-2 text-sm text-background/65">That&apos;s $333 a call, down from $500.</p> : null}
    </div>
  );
}

/** The review score, for the black hero. */
function HeroStars({ className }: { className?: string }) {
  return (
    <p className={cn("items-center gap-2 text-sm", className)}>
      <Stars small /> <strong>5.0</strong>
      <span className="text-background/65">from {REVIEW_COUNT} client reviews</span>
    </p>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3.5 text-2xl font-bold sm:text-[1.75rem]">{children}</h2>;
}

/** The small letter-spaced label above a block. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold tracking-[0.08em] text-primary-hover uppercase">{children}</p>;
}

/** Add tracking tags to a link without dropping the ones it already has. */
function withParams(href: string, params: Record<string, string>) {
  const url = new URL(href, window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  }
  return url.origin === window.location.origin ? `${url.pathname}${url.search}` : url.toString();
}

/** On phones, the price and the button stay on screen while they read. */
function StickyCta({
  heroCta,
  offerBlock,
  href,
  onClick,
  canPay,
  remaining,
}: {
  heroCta: React.RefObject<HTMLAnchorElement | null>;
  offerBlock: React.RefObject<HTMLElement | null>;
  href: string;
  onClick: () => void;
  canPay: boolean;
  remaining: number | null;
}) {
  const [heroVisible, setHeroVisible] = React.useState(true);
  const [offerVisible, setOfferVisible] = React.useState(false);

  React.useEffect(() => {
    const hero = heroCta.current;
    const block = offerBlock.current;
    if (!hero || !block || !("IntersectionObserver" in window)) return;
    // A sliver of the hero button at the bottom of the screen doesn't count as showing it.
    const heroWatch = new IntersectionObserver(([entry]) => setHeroVisible(entry.intersectionRatio >= 0.9), {
      threshold: [0, 0.9, 1],
    });
    const offerWatch = new IntersectionObserver(([entry]) => setOfferVisible(entry.isIntersecting));
    heroWatch.observe(hero);
    offerWatch.observe(block);
    return () => {
      heroWatch.disconnect();
      offerWatch.disconnect();
    };
  }, [heroCta, offerBlock]);

  const show = !heroVisible && !offerVisible;
  return (
    <div
      aria-hidden={!show}
      className={cn(
        "fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 bg-foreground px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-background transition-transform duration-200 sm:hidden",
        show ? "translate-y-0" : "pointer-events-none translate-y-full",
      )}
    >
      {canPay ? (
        <p className="shrink-0 leading-tight">
          <span className="block font-serif text-xl font-bold">
            $999 <span className="font-sans text-sm font-normal text-background/55 line-through">{offer.was}</span>
          </span>
          {remaining !== null ? <span className="block text-xs text-primary">{formatRemaining(remaining)}</span> : null}
        </p>
      ) : null}
      <CtaLink href={href} onClick={onClick} tabIndex={show ? 0 : -1} className="text-foreground">
        {canPay ? "Check out" : "Book a free call"} <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </CtaLink>
    </div>
  );
}

mountPage(BlackFridayPage);
