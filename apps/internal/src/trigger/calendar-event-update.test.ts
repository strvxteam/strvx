import { describe, it, expect, vi, beforeEach } from "vitest";
import type { calendar_v3 } from "googleapis";
import type { db as DbType } from "@strvx/db";
import { runCalendarEventUpdate } from "./calendar-event-update";

const PROPOSAL_ID = "00000000-0000-0000-0000-0000000000a1";
const EXISTING_EVENT_ID = "existing-google-event-1";

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
    kind: "reschedule",
    existingCalendarEventId: EXISTING_EVENT_ID,
    durationMinutes: 30,
    meetingTitle: "Move intro call",
    meetingDescription: null,
    proposedSlots: [],
    chosenSlot: {
      start: "2026-05-15T18:00:00.000Z",
      end: "2026-05-15T18:30:00.000Z",
    },
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

function makeMockDb(opts: {
  proposal: ProposalRow | null;
  localRow?:
    | { id: string; date: string; startHour: string }
    | null;
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
            return Promise.resolve(opts.localRow ? [opts.localRow] : []);
          }
          return Promise.resolve([]);
        }),
      }),
    }),
  }));

  const txUpdateSet = vi
    .fn()
    .mockReturnValue({ where: vi.fn().mockResolvedValue({ rowCount: 1 }) });
  const txUpdate = vi.fn().mockReturnValue({ set: txUpdateSet });
  const txImpl = vi.fn().mockImplementation(async (fn: TxFn) =>
    fn({ update: txUpdate, insert: vi.fn() })
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
  } as unknown as typeof DbType & {
    _txUpdateSet: ReturnType<typeof vi.fn>;
  };
}

function makeCalendar(patchError?: unknown): calendar_v3.Calendar {
  const patch = vi.fn().mockImplementation(() => {
    if (patchError) return Promise.reject(patchError);
    return Promise.resolve({ data: {} });
  });
  return {
    events: { patch },
  } as unknown as calendar_v3.Calendar;
}

describe("runCalendarEventUpdate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("happy path: patches Google event and updates local row", async () => {
    const db = makeMockDb({
      proposal: baseProposal(),
      localRow: { id: "row-1", date: "2026-05-14", startHour: "17" },
    });
    const calendar = makeCalendar();

    const result = await runCalendarEventUpdate({
      schedulingProposalId: PROPOSAL_ID,
      calendar,
      db,
    });

    expect(result).toEqual({
      status: "updated",
      googleEventId: EXISTING_EVENT_ID,
    });
    const patch = calendar.events.patch as ReturnType<typeof vi.fn>;
    expect(patch).toHaveBeenCalledTimes(1);
    const arg = patch.mock.calls[0][0];
    expect(arg.eventId).toBe(EXISTING_EVENT_ID);
    expect(arg.requestBody.start.dateTime).toBe("2026-05-15T18:00:00.000Z");

    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it("throws if kind is not 'reschedule'", async () => {
    const db = makeMockDb({
      proposal: baseProposal({ kind: "new_meeting" }),
    });
    const calendar = makeCalendar();

    await expect(
      runCalendarEventUpdate({
        schedulingProposalId: PROPOSAL_ID,
        calendar,
        db,
      })
    ).rejects.toThrow(/expected 'reschedule'/);
  });
});
