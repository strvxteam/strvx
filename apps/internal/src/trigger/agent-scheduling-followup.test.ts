import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  db as DbType,
  emailDrafts,
  emailThreads,
  engagements,
  mailboxOauthTokens,
} from "@strvx/db";
import { runAgentSchedulingFollowup } from "./agent-scheduling-followup";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_PAYLOAD = {
  engagementId: "eng-1",
  contactEmail: "client@acme.com",
  startTime: "2026-05-12T18:00:00Z",
  endTime: "2026-05-12T18:30:00Z",
  meetLink: "https://meet.google.com/abc-defg-hij",
  bookingId: "bk-1",
};

type DbState = {
  priorDraft: { id: string; threadId: string } | null;
  engagementExists: boolean;
  existingThread: { id: string; mailboxId: string } | null;
  primaryMailbox: { id: string; email: string } | null;
  insertedThreadId?: string;
  insertedDraftId?: string;
};

function makeMockDb(state: DbState) {
  const select = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockImplementation((table: unknown) => ({
      where: vi.fn().mockImplementation(() => ({
        limit: vi.fn().mockImplementation(async () => {
          if (table === emailDrafts) {
            return state.priorDraft ? [state.priorDraft] : [];
          }
          if (table === engagements) {
            return state.engagementExists ? [{ id: "eng-1" }] : [];
          }
          if (table === emailThreads) {
            return state.existingThread ? [state.existingThread] : [];
          }
          if (table === mailboxOauthTokens) {
            return state.primaryMailbox ? [state.primaryMailbox] : [];
          }
          return [];
        }),
      })),
    })),
  }));

  let txInsertCount = 0;
  const txInsertValues = vi.fn().mockImplementation(() => ({
    returning: vi.fn().mockImplementation(async () => {
      const i = txInsertCount++;
      if (i === 0) return [{ id: state.insertedThreadId ?? "thr-new" }];
      return [{ id: state.insertedDraftId ?? "drf-new" }];
    }),
  }));
  const txInsert = vi.fn().mockReturnValue({ values: txInsertValues });
  const transaction = vi
    .fn()
    .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ insert: txInsert })
    );

  return {
    select,
    transaction,
    _txInsert: txInsert,
    _txInsertValues: txInsertValues,
  } as unknown as typeof DbType & {
    _txInsert: ReturnType<typeof vi.fn>;
    _txInsertValues: ReturnType<typeof vi.fn>;
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runAgentSchedulingFollowup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("triggers the planner when an existing thread is found", async () => {
    const db = makeMockDb({
      priorDraft: null,
      engagementExists: true,
      existingThread: { id: "thr-existing", mailboxId: "mb-1" },
      primaryMailbox: { id: "mb-1", email: "team@strvx.com" },
    });
    const planThread = vi.fn().mockResolvedValue({ cosRunId: "run-1" });

    const out = await runAgentSchedulingFollowup({
      payload: BASE_PAYLOAD,
      db,
      planThread,
    });

    expect(out).toEqual({
      status: "planner_triggered",
      threadId: "thr-existing",
    });
    expect(planThread).toHaveBeenCalledTimes(1);
    expect(planThread).toHaveBeenCalledWith({ threadId: "thr-existing" });
    expect(db._txInsert).not.toHaveBeenCalled();
  });

  it("writes a thread + draft when no existing thread is found", async () => {
    const db = makeMockDb({
      priorDraft: null,
      engagementExists: true,
      existingThread: null,
      primaryMailbox: { id: "mb-1", email: "team@strvx.com" },
      insertedThreadId: "thr-syn",
      insertedDraftId: "drf-1",
    });
    const planThread = vi.fn();

    const out = await runAgentSchedulingFollowup({
      payload: BASE_PAYLOAD,
      db,
      planThread,
    });

    expect(out).toEqual({
      status: "draft_created",
      draftId: "drf-1",
      threadId: "thr-syn",
    });
    expect(planThread).not.toHaveBeenCalled();
    expect(db._txInsert).toHaveBeenCalledTimes(2);

    const threadValues = db._txInsertValues.mock.calls[0][0];
    expect(threadValues.engagementId).toBe("eng-1");
    // After migration 015 we no longer manufacture a synthetic id; the
    // gmail_thread_id is left NULL and backfilled when the first
    // message in the thread is actually sent.
    expect(threadValues.gmailThreadId).toBeNull();

    const draftValues = db._txInsertValues.mock.calls[1][0];
    expect(draftValues.threadId).toBe("thr-syn");
    expect(draftValues.toEmails).toEqual(["client@acme.com"]);
    expect(draftValues.status).toBe("pending_review");
    expect(draftValues.metadata).toEqual({ bookingId: "bk-1" });
    expect(draftValues.subject).toContain("Confirmed");
    expect(draftValues.bodyText).toContain(BASE_PAYLOAD.meetLink as string);
  });

  it("is idempotent: returns skipped when a draft for the bookingId already exists", async () => {
    const db = makeMockDb({
      priorDraft: { id: "drf-prior", threadId: "thr-prior" },
      engagementExists: true,
      existingThread: null,
      primaryMailbox: { id: "mb-1", email: "team@strvx.com" },
    });
    const planThread = vi.fn();

    const out = await runAgentSchedulingFollowup({
      payload: BASE_PAYLOAD,
      db,
      planThread,
    });

    expect(out.status).toBe("skipped_already_processed");
    expect(planThread).not.toHaveBeenCalled();
    expect(db._txInsert).not.toHaveBeenCalled();
  });

  it("throws when no active mailbox is available and no thread exists", async () => {
    const db = makeMockDb({
      priorDraft: null,
      engagementExists: true,
      existingThread: null,
      primaryMailbox: null,
    });
    const planThread = vi.fn();

    await expect(
      runAgentSchedulingFollowup({
        payload: BASE_PAYLOAD,
        db,
        planThread,
      })
    ).rejects.toThrow(/no active mailbox/);
  });

  it("uses jsonb metadata.bookingId for idempotency, not reviewer_notes", async () => {
    const db = makeMockDb({
      priorDraft: null,
      engagementExists: true,
      existingThread: null,
      primaryMailbox: { id: "mb-1", email: "team@strvx.com" },
      insertedThreadId: "thr-x",
      insertedDraftId: "drf-x",
    });
    await runAgentSchedulingFollowup({
      payload: BASE_PAYLOAD,
      db,
      planThread: vi.fn(),
    });
    const draftValues = db._txInsertValues.mock.calls[1][0];
    // reviewer_notes is no longer the carrier for bookingId
    expect(draftValues.reviewerNotes ?? "").not.toContain("bk-1");
    expect(draftValues.metadata).toEqual({ bookingId: "bk-1" });
  });

  it("sets a fresh lastMessageAt (not the booking startTime)", async () => {
    const before = Date.now();
    const db = makeMockDb({
      priorDraft: null,
      engagementExists: true,
      existingThread: null,
      primaryMailbox: { id: "mb-1", email: "team@strvx.com" },
      insertedThreadId: "thr-fresh",
      insertedDraftId: "drf-fresh",
    });
    await runAgentSchedulingFollowup({
      payload: BASE_PAYLOAD,
      db,
      planThread: vi.fn(),
    });
    const after = Date.now();
    const threadValues = db._txInsertValues.mock.calls[0][0];
    const lastMessageAt = threadValues.lastMessageAt as Date;
    expect(lastMessageAt).toBeInstanceOf(Date);
    expect(lastMessageAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(lastMessageAt.getTime()).toBeLessThanOrEqual(after);
  });

  it("throws when the engagement does not exist", async () => {
    const db = makeMockDb({
      priorDraft: null,
      engagementExists: false,
      existingThread: null,
      primaryMailbox: null,
    });
    const planThread = vi.fn();

    await expect(
      runAgentSchedulingFollowup({
        payload: BASE_PAYLOAD,
        db,
        planThread,
      })
    ).rejects.toThrow(/engagement .* not found/);
  });
});
