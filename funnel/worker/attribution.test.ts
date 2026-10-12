import { describe, expect, it } from "vitest";

import { shortLinkRedirect } from "./links";
import { metaCampaignId, sourceFromReferrer, sourceFromUtm } from "./util";

describe("sourceFromReferrer: same labels beehiiv's own form records", () => {
  it("calls a visit with no referrer direct", () => {
    expect(sourceFromReferrer(null)).toEqual({ source: "direct", medium: null });
  });

  it("credits search engines as organic and everything else as referral", () => {
    expect(sourceFromReferrer("https://www.google.com/")).toEqual({ source: "google.com", medium: "organic" });
    expect(sourceFromReferrer("https://www.google.com.au/search?q=x")).toEqual({ source: "google.com.au", medium: "organic" });
    expect(sourceFromReferrer("https://www.facebook.com/")).toEqual({ source: "facebook.com", medium: "referral" });
  });

  it("credits the network, not its in-app link shim", () => {
    expect(sourceFromReferrer("https://l.instagram.com/?u=x").source).toBe("instagram.com");
    expect(sourceFromReferrer("https://lm.facebook.com/l.php?u=x").source).toBe("facebook.com");
    expect(sourceFromReferrer("https://lnkd.in/abc").source).toBe("linkedin.com");
    expect(sourceFromReferrer("https://t.co/abc").source).toBe("x.com");
  });

  it("maps onto the CRM's existing source labels", () => {
    const fb = sourceFromReferrer("https://www.facebook.com/");
    expect(sourceFromUtm(fb.source, fb.medium)).toBe("fb referral");
    const google = sourceFromReferrer("https://www.google.com/");
    expect(sourceFromUtm(google.source, google.medium)).toBe("google organic");
    expect(sourceFromUtm("ig", "social")).toBe("ig social");
    expect(sourceFromUtm("facebook", "paid")).toBe("fb paid");
  });
});

describe("metaCampaignId", () => {
  it("prefers utm_id, then a numeric utm_campaign, and ignores names", () => {
    expect(metaCampaignId("120212345678", "Spring push")).toBe("120212345678");
    expect(metaCampaignId(null, "120299999999")).toBe("120299999999");
    expect(metaCampaignId(null, "Spring push")).toBeNull();
    expect(metaCampaignId("{{campaign.id}}", null)).toBeNull();
  });
});

describe("short links", () => {
  const go = (path: string) => shortLinkRedirect(new URL(`https://therollout.ai${path}`));

  it("sends /ig to the subscribe page with Instagram's tags", () => {
    const response = go("/ig")!;
    expect(response.status).toBe(302);
    const target = new URL(response.headers.get("location")!);
    expect(target.pathname).toBe("/");
    expect(target.searchParams.get("utm_source")).toBe("ig");
    expect(target.searchParams.get("utm_medium")).toBe("social");
    expect(target.searchParams.get("utm_campaign")).toBe("bio");
  });

  it("lets tags on the link override, and keeps everything else", () => {
    const target = new URL(go("/li?utm_campaign=post-xero&fbclid=abc")!.headers.get("location")!);
    expect(target.searchParams.get("utm_source")).toBe("linkedin");
    expect(target.searchParams.get("utm_campaign")).toBe("post-xero");
    expect(target.searchParams.get("fbclid")).toBe("abc");
  });

  it("sends newsletter readers straight to booking", () => {
    expect(new URL(go("/call")!.headers.get("location")!).pathname).toBe("/sprint");
  });

  it("leaves real pages alone", () => {
    expect(go("/sprint")).toBeNull();
    expect(go("/")).toBeNull();
  });
});
