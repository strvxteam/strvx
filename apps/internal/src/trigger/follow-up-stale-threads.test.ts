import { describe, it, expect, vi, beforeEach } from "vitest";
import { db as DbType, emailThreads, followUpWatchers } from "@strvx/db";
import { runStaleThreadsCron } from "./follow-up-stale-threads";

const NOW = new Date("2026-05-12T20:00:00Z");

type ThreadRow = {
  threadId: string;
  engagementId: string | null;
  lastOutboundAt: Date | null;
  lastInboundAt: Date | null;
};

type MockState = {
  candidateThreads: ThreadRow[];
  /** Any prior fired stale_thread watcher rows. Throttle check matches against these. */
  firedStaleThreads: Array<{
    threadId: string | null;
    engagementId: string | null;
    firedAt: Date;
  }>;
  /** Any currently-pending stale_thread watchers, keyed by threadId. */
  pendingStaleThreads: Set<string>;
};

function makeMockDb(state: MockState) {
  const insertedRows: Array<Record<string, unknown>> = [];
  const insertValuesSpy = vi.fn();

  const followUpCallTracker = { phase: 0 as 0 | 1 | 2 };

  const select = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockImplementation((table: unknown) => {
      if (table === emailThreads) {
        return {
          where: vi
            .fn()
            .mockResolvedValue(
              state.candidateThreads.map((c) => ({
                threadId: c.threadId,
                engagementId: c.engagementId,
                lastOutboundAt: c.lastOutboundAt,
                lastInboundAt: c.lastInboundAt,
              }))
            ),
        };
      }
      if (table === followUpWatchers) {
        // For each candidate, the cron makes two sequential .select().from(followUpWatchers).where(...).limit(1) calls:
        //   1) throttle check (firedAt > cutoff)
        //   2) pending check
        return {
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(async () => {
              const phase = followUpCallTracker.phase;
              followUpCallTracker.phase = phase === 0 ? 1 : 0;
              if (phase === 0) {
                // throttle check — return non-empty if any fired stale row.
                return state.firedStaleThreads.length > 0
                  ? [{ id: "fired-watcher" }]
                  : [];
              }
              // pending check
              return state.pendingStaleThreads.size > 0
                ? [{ id: "pending-watcher" }]
                : [];
            }),
          }),
        };
      }
      return { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) };
    }),
  }));

  const insert = vi.fn().mockImplementation(() => ({
    values: vi.fn().mockImplementation((v: unknown) => {
      insertValuesSpy(v);
      insertedRows.push(v as Record<string, unknown>);
      return Promise.resolve({ rowCount: 1 });
    }),
  }));

  return {
    select,
    insert,
    _inserted: insertedRows,
    _insertValuesSpy: insertValuesSpy,
  } as unknown as typeof DbType & {
    _inserted: Array<Record<string, unknown>>;
    _insertValuesSpy: ReturnType<typeof vi.fn>;
  };
}

describe("runStaleThreadsCron", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts a stale_thread watcher for a candidate without throttle/pending", async () => {
    const state: MockState = {
      candidateThreads: [
        {
          threadId: "thr-1",
          engagementId: "eng-1",
          lastOutboundAt: new Date("2026-05-05T20:00:00Z"), // 7 days ago
          lastInboundAt: null,
        },
      ],
      firedStaleThreads: [],
      pendingStaleThreads: new Set(),
    };
    const db = makeMockDb(state);

    const result = await runStaleThreadsCron({ db, now: NOW });
    expect(result.candidates).toBe(1);
    expect(result.results[0].outcome).toBe("inserted");
    expect(result.results[0].daysSinceOutbound).toBe(7);
    expect(db._inserted.length).toBe(1);
    const v = db._inserted[0];
    expect(v.kind).toBe("stale_thread");
    expect(v.threadId).toBe("thr-1");
    expect(v.engagementId).toBe("eng-1");
    expect(v.status).toBe("pending");
    const cfg = v.ruleConfig as Record<string, unknown>;
    expect(cfg.origin).toBe("stale_threads_cron");
    expect(cfg.days_since_outbound).toBe(7);
  });

  it("skips a candidate when an existing stale watcher fired within the throttle window", async () => {
    const state: MockState = {
      candidateThreads: [
        {
          threadId: "thr-1",
          engagementId: "eng-1",
          lastOutboundAt: new Date("2026-05-05T20:00:00Z"),
          lastInboundAt: null,
        },
      ],
      firedStaleThreads: [
        {
          threadId: "thr-1",
          engagementId: "eng-1",
          firedAt: new Date("2026-05-08T00:00:00Z"),
        },
      ],
      pendingStaleThreads: new Set(),
    };
    const db = makeMockDb(state);

    const result = await runStaleThreadsCron({ db, now: NOW });
    expect(result.results[0].outcome).toBe("throttled");
    expect(db._inserted.length).toBe(0);
  });

  it("skips a candidate when a pending stale_thread watcher already exists", async () => {
    const state: MockState = {
      candidateThreads: [
        {
          threadId: "thr-1",
          engagementId: null,
          lastOutboundAt: new Date("2026-05-05T20:00:00Z"),
          lastInboundAt: null,
        },
      ],
      firedStaleThreads: [],
      pendingStaleThreads: new Set(["thr-1"]),
    };
    const db = makeMockDb(state);

    const result = await runStaleThreadsCron({ db, now: NOW });
    expect(result.results[0].outcome).toBe("already_pending");
    expect(db._inserted.length).toBe(0);
  });

  it("handles zero candidates cleanly", async () => {
    const state: MockState = {
      candidateThreads: [],
      firedStaleThreads: [],
      pendingStaleThreads: new Set(),
    };
    const db = makeMockDb(state);
    const result = await runStaleThreadsCron({ db, now: NOW });
    expect(result.candidates).toBe(0);
    expect(result.results.length).toBe(0);
    expect(db._inserted.length).toBe(0);
  });

  it("ignores candidates without lastOutboundAt (defensive)", async () => {
    const state: MockState = {
      candidateThreads: [
        {
          threadId: "thr-bad",
          engagementId: null,
          lastOutboundAt: null,
          lastInboundAt: null,
        },
      ],
      firedStaleThreads: [],
      pendingStaleThreads: new Set(),
    };
    const db = makeMockDb(state);
    const result = await runStaleThreadsCron({ db, now: NOW });
    expect(result.candidates).toBe(1);
    expect(result.results.length).toBe(0);
    expect(db._inserted.length).toBe(0);
  });
});
