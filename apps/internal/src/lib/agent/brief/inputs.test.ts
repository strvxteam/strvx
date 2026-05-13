import { describe, it, expect, vi, beforeEach } from "vitest";
import type { db as DbType } from "@strvx/db";
import { assembleBriefInputs, todayInPT, ptDateOffset } from "./inputs";

// ---------------------------------------------------------------------------
// todayInPT / ptDateOffset
// ---------------------------------------------------------------------------

describe("todayInPT", () => {
  it("returns the PT date (YYYY-MM-DD) for a UTC instant after PT midnight", () => {
    // 2026-05-11 14:00 UTC == 2026-05-11 07:00 PT → "2026-05-11"
    expect(todayInPT(new Date("2026-05-11T14:00:00Z"))).toBe("2026-05-11");
  });

  it("rolls back to the prior PT date when UTC is just past midnight UTC", () => {
    // 2026-05-11 02:00 UTC == 2026-05-10 19:00 PT → "2026-05-10"
    expect(todayInPT(new Date("2026-05-11T02:00:00Z"))).toBe("2026-05-10");
  });
});

describe("ptDateOffset", () => {
  it("returns next-day PT date", () => {
    expect(ptDateOffset(new Date("2026-05-11T14:00:00Z"), 1)).toBe("2026-05-12");
  });

  it("returns prior-day PT date", () => {
    expect(ptDateOffset(new Date("2026-05-11T14:00:00Z"), -1)).toBe("2026-05-10");
  });
});

// ---------------------------------------------------------------------------
// assembleBriefInputs — empty + full database state
// ---------------------------------------------------------------------------

type SelectQueue = Array<unknown[]>;

/**
 * Build a mock Drizzle db whose `select(...).from(...).leftJoin?.where(...)
 * .orderBy(...)` chains resolve to rows in the order given by `queue`.
 * Each entry in `queue` corresponds to one `db.select(...)` call.
 */
function makeMockDb(queue: SelectQueue) {
  let idx = 0;
  const select = vi.fn().mockImplementation(() => {
    const myIdx = idx++;
    const rows = queue[myIdx] ?? [];

    // Final node — supports both `await orderBy(...)` (thenable) and a raw array.
    const orderBy = vi.fn().mockImplementation(() => Promise.resolve(rows));

    const where = vi.fn().mockReturnValue({ orderBy });
    const leftJoin = vi.fn().mockReturnValue({ where, orderBy });
    const from = vi.fn().mockReturnValue({ where, leftJoin, orderBy });
    return { from };
  });

  return { select } as unknown as typeof DbType;
}

const NOW = new Date("2026-05-11T14:00:00Z"); // 07:00 PT, the cron's target time

describe("assembleBriefInputs (empty db)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty arrays and the correct PT date when nothing matches", async () => {
    const db = makeMockDb([
      [], // unread inbound
      [], // requires_human threads
      [], // stale threads
      [], // calendar events
      [], // overdue next actions
      [], // drafts pending review
    ]);

    const result = await assembleBriefInputs({ db, now: NOW });

    expect(result.date).toBe("2026-05-11");
    expect(result.generatedAt).toBe(NOW.toISOString());
    expect(result.unreadByCategory).toEqual([]);
    expect(result.needsHumanThreads).toEqual([]);
    expect(result.staleThreads).toEqual([]);
    expect(result.todayEvents).toEqual([]);
    expect(result.tomorrowEvents).toEqual([]);
    expect(result.overdueNextActions).toEqual([]);
    expect(result.draftsPendingReview).toEqual([]);
  });
});

describe("assembleBriefInputs (populated db)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("groups unread inbound by category and caps each group at 5 samples", async () => {
    const unread = [
      {
        threadId: "t-1",
        subject: "Lead 1",
        fromEmail: "a@x.com",
        fromName: "A",
        sentAt: new Date("2026-05-11T10:00:00Z"),
        snippet: "hello",
        category: "lead_inquiry",
      },
      {
        threadId: "t-2",
        subject: "Lead 2",
        fromEmail: "b@x.com",
        fromName: null,
        sentAt: new Date("2026-05-11T09:00:00Z"),
        snippet: null,
        category: "lead_inquiry",
      },
      {
        threadId: "t-3",
        subject: "Vendor 1",
        fromEmail: "v@y.com",
        fromName: "V",
        sentAt: new Date("2026-05-11T08:00:00Z"),
        snippet: "inv",
        category: "vendor",
      },
      {
        threadId: "t-4",
        subject: "Uncat",
        fromEmail: "u@z.com",
        fromName: null,
        sentAt: new Date("2026-05-11T07:00:00Z"),
        snippet: null,
        category: null,
      },
    ];

    const db = makeMockDb([
      unread,
      [], // needsHuman
      [], // stale
      [], // calendar
      [], // overdue
      [], // drafts
    ]);

    const result = await assembleBriefInputs({ db, now: NOW });

    const leads = result.unreadByCategory.find((g) => g.category === "lead_inquiry");
    const vendor = result.unreadByCategory.find((g) => g.category === "vendor");
    const uncat = result.unreadByCategory.find((g) => g.category === "uncategorized");

    expect(leads?.count).toBe(2);
    expect(leads?.samples.length).toBe(2);
    expect(vendor?.count).toBe(1);
    expect(uncat?.count).toBe(1);
  });

  it("filters needs-human threads to those without a pending/approved draft", async () => {
    const needsHuman = [
      {
        threadId: "th-1",
        subject: "no draft",
        lastInboundAt: new Date("2026-05-10T10:00:00Z"),
        urgency: "urgent",
        category: "client_active",
        draftId: null,
      },
      {
        threadId: "th-2",
        subject: "has draft",
        lastInboundAt: new Date("2026-05-10T11:00:00Z"),
        urgency: "normal",
        category: "client_active",
        draftId: "draft-uuid",
      },
    ];
    const db = makeMockDb([[], needsHuman, [], [], [], []]);

    const result = await assembleBriefInputs({ db, now: NOW });
    expect(result.needsHumanThreads.length).toBe(1);
    expect(result.needsHumanThreads[0].threadId).toBe("th-1");
  });

  it("computes daysSinceOutbound for stale threads", async () => {
    const stale = [
      {
        threadId: "s-1",
        subject: "ping?",
        lastOutboundAt: new Date("2026-05-06T14:00:00Z"), // 5 days before NOW
        lastInboundAt: null,
      },
    ];
    const db = makeMockDb([[], [], stale, [], [], []]);

    const result = await assembleBriefInputs({ db, now: NOW });
    expect(result.staleThreads).toEqual([
      {
        threadId: "s-1",
        subject: "ping?",
        lastOutboundAt: "2026-05-06T14:00:00.000Z",
        daysSinceOutbound: 5,
      },
    ]);
  });

  it("splits calendar events into today vs tomorrow by PT date", async () => {
    const events = [
      {
        id: "ev-1",
        title: "Today meeting",
        type: "client",
        date: "2026-05-11",
        startHour: "10",
        durationHours: "1",
        client: "Acme",
      },
      {
        id: "ev-2",
        title: "Tomorrow meeting",
        type: "internal",
        date: "2026-05-12",
        startHour: "14",
        durationHours: "0.5",
        client: null,
      },
      {
        id: "ev-3",
        title: "Stray (other day)",
        type: "internal",
        date: "2026-05-13",
        startHour: "9",
        durationHours: "1",
        client: null,
      },
    ];
    const db = makeMockDb([[], [], [], events, [], []]);

    const result = await assembleBriefInputs({ db, now: NOW });
    expect(result.todayEvents.map((e) => e.id)).toEqual(["ev-1"]);
    expect(result.tomorrowEvents.map((e) => e.id)).toEqual(["ev-2"]);
  });

  it("passes overdue next actions and drafts pending review straight through", async () => {
    const overdue = [
      {
        id: "na-1",
        description: "Send proposal",
        priority: "high",
        dueDate: "2026-05-09",
        engagementId: "eng-1",
      },
    ];
    const drafts = [
      {
        id: "d-1",
        threadId: "t-d-1",
        subject: "Re: pricing",
        toEmails: ["a@x.com"],
        confidence: "high",
        createdAt: new Date("2026-05-11T08:00:00Z"),
      },
    ];
    const db = makeMockDb([[], [], [], [], overdue, drafts]);

    const result = await assembleBriefInputs({ db, now: NOW });
    expect(result.overdueNextActions).toEqual([
      {
        id: "na-1",
        description: "Send proposal",
        priority: "high",
        dueDate: "2026-05-09",
        engagementId: "eng-1",
      },
    ]);
    expect(result.draftsPendingReview).toEqual([
      {
        id: "d-1",
        threadId: "t-d-1",
        subject: "Re: pricing",
        toEmails: ["a@x.com"],
        confidence: "high",
        createdAt: "2026-05-11T08:00:00.000Z",
      },
    ]);
  });
});
