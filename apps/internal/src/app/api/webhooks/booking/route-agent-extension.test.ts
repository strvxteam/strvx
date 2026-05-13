import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// vi.mock factories are hoisted above all imports, so any references they
// close over must come from vi.hoisted() rather than module-scope `const`s.
const { triggerMock, scheduleWatcherMock } = vi.hoisted(() => ({
  triggerMock: vi.fn(),
  scheduleWatcherMock: vi.fn(),
}));

vi.mock("@/trigger/agent-scheduling-followup", () => ({
  agentSchedulingFollowup: {
    trigger: triggerMock,
  },
}));

vi.mock("@/lib/agent/follow-up/schedule-post-meeting", () => ({
  schedulePostMeetingWatcher: scheduleWatcherMock,
}));

vi.mock("@/lib/db", () => {
  // Two select() call sites in the route:
  //   1) idempotency: select().from(interactions).where(...).limit(1) -> []
  //   2) system user: select().from(users).limit(1) -> [{id:"user-1"}]
  // Both shapes are wired in the same chain object below.
  const dbSelect = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        // idempotency: chained with .where()
        limit: vi.fn().mockResolvedValue([]),
      }),
      // system-user: no .where(), directly .limit()
      limit: vi.fn().mockResolvedValue([{ id: "user-1" }]),
    }),
  }));
  const dbTransaction = vi
    .fn()
    .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const insertReturning = vi
        .fn()
        .mockResolvedValue([{ id: "eng-created" }]);
      const insertValues = vi.fn().mockReturnValue({
        returning: insertReturning,
      });
      const tx = {
        insert: vi.fn().mockReturnValue({ values: insertValues }),
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        })),
      };
      return fn(tx);
    });
  return {
    db: { select: dbSelect, transaction: dbTransaction },
  };
});

// Now import the route handler.
import { POST } from "./route";

// Provide a minimal NextRequest stub. We only use json() and headers.
function makeReq(payload: unknown, secret = "test-secret-12345"): Request {
  return new Request("https://example.com/api/webhooks/booking", {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

const VALID_PAYLOAD = {
  clientName: "Sarah Lee",
  clientEmail: "sarah@acme.com",
  clientPhone: null,
  clientCompany: "Acme",
  clientNotes: null,
  startTime: "2026-05-12T18:00:00Z",
  endTime: "2026-05-12T18:30:00Z",
  duration: 30,
  meetLink: "https://meet.google.com/abc-defg-hij",
  bookingId: "bk-extension-1",
};

describe("booking webhook — agent extension", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BOOKING_WEBHOOK_SECRET = "test-secret-12345";
  });

  afterEach(() => {
    delete process.env.AGENT_INGEST_ENABLED;
  });

  it("does NOT enqueue agent tasks when AGENT_INGEST_ENABLED is unset", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resp = await POST(makeReq(VALID_PAYLOAD) as any);
    expect(resp.status).toBe(200);

    expect(triggerMock).not.toHaveBeenCalled();
    expect(scheduleWatcherMock).not.toHaveBeenCalled();
  });

  it("enqueues agent.scheduling.followup + arms post-meeting watcher when AGENT_INGEST_ENABLED=true", async () => {
    process.env.AGENT_INGEST_ENABLED = "true";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resp = await POST(makeReq(VALID_PAYLOAD) as any);
    expect(resp.status).toBe(200);

    expect(triggerMock).toHaveBeenCalledTimes(1);
    const triggerArg = triggerMock.mock.calls[0][0];
    expect(triggerArg.engagementId).toBe("eng-created");
    expect(triggerArg.contactEmail).toBe("sarah@acme.com");
    expect(triggerArg.bookingId).toBe("bk-extension-1");

    const triggerOpts = triggerMock.mock.calls[0][1];
    expect(triggerOpts).toEqual({
      idempotencyKey: "booking-bk-extension-1",
    });

    expect(scheduleWatcherMock).toHaveBeenCalledTimes(1);
    const watcherArg = scheduleWatcherMock.mock.calls[0][0];
    expect(watcherArg.calendarEventId).toBe("booking:bk-extension-1");
    expect(watcherArg.engagementId).toBe("eng-created");
    expect(watcherArg.eventEndAt).toBe("2026-05-12T18:30:00Z");
  });

  it("agent extension failure does not fail the webhook", async () => {
    process.env.AGENT_INGEST_ENABLED = "true";
    triggerMock.mockRejectedValueOnce(new Error("trigger.dev down"));
    scheduleWatcherMock.mockRejectedValueOnce(new Error("db blip"));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resp = await POST(makeReq(VALID_PAYLOAD) as any);
    expect(resp.status).toBe(200);
  });
});
