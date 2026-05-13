import { describe, it, expect, vi, beforeEach } from "vitest";
import type { db as DbType } from "@strvx/db";
import {
  fetchAnalyticsSummary,
  fetchAnalyticsPerKind,
  fetchAnalyticsPerMailbox,
  fetchAnalyticsSparklines,
} from "./_queries";

const NOW = new Date("2026-05-12T12:00:00Z");

// ── Mock DB factory ────────────────────────────────────────────────────────

type DbResponseSet = {
  summary?: Array<Record<string, unknown>>;
  perKind?: Array<Record<string, unknown>>;
  sparklines?: Array<Record<string, unknown>>;
};

function makeFakeDb(rs: DbResponseSet) {
  // We dispatch by call sequence: summary uses .where() then resolves,
  // perKind uses .where().groupBy() then resolves, sparklines uses
  // .where().groupBy().orderBy() then resolves. We mimic that shape.
  const select = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockImplementation((..._args: unknown[]) => {
        // Return a thenable that also has groupBy/orderBy chain methods.
        const result: Array<Record<string, unknown>> = rs.summary ?? [];

        // Stub for perKind chain (where → groupBy → result).
        const perKindChain = {
          then: (resolve: (v: unknown) => void) =>
            resolve(rs.perKind ?? []),
        };

        // Stub for sparkline chain (where → groupBy → orderBy → result).
        const sparklineChain = {
          then: (resolve: (v: unknown) => void) =>
            resolve(rs.sparklines ?? []),
        };

        return {
          // Summary case: when .where() result is awaited directly.
          then: (resolve: (v: unknown) => void) => resolve(result),
          // Per-kind & sparklines cases:
          groupBy: vi.fn().mockImplementation(() => ({
            then: perKindChain.then,
            orderBy: vi.fn().mockImplementation(() => sparklineChain),
          })),
        };
      }),
    }),
  }));
  return { select } as unknown as typeof DbType;
}

describe("fetchAnalyticsSummary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns zeros when there are no runs", async () => {
    const db = makeFakeDb({
      summary: [{ total: 0, totalCost: 0, succeeded: 0, p50: 0, p95: 0 }],
    });
    const out = await fetchAnalyticsSummary(NOW, db);
    expect(out).toEqual({
      totalRuns: 0,
      totalCostUsd: 0,
      successRatePct: 0,
      p50DurationMs: 0,
      p95DurationMs: 0,
    });
  });

  it("computes success rate from total/succeeded counts", async () => {
    const db = makeFakeDb({
      summary: [
        {
          total: 10,
          totalCost: 1.25,
          succeeded: 8,
          p50: 1234.5,
          p95: 5678.9,
        },
      ],
    });
    const out = await fetchAnalyticsSummary(NOW, db);
    expect(out.totalRuns).toBe(10);
    expect(out.totalCostUsd).toBe(1.25);
    expect(out.successRatePct).toBe(80);
    expect(out.p50DurationMs).toBe(1235);
    expect(out.p95DurationMs).toBe(5679);
  });

  it("handles null aggregate fields as 0", async () => {
    const db = makeFakeDb({
      summary: [
        {
          total: 5,
          totalCost: null,
          succeeded: null,
          p50: null,
          p95: null,
        },
      ],
    });
    const out = await fetchAnalyticsSummary(NOW, db);
    expect(out.totalRuns).toBe(5);
    expect(out.totalCostUsd).toBe(0);
    expect(out.successRatePct).toBe(0);
    expect(out.p50DurationMs).toBe(0);
  });

  it("clamps success rate at 100% when total = 0", async () => {
    const db = makeFakeDb({ summary: [] });
    const out = await fetchAnalyticsSummary(NOW, db);
    expect(out.successRatePct).toBe(0);
  });
});

describe("fetchAnalyticsPerKind", () => {
  beforeEach(() => vi.clearAllMocks());

  it("computes per-kind aggregates", async () => {
    const db = makeFakeDb({
      perKind: [
        {
          kind: "plan",
          runs: 4,
          succeeded: 3,
          avgCost: 0.02,
          totalCost: 0.08,
          avgInput: 1000,
          avgOutput: 250,
          p50: 1500,
          p95: 3000,
        },
        {
          kind: "classify",
          runs: 20,
          succeeded: 20,
          avgCost: 0.001,
          totalCost: 0.02,
          avgInput: 200,
          avgOutput: 50,
          p50: 400,
          p95: 800,
        },
      ],
    });
    const out = await fetchAnalyticsPerKind(NOW, db);
    expect(out).toHaveLength(2);

    const planRow = out.find((r) => r.kind === "plan")!;
    expect(planRow.runs).toBe(4);
    expect(planRow.successRatePct).toBe(75);
    expect(planRow.avgCostUsd).toBe(0.02);
    expect(planRow.totalCostUsd).toBe(0.08);
    expect(planRow.avgInputTokens).toBe(1000);
    expect(planRow.avgOutputTokens).toBe(250);
    expect(planRow.p50DurationMs).toBe(1500);
    expect(planRow.p95DurationMs).toBe(3000);

    const classifyRow = out.find((r) => r.kind === "classify")!;
    expect(classifyRow.successRatePct).toBe(100);
  });

  it("returns [] when no rows", async () => {
    const db = makeFakeDb({ perKind: [] });
    const out = await fetchAnalyticsPerKind(NOW, db);
    expect(out).toEqual([]);
  });

  it("treats 0-run kinds as 0% success rate", async () => {
    const db = makeFakeDb({
      perKind: [
        {
          kind: "draft",
          runs: 0,
          succeeded: 0,
          avgCost: 0,
          totalCost: 0,
          avgInput: 0,
          avgOutput: 0,
          p50: 0,
          p95: 0,
        },
      ],
    });
    const out = await fetchAnalyticsPerKind(NOW, db);
    expect(out[0].successRatePct).toBe(0);
  });
});

describe("fetchAnalyticsSparklines", () => {
  beforeEach(() => vi.clearAllMocks());

  it("buckets daily counts per kind, padded to the full 30-day window", async () => {
    const db = makeFakeDb({
      sparklines: [
        { kind: "plan", day: "2026-05-12", count: 3 },
        { kind: "plan", day: "2026-05-11", count: 2 },
        { kind: "classify", day: "2026-05-12", count: 10 },
      ],
    });
    const out = await fetchAnalyticsSparklines(NOW, db);
    expect(out).toHaveLength(2);

    const planSpark = out.find((s) => s.kind === "plan")!;
    // 30-ish days of scaffold (inclusive start..now → 31 buckets).
    expect(planSpark.buckets.length).toBeGreaterThanOrEqual(30);
    const may12 = planSpark.buckets.find((b) => b.date === "2026-05-12");
    const may11 = planSpark.buckets.find((b) => b.date === "2026-05-11");
    const may10 = planSpark.buckets.find((b) => b.date === "2026-05-10");
    expect(may12?.count).toBe(3);
    expect(may11?.count).toBe(2);
    expect(may10?.count).toBe(0);

    const classifySpark = out.find((s) => s.kind === "classify")!;
    expect(
      classifySpark.buckets.find((b) => b.date === "2026-05-12")?.count
    ).toBe(10);
  });

  it("returns [] when no rows", async () => {
    const db = makeFakeDb({ sparklines: [] });
    const out = await fetchAnalyticsSparklines(NOW, db);
    expect(out).toEqual([]);
  });

  it("sorts kinds alphabetically", async () => {
    const db = makeFakeDb({
      sparklines: [
        { kind: "scheduling", day: "2026-05-12", count: 1 },
        { kind: "brief", day: "2026-05-12", count: 1 },
        { kind: "plan", day: "2026-05-12", count: 1 },
      ],
    });
    const out = await fetchAnalyticsSparklines(NOW, db);
    expect(out.map((s) => s.kind)).toEqual(["brief", "plan", "scheduling"]);
  });
});

// ── Per-mailbox fixture ────────────────────────────────────────────────────
//
// fetchAnalyticsPerMailbox issues three select() calls in order:
//   1) active mailboxes (.from().where())
//   2) per-mailbox aggregate (.from().where().groupBy())
//   3) per-day sparklines (.from().where().groupBy())
// We dispatch by select-call sequence.

function makePerMailboxDb({
  mailboxes,
  aggregates,
  sparklines,
}: {
  mailboxes: Array<{ id: string; email: string }>;
  aggregates: Array<{
    mailboxId: string | null;
    runs: number;
    succeeded: number;
    totalCost: number;
  }>;
  sparklines: Array<{
    mailboxId: string | null;
    day: string;
    count: number;
  }>;
}) {
  let callCount = 0;
  const select = vi.fn().mockImplementation(() => {
    callCount += 1;
    const current = callCount;
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          // For call #1, this is the terminal node (no groupBy).
          if (current === 1) {
            return {
              then: (resolve: (v: unknown) => void) => resolve(mailboxes),
              groupBy: vi.fn(),
            };
          }
          if (current === 2) {
            return {
              groupBy: vi.fn().mockImplementation(() => ({
                then: (resolve: (v: unknown) => void) => resolve(aggregates),
              })),
            };
          }
          // call #3: sparklines.
          return {
            groupBy: vi.fn().mockImplementation(() => ({
              then: (resolve: (v: unknown) => void) => resolve(sparklines),
            })),
          };
        }),
      }),
    };
  });
  return { select } as unknown as typeof DbType;
}

describe("fetchAnalyticsPerMailbox", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns [] when no active mailboxes exist", async () => {
    const db = makePerMailboxDb({
      mailboxes: [],
      aggregates: [],
      sparklines: [],
    });
    const out = await fetchAnalyticsPerMailbox(NOW, db);
    expect(out).toEqual([]);
  });

  it("returns one row per active mailbox, with zero-runs entries included", async () => {
    const db = makePerMailboxDb({
      mailboxes: [
        { id: "m1", email: "team-a@strvx.com" },
        { id: "m2", email: "team-b@strvx.com" },
      ],
      aggregates: [
        { mailboxId: "m1", runs: 12, succeeded: 10, totalCost: 0.4 },
      ],
      sparklines: [
        { mailboxId: "m1", day: "2026-05-12", count: 4 },
        { mailboxId: "m1", day: "2026-05-11", count: 3 },
      ],
    });
    const out = await fetchAnalyticsPerMailbox(NOW, db);
    expect(out).toHaveLength(2);

    const m1 = out.find((r) => r.mailboxId === "m1")!;
    expect(m1.email).toBe("team-a@strvx.com");
    expect(m1.runs).toBe(12);
    expect(m1.succeeded).toBe(10);
    expect(m1.costUsd).toBe(0.4);
    expect(m1.dailyCounts).toHaveLength(15);
    // Newest bucket should be 4 (2026-05-12).
    expect(m1.dailyCounts[m1.dailyCounts.length - 1]).toBe(4);
    expect(m1.dailyCounts[m1.dailyCounts.length - 2]).toBe(3);

    const m2 = out.find((r) => r.mailboxId === "m2")!;
    expect(m2.runs).toBe(0);
    expect(m2.costUsd).toBe(0);
    expect(m2.dailyCounts.every((c) => c === 0)).toBe(true);
  });

  it("sorts by runs desc then email asc", async () => {
    const db = makePerMailboxDb({
      mailboxes: [
        { id: "m1", email: "alpha@strvx.com" },
        { id: "m2", email: "beta@strvx.com" },
        { id: "m3", email: "gamma@strvx.com" },
      ],
      aggregates: [
        { mailboxId: "m1", runs: 5, succeeded: 5, totalCost: 0.1 },
        { mailboxId: "m3", runs: 10, succeeded: 7, totalCost: 0.2 },
      ],
      sparklines: [],
    });
    const out = await fetchAnalyticsPerMailbox(NOW, db);
    expect(out.map((r) => r.mailboxId)).toEqual(["m3", "m1", "m2"]);
  });

  it("ignores aggregates rows where mailboxId is null", async () => {
    const db = makePerMailboxDb({
      mailboxes: [{ id: "m1", email: "team-a@strvx.com" }],
      aggregates: [
        { mailboxId: null, runs: 99, succeeded: 99, totalCost: 9 },
        { mailboxId: "m1", runs: 1, succeeded: 1, totalCost: 0.01 },
      ],
      sparklines: [],
    });
    const out = await fetchAnalyticsPerMailbox(NOW, db);
    expect(out).toHaveLength(1);
    expect(out[0].runs).toBe(1);
  });
});
