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

/** What we already know about the visitor, for Meta's advanced matching. */
export interface PixelUser {
  email?: string;
  firstName?: string;
  /** +E.164, e.g. +61400000000 */
  phone?: string;
}

/*
 * beehiiv's own page sends the subscriber's email with Subscribe, which is
 * how Meta ties a signup back to the ad. Our Subscribe fires on /welcome,
 * where the email isn't on the page any more, so we hand it over here. The
 * pixel hashes these in the browser; Meta never receives them in plain text.
 */
function matchKeys(user: PixelUser) {
  const keys: Record<string, string> = {};
  const email = user.email?.trim().toLowerCase();
  if (email) keys.em = email;
  const firstName = user.firstName?.trim().toLowerCase();
  if (firstName) keys.fn = firstName;
  const phone = user.phone?.replace(/\D/g, "");
  if (phone) keys.ph = phone;
  return keys;
}

export function initPixel(user: PixelUser = {}) {
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

  fbq("init", config.metaPixelId, matchKeys(user));
  fbq("track", "PageView");
}

export function trackPixel(event: PixelEvent, params: Record<string, unknown> = {}) {
  if (!enabled()) return;
  // Not crypto.randomUUID(): older in-app browsers don't have it, and a throw
  // here would take the Subscribe event (and the page) down with it.
  const eventID = `${event}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  window.fbq?.("track", event, params, { eventID });
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
