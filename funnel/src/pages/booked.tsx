import "../index.css";

import * as React from "react";
import { ArrowUpRight, CircleCheck, MessageCircle } from "lucide-react";

import { PageColumn, SiteFooter, SiteHeader, mountPage } from "@/components/site";
import { config } from "@/config";
import { currentState, readState, sendEvent, writeState } from "@/lib/funnel";
import { initPixel, trackPixel } from "@/lib/pixel";

/*
 * Step 4: after iClosed. Set this page as the event's redirect after booking.
 * Its job is getting them to turn up: accept the invite, know what to expect,
 * and arrive having read a case study or two.
 */

const READING = [
  {
    title: "AI found $85,000 in this business's data",
    note: "The data was already there. It just hadn't been read.",
    href: "https://the-rollout.co/p/ai-found-85-000-in-this-business-s-data",
  },
  {
    title: "How we got AI to do five years of Xero reconciliation",
    href: "https://the-rollout.co/p/how-we-got-ai-to-do-a-5-year-of-xero-reconciliation",
  },
  {
    title: "How one spreadsheet became an operations dashboard",
    href: "https://the-rollout.co/p/how-one-spreadsheet-became-an-operations-dashboard",
  },
];

function BookedPage() {
  const state = React.useMemo(() => currentState(), []);

  React.useEffect(() => {
    initPixel();
    if (!readState().scheduleTracked) {
      trackPixel("Schedule");
      writeState({ scheduleTracked: true });
    }
    sendEvent("page_booked");
  }, []);

  const steps: { title: string; body: React.ReactNode }[] = [
    {
      title: "Accept the calendar invite",
      body: "It's in your inbox now. If you can't see it, check spam and mark it as safe so the reminders reach you too.",
    },
    config.expectationsVideo.src
      ? {
          title: "Watch this 90-second video",
          body: (
            <>
              What happens on the call, and the one thing worth having ready.
              <video
                controls
                playsInline
                preload="metadata"
                poster={config.expectationsVideo.poster || undefined}
                className="mt-3 aspect-video w-full rounded-md bg-black"
              >
                <source src={config.expectationsVideo.src} type="video/mp4" />
              </video>
            </>
          ),
        }
      : {
          title: "Think of the one job you'd hand off tomorrow",
          body: "The task you'd happily never do again. That's usually where we start, so have it front of mind.",
        },
  ];

  if (config.textNumber) {
    steps.push({
      title: "Text me “confirmed”",
      body: (
        <>
          So I know you&apos;ll be there, and you&apos;ve got my number if anything changes.
          <a
            href={`sms:${config.textNumber}?&body=${encodeURIComponent("confirmed")}`}
            onClick={() => sendEvent("text_click")}
            className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-5 font-semibold text-primary-foreground no-underline transition-colors hover:bg-primary-hover sm:w-auto sm:inline-flex"
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" /> Text Daniel
          </a>
        </>
      ),
    });
  } else if (config.linkedinUrl) {
    steps.push({
      title: "Connect with me on LinkedIn",
      body: (
        <>
          You&apos;ll see what I&apos;m working on before we talk.{" "}
          <a
            href={config.linkedinUrl}
            target="_blank"
            rel="noopener"
            className="text-primary-hover underline underline-offset-2"
          >
            Daniel on LinkedIn
          </a>
        </>
      ),
    });
  }

  return (
    <>
      <PageColumn>
        <SiteHeader />

        <section className="mt-10 sm:mt-14">
          <p className="mb-3 inline-flex items-center gap-2 font-medium text-primary-hover">
            <CircleCheck className="h-5 w-5" aria-hidden="true" /> Call booked
          </p>
          <h1 className="text-[1.875rem] font-bold sm:text-[2.625rem]">
            You&apos;re booked{state.name ? `, ${state.name}` : ""}.
          </h1>
          <p className="mt-3 text-muted-foreground sm:text-lg">
            {steps.length === 3 ? "Three" : "Two"} quick things so we get the most out of the 20
            minutes:
          </p>
        </section>

        <ol className="mt-6 space-y-3">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-4 rounded-md border bg-card px-4 py-4">
              <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-sans text-base font-semibold tracking-normal">{step.title}</h2>
                <div className="mt-1 text-[0.9375rem] text-muted-foreground">{step.body}</div>
              </div>
            </li>
          ))}
        </ol>

        <section className="mt-14">
          <h2 className="mb-1.5 text-2xl font-bold sm:text-[1.75rem]">While you wait</h2>
          <p className="mb-4 text-muted-foreground">
            A few real rollouts from The Rollout, so you can see the kind of thing we&apos;ll look for.
          </p>
          <ul className="space-y-3">
            {READING.map((post) => (
              <li key={post.href}>
                <a
                  href={post.href}
                  target="_blank"
                  rel="noopener"
                  className="group flex items-start justify-between gap-4 rounded-md border bg-card px-4 py-4 no-underline transition-colors hover:border-primary"
                >
                  <span>
                    <span className="block font-serif text-lg font-semibold text-foreground">
                      {post.title}
                    </span>
                    {post.note ? (
                      <span className="mt-1 block text-[0.9375rem] text-muted-foreground">{post.note}</span>
                    ) : null}
                  </span>
                  <ArrowUpRight
                    className="mt-1 h-5 w-5 shrink-0 text-primary transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </a>
              </li>
            ))}
          </ul>
        </section>
      </PageColumn>

      <SiteFooter />
    </>
  );
}

mountPage(BookedPage);
