import * as React from "react";
import { createRoot } from "react-dom/client";

import { rememberTouch } from "@/lib/funnel";
import { cn } from "@/lib/utils";

/** Mount a page component into #root. */
export function mountPage(Page: React.ComponentType) {
  rememberTouch();
  const root = document.getElementById("root");
  if (!root) throw new Error("missing #root");
  createRoot(root).render(
    <React.StrictMode>
      <Page />
    </React.StrictMode>,
  );
}

export function SiteHeader({ partner = true }: { partner?: boolean }) {
  return (
    <header className="flex items-center justify-between gap-4">
      <img
        src="/assets/rollout-logo.png"
        alt="The Rollout"
        width={600}
        height={200}
        className="h-9 w-auto sm:h-10"
      />
      {partner ? (
        // Scales with the screen so it sits beside the logo even on small phones.
        <img
          src="/assets/claude-partner-logo.svg"
          alt="Claude Partner Network"
          width={363}
          height={28}
          className="h-auto w-[min(50vw,280px)]"
        />
      ) : null}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t px-4 pt-8 pb-10 text-center text-[0.9375rem] text-muted-foreground">
      <div className="mx-auto max-w-[720px]">
        <p className="mb-4">
          The builds are done by Phlo, the team I run. The Rollout is where I write about how
          businesses are actually rolling AI out, every week.
        </p>
        <small className="text-[0.8125rem] tracking-wide">
          &copy; PHLOING PTY LTD. All rights reserved. &middot;{" "}
          <a href="/privacy" className="underline">
            Privacy
          </a>
        </small>
      </div>
    </footer>
  );
}

/** The single centred column every page after the subscribe page uses. */
export function PageColumn({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <main
      className={cn("mx-auto w-full max-w-[720px] px-4 pt-6 sm:px-5 sm:pt-12", className)}
      {...props}
    />
  );
}

/** Sage, full-width-on-mobile primary call to action. */
export function CtaLink({ className, ...props }: React.ComponentProps<"a">) {
  return (
    <a
      className={cn(
        "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 text-base font-semibold text-primary-foreground no-underline transition-colors hover:bg-primary-hover sm:w-auto",
        className,
      )}
      {...props}
    />
  );
}
