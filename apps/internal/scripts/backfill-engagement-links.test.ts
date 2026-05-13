import { describe, it, expect } from "vitest";
import { findEngagementForParticipants } from "./backfill-engagement-links";

type EngagementRow = {
  id: string;
  primaryContactId: string | null;
  companyId: string;
  createdAt: Date;
};

type ContactRow = {
  id: string;
  email: string | null;
  companyId: string;
};

function buildFixture(opts: {
  contacts?: ContactRow[];
  engagementsByPrimary?: Record<string, EngagementRow[]>;
  engagementsByCompany?: Record<string, EngagementRow[]>;
}) {
  const contactsByEmail = new Map<string, ContactRow>();
  for (const c of opts.contacts ?? []) {
    if (c.email) contactsByEmail.set(c.email.toLowerCase(), c);
  }
  return {
    contactsByEmail,
    engagementsByPrimaryContactId: new Map<string, EngagementRow[]>(
      Object.entries(opts.engagementsByPrimary ?? {})
    ),
    engagementsByCompanyId: new Map<string, EngagementRow[]>(
      Object.entries(opts.engagementsByCompany ?? {})
    ),
  };
}

const DATE = new Date("2026-05-12T00:00:00Z");

describe("findEngagementForParticipants", () => {
  it("returns no_match when there are no external participants", () => {
    const fix = buildFixture({});
    const res = findEngagementForParticipants({
      participants: [{ email: "agent@strvx.com" }],
      ...fix,
    });
    expect(res).toEqual({ kind: "no_match" });
  });

  it("returns no_match when external email has no contact row", () => {
    const fix = buildFixture({});
    const res = findEngagementForParticipants({
      participants: [{ email: "stranger@example.com" }],
      ...fix,
    });
    expect(res).toEqual({ kind: "no_match" });
  });

  it("matches via primary_contact when contact has an engagement", () => {
    const fix = buildFixture({
      contacts: [{ id: "c1", email: "alice@acme.com", companyId: "co-acme" }],
      engagementsByPrimary: {
        c1: [
          {
            id: "eng-1",
            primaryContactId: "c1",
            companyId: "co-acme",
            createdAt: DATE,
          },
        ],
      },
    });
    const res = findEngagementForParticipants({
      participants: [
        { email: "agent@strvx.com" },
        { email: "alice@acme.com" },
      ],
      ...fix,
    });
    expect(res).toEqual({ kind: "match", engagementId: "eng-1" });
  });

  it("uses the most-recent engagement (caller pre-sorts the array)", () => {
    const fix = buildFixture({
      contacts: [{ id: "c1", email: "alice@acme.com", companyId: "co-acme" }],
      engagementsByPrimary: {
        c1: [
          {
            id: "eng-newest",
            primaryContactId: "c1",
            companyId: "co-acme",
            createdAt: new Date("2026-04-01"),
          },
          {
            id: "eng-old",
            primaryContactId: "c1",
            companyId: "co-acme",
            createdAt: new Date("2025-01-01"),
          },
        ],
      },
    });
    const res = findEngagementForParticipants({
      participants: [{ email: "alice@acme.com" }],
      ...fix,
    });
    expect(res).toEqual({ kind: "match", engagementId: "eng-newest" });
  });

  it("falls back to company engagement when no primary_contact match", () => {
    const fix = buildFixture({
      contacts: [{ id: "c1", email: "alice@acme.com", companyId: "co-acme" }],
      engagementsByCompany: {
        "co-acme": [
          {
            id: "eng-via-company",
            primaryContactId: null,
            companyId: "co-acme",
            createdAt: DATE,
          },
        ],
      },
    });
    const res = findEngagementForParticipants({
      participants: [{ email: "alice@acme.com" }],
      ...fix,
    });
    expect(res).toEqual({ kind: "match", engagementId: "eng-via-company" });
  });

  it("returns ambiguous when distinct primary-contact engagements collide", () => {
    const fix = buildFixture({
      contacts: [
        { id: "c1", email: "alice@acme.com", companyId: "co-acme" },
        { id: "c2", email: "bob@beta.com", companyId: "co-beta" },
      ],
      engagementsByPrimary: {
        c1: [
          {
            id: "eng-a",
            primaryContactId: "c1",
            companyId: "co-acme",
            createdAt: DATE,
          },
        ],
        c2: [
          {
            id: "eng-b",
            primaryContactId: "c2",
            companyId: "co-beta",
            createdAt: DATE,
          },
        ],
      },
    });
    const res = findEngagementForParticipants({
      participants: [
        { email: "alice@acme.com" },
        { email: "bob@beta.com" },
      ],
      ...fix,
    });
    expect(res.kind).toBe("ambiguous");
    if (res.kind === "ambiguous") {
      expect(res.candidates.sort()).toEqual(["eng-a", "eng-b"]);
    }
  });

  it("prefers primary-contact hits over company fallback when both exist on different participants", () => {
    const fix = buildFixture({
      contacts: [
        { id: "c1", email: "alice@acme.com", companyId: "co-acme" },
        { id: "c2", email: "bob@beta.com", companyId: "co-beta" },
      ],
      engagementsByPrimary: {
        c1: [
          {
            id: "eng-direct",
            primaryContactId: "c1",
            companyId: "co-acme",
            createdAt: DATE,
          },
        ],
      },
      engagementsByCompany: {
        "co-beta": [
          {
            id: "eng-fallback",
            primaryContactId: null,
            companyId: "co-beta",
            createdAt: DATE,
          },
        ],
      },
    });
    const res = findEngagementForParticipants({
      participants: [
        { email: "alice@acme.com" },
        { email: "bob@beta.com" },
      ],
      ...fix,
    });
    expect(res).toEqual({ kind: "match", engagementId: "eng-direct" });
  });

  it("ignores @strvx.com participants regardless of case", () => {
    const fix = buildFixture({
      contacts: [
        { id: "c1", email: "AGENT@strvx.com", companyId: "co-x" },
      ],
    });
    const res = findEngagementForParticipants({
      participants: [{ email: "Agent@STRVX.com" }],
      ...fix,
    });
    expect(res).toEqual({ kind: "no_match" });
  });

  it("de-duplicates when the same engagement matches multiple participants", () => {
    const fix = buildFixture({
      contacts: [
        { id: "c1", email: "alice@acme.com", companyId: "co-acme" },
        { id: "c2", email: "alice2@acme.com", companyId: "co-acme" },
      ],
      engagementsByPrimary: {
        c1: [
          {
            id: "eng-shared",
            primaryContactId: "c1",
            companyId: "co-acme",
            createdAt: DATE,
          },
        ],
        c2: [
          {
            id: "eng-shared",
            primaryContactId: "c2",
            companyId: "co-acme",
            createdAt: DATE,
          },
        ],
      },
    });
    const res = findEngagementForParticipants({
      participants: [
        { email: "alice@acme.com" },
        { email: "alice2@acme.com" },
      ],
      ...fix,
    });
    expect(res).toEqual({ kind: "match", engagementId: "eng-shared" });
  });
});
