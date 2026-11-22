import "../index.css";

import * as React from "react";
import { ArrowRight, Check } from "lucide-react";

import { ProjectGrid, REVIEW_COUNT, Stars } from "@/components/projects";
import { CtaLink, PageColumn, SiteFooter, SiteHeader, mountPage } from "@/components/site";
import { config } from "@/config";
import { attribution, currentState } from "@/lib/funnel";
import { initPixel, trackPixel, trackPixelCustom } from "@/lib/pixel";
import { cn } from "@/lib/utils";

/*
 * The Black Friday offer page: The Rollout Workshop, three months for $999.
 * The emails and texts link here, and Daniel shares it on sales calls.
 *
 * It is /sprint's shape with a different ask: the deal as the headline, the
 * same grid of builds and reviews as the proof, then the offer block at the
 * bottom with the button.
 *
 * Everything that changes (the Stripe link, the deadline, when the courses
 * open) lives in config.blackFriday. With no Stripe link the button books a
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
  const jumpLabel = ended ? "See what's included" : "Get the Black Friday price";

  return (
    <>
      {/* As wide as /sprint, so the project grid gets two real columns. */}
      <PageColumn className="sm:max-w-[960px]">
        <SiteHeader />

        {/* The deal is the headline, with the offer box beside it */}
        <section className="mt-9 grid gap-6 sm:mt-12 sm:grid-cols-[minmax(0,1fr)_21rem] sm:items-center sm:gap-10">
          <div>
            <DeadlinePill ended={ended} />
            <h1 className="mt-4 text-[2rem] font-bold sm:text-[3rem]">
              The Rollout Workshop: 3 months for {ended ? "$1,500" : "$999"}
            </h1>
            <p className="mt-3 text-muted-foreground sm:text-lg">
              It&apos;s like a tutor, but for AI in your business. You get 3 one-hour video calls with me,
              one a month. On each call you pick one boring job, we share screens, and we set Claude up
              to do it on your own files.
            </p>
          </div>

          {/* The offer box: price, time left and the button in one place */}
          <div className="rounded-md border-2 border-primary bg-card px-5 py-5">
            <Price ended={ended} />
            {remaining !== null ? <Clock remaining={remaining} className="mt-4" /> : null}
            <CtaLink ref={heroCta} href={cta.href} onClick={onCta} className="mt-4 px-4 sm:w-full">
              {cta.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </CtaLink>
            <p className="mt-2.5 text-sm text-muted-foreground">
              {ended ? (
                <>The Black Friday price has ended. Tutoring is {offer.after}.</>
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
        </section>

        {/* The same proof as /sprint: every build, in the client's own words */}
        <section className="mt-12">
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

        {/* The offer, at the bottom */}
        <section ref={offerBlock} id="offer" className="mt-14 scroll-mt-6">
          <SectionHeading>Let me automate boring tasks in your business</SectionHeading>
          <div className="grid rounded-md border-2 border-primary bg-card px-5 py-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-x-10 sm:px-7 sm:py-7">
            <div>
              <Eyebrow>{ended ? "Black Friday has ended" : `Black Friday · ends ${offer.endsShort}`}</Eyebrow>
              <p className="mt-1.5 font-serif text-xl font-bold">The Rollout Workshop</p>
              <Price ended={ended} className="mt-3" />
            </div>
            <ul className="mt-4 mb-5 space-y-2.5 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:my-0">
              {INCLUDED.map((item) => (
                <li key={item.title} className="flex gap-3 text-[0.9375rem]">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <span>
                    <strong>{item.title}.</strong> <span className="text-muted-foreground">{item.body}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="sm:col-start-1 sm:row-start-2 sm:self-end">
              <CtaLink href={cta.href} onClick={onCta}>
                {cta.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </CtaLink>
              <p className="mt-2.5 text-sm text-muted-foreground">
                {ended ? (
                  <>Tutoring is {offer.after}.</>
                ) : (
                  <>
                    Paid once at checkout.{" "}
                    <span className="block">From Saturday it&apos;s {offer.was}.</span>
                  </>
                )}
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

        {/* The three questions people actually ask */}
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
      <StickyCta heroCta={heroCta} offerBlock={offerBlock} label={jumpLabel} />
    </>
  );
}

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

function formatRemaining(ms: number) {
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes % 60}m left`;
  return `${Math.max(minutes, 1)}m left`;
}

/** The time left, as four small boxes. */
function Clock({ remaining, className }: { remaining: number; className?: string }) {
  const seconds = Math.floor(remaining / 1000);
  const parts = [
    { value: Math.floor(seconds / 86_400), label: "days" },
    { value: Math.floor((seconds % 86_400) / 3600), label: "hours" },
    { value: Math.floor((seconds % 3600) / 60), label: "mins" },
    { value: seconds % 60, label: "secs" },
  ];
  return (
    <div className={cn("grid grid-cols-4 gap-2", className)} role="timer" aria-label={formatRemaining(remaining)}>
      {parts.map((part) => (
        <div key={part.label} className="rounded-md bg-accent px-1 py-2 text-center">
          <span className="block font-serif text-2xl leading-none font-bold tabular-nums">
            {String(part.value).padStart(2, "0")}
          </span>
          <span className="mt-1 block text-[0.6875rem] tracking-wide text-muted-foreground uppercase">{part.label}</span>
        </div>
      ))}
    </div>
  );
}

function DeadlinePill({ ended }: { ended: boolean }) {
  return (
    <p className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border border-primary bg-card px-3.5 py-2 text-[0.8125rem] font-semibold tracking-wide uppercase sm:rounded-full sm:py-1.5">
      <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
      {ended ? (
        "The Black Friday price has ended"
      ) : (
        <>
          Black Friday <span className="font-normal normal-case text-muted-foreground">ends {offer.endsLabel}</span>
        </>
      )}
    </p>
  );
}

function Price({ ended, className }: { ended: boolean; className?: string }) {
  if (ended) {
    return (
      <p className={cn("font-serif text-4xl leading-none font-bold", className)}>
        $500 <span className="font-sans text-base font-normal text-muted-foreground">+ GST a month</span>
      </p>
    );
  }
  return (
    <p className={cn("flex flex-wrap items-baseline gap-x-3 gap-y-1", className)}>
      <span className="text-xl text-subtle-foreground line-through">{offer.was}</span>
      <span className="font-serif text-[2.75rem] leading-none font-bold">{offer.price.replace(" + GST", "")}</span>
      <span className="text-muted-foreground">+ GST for 3 months</span>
      <span className="basis-full text-sm font-semibold text-primary-hover">Save {offer.saving}</span>
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

/** On phones, a button that jumps to the offer while they're reading the reviews. */
function StickyCta({
  heroCta,
  offerBlock,
  label,
}: {
  heroCta: React.RefObject<HTMLAnchorElement | null>;
  offerBlock: React.RefObject<HTMLElement | null>;
  label: string;
}) {
  const [heroVisible, setHeroVisible] = React.useState(true);
  const [offerVisible, setOfferVisible] = React.useState(false);

  React.useEffect(() => {
    const hero = heroCta.current;
    const block = offerBlock.current;
    if (!hero || !block || !("IntersectionObserver" in window)) return;
    const heroWatch = new IntersectionObserver(([entry]) => setHeroVisible(entry.isIntersecting));
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
        "fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur transition-transform duration-200 sm:hidden",
        show ? "translate-y-0" : "pointer-events-none translate-y-full",
      )}
    >
      <CtaLink href="#offer" tabIndex={show ? 0 : -1}>
        {label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </CtaLink>
    </div>
  );
}

mountPage(BlackFridayPage);
