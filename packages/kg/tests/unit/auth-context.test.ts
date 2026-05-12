import { describe, expect, it } from "vitest";
import { callerFromHeaders } from "../../src/auth/context.js";

describe("callerFromHeaders", () => {
  it("builds AgentContext from headers and claims", () => {
    const headers = new Headers({ "x-kg-session-id": "sess:42" });
    const ctx = callerFromHeaders(headers, {
      agentId: "agent:cos",
      role: "reader",
    });
    expect(ctx.actorKind).toBe("agent");
    expect(ctx.actorId).toBe("agent:cos");
    expect(ctx.role).toBe("reader");
    expect(ctx.sessionId).toBe("sess:42");
  });

  it("sets sessionId to undefined when header is absent", () => {
    const headers = new Headers();
    const ctx = callerFromHeaders(headers, { agentId: "a1", role: "writer" });
    expect(ctx.sessionId).toBeUndefined();
  });

  it("includes scopeEntityTypes and scopeOperations when provided", () => {
    const headers = new Headers();
    const ctx = callerFromHeaders(headers, {
      agentId: "a1",
      role: "writer",
      scopeEntityTypes: ["Observation"],
      scopeOperations: ["recordObservation"],
    });
    expect(ctx.scopeEntityTypes).toEqual(["Observation"]);
    expect(ctx.scopeOperations).toEqual(["recordObservation"]);
  });

  it("leaves scopeEntityTypes undefined when not in claims", () => {
    const headers = new Headers();
    const ctx = callerFromHeaders(headers, { agentId: "a1", role: "admin" });
    expect(ctx.scopeEntityTypes).toBeUndefined();
    expect(ctx.scopeOperations).toBeUndefined();
  });
});
