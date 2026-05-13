import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// db module mock — must be declared before importing the SUT.
// ---------------------------------------------------------------------------

type SelectStep = { rows: unknown[] };

const dbState: {
  selects: SelectStep[];
  selectIdx: number;
  updateCalls: Array<{ set: Record<string, unknown> }>;
} = {
  selects: [],
  selectIdx: 0,
  updateCalls: [],
};

function resetDbState(selects: SelectStep[]) {
  dbState.selects = selects;
  dbState.selectIdx = 0;
  dbState.updateCalls = [];
}

vi.mock("@strvx/db", () => {
  const select = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockImplementation(() => {
          const step = dbState.selects[dbState.selectIdx++];
          return Promise.resolve(step ? step.rows : []);
        }),
      }),
    }),
  }));

  const update = vi.fn().mockImplementation(() => ({
    set: vi.fn().mockImplementation((setArg: Record<string, unknown>) => {
      dbState.updateCalls.push({ set: setArg });
      return { where: vi.fn().mockResolvedValue({ rowCount: 1 }) };
    }),
  }));

  return {
    db: { select, update },
    // Symbol placeholders so `import { emailThreads }` resolves.
    emailThreads: {},
  };
});

import {
  addLabelImpl,
  archiveThreadImpl,
  normalizeLabel,
  removeLabelImpl,
  snoozeThreadImpl,
} from "./_triage-impl";

const USER_ID = "user-uuid-1";
const THREAD_ID = "thread-uuid-1";

// ---------------------------------------------------------------------------
// archiveThreadImpl
// ---------------------------------------------------------------------------

describe("archiveThreadImpl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws Unauthorized when getCallerUserId returns null", async () => {
    resetDbState([]);
    await expect(
      archiveThreadImpl(THREAD_ID, {
        getCallerUserId: async () => null,
      })
    ).rejects.toThrow(/Unauthorized/);
  });

  it("throws when threadId is missing", async () => {
    resetDbState([]);
    await expect(
      archiveThreadImpl("", {
        getCallerUserId: async () => USER_ID,
      })
    ).rejects.toThrow(/threadId required/);
  });

  it("throws when thread is not found", async () => {
    resetDbState([{ rows: [] }]);
    await expect(
      archiveThreadImpl(THREAD_ID, {
        getCallerUserId: async () => USER_ID,
      })
    ).rejects.toThrow(/Thread not found/);
  });

  it("sets archivedAt + updatedAt and returns ok", async () => {
    resetDbState([{ rows: [{ id: THREAD_ID }] }]);
    const out = await archiveThreadImpl(THREAD_ID, {
      getCallerUserId: async () => USER_ID,
    });
    expect(out).toEqual({ ok: true });
    expect(dbState.updateCalls.length).toBe(1);
    const set = dbState.updateCalls[0].set;
    expect(set.archivedAt).toBeInstanceOf(Date);
    expect(set.updatedAt).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// snoozeThreadImpl
// ---------------------------------------------------------------------------

describe("snoozeThreadImpl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function future(ms: number): string {
    return new Date(Date.now() + ms).toISOString();
  }

  it("throws Unauthorized when getCallerUserId returns null", async () => {
    resetDbState([]);
    await expect(
      snoozeThreadImpl(THREAD_ID, future(60_000), {
        getCallerUserId: async () => null,
      })
    ).rejects.toThrow(/Unauthorized/);
  });

  it("rejects invalid date strings", async () => {
    resetDbState([]);
    await expect(
      snoozeThreadImpl(THREAD_ID, "not-a-date", {
        getCallerUserId: async () => USER_ID,
      })
    ).rejects.toThrow(/Invalid until date/);
  });

  it("rejects past dates", async () => {
    resetDbState([]);
    await expect(
      snoozeThreadImpl(THREAD_ID, new Date(Date.now() - 60_000).toISOString(), {
        getCallerUserId: async () => USER_ID,
      })
    ).rejects.toThrow(/must be in the future/);
  });

  it("rejects dates more than 90 days in the future", async () => {
    resetDbState([]);
    const tooFar = new Date(
      Date.now() + 91 * 24 * 60 * 60 * 1000
    ).toISOString();
    await expect(
      snoozeThreadImpl(THREAD_ID, tooFar, {
        getCallerUserId: async () => USER_ID,
      })
    ).rejects.toThrow(/within 90 days/);
  });

  it("accepts a custom date exactly within the 90-day horizon", async () => {
    // 80 days out — well within the cap.
    resetDbState([{ rows: [{ id: THREAD_ID }] }]);
    const within = new Date(
      Date.now() + 80 * 24 * 60 * 60 * 1000
    ).toISOString();
    const out = await snoozeThreadImpl(THREAD_ID, within, {
      getCallerUserId: async () => USER_ID,
    });
    expect(out).toEqual({ ok: true });
  });

  it("throws when thread is not found", async () => {
    resetDbState([{ rows: [] }]);
    await expect(
      snoozeThreadImpl(THREAD_ID, future(60_000), {
        getCallerUserId: async () => USER_ID,
      })
    ).rejects.toThrow(/Thread not found/);
  });

  it("sets snoozedUntil + agentState='snoozed' and returns ok", async () => {
    resetDbState([{ rows: [{ id: THREAD_ID }] }]);
    const untilISO = future(3_600_000);
    const out = await snoozeThreadImpl(THREAD_ID, untilISO, {
      getCallerUserId: async () => USER_ID,
    });
    expect(out).toEqual({ ok: true });
    expect(dbState.updateCalls.length).toBe(1);
    const set = dbState.updateCalls[0].set;
    expect(set.snoozedUntil).toBeInstanceOf(Date);
    expect((set.snoozedUntil as Date).toISOString()).toBe(untilISO);
    expect(set.agentState).toBe("snoozed");
    expect(set.updatedAt).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// normalizeLabel
// ---------------------------------------------------------------------------

describe("normalizeLabel", () => {
  it("lowercases and trims", () => {
    expect(normalizeLabel("  Foo  ")).toBe("foo");
  });

  it("replaces spaces and underscores with dashes", () => {
    expect(normalizeLabel("hot lead")).toBe("hot-lead");
    expect(normalizeLabel("hot_lead")).toBe("hot-lead");
    expect(normalizeLabel("hot  lead")).toBe("hot-lead");
  });

  it("strips leading/trailing dashes", () => {
    expect(normalizeLabel("--foo--")).toBe("foo");
  });

  it("rejects empty strings", () => {
    expect(normalizeLabel("")).toBeNull();
    expect(normalizeLabel("   ")).toBeNull();
  });

  it("rejects strings longer than 40 chars", () => {
    expect(normalizeLabel("a".repeat(41))).toBeNull();
    expect(normalizeLabel("a".repeat(40))).toBe("a".repeat(40));
  });

  it("rejects unicode and special chars", () => {
    expect(normalizeLabel("café")).toBeNull();
    expect(normalizeLabel("foo!bar")).toBeNull();
    expect(normalizeLabel("foo/bar")).toBeNull();
  });

  it("accepts digits and dashes", () => {
    expect(normalizeLabel("client-2026")).toBe("client-2026");
  });
});

// ---------------------------------------------------------------------------
// addLabelImpl
// ---------------------------------------------------------------------------

describe("addLabelImpl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws Unauthorized when getCallerUserId returns null", async () => {
    resetDbState([]);
    await expect(
      addLabelImpl(THREAD_ID, "foo", {
        getCallerUserId: async () => null,
      })
    ).rejects.toThrow(/Unauthorized/);
  });

  it("throws when threadId is missing", async () => {
    resetDbState([]);
    await expect(
      addLabelImpl("", "foo", {
        getCallerUserId: async () => USER_ID,
      })
    ).rejects.toThrow(/threadId required/);
  });

  it("rejects invalid labels before hitting the DB", async () => {
    resetDbState([]);
    await expect(
      addLabelImpl(THREAD_ID, "", {
        getCallerUserId: async () => USER_ID,
      })
    ).rejects.toThrow(/Invalid label/);
    await expect(
      addLabelImpl(THREAD_ID, "café", {
        getCallerUserId: async () => USER_ID,
      })
    ).rejects.toThrow(/Invalid label/);
    expect(dbState.updateCalls.length).toBe(0);
  });

  it("throws when thread is not found", async () => {
    resetDbState([{ rows: [] }]);
    await expect(
      addLabelImpl(THREAD_ID, "foo", {
        getCallerUserId: async () => USER_ID,
      })
    ).rejects.toThrow(/Thread not found/);
  });

  it("updates labels with normalized value and returns ok", async () => {
    resetDbState([{ rows: [{ id: THREAD_ID }] }]);
    const out = await addLabelImpl(THREAD_ID, "Hot Lead", {
      getCallerUserId: async () => USER_ID,
    });
    expect(out).toEqual({ ok: true, label: "hot-lead" });
    expect(dbState.updateCalls.length).toBe(1);
    const set = dbState.updateCalls[0].set;
    expect(set.labels).toBeDefined();
    expect(set.updatedAt).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// removeLabelImpl
// ---------------------------------------------------------------------------

describe("removeLabelImpl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws Unauthorized when getCallerUserId returns null", async () => {
    resetDbState([]);
    await expect(
      removeLabelImpl(THREAD_ID, "foo", {
        getCallerUserId: async () => null,
      })
    ).rejects.toThrow(/Unauthorized/);
  });

  it("rejects invalid labels", async () => {
    resetDbState([]);
    await expect(
      removeLabelImpl(THREAD_ID, "!!", {
        getCallerUserId: async () => USER_ID,
      })
    ).rejects.toThrow(/Invalid label/);
  });

  it("throws when thread is not found", async () => {
    resetDbState([{ rows: [] }]);
    await expect(
      removeLabelImpl(THREAD_ID, "foo", {
        getCallerUserId: async () => USER_ID,
      })
    ).rejects.toThrow(/Thread not found/);
  });

  it("normalizes and removes the label, returning ok", async () => {
    resetDbState([{ rows: [{ id: THREAD_ID }] }]);
    const out = await removeLabelImpl(THREAD_ID, "Hot Lead", {
      getCallerUserId: async () => USER_ID,
    });
    expect(out).toEqual({ ok: true, label: "hot-lead" });
    expect(dbState.updateCalls.length).toBe(1);
    const set = dbState.updateCalls[0].set;
    expect(set.labels).toBeDefined();
    expect(set.updatedAt).toBeInstanceOf(Date);
  });
});
