import { describe, it, expect, vi, beforeEach } from "vitest";
import type { calendar_v3 } from "googleapis";
import {
  computeAvailableSlots,
  workingHourWindowsPT,
  ptWallClockToUtc,
  expandAndMergeBusy,
  fetchFreeBusy,
  findAvailableSlotsTool,
} from "./find-available-slots";
import type { ToolContext } from "../types";

vi.mock("@/lib/agent/mailbox-oauth", () => ({
  getAuthedMailboxClient: vi.fn(),
  getAuthedMailboxClientSafe: vi.fn(),
}));

vi.mock("googleapis", async (orig) => {
  const actual = await orig<typeof import("googleapis")>();
  return {
    ...actual,
    google: { ...actual.google, calendar: vi.fn() },
  };
});

import { getAuthedMailboxClientSafe } from "@/lib/agent/mailbox-oauth";
import { google } from "googleapis";

function mockSafeOk() {
  vi.mocked(getAuthedMailboxClientSafe).mockResolvedValueOnce({
    ok: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: {} as any,
    email: "team@strvx.com",
  });
}

// ---------------------------------------------------------------------------
// Helpers — fixed reference dates in DST + non-DST for determinism
// ---------------------------------------------------------------------------

// Tuesday 2026-05-12 09:30 PT (PDT, UTC-7) -> 2026-05-12T16:30:00Z
const NOW_PDT = new Date("2026-05-12T16:30:00.000Z");

// Friday 2026-01-09 09:30 PT (PST, UTC-8) -> 2026-01-09T17:30:00Z
const NOW_PST = new Date("2026-01-09T17:30:00.000Z");

function makeCalendar(freeBusyImpl: () => Promise<unknown>): calendar_v3.Calendar {
  return {
    freebusy: { query: vi.fn(freeBusyImpl) },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

// ---------------------------------------------------------------------------
// PT timezone math
// ---------------------------------------------------------------------------

describe("ptWallClockToUtc", () => {
  it("handles PDT (UTC-7)", () => {
    // 2026-05-12 09:00 PT -> 16:00 UTC
    const d = ptWallClockToUtc(2026, 5, 12, 9, 0);
    expect(d.toISOString()).toBe("2026-05-12T16:00:00.000Z");
  });
  it("handles PST (UTC-8)", () => {
    // 2026-01-09 09:00 PT -> 17:00 UTC
    const d = ptWallClockToUtc(2026, 1, 9, 9, 0);
    expect(d.toISOString()).toBe("2026-01-09T17:00:00.000Z");
  });
});

describe("workingHourWindowsPT", () => {
  it("emits only Mon-Fri windows", () => {
    // Start Tue 2026-05-12; over 7 days -> Tue/Wed/Thu/Fri + Mon (skip Sat/Sun)
    const windows = workingHourWindowsPT(NOW_PDT, 7);
    expect(windows).toHaveLength(5);
    // First window starts at 2026-05-12 09:00 PT
    expect(windows[0].start.toISOString()).toBe("2026-05-12T16:00:00.000Z");
    expect(windows[0].end.toISOString()).toBe("2026-05-13T00:00:00.000Z");
  });
});

describe("expandAndMergeBusy", () => {
  it("expands by buffer and merges overlapping intervals", () => {
    const busy = [
      {
        start: new Date("2026-05-12T17:00:00Z"),
        end: new Date("2026-05-12T17:30:00Z"),
      },
      {
        start: new Date("2026-05-12T17:35:00Z"),
        end: new Date("2026-05-12T18:00:00Z"),
      },
    ];
    const merged = expandAndMergeBusy(busy, 15 * 60 * 1000);
    expect(merged).toHaveLength(1);
    expect(merged[0].start.toISOString()).toBe("2026-05-12T16:45:00.000Z");
    expect(merged[0].end.toISOString()).toBe("2026-05-12T18:15:00.000Z");
  });
  it("returns [] for empty input", () => {
    expect(expandAndMergeBusy([], 15 * 60 * 1000)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// computeAvailableSlots — pure algorithm
// ---------------------------------------------------------------------------

describe("computeAvailableSlots", () => {
  it("returns slots in working hours when there are no busy blocks", () => {
    // earliestStart Mon 2026-05-18 00:00 PT (after weekend) — first valid
    // working window starts Mon 09:00 PT.
    const earliest = ptWallClockToUtc(2026, 5, 18, 0, 0);
    const { slots } = computeAvailableSlots(
      [],
      {
        durationMinutes: 30,
        lookaheadDays: 5,
        earliestStartAfter: earliest,
      },
      NOW_PDT
    );
    expect(slots).toHaveLength(3);
    // Each slot starts at 09:00 PT (= 16:00Z in PDT)
    for (const s of slots) {
      expect(s.start).toMatch(/T16:00:00\.000Z$/);
      expect(s.timezone).toBe("America/Los_Angeles");
    }
    // Spread across 3 different days
    const days = new Set(slots.map((s) => s.start.slice(0, 10)));
    expect(days.size).toBe(3);
  });

  it("respects 15-minute buffer around busy blocks", () => {
    // Busy 09:00–10:00 PT on Mon 2026-05-18. With 15min buffer,
    // earliest free is 10:15 PT.
    const busyStart = ptWallClockToUtc(2026, 5, 18, 9, 0);
    const busyEnd = ptWallClockToUtc(2026, 5, 18, 10, 0);
    const earliest = ptWallClockToUtc(2026, 5, 18, 0, 0);
    const { slots } = computeAvailableSlots(
      [{ start: busyStart, end: busyEnd }],
      { durationMinutes: 30, lookaheadDays: 5, earliestStartAfter: earliest },
      NOW_PDT
    );
    // First slot's start should be at or after 10:15 PT on 2026-05-18
    // (10:15 PT PDT = 17:15Z)
    const firstSlot = slots.find((s) => s.start.startsWith("2026-05-18"));
    expect(firstSlot).toBeDefined();
    expect(firstSlot!.start).toBe("2026-05-18T17:15:00.000Z");
  });

  it("skips days that already have ≥3 events", () => {
    const earliest = ptWallClockToUtc(2026, 5, 18, 0, 0);
    const { slots } = computeAvailableSlots(
      [],
      {
        durationMinutes: 30,
        lookaheadDays: 7,
        earliestStartAfter: earliest,
        eventCountByPtDay: { "2026-05-18": 3, "2026-05-19": 3 },
      },
      NOW_PDT
    );
    // Should skip Mon + Tue, pick Wed/Thu/Fri
    const days = slots.map((s) => s.start.slice(0, 10)).sort();
    expect(days).toEqual(["2026-05-20", "2026-05-21", "2026-05-22"]);
  });

  it("returns fewer than 3 slots if window can't accommodate", () => {
    // 1-day lookahead from Sat -> only Mon window with all busy
    const earliest = ptWallClockToUtc(2026, 5, 18, 0, 0); // Mon
    // Block the entire Mon working day
    const dayStart = ptWallClockToUtc(2026, 5, 18, 9, 0);
    const dayEnd = ptWallClockToUtc(2026, 5, 18, 17, 0);
    const { slots } = computeAvailableSlots(
      [{ start: dayStart, end: dayEnd }],
      { durationMinutes: 60, lookaheadDays: 1, earliestStartAfter: earliest },
      NOW_PDT
    );
    expect(slots).toHaveLength(0);
  });

  it("defaults earliestStartAfter to now + 24h", () => {
    const { range } = computeAvailableSlots(
      [],
      { durationMinutes: 30, lookaheadDays: 5 },
      NOW_PDT
    );
    const startMs = new Date(range.start).getTime();
    expect(startMs).toBe(NOW_PDT.getTime() + 24 * 60 * 60 * 1000);
  });

  it("works across DST boundary (PST)", () => {
    // Tue 2026-01-13 from Fri-now -> picks weekdays in PST
    const earliest = ptWallClockToUtc(2026, 1, 12, 0, 0); // Mon
    const { slots } = computeAvailableSlots(
      [],
      { durationMinutes: 30, lookaheadDays: 3, earliestStartAfter: earliest },
      NOW_PST
    );
    expect(slots.length).toBeGreaterThan(0);
    // First slot at 09:00 PST = 17:00Z
    expect(slots[0].start).toMatch(/T17:00:00\.000Z$/);
  });
});

// ---------------------------------------------------------------------------
// fetchFreeBusy
// ---------------------------------------------------------------------------

describe("fetchFreeBusy", () => {
  it("merges busy intervals across primary + attendee calendars", async () => {
    const calendar = makeCalendar(() =>
      Promise.resolve({
        data: {
          calendars: {
            primary: {
              busy: [
                {
                  start: "2026-05-12T17:00:00Z",
                  end: "2026-05-12T17:30:00Z",
                },
              ],
            },
            "a@x.com": {
              busy: [
                {
                  start: "2026-05-12T19:00:00Z",
                  end: "2026-05-12T19:30:00Z",
                },
              ],
            },
          },
        } as calendar_v3.Schema$FreeBusyResponse,
      })
    );

    const { busy, warnings } = await fetchFreeBusy({
      calendar,
      timeMin: "2026-05-12T00:00:00Z",
      timeMax: "2026-05-13T00:00:00Z",
      attendees: ["a@x.com"],
    });
    expect(busy).toHaveLength(2);
    expect(warnings).toEqual([]);
  });

  it("tolerates per-attendee errors with a warning", async () => {
    const calendar = makeCalendar(() =>
      Promise.resolve({
        data: {
          calendars: {
            primary: {
              busy: [
                {
                  start: "2026-05-12T17:00:00Z",
                  end: "2026-05-12T17:30:00Z",
                },
              ],
            },
            "external@vendor.com": {
              errors: [{ reason: "notFound" }],
            },
          },
        } as calendar_v3.Schema$FreeBusyResponse,
      })
    );

    const { busy, warnings } = await fetchFreeBusy({
      calendar,
      timeMin: "2026-05-12T00:00:00Z",
      timeMax: "2026-05-13T00:00:00Z",
      attendees: ["external@vendor.com"],
    });
    expect(busy).toHaveLength(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("external@vendor.com");
  });
});

// ---------------------------------------------------------------------------
// Tool handler — integration of mocked OAuth + calendar
// ---------------------------------------------------------------------------

describe("findAvailableSlotsTool.handle", () => {
  beforeEach(() => vi.clearAllMocks());

  function mockDbWithSettings(row: unknown | null) {
    return {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(row ? [row] : []),
          }),
        }),
      })),
    } as unknown as ToolContext["db"];
  }

  const ctx: ToolContext = {
    mailboxId: "mbx-1",
    threadId: "thr-1",
    cosRunId: "run-1",
    db: mockDbWithSettings(null),
  };

  it("returns mailbox_not_found when the row is missing", async () => {
    vi.mocked(getAuthedMailboxClientSafe).mockResolvedValueOnce({
      ok: false,
      error: "not_found",
      message: "Mailbox not found",
    });
    const out = await findAvailableSlotsTool.handle(
      { duration_minutes: 30, lookahead_days: 5, attendee_emails: [] },
      ctx
    );
    expect(out).toMatchObject({ error: "mailbox_not_found" });
  });

  it("returns mailbox_disconnected when the mailbox is inactive", async () => {
    vi.mocked(getAuthedMailboxClientSafe).mockResolvedValueOnce({
      ok: false,
      error: "disconnected",
      message: "token revoked",
    });
    const out = await findAvailableSlotsTool.handle(
      { duration_minutes: 30, lookahead_days: 5, attendee_emails: [] },
      ctx
    );
    expect(out).toMatchObject({
      error: "mailbox_disconnected",
      message: "token revoked",
    });
  });

  it("throws on transient OAuth errors so the planner retries", async () => {
    vi.mocked(getAuthedMailboxClientSafe).mockResolvedValueOnce({
      ok: false,
      error: "transient",
      message: "ECONNRESET",
    });
    await expect(
      findAvailableSlotsTool.handle(
        { duration_minutes: 30, lookahead_days: 5, attendee_emails: [] },
        ctx
      )
    ).rejects.toThrow(/transient/);
  });

  it("returns calendar_scope_missing on a 403 freebusy error", async () => {
    mockSafeOk();
    const calendar = makeCalendar(() =>
      Promise.reject(
        Object.assign(new Error("Request had insufficient authentication scopes."), {
          code: 403,
        })
      )
    );
    vi.mocked(google.calendar).mockReturnValueOnce(calendar);

    const out = await findAvailableSlotsTool.handle(
      { duration_minutes: 30, lookahead_days: 5, attendee_emails: [] },
      ctx
    );
    expect(out).toMatchObject({
      error: "calendar_scope_missing",
      slots: [],
      working_hours_pt: "09:00-17:00 Mon-Fri",
      buffer_minutes: 15,
    });
  });

  it("returns slots on the ok path with 0 attendees", async () => {
    mockSafeOk();
    const calendar = makeCalendar(() =>
      Promise.resolve({
        data: {
          calendars: {
            primary: { busy: [] },
          },
        } as calendar_v3.Schema$FreeBusyResponse,
      })
    );
    vi.mocked(google.calendar).mockReturnValueOnce(calendar);

    const out = await findAvailableSlotsTool.handle(
      { duration_minutes: 30, lookahead_days: 10, attendee_emails: [] },
      ctx
    );
    expect("error" in out).toBe(false);
    if ("error" in out) return;
    expect(out.slots.length).toBeGreaterThan(0);
    expect(out.slots.length).toBeLessThanOrEqual(3);
    expect(out.working_hours_pt).toBe("09:00-17:00 Mon-Fri");
    expect(out.buffer_minutes).toBe(15);
  });

  it("respects per-mailbox agent_settings overrides (10:00-15:00, Mon+Wed)", async () => {
    mockSafeOk();
    const calendar = makeCalendar(() =>
      Promise.resolve({
        data: {
          calendars: { primary: { busy: [] } },
        } as calendar_v3.Schema$FreeBusyResponse,
      })
    );
    vi.mocked(google.calendar).mockReturnValueOnce(calendar);

    // Custom settings: 10:00–15:00 PT, Mon (1) + Wed (3) only, 30-min buffer.
    const settingsCtx: ToolContext = {
      mailboxId: "mbx-1",
      threadId: "thr-1",
      cosRunId: "run-1",
      db: mockDbWithSettings({
        workingStartHour: 10,
        workingEndHour: 15,
        workingDays: [1, 3],
        bufferMinutes: 30,
        maxBackToBack: 3,
        timezone: "America/Los_Angeles",
      }),
    };

    const out = await findAvailableSlotsTool.handle(
      {
        duration_minutes: 30,
        lookahead_days: 14,
        attendee_emails: [],
        // Start on Sunday 2026-05-17 PT so we walk Mon 5/18, Tue 5/19, Wed 5/20 etc.
        earliest_start_after: "2026-05-18T07:00:00Z",
      },
      settingsCtx
    );

    expect("error" in out).toBe(false);
    if ("error" in out) return;
    expect(out.slots.length).toBeGreaterThan(0);
    // Every slot starts at 10:00 PT (= 17:00Z PDT)
    for (const s of out.slots) {
      expect(s.start).toMatch(/T17:00:00\.000Z$/);
      // PT day-of-week (Mon=1, Wed=3): pick days
      const dateStr = s.start.slice(0, 10);
      // Mon 2026-05-18, Wed 2026-05-20, Mon 2026-05-25, Wed 2026-05-27, etc.
      const allowed = new Set([
        "2026-05-18",
        "2026-05-20",
        "2026-05-25",
        "2026-05-27",
      ]);
      expect(allowed.has(dateStr)).toBe(true);
    }
  });

  it("includes warnings array when an attendee calendar errors", async () => {
    mockSafeOk();
    const calendar = makeCalendar(() =>
      Promise.resolve({
        data: {
          calendars: {
            primary: { busy: [] },
            "external@vendor.com": { errors: [{ reason: "notFound" }] },
          },
        } as calendar_v3.Schema$FreeBusyResponse,
      })
    );
    vi.mocked(google.calendar).mockReturnValueOnce(calendar);

    const out = await findAvailableSlotsTool.handle(
      {
        duration_minutes: 30,
        lookahead_days: 10,
        attendee_emails: ["external@vendor.com"],
      },
      ctx
    );
    expect("error" in out).toBe(false);
    if ("error" in out) return;
    expect(out.warnings).toBeDefined();
    expect(out.warnings![0]).toContain("external@vendor.com");
  });
});
