import { describe, it, expect, vi, beforeEach } from "vitest";
import type { calendar_v3 } from "googleapis";
import type { db as DbType } from "@strvx/db";
import { runCalendarEventDelete } from "./calendar-event-delete";

const PROPOSAL_ID = "00000000-0000-0000-0000-0000000000b1";
const EXISTING_EVENT_ID = "existing-google-event-x";

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
    threadId: "thread-1",
    mailboxId: "mailbox-1",
    engagementId: null,
    cosRunId: null,
    kind: "cancel",
    existingCalendarEventId: EXISTING_EVENT_ID,
    durationMinutes: 30,
    meetingTitle: "Cancel intro call",
    meetingDescription: null,
    proposedSlots: [],
    chosenSlot: null,
    attendees: ["alice@strvx.com"],
    location: "Google Meet",
    meetLink: null,
    createdGoogleEventId: null,
    status: "confirmed",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

type TxFn = (tx: unknown) => Promise<unknown>;

function makeMockDb(proposal: ProposalRow | null) {
  const selectImpl = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(proposal ? [proposal] : []),
      }),
    }),
  });

  const txUpdateSet = vi
    .fn()
    .mockReturnValue({ where: vi.fn().mockResolvedValue({ rowCount: 1 }) });
  const txUpdate = vi.fn().mockReturnValue({ set: txUpdateSet });
  const txDeleteWhere = vi.fn().mockResolvedValue({ rowCount: 1 });
  const txDelete = vi.fn().mockReturnValue({ where: txDeleteWhere });
  const txImpl = vi.fn().mockImplementation(async (fn: TxFn) =>
    fn({ update: txUpdate, delete: txDelete })
  );

  return {
    select: selectImpl,
    update: vi.fn().mockReturnValue({
      set: vi
        .fn()
        .mockReturnValue({ where: vi.fn().mockResolvedValue({ rowCount: 1 }) }),
    }),
    transaction: txImpl,
    _txUpdateSet: txUpdateSet,
    _txDelete: txDelete,
  } as unknown as typeof DbType & {
    _txUpdateSet: ReturnType<typeof vi.fn>;
    _txDelete: ReturnType<typeof vi.fn>;
  };
}

function makeCalendar(deleteError?: unknown): calendar_v3.Calendar {
  const del = vi.fn().mockImplementation(() => {
    if (deleteError) return Promise.reject(deleteError);
    return Promise.resolve({});
  });
  return {
    events: { delete: del },
  } as unknown as calendar_v3.Calendar;
}

describe("runCalendarEventDelete", () => {
  beforeEach(() => vi.clearAllMocks());

  it("happy path: deletes Google event, marks proposal cancelled, removes local row", async () => {
    const db = makeMockDb(baseProposal());
    const calendar = makeCalendar();

    const result = await runCalendarEventDelete({
      schedulingProposalId: PROPOSAL_ID,
      calendar,
      db,
    });

    expect(result).toEqual({
      status: "cancelled",
      googleEventId: EXISTING_EVENT_ID,
    });
    const del = calendar.events.delete as ReturnType<typeof vi.fn>;
    expect(del).toHaveBeenCalledTimes(1);
    expect(del.mock.calls[0][0]).toEqual({
      calendarId: "primary",
      eventId: EXISTING_EVENT_ID,
    });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db._txDelete).toHaveBeenCalledTimes(1);
  });

  it("idempotency: returns skipped when proposal status is already 'cancelled'", async () => {
    const db = makeMockDb(baseProposal({ status: "cancelled" }));
    const calendar = makeCalendar();

    const result = await runCalendarEventDelete({
      schedulingProposalId: PROPOSAL_ID,
      calendar,
      db,
    });

    expect(result).toEqual({
      status: "skipped",
      reason: "already_cancelled",
    });
    expect(calendar.events.delete).not.toHaveBeenCalled();
  });
});
