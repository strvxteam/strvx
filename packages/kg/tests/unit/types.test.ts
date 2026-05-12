import { describe, expect, it } from "vitest";
import type {
  EntityType,
  Provenance,
  Node,
  Edge,
  ObservationNode,
  AgentContext,
} from "../../src/types.js";
import { ENTITY_TYPES, RELATIONSHIP_TYPES } from "../../src/types.js";

describe("ontology types", () => {
  it("exports all v1 entity types", () => {
    expect(ENTITY_TYPES).toContain("Person");
    expect(ENTITY_TYPES).toContain("Organization");
    expect(ENTITY_TYPES).toContain("Engagement");
    expect(ENTITY_TYPES).toContain("Observation");
    expect(ENTITY_TYPES).toContain("Decision");
    expect(ENTITY_TYPES).toContain("Pattern");
    expect(ENTITY_TYPES.length).toBeGreaterThanOrEqual(20);
  });

  it("exports all v1 relationship types including Tier-3 hooks", () => {
    expect(RELATIONSHIP_TYPES).toContain("WORKS_AT");
    expect(RELATIONSHIP_TYPES).toContain("PREDICTS");
    expect(RELATIONSHIP_TYPES).toContain("CAUSED");
  });

  it("Observation extends Node with agent fields", () => {
    const obs: ObservationNode = {
      id: "n1",
      type: "Observation",
      properties: { content: "x", subject: "client:acme" },
      provenance: {
        source_type: "agent",
        source_id: "agent:cos:obs:1",
        source_record_id: "1",
        extraction_method: "agent_write",
        extracted_at: new Date(),
        last_validated_at: new Date(),
        validation_count: 0,
        confidence: 0.9,
        trust_score: 0.9,
        created_by: "agent:cos",
      },
      agent_id: "cos",
      session_id: "s1",
      rationale: "noticed in email thread",
    };
    expect(obs.type).toBe("Observation");
  });

  it("AgentContext carries role + scope", () => {
    const ctx: AgentContext = { actorKind: "agent", actorId: "cos", role: "writer" };
    expect(ctx.role).toBe("writer");
  });
});
