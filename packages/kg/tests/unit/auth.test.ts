import { describe, expect, it } from "vitest";
import { assertRole, assertWriteScope, KgAuthError } from "../../src/auth/middleware.js";
import type { AgentContext } from "../../src/types.js";

const reader: AgentContext = { actorKind: "agent", actorId: "a1", role: "reader" };
const writer: AgentContext = { actorKind: "agent", actorId: "a2", role: "writer" };
const scopedWriter: AgentContext = {
  actorKind: "agent",
  actorId: "a3",
  role: "writer",
  scopeEntityTypes: ["Observation"],
  scopeOperations: ["recordObservation"],
};

describe("assertRole", () => {
  it("passes when role is sufficient", () => {
    expect(() => assertRole(writer, "writer")).not.toThrow();
    expect(() => assertRole(writer, "reader")).not.toThrow();
  });
  it("throws KgAuthError when role is insufficient", () => {
    expect(() => assertRole(reader, "writer")).toThrow(KgAuthError);
  });
});

describe("assertWriteScope", () => {
  it("passes when entity type and operation are in scope", () => {
    expect(() => assertWriteScope(scopedWriter, "Observation", "recordObservation")).not.toThrow();
  });
  it("throws when entity type is out of scope", () => {
    expect(() => assertWriteScope(scopedWriter, "Decision", "recordObservation")).toThrow(KgAuthError);
  });
  it("throws when operation is out of scope", () => {
    expect(() => assertWriteScope(scopedWriter, "Observation", "linkEntities")).toThrow(KgAuthError);
  });
  it("treats unset scope as 'all'", () => {
    expect(() => assertWriteScope(writer, "Decision", "linkEntities")).not.toThrow();
  });
});
