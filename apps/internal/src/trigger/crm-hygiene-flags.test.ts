import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  db as DbType,
  companies,
  contacts,
  crmHygieneFlags,
  engagements,
  interactions,
} from "@strvx/db";
import {
  emailDomain,
  loadWebsiteByCompany,
  normalizeWebsiteHost,
  runCrmHygieneCron,
} from "./crm-hygiene-flags";

const NOW = new Date("2026-05-12T20:00:00Z");

type ContactRow = {
  contactId: string;
  email: string | null;
  companyId: string;
};
type EngagementRow = { id: string; hasRecentInteraction: boolean };
type DuplicateCompanyGroup = {
  k: string;
  rows: Array<{ id: string; created_at: string }>;
};

type MockState = {
  contacts: ContactRow[];
  engagements: EngagementRow[];
  duplicateGroups: DuplicateCompanyGroup[];
  /** Insert returns empty when set — simulates ON CONFLICT DO NOTHING. */
  insertConflicts: Set<string>;
};

function makeMockDb(
  state: MockState,
  companyRows: Array<{ id: string; website: string | null }> = []
) {
  const inserted: Array<{ kind: string; values: Record<string, unknown> }> = [];
  let activeEngIdx = 0;

  const select = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockImplementation((table: unknown) => {
      if (table === contacts) {
        return {
          where: vi.fn().mockResolvedValue(state.contacts),
        };
      }
      if (table === engagements) {
        return {
          where: vi.fn().mockResolvedValue(
            state.engagements.map((e) => ({ id: e.id }))
          ),
        };
      }
      if (table === companies) {
        // Tests that exercise domain_mismatch pass companyRows via
        // makeMockDb's second argument.
        return {
          where: vi.fn().mockResolvedValue(
            companyRows.filter((r) => r.website !== null)
          ),
        };
      }
      if (table === interactions) {
        return {
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(async () => {
              const e = state.engagements[activeEngIdx];
              activeEngIdx++;
              if (!e) return [];
              return e.hasRecentInteraction ? [{ id: "i-1" }] : [];
            }),
          }),
        };
      }
      return {
        where: vi
          .fn()
          .mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
      };
    }),
  }));

  const insert = vi.fn().mockImplementation((table: unknown) => ({
    values: vi.fn().mockImplementation((v: unknown) => {
      const values = v as Record<string, unknown>;
      const conflictKey = [
        values.kind,
        values.entityKind,
        values.entityId,
        values.relatedEntityId ?? "null",
      ].join("|");
      const inConflict = state.insertConflicts.has(conflictKey);
      const onConflictDoNothing = vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(async () => {
          if (inConflict) return [];
          if (table === crmHygieneFlags) {
            inserted.push({
              kind: String(values.kind),
              values,
            });
          }
          return [{ id: "flag-id" }];
        }),
      });
      return { onConflictDoNothing };
    }),
  }));

  const execute = vi.fn().mockImplementation(async () => {
    return state.duplicateGroups;
  });

  return {
    select,
    insert,
    execute,
    _inserted: inserted,
  } as unknown as typeof DbType & {
    _inserted: Array<{ kind: string; values: Record<string, unknown> }>;
  };
}

describe("normalizeWebsiteHost", () => {
  it("strips scheme and www", () => {
    expect(normalizeWebsiteHost("https://www.acme.com")).toBe("acme.com");
    expect(normalizeWebsiteHost("http://acme.com/about")).toBe("acme.com");
    expect(normalizeWebsiteHost("acme.com")).toBe("acme.com");
    expect(normalizeWebsiteHost("www.Acme.com")).toBe("acme.com");
  });
  it("returns null for empty/invalid", () => {
    expect(normalizeWebsiteHost(null)).toBe(null);
    expect(normalizeWebsiteHost("")).toBe(null);
    expect(normalizeWebsiteHost("   ")).toBe(null);
  });
});

describe("emailDomain", () => {
  it("returns the lowercase domain", () => {
    expect(emailDomain("alice@Acme.com")).toBe("acme.com");
    expect(emailDomain("hello@example.co.uk")).toBe("example.co.uk");
  });
  it("returns null for malformed input", () => {
    expect(emailDomain(null)).toBe(null);
    expect(emailDomain("no-at-sign")).toBe(null);
    expect(emailDomain("@nodomain.com")).toBe(null);
    expect(emailDomain("user@")).toBe(null);
  });
});

describe("runCrmHygieneCron", () => {
  beforeEach(() => vi.clearAllMocks());

  it("flags a contact whose email domain doesn't match their company host", async () => {
    const state: MockState = {
      contacts: [
        {
          contactId: "ct-1",
          email: "bob@personal.com",
          companyId: "co-1",
        },
      ],
      engagements: [],
      duplicateGroups: [],
      insertConflicts: new Set(),
    };
    const db = makeMockDb(state);
    const websiteResolver = vi
      .fn()
      .mockResolvedValue(new Map([["co-1", "acme.com"]]));
    const result = await runCrmHygieneCron({
      db,
      now: NOW,
      websiteResolver,
    });
    expect(result.domainMismatchInserted).toBe(1);
    expect(db._inserted[0].kind).toBe("domain_mismatch");
    expect(db._inserted[0].values.entityId).toBe("ct-1");
    expect(db._inserted[0].values.relatedEntityId).toBe("co-1");
  });

  it("skips contact whose email domain matches the company host", async () => {
    const state: MockState = {
      contacts: [
        {
          contactId: "ct-1",
          email: "alice@acme.com",
          companyId: "co-1",
        },
      ],
      engagements: [],
      duplicateGroups: [],
      insertConflicts: new Set(),
    };
    const db = makeMockDb(state);
    const websiteResolver = vi
      .fn()
      .mockResolvedValue(new Map([["co-1", "acme.com"]]));
    const result = await runCrmHygieneCron({
      db,
      now: NOW,
      websiteResolver,
    });
    expect(result.domainMismatchInserted).toBe(0);
  });

  it("flags a stale engagement (no recent interactions)", async () => {
    const state: MockState = {
      contacts: [],
      engagements: [
        { id: "eng-1", hasRecentInteraction: false },
      ],
      duplicateGroups: [],
      insertConflicts: new Set(),
    };
    const db = makeMockDb(state);
    const result = await runCrmHygieneCron({ db, now: NOW });
    expect(result.staleEngagementInserted).toBe(1);
    expect(db._inserted[0].kind).toBe("stale_engagement");
    expect(db._inserted[0].values.entityId).toBe("eng-1");
  });

  it("does NOT flag an engagement with recent activity", async () => {
    const state: MockState = {
      contacts: [],
      engagements: [
        { id: "eng-active", hasRecentInteraction: true },
      ],
      duplicateGroups: [],
      insertConflicts: new Set(),
    };
    const db = makeMockDb(state);
    const result = await runCrmHygieneCron({ db, now: NOW });
    expect(result.staleEngagementInserted).toBe(0);
  });

  it("flags duplicate companies", async () => {
    const state: MockState = {
      contacts: [],
      engagements: [],
      duplicateGroups: [
        {
          k: "acme",
          rows: [
            { id: "co-old", created_at: "2024-01-01T00:00:00Z" },
            { id: "co-new", created_at: "2025-01-01T00:00:00Z" },
          ],
        },
      ],
      insertConflicts: new Set(),
    };
    const db = makeMockDb(state);
    const result = await runCrmHygieneCron({ db, now: NOW });
    expect(result.duplicateCompanyInserted).toBe(1);
    expect(db._inserted[0].kind).toBe("duplicate_company");
    expect(db._inserted[0].values.entityId).toBe("co-old");
    expect(db._inserted[0].values.relatedEntityId).toBe("co-new");
  });

  it("is idempotent: ON CONFLICT DO NOTHING does not double-insert", async () => {
    const conflictKey = "stale_engagement|engagement|eng-1|null";
    const state: MockState = {
      contacts: [],
      engagements: [{ id: "eng-1", hasRecentInteraction: false }],
      duplicateGroups: [],
      insertConflicts: new Set([conflictKey]),
    };
    const db = makeMockDb(state);
    const result = await runCrmHygieneCron({ db, now: NOW });
    expect(result.staleEngagementInserted).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// loadWebsiteByCompany — exercises the companies.website plumbing
// added in migration 018 + the host normalization pipeline.
// ---------------------------------------------------------------------------

type CompanyRow = { id: string; website: string | null };

function makeCompaniesDb(rows: CompanyRow[]) {
  const select = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockImplementation((table: unknown) => {
      if (table === companies) {
        return {
          where: vi.fn().mockResolvedValue(
            // simulate the isNotNull filter at the mock layer
            rows.filter((r) => r.website !== null)
          ),
        };
      }
      return { where: vi.fn().mockResolvedValue([]) };
    }),
  }));
  return { select } as unknown as typeof DbType;
}

describe("loadWebsiteByCompany", () => {
  it("returns a map of companyId → normalized host", async () => {
    const db = makeCompaniesDb([
      { id: "co-1", website: "https://www.acme.com" },
      { id: "co-2", website: "acme.org/about" },
      { id: "co-3", website: "http://example.co.uk/" },
    ]);
    const map = await loadWebsiteByCompany(db);
    expect(map.get("co-1")).toBe("acme.com");
    expect(map.get("co-2")).toBe("acme.org");
    expect(map.get("co-3")).toBe("example.co.uk");
  });

  it("omits companies with un-parseable websites", async () => {
    const db = makeCompaniesDb([
      { id: "co-good", website: "https://acme.com" },
      { id: "co-blank", website: "   " },
    ]);
    const map = await loadWebsiteByCompany(db);
    expect(map.has("co-good")).toBe(true);
    expect(map.has("co-blank")).toBe(false);
  });

  it("activates the domain_mismatch detection end-to-end", async () => {
    // domain_mismatch fires when the contact email's domain differs
    // from the normalized company host. We mock the same MockDb but
    // teach it to return companies.website rows for this case.
    const websiteRows: CompanyRow[] = [
      { id: "co-1", website: "https://www.acme.com/" },
    ];
    const state: MockState = {
      contacts: [
        { contactId: "ct-1", email: "bob@personal.com", companyId: "co-1" },
        { contactId: "ct-2", email: "alice@acme.com", companyId: "co-1" },
      ],
      engagements: [],
      duplicateGroups: [],
      insertConflicts: new Set(),
    };
    const db = makeMockDb(state, websiteRows);

    const result = await runCrmHygieneCron({ db, now: NOW });
    expect(result.domainMismatchInserted).toBe(1);
    expect(db._inserted[0].kind).toBe("domain_mismatch");
    expect(db._inserted[0].values.entityId).toBe("ct-1");
    expect(
      (db._inserted[0].values.details as { company_host: string }).company_host
    ).toBe("acme.com");
  });

  it("normalizes www/scheme/trailing-slash when joining contact to company", async () => {
    // The contact email domain has no www; the company website does.
    // After normalization both should be "acme.com" and we should
    // NOT flag a mismatch.
    const websiteRows: CompanyRow[] = [
      { id: "co-1", website: "https://www.acme.com/" },
    ];
    const state: MockState = {
      contacts: [
        { contactId: "ct-1", email: "bob@acme.com", companyId: "co-1" },
      ],
      engagements: [],
      duplicateGroups: [],
      insertConflicts: new Set(),
    };
    const db = makeMockDb(state, websiteRows);
    const result = await runCrmHygieneCron({ db, now: NOW });
    expect(result.domainMismatchInserted).toBe(0);
  });
});
