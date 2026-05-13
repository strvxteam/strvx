import { describe, it, expect, vi, beforeEach } from "vitest";

const { updateSpy, setSpy, whereSpy, userLimitSpy, userEmail, userRow } =
  vi.hoisted(() => ({
    updateSpy: vi.fn(),
    setSpy: vi.fn(),
    whereSpy: vi.fn(),
    userLimitSpy: vi.fn(),
    userEmail: { value: "ops@strvx.com" as string | null },
    userRow: { value: { id: "user-row-1" } as { id: string } | null },
  }));

vi.mock("@strvx/db", async () => {
  const actual = await vi.importActual<typeof import("@strvx/db")>("@strvx/db");
  return {
    ...actual,
    db: {
      update: vi.fn().mockImplementation((table: unknown) => {
        updateSpy(table);
        return {
          set: vi.fn().mockImplementation((vals: unknown) => {
            setSpy(vals);
            return { where: whereSpy.mockResolvedValue({ rowCount: 1 }) };
          }),
        };
      }),
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: userLimitSpy.mockImplementation(async () =>
              userRow.value ? [userRow.value] : []
            ),
          }),
        }),
      })),
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
          ? { user: { id: "supabase-u-1", email: userEmail.value } }
          : { user: null },
      })),
    },
  }),
}));

import { dismissFlag, resolveFlag, dismissWatcher } from "./_actions";

const FLAG_ID = "11111111-2222-4222-8444-555555555555";
const WATCHER_ID = "22222222-3333-4333-8555-666666666666";

beforeEach(() => {
  updateSpy.mockClear();
  setSpy.mockClear();
  whereSpy.mockClear();
  userLimitSpy.mockClear();
  userEmail.value = "ops@strvx.com";
  userRow.value = { id: "user-row-1" };
});

describe("dismissFlag", () => {
  it("rejects unauthenticated callers", async () => {
    userEmail.value = null;
    const r = await dismissFlag(FLAG_ID);
    expect(r).toEqual({ ok: false, error: "Unauthorized" });
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("rejects non-@strvx.com emails", async () => {
    userEmail.value = "outsider@gmail.com";
    const r = await dismissFlag(FLAG_ID);
    expect(r.ok).toBe(false);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("rejects when the user row isn't provisioned", async () => {
    userRow.value = null;
    const r = await dismissFlag(FLAG_ID);
    expect(r).toEqual({ ok: false, error: "User not provisioned" });
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("rejects malformed flag ids", async () => {
    const r = await dismissFlag("not-a-uuid");
    expect(r).toEqual({ ok: false, error: "Invalid flag id" });
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("happy path: sets status=dismissed + dismissedBy + dismissedAt", async () => {
    const r = await dismissFlag(FLAG_ID);
    expect(r).toEqual({ ok: true });
    expect(setSpy).toHaveBeenCalledOnce();
    const arg = setSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.status).toBe("dismissed");
    expect(arg.dismissedBy).toBe("user-row-1");
    expect(arg.dismissedAt).toBeInstanceOf(Date);
  });
});

describe("resolveFlag", () => {
  it("rejects unauthenticated callers", async () => {
    userEmail.value = null;
    const r = await resolveFlag(FLAG_ID);
    expect(r).toEqual({ ok: false, error: "Unauthorized" });
  });

  it("rejects malformed flag ids", async () => {
    const r = await resolveFlag("nope");
    expect(r).toEqual({ ok: false, error: "Invalid flag id" });
  });

  it("happy path: sets status=resolved + resolvedAt", async () => {
    const r = await resolveFlag(FLAG_ID);
    expect(r).toEqual({ ok: true });
    expect(setSpy).toHaveBeenCalledOnce();
    const arg = setSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.status).toBe("resolved");
    expect(arg.resolvedAt).toBeInstanceOf(Date);
  });
});

describe("dismissWatcher", () => {
  it("rejects unauthenticated callers", async () => {
    userEmail.value = null;
    const r = await dismissWatcher(WATCHER_ID);
    expect(r).toEqual({ ok: false, error: "Unauthorized" });
  });

  it("rejects malformed ids", async () => {
    const r = await dismissWatcher("nope");
    expect(r).toEqual({ ok: false, error: "Invalid watcher id" });
  });

  it("happy path: sets status=cancelled", async () => {
    const r = await dismissWatcher(WATCHER_ID);
    expect(r).toEqual({ ok: true });
    expect(setSpy).toHaveBeenCalledOnce();
    const arg = setSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.status).toBe("cancelled");
  });
});
