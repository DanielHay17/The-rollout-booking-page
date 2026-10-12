import { config } from "@/config";

/*
 * Meta pixel. Loaded after the page is usable so it never slows the first
 * paint. Skipped entirely when running locally so test clicks don't reach
 * the ad account.
 */

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push: Fbq;
  loaded: boolean;
  version: string;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

export type PixelEvent = "Subscribe" | "Lead" | "ViewContent" | "Schedule";

function enabled() {
  if (!config.metaPixelId || import.meta.env.DEV) return false;
  // `wrangler dev` serves the production build, so also skip local hosts.
  const host = window.location.hostname;
  return host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]";
}

export function initPixel() {
  if (!enabled() || window.fbq) return;
  // Meta's standard bootstrap: a queue that records calls until fbevents.js arrives.
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  } as Fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  window.fbq = fbq;
  window._fbq = fbq;

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);

  fbq("init", config.metaPixelId);
  fbq("track", "PageView");
}

export function trackPixel(event: PixelEvent, params: Record<string, unknown> = {}) {
  if (!enabled()) return;
  window.fbq?.("track", event, params, { eventID: `${event}-${crypto.randomUUID()}` });
}

/**
 * Our own events (SprintView, VSL50...). Kept out of Meta's standard names so
 * they can't muddy the events your ads optimise on, but usable for
 * retargeting audiences like "watched half the VSL, didn't book".
 */
export function trackPixelCustom(name: string) {
  if (!enabled()) return;
  window.fbq?.("trackCustom", name);
}
