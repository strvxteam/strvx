import { describe, it, expect, vi, beforeEach } from "vitest";

type MailboxRow = { id: string; email: string; isActive: boolean };

const state: { rows: MailboxRow[] } = { rows: [] };

vi.mock("@/lib/db", () => {
  const select = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockImplementation(async () => {
        return state.rows
          .filter((r) => !r.isActive)
          .map((r) => ({ id: r.id, email: r.email }));
      }),
    }),
  }));
  return { db: { select } };
});

import { fetchDisconnectedMailboxes } from "./_disconnect-check";

function setMailboxes(rows: MailboxRow[]) {
  state.rows = rows;
}

describe("fetchDisconnectedMailboxes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns [] when all mailboxes are active", async () => {
    setMailboxes([
      { id: "m1", email: "alice@strvx.com", isActive: true },
      { id: "m2", email: "bob@strvx.com", isActive: true },
    ]);
    const out = await fetchDisconnectedMailboxes();
    expect(out).toEqual([]);
  });

  it("returns the single inactive mailbox when one is disconnected", async () => {
    setMailboxes([
      { id: "m1", email: "alice@strvx.com", isActive: true },
      { id: "m2", email: "bob@strvx.com", isActive: false },
    ]);
    const out = await fetchDisconnectedMailboxes();
    expect(out).toEqual([{ id: "m2", email: "bob@strvx.com" }]);
  });

  it("returns all inactive mailboxes when multiple are disconnected", async () => {
    setMailboxes([
      { id: "m1", email: "alice@strvx.com", isActive: false },
      { id: "m2", email: "bob@strvx.com", isActive: false },
      { id: "m3", email: "carol@strvx.com", isActive: true },
    ]);
    const out = await fetchDisconnectedMailboxes();
    expect(out).toHaveLength(2);
    expect(out.map((m) => m.email).sort()).toEqual([
      "alice@strvx.com",
      "bob@strvx.com",
    ]);
  });

  it("returns [] when there are no mailboxes at all", async () => {
    setMailboxes([]);
    const out = await fetchDisconnectedMailboxes();
    expect(out).toEqual([]);
  });
});
