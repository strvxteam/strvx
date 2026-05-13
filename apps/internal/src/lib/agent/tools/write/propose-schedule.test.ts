import { describe, it, expect, vi, beforeEach } from "vitest";
import type { db as DbType } from "@strvx/db";
import { proposeScheduleTool } from "./propose-schedule";
import type { ToolContext } from "../types";

// ---------------------------------------------------------------------------
// Mock DB factory
// ---------------------------------------------------------------------------

type ThreadRow = {
  id: string;
  mailboxId: string;
  engagementId: string | null;
};

function makeMockDb(opts: {
  thread?: ThreadRow | null;
  insertReturning?: { id: string };
}) {
  const insertReturning = opts.insertReturning ?? { id: "prop-1" };
  const insertValuesSpy = vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue([insertReturning]),
  });
  const insertImpl = vi.fn().mockReturnValue({ values: insertValuesSpy });

  const selectImpl = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi
          .fn()
          .mockResolvedValue(opts.thread ? [opts.thread] : []),
      }),
    }),
  });

  return {
    select: selectImpl,
    insert: insertImpl,
    _insertValuesSpy: insertValuesSpy,
  } as unknown as typeof DbType & {
    _insertValuesSpy: ReturnType<typeof vi.fn>;
  };
}

const THREAD_ID = "00000000-0000-0000-0000-00000000aaaa";
const OTHER_THREAD_ID = "00000000-0000-0000-0000-00000000bbbb";
const MAILBOX_ID = "00000000-0000-0000-0000-0000000000cc";
const OTHER_MAILBOX_ID = "00000000-0000-0000-0000-0000000000dd";
const COS_RUN_ID = "00000000-0000-0000-0000-0000000000ee";

const VALID_INPUT = {
  thread_id: THREAD_ID,
  kind: "new_meeting" as const,
  duration_minutes: 30,
  meeting_title: "Intro call",
  proposed_slots: [
    {
      start: "2026-05-13T16:00:00.000Z",
      end: "2026-05-13T16:30:00.000Z",
    },
  ],
  attendees: ["alice@strvx.com"],
};

describe("proposeScheduleTool.handle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns thread_id_mismatch when input thread_id != ctx.threadId", async () => {
    const db = makeMockDb({});
    const ctx: ToolContext = {
      db,
      mailboxId: MAILBOX_ID,
      threadId: OTHER_THREAD_ID,
      cosRunId: COS_RUN_ID,
    };
    const out = await proposeScheduleTool.handle(VALID_INPUT, ctx);
    expect(out).toEqual({ error: "thread_id_mismatch" });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("returns thread_not_found when DB returns no row", async () => {
    const db = makeMockDb({ thread: null });
    const ctx: ToolContext = {
      db,
      mailboxId: MAILBOX_ID,
      threadId: THREAD_ID,
      cosRunId: COS_RUN_ID,
    };
    const out = await proposeScheduleTool.handle(VALID_INPUT, ctx);
    expect(out).toEqual({ error: "thread_not_found" });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("returns thread_belongs_to_other_mailbox when mailbox mismatches", async () => {
    const db = makeMockDb({
      thread: {
        id: THREAD_ID,
        mailboxId: OTHER_MAILBOX_ID,
        engagementId: null,
      },
    });
    const ctx: ToolContext = {
      db,
      mailboxId: MAILBOX_ID,
      threadId: THREAD_ID,
      cosRunId: COS_RUN_ID,
    };
    const out = await proposeScheduleTool.handle(VALID_INPUT, ctx);
    expect(out).toEqual({ error: "thread_belongs_to_other_mailbox" });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("inserts a pending row and returns the id on the ok path", async () => {
    const db = makeMockDb({
      thread: {
        id: THREAD_ID,
        mailboxId: MAILBOX_ID,
        engagementId: "eng-1",
      },
      insertReturning: { id: "prop-123" },
    });
    const ctx: ToolContext = {
      db,
      mailboxId: MAILBOX_ID,
      threadId: THREAD_ID,
      cosRunId: COS_RUN_ID,
    };
    const out = await proposeScheduleTool.handle(VALID_INPUT, ctx);

    expect(out).toEqual({
      scheduling_proposal_id: "prop-123",
      status: "pending",
      proposed_slots: VALID_INPUT.proposed_slots,
      message: "Wrote scheduling proposal; awaiting human approval.",
    });

    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db._insertValuesSpy).toHaveBeenCalledTimes(1);
    const values = db._insertValuesSpy.mock.calls[0][0];
    expect(values).toMatchObject({
      threadId: THREAD_ID,
      mailboxId: MAILBOX_ID,
      engagementId: "eng-1",
      cosRunId: COS_RUN_ID,
      kind: "new_meeting",
      durationMinutes: 30,
      meetingTitle: "Intro call",
      attendees: ["alice@strvx.com"],
      location: "Google Meet",
      status: "pending",
    });
  });

  it("forwards optional meeting_description to the row", async () => {
    const db = makeMockDb({
      thread: { id: THREAD_ID, mailboxId: MAILBOX_ID, engagementId: null },
    });
    const ctx: ToolContext = {
      db,
      mailboxId: MAILBOX_ID,
      threadId: THREAD_ID,
      cosRunId: COS_RUN_ID,
    };
    await proposeScheduleTool.handle(
      { ...VALID_INPUT, meeting_description: "Quarterly review" },
      ctx
    );
    const values = db._insertValuesSpy.mock.calls[0][0];
    expect(values.meetingDescription).toBe("Quarterly review");
  });
});
