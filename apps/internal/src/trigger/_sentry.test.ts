import { describe, it, expect, vi, beforeEach } from "vitest";

// Track what reportTaskError tells Sentry to do. Hoisted via vi.hoisted
// so the vi.mock factory below can reference them safely (vi.mock is
// hoisted to top-of-file by vitest).
const { scopeCalls, captureException, addBreadcrumb, withScope } = vi.hoisted(
  () => {
    const scope = {
      setTag: vi.fn(),
      setLevel: vi.fn(),
      setExtras: vi.fn(),
    };
    return {
      scopeCalls: scope,
      captureException: vi.fn(),
      addBreadcrumb: vi.fn(),
      withScope: vi.fn((cb: (s: typeof scope) => void) => cb(scope)),
    };
  }
);

vi.mock("@sentry/nextjs", () => ({
  captureException,
  addBreadcrumb,
  withScope,
}));

import { reportTaskError, recordCosRunFailedBreadcrumb } from "./_sentry";

describe("reportTaskError", () => {
  beforeEach(() => {
    scopeCalls.setTag.mockClear();
    scopeCalls.setLevel.mockClear();
    scopeCalls.setExtras.mockClear();
    captureException.mockClear();
    addBreadcrumb.mockClear();
    withScope.mockClear();
    withScope.mockImplementation((cb) => cb(scopeCalls));
  });

  it("attaches taskId, mailboxId, threadId, cosRunId tags", () => {
    const err = new Error("boom");
    reportTaskError("agent.classify.message", err, {
      mailboxId: "mb-1",
      threadId: "thr-2",
      cosRunId: "run-3",
      extras: { messageId: "msg-4" },
    });

    expect(withScope).toHaveBeenCalledTimes(1);
    expect(scopeCalls.setTag).toHaveBeenCalledWith(
      "trigger.task_id",
      "agent.classify.message"
    );
    expect(scopeCalls.setTag).toHaveBeenCalledWith(
      "agent.mailbox_id",
      "mb-1"
    );
    expect(scopeCalls.setTag).toHaveBeenCalledWith("agent.thread_id", "thr-2");
    expect(scopeCalls.setTag).toHaveBeenCalledWith("agent.cos_run_id", "run-3");
    expect(scopeCalls.setExtras).toHaveBeenCalledWith({ messageId: "msg-4" });
    expect(scopeCalls.setLevel).toHaveBeenCalledWith("error");
    expect(captureException).toHaveBeenCalledWith(err);
  });

  it("only sets the taskId tag when no optional meta is provided", () => {
    reportTaskError("gmail.send", new Error("x"));
    expect(scopeCalls.setTag).toHaveBeenCalledTimes(1);
    expect(scopeCalls.setTag).toHaveBeenCalledWith(
      "trigger.task_id",
      "gmail.send"
    );
    expect(scopeCalls.setExtras).not.toHaveBeenCalled();
  });

  it("swallows errors from Sentry itself so tasks keep their own control flow", () => {
    withScope.mockImplementationOnce(() => {
      throw new Error("sentry exploded");
    });
    expect(() =>
      reportTaskError("any.task", new Error("x"))
    ).not.toThrow();
  });
});

describe("recordCosRunFailedBreadcrumb", () => {
  beforeEach(() => {
    addBreadcrumb.mockClear();
  });

  it("emits a Sentry breadcrumb keyed to the cos run", () => {
    recordCosRunFailedBreadcrumb({
      taskId: "agent.plan.thread",
      cosRunId: "run-1",
      mailboxId: "mb-1",
      threadId: "thr-1",
      reason: "tool_loop_exhausted",
    });
    expect(addBreadcrumb).toHaveBeenCalledTimes(1);
    const arg = addBreadcrumb.mock.calls[0][0];
    expect(arg.category).toBe("cos.run");
    expect(arg.level).toBe("warning");
    expect(arg.message).toContain("agent.plan.thread");
    expect(arg.data).toMatchObject({
      cosRunId: "run-1",
      mailboxId: "mb-1",
      threadId: "thr-1",
      reason: "tool_loop_exhausted",
    });
  });
});
