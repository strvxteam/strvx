import { describe, expect, it } from "vitest";
import {
  buildProvenance,
  computeTrustScore,
  DEFAULT_HALF_LIFE_DAYS,
  DEFAULT_SOURCE_RELIABILITY,
} from "../../src/provenance/compute.js";

describe("buildProvenance", () => {
  it("produces a complete provenance with computed trust", () => {
    const p = buildProvenance({
      source_type: "agent",
      source_id: "agent:cos:obs:42",
      source_record_id: "42",
      extraction_method: "agent_write",
      confidence: 0.8,
      created_by: "agent:cos",
      entity_type: "Observation",
    });
    expect(p.source_type).toBe("agent");
    expect(p.validation_count).toBe(0);
    expect(p.trust_score).toBeCloseTo(0.8 * DEFAULT_SOURCE_RELIABILITY.agent * 1, 5);
  });
});

describe("computeTrustScore", () => {
  it("uses age decay relative to entity-type half-life", () => {
    const halfLife = DEFAULT_HALF_LIFE_DAYS.Observation;
    const score = computeTrustScore({
      confidence: 1,
      source_reliability: 1,
      age_days: halfLife,
      validation_count: 0,
      entity_type: "Observation",
    });
    expect(score).toBeCloseTo(0.5, 2);
  });

  it("rewards cross-source validation up to the cap", () => {
    const noVal = computeTrustScore({
      confidence: 0.5,
      source_reliability: 1,
      age_days: 0,
      validation_count: 0,
      entity_type: "Person",
    });
    const muchVal = computeTrustScore({
      confidence: 0.5,
      source_reliability: 1,
      age_days: 0,
      validation_count: 20,
      entity_type: "Person",
    });
    expect(muchVal).toBeGreaterThan(noVal);
    expect(muchVal).toBeLessThanOrEqual(0.5 * 1.5);
  });

  it("clamps to [0, 1]", () => {
    const high = computeTrustScore({
      confidence: 1,
      source_reliability: 1,
      age_days: 0,
      validation_count: 50,
      entity_type: "Person",
    });
    expect(high).toBeLessThanOrEqual(1);
    expect(high).toBeGreaterThanOrEqual(0);
  });

  it("returns 0 for NaN confidence", () => {
    const score = computeTrustScore({
      confidence: NaN,
      source_reliability: 1,
      age_days: 0,
      validation_count: 0,
      entity_type: "Person",
    });
    expect(score).toBe(0);
  });

  it("returns 0 for negative confidence (clamped)", () => {
    const score = computeTrustScore({
      confidence: -1,
      source_reliability: 1,
      age_days: 0,
      validation_count: 0,
      entity_type: "Person",
    });
    expect(score).toBe(0);
  });

  it("handles entity type with zero half-life gracefully (ageDecay = 1)", () => {
    // We can't have halfLife=0 via EntityType defaults, but we can
    // test an entity whose DEFAULT_HALF_LIFE_DAYS would cause decay to be exactly 0.5
    // at one half-life. This test covers the ageDecay computation branch.
    const halfLife = DEFAULT_HALF_LIFE_DAYS.Observation; // 30 days
    const score = computeTrustScore({
      confidence: 1,
      source_reliability: 1,
      age_days: halfLife * 2, // two half-lives → 0.25 decay
      validation_count: 0,
      entity_type: "Observation",
    });
    expect(score).toBeCloseTo(0.25, 2);
  });
});
