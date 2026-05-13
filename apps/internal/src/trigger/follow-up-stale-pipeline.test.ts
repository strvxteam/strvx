import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  db as DbType,
  engagements,
  followUpWatchers,
  interactions,
} from "@strvx/db";
import { runStalePipelineCron } from "./follow-up-stale-pipeline";

const NOW = new Date("2026-05-12T20:00:00Z");

type EngagementRow = {
  id: string;
  stageEnteredAt: Date;
  /** Test helper: whether there is a recent (in-window) interaction. */
  hasRecentInteraction: boolean;
  /** Test helper: whether a throttled stale_pipeline watcher exists. */
  hasRecentWatcher: boolean;
};

type MockState = {
  engagements: EngagementRow[];
};

function makeMockDb(state: MockState) {
  const inserted: Array<Record<string, unknown>> = [];
  /**
   * For each engagement, the cron issues two sequential select-followUpWatchers
   * or select-interactions queries: (1) interactions recent? (2) throttled
   * watcher? We use a per-engagement phase index keyed off of the result
   * lookup order.
   */
  const interactionsPhaseByEngagement = new Map<string, number>();
  const watchersPhaseByEngagement = new Map<string, number>();
  // Walk engagements in order to pop state per-call. Since the cron iterates
  // engagements in order and asks each engagement's two queries in sequence
  // (interactions, then watcher) we can use a single FIFO of engagement ids.
  let activeIdx = 0;
  const order: EngagementRow[] = state.engagements;

  const select = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockImplementation((table: unknown) => {
      if (table === engagements) {
        return {
          where: vi.fn().mockResolvedValue(
            order.map((e) => ({
              id: e.id,
              stageEnteredAt: e.stageEnteredAt,
            }))
          ),
        };
      }
      if (table === interactions) {
        return {
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(async () => {
              const e = order[activeIdx];
              if (!e) return [];
              const phase =
                interactionsPhaseByEngagement.get(e.id) ?? 0;
              interactionsPhaseByEngagement.set(e.id, phase + 1);
              return e.hasRecentInteraction ? [{ id: "i-1" }] : [];
            }),
          }),
        };
      }
      if (table === followUpWatchers) {
        return {
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(async () => {
              const e = order[activeIdx];
              if (!e) return [];
              const phase = watchersPhaseByEngagement.get(e.id) ?? 0;
              watchersPhaseByEngagement.set(e.id, phase + 1);
              const ret = e.hasRecentWatcher
                ? [{ id: "fired-watcher" }]
                : [];
              // After watcher query, advance to next engagement for the
              // next outer iteration.
              activeIdx++;
              return ret;
            }),
          }),
        };
      }
      return { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) };
    }),
  }));

  const insert = vi.fn().mockImplementation(() => ({
    values: vi.fn().mockImplementation((v: unknown) => {
      // If interactions returned recent, we advance activeIdx in the
      // interactions branch instead of waiting on watchers. Match cron flow.
      inserted.push(v as Record<string, unknown>);
      return Promise.resolve({ rowCount: 1 });
    }),
  }));

  return {
    select,
    insert,
    _inserted: inserted,
  } as unknown as typeof DbType & { _inserted: Array<Record<string, unknown>> };
}

// Variant of the mock above that advances activeIdx when interactions returns
// "recent" — so we skip the watcher query for that engagement.
function makeMockDbWithSkip(state: MockState) {
  const inserted: Array<Record<string, unknown>> = [];
  let activeIdx = 0;
  const order: EngagementRow[] = state.engagements;

  const select = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockImplementation((table: unknown) => {
      if (table === engagements) {
        return {
          where: vi.fn().mockResolvedValue(
            order.map((e) => ({
              id: e.id,
              stageEnteredAt: e.stageEnteredAt,
            }))
          ),
        };
      }
      if (table === interactions) {
        return {
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(async () => {
              const e = order[activeIdx];
              if (!e) return [];
              if (e.hasRecentInteraction) {
                activeIdx++;
                return [{ id: "i-1" }];
              }
              return [];
            }),
          }),
        };
      }
      if (table === followUpWatchers) {
        return {
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(async () => {
              const e = order[activeIdx];
              if (!e) return [];
              if (e.hasRecentWatcher) {
                activeIdx++;
                return [{ id: "fired" }];
              }
              return [];
            }),
          }),
        };
      }
      return { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) };
    }),
  }));

  const insert = vi.fn().mockImplementation(() => ({
    values: vi.fn().mockImplementation((v: unknown) => {
      inserted.push(v as Record<string, unknown>);
      // After insert we advance to next engagement.
      activeIdx++;
      return Promise.resolve({ rowCount: 1 });
    }),
  }));

  return {
    select,
    insert,
    _inserted: inserted,
  } as unknown as typeof DbType & { _inserted: Array<Record<string, unknown>> };
}

describe("runStalePipelineCron", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts a stale_pipeline watcher for an idle engagement", async () => {
    const state: MockState = {
      engagements: [
        {
          id: "eng-1",
          stageEnteredAt: new Date("2026-04-01T00:00:00Z"),
          hasRecentInteraction: false,
          hasRecentWatcher: false,
        },
      ],
    };
    const db = makeMockDbWithSkip(state);
    const result = await runStalePipelineCron({ db, now: NOW });
    expect(result.candidates).toBe(1);
    expect(result.results[0].outcome).toBe("inserted");
    expect(db._inserted.length).toBe(1);
    const v = db._inserted[0];
    expect(v.kind).toBe("stale_pipeline");
    expect(v.engagementId).toBe("eng-1");
    const cfg = v.ruleConfig as Record<string, unknown>;
    expect(cfg.origin).toBe("stale_pipeline_cron");
    expect(typeof cfg.days_idle).toBe("number");
  });

  it("skips when interactions exist inside the stale window", async () => {
    const state: MockState = {
      engagements: [
        {
          id: "eng-active",
          stageEnteredAt: new Date("2026-04-01T00:00:00Z"),
          hasRecentInteraction: true,
          hasRecentWatcher: false,
        },
      ],
    };
    const db = makeMockDbWithSkip(state);
    const result = await runStalePipelineCron({ db, now: NOW });
    expect(result.results[0].outcome).toBe("recent_activity");
    expect(db._inserted.length).toBe(0);
  });

  it("skips when a throttled stale_pipeline watcher already fired", async () => {
    const state: MockState = {
      engagements: [
        {
          id: "eng-throttled",
          stageEnteredAt: new Date("2026-04-01T00:00:00Z"),
          hasRecentInteraction: false,
          hasRecentWatcher: true,
        },
      ],
    };
    const db = makeMockDbWithSkip(state);
    const result = await runStalePipelineCron({ db, now: NOW });
    expect(result.results[0].outcome).toBe("throttled");
    expect(db._inserted.length).toBe(0);
  });

  it("returns empty when no active engagements", async () => {
    const state: MockState = { engagements: [] };
    const db = makeMockDbWithSkip(state);
    const result = await runStalePipelineCron({ db, now: NOW });
    expect(result.candidates).toBe(0);
    expect(result.results.length).toBe(0);
    expect(db._inserted.length).toBe(0);
  });
});

// Unused alias to satisfy "no unused variable" lint when makeMockDb isn't
// referenced in any test — we keep it around for future variants.
void makeMockDb;
