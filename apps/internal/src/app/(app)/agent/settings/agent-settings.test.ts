import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks for module-level deps (server action imports them at load time).
const { dbInsertSpy, dbValuesSpy, onConflictSpy, userEmail } = vi.hoisted(
  () => ({
    dbInsertSpy: vi.fn(),
    dbValuesSpy: vi.fn(),
    onConflictSpy: vi.fn().mockResolvedValue(undefined),
    userEmail: { value: "ops@strvx.com" as string | null },
  })
);

vi.mock("@strvx/db", async () => {
  const actual = await vi.importActual<typeof import("@strvx/db")>("@strvx/db");
  return {
    ...actual,
    db: {
      insert: dbInsertSpy,
    },
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockImplementation(async () => ({
        data: userEmail.value
          ? { user: { id: "u-1", email: userEmail.value } }
          : { user: null },
      })),
    },
  }),
}));

import { saveAgentSettings } from "./_actions";

beforeEach(() => {
  // Reset call history, but DON'T wipe implementations — vi.clearAllMocks
  // would zero out the return values configured above.
  dbInsertSpy.mockClear();
  dbValuesSpy.mockClear();
  onConflictSpy.mockClear();
  dbInsertSpy.mockReturnValue({
    values: dbValuesSpy.mockReturnValue({
      onConflictDoUpdate: onConflictSpy.mockResolvedValue(undefined),
    }),
  });
});

const VALID_INPUT = {
  mailboxId: "550e8400-e29b-41d4-a716-446655440000",
  workingStartHour: 9,
  workingEndHour: 17,
  workingDays: [1, 2, 3, 4, 5],
  bufferMinutes: 15,
  maxBackToBack: 3,
  timezone: "America/Los_Angeles",
};

describe("saveAgentSettings", () => {
  it("upserts a settings row on the happy path", async () => {
    userEmail.value = "ops@strvx.com";
    const res = await saveAgentSettings(VALID_INPUT);
    expect(res).toEqual({ ok: true });
    expect(dbInsertSpy).toHaveBeenCalledTimes(1);
    const inserted = dbValuesSpy.mock.calls[0][0];
    expect(inserted).toMatchObject({
      mailboxId: VALID_INPUT.mailboxId,
      workingStartHour: 9,
      workingEndHour: 17,
      workingDays: [1, 2, 3, 4, 5],
      bufferMinutes: 15,
      maxBackToBack: 3,
      timezone: "America/Los_Angeles",
    });
    expect(onConflictSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects unauthorized users", async () => {
    userEmail.value = null;
    const res = await saveAgentSettings(VALID_INPUT);
    expect(res).toEqual({ ok: false, error: "Unauthorized" });
    expect(dbInsertSpy).not.toHaveBeenCalled();
  });

  it("rejects users without an @strvx.com email", async () => {
    userEmail.value = "outsider@gmail.com";
    const res = await saveAgentSettings(VALID_INPUT);
    expect(res.ok).toBe(false);
    expect(dbInsertSpy).not.toHaveBeenCalled();
  });

  it("rejects bad hours via Zod", async () => {
    userEmail.value = "ops@strvx.com";
    const bad = { ...VALID_INPUT, workingStartHour: 25 };
    const res = await saveAgentSettings(bad);
    expect(res.ok).toBe(false);
    expect(dbInsertSpy).not.toHaveBeenCalled();
  });

  it("rejects when endHour <= startHour", async () => {
    userEmail.value = "ops@strvx.com";
    const res = await saveAgentSettings({
      ...VALID_INPUT,
      workingStartHour: 17,
      workingEndHour: 17,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/workingEndHour/);
  });

  it("rejects when workingDays is empty", async () => {
    userEmail.value = "ops@strvx.com";
    const res = await saveAgentSettings({
      ...VALID_INPUT,
      workingDays: [],
    });
    expect(res.ok).toBe(false);
    expect(dbInsertSpy).not.toHaveBeenCalled();
  });

  it("deduplicates + sorts working days before upsert", async () => {
    userEmail.value = "ops@strvx.com";
    await saveAgentSettings({
      ...VALID_INPUT,
      workingDays: [3, 1, 5, 1, 3],
    });
    const inserted = dbValuesSpy.mock.calls[0][0];
    expect(inserted.workingDays).toEqual([1, 3, 5]);
  });
});
