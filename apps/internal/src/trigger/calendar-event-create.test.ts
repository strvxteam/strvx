import { describe, it, expect, vi, beforeEach } from "vitest";
import type { calendar_v3 } from "googleapis";
import type { db as DbType } from "@strvx/db";

vi.mock("@/lib/agent/follow-up/schedule-post-meeting", () => ({
  schedulePostMeetingWatcher: vi
    .fn()
    .mockResolvedValue({ watcherId: "wat-mock", alreadyExisted: false }),
}));

import { runCalendarEventCreate } from "./calendar-event-create";
import { schedulePostMeetingWatcher } from "@/lib/agent/follow-up/schedule-post-meeting";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROPOSAL_ID = "00000000-0000-0000-0000-000000000001";
const THREAD_ID = "00000000-0000-0000-0000-000000000002";
const MAILBOX_ID = "00000000-0000-0000-0000-000000000003";
const COS_RUN_ID = "00000000-0000-0000-0000-000000000004";

type ProposalRow = {
  id: string;
  threadId: string;
  mailboxId: string;
  engagementId: string | null;
  cosRunId: string | null;
  kind: "new_meeting" | "reschedule" | "cancel";
  existingCalendarEventId: string | null;
  durationMinutes: number;
  meetingTitle: string;
  meetingDescription: string | null;
  proposedSlots: unknown;
  chosenSlot: unknown;
  attendees: unknown;
  location: string;
  meetLink: string | null;
  createdGoogleEventId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

function baseProposal(overrides: Partial<ProposalRow> = {}): ProposalRow {
  return {
    id: PROPOSAL_ID,
    threadId: THREAD_ID,
    mailboxId: MAILBOX_ID,
    engagementId: null,
    cosRunId: COS_RUN_ID,
    kind: "new_meeting",
    existingCalendarEventId: null,
    durationMinutes: 30,
    meetingTitle: "Intro call",
    meetingDescription: null,
    proposedSlots: [
      { start: "2026-05-14T17:00:00.000Z", end: "2026-05-14T17:30:00.000Z" },
    ],
    chosenSlot: {
      start: "2026-05-14T17:00:00.000Z",
      end: "2026-05-14T17:30:00.000Z",
    },
    attendees: ["alice@strvx.com", "sarah@acme.com"],
    location: "Google Meet",
    meetLink: null,
    createdGoogleEventId: null,
    status: "confirmed",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock db factory — supports the sequence of selects + transaction the job
// performs.
// ---------------------------------------------------------------------------

type TxFn = (tx: unknown) => Promise<unknown>;

function makeMockDb(opts: {
  proposal: ProposalRow | null;
  threadEngagementId?: string | null;
  draftApprover?: string | null;
}) {
  let selectIdx = 0;
  const selectImpl = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockImplementation(() => {
          const i = selectIdx++;
          if (i === 0) {
            return Promise.resolve(opts.proposal ? [opts.proposal] : []);
          }
          if (i === 1) {
            return Promise.resolve([
              { engagementId: opts.threadEngagementId ?? null },
            ]);
          }
          if (i === 2) {
            return Promise.resolve(
              opts.draftApprover !== undefined
                ? [{ approvedByUserId: opts.draftApprover }]
                : []
            );
          }
          return Promise.resolve([]);
        }),
      }),
    }),
  }));

  const updateSet = vi
    .fn()
    .mockReturnValue({ where: vi.fn().mockResolvedValue({ rowCount: 1 }) });
  const updateImpl = vi.fn().mockReturnValue({ set: updateSet });

  const txUpdateSet = vi
    .fn()
    .mockReturnValue({ where: vi.fn().mockResolvedValue({ rowCount: 1 }) });
  const txUpdate = vi.fn().mockReturnValue({ set: txUpdateSet });
  const txInsertValues = vi.fn().mockResolvedValue(undefined);
  const txInsert = vi.fn().mockReturnValue({ values: txInsertValues });

  const txImpl = vi.fn().mockImplementation(async (fn: TxFn) =>
    fn({ insert: txInsert, update: txUpdate })
  );

  return {
    select: selectImpl,
    update: updateImpl,
    transaction: txImpl,
    _updateSet: updateSet,
    _txInsertValues: txInsertValues,
    _txUpdateSet: txUpdateSet,
  } as unknown as typeof DbType & {
    _updateSet: ReturnType<typeof vi.fn>;
    _txInsertValues: ReturnType<typeof vi.fn>;
    _txUpdateSet: ReturnType<typeof vi.fn>;
  };
}

function makeCalendar(opts: {
  insertImpl?: ReturnType<typeof vi.fn>;
  insertError?: unknown;
} = {}): calendar_v3.Calendar {
  const insert =
    opts.insertImpl ??
    vi.fn().mockImplementation(() => {
      if (opts.insertError) return Promise.reject(opts.insertError);
      return Promise.resolve({
        data: {
          id: "g-event-1",
          hangoutLink: "https://meet.google.com/abc-defg-hij",
          iCalUID: "ical-1",
          conferenceData: {
            entryPoints: [
              {
                entryPointType: "video",
                uri: "https://meet.google.com/abc-defg-hij",
              },
            ],
          },
        },
      });
    });
  return {
    events: { insert },
  } as unknown as calendar_v3.Calendar;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runCalendarEventCreate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("happy path: creates a Google event, updates proposal, inserts calendar_events row", async () => {
    const db = makeMockDb({
      proposal: baseProposal(),
      threadEngagementId: "eng-1",
      draftApprover: "user-uuid",
    });
    const calendar = makeCalendar();

    const result = await runCalendarEventCreate({
      schedulingProposalId: PROPOSAL_ID,
      calendar,
      db,
    });

    expect(result).toEqual({
      status: "created",
      googleEventId: "g-event-1",
      meetLink: "https://meet.google.com/abc-defg-hij",
    });

    const insert = calendar.events.insert as ReturnType<typeof vi.fn>;
    expect(insert).toHaveBeenCalledTimes(1);
    const arg = insert.mock.calls[0][0];
    expect(arg.calendarId).toBe("primary");
    expect(arg.conferenceDataVersion).toBe(1);
    expect(arg.requestBody.summary).toBe("Intro call");
    expect(arg.requestBody.attendees).toEqual([
      { email: "alice@strvx.com" },
      { email: "sarah@acme.com" },
    ]);
    expect(arg.requestBody.conferenceData.createRequest.requestId).toContain(
      PROPOSAL_ID
    );

    // Transaction ran with insert + update
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db._txInsertValues).toHaveBeenCalledTimes(1);
    const inserted = db._txInsertValues.mock.calls[0][0];
    expect(inserted).toMatchObject({
      title: "Intro call",
      googleEventId: "g-event-1",
      engagementId: "eng-1",
      icalUid: "ical-1",
      zoomLink: "https://meet.google.com/abc-defg-hij",
      createdBy: "user-uuid",
      date: "2026-05-14",
    });

    // Post-meeting watcher was armed with the chosen slot's end time
    expect(schedulePostMeetingWatcher).toHaveBeenCalledTimes(1);
    const watcherArg = vi.mocked(schedulePostMeetingWatcher).mock.calls[0][0];
    expect(watcherArg.calendarEventId).toBe("g-event-1");
    expect(watcherArg.engagementId).toBe("eng-1");
    expect(watcherArg.threadId).toBe(THREAD_ID);
    expect(watcherArg.eventEndAt).toBe("2026-05-14T17:30:00.000Z");
  });

  it("watcher schedule failure does not roll back the calendar create", async () => {
    vi.mocked(schedulePostMeetingWatcher).mockRejectedValueOnce(
      new Error("db down")
    );
    const db = makeMockDb({
      proposal: baseProposal(),
      threadEngagementId: "eng-1",
      draftApprover: null,
    });
    const calendar = makeCalendar();

    const result = await runCalendarEventCreate({
      schedulingProposalId: PROPOSAL_ID,
      calendar,
      db,
    });

    expect(result.status).toBe("created");
  });

  it("idempotency: returns skipped when createdGoogleEventId is already set", async () => {
    const db = makeMockDb({
      proposal: baseProposal({ createdGoogleEventId: "prior-event" }),
    });
    const calendar = makeCalendar();

    const result = await runCalendarEventCreate({
      schedulingProposalId: PROPOSAL_ID,
      calendar,
      db,
    });

    expect(result).toEqual({
      status: "skipped",
      reason: "already_created",
    });
    expect(calendar.events.insert).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("throws when proposal status is not 'confirmed'", async () => {
    const db = makeMockDb({
      proposal: baseProposal({ status: "pending" }),
    });
    const calendar = makeCalendar();

    await expect(
      runCalendarEventCreate({
        schedulingProposalId: PROPOSAL_ID,
        calendar,
        db,
      })
    ).rejects.toThrow(/expected 'confirmed'/);
    expect(calendar.events.insert).not.toHaveBeenCalled();
  });

  it("throws when proposal is missing chosen_slot", async () => {
    const db = makeMockDb({
      proposal: baseProposal({ chosenSlot: null }),
    });
    const calendar = makeCalendar();

    await expect(
      runCalendarEventCreate({
        schedulingProposalId: PROPOSAL_ID,
        calendar,
        db,
      })
    ).rejects.toThrow(/missing chosen_slot/);
  });

  it("on 403 insufficient permission: sets proposal status to 'error' and returns error result", async () => {
    const scopeErr = Object.assign(new Error("Insufficient Permission"), {
      code: 403,
    });
    const db = makeMockDb({ proposal: baseProposal() });
    const calendar = makeCalendar({ insertError: scopeErr });

    const result = await runCalendarEventCreate({
      schedulingProposalId: PROPOSAL_ID,
      calendar,
      db,
    });

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error).toBe("calendar_scope_missing");
    }

    // Status update to 'error' fired
    expect(db.update).toHaveBeenCalled();
    expect(db._updateSet).toHaveBeenCalled();
    const firstUpdateArg = db._updateSet.mock.calls[0][0];
    expect(firstUpdateArg).toMatchObject({ status: "error" });
  });
});
