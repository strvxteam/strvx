import { describe, it, expect, vi, beforeEach } from "vitest";
import type { calendar_v3 } from "googleapis";
import {
  db as DbType,
  contacts,
  engagements,
  mailboxOauthTokens,
  meetingPrepBriefs,
} from "@strvx/db";
import { runMeetingPrepBriefCron } from "./meeting-prep-brief";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date("2026-05-12T17:00:00Z");

type MailboxRow = { id: string; email: string };
type ContactRow = { email: string; companyId: string };
type EngagementRow = { id: string; companyId: string };

type MockState = {
  mailboxes: MailboxRow[];
  existingBriefIds: string[];
  contactsByEmail: Record<string, ContactRow>;
  engagementsByCompany: Record<string, EngagementRow>;
};

/**
 * Query-aware mock — looks at the first table referenced by `.from(table)` and
 * routes to the appropriate canned data. Each `select().from().where(...)`
 * chain is terminated by either `.where(...).limit(N)` or just `.where(...)`.
 *
 * `rowsForTable` is invoked exactly once per chain (lazily, on terminal access)
 * so queue-style mocks pop the queue once per logical query.
 */
function makeMockDb(state: MockState) {
  const select = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockImplementation((table: unknown) => {
      return {
        where: (_cond: unknown) => {
          let rowsP: Promise<unknown[]> | null = null;
          const resolve = () => {
            if (!rowsP) rowsP = Promise.resolve(rowsForTable(table, state));
            return rowsP;
          };
          return {
            limit: () => resolve(),
            then: <T1, T2>(
              onFulfilled?: (v: unknown[]) => T1 | PromiseLike<T1>,
              onRejected?: (r: unknown) => T2 | PromiseLike<T2>
            ) => resolve().then(onFulfilled, onRejected),
          };
        },
      };
    }),
  }));

  return {
    select,
  } as unknown as typeof DbType;
}

function rowsForTable(table: unknown, state: MockState): unknown[] {
  if (table === mailboxOauthTokens) {
    return state.mailboxes;
  }
  if (table === meetingPrepBriefs) {
    return state.existingBriefIds.map((id) => ({ calendarEventId: id }));
  }
  if (table === contacts) {
    return contactRows(state);
  }
  if (table === engagements) {
    return engagementRows(state);
  }
  return [];
}

// Pop-from-front mocks so the cron sees one contact/engagement per call.
const contactQueues = new WeakMap<MockState, ContactRow[]>();
const engagementQueues = new WeakMap<MockState, EngagementRow[]>();

function contactRows(state: MockState): ContactRow[] {
  let q = contactQueues.get(state);
  if (!q) {
    q = Object.values(state.contactsByEmail).slice();
    contactQueues.set(state, q);
  }
  const next = q.shift();
  return next ? [{ email: next.email, companyId: next.companyId }] : [];
}

function engagementRows(state: MockState): EngagementRow[] {
  let q = engagementQueues.get(state);
  if (!q) {
    q = Object.values(state.engagementsByCompany).slice();
    engagementQueues.set(state, q);
  }
  const next = q.shift();
  return next ? [{ id: next.id, companyId: next.companyId }] : [];
}

function makeCalendar(
  itemsByEmail: Record<string, calendar_v3.Schema$Event[]>,
  scopeMissingEmails: Set<string> = new Set()
) {
  return (email: string): calendar_v3.Calendar => {
    const list = vi.fn().mockImplementation(async () => {
      if (scopeMissingEmails.has(email)) {
        const err: Error & { code?: number } = new Error("Insufficient Permission");
        err.code = 403;
        throw err;
      }
      return { data: { items: itemsByEmail[email] ?? [] } };
    });
    return {
      events: { list },
    } as unknown as calendar_v3.Calendar;
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runMeetingPrepBriefCron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates a brief for each qualifying event across mailboxes", async () => {
    const mb1 = { id: "mb-1", email: "team@strvx.com" };
    const mb2 = { id: "mb-2", email: "alt@strvx.com" };

    const eventsByEmail = {
      [mb1.email]: [
        {
          id: "ev-1",
          summary: "Intro w/ Acme",
          start: { dateTime: "2026-05-12T17:30:00Z" },
          end: { dateTime: "2026-05-12T18:00:00Z" },
          attendees: [
            { email: "alice@strvx.com" },
            { email: "client@acme.com" },
          ],
          status: "confirmed",
        },
      ],
      [mb2.email]: [
        {
          id: "ev-2",
          summary: "Sync w/ Globex",
          start: { dateTime: "2026-05-12T17:45:00Z" },
          end: { dateTime: "2026-05-12T18:15:00Z" },
          attendees: [
            { email: "alt@strvx.com" },
            { email: "lead@globex.com" },
          ],
          status: "confirmed",
        },
      ],
    };

    const state: MockState = {
      mailboxes: [mb1, mb2],
      existingBriefIds: [],
      contactsByEmail: {
        "client@acme.com": { email: "client@acme.com", companyId: "co-acme" },
        "lead@globex.com": { email: "lead@globex.com", companyId: "co-globex" },
      },
      engagementsByCompany: {
        "co-acme": { id: "eng-acme", companyId: "co-acme" },
        "co-globex": { id: "eng-globex", companyId: "co-globex" },
      },
    };
    const db = makeMockDb(state);

    const calendarFactoryImpl = makeCalendar(eventsByEmail);
    const calendarFactory = vi
      .fn()
      .mockImplementation(async (mailboxId: string) => {
        const mb = state.mailboxes.find((m) => m.id === mailboxId)!;
        return { calendar: calendarFactoryImpl(mb.email), email: mb.email };
      });

    const generate = vi.fn().mockImplementation(async () => ({
      briefId: "brief-id",
      cosRunId: "cos-run-id",
      contentMarkdown: "## ...",
    }));

    const result = await runMeetingPrepBriefCron({
      db,
      now: NOW,
      calendarFactory,
      generate,
    });

    expect(result.mailboxes).toHaveLength(2);
    expect(result.mailboxes.every((m) => m.status === "ok")).toBe(true);
    expect(generate).toHaveBeenCalledTimes(2);

    // First call: ev-1 with eng-acme
    const call1 = generate.mock.calls[0][0];
    expect(call1.event.id).toBe("ev-1");
    expect(call1.mailboxId).toBe("mb-1");
    expect(call1.engagementId).toBe("eng-acme");

    const call2 = generate.mock.calls[1][0];
    expect(call2.event.id).toBe("ev-2");
    expect(call2.mailboxId).toBe("mb-2");
    expect(call2.engagementId).toBe("eng-globex");
  });

  it("scope_missing on one mailbox: status set, no events processed for it", async () => {
    const mb1 = { id: "mb-ok", email: "team@strvx.com" };
    const mb2 = { id: "mb-bad", email: "noscope@strvx.com" };

    const state: MockState = {
      mailboxes: [mb1, mb2],
      existingBriefIds: [],
      contactsByEmail: {
        "client@acme.com": { email: "client@acme.com", companyId: "co-1" },
      },
      engagementsByCompany: {
        "co-1": { id: "eng-1", companyId: "co-1" },
      },
    };
    const db = makeMockDb(state);

    const eventsByEmail = {
      [mb1.email]: [
        {
          id: "ev-ok",
          summary: "Meeting",
          start: { dateTime: "2026-05-12T17:30:00Z" },
          end: { dateTime: "2026-05-12T18:00:00Z" },
          attendees: [
            { email: "alice@strvx.com" },
            { email: "client@acme.com" },
          ],
          status: "confirmed",
        },
      ],
    };

    const factoryImpl = makeCalendar(eventsByEmail, new Set([mb2.email]));
    const calendarFactory = vi
      .fn()
      .mockImplementation(async (mailboxId: string) => {
        const mb = state.mailboxes.find((m) => m.id === mailboxId)!;
        return { calendar: factoryImpl(mb.email), email: mb.email };
      });

    const generate = vi.fn().mockImplementation(async () => ({
      briefId: "brief-id",
      cosRunId: "run-id",
      contentMarkdown: "x",
    }));

    const result = await runMeetingPrepBriefCron({
      db,
      now: NOW,
      calendarFactory,
      generate,
    });

    const okSummary = result.mailboxes.find((m) => m.mailboxId === "mb-ok")!;
    const badSummary = result.mailboxes.find((m) => m.mailboxId === "mb-bad")!;
    expect(okSummary.status).toBe("ok");
    expect(okSummary.generated).toBe(1);
    expect(badSummary.status).toBe("scope_missing");
    expect(badSummary.generated).toBe(0);

    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("idempotency: skips events that already have a brief row", async () => {
    const mb = { id: "mb-1", email: "team@strvx.com" };
    const state: MockState = {
      mailboxes: [mb],
      existingBriefIds: ["ev-already"],
      contactsByEmail: {
        "client@acme.com": { email: "client@acme.com", companyId: "co" },
      },
      engagementsByCompany: { co: { id: "eng", companyId: "co" } },
    };
    const db = makeMockDb(state);

    const eventsByEmail = {
      [mb.email]: [
        {
          id: "ev-already",
          summary: "Old meeting",
          start: { dateTime: "2026-05-12T17:30:00Z" },
          end: { dateTime: "2026-05-12T18:00:00Z" },
          attendees: [
            { email: "alice@strvx.com" },
            { email: "client@acme.com" },
          ],
          status: "confirmed",
        },
        {
          id: "ev-new",
          summary: "New meeting",
          start: { dateTime: "2026-05-12T17:45:00Z" },
          end: { dateTime: "2026-05-12T18:15:00Z" },
          attendees: [
            { email: "alice@strvx.com" },
            { email: "client@acme.com" },
          ],
          status: "confirmed",
        },
      ],
    };
    const factoryImpl = makeCalendar(eventsByEmail);
    const calendarFactory = vi.fn().mockImplementation(async () => ({
      calendar: factoryImpl(mb.email),
      email: mb.email,
    }));

    const generate = vi.fn().mockImplementation(async () => ({
      briefId: "b",
      cosRunId: "r",
      contentMarkdown: "x",
    }));

    const result = await runMeetingPrepBriefCron({
      db,
      now: NOW,
      calendarFactory,
      generate,
    });

    expect(generate).toHaveBeenCalledTimes(1);
    const arg = generate.mock.calls[0][0];
    expect(arg.event.id).toBe("ev-new");
    expect(result.mailboxes[0].generated).toBe(1);
    expect(result.mailboxes[0].eventsConsidered).toBe(2);
  });

  it("error in one event does not kill the cron", async () => {
    const mb = { id: "mb-1", email: "team@strvx.com" };
    const state: MockState = {
      mailboxes: [mb],
      existingBriefIds: [],
      contactsByEmail: {
        "client@acme.com": { email: "client@acme.com", companyId: "co" },
        "lead@globex.com": { email: "lead@globex.com", companyId: "co2" },
      },
      engagementsByCompany: {
        co: { id: "eng-1", companyId: "co" },
        co2: { id: "eng-2", companyId: "co2" },
      },
    };
    const db = makeMockDb(state);

    const eventsByEmail = {
      [mb.email]: [
        {
          id: "ev-fail",
          summary: "Will fail",
          start: { dateTime: "2026-05-12T17:30:00Z" },
          end: { dateTime: "2026-05-12T18:00:00Z" },
          attendees: [
            { email: "alice@strvx.com" },
            { email: "client@acme.com" },
          ],
          status: "confirmed",
        },
        {
          id: "ev-ok",
          summary: "Will succeed",
          start: { dateTime: "2026-05-12T17:45:00Z" },
          end: { dateTime: "2026-05-12T18:15:00Z" },
          attendees: [
            { email: "alice@strvx.com" },
            { email: "lead@globex.com" },
          ],
          status: "confirmed",
        },
      ],
    };
    const factoryImpl = makeCalendar(eventsByEmail);
    const calendarFactory = vi.fn().mockImplementation(async () => ({
      calendar: factoryImpl(mb.email),
      email: mb.email,
    }));

    const generate = vi
      .fn()
      .mockImplementationOnce(async () => {
        throw new Error("Model timeout");
      })
      .mockImplementationOnce(async () => ({
        briefId: "b2",
        cosRunId: "r2",
        contentMarkdown: "x",
      }));

    const result = await runMeetingPrepBriefCron({
      db,
      now: NOW,
      calendarFactory,
      generate,
    });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.mailboxes[0].generated).toBe(1);
    expect(result.mailboxes[0].errors).toBe(1);
    expect(result.mailboxes[0].status).toBe("ok");
  });

  it("event with no external attendees is skipped (no engagement lookup either)", async () => {
    const mb = { id: "mb-1", email: "team@strvx.com" };
    const state: MockState = {
      mailboxes: [mb],
      existingBriefIds: [],
      contactsByEmail: {},
      engagementsByCompany: {},
    };
    const db = makeMockDb(state);

    const eventsByEmail = {
      [mb.email]: [
        {
          id: "ev-internal",
          summary: "Standup",
          start: { dateTime: "2026-05-12T17:30:00Z" },
          end: { dateTime: "2026-05-12T18:00:00Z" },
          attendees: [
            { email: "alice@strvx.com" },
            { email: "bob@strvx.com" },
          ],
          status: "confirmed",
        },
      ],
    };
    const factoryImpl = makeCalendar(eventsByEmail);
    const calendarFactory = vi.fn().mockImplementation(async () => ({
      calendar: factoryImpl(mb.email),
      email: mb.email,
    }));

    const generate = vi.fn();

    const result = await runMeetingPrepBriefCron({
      db,
      now: NOW,
      calendarFactory,
      generate,
    });

    expect(generate).not.toHaveBeenCalled();
    expect(result.mailboxes[0].eventsConsidered).toBe(1);
    expect(result.mailboxes[0].generated).toBe(0);
  });
});
