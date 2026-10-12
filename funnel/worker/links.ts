/*
 * Short links for bios and posts: therollout.ai/ig instead of a long URL full
 * of tracking tags. Each one redirects to the page with its tags added, so
 * every signup is credited to where it came from, in beehiiv and the CRM.
 *
 * Tags already on the short link win, so a one-off can be tracked without a
 * new entry: therollout.ai/li?utm_campaign=post-xero sets just the campaign.
 */

interface ShortLink {
  to: string;
  tags: Record<string, string>;
}

// Instagram keeps ig / social, the tags its bio link already used, so the
// numbers stay comparable with everything beehiiv has recorded so far.
export const SHORT_LINKS: Record<string, ShortLink> = {
  "/ig": { to: "/", tags: { utm_source: "ig", utm_medium: "social", utm_campaign: "bio" } },
  "/li": { to: "/", tags: { utm_source: "linkedin", utm_medium: "social", utm_campaign: "bio" } },
  "/yt": { to: "/", tags: { utm_source: "youtube", utm_medium: "social", utm_campaign: "bio" } },
  "/x": { to: "/", tags: { utm_source: "x", utm_medium: "social", utm_campaign: "bio" } },
  "/fb": { to: "/", tags: { utm_source: "facebook", utm_medium: "social", utm_campaign: "bio" } },
  // For the newsletter itself: readers are already subscribed, so straight to booking.
  "/call": { to: "/sprint", tags: { utm_source: "the-rollout", utm_medium: "email", utm_campaign: "newsletter" } },
};

export function shortLinkRedirect(url: URL): Response | null {
  const link = SHORT_LINKS[url.pathname.replace(/\/+$/, "").toLowerCase()];
  if (!link) return null;
  const target = new URL(link.to, url.origin);
  for (const [key, value] of Object.entries(link.tags)) target.searchParams.set(key, value);
  for (const [key, value] of url.searchParams) target.searchParams.set(key, value);
  // 302, not 301: browsers never cache it, so a link can be changed later.
  return Response.redirect(target.toString(), 302);
}
