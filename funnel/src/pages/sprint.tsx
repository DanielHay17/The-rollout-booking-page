import "../index.css";

import * as React from "react";
import { ArrowRight, Check, Star, Volume2 } from "lucide-react";

import type { AiStage, Bottleneck } from "@shared/survey";
import { CtaLink, PageColumn, SiteFooter, SiteHeader, mountPage } from "@/components/site";
import { config } from "@/config";
import { attribution, currentState, sendEvent, type FunnelEvent, type FunnelState } from "@/lib/funnel";
import { initPixel, trackPixelCustom } from "@/lib/pixel";
import { cn } from "@/lib/utils";

/*
 * Step 3: the VSL and the calendar. Personalised from the survey (or from
 * ?name=&stage=&email= on links from emails), and it works without the VSL:
 * until config.vsl.src is set, the page is the original booking page.
 */

const STAGE_NOTES: Record<AiStage, string> = {
  live: "You're already live with AI, so we'd focus on your next win.",
  pilots: "You're already piloting AI, which is the perfect time for this.",
  stuck: "You've already had a crack at AI, so let's make it pay off this time.",
  tinkering: "You're already tinkering with AI, so let's point it at real hours.",
  researching: "You're still weighing AI up, which is exactly the right time for this.",
};

const FOCUS_AREAS: Partial<Record<Bottleneck, string>> = {
  admin: "admin and operations",
  sales: "sales follow-up",
  reporting: "reporting and finance",
  service: "customer service",
};

function SprintPage() {
  const state = React.useMemo(() => currentState(), []);
  const heroCta = React.useRef<HTMLAnchorElement>(null);
  const booking = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    initPixel({ email: state.email, firstName: state.name, phone: state.phone });
    trackPixelCustom("SprintView");
    sendEvent("page_sprint");
  }, []);

  const previewVsl = new URLSearchParams(window.location.search).has("preview");
  const showVsl = Boolean(config.vsl.src) || previewVsl || import.meta.env.DEV;
  const area = state.bottleneck ? FOCUS_AREAS[state.bottleneck] : undefined;

  const eyebrow = showVsl
    ? state.name
      ? `${state.name}, watch this before you book.`
      : "Watch this before you book."
    : state.name
      ? `Hey ${state.name} 👋`
      : "Hey 👋";
  const headline = area
    ? `Let's find the hours hiding in your ${area}.`
    : "I think your business is a great fit for our free System Sprint.";
  const stageNote = state.stage ? `${STAGE_NOTES[state.stage]} ` : "";

  const onBookClick = () => sendEvent("book_click");

  return (
    <>
      <PageColumn>
        <SiteHeader />

        {/* Hero */}
        <section className="mt-9 sm:mt-12">
          <p className="mb-2.5 font-medium sm:text-lg">{eyebrow}</p>
          <h1 className="text-[1.875rem] font-bold sm:text-[2.625rem]">{headline}</h1>
          {showVsl ? (
            // The video explains the Sprint, so keep it high on the screen:
            // just the one personal line between the headline and play.
            stageNote ? (
              <p className="mt-3 text-muted-foreground sm:text-lg">{stageNote.trim()}</p>
            ) : null
          ) : (
            <p className="mt-3 text-muted-foreground sm:max-w-[34rem] sm:text-lg">
              {stageNote}
              The System Sprint is two free calls. On the first, we diagnose your business and find
              where the hours are hiding. On the second, we show you the solutions we&apos;d build
              and what they&apos;d save you. No hard sell, and you keep the plan either way.
            </p>
          )}

          <div className="mt-6">
            {showVsl ? (
              config.vsl.src ? (
                <Vsl src={config.vsl.src} poster={config.vsl.poster} captions={config.vsl.captions} />
              ) : (
                <VslPlaceholder />
              )
            ) : (
              // No VSL yet: show the work itself, not a stock picture of it.
              <WorkClip />
            )}
          </div>

          <div className="mt-6">
            <CtaLink ref={heroCta} href="#book" onClick={onBookClick}>
              Book my free System Sprint <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </CtaLink>
            <p className="mt-2.5 text-sm text-muted-foreground">
              Free <Dot /> 20 minutes <Dot /> You keep the plan either way
            </p>
          </div>

          <HostCard />
          <p className="mt-4 text-[0.8125rem] text-muted-foreground">
            We&apos;ve just joined the Claude Partner Network, so the System Sprint is free for Rollout
            readers right now.
          </p>
        </section>

        {/* One real result, in the client's words, right before the ask */}
        <figure className="mt-10 rounded-md border bg-card px-5 py-5 sm:px-6">
          <Stars />
          <blockquote className="mt-3 font-serif text-lg leading-snug font-medium sm:text-xl">
            &ldquo;Phlo moved our clients from monthly reporting to daily engagement using a live
            dashboard and an internal AI built on their financial data. It&apos;s transformed how
            clients interact with their numbers.&rdquo;
          </blockquote>
          <figcaption className="mt-3 text-sm text-muted-foreground">
            <strong className="text-foreground">Craig Whitton</strong>, Managing Director, Real Balance
          </figcaption>
        </figure>

        {/* Booking */}
        <section ref={booking} id="book" className="mt-14 scroll-mt-6">
          <SectionHeading>Book call one</SectionHeading>
          <p className="mb-6 text-muted-foreground">
            Pick a slot below. I read every response myself, so I&apos;ll know your business before we
            hop on.
          </p>
          <BookingEmbed state={state} />
        </section>

        {/* Proof straight after the calendar, for anyone who scrolled past it
            unconvinced: the work itself, number first. Nothing here links
            off the page; the only way on is the calendar. */}
        <section className="mt-14">
          <SectionHeading>What we&apos;ve built for businesses like yours</SectionHeading>
          <div className="space-y-4">
            {CASE_STUDIES.map((study) => (
              <figure key={study.client} className="overflow-hidden rounded-md border bg-card">
                <img
                  src={study.image}
                  width={study.width}
                  height={study.height}
                  alt={study.alt}
                  loading="lazy"
                  className="h-auto w-full border-b bg-white"
                />
                <figcaption className="px-4 py-4 sm:px-5">
                  <p className="font-serif text-[1.625rem] leading-tight font-bold">{study.result}</p>
                  <p className="mt-1.5 text-[0.9375rem] text-muted-foreground">{study.detail}</p>
                  <p className="mt-3 text-sm">
                    <strong>{study.client}</strong>
                    <span className="text-muted-foreground">, {study.who}</span>
                  </p>
                </figcaption>
              </figure>
            ))}
          </div>
          <p className="mt-4 text-[0.9375rem] text-muted-foreground">
            Also built for <strong className="text-foreground">Saig</strong> (−80% on AI operations
            costs), <strong className="text-foreground">Hash Financial Group</strong> (investor
            onboarding and KYC) and <strong className="text-foreground">Studyfin</strong> (seven
            products on one platform).
          </p>
        </section>

        {/* How it works, and what they leave with */}
        <section className="mt-14">
          <SectionHeading>Here&apos;s how the Sprint works</SectionHeading>
          <ol className="space-y-3">
            {SPRINT_STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-4 rounded-md border bg-card px-4 py-4">
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
                >
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-sans text-base font-semibold tracking-normal">{step.title}</h3>
                  <p className="mt-1 text-[0.9375rem] text-muted-foreground">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <h3 className="mt-8 mb-3 text-xl font-semibold">What you&apos;ll walk away with</h3>
          <ul className="space-y-2.5">
            {[
              "The one to three automations I'd build in your business first",
              "A rough read on the time and money each would save",
              "An honest answer on whether it's even worth doing",
            ].map((item) => (
              <li key={item} className="flex gap-3 text-[0.9375rem]">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        {/* Reviews */}
        <section className="mt-14" aria-label="Reviews">
          <SectionHeading>What people say on LinkedIn</SectionHeading>
          <Reviews />
          <p className="mt-5 text-center text-[0.8125rem] text-muted-foreground">
            As featured in{" "}
            <span className="font-serif font-bold whitespace-nowrap text-foreground uppercase tracking-wide">
              The Australian Business Journal
            </span>
          </p>
        </section>

        {/* Why this exists, from Daniel */}
        <section className="mt-14" aria-label="Why this call exists">
          <figure className="rounded-md border bg-card px-5 py-5 sm:px-6">
            <blockquote className="space-y-4 border-l-[3px] border-primary pl-4">
              <p>
                I started The Rollout because most founders I talk to are sitting on 10+ hours of
                manual work a week that could be automated. They just don&apos;t know where to start.
              </p>
              <p>
                Every issue I publish is a real case study of a business that found that bottleneck and
                fixed it. This call is the same thing, pointed straight at your business.
              </p>
            </blockquote>
            <figcaption className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
              <span className="flex items-center gap-3">
                <DanielPhoto className="h-12 w-12" />
                <span className="text-[0.9375rem]">
                  <strong className="block">Daniel Hay</strong>
                  <span className="text-muted-foreground">
                    Founder of The Rollout (and Phlo, the team that builds this stuff)
                  </span>
                </span>
              </span>
            </figcaption>
          </figure>
        </section>

        {/* FAQ */}
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

        {/* Last call to action */}
        <section className="mt-14 text-center">
          <SectionHeading>Ready when you are</SectionHeading>
          <CtaLink href="#book" onClick={onBookClick}>
            Pick a time for call one <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </CtaLink>
        </section>
      </PageColumn>

      <SiteFooter />
      <StickyCta heroCta={heroCta} booking={booking} onClick={onBookClick} />
    </>
  );
}

const FAQS = [
  {
    q: "Why is it free?",
    a: "We've just joined the Claude Partner Network, and I want more real rollouts to write about in The Rollout. If your business ends up as a case study, that's only ever with your OK.",
  },
  {
    q: "Is this a sales call?",
    a: "Call one is a diagnosis. If there's something worth building, I'll tell you what it'd cost on call two. Plenty of people just take the plan and run it themselves.",
  },
  {
    q: "Who's on the call?",
    a: "Me, Daniel. Not a sales rep.",
  },
  {
    q: "What do I need to prepare?",
    a: "Nothing. I'll have read your answers and had a look at your website before we talk.",
  },
];

const SPRINT_STEPS = [
  {
    title: "Call one · 20 minutes",
    body: "I'll have read your answers before we talk, so we skip the small talk, look at your business and find where the hours are hiding.",
  },
  {
    title: "We map it",
    body: "My team scopes the one to three automations worth building first, and roughly what each would save you.",
  },
  {
    title: "Call two",
    body: "We walk you through what we'd build and what it'd save. If it's a fit to build together, great. If not, you keep the plan and run it yourself.",
  },
];

/*
 * Real screenshots from the builds, each already published in The Rollout.
 * Accounting and finance first: that's who the ads reach. Personal details
 * in the screenshots (a name and mobile in Remedy's sheet) are blurred.
 */
const CASE_STUDIES = [
  {
    result: "3+ hours saved per client, every month",
    detail:
      "A live dashboard synced with Xero that clients log into, plus an AI that answers questions about their numbers in plain English.",
    client: "Real Balance",
    who: "accounting and CFO advisory",
    image: "/assets/work/realbalance-dashboard.webp",
    width: 900,
    height: 816,
    alt: "Real Balance's client dashboard: revenue, expenses, net profit and cash at bank, with recent activity and upcoming BAS and tax deadlines.",
  },
  {
    result: "5 years of bank lines, reconciled in Xero",
    detail:
      "Claude works down the reconciliation screen coding each line and writing the why. A bookkeeper approves every page.",
    client: "Ethical CFO",
    who: "Xero Sole Practitioner of the Year",
    image: "/assets/work/ethicalcfo-xero.webp",
    width: 800,
    height: 446,
    alt: "Claude running beside Xero's bank reconciliation screen, prompted to work as an experienced Australian bookkeeper.",
  },
  {
    result: "6 new jobs and 11 changes, caught from one upload",
    detail:
      "The spreadsheet that ran a national inspection team, turned into a live calendar of every inspector and job.",
    client: "Remedy Asset Protection",
    who: "asset inspection, nationwide",
    image: "/assets/work/remedy-before-after.webp",
    width: 1000,
    height: 563,
    alt: "Before and after: a colour-coded roster spreadsheet on the left, the same jobs in Remedy's live inspector calendar on the right.",
  },
];

/** Who they'll actually be talking to. Sits right under the button. */
function HostCard() {
  return (
    <div className="mt-6 flex items-center gap-3.5 rounded-md border bg-card px-4 py-3.5">
      <DanielPhoto className="h-14 w-14" />
      <div className="min-w-0 text-sm">
        <p className="text-[0.9375rem] font-semibold">You&apos;ll be talking to Daniel Hay</p>
        <p className="text-muted-foreground">
          Founder of The Rollout, read by 5,000+ operators each week. Runs Phlo, the team that does
          the builds.
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
          <Stars small /> 5.0 on LinkedIn
        </p>
      </div>
    </div>
  );
}

function DanielPhoto({ className }: { className?: string }) {
  if (!config.danielPhoto) return null;
  return (
    <img
      src={config.danielPhoto}
      alt="Daniel Hay"
      width={256}
      height={256}
      className={cn("shrink-0 rounded-full object-cover", className)}
    />
  );
}

function Stars({ small = false }: { small?: boolean }) {
  return (
    <span className="inline-flex text-primary" role="img" aria-label="5 out of 5 stars">
      {Array.from({ length: 5 }, (_, index) => (
        <Star key={index} className={cn("fill-current", small ? "h-3.5 w-3.5" : "h-4 w-4")} aria-hidden="true" />
      ))}
    </span>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3.5 text-2xl font-bold sm:text-[1.75rem]">{children}</h2>;
}

function Dot() {
  return (
    <span className="mx-1 text-primary" aria-hidden="true">
      &middot;
    </span>
  );
}

function BookingEmbed({ state }: { state: FunnelState }) {
  // iClosed reads these from the event URL and fills in its form, so people
  // don't type their details twice. Name and email are documented by iClosed;
  // phone is passed in case it's picked up too, and ignored if not.
  const url = React.useMemo(() => {
    const target = new URL(config.iclosedUrl);
    if (state.name) target.searchParams.set("iclosedName", state.name);
    if (state.email) target.searchParams.set("iclosedEmail", state.email);
    if (state.phone) target.searchParams.set("iclosedPhone", state.phone);
    const utm = state.utm && Object.keys(state.utm).length ? state.utm : attribution().utm;
    for (const [key, value] of Object.entries(utm)) {
      target.searchParams.set(key, value);
    }
    return target.toString();
  }, [state]);

  React.useEffect(() => {
    // widget.js finds .iclosed-widget on load, so it goes in after the div
    // (with its final data-url) is on the page.
    if (document.querySelector("script[data-iclosed-widget]")) return;
    const script = document.createElement("script");
    script.src = "https://app.iclosed.io/assets/widget.js";
    script.async = true;
    script.dataset.iclosedWidget = "true";
    document.body.appendChild(script);
  }, []);

  return (
    <div
      className="iclosed-widget w-full overflow-hidden rounded-md"
      data-url={url}
      title="Find what to automate first"
      style={{ width: "100%", height: 620 }}
    />
  );
}

const VSL_MILESTONES = [25, 50, 75, 95] as const;

function Vsl({ src, poster, captions }: { src: string; poster: string; captions: string }) {
  const video = React.useRef<HTMLVideoElement>(null);
  const [withSound, setWithSound] = React.useState(false);
  const reported = React.useRef(new Set<number>());

  React.useEffect(() => {
    const element = video.current;
    if (!element) return;
    // Browsers only autoplay muted video, and iOS wants the attribute itself.
    element.muted = true;
    element.setAttribute("muted", "");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduceMotion) element.play().catch(() => {});
  }, []);

  const playWithSound = () => {
    const element = video.current;
    if (!element) return;
    element.muted = false;
    element.currentTime = 0;
    element.controls = true;
    element.play().catch(() => {});
    setWithSound(true);
    sendEvent("vsl_play");
    trackPixelCustom("VSLPlay");
  };

  const onTimeUpdate = () => {
    const element = video.current;
    if (!element || !withSound || !element.duration) return;
    const percent = (element.currentTime / element.duration) * 100;
    for (const milestone of VSL_MILESTONES) {
      if (percent >= milestone && !reported.current.has(milestone)) {
        reported.current.add(milestone);
        sendEvent(`vsl_${milestone}` as FunnelEvent);
        if (milestone === 50) trackPixelCustom("VSL50");
      }
    }
  };

  return (
    <div className="relative aspect-video overflow-hidden rounded-md bg-black">
      <video
        ref={video}
        playsInline
        loop={!withSound}
        preload="metadata"
        poster={poster || undefined}
        onTimeUpdate={onTimeUpdate}
        className="h-full w-full object-cover"
      >
        <source src={src} type="video/mp4" />
        {captions ? <track kind="captions" src={captions} srcLang="en" label="English" default /> : null}
      </video>
      {withSound ? null : (
        <button
          type="button"
          onClick={playWithSound}
          className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/25"
        >
          <span className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 font-semibold text-primary-foreground shadow-lg">
            <Volume2 className="h-5 w-5" aria-hidden="true" /> Tap to watch with sound
          </span>
        </button>
      )}
    </div>
  );
}

/**
 * Real footage of a build, looping silently in place of a VSL. Cheaper than
 * the GIF it came from (150 KB, not 1.5 MB) and still for reduced motion.
 */
function WorkClip() {
  const video = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.muted = true;
    element.setAttribute("muted", "");
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) element.play().catch(() => {});
  }, []);

  return (
    <figure>
      <video
        ref={video}
        playsInline
        loop
        preload="metadata"
        poster="/assets/work/xero-reconcile-poster.webp"
        width={900}
        height={506}
        aria-label="Claude matching a $4,500 bank line to two bills in Xero, then ticking it off"
        className="h-auto w-full rounded-md border bg-black"
      >
        <source src="/assets/work/xero-reconcile.webm" type="video/webm" />
        <source src="/assets/work/xero-reconcile.mp4" type="video/mp4" />
      </video>
      <figcaption className="mt-2 text-[0.8125rem] text-muted-foreground">
        Real footage: Claude reconciling a bank line in Xero (Xero&apos;s demo company). This is the
        kind of thing we find on call one.
      </figcaption>
    </figure>
  );
}

function VslPlaceholder() {
  return (
    <div className="flex aspect-video flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-primary/60 bg-card px-6 text-center">
      <span className="font-serif text-xl font-semibold">Your VSL goes here</span>
      <span className="text-sm text-muted-foreground">
        Preview only. Set <code>vsl.src</code> in src/config.ts and it replaces this box.
      </span>
    </div>
  );
}

const REVIEWS = [
  {
    src: "/assets/review-moushumi.jpg",
    width: 767,
    height: 301,
    alt: "LinkedIn review from Moushumi Sikand, CFO for Purpose-Driven Businesses, rated 5.0 stars: Daniel is very knowledgeable and passionate about providing great outcomes when it comes to automations and efficiency projects leveraging technology and AI. Strongly recommend.",
  },
  {
    src: "/assets/review-justin.jpg",
    width: 766,
    height: 294,
    alt: "LinkedIn review from Justin Rigby, Consultant, Corrosion Technologist and Senior Coatings Inspector, rated 5.0 stars: Daniel has a great grasp on task management and how automation can be achieved. He is helpful and inquisitive, I expect he will soon be an industry leader. Grab him now while he is still available.",
  },
  {
    src: "/assets/review-craig.jpg",
    width: 764,
    height: 342,
    alt: "LinkedIn review from Craig Whitton, Consulting CFO at Real Balance Business Consulting, rated 5.0 stars: Incredibly knowledgeable about apps and development. Has a clear strategic foresight of the project, not just its development. Easy to talk with and communicates tech matters in an easy to understand manner. Thanks mate for your support.",
  },
];

/** Swipeable row that moves on its own every few seconds until it's touched. */
function Reviews() {
  const scroller = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const element = scroller.current;
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let tookOver = false;
    const stop = () => {
      tookOver = true;
    };
    const events = ["pointerdown", "wheel", "touchstart", "focusin"] as const;
    for (const name of events) element.addEventListener(name, stop, { passive: true });
    const timer = window.setInterval(() => {
      if (tookOver) return;
      const card = element.querySelector<HTMLElement>("[data-review]");
      if (!card) return;
      const step = card.offsetWidth + 16;
      const max = element.scrollWidth - element.clientWidth;
      const next = element.scrollLeft + step;
      element.scrollTo({ left: next > max + 8 ? 0 : Math.min(next, max), behavior: "smooth" });
    }, 4000);
    return () => {
      window.clearInterval(timer);
      for (const name of events) element.removeEventListener(name, stop);
    };
  }, []);

  return (
    <div
      ref={scroller}
      className="flex snap-x snap-mandatory items-start gap-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {REVIEWS.map((review) => (
        <img
          key={review.src}
          data-review
          src={review.src}
          width={review.width}
          height={review.height}
          alt={review.alt}
          loading="lazy"
          className="h-auto w-[85%] shrink-0 snap-start rounded-md border bg-white sm:w-[320px]"
        />
      ))}
    </div>
  );
}

/**
 * Mobile-only bar that keeps "Book" one tap away once the hero button has
 * scrolled off, and gets out of the way when the calendar is on screen.
 */
function StickyCta({
  heroCta,
  booking,
  onClick,
}: {
  heroCta: React.RefObject<HTMLAnchorElement | null>;
  booking: React.RefObject<HTMLElement | null>;
  onClick: () => void;
}) {
  const [heroVisible, setHeroVisible] = React.useState(true);
  const [bookingVisible, setBookingVisible] = React.useState(false);

  React.useEffect(() => {
    const hero = heroCta.current;
    const calendar = booking.current;
    if (!hero || !calendar || !("IntersectionObserver" in window)) return;
    const heroWatch = new IntersectionObserver(([entry]) => setHeroVisible(entry.isIntersecting));
    const calendarWatch = new IntersectionObserver(([entry]) => setBookingVisible(entry.isIntersecting));
    heroWatch.observe(hero);
    calendarWatch.observe(calendar);
    return () => {
      heroWatch.disconnect();
      calendarWatch.disconnect();
    };
  }, [heroCta, booking]);

  const show = !heroVisible && !bookingVisible;
  return (
    <div
      aria-hidden={!show}
      className={cn(
        "fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur transition-transform duration-200 sm:hidden",
        show ? "translate-y-0" : "pointer-events-none translate-y-full",
      )}
    >
      <CtaLink href="#book" onClick={onClick} tabIndex={show ? 0 : -1}>
        Book my free call <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </CtaLink>
    </div>
  );
}

mountPage(SprintPage);
