import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  db as DbType,
  emailThreads,
  followUpWatchers,
  interactions,
  mailboxOauthTokens,
} from "@strvx/db";
import { runFollowUpFire } from "./follow-up-fire";
import type { PlanThreadDispatcher } from "./follow-up-fire";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date("2026-05-12T20:00:00Z");

type WatcherRow = {
  id: string;
  kind:
    | "post_meeting_followup"
    | "stale_thread"
    | "stale_pipeline"
    | "no_show";
  threadId: string | null;
  engagementId: string | null;
  calendarEventId: string | null;
  triggerAfter: Date;
  ruleConfig: unknown;
  status: "pending";
};

type State = {
  watchers: WatcherRow[];
  notesByEngagement: Record<
    string,
    Array<{ type: string; content: string; createdAt: Date }>
  >;
  threadMailbox: Record<string, string | null>;
  activeMailboxId?: string;
};

function makeMockDb(state: State) {
  const updateSetSpy = vi.fn();
  const updateWhereSpy = vi.fn().mockResolvedValue({ rowCount: 1 });

  const select = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockImplementation((table: unknown) => {
      const noWhereLimit = vi.fn().mockImplementation(async () => {
        if (table === mailboxOauthTokens && state.activeMailboxId) {
          return [{ id: state.activeMailboxId }];
        }
        return [];
      });

      const where = vi.fn().mockImplementation(() => {
        if (table === followUpWatchers) {
          // Top-level "due watchers" query — return thenable.
          return Promise.resolve(state.watchers);
        }
        if (table === interactions) {
          // Inside firePostMeetingWatcher — accept .orderBy().limit() chain.
          return {
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockImplementation(async () => {
                // Take engagementId from the last call: simulate by returning
                // the union of all engagement notes (test sets only one).
                const all = Object.values(state.notesByEngagement).flat();
                return all;
              }),
            }),
          };
        }
        if (table === emailThreads) {
          const limitFn = vi.fn().mockImplementation(async () => {
            // Used by both: (a) mailbox lookup by thread_id and
            // (b) no_show watcher's "find a thread for this engagement".
            const tid = state.watchers.find((w) => w.threadId)?.threadId;
            if (tid && tid in state.threadMailbox) {
              return [
                { mailboxId: state.threadMailbox[tid], id: tid },
              ];
            }
            return [];
          });
          return {
            limit: limitFn,
            orderBy: vi.fn().mockReturnValue({ limit: limitFn }),
          };
        }
        if (table === mailboxOauthTokens) {
          return {
            limit: vi.fn().mockImplementation(async () => {
              if (state.activeMailboxId)
                return [{ id: state.activeMailboxId }];
              return [];
            }),
          };
        }
        return {
          limit: vi.fn().mockResolvedValue([]),
        };
      });

      return {
        where,
        // Bare `.limit()` (e.g. for "any user" path) — not used here.
        limit: noWhereLimit,
      };
    }),
  }));

  const update = vi.fn().mockImplementation(() => ({
    set: vi.fn().mockImplementation((values: unknown) => {
      updateSetSpy(values);
      return { where: updateWhereSpy };
    }),
  }));

  return {
    select,
    update,
    _updateSet: updateSetSpy,
    _updateWhere: updateWhereSpy,
  } as unknown as typeof DbType & {
    _updateSet: ReturnType<typeof vi.fn>;
    _updateWhere: ReturnType<typeof vi.fn>;
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runFollowUpFire", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fires post_meeting_followup with notes: calls extractActions and marks fired", async () => {
    const watcher: WatcherRow = {
      id: "wat-1",
      kind: "post_meeting_followup",
      threadId: "thr-1",
      engagementId: "eng-1",
      calendarEventId: "g-evt-1",
      triggerAfter: new Date("2026-05-12T19:00:00Z"),
      ruleConfig: {},
      status: "pending",
    };
    const state: State = {
      watchers: [watcher],
      notesByEngagement: {
        "eng-1": [
          {
            type: "note",
            content: "Followups: send proposal, schedule technical deep dive",
            createdAt: new Date("2026-05-12T19:30:00Z"),
          },
        ],
      },
      threadMailbox: { "thr-1": "mb-1" },
    };
    const db = makeMockDb(state);

    const fetchEventEndAt = vi
      .fn()
      .mockResolvedValue(new Date("2026-05-12T18:00:00Z"));
    const extractActions = vi.fn().mockResolvedValue({
      cosRunId: "run-extract",
      insertedActionIds: ["act-1", "act-2"],
      actions: [],
    });

    const out = await runFollowUpFire({
      db,
      now: NOW,
      fetchEventEndAt,
      extractActions,
    });

    expect(out.processed).toBe(1);
    expect(out.results[0]).toEqual({
      watcherId: "wat-1",
      kind: "post_meeting_followup",
      outcome: "fired_with_actions",
      insertedActionCount: 2,
    });
    expect(extractActions).toHaveBeenCalledTimes(1);
    const extractArg = extractActions.mock.calls[0][0];
    expect(extractArg.engagementId).toBe("eng-1");
    expect(extractArg.mailboxId).toBe("mb-1");
    expect(extractArg.calendarEventId).toBe("g-evt-1");
    expect(typeof extractArg.notesText).toBe("string");

    // Watcher marked fired
    const setCall = db._updateSet.mock.calls[0][0];
    expect(setCall.status).toBe("fired");
    expect(setCall.firedAt).toBeInstanceOf(Date);
  });

  it("fires post_meeting_followup with no notes: skips LLM and marks fired", async () => {
    const watcher: WatcherRow = {
      id: "wat-2",
      kind: "post_meeting_followup",
      threadId: null,
      engagementId: "eng-2",
      calendarEventId: "g-evt-2",
      triggerAfter: new Date("2026-05-12T19:00:00Z"),
      ruleConfig: {},
      status: "pending",
    };
    const state: State = {
      watchers: [watcher],
      notesByEngagement: { "eng-2": [] },
      threadMailbox: {},
      activeMailboxId: "mb-fallback",
    };
    const db = makeMockDb(state);

    const fetchEventEndAt = vi
      .fn()
      .mockResolvedValue(new Date("2026-05-12T18:00:00Z"));
    const extractActions = vi.fn();

    const out = await runFollowUpFire({
      db,
      now: NOW,
      fetchEventEndAt,
      extractActions,
    });

    expect(out.results[0]).toEqual({
      watcherId: "wat-2",
      kind: "post_meeting_followup",
      outcome: "fired_no_notes",
    });
    expect(extractActions).not.toHaveBeenCalled();
    const setCall = db._updateSet.mock.calls[0][0];
    expect(setCall.status).toBe("fired");
  });

  it("dispatches stale_thread → planThread.trigger with stale_followup seedIntent", async () => {
    const watcher: WatcherRow = {
      id: "wat-3",
      kind: "stale_thread",
      threadId: "thr-x",
      engagementId: null,
      calendarEventId: null,
      triggerAfter: new Date("2026-05-12T19:00:00Z"),
      ruleConfig: {},
      status: "pending",
    };
    const state: State = {
      watchers: [watcher],
      notesByEngagement: {},
      threadMailbox: {},
    };
    const db = makeMockDb(state);

    const planThreadDispatcher: PlanThreadDispatcher = vi
      .fn()
      .mockResolvedValue(undefined);

    const out = await runFollowUpFire({
      db,
      now: NOW,
      extractActions: vi.fn(),
      planThreadDispatcher,
    });

    expect(out.results[0].outcome).toBe("fired_planner_dispatched");
    expect(planThreadDispatcher).toHaveBeenCalledWith({
      threadId: "thr-x",
      seedIntent: "stale_followup",
    });
    const setCall = db._updateSet.mock.calls[0][0];
    expect(setCall.status).toBe("fired");
  });

  it("stale_thread without thread_id is cancelled with no_thread", async () => {
    const watcher: WatcherRow = {
      id: "wat-3b",
      kind: "stale_thread",
      threadId: null,
      engagementId: null,
      calendarEventId: null,
      triggerAfter: new Date("2026-05-12T19:00:00Z"),
      ruleConfig: {},
      status: "pending",
    };
    const state: State = {
      watchers: [watcher],
      notesByEngagement: {},
      threadMailbox: {},
    };
    const db = makeMockDb(state);
    const planThreadDispatcher: PlanThreadDispatcher = vi.fn();

    const out = await runFollowUpFire({
      db,
      now: NOW,
      extractActions: vi.fn(),
      planThreadDispatcher,
    });

    expect(out.results[0].outcome).toBe("skipped_no_thread");
    expect(planThreadDispatcher).not.toHaveBeenCalled();
    const setCall = db._updateSet.mock.calls[0][0];
    expect(setCall.status).toBe("cancelled");
  });

  it("stale_pipeline → fired without planner dispatch (surface only)", async () => {
    const watcher: WatcherRow = {
      id: "wat-sp",
      kind: "stale_pipeline",
      threadId: null,
      engagementId: "eng-sp",
      calendarEventId: null,
      triggerAfter: new Date("2026-05-12T19:00:00Z"),
      ruleConfig: {},
      status: "pending",
    };
    const state: State = {
      watchers: [watcher],
      notesByEngagement: {},
      threadMailbox: {},
    };
    const db = makeMockDb(state);

    const planThreadDispatcher: PlanThreadDispatcher = vi.fn();

    const out = await runFollowUpFire({
      db,
      now: NOW,
      extractActions: vi.fn(),
      planThreadDispatcher,
    });

    expect(out.results[0].outcome).toBe("fired_no_planner");
    expect(planThreadDispatcher).not.toHaveBeenCalled();
    const setCall = db._updateSet.mock.calls[0][0];
    expect(setCall.status).toBe("fired");
  });

  it("no_show dispatches planThread with no_show_followup seedIntent", async () => {
    const watcher: WatcherRow = {
      id: "wat-ns",
      kind: "no_show",
      threadId: "thr-ns",
      engagementId: "eng-ns",
      calendarEventId: "g-evt-ns",
      triggerAfter: new Date("2026-05-12T19:00:00Z"),
      ruleConfig: {},
      status: "pending",
    };
    const state: State = {
      watchers: [watcher],
      notesByEngagement: {},
      threadMailbox: {},
    };
    const db = makeMockDb(state);

    const planThreadDispatcher: PlanThreadDispatcher = vi
      .fn()
      .mockResolvedValue(undefined);

    const out = await runFollowUpFire({
      db,
      now: NOW,
      extractActions: vi.fn(),
      planThreadDispatcher,
    });

    expect(out.results[0].outcome).toBe("fired_planner_dispatched");
    expect(planThreadDispatcher).toHaveBeenCalledWith({
      threadId: "thr-ns",
      seedIntent: "no_show_followup",
    });
  });

  it("no_show without thread or engagement is cancelled with no_thread", async () => {
    const watcher: WatcherRow = {
      id: "wat-ns2",
      kind: "no_show",
      threadId: null,
      engagementId: null,
      calendarEventId: "g-evt-ns",
      triggerAfter: new Date("2026-05-12T19:00:00Z"),
      ruleConfig: {},
      status: "pending",
    };
    const state: State = {
      watchers: [watcher],
      notesByEngagement: {},
      threadMailbox: {},
    };
    const db = makeMockDb(state);

    const planThreadDispatcher: PlanThreadDispatcher = vi.fn();

    const out = await runFollowUpFire({
      db,
      now: NOW,
      extractActions: vi.fn(),
      planThreadDispatcher,
    });

    expect(out.results[0].outcome).toBe("skipped_no_thread");
    expect(planThreadDispatcher).not.toHaveBeenCalled();
    const setCall = db._updateSet.mock.calls[0][0];
    expect(setCall.status).toBe("cancelled");
    expect(setCall.ruleConfig).toBeDefined();
  });

  it("cancels watcher with missing calendar_event_id", async () => {
    const watcher: WatcherRow = {
      id: "wat-4",
      kind: "post_meeting_followup",
      threadId: null,
      engagementId: "eng-x",
      calendarEventId: null,
      triggerAfter: new Date("2026-05-12T19:00:00Z"),
      ruleConfig: {},
      status: "pending",
    };
    const state: State = {
      watchers: [watcher],
      notesByEngagement: {},
      threadMailbox: {},
    };
    const db = makeMockDb(state);

    const out = await runFollowUpFire({
      db,
      now: NOW,
      extractActions: vi.fn(),
    });

    expect(out.results[0].outcome).toBe("skipped_no_event");
    const setCall = db._updateSet.mock.calls[0][0];
    expect(setCall.status).toBe("cancelled");
  });

  it("recovers when extractActions throws — records error and continues", async () => {
    const watcher: WatcherRow = {
      id: "wat-5",
      kind: "post_meeting_followup",
      threadId: null,
      engagementId: "eng-err",
      calendarEventId: "g-evt-err",
      triggerAfter: new Date("2026-05-12T19:00:00Z"),
      ruleConfig: {},
      status: "pending",
    };
    const state: State = {
      watchers: [watcher],
      notesByEngagement: {
        "eng-err": [
          {
            type: "note",
            content: "Followup notes here.",
            createdAt: new Date("2026-05-12T19:10:00Z"),
          },
        ],
      },
      threadMailbox: {},
      activeMailboxId: "mb-fallback",
    };
    const db = makeMockDb(state);

    const fetchEventEndAt = vi
      .fn()
      .mockResolvedValue(new Date("2026-05-12T18:00:00Z"));
    const extractActions = vi
      .fn()
      .mockRejectedValue(new Error("openai timeout"));

    const out = await runFollowUpFire({
      db,
      now: NOW,
      fetchEventEndAt,
      extractActions,
    });

    expect(out.results[0].outcome).toBe("error");
    expect(out.results[0].error).toContain("openai timeout");
    const setCall = db._updateSet.mock.calls[0][0];
    expect(setCall.status).toBe("cancelled");
  });
});
