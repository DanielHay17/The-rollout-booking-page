import { describe, expect, it } from "vitest";

import { shortLinkRedirect } from "./links";

function follow(path: string) {
  const res = shortLinkRedirect(new URL(`https://therollout.ai${path}`));
  return res ? new URL(res.headers.get("Location") ?? "") : null;
}

describe("short links", () => {
  it("sends /bf to the Black Friday page tagged as email", () => {
    const to = follow("/bf");
    expect(to?.pathname).toBe("/black-friday");
    expect(to?.searchParams.get("utm_medium")).toBe("email");
    expect(to?.searchParams.get("utm_campaign")).toBe("black-friday");
  });

  it("sends /deal to the offer block tagged as sms", () => {
    const to = follow("/deal");
    expect(to?.pathname).toBe("/black-friday");
    expect(to?.hash).toBe("#offer");
    expect(to?.searchParams.get("utm_medium")).toBe("sms");
  });

  it("lets tags on the short link win", () => {
    const to = follow("/deal?utm_campaign=bf-last-day");
    expect(to?.searchParams.get("utm_campaign")).toBe("bf-last-day");
    expect(to?.hash).toBe("#offer");
  });

  it("sends the no-hyphen spelling to the page and keeps its tags", () => {
    expect(follow("/blackfriday")?.pathname).toBe("/black-friday");
    expect(follow("/blackfriday")?.search).toBe("");
    expect(follow("/BlackFriday?utm_source=facebook")?.searchParams.get("utm_source")).toBe("facebook");
  });

  it("ignores paths that aren't short links", () => {
    expect(follow("/black-friday")).toBeNull();
  });
});
