import * as React from "react";
import { Star } from "lucide-react";

import { LinkedInMark } from "@/components/linkedin-mark";
import { cn } from "@/lib/utils";

/*
 * The builds and their reviews: the proof grid /sprint and /black-friday both
 * show. One list, so a new review or screenshot lands on every page at once.
 */

type ProjectReview = {
  /** Leave out until we have it; the role then stands in for the name. */
  name?: string;
  role: string;
  photo?: string;
  /** Word for word. Until we have it the review only shows with ?preview. */
  quote?: string;
  /** When it was given. Only set when we know it. */
  date?: string;
  /** A LinkedIn recommendation, rather than a testimonial sent to us. */
  linkedin?: boolean;
  /** Wording drafted for the reviewer to approve. Only shows with ?preview until they do. */
  pending?: boolean;
};

type Project = {
  client: string;
  who: string;
  title: string;
  detail: string;
  image?: { src: string; width: number; height: number; alt: string };
  /** Several 16:9 (1280x720) screenshots that take turns, in place of one image. */
  slides?: { src: string; alt: string }[];
  /** A short silent screen recording that loops, in place of a GIF. */
  video?: { src: string; poster: string; width: number; height: number; alt: string };
  /**
   * Before and after, as two bars: the chart from the top of the emails.
   * Only where we have both numbers. Shown where a page asks for charts.
   */
  chart?: {
    title: string;
    before: { label: string; value: string };
    after: { label: string; value: string };
    /** How long the "after" bar is next to the "before" bar, 0 to 100. */
    afterPercent: number;
    /** Numbers drafted for Daniel to confirm. Only shows with ?preview until he does. */
    pending?: boolean;
  };
  review?: ProjectReview;
  /** What's still missing. Only shown with ?preview, so the live page stays clean. */
  todo?: string;
};

/*
 * The two clients the Black Friday emails are about. Shaun's card is also in
 * the grid below; Glen's only shows where a page asks for it (see ProjectGrid).
 */
const SHAUN: Project = {
  client: "A Sydney bookkeeping practice",
  who: "Xero bookkeeping",
  title: "40 to 50 staff expense claims a month, checked and reimbursed",
  detail:
    "Two jobs off the bookkeeper's desk: Claude checks every claim's account and GST and flags the wrong ones, then files the rest in payroll as employee reimbursements for the next pay run.",
  image: {
    src: "/assets/work/expense-claims.jpg",
    width: 900,
    height: 506,
    alt: "Claude checking staff expense claims in Xero's demo company before they're approved.",
  },
  chart: {
    title: "Employee reimbursements: about 4 hours a week, down to 30 minutes",
    before: { label: "By hand", value: "4 hrs" },
    after: { label: "With Claude, and Shaun checking", value: "30 min" },
    afterPercent: 12.5,
  },
  review: {
    name: "Shaun Rafferty",
    role: "First Class Accounts",
    quote:
      "Dan Hay and Phlo have changed how I run my bookkeeping practice. Dan taught me to automate real workflows with Claude and other tools, starting with employee reimbursements, then monthly reporting, BAS prep and reconciliations. He's practical, patient and explains things in plain English, so you understand what you've built. I'm now getting hours back every week. If you're an accountant, bookkeeper or business owner keen to put AI to work, I can't recommend Dan highly enough.",
    date: "November 15, 2026",
    linkedin: true,
  },
  todo: "Ask Shaun for a photo.",
};

// Named as "Glen, an architect in Melbourne" and nothing more: no practice name.
// The picture is a frame from his first call, with the practice's name blurred.
const GLEN: Project = {
  client: "Glen, an architect in Melbourne",
  who: "Meta ads",
  title: "Replaced a $1,000+ a month ad agency with Claude",
  detail:
    "On our first call we connected Claude to his ad account and it built his first campaign from photos of his own projects. Glen picks the budget, checks the creative and presses publish. That's him watching the first ads come out.",
  image: {
    src: "/assets/work/glen-first-ads.jpg",
    width: 1280,
    height: 720,
    alt: "Claude laying out Meta ads from an architect's project photos during a video call, with Glen watching, hands over his mouth.",
  },
  chart: {
    title: "Meta ads: $1,000+ a month, down to one Claude subscription",
    before: { label: "Ad agency", value: "$1,000+ a month" },
    after: { label: "Glen and Claude", value: "one Claude subscription" },
    afterPercent: 6,
  },
  // Drafted for Glen to approve, so it only shows with ?preview. First name
  // only, and no practice name.
  review: {
    name: "Glen",
    role: "Architect, Melbourne",
    quote:
      "I'd been paying an agency more than a thousand dollars a month to run our Meta ads, and it wasn't working. In one session Daniel had Claude connected to our ad account and making ads from our own project photos, in our own look. Now I run them myself, and I know exactly what's going out.",
    pending: true,
  },
  todo: "Waiting on Glen's OK for this wording. Once he's happy: remove pending and add the date.",
};

/*
 * Every build we can point to, two to a row on desktop, each with a
 * screenshot, a few rotating screenshots, or a short looping recording.
 * Reviews line up across a row (see ProjectCard), so the two still waiting on
 * a review share the last row and it closes up neatly. Quotes are word for word: LinkedIn
 * recommendations, the testimonials published on phloing.com, or wording a
 * client has approved (pending until they do). Clients we don't yet have
 * permission to name are described, not named. Personal details are blurred
 * (a name and mobile in Remedy's sheet, the login email in HFG's portal); the
 * dealership's screenshots come from its demo site.
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
    // Numbers confirmed by Daniel, 22 Nov 2026.
    chart: {
      title: "Monthly client reporting: about 4 hours a client, down to 1",
      before: { label: "By hand", value: "4 hrs" },
      after: { label: "With the live dashboard and AI", value: "1 hr" },
      afterPercent: 25,
    },
    review: {
      name: "Craig Whitton",
      role: "Managing Director, Real Balance",
      photo: "/assets/reviewer-craig.webp",
      quote:
        "Incredibly knowledgeable about apps and development. Has a clear strategic foresight of the project, not just its development. Easy to talk with and communicates tech matters in an easy to understand manner. Thanks mate for your support",
      date: "January 24, 2026",
      linkedin: true,
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
    // Numbers confirmed by Daniel, 22 Nov 2026.
    chart: {
      title: "Bank reconciliation backlog: 5 years, down to none",
      before: { label: "Before", value: "5 years behind" },
      after: { label: "With Claude, and a bookkeeper approving", value: "up to date" },
      afterPercent: 0,
    },
    review: {
      name: "Moushumi Sikand",
      role: "CFO for Purpose-Driven Businesses | Winner of Xero Sole Practitioner of the year",
      photo: "/assets/reviewer-moushumi.webp",
      quote:
        "Daniel is very knowledgeable and passionate about providing great outcomes when it comes to automations and efficiency projects leveraging technology and Ai. Strongly recommend.",
      date: "May 19, 2026",
      linkedin: true,
    },
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
      date: "May 11, 2026",
      linkedin: true,
    },
  },
  {
    client: "Hash Financial Group",
    who: "private credit",
    title: "Investor onboarding and KYC, automated",
    detail: "KYC, AML and SMSF investor onboarding for HFG's private credit fund, so deals move faster.",
    image: {
      src: "/assets/work/hfg-portal.jpg",
      width: 1280,
      height: 720,
      alt: "Hash Financial Group's client portal: borrow (property, equipment and receivables loans) and invest (property, asset-backed credit and receivables funds).",
    },
    review: {
      name: "Sheetal Jiang",
      role: "Head of Operations, Hash Financial Group",
      photo: "/assets/reviewer-sheetal.jpg",
      quote:
        "The system Phlo built streamlined our investor onboarding and internal operations. What used to require manual coordination is now structured, trackable, and far easier to manage.",
    },
    todo: "Add the month Sheetal gave this review.",
  },
  {
    client: "Studyfin",
    who: "fintech for international students",
    title: "Seven products on one platform",
    detail: "A full-stack platform for international students: payments, housing, jobs and savings.",
    video: {
      src: "/assets/work/studyfin-jobs.mp4",
      poster: "/assets/work/studyfin-jobs-poster.jpg",
      width: 800,
      height: 540,
      alt: "Screen recording of Studyfin's jobs board: searching for jobs, browsing featured roles and opening a job to apply.",
    },
    review: {
      role: "Founder, Studyfin",
      quote:
        "Phlo has been our development partner from day one, building the platform from the ground up and managing seven distinct products and features with different requirements.",
    },
    todo: "Add the founder's name and photo.",
  },
  {
    client: "Sapien Group",
    who: "venture capital",
    title: "AI and automation, delivered to a plan",
    detail: "The architecture and delivery plan for Sapien's AI and automation projects.",
    slides: [
      {
        src: "/assets/work/sapien-numbers.jpg",
        alt: "Sapien Ventures' site: over A$100M in venture capital under management, 35+ companies, 46% IRR, 10+ countries and 100 projects.",
      },
      {
        src: "/assets/work/sapien-map.jpg",
        alt: "Sapien Ventures' site: a world map marking the markets it invests in.",
      },
      {
        src: "/assets/work/sapien-portfolio.jpg",
        alt: "Sapien Ventures' portfolio page, with Hash Financial Group, Studyfin and other fintech companies.",
      },
    ],
    review: {
      name: "Victor Jiang",
      role: "Managing Director, Sapien Group",
      photo: "/assets/reviewer-victor.jpg",
      quote:
        "Phlo brings structure and pace to complex AI and automation projects. That makes delivery far more predictable.",
    },
    todo: "Check the project wording, and add the month Victor gave this review.",
  },
  SHAUN,
  {
    client: "A national car dealership group",
    who: "fleet sales",
    title: "From one spreadsheet to a fleet sales platform",
    detail:
      "Shows which fleet customers are due to replace vehicles, who each rep should call next, and the whole team's pipeline. Now rolled out to multiple dealerships.",
    slides: [
      {
        src: "/assets/work/fleet-overview.jpg",
        alt: "Fleet overview: 100 accounts, 1,276 vehicles, 223 overdue for replacement, with charts by lifecycle, fleet size and industry.",
      },
      {
        src: "/assets/work/fleet-customers.jpg",
        alt: "Customer ranking by fleet size, with call status, vehicles over five years old and each fleet's mix of utes, SUVs, cars and vans.",
      },
      {
        src: "/assets/work/fleet-map.jpg",
        alt: "Coverage map of customers and prospects across Melbourne inside the dealership's primary market area.",
      },
      {
        src: "/assets/work/fleet-dashboard.jpg",
        alt: "Sales dashboard: pipeline by call status, activity by channel and week, and each rep's open and overdue actions.",
      },
      {
        src: "/assets/work/fleet-planner.jpg",
        alt: "Contact planner board with accounts in columns from Not Started to Contract Secured.",
      },
      {
        src: "/assets/work/fleet-actions.jpg",
        alt: "Calendar of every rep's next action for the month.",
      },
    ],
    review: {
      name: "Adrian Richards",
      role: "Founder & Managing Director, Forth",
      photo: "/assets/reviewer-adrian.jpg",
      quote:
        "Daniel helped turn our spreadsheet into software, and added functionality we never had before. It's let us roll the platform out to multiple dealerships under the Eagers Automotive brand. I highly recommend working with Phlo.",
      pending: true,
    },
    todo: "Waiting on Adrian's OK for this wording. Once he's happy: remove pending, add the date, and rename the card to Forth.",
  },
];

/** Reviews the live page shows; ones still waiting on their words don't count. */
export const REVIEW_COUNT = PROJECTS.filter((project) => project.review?.quote && !project.review.pending).length;

/** Whether a card opens with a picture (or, with ?preview, the slot for one). */
function hasMedia(project: Project, preview: boolean) {
  return Boolean(project.slides || project.video || project.image || preview);
}

/**
 * One build. Every card spans four grid rows: picture, text, review, to-do.
 * When both cards in a row open the same way they share those rows as a
 * subgrid, so their reviews start at the same height. A card beside one of a
 * different shape keeps its own flow rather than opening a gap above its
 * review.
 */
function ProjectCard({
  project,
  preview,
  align,
  charts,
}: {
  project: Project;
  preview: boolean;
  align: boolean;
  charts: boolean;
}) {
  const { image, slides, video, review } = project;
  const showReview = review && ((review.quote && !review.pending) || preview);
  return (
    <article
      className={cn(
        "row-span-4 overflow-hidden rounded-md border bg-card",
        align ? "grid grid-rows-subgrid gap-0" : "flex flex-col",
      )}
    >
      {slides ? (
        <ProjectSlides slides={slides} />
      ) : video ? (
        <ProjectVideo video={video} />
      ) : image ? (
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
      ) : (
        <div aria-hidden="true" />
      )}
      <div className="px-4 pt-4 sm:px-5">
        <p className="text-sm">
          <strong>{project.client}</strong>
          <span className="text-muted-foreground"> &middot; {project.who}</span>
        </p>
        <h3 className="mt-1.5 font-serif text-[1.375rem] leading-tight font-bold">{project.title}</h3>
        <p className="mt-1.5 text-[0.9375rem] text-muted-foreground">{project.detail}</p>
        {charts && project.chart && (!project.chart.pending || preview) ? <SavingChart chart={project.chart} /> : null}
      </div>
      <div className="flex flex-1 flex-col px-4 sm:px-5">
        {showReview ? <ProjectReviewCard review={review} /> : preview ? <ReviewSlot /> : null}
      </div>
      <div className="px-4 pb-4 sm:px-5">
        {preview && project.todo ? (
          <p className="mt-3 text-xs font-medium text-primary">To do: {project.todo}</p>
        ) : null}
      </div>
    </article>
  );
}

/** The saving as two bars: what it took before, and what it takes now. */
function SavingChart({ chart }: { chart: NonNullable<Project["chart"]> }) {
  const rows = [
    { ...chart.before, percent: 100, after: false },
    { ...chart.after, percent: chart.afterPercent, after: true },
  ];
  return (
    <div
      className={cn(
        "mt-3.5 rounded-md bg-[#EEF5F3] px-3.5 py-3",
        chart.pending ? "border-2 border-dashed border-primary/60" : "",
      )}
    >
      {chart.pending ? (
        <p className="mb-1.5 text-xs font-medium text-primary-hover">Draft numbers. Preview only until confirmed.</p>
      ) : null}
      <p className="text-sm leading-snug font-semibold">{chart.title}</p>
      <dl className="mt-2.5 space-y-2">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-[0.8125rem] font-semibold">{row.label}</dt>
            <dd className="mt-1 flex items-center gap-2">
              {/* The bars share 55% of the row, so the longer value still fits beside its bar. */}
              <span
                className={cn("h-3.5 min-w-2 rounded-sm", row.after ? "bg-primary" : "bg-subtle-foreground/55")}
                style={{ width: `${row.percent * 0.55}%` }}
                aria-hidden="true"
              />
              <span className="text-[0.8125rem] font-semibold">{row.value}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * A short screen recording on a silent loop, like a GIF at a tenth of the
 * weight. It only loads and plays while it's on screen, and holds on its first
 * frame for people who ask for less motion.
 */
function ProjectVideo({ video }: { video: NonNullable<Project["video"]> }) {
  const ref = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    const element = ref.current;
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    element.muted = true;
    element.setAttribute("muted", "");
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) element.play().catch(() => {});
      else element.pause();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      src={video.src}
      poster={video.poster}
      width={video.width}
      height={video.height}
      aria-label={video.alt}
      playsInline
      loop
      preload="none"
      className="aspect-video h-auto w-full border-b bg-white object-cover object-top"
    />
  );
}

/**
 * A build's screenshots taking turns, crossfading every few seconds, like a
 * GIF but sharp. Holds on the first one for people who ask for less motion.
 */
function ProjectSlides({ slides }: { slides: NonNullable<Project["slides"]> }) {
  const [index, setIndex] = React.useState(0);
  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % slides.length), 3500);
    return () => window.clearInterval(timer);
  }, [slides.length]);
  return (
    <div className="relative aspect-video w-full overflow-hidden border-b bg-white">
      {slides.map((slide, i) => (
        <img
          key={slide.src}
          src={slide.src}
          width={1280}
          height={720}
          alt={slide.alt}
          aria-hidden={i !== index}
          loading="lazy"
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-700",
            i === index ? "opacity-100" : "opacity-0",
          )}
        />
      ))}
      <span
        aria-hidden="true"
        className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-full bg-black/40 px-2 py-1"
      >
        {slides.map((slide, i) => (
          <span
            key={slide.src}
            className={cn("h-1.5 w-1.5 rounded-full", i === index ? "bg-white" : "bg-white/45")}
          />
        ))}
      </span>
    </div>
  );
}

/**
 * A review in LinkedIn's layout: face, name and title, stars, the words, and
 * where it came from. Every review gets the same card, LinkedIn or not.
 */
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
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Stars small /> <strong className="text-foreground">5.0</strong>
        {review.date ? <> &middot; {review.date}</> : null}
      </p>
      {review.quote ? (
        <blockquote className="mt-2 flex-1 text-[0.9375rem] leading-relaxed">&ldquo;{review.quote}&rdquo;</blockquote>
      ) : (
        <Slot className="mt-2 flex-1 items-start text-left text-sm">Their review goes here, word for word.</Slot>
      )}
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

/**
 * Every build, two to a row on desktop, with the reviews lined up across each row.
 * `stories` opens the grid with Shaun and Glen, the two clients the Black
 * Friday emails are about, and shows their before-and-after charts.
 */
export function ProjectGrid({ preview, stories = false }: { preview: boolean; stories?: boolean }) {
  const projects = stories ? [SHAUN, GLEN, ...PROJECTS.filter((project) => project !== SHAUN)] : PROJECTS;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {projects.map((project, i) => {
        // The card beside this one on desktop, two to a row.
        const partner = projects[i % 2 === 0 ? i + 1 : i - 1];
        const align = !partner || hasMedia(partner, preview) === hasMedia(project, preview);
        return <ProjectCard key={project.title} project={project} preview={preview} align={align} charts={stories} />;
      })}
    </div>
  );
}

export function Stars({ small = false }: { small?: boolean }) {
  return (
    <span className="inline-flex text-primary" role="img" aria-label="5 out of 5 stars">
      {Array.from({ length: 5 }, (_, index) => (
        <Star key={index} className={cn("fill-current", small ? "h-3.5 w-3.5" : "h-4 w-4")} aria-hidden="true" />
      ))}
    </span>
  );
}
