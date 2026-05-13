import { describe, it, expect, vi, beforeEach } from "vitest";
import type { calendar_v3 } from "googleapis";
import { fetchCalendarEvents, checkCalendarTool } from "./check-calendar";
import type { ToolContext } from "../types";

vi.mock("@/lib/agent/mailbox-oauth", () => ({
  getAuthedMailboxClient: vi.fn(),
  getAuthedMailboxClientSafe: vi.fn(),
}));

vi.mock("googleapis", async (orig) => {
  const actual = await orig<typeof import("googleapis")>();
  return {
    ...actual,
    google: {
      ...actual.google,
      calendar: vi.fn(),
    },
  };
});

import { getAuthedMailboxClientSafe } from "@/lib/agent/mailbox-oauth";
import { google } from "googleapis";

function makeCalendar(opts: {
  listImpl?: () => Promise<{ data: calendar_v3.Schema$Events }>;
}): calendar_v3.Calendar {
  const list =
    opts.listImpl ??
    (() => Promise.resolve({ data: { items: [] } as calendar_v3.Schema$Events }));
  return {
    events: { list: vi.fn(list) },
  } as unknown as calendar_v3.Calendar;
}

const RANGE = {
  start: "2026-05-12T00:00:00.000Z",
  end: "2026-05-13T00:00:00.000Z",
};

describe("fetchCalendarEvents", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns shaped events on the ok path", async () => {
    const calendar = makeCalendar({
      listImpl: () =>
        Promise.resolve({
          data: {
            items: [
              {
                id: "evt-1",
                summary: "Sync",
                status: "confirmed",
                start: { dateTime: "2026-05-12T17:00:00.000Z" },
                end: { dateTime: "2026-05-12T17:30:00.000Z" },
                attendees: [{ email: "a@x.com" }, { email: "b@y.com" }],
              },
              {
                id: "evt-2",
                summary: "All-day",
                status: "confirmed",
                start: { date: "2026-05-12" },
                end: { date: "2026-05-13" },
              },
            ],
          } as calendar_v3.Schema$Events,
        }),
    });

    const out = await fetchCalendarEvents({
      calendar,
      email: "team@strvx.com",
      ...RANGE,
    });

    expect("error" in out).toBe(false);
    if ("error" in out) return;
    expect(out.events).toHaveLength(2);
    expect(out.events[0]).toEqual({
      id: "evt-1",
      summary: "Sync",
      status: "confirmed",
      start: "2026-05-12T17:00:00.000Z",
      end: "2026-05-12T17:30:00.000Z",
      attendees: ["a@x.com", "b@y.com"],
    });
    expect(out.events[1].attendees).toBeUndefined();
    expect(out.range).toEqual(RANGE);
  });

  it("returns calendar_scope_missing on a 403 insufficient-permissions error", async () => {
    const calendar = makeCalendar({
      listImpl: () =>
        Promise.reject(
          Object.assign(new Error("Request had insufficient authentication scopes."), {
            code: 403,
          })
        ),
    });

    const out = await fetchCalendarEvents({
      calendar,
      email: "team@strvx.com",
      ...RANGE,
    });

    expect("error" in out).toBe(true);
    if (!("error" in out)) return;
    expect(out.error).toBe("calendar_scope_missing");
    expect(out.events).toEqual([]);
    expect(out.message).toContain("team@strvx.com");
    expect(out.message).toContain("/agent/connect-mailbox");
  });

  it("rethrows non-403 errors", async () => {
    const calendar = makeCalendar({
      listImpl: () =>
        Promise.reject(Object.assign(new Error("boom"), { code: 500 })),
    });

    await expect(
      fetchCalendarEvents({ calendar, email: "team@strvx.com", ...RANGE })
    ).rejects.toThrow("boom");
  });

  it("caps returned events at 200", async () => {
    const items = Array.from({ length: 250 }, (_, i) => ({
      id: `e${i}`,
      summary: `E${i}`,
      status: "confirmed",
      start: { dateTime: "2026-05-12T17:00:00.000Z" },
      end: { dateTime: "2026-05-12T17:30:00.000Z" },
    }));
    const calendar = makeCalendar({
      listImpl: () =>
        Promise.resolve({ data: { items } as calendar_v3.Schema$Events }),
    });

    const out = await fetchCalendarEvents({
      calendar,
      email: "team@strvx.com",
      ...RANGE,
    });

    expect("error" in out).toBe(false);
    if ("error" in out) return;
    expect(out.events).toHaveLength(200);
  });
});

describe("checkCalendarTool.handle", () => {
  beforeEach(() => vi.clearAllMocks());

  const ctx = {
    mailboxId: "mbx-1",
    threadId: "thr-1",
    cosRunId: "run-1",
    db: {} as ToolContext["db"],
  } as ToolContext;

  it("returns mailbox_not_found when the row is missing", async () => {
    vi.mocked(getAuthedMailboxClientSafe).mockResolvedValueOnce({
      ok: false,
      error: "not_found",
      message: "Mailbox mbx-1 not found",
    });

    const out = await checkCalendarTool.handle(
      { start: RANGE.start, end: RANGE.end },
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

    const out = await checkCalendarTool.handle(
      { start: RANGE.start, end: RANGE.end },
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
      checkCalendarTool.handle({ start: RANGE.start, end: RANGE.end }, ctx)
    ).rejects.toThrow(/transient/);
  });

  it("uses authed client to fetch events on the ok path", async () => {
    vi.mocked(getAuthedMailboxClientSafe).mockResolvedValueOnce({
      ok: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: {} as any,
      email: "team@strvx.com",
    });
    const calendar = makeCalendar({
      listImpl: () =>
        Promise.resolve({
          data: {
            items: [
              {
                id: "evt-1",
                summary: "Sync",
                status: "confirmed",
                start: { dateTime: "2026-05-12T17:00:00.000Z" },
                end: { dateTime: "2026-05-12T17:30:00.000Z" },
              },
            ],
          } as calendar_v3.Schema$Events,
        }),
    });
    vi.mocked(google.calendar).mockReturnValueOnce(calendar);

    const out = await checkCalendarTool.handle(
      { start: RANGE.start, end: RANGE.end },
      ctx
    );

    expect("error" in out).toBe(false);
    if ("error" in out) return;
    expect(out.events).toHaveLength(1);
  });
});
