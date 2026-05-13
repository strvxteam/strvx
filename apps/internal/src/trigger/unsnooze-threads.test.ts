import { describe, it, expect, vi, beforeEach } from "vitest";
import type { db as DbType } from "@strvx/db";
import { runUnsnoozeThreads } from "./unsnooze-threads";

const NOW = new Date("2026-05-12T20:00:00Z");

type ThreadRow = {
  id: string;
  agentState: "snoozed" | "classified" | "pending" | "drafted";
  snoozedUntil: Date | null;
};

function makeMockDb(initialRows: ThreadRow[]) {
  const rows = [...initialRows];
  const updates: Array<{ id: string; set: Record<string, unknown> }> = [];

  const select = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockImplementation(async () => {
        return rows
          .filter(
            (r) =>
              r.agentState === "snoozed" &&
              r.snoozedUntil !== null &&
              r.snoozedUntil.getTime() <= NOW.getTime()
          )
          .map((r) => ({ id: r.id }));
      }),
    }),
  }));

  const update = vi.fn().mockImplementation(() => ({
    set: vi.fn().mockImplementation((setArg: Record<string, unknown>) => ({
      where: vi.fn().mockImplementation(async () => {
        // We can't easily decode the eq() arg; pop the next pending update id.
        // Tests don't assert per-id ordering against where; they only assert
        // the final state. Use a side-channel via the pending queue.
        const id = pendingIds.shift();
        if (id) {
          updates.push({ id, set: setArg });
          const target = rows.find((r) => r.id === id);
          if (target) {
            target.agentState = (setArg.agentState as ThreadRow["agentState"]) ?? target.agentState;
            target.snoozedUntil = (setArg.snoozedUntil as Date | null) ?? null;
          }
        }
        return { rowCount: 1 };
      }),
    })),
  }));

  const pendingIds: string[] = [];

  return {
    db: { select, update } as unknown as typeof DbType,
    rows,
    updates,
    seedPending: (ids: string[]) => {
      pendingIds.length = 0;
      pendingIds.push(...ids);
    },
  };
}

describe("runUnsnoozeThreads", () => {
  beforeEach(() => vi.clearAllMocks());

  it("wakes due threads (snoozedUntil <= now)", async () => {
    const fix = makeMockDb([
      {
        id: "t1",
        agentState: "snoozed",
        snoozedUntil: new Date("2026-05-12T19:00:00Z"),
      },
      {
        id: "t2",
        agentState: "snoozed",
        snoozedUntil: new Date("2026-05-12T19:55:00Z"),
      },
    ]);
    fix.seedPending(["t1", "t2"]);

    const res = await runUnsnoozeThreads({ db: fix.db, now: NOW });
    expect(res.count).toBe(2);
    expect(res.threadIds).toEqual(["t1", "t2"]);
    expect(fix.updates.length).toBe(2);
    for (const u of fix.updates) {
      expect(u.set.agentState).toBe("classified");
      expect(u.set.snoozedUntil).toBeNull();
      expect(u.set.updatedAt).toBeInstanceOf(Date);
    }
  });

  it("leaves future-snoozed threads alone", async () => {
    const fix = makeMockDb([
      {
        id: "future",
        agentState: "snoozed",
        snoozedUntil: new Date("2026-05-12T22:00:00Z"),
      },
    ]);
    fix.seedPending([]);
    const res = await runUnsnoozeThreads({ db: fix.db, now: NOW });
    expect(res.count).toBe(0);
    expect(res.threadIds).toEqual([]);
    expect(fix.updates.length).toBe(0);
  });

  it("ignores non-snoozed threads even if snoozedUntil is in the past", async () => {
    const fix = makeMockDb([
      {
        id: "classified",
        agentState: "classified",
        snoozedUntil: new Date("2026-05-12T18:00:00Z"),
      },
    ]);
    fix.seedPending([]);
    const res = await runUnsnoozeThreads({ db: fix.db, now: NOW });
    expect(res.count).toBe(0);
  });

  it("is a no-op when nothing is due", async () => {
    const fix = makeMockDb([]);
    fix.seedPending([]);
    const res = await runUnsnoozeThreads({ db: fix.db, now: NOW });
    expect(res).toEqual({ count: 0, threadIds: [] });
  });

  it("wakes only the due subset when mixed", async () => {
    const fix = makeMockDb([
      {
        id: "due1",
        agentState: "snoozed",
        snoozedUntil: new Date("2026-05-12T10:00:00Z"),
      },
      {
        id: "future1",
        agentState: "snoozed",
        snoozedUntil: new Date("2026-05-13T10:00:00Z"),
      },
    ]);
    fix.seedPending(["due1"]);
    const res = await runUnsnoozeThreads({ db: fix.db, now: NOW });
    expect(res.count).toBe(1);
    expect(res.threadIds).toEqual(["due1"]);
  });
});
