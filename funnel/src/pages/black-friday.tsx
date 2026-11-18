import "../index.css";

import * as React from "react";
import { ArrowRight, Check, FolderOpen, GraduationCap, MessagesSquare, Star, Video } from "lucide-react";

import { CtaLink, PageColumn, SiteFooter, SiteHeader, mountPage } from "@/components/site";
import { LinkedInMark } from "@/components/linkedin-mark";
import { config } from "@/config";
import { attribution, currentState } from "@/lib/funnel";
import { initPixel, trackPixelCustom } from "@/lib/pixel";
import { cn } from "@/lib/utils";

/*
 * The Black Friday offer page: The Rollout Workshop, three months for $999.
 * The emails and texts link here, and Daniel shares it on sales calls, so the
 * top of the page is the whole offer: what you get, the price, the deadline.
 *
 * Everything that changes (the Stripe link, the deadline, when the portal
 * opens) lives in config.blackFriday. With no Stripe link the buttons book a
 * free call instead, and once the deadline passes the page says so and stops
 * offering the price.
 */

const offer = config.blackFriday;

function BlackFridayPage() {
  const state = React.useMemo(() => currentState(), []);
  const heroCta = React.useRef<HTMLAnchorElement>(null);
  const priceCard = React.useRef<HTMLElement>(null);
  const remaining = useCountdown(offer.endsAt);
  const ended = remaining === null;

  React.useEffect(() => {
    initPixel({ email: state.email, firstName: state.name, phone: state.phone });
    trackPixelCustom("BlackFridayView");
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
  const onCta = () => trackPixelCustom(canPay ? "BlackFridayCheckout" : "BlackFridayCall");

  return (
    <>
      <PageColumn className="sm:max-w-[960px]">
        <SiteHeader />

        {/* Hero: the whole offer in one screen, for sharing on a call */}
        <section className="mt-9 sm:mt-12">
          <DeadlinePill ended={ended} remaining={remaining} />
          <h1 className="mt-4 text-[2rem] font-bold sm:max-w-[44rem] sm:text-[3rem]">
            What could you build in 3 months?
          </h1>
          <p className="mt-3 text-muted-foreground sm:max-w-[38rem] sm:text-lg">
            <strong className="text-foreground">The Rollout Workshop</strong> is 1-on-1 Claude coaching
            with me, plus a members&apos; portal with the courses, prompts and templates. We pick the
            job that eats your week, build it on your own files, and you learn to build the next one.
          </p>

          <Price ended={ended} className="mt-6" />

          <div className="mt-5">
            <CtaLink ref={heroCta} href={cta.href} onClick={onCta}>
              {cta.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </CtaLink>
            <p className="mt-2.5 text-sm text-muted-foreground">
              {ended ? (
                <>The Black Friday price has ended. Coaching is {offer.after}.</>
              ) : (
                <>
                  Paid once, at checkout <Dot /> From Saturday it&apos;s {offer.after}
                </>
              )}
            </p>
            {canPay ? (
              <p className="mt-3 text-[0.9375rem]">
                Want to talk first?{" "}
                <a href={callHref} className="underline decoration-primary underline-offset-4 hover:text-primary">
                  Book a free 30-minute call
                </a>
              </p>
            ) : null}
          </div>
        </section>

        {/* What you get */}
        <section className="mt-12">
          <SectionHeading>Here&apos;s what you get</SectionHeading>
          <div className="grid gap-3 sm:grid-cols-2">
            {INCLUDED.map((item) => (
              <div key={item.title} className="flex gap-4 rounded-md border bg-card px-4 py-4">
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-foreground"
                >
                  <item.icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-sans text-base font-semibold tracking-normal">{item.title}</h3>
                  <p className="mt-1 text-[0.9375rem] text-muted-foreground">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 rounded-md border-l-[3px] border-primary bg-card px-4 py-3 text-[0.9375rem]">
            <strong>Your calls start as soon as you book.</strong> Portal logins go out on{" "}
            {offer.portalOpens}.
          </p>
        </section>

        {/* Results: one big number each */}
        <section className="mt-14">
          <SectionHeading>What three months has done for other businesses</SectionHeading>
          <p className="mb-5 max-w-[44rem] text-muted-foreground">
            Real results from people I work with, and one of my own.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {RESULTS.map((result, index) => (
              <ResultCard
                key={result.number}
                result={result}
                // An odd one out at the end gets the full row.
                wide={index === RESULTS.length - 1 && RESULTS.length % 2 === 1}
              />
            ))}
          </div>
          <p className="mt-5 max-w-[44rem] text-[0.9375rem] text-muted-foreground">
            Your numbers won&apos;t be these numbers. You&apos;ll have your own. And none of it was
            instant: the first proposal Claude drafted for me had a hosting cost that had nothing to do
            with our real one. It only knows what you give it. Fixing that is what the calls are for.
          </p>
        </section>

        {/* In their words */}
        <section className="mt-14">
          <SectionHeading>In their words</SectionHeading>
          <p className="mb-5 flex items-center gap-2 text-sm">
            <Stars /> <strong>5.0</strong>
            <span className="text-muted-foreground">from client reviews on LinkedIn</span>
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {REVIEWS.map((review) => (
              <ReviewCard key={review.name} review={review} />
            ))}
          </div>
        </section>

        {/* How the three months go */}
        <section className="mt-14">
          <SectionHeading>How the 3 months go</SectionHeading>
          <ol className="space-y-3">
            {MONTHS.map((step, index) => (
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
        </section>

        {/* The price, said plainly */}
        <section ref={priceCard} id="offer" className="mt-14 scroll-mt-6">
          <SectionHeading>The Rollout Workshop, three months</SectionHeading>
          <div className="grid rounded-md border-2 border-primary bg-card px-5 py-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-x-10 sm:px-7 sm:py-7">
            <div>
              <Eyebrow>{ended ? "Black Friday has ended" : `Black Friday · ends ${offer.endsShort}`}</Eyebrow>
              <Price ended={ended} className="mt-2" />
            </div>
            <ul className="mt-4 mb-5 space-y-2 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:my-0">
              {INCLUDED.map((item) => (
                <li key={item.title} className="flex gap-3 text-[0.9375rem]">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <span>
                    <strong>{item.title}.</strong> {item.short}
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
                  <>Coaching is {offer.after}.</>
                ) : (
                  <>
                    Paid once <Dot /> Nothing renews on its own
                  </>
                )}
              </p>
            </div>
          </div>

          <h3 className="mt-8 mb-3 text-xl font-semibold">What happens after you pay</h3>
          <ol className="grid gap-3 sm:grid-cols-3">
            {AFTER.map((step, index) => (
              <li key={step.title} className="rounded-md border bg-card px-4 py-4">
                <Eyebrow>Step {index + 1}</Eyebrow>
                <strong className="mt-1 block">{step.title}</strong>
                <span className="mt-1 block text-[0.9375rem] text-muted-foreground">{step.body}</span>
              </li>
            ))}
          </ol>
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
          <SectionHeading>Three months from now, that job can still be on your desk</SectionHeading>
          <p className="mx-auto mb-5 max-w-[34rem] text-muted-foreground">
            Or Claude can be doing it, and you&apos;ll know how to build the next one.
          </p>
          <CtaLink href={cta.href} onClick={onCta}>
            {cta.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </CtaLink>
          <p className="mt-2.5 text-sm text-muted-foreground">
            {ended ? <>Coaching is {offer.after}.</> : <>Ends {offer.endsLabel}. Then it&apos;s {offer.after}.</>}
          </p>
        </section>
      </PageColumn>

      <SiteFooter />
      <StickyCta heroCta={heroCta} priceCard={priceCard} href={cta.href} label={cta.label} onClick={onCta} />
    </>
  );
}

const INCLUDED = [
  {
    icon: Video,
    title: "A 1-on-1 call with me every month",
    body: "You share your screen and we build on your own files. Three calls over the three months.",
    short: "You share your screen and we build on your own files.",
  },
  {
    icon: MessagesSquare,
    title: "Questions answered between calls",
    body: "Stuck on something? Ask in the portal. We research it and reply.",
    short: "Ask in the portal and we research it and reply.",
  },
  {
    icon: FolderOpen,
    title: "Our skills, prompts and templates",
    body: "The ones we use with clients, ready to copy into your own Claude account.",
    short: "Ready to copy into your own Claude account.",
  },
  {
    icon: GraduationCap,
    title: "The courses",
    body: "Claude 101 and Claude + Xero, step by step, with every prompt ready to copy.",
    short: "Claude 101 and Claude + Xero, step by step.",
  },
];

type Result = {
  who: string;
  number: string;
  lines: string[];
  image?: { src: string; width: number; height: number; alt: string };
  bars?: { label: string; value: string; share: number; muted?: boolean }[];
};

const RESULTS: Result[] = [
  {
    who: "A truck builder in Perth",
    number: "$75,000 freed up in working capital",
    lines: [
      "They connected Xero and their other systems to Claude, and asked what it would change.",
      "It found they were ordering axles the day a job was signed. The axle is the last part to go on the truck. They order later now.",
    ],
  },
  {
    who: "Shaun, a bookkeeper in Sydney",
    number: "11 hours a month back",
    lines: ["Reimbursements, bank recs and month-end, with Shaun checking everything before it posts."],
    bars: [
      { label: "By hand", value: "15 hrs a month", share: 100, muted: true },
      { label: "With Claude", value: "3.5 hrs a month", share: 23 },
    ],
  },
  {
    who: "Glen, an architect in Melbourne",
    number: "No more agency bill",
    lines: [
      "He was paying an agency more than a thousand dollars a month for ads that weren't working.",
      "He runs them himself now. Claude makes the ads from his own photos and checks the results every morning.",
    ],
  },
  {
    who: "A client who sends five proposals a week",
    number: "A proposal in 30 minutes, not 2 hours",
    lines: [
      "Record the call. Claude reads it, pulls the closest past proposals and writes the draft.",
      "You read it and press send.",
    ],
  },
  {
    who: "Real Balance, accounting and CFO advisory",
    number: "3 hours back per client, every month",
    lines: [
      "A live Xero dashboard for every client, with an AI that answers their questions about their own numbers.",
    ],
    image: {
      src: "/assets/work/realbalance-dashboard.webp",
      width: 900,
      height: 816,
      alt: "Real Balance's client dashboard: revenue, expenses, net profit and cash at bank.",
    },
  },
  {
    who: "Moushumi, Ethical CFO",
    number: "5 years of bank lines, reconciled",
    lines: [
      "Claude codes each bank line and writes down why. A bookkeeper approves every page.",
      "The right invoice turns up in seconds, where it used to take an afternoon.",
    ],
    image: {
      src: "/assets/work/ethicalcfo-xero.webp",
      width: 800,
      height: 446,
      alt: "Claude running beside Xero's bank reconciliation screen.",
    },
  },
  {
    who: "Me",
    number: "0 to 2,000 Instagram followers",
    lines: [
      "I'm one person. The Rollout's Reels run on three tools: Claude, Higgsfield and a scheduler.",
      "Claude writes the scripts, makes the videos, posts them everywhere and learns from the results. In one 30-day stretch that was 70,000 views.",
    ],
  },
];

type Review = { name: string; role: string; photo?: string; quote: string; date: string };

// Word for word from their LinkedIn recommendations.
const REVIEWS: Review[] = [
  {
    name: "Shaun Rafferty",
    role: "First Class Accounts",
    quote:
      "Dan Hay and Phlo have changed how I run my bookkeeping practice. Dan taught me to automate real workflows with Claude and other tools, starting with employee reimbursements, then monthly reporting, BAS prep and reconciliations. He's practical, patient and explains things in plain English, so you understand what you've built. I'm now getting hours back every week. If you're an accountant, bookkeeper or business owner keen to put AI to work, I can't recommend Dan highly enough.",
    date: "November 15, 2026",
  },
  {
    name: "Moushumi Sikand",
    role: "Ethical CFO · Xero Sole Practitioner of the Year",
    photo: "/assets/reviewer-moushumi.webp",
    quote:
      "Daniel is very knowledgeable and passionate about providing great outcomes when it comes to automations and efficiency projects leveraging technology and Ai. Strongly recommend.",
    date: "May 19, 2026",
  },
  {
    name: "Craig Whitton",
    role: "Managing Director, Real Balance",
    photo: "/assets/reviewer-craig.webp",
    quote:
      "Incredibly knowledgeable about apps and development. Has a clear strategic foresight of the project, not just its development. Easy to talk with and communicates tech matters in an easy to understand manner. Thanks mate for your support",
    date: "January 24, 2026",
  },
];

const MONTHS = [
  {
    title: "Month one: your first job, working",
    body: "We pick the job that eats your week and build it together on your own files, on test data first.",
  },
  {
    title: "Month two: the next jobs, with you driving",
    body: "You share your screen and build while I steer.",
  },
  {
    title: "Month three: building on your own",
    body: "You bring the jobs you've started and I help you finish them.",
  },
];

const AFTER = [
  { title: "Book your first call", body: "The page after checkout has my calendar. Pick a time that suits." },
  { title: "We start on your first job", body: "Bring the one job you'd most like to never do again." },
  {
    title: `Portal login on ${offer.portalOpens}`,
    body: "The courses, prompts and templates, sent to the email you paid with.",
  },
];

const FAQS = [
  {
    q: "Is the portal open now?",
    a: `Not yet. Logins go out on ${offer.portalOpens}. Your 1-on-1 calls don't wait for it: book the first one as soon as you've paid.`,
  },
  {
    q: "What happens after the three months?",
    a: `The ${offer.price} is paid once and nothing renews on its own. If you want to keep going, it's ${offer.after}.`,
  },
  {
    q: "Who's on the calls?",
    a: "Me, Daniel. Not a sales rep, and not a group webinar.",
  },
  {
    q: "Do I need to be technical?",
    a: "No. If you can share your screen and describe how you do a job today, that's enough.",
  },
  {
    q: "Is my data safe?",
    a: "Claude gets its own limited login to each system, can't approve anything, and every action is logged. We start on test data, like Xero's demo company, before touching anything real.",
  },
  {
    q: "I don't use Xero. Is it still for me?",
    a: "Yes. Glen's an architect and his first job was Meta ads. We start with whatever eats your week.",
  },
];

/** The time left until `endsAt`, updated every half minute; null once it has passed. */
function useCountdown(endsAt: string) {
  const end = React.useMemo(() => new Date(endsAt).getTime(), [endsAt]);
  const read = React.useCallback(() => {
    const ms = end - Date.now();
    return ms > 0 ? ms : null;
  }, [end]);
  const [remaining, setRemaining] = React.useState(read);

  React.useEffect(() => {
    const timer = window.setInterval(() => setRemaining(read()), 30_000);
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

function DeadlinePill({ ended, remaining }: { ended: boolean; remaining: number | null }) {
  return (
    <p className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border border-primary bg-card px-3.5 py-2 text-[0.8125rem] font-semibold tracking-wide uppercase sm:rounded-full sm:py-1.5">
      <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
      {ended ? (
        "The Black Friday price has ended"
      ) : (
        <>
          Black Friday <span className="font-normal normal-case text-muted-foreground">ends {offer.endsLabel}</span>
          {remaining !== null ? <span className="text-primary normal-case">{formatRemaining(remaining)}</span> : null}
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
    </p>
  );
}

function ResultCard({ result, wide = false }: { result: Result; wide?: boolean }) {
  return (
    <article className={cn("flex flex-col rounded-md border bg-card px-4 py-4 sm:px-5 sm:py-5", wide && "sm:col-span-2")}>
      <Eyebrow>{result.who}</Eyebrow>
      <h3 className="mt-1.5 text-[1.625rem] font-bold sm:text-[1.875rem]">{result.number}</h3>
      {result.lines.map((line) => (
        <p key={line} className="mt-2 text-[0.9375rem] text-muted-foreground">
          {line}
        </p>
      ))}
      {result.bars ? (
        <dl className="mt-4 space-y-2.5">
          {result.bars.map((bar) => (
            <div key={bar.label}>
              <dt className="flex justify-between text-[0.8125rem] font-semibold">
                {bar.label} <span>{bar.value}</span>
              </dt>
              <dd className="mt-1 h-3 rounded-full bg-accent">
                <span
                  className={cn("block h-3 rounded-full", bar.muted ? "bg-subtle-foreground/50" : "bg-primary")}
                  style={{ width: `${bar.share}%` }}
                />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {result.image ? (
        <img
          src={result.image.src}
          alt={result.image.alt}
          width={result.image.width}
          height={result.image.height}
          loading="lazy"
          className="mt-4 max-h-56 w-full rounded-md border object-cover object-top"
        />
      ) : null}
    </article>
  );
}

function ReviewCard({ review }: { review: Review }) {
  return (
    <figure className="flex flex-col rounded-md border bg-card px-4 py-4">
      <figcaption className="flex gap-3">
        <Avatar name={review.name} photo={review.photo} />
        <span className="min-w-0">
          <strong className="block text-[0.9375rem] leading-snug">{review.name}</strong>
          <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">{review.role}</span>
        </span>
      </figcaption>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Stars /> <strong className="text-foreground">5.0</strong> &middot; {review.date}
      </p>
      <blockquote className="mt-2 flex-1 text-[0.9375rem] leading-relaxed">&ldquo;{review.quote}&rdquo;</blockquote>
      <p className="mt-3 flex items-center gap-1.5 border-t pt-2.5 text-xs text-muted-foreground">
        <LinkedInMark /> Recommendation on LinkedIn
      </p>
    </figure>
  );
}

/** The reviewer's photo, or their initials until we have one. */
function Avatar({ name, photo }: { name: string; photo?: string }) {
  if (photo) {
    return <img src={photo} alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-full object-cover" />;
  }
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden="true"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground"
    >
      {initials}
    </span>
  );
}

function Stars() {
  return (
    <span className="inline-flex text-primary" role="img" aria-label="5 out of 5 stars">
      {Array.from({ length: 5 }, (_, index) => (
        <Star key={index} className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
      ))}
    </span>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3.5 text-2xl font-bold sm:text-[1.75rem]">{children}</h2>;
}

/** The small letter-spaced label above a heading. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold tracking-[0.08em] text-primary-hover uppercase">{children}</p>;
}

function Dot() {
  return (
    <span className="mx-1 text-primary" aria-hidden="true">
      &middot;
    </span>
  );
}

/** Add tracking tags to a link without dropping the ones it already has. */
function withParams(href: string, params: Record<string, string>) {
  const url = new URL(href, window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  }
  return url.origin === window.location.origin ? `${url.pathname}${url.search}` : url.toString();
}

/** On phones, the button follows you down the page between the hero and the price card. */
function StickyCta({
  heroCta,
  priceCard,
  href,
  label,
  onClick,
}: {
  heroCta: React.RefObject<HTMLAnchorElement | null>;
  priceCard: React.RefObject<HTMLElement | null>;
  href: string;
  label: string;
  onClick: () => void;
}) {
  const [heroVisible, setHeroVisible] = React.useState(true);
  const [cardVisible, setCardVisible] = React.useState(false);

  React.useEffect(() => {
    const hero = heroCta.current;
    const card = priceCard.current;
    if (!hero || !card || !("IntersectionObserver" in window)) return;
    const heroWatch = new IntersectionObserver(([entry]) => setHeroVisible(entry.isIntersecting));
    const cardWatch = new IntersectionObserver(([entry]) => setCardVisible(entry.isIntersecting));
    heroWatch.observe(hero);
    cardWatch.observe(card);
    return () => {
      heroWatch.disconnect();
      cardWatch.disconnect();
    };
  }, [heroCta, priceCard]);

  const show = !heroVisible && !cardVisible;
  return (
    <div
      aria-hidden={!show}
      className={cn(
        "fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur transition-transform duration-200 sm:hidden",
        show ? "translate-y-0" : "pointer-events-none translate-y-full",
      )}
    >
      <CtaLink href={href} onClick={onClick} tabIndex={show ? 0 : -1}>
        {label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </CtaLink>
    </div>
  );
}

mountPage(BlackFridayPage);
