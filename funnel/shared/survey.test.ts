import { describe, expect, it } from "vitest";

import {
  AI_STAGES,
  cleanCompany,
  cleanEmail,
  cleanName,
  isOption,
  labelFor,
  normalisePhone,
  normaliseWebsite,
} from "./survey";

describe("normalisePhone", () => {
  it("turns an Australian mobile typed the local way into +61", () => {
    expect(normalisePhone("0412 345 678", "+61")).toBe("+61412345678");
    expect(normalisePhone("(04) 1234-5678", "+61")).toBe("+61412345678");
  });

  it("lets a pasted international number win over the country picker", () => {
    expect(normalisePhone("+44 7700 900123", "+61")).toBe("+447700900123");
    expect(normalisePhone("0064 21 123 4567", "+61")).toBe("+64211234567");
  });

  it("needs a country code when the number doesn't carry one", () => {
    expect(normalisePhone("0412 345 678", null)).toBeNull();
    expect(normalisePhone("0412 345 678", "other")).toBeNull();
  });

  it("rejects things that can't be a phone number", () => {
    expect(normalisePhone("", "+61")).toBeNull();
    expect(normalisePhone("123", "+61")).toBeNull();
    expect(normalisePhone("+1234567890123456", "+61")).toBeNull();
    expect(normalisePhone(42, "+61")).toBeNull();
  });
});

describe("normaliseWebsite", () => {
  it("strips the scheme, www and trailing slash", () => {
    expect(normaliseWebsite("https://www.Acme.com.au/")).toBe("acme.com.au");
    expect(normaliseWebsite("acme.com.au/services/")).toBe("acme.com.au/services");
  });

  it("rejects text that isn't a site", () => {
    expect(normaliseWebsite("we don't have one")).toBeNull();
    expect(normaliseWebsite("localhost")).toBeNull();
    expect(normaliseWebsite("")).toBeNull();
  });
});

describe("cleanName", () => {
  it("keeps real names, accents and hyphens included", () => {
    expect(cleanName("  Zoë O'Brien-Smith ")).toBe("Zoë O'Brien-Smith");
  });

  it("drops markup and anything that isn't part of a name", () => {
    expect(cleanName("<script>alert(1)</script>Sam")).toBe("alertSam");
    expect(cleanName("{{first name}}")).toBe("first name");
    expect(cleanName("   ")).toBeNull();
  });
});

describe("cleanCompany", () => {
  it("keeps real company names, punctuation and digits included", () => {
    expect(cleanCompany("  Smith & Co.  ")).toBe("Smith & Co.");
    expect(cleanCompany("ACME (Aust) Pty Ltd")).toBe("ACME (Aust) Pty Ltd");
    expect(cleanCompany("4 Pines")).toBe("4 Pines");
  });

  it("drops markup, collapses spaces and rejects blanks", () => {
    expect(cleanCompany("<b>Real</b>   Balance")).toBe("Real Balance");
    expect(cleanCompany("   ")).toBeNull();
    expect(cleanCompany(42)).toBeNull();
  });
});

describe("cleanEmail", () => {
  it("trims and lowercases", () => {
    expect(cleanEmail("  Sam@Acme.COM.au ")).toBe("sam@acme.com.au");
  });

  it("rejects non-emails", () => {
    expect(cleanEmail("sam@acme")).toBeNull();
    expect(cleanEmail("not an email")).toBeNull();
    expect(cleanEmail(`${"a".repeat(250)}@x.co`)).toBeNull();
  });
});

describe("survey options", () => {
  it("only accepts values the survey offers", () => {
    expect(isOption(AI_STAGES, "pilots")).toBe(true);
    expect(isOption(AI_STAGES, "<script>")).toBe(false);
    expect(labelFor(AI_STAGES, "live")).toBe("Live, a few things in production");
    expect(labelFor(AI_STAGES, "nope")).toBeNull();
  });
});
