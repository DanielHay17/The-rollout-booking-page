import "../index.css";

import * as React from "react";
import { ArrowRight, Check, Star, Volume2, X } from "lucide-react";

import type { AiStage, Bottleneck } from "@shared/survey";
import { CtaLink, PageColumn, SiteFooter, SiteHeader, mountPage } from "@/components/site";
import { LinkedInMark } from "@/components/linkedin-mark";
import { config } from "@/config";
import { attribution, currentState, sendEvent, type FunnelEvent, type FunnelState } from "@/lib/funnel";
import { initPixel, trackPixelCustom } from "@/lib/pixel";
import { cn } from "@/lib/utils";

/*
 * Step 3: the VSL and the calendar. Personalised from the survey (or from
 * ?name=&stage=&email= on links from emails), and it works without the VSL:
 * until config.vsl.src is set, real footage of a build plays in its place.
 *
 * The offer is AI tutoring: a free 30-minute call, then two 1-on-1 calls a
 * month with Daniel for $300. The price is on the page on purpose, so nobody
 * is surprised by it on the call.
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
  // ?preview also shows the empty slots in the project grid (photos, reviews).
  const preview = previewVsl || import.meta.env.DEV;
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
    ? `Let's get Claude doing your ${area}, starting this month.`
    : "Get Claude doing the job that eats your week, starting this month.";
  const stageNote = state.stage ? `${STAGE_NOTES[state.stage]} ` : "";

  const onBookClick = () => sendEvent("book_click");

  return (
    <>
      {/* Wider than the other pages on desktop so the project grid gets two
          real columns; running text keeps its own max widths below. */}
      <PageColumn className="sm:max-w-[960px]">
        <SiteHeader />

        {/* Hero */}
        <section className="mt-9 sm:mt-12">
          <p className="mb-2.5 font-medium sm:text-lg">{eyebrow}</p>
          <h1 className="text-[1.875rem] font-bold sm:max-w-[46rem] sm:text-[2.625rem]">{headline}</h1>
          {showVsl ? (
            // The video explains the tutoring, so keep it high on the screen:
            // just the one personal line between the headline and play.
            stageNote ? (
              <p className="mt-3 text-muted-foreground sm:text-lg">{stageNote.trim()}</p>
            ) : null
          ) : (
            <>
              <p className="mt-3 text-muted-foreground sm:max-w-[34rem] sm:text-lg">
                {stageNote}
                <strong className="text-foreground">
                  If your kids have ever had a tutor, it&apos;s like that, for AI.
                </strong>{" "}
                I tutor business owners, accountants and operations teams on the back-office admin,
                reporting and scheduling that eats their week. Two 1-on-1 calls a month with me: we
                build it together on your own files, and you learn to do the next one yourself.
              </p>
              <ul className="mt-4 space-y-1.5">
                {[
                  "No coding, and no developer to hire",
                  "No paying an agency thousands for a build",
                  "Nothing goes live without your OK",
                ].map((item) => (
                  <li key={item} className="flex gap-2.5 text-[0.9375rem]">
                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </>
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
            <p className="mt-3 text-[0.8125rem] text-muted-foreground">
              As featured in{" "}
              <span className="font-serif font-bold whitespace-nowrap text-foreground uppercase tracking-wide">
                The Australian Business Journal
              </span>
            </p>
          </div>

          <div className="mt-6">
            <CtaLink ref={heroCta} href="#book" onClick={onBookClick}>
              Book my free call <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </CtaLink>
            <p className="mt-2.5 text-sm text-muted-foreground">
              Free 30-minute call <Dot /> Then two 1-on-1 calls a month with me, $300 <Dot /> Cancel
              any time
            </p>
          </div>

          <p className="mt-4 text-[0.8125rem] text-muted-foreground">
            We&apos;re part of the Claude Partner Network, so the first call is free for Rollout readers.
          </p>
        </section>

        {/* The LinkedIn reviews, right before the ask */}
        <section className="mt-10" aria-label="Reviews on LinkedIn">
          <p className="mb-3 flex items-center gap-2 text-sm">
            <Stars small /> <strong>5.0</strong>
            <span className="text-muted-foreground">on LinkedIn</span>
          </p>
          <Reviews />
        </section>

        {/* Booking */}
        <section ref={booking} id="book" className="mt-14 scroll-mt-6">
          <SectionHeading>Book your free call</SectionHeading>
          <p className="mb-6 max-w-[44rem] text-muted-foreground">
            Pick a slot below. I read every response myself, so I&apos;ll know your business before we
            hop on. If a business partner or practice manager makes the call with you, bring them.
          </p>
          <BookingEmbed state={state} />
          <p className="mt-5 text-[0.9375rem] text-muted-foreground">
            <strong className="text-foreground">P.S.</strong> Not sure what to bring? Bring the one job
            you&apos;d most like to never do again.
          </p>
        </section>

        {/* Proof straight after the calendar, for anyone who scrolled past it
            unconvinced: the work itself, number first. Nothing here links
            off the page; the only way on is the calendar. */}
        <section className="mt-14">
          <SectionHeading>What we&apos;ve built for businesses like yours</SectionHeading>
          <p className="mb-5 max-w-[44rem] text-muted-foreground">
            Real builds, from bookkeeping practices to mining sites, in the clients&apos; own words.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {PROJECTS.map((project) => (
              <ProjectCard key={project.title} project={project} preview={preview} />
            ))}
          </div>
        </section>

        {/* How it works, and what they leave with */}
        <section className="mt-14">
          <SectionHeading>Here&apos;s how the tutoring works</SectionHeading>
          <ol className="space-y-3">
            {TUTOR_STEPS.map((step, index) => (
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
          <h3 className="mt-8 mb-3 text-xl font-semibold">What you&apos;ll walk away with from the call</h3>
          <ul className="space-y-2.5">
            {[
              "The one to three jobs I'd get Claude doing in your business first",
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

        {/* Teach one useful thing: why Claude isn't saving them hours yet */}
        <section className="mt-14">
          <SectionHeading>Claude isn&apos;t saving you hours yet because it&apos;s missing three things</SectionHeading>
          <p className="max-w-[44rem] text-[0.9375rem] sm:text-base">
            Most people use Claude like a search box. It works better if you treat it like a very smart
            new starter who knows nothing about your business. It needs <strong>logins</strong> to your
            tools, a <strong>filing cabinet</strong> to look things up in, and{" "}
            <strong>your procedures</strong> written down once. Here&apos;s what that looks like when
            it&apos;s set up:
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-stretch" aria-label="How the system works">
            {SYSTEM_FLOW.map((node, index) => (
              <React.Fragment key={node.title}>
                {index > 0 ? (
                  <span aria-hidden="true" className="self-center font-bold text-primary">
                    <span className="sm:hidden">&darr;</span>
                    <span className="hidden sm:inline">&rarr;</span>
                  </span>
                ) : null}
                <div
                  className={cn(
                    "flex-1 rounded-md border bg-card px-4 py-3 text-sm",
                    index === SYSTEM_FLOW.length - 1 && "border-primary",
                  )}
                >
                  <strong className="block text-[0.9375rem]">{node.title}</strong>
                  <span className="text-muted-foreground">{node.body}</span>
                </div>
              </React.Fragment>
            ))}
          </div>
          <p className="mt-5 max-w-[44rem] text-[0.9375rem] text-muted-foreground">
            Setting it up yourself means picking the right way to connect each system, getting
            permissions right and writing procedures Claude actually follows. It&apos;s easy to get
            wrong and give up, which is why a tutor helps.
          </p>
        </section>

        {/* Sell against the alternatives */}
        <section className="mt-14">
          <SectionHeading>Cheaper than an agency, faster than working it out alone</SectionHeading>
          <div className="grid gap-3 sm:grid-cols-2">
            {ALTERNATIVES.map((option) => (
              <div
                key={option.title}
                className={cn(
                  "rounded-md border bg-card px-4 py-4",
                  option.pick && "border-2 border-primary",
                )}
              >
                <h3 className="font-sans text-base font-semibold tracking-normal">{option.title}</h3>
                <p className={cn("mt-1 text-[0.9375rem]", option.pick ? "text-foreground" : "text-muted-foreground")}>
                  {option.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Who it's for, and who it isn't */}
        <section className="mt-14">
          <SectionHeading>This is for you if you already use AI but it hasn&apos;t saved real hours</SectionHeading>
          <ul className="space-y-2">
            {FIT.map((item) => (
              <li key={item} className="flex gap-3 rounded-md border bg-card px-4 py-3 text-[0.9375rem]">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                {item}
              </li>
            ))}
            <li className="flex gap-3 rounded-md border bg-card px-4 py-3 text-[0.9375rem]">
              <X className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              Not for you if you want it all done for you without being involved. For that, my team at
              Phlo builds it for you.
            </li>
          </ul>
        </section>

        {/* The price, said plainly */}
        <section className="mt-14">
          <SectionHeading>Two 1-on-1 calls a month with me, for $300</SectionHeading>
          <p className="mb-4 text-muted-foreground">If it saves you three hours a month, it&apos;s paid for itself.</p>
          <div className="rounded-md border-2 border-primary bg-card px-5 py-5 sm:max-w-[40rem]">
            <p className="font-serif text-4xl leading-none font-bold">
              $300{" "}
              <span className="font-sans text-base font-normal text-muted-foreground">
                a month, month to month
              </span>
            </p>
            <ul className="mt-4 mb-5 space-y-2">
              {[
                "Two 1-on-1 calls a month with me, screen-sharing your real work",
                "Research between calls on whatever is blocking you",
                "Every skill, prompt and template we build stays in your Claude account",
                "Email questions any time between calls",
                "Guidance on your own ideas, so you don't go down the wrong path",
              ].map((item) => (
                <li key={item} className="flex gap-3 text-[0.9375rem]">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            <CtaLink href="#book" onClick={onBookClick}>
              Book my free call <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </CtaLink>
            <p className="mt-2.5 text-sm text-muted-foreground">
              No lock-in <Dot /> Cancel any time <Dot /> The first call is free
            </p>
          </div>
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
                fixed it. The tutoring is the same thing, pointed straight at your business, and you
                learn how to do it yourself along the way.
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
          <SectionHeading>Bring the one job you&apos;d most like to never do again</SectionHeading>
          <CtaLink href="#book" onClick={onBookClick}>
            Pick a time for your free call <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </CtaLink>
          <p className="mt-2.5 text-sm text-muted-foreground">
            After the call: two 1-on-1 calls a month with me for $300. Cancel any time.
          </p>
        </section>
      </PageColumn>

      <SiteFooter />
      <StickyCta heroCta={heroCta} booking={booking} onClick={onBookClick} />
    </>
  );
}

const FAQS = [
  {
    q: "Why is the first call free?",
    a: "We're part of the Claude Partner Network, and I want more real rollouts to write about in The Rollout. If your business ends up as a case study, that's only ever with your OK.",
  },
  {
    q: "Is this a sales call?",
    a: "Call one is a look at your business and the first job I'd get Claude doing. If tutoring's a fit, I'll explain how it works at the end: two 1-on-1 calls a month for $300, cancel any time. No pressure either way.",
  },
  {
    q: "Who's on the call?",
    a: "Me, Daniel. Not a sales rep.",
  },
  {
    q: "Is my data safe?",
    a: "Claude gets its own limited login to each system, can't approve anything, and every action is logged. We start on test data, like Xero's demo company, before touching anything real.",
  },
  {
    q: "Do I need to be technical?",
    a: "No. If you can share your screen and describe how you do a job today, that's enough.",
  },
  {
    q: "What do I need to prepare?",
    a: "Nothing. I'll have read your answers and looked up your company before we talk. If you like, bring the one job you'd most like to never do again.",
  },
];

const TUTOR_STEPS = [
  {
    title: "A free 30-minute call",
    body: "I'll have read your answers before we talk, so we skip the small talk. You show me the job that eats your week, and I show you what I've built for people doing the same job.",
  },
  {
    title: "Session one: we build it on your files",
    body: "We start on test data, then your real files. You leave with that job working.",
  },
  {
    title: "Every fortnight: a 1-on-1 call on the next job",
    body: "Two calls a month, just you and me. I research between calls and bring back what's worked for other firms. Email me any time in between.",
  },
];

const SYSTEM_FLOW = [
  { title: "Your tools", body: "Xero, your inbox, your job or ERP software, Drive" },
  { title: "Claude + your procedures", body: 'Written once as "skills"' },
  { title: "Work prepared", body: "Bank lines coded, schedules checked, reports drafted" },
  { title: "You approve", body: "Nothing posts without you" },
];

const ALTERNATIVES = [
  {
    title: "Work it out yourself",
    body: "Free, but weeks of YouTube and trial and error, and most people stall before it saves real hours.",
  },
  {
    title: "Hire an agency",
    body: "Usually thousands per build. You don't learn how it works, so you're stuck when something changes.",
  },
  {
    title: "Buy a course or prompt library",
    body: "Generic examples that aren't your processes, and they go out of date as the tools change.",
  },
  {
    title: "AI tutoring",
    body: "Built on your own files, you learn as we go, and it's $300 a month, cancel any time.",
    pick: true,
  },
];

const FIT = [
  "You run a business, or manage its finance, admin or operations",
  "Someone on your team rebuilds the same spreadsheet, report or schedule by hand every week",
  "You've tried ChatGPT or Claude and want it doing actual work",
  "You're happy to share your screen and try things between calls",
];

type ProjectReview = {
  /** Leave out until we have it; the role then stands in for the name. */
  name?: string;
  role: string;
  photo?: string;
  quote: string;
  /** Set for LinkedIn recommendations, which carry a date and stars. */
  linkedin?: { date: string };
};

type Project = {
  client: string;
  who: string;
  title: string;
  detail: string;
  image?: { src: string; width: number; height: number; alt: string };
  review?: ProjectReview;
  /** What's still missing. Only shown with ?preview, so the live page stays clean. */
  todo?: string;
};

/*
 * Every build we can point to, two to a row on desktop. The four with
 * screenshots come first so the rows line up. Quotes are word for word:
 * LinkedIn recommendations, or the testimonials published on phloing.com.
 * Clients we don't yet have permission to name are described, not named.
 * Personal details in screenshots (a name and mobile in Remedy's sheet) are
 * blurred.
 */
const PROJECTS: Project[] = [
  {
    client: "Real Balance",
    who: "accounting and CFO advisory",
    title: "3+ hours saved per client, every month",
    detail:
      "A live Xero dashboard clients log into, plus an AI that answers questions about their numbers in plain English.",
    image: {
      src: "/assets/work/realbalance-dashboard.webp",
      width: 900,
      height: 816,
      alt: "Real Balance's client dashboard: revenue, expenses, net profit and cash at bank, with recent activity and upcoming BAS and tax deadlines.",
    },
    review: {
      name: "Craig Whitton",
      role: "Managing Director, Real Balance",
      photo: "/assets/reviewer-craig.webp",
      quote:
        "Phlo moved our clients from monthly reporting to daily engagement using a live dashboard and an internal AI built on their financial data. It's transformed how clients interact with their numbers.",
    },
  },
  {
    client: "Ethical CFO",
    who: "Xero Sole Practitioner of the Year",
    title: "5 years of bank lines, reconciled in Xero",
    detail:
      "Claude works down the reconciliation screen coding each line and writing the why. A bookkeeper approves every page.",
    image: {
      src: "/assets/work/ethicalcfo-xero.webp",
      width: 800,
      height: 446,
      alt: "Claude running beside Xero's bank reconciliation screen, prompted to work as an experienced Australian bookkeeper.",
    },
    review: {
      name: "Moushumi Sikand",
      role: "CFO for Purpose-Driven Businesses | Winner of Xero Sole Practitioner of the year",
      photo: "/assets/reviewer-moushumi.webp",
      quote:
        "Daniel is very knowledgeable and passionate about providing great outcomes when it comes to automations and efficiency projects leveraging technology and Ai. Strongly recommend.",
      linkedin: { date: "May 19, 2026" },
    },
    todo: "Confirm Moushumi is the right person for Ethical CFO, or swap in who is.",
  },
  {
    client: "Remedy Asset Protection",
    who: "asset inspection, nationwide",
    title: "6 new jobs and 11 changes, caught from one upload",
    detail:
      "The spreadsheet that ran a national inspection team, turned into a live calendar of every inspector and job.",
    image: {
      src: "/assets/work/remedy-before-after.webp",
      width: 1000,
      height: 563,
      alt: "Before and after: a colour-coded roster spreadsheet on the left, the same jobs in Remedy's live inspector calendar on the right.",
    },
    review: {
      name: "Justin Rigby",
      role: "Consultant - Corrosion Technologist & Senior Coatings Inspector (AMPP)",
      photo: "/assets/reviewer-justin.webp",
      quote:
        "Daniel has a great grasp on task management and how automation can be achieved. His is helpful and inquisitive - I expect he will soon be an industry leader. Grab him now while he is still available.",
      linkedin: { date: "May 11, 2026" },
    },
  },
  {
    client: "A Sydney bookkeeping practice",
    who: "Xero bookkeeping",
    title: "40 to 50 expense claims a month, checked for you",
    detail:
      "Claude checks each claim's account and GST, flags the wrong ones and lines the rest up as reimbursements on the next pay run.",
    image: {
      src: "/assets/work/expense-claims.jpg",
      width: 900,
      height: 506,
      alt: "Claude checking staff expense claims in Xero's demo company before they're approved.",
    },
    todo: "Ask Raff for a review, a photo and the OK to name First Class Accounts.",
  },
  {
    client: "Plantman",
    who: "mining equipment, WA",
    title: "An AI command centre across WA mining sites",
    detail:
      "Connects their ERP so procurement and equipment insights surface on their own, without anyone building a report.",
    todo: "Add a review, and a blurred dashboard screenshot (the original is marked Confidential).",
  },
  {
    client: "Hash Financial Group",
    who: "private credit",
    title: "Investor onboarding and KYC, automated",
    detail: "KYC, AML and SMSF investor onboarding for HFG's private credit fund, so deals move faster.",
    review: {
      role: "Head of Operations, Hash Financial Group",
      quote:
        "The system Phlo built streamlined our investor onboarding and internal operations. What used to require manual coordination is now structured, trackable, and far easier to manage.",
    },
    todo: "Add the Head of Operations' name and photo.",
  },
  {
    client: "Hash Financial Group",
    who: "broker network",
    title: "227,000+ brokers, $3.6B in loans settled",
    detail: "A broker marketplace with an AI sales agent behind it.",
    todo: "Add a review.",
  },
  {
    client: "Studyfin",
    who: "fintech for international students",
    title: "Seven products on one platform",
    detail: "A full-stack platform for international students: payments, housing, jobs and savings.",
    review: {
      role: "Founder, Studyfin",
      quote:
        "Phlo has been our development partner from day one, building the platform from the ground up and managing seven distinct products and features with different requirements.",
    },
    todo: "Add the founder's name and photo.",
  },
  {
    client: "Saig",
    who: "enterprise AI",
    title: "Private AI at 80% lower cost",
    detail: "A private AI grid so companies can run large language models on their own infrastructure.",
    todo: "Add a review.",
  },
  {
    client: "Sapien Group",
    who: "renewables",
    title: "AI and automation, delivered to a plan",
    detail: "The architecture and delivery plan for Sapien's AI and automation projects.",
    review: {
      role: "Managing Director, Sapien Group",
      quote:
        "Phlo brings structure and pace to complex AI and automation projects. That makes delivery far more predictable.",
    },
    todo: "Check the project wording, and add the Managing Director's name and photo.",
  },
  {
    client: "A Perth strata management firm",
    who: "strata management",
    title: "Documents that sound like the firm wrote them",
    detail: "A Claude skill that writes reports and letters in the firm's own voice and template.",
    todo: "Ask Peter for a review, a photo and the OK to name Ikon SM.",
  },
  {
    client: "A national car dealership group",
    who: "fleet sales",
    title: "A fleet sales CRM for every dealership",
    detail:
      "Tracks contracts, vehicles sold and follow-ups, so sales teams call fleet customers at the right time.",
    todo: "Ask for a review, and check we can name the group.",
  },
];

function ProjectCard({ project, preview }: { project: Project; preview: boolean }) {
  const { image, review } = project;
  return (
    <article className="flex flex-col overflow-hidden rounded-md border bg-card">
      {image ? (
        <img
          src={image.src}
          width={image.width}
          height={image.height}
          alt={image.alt}
          loading="lazy"
          className="aspect-video h-auto w-full border-b bg-white object-cover object-top"
        />
      ) : preview ? (
        <Slot className="aspect-video rounded-none border-0 border-b-2">Screenshot goes here</Slot>
      ) : null}
      <div className="flex flex-1 flex-col px-4 py-4 sm:px-5">
        <p className="text-sm">
          <strong>{project.client}</strong>
          <span className="text-muted-foreground"> &middot; {project.who}</span>
        </p>
        <h3 className="mt-1.5 font-serif text-[1.375rem] leading-tight font-bold">{project.title}</h3>
        <p className="mt-1.5 text-[0.9375rem] text-muted-foreground">{project.detail}</p>
        {review ? <ProjectReviewCard review={review} /> : preview ? <ReviewSlot /> : null}
        {preview && project.todo ? (
          <p className="mt-3 text-xs font-medium text-primary">To do: {project.todo}</p>
        ) : null}
      </div>
    </article>
  );
}

/** A review in LinkedIn's layout: face, name and title, stars, the words. */
function ProjectReviewCard({ review }: { review: ProjectReview }) {
  return (
    <figure className="mt-4 flex flex-1 flex-col rounded-md border bg-background px-3.5 py-3.5">
      <figcaption className="flex gap-3">
        <ReviewerAvatar label={review.name ?? review.role} photo={review.photo} />
        <span className="min-w-0">
          {review.name ? (
            <>
              <strong className="block text-[0.9375rem] leading-snug">{review.name}</strong>
              <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">{review.role}</span>
            </>
          ) : (
            <strong className="block text-[0.9375rem] leading-snug">{review.role}</strong>
          )}
        </span>
      </figcaption>
      {review.linkedin ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Stars small /> <strong className="text-foreground">5.0</strong> &middot; {review.linkedin.date}
        </p>
      ) : null}
      <blockquote className="mt-2 flex-1 text-[0.9375rem] leading-relaxed">&ldquo;{review.quote}&rdquo;</blockquote>
      <p className="mt-3 flex items-center gap-1.5 border-t pt-2.5 text-xs text-muted-foreground">
        {review.linkedin ? (
          <>
            <LinkedInMark /> Recommendation on LinkedIn
          </>
        ) : (
          "Client testimonial"
        )}
      </p>
    </figure>
  );
}

/** The reviewer's photo, or their initials until we have one. */
function ReviewerAvatar({ label, photo }: { label: string; photo?: string }) {
  if (photo) {
    return (
      <img src={photo} alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-full object-cover" />
    );
  }
  const initials = label
    .split(/[\s,]+/)
    .filter(Boolean)
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

/** Where a review will go, shown only with ?preview. */
function ReviewSlot() {
  return (
    <Slot className="mt-4 flex-1 items-start text-left">
      <span className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-primary/60 text-[0.625rem]">
          Photo
        </span>
        <span>
          <strong className="block">Name</strong>
          <span className="text-xs text-muted-foreground">Role at company</span>
        </span>
      </span>
      <span className="mt-3 block text-sm text-muted-foreground">Their review goes here, word for word.</span>
    </Slot>
  );
}

function Slot({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-md border-2 border-dashed border-primary/60 bg-card px-4 py-4 text-center text-sm",
        className,
      )}
    >
      {children}
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

/*
 * LinkedIn recommendations, word for word as posted, rebuilt as cards so
 * they're readable on a phone (a screenshot shrinks to ~6px text there).
 * Moushumi first: a CFO and Xero award winner speaks to who the ads reach.
 */
const REVIEWS = [
  {
    name: "Moushumi Sikand",
    photo: "/assets/reviewer-moushumi.webp",
    headline:
      "CFO for Purpose-Driven Businesses | 20+ Yrs Experience | Helping Founders Gain Financial Clarity, Confidence & Sustainable Profit | Winner of Xero Sole Practitioner of the year",
    service: "IT Consulting",
    date: "May 19, 2026",
    text: "Daniel is very knowledgeable and passionate about providing great outcomes when it comes to automations and efficiency projects leveraging technology and Ai. Strongly recommend.",
  },
  {
    name: "Craig Whitton",
    photo: "/assets/reviewer-craig.webp",
    headline:
      "Growth & Leadership Consulting Partner; Wingman; Mentor; Accountability Partner; Organisational Consulting; Outsourced Consulting CFO at Real Balance Business Consulting, Vocalist and Band Manager/Roadie",
    service: "Custom Software Development",
    date: "January 24, 2026",
    text: "Incredibly knowledgeable about apps and development. Has a clear strategic foresight of the project, not just its development. Easy to talk with and communicates tech matters in an easy to understand manner. Thanks mate for your support",
  },
  {
    name: "Justin Rigby",
    photo: "/assets/reviewer-justin.webp",
    headline: "Consultant - Corrosion Technologist & Senior Coatings Inspector (AMPP)",
    service: "Custom Software Development",
    date: "May 11, 2026",
    text: "Daniel has a great grasp on task management and how automation can be achieved. His is helpful and inquisitive - I expect he will soon be an industry leader. Grab him now while he is still available.",
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
      className="flex snap-x snap-mandatory gap-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {REVIEWS.map((review) => (
        <figure
          key={review.name}
          data-review
          className="flex w-[85%] shrink-0 snap-start flex-col rounded-md border bg-card px-4 py-4 sm:w-[340px]"
        >
          <figcaption className="flex gap-3">
            <img
              src={review.photo}
              alt=""
              width={44}
              height={44}
              className="h-11 w-11 shrink-0 rounded-full object-cover"
            />
            <span className="min-w-0">
              <strong className="block text-[0.9375rem] leading-snug">{review.name}</strong>
              <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">
                {review.headline}
              </span>
            </span>
          </figcaption>
          <span className="mt-3 self-start rounded-sm bg-muted px-2 py-0.5 text-xs font-medium">
            {review.service}
          </span>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Stars small /> <strong className="text-foreground">5.0</strong> &middot; {review.date}
          </p>
          <blockquote className="mt-2 flex-1 text-[0.9375rem] leading-relaxed">{review.text}</blockquote>
          <p className="mt-3 flex items-center gap-1.5 border-t pt-3 text-xs text-muted-foreground">
            <LinkedInMark /> Recommendation on LinkedIn
          </p>
        </figure>
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
