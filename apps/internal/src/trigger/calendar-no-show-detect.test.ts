import { describe, it, expect, vi, beforeEach } from "vitest";
import type { calendar_v3 } from "googleapis";
import {
  db as DbType,
  calendarEvents,
  followUpWatchers,
  mailboxOauthTokens,
} from "@strvx/db";
import { runNoShowDetectCron, computeEndUtc } from "./calendar-no-show-detect";

// Fix NOW so the window is deterministic. With windowStart=30min, windowEnd=15min:
// candidate events must end between 19:30:00Z and 19:45:00Z.
const NOW = new Date("2026-05-12T20:00:00Z");

type CalRow = {
  id: string;
  date: string;
  startHour: string;
  durationHours: string;
  engagementId: string | null;
  googleEventId: string | null;
};

type MockState = {
  calendarRows: CalRow[];
  activeMailboxId: string | null;
  /** googleEventId → already-present no_show watcher? */
  existingWatcherFor: Set<string>;
};

function makeMockDb(state: MockState) {
  const inserted: Array<Record<string, unknown>> = [];

  // Override select for followUpWatchers to inspect the last call's `where`
  // composition. Easier: keep a per-event call counter and consult state.
  let watcherCallIdx = 0;
  const candidateOrder = state.calendarRows
    .filter((r) => !!r.googleEventId)
    .map((r) => r.googleEventId as string);
  const selectWithWatcher = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockImplementation((table: unknown) => {
      if (table === calendarEvents) {
        return { where: vi.fn().mockResolvedValue(state.calendarRows) };
      }
      if (table === mailboxOauthTokens) {
        return {
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(async () =>
              state.activeMailboxId ? [{ id: state.activeMailboxId }] : []
            ),
          }),
        };
      }
      if (table === followUpWatchers) {
        return {
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(async () => {
              const evtId = candidateOrder[watcherCallIdx];
              watcherCallIdx++;
              return state.existingWatcherFor.has(evtId)
                ? [{ id: "existing" }]
                : [];
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

  const insert = vi.fn().mockImplementation(() => ({
    values: vi.fn().mockImplementation((v: unknown) => {
      inserted.push(v as Record<string, unknown>);
      return Promise.resolve({ rowCount: 1 });
    }),
  }));

  return {
    select: selectWithWatcher,
    insert,
    _inserted: inserted,
  } as unknown as typeof DbType & {
    _inserted: Array<Record<string, unknown>>;
  };
}

function makeCalendar(
  responsesByEventId: Record<
    string,
    | { ok: true; attendees: calendar_v3.Schema$EventAttendee[] }
    | { ok: false; code: number }
  >
): calendar_v3.Calendar {
  const get = vi.fn().mockImplementation(async (opts: { eventId: string }) => {
    const r = responsesByEventId[opts.eventId];
    if (!r) return { data: { attendees: [] } };
    if (!r.ok) {
      const err: Error & { code?: number } = new Error("forbidden");
      err.code = r.code;
      throw err;
    }
    return { data: { attendees: r.attendees } };
  });
  return { events: { get } } as unknown as calendar_v3.Calendar;
}

const baseRow = {
  date: "2026-05-12",
  // computeEndUtc: 19:00 + 0.5 = 19:30 — exactly at the windowStart boundary.
  startHour: "19",
  durationHours: "0.5",
};

describe("computeEndUtc", () => {
  it("combines date + startHour + durationHours into a UTC end timestamp", () => {
    const d = computeEndUtc("2026-05-12", "19", "0.5");
    expect(d.toISOString()).toBe("2026-05-12T19:30:00.000Z");
  });
});

describe("runNoShowDetectCron", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts a no_show watcher when an external attendee is needsAction", async () => {
    const state: MockState = {
      calendarRows: [
        {
          id: "ce-1",
          ...baseRow,
          engagementId: "eng-1",
          googleEventId: "g-1",
        },
      ],
      activeMailboxId: "mb-1",
      existingWatcherFor: new Set(),
    };
    const db = makeMockDb(state);
    const calendar = makeCalendar({
      "g-1": {
        ok: true,
        attendees: [
          { email: "alice@strvx.com", responseStatus: "accepted" },
          { email: "client@acme.com", responseStatus: "needsAction" },
        ],
      },
    });
    const calendarFactory = vi
      .fn()
      .mockResolvedValue({ calendar, email: "team@strvx.com" });

    const result = await runNoShowDetectCron({
      db,
      now: NOW,
      calendarFactory,
    });
    expect(result.candidates).toBe(1);
    expect(result.results[0].outcome).toBe("inserted");
    expect(result.results[0].signals).toEqual(["client@acme.com:needsAction"]);
    expect(db._inserted.length).toBe(1);
    expect(db._inserted[0].kind).toBe("no_show");
    expect(db._inserted[0].calendarEventId).toBe("g-1");
    expect(db._inserted[0].engagementId).toBe("eng-1");
  });

  it("skips when all external attendees accepted", async () => {
    const state: MockState = {
      calendarRows: [
        {
          id: "ce-2",
          ...baseRow,
          engagementId: "eng-2",
          googleEventId: "g-2",
        },
      ],
      activeMailboxId: "mb-1",
      existingWatcherFor: new Set(),
    };
    const db = makeMockDb(state);
    const calendar = makeCalendar({
      "g-2": {
        ok: true,
        attendees: [
          { email: "alice@strvx.com", responseStatus: "accepted" },
          { email: "client@acme.com", responseStatus: "accepted" },
        ],
      },
    });
    const calendarFactory = vi
      .fn()
      .mockResolvedValue({ calendar, email: "team@strvx.com" });
    const result = await runNoShowDetectCron({
      db,
      now: NOW,
      calendarFactory,
    });
    expect(result.results[0].outcome).toBe("skipped_no_signal");
    expect(db._inserted.length).toBe(0);
  });

  it("skips when a no_show watcher already exists for the event", async () => {
    const state: MockState = {
      calendarRows: [
        {
          id: "ce-3",
          ...baseRow,
          engagementId: "eng-3",
          googleEventId: "g-3",
        },
      ],
      activeMailboxId: "mb-1",
      existingWatcherFor: new Set(["g-3"]),
    };
    const db = makeMockDb(state);
    const calendar = makeCalendar({
      "g-3": {
        ok: true,
        attendees: [
          { email: "client@acme.com", responseStatus: "needsAction" },
        ],
      },
    });
    const calendarFactory = vi
      .fn()
      .mockResolvedValue({ calendar, email: "team@strvx.com" });
    const result = await runNoShowDetectCron({
      db,
      now: NOW,
      calendarFactory,
    });
    expect(result.results[0].outcome).toBe("skipped_existing");
    expect(db._inserted.length).toBe(0);
  });

  it("catches 403 from events.get and continues with error outcome", async () => {
    const state: MockState = {
      calendarRows: [
        {
          id: "ce-4",
          ...baseRow,
          engagementId: "eng-4",
          googleEventId: "g-4",
        },
      ],
      activeMailboxId: "mb-1",
      existingWatcherFor: new Set(),
    };
    const db = makeMockDb(state);
    const calendar = makeCalendar({
      "g-4": { ok: false, code: 403 },
    });
    const calendarFactory = vi
      .fn()
      .mockResolvedValue({ calendar, email: "team@strvx.com" });
    const result = await runNoShowDetectCron({
      db,
      now: NOW,
      calendarFactory,
    });
    expect(result.results[0].outcome).toBe("error");
    expect(result.results[0].error).toBe("forbidden");
    expect(db._inserted.length).toBe(0);
  });

  it("filters out events outside the [15min, 30min] ago window", async () => {
    const state: MockState = {
      calendarRows: [
        {
          id: "ce-too-recent",
          // Ends at 19:55 (5 min ago) — outside the window.
          date: "2026-05-12",
          startHour: "19",
          durationHours: "0.92",
          engagementId: "eng-x",
          googleEventId: "g-too-recent",
        },
        {
          id: "ce-too-old",
          // Ends at 19:00 (60 min ago) — outside the window.
          date: "2026-05-12",
          startHour: "18",
          durationHours: "1",
          engagementId: "eng-y",
          googleEventId: "g-too-old",
        },
      ],
      activeMailboxId: "mb-1",
      existingWatcherFor: new Set(),
    };
    const db = makeMockDb(state);
    const calendar = makeCalendar({});
    const calendarFactory = vi
      .fn()
      .mockResolvedValue({ calendar, email: "team@strvx.com" });
    const result = await runNoShowDetectCron({
      db,
      now: NOW,
      calendarFactory,
    });
    expect(result.candidates).toBe(0);
    expect(db._inserted.length).toBe(0);
  });

  it("returns gracefully when no active mailbox exists", async () => {
    const state: MockState = {
      calendarRows: [
        {
          id: "ce-1",
          ...baseRow,
          engagementId: "eng-1",
          googleEventId: "g-1",
        },
      ],
      activeMailboxId: null,
      existingWatcherFor: new Set(),
    };
    const db = makeMockDb(state);
    const calendar = makeCalendar({});
    const calendarFactory = vi
      .fn()
      .mockResolvedValue({ calendar, email: "team@strvx.com" });
    const result = await runNoShowDetectCron({
      db,
      now: NOW,
      calendarFactory,
    });
    // Still reports candidate count but no inserts.
    expect(result.candidates).toBe(1);
    expect(db._inserted.length).toBe(0);
  });
});
