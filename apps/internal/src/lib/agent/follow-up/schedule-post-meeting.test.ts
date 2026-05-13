import { describe, it, expect, vi, beforeEach } from "vitest";
import type { db as DbType } from "@strvx/db";
import { schedulePostMeetingWatcher } from "./schedule-post-meeting";

type ExistingWatcher = { id: string } | null;

function makeMockDb(opts: {
  existing?: ExistingWatcher;
  insertedId?: string;
}) {
  const insertedId = opts.insertedId ?? "watcher-new";
  const limit = vi
    .fn()
    .mockResolvedValue(opts.existing ? [opts.existing] : []);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });

  const returning = vi.fn().mockResolvedValue([{ id: insertedId }]);
  const values = vi.fn().mockReturnValue({ returning });
  const insert = vi.fn().mockReturnValue({ values });

  return {
    select,
    insert,
    _select: select,
    _insert: insert,
    _values: values,
  } as unknown as typeof DbType & {
    _select: ReturnType<typeof vi.fn>;
    _insert: ReturnType<typeof vi.fn>;
    _values: ReturnType<typeof vi.fn>;
  };
}

describe("schedulePostMeetingWatcher", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts a new watcher when none exists", async () => {
    const db = makeMockDb({ existing: null, insertedId: "wat-1" });
    const endAt = new Date("2026-05-12T18:00:00Z");

    const out = await schedulePostMeetingWatcher({
      db,
      calendarEventId: "g-evt-1",
      engagementId: "eng-1",
      threadId: "thr-1",
      eventEndAt: endAt,
    });

    expect(out).toEqual({ watcherId: "wat-1", alreadyExisted: false });
    expect(db._insert).toHaveBeenCalledTimes(1);
    const inserted = db._values.mock.calls[0][0];
    expect(inserted.kind).toBe("post_meeting_followup");
    expect(inserted.calendarEventId).toBe("g-evt-1");
    expect(inserted.engagementId).toBe("eng-1");
    expect(inserted.threadId).toBe("thr-1");
    expect(inserted.status).toBe("pending");
    // trigger_after = end + 1 hour
    expect((inserted.triggerAfter as Date).toISOString()).toBe(
      "2026-05-12T19:00:00.000Z"
    );
  });

  it("returns existing pending watcher without inserting", async () => {
    const db = makeMockDb({ existing: { id: "wat-existing" } });
    const out = await schedulePostMeetingWatcher({
      db,
      calendarEventId: "g-evt-1",
      eventEndAt: new Date("2026-05-12T18:00:00Z"),
    });

    expect(out).toEqual({
      watcherId: "wat-existing",
      alreadyExisted: true,
    });
    expect(db._insert).not.toHaveBeenCalled();
  });

  it("returns existing fired watcher without inserting", async () => {
    // The query already filters status IN (pending, fired) → mock just returns it.
    const db = makeMockDb({ existing: { id: "wat-fired" } });
    const out = await schedulePostMeetingWatcher({
      db,
      calendarEventId: "g-evt-fired",
      eventEndAt: "2026-05-12T18:00:00Z",
    });

    expect(out).toEqual({ watcherId: "wat-fired", alreadyExisted: true });
    expect(db._insert).not.toHaveBeenCalled();
  });

  it("accepts string eventEndAt and computes trigger_after correctly", async () => {
    const db = makeMockDb({ existing: null, insertedId: "wat-x" });
    await schedulePostMeetingWatcher({
      db,
      calendarEventId: "g-evt-2",
      eventEndAt: "2026-01-09T17:00:00Z",
    });
    const inserted = db._values.mock.calls[0][0];
    expect((inserted.triggerAfter as Date).toISOString()).toBe(
      "2026-01-09T18:00:00.000Z"
    );
  });

  it("rejects empty calendarEventId", async () => {
    const db = makeMockDb({});
    await expect(
      schedulePostMeetingWatcher({
        db,
        calendarEventId: "",
        eventEndAt: new Date(),
      })
    ).rejects.toThrow(/calendarEventId/);
  });

  it("rejects invalid eventEndAt", async () => {
    const db = makeMockDb({});
    await expect(
      schedulePostMeetingWatcher({
        db,
        calendarEventId: "g-evt",
        eventEndAt: "not-a-date",
      })
    ).rejects.toThrow(/invalid eventEndAt/);
  });
});
