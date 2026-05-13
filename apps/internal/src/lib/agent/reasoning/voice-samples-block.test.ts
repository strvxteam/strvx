import { describe, it, expect, vi, beforeEach } from "vitest";

const queryRows: unknown[] = [];

vi.mock("@strvx/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@strvx/db")>();
  const select = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(async () => queryRows),
          }),
        }),
      }),
    }),
  }));
  return { ...actual, db: { select } };
});

vi.mock("@/trigger/_sentry", () => ({
  recordCosRunFailedBreadcrumb: vi.fn(),
}));

import { loadVoiceSamplesBlock } from "./plan-thread";

function setRows(rows: unknown[]) {
  queryRows.length = 0;
  for (const r of rows) queryRows.push(r);
}

describe("loadVoiceSamplesBlock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no samples exist", async () => {
    setRows([]);
    const out = await loadVoiceSamplesBlock("mb-1");
    expect(out).toBeNull();
  });

  it("formats samples with subject + to + body and the canonical header", async () => {
    setRows([
      {
        sampleCreatedAt: new Date("2026-05-10T10:00:00Z"),
        messageId: "msg-1",
        subject: "Welcome to STRVX",
        sentAt: new Date("2026-05-09T10:00:00Z"),
        toEmails: ["lead@example.com"],
        bodyText: "Thanks for reaching out — really excited to chat next week.",
        bodyHtml: null,
        note: null,
      },
    ]);
    const out = await loadVoiceSamplesBlock("mb-1");
    expect(out).toContain("Voice samples (canonical outbound to match tone)");
    expect(out).toContain("Subject: Welcome to STRVX");
    expect(out).toContain("To: lead@example.com");
    expect(out).toContain("Thanks for reaching out");
  });

  it("strips HTML when bodyText is empty", async () => {
    setRows([
      {
        sampleCreatedAt: new Date(),
        messageId: "msg-2",
        subject: "Hi",
        sentAt: new Date(),
        toEmails: [],
        bodyText: null,
        bodyHtml: "<p>Hello <strong>world</strong>!</p><script>x</script>",
        note: null,
      },
    ]);
    const out = await loadVoiceSamplesBlock("mb-1");
    // HTML tags are replaced with spaces so the readable text shows up.
    expect(out).toMatch(/Hello\s+world/);
    expect(out).not.toContain("<p>");
    expect(out).not.toContain("<script>");
  });

  it("truncates body text at 400 chars with an ellipsis", async () => {
    const longBody = "a".repeat(600);
    setRows([
      {
        sampleCreatedAt: new Date(),
        messageId: "msg-3",
        subject: "long",
        sentAt: new Date(),
        toEmails: ["x@example.com"],
        bodyText: longBody,
        bodyHtml: null,
        note: null,
      },
    ]);
    const out = await loadVoiceSamplesBlock("mb-1");
    expect(out).toContain("…");
    // 400 a's + ellipsis appears
    expect(out).toMatch(/a{400}…/);
    expect(out?.includes("a".repeat(401))).toBe(false);
  });

  it("includes optional note field when present", async () => {
    setRows([
      {
        sampleCreatedAt: new Date(),
        messageId: "msg-4",
        subject: "Re: deck",
        sentAt: new Date(),
        toEmails: ["client@example.com"],
        bodyText: "Here's the deck.",
        bodyHtml: null,
        note: "warm-but-concise style",
      },
    ]);
    const out = await loadVoiceSamplesBlock("mb-1");
    expect(out).toContain("Note: warm-but-concise style");
  });

  it("numbers samples sequentially", async () => {
    setRows([
      {
        sampleCreatedAt: new Date("2026-05-10"),
        messageId: "m1",
        subject: "first",
        sentAt: new Date(),
        toEmails: [],
        bodyText: "alpha",
        bodyHtml: null,
        note: null,
      },
      {
        sampleCreatedAt: new Date("2026-05-09"),
        messageId: "m2",
        subject: "second",
        sentAt: new Date(),
        toEmails: [],
        bodyText: "beta",
        bodyHtml: null,
        note: null,
      },
    ]);
    const out = await loadVoiceSamplesBlock("mb-1");
    expect(out).toContain("--- Sample 1 ---");
    expect(out).toContain("--- Sample 2 ---");
    // Ordering: first row stays first.
    expect((out as string).indexOf("Sample 1")).toBeLessThan(
      (out as string).indexOf("Sample 2")
    );
  });
});
