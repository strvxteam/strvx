import { describe, expect, it } from "vitest";
import { slugify, personSlug, companySlug } from "../src/util/slug.ts";

describe("slugify", () => {
  it("lowercases ASCII strings", () => {
    expect(slugify("Acme Corp")).toBe("acme-corp");
  });

  it("strips non-alphanumeric characters", () => {
    expect(slugify("Acme & Co.")).toBe("acme-co");
  });

  it("collapses repeated separators", () => {
    expect(slugify("acme   q4__platform")).toBe("acme-q4-platform");
  });

  it("trims leading + trailing separators", () => {
    expect(slugify("--acme--")).toBe("acme");
  });

  it("returns empty string for input with no slug-safe characters", () => {
    expect(slugify("???")).toBe("");
  });

  it("is deterministic across runs", () => {
    expect(slugify("Acme Q4 platform")).toBe(slugify("Acme Q4 platform"));
  });
});

describe("personSlug", () => {
  it("normalizes a first-last name", () => {
    expect(personSlug("Jane Doe")).toBe("jane-doe");
  });

  it("falls back to 'unknown' for empty input", () => {
    expect(personSlug("")).toBe("unknown");
  });
});

describe("companySlug", () => {
  it("strips corporate suffixes", () => {
    expect(companySlug("Acme Inc")).toBe("acme");
    expect(companySlug("Acme Corp.")).toBe("acme");
    expect(companySlug("Widget LLC")).toBe("widget");
  });

  it("preserves names without a suffix", () => {
    expect(companySlug("Coastal Pathways Foundation")).toBe(
      "coastal-pathways-foundation",
    );
  });

  it("falls back to the full slug when stripping leaves nothing", () => {
    // "Inc" alone shouldn't yield empty.
    expect(companySlug("Inc")).toBe("inc");
  });
});
