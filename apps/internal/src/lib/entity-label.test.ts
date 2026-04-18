import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./queries", () => ({
  getEngagement: vi.fn(),
  getProject: vi.fn(),
  getContact: vi.fn(),
}));

import { resolveEntityLabel } from "./entity-label";
import * as queries from "./queries";

describe("resolveEntityLabel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns company name for an engagement", async () => {
    (queries.getEngagement as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "abc",
      companyName: "Acme Corp",
      name: "Discovery",
    });
    const label = await resolveEntityLabel("engagement", "abc");
    expect(label).toBe("Acme Corp");
  });

  it("returns null when entity is missing", async () => {
    (queries.getEngagement as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined,
    );
    const label = await resolveEntityLabel("engagement", "missing");
    expect(label).toBeNull();
  });

  it("returns project name for a project", async () => {
    (queries.getProject as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "p1",
      name: "Website redesign",
    });
    const label = await resolveEntityLabel("project", "p1");
    expect(label).toBe("Website redesign");
  });

  it("returns contact name for a contact", async () => {
    (queries.getContact as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "c1",
      name: "Jane Doe",
    });
    const label = await resolveEntityLabel("contact", "c1");
    expect(label).toBe("Jane Doe");
  });
});
