import { describe, it, expect } from "vitest";
import { selectEventsNeedingBrief, type PrepEvent } from "./select-events";

const DOMAIN = "strvx.com";

function ev(overrides: Partial<PrepEvent> & { id: string }): PrepEvent {
  return {
    id: overrides.id,
    summary: overrides.summary ?? `Meeting ${overrides.id}`,
    start: overrides.start ?? { dateTime: "2026-05-12T17:00:00Z" },
    end: overrides.end ?? { dateTime: "2026-05-12T17:30:00Z" },
    attendees: overrides.attendees ?? [
      { email: "alice@strvx.com" },
      { email: "client@acme.com" },
    ],
    status: overrides.status ?? "confirmed",
    description: overrides.description,
  };
}

describe("selectEventsNeedingBrief", () => {
  it("filters out events with no external attendees", () => {
    const events: PrepEvent[] = [
      ev({
        id: "internal-only",
        attendees: [
          { email: "alice@strvx.com" },
          { email: "bob@strvx.com" },
        ],
      }),
      ev({ id: "external-1" }),
    ];

    const out = selectEventsNeedingBrief({
      events,
      existingBriefIds: new Set(),
      ourDomain: DOMAIN,
    });

    expect(out.map((e) => e.id)).toEqual(["external-1"]);
  });

  it("filters out events that already have a brief", () => {
    const events: PrepEvent[] = [
      ev({ id: "a" }),
      ev({ id: "b" }),
      ev({ id: "c" }),
    ];

    const out = selectEventsNeedingBrief({
      events,
      existingBriefIds: new Set(["b"]),
      ourDomain: DOMAIN,
    });

    expect(out.map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("includes events with mixed internal/external attendees", () => {
    const events: PrepEvent[] = [
      ev({
        id: "mixed",
        attendees: [
          { email: "alice@strvx.com" },
          { email: "bob@strvx.com" },
          { email: "vip@bigco.com" },
        ],
      }),
    ];

    const out = selectEventsNeedingBrief({
      events,
      existingBriefIds: new Set(),
      ourDomain: DOMAIN,
    });

    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("mixed");
  });

  it("sorts results by start time ascending", () => {
    const events: PrepEvent[] = [
      ev({ id: "late", start: { dateTime: "2026-05-12T19:00:00Z" } }),
      ev({ id: "early", start: { dateTime: "2026-05-12T15:00:00Z" } }),
      ev({ id: "middle", start: { dateTime: "2026-05-12T17:00:00Z" } }),
    ];

    const out = selectEventsNeedingBrief({
      events,
      existingBriefIds: new Set(),
      ourDomain: DOMAIN,
    });

    expect(out.map((e) => e.id)).toEqual(["early", "middle", "late"]);
  });

  it("filters out cancelled events", () => {
    const events: PrepEvent[] = [
      ev({ id: "live" }),
      ev({ id: "dead", status: "cancelled" }),
    ];

    const out = selectEventsNeedingBrief({
      events,
      existingBriefIds: new Set(),
      ourDomain: DOMAIN,
    });

    expect(out.map((e) => e.id)).toEqual(["live"]);
  });

  it("filters out events with missing id", () => {
    const events: PrepEvent[] = [
      ev({ id: "" }),
      ev({ id: "valid" }),
    ];

    const out = selectEventsNeedingBrief({
      events,
      existingBriefIds: new Set(),
      ourDomain: DOMAIN,
    });

    expect(out.map((e) => e.id)).toEqual(["valid"]);
  });

  it("treats domain comparison case-insensitively", () => {
    const events: PrepEvent[] = [
      ev({
        id: "case-internal",
        attendees: [
          { email: "Alice@Strvx.COM" },
          { email: "Bob@STRVX.com" },
        ],
      }),
      ev({
        id: "case-external",
        attendees: [
          { email: "Alice@strvx.com" },
          { email: "Client@Acme.COM" },
        ],
      }),
    ];

    const out = selectEventsNeedingBrief({
      events,
      existingBriefIds: new Set(),
      ourDomain: DOMAIN,
    });

    expect(out.map((e) => e.id)).toEqual(["case-external"]);
  });
});
