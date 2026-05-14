import type { Node, Provenance } from "../types";

export function makeProvenance(overrides: Partial<Provenance> = {}): Provenance {
  const now = new Date();
  return {
    source_type: "postgres",
    source_id: "pg:test:1",
    source_record_id: "1",
    extraction_method: "cdc",
    extracted_at: now,
    last_validated_at: now,
    validation_count: 1,
    confidence: 1,
    trust_score: 1,
    created_by: "test",
    ...overrides,
  };
}

export function makePersonNode(overrides: Partial<Node> = {}): Node {
  return {
    id: "postgres:contact:1",
    type: "Person",
    properties: { name: "Test Person", email: "t@example.com" },
    provenance: makeProvenance(),
    ...overrides,
  };
}
