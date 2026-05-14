import type { EntityType, ExtractionMethod, Provenance, SourceType } from "../types";
import { DEFAULT_HALF_LIFE_DAYS, DEFAULT_SOURCE_RELIABILITY } from "./source-reliability";

export { DEFAULT_HALF_LIFE_DAYS, DEFAULT_SOURCE_RELIABILITY };

export interface BuildProvenanceInput {
  source_type: SourceType;
  source_id: string;
  source_record_id: string;
  extraction_method: ExtractionMethod;
  confidence: number;
  created_by: string;
  entity_type: EntityType;
  source_reliability?: number;
  now?: Date;
}

export function buildProvenance(input: BuildProvenanceInput): Provenance {
  const now = input.now ?? new Date();
  const reliability =
    input.source_reliability ?? DEFAULT_SOURCE_RELIABILITY[input.source_type];
  const trust = computeTrustScore({
    confidence: input.confidence,
    source_reliability: reliability,
    age_days: 0,
    validation_count: 0,
    entity_type: input.entity_type,
  });
  return {
    source_type: input.source_type,
    source_id: input.source_id,
    source_record_id: input.source_record_id,
    extraction_method: input.extraction_method,
    extracted_at: now,
    last_validated_at: now,
    validation_count: 0,
    confidence: clamp01(input.confidence),
    trust_score: trust,
    created_by: input.created_by,
  };
}

export interface ComputeTrustInput {
  confidence: number;
  source_reliability: number;
  age_days: number;
  validation_count: number;
  entity_type: EntityType;
}

export function computeTrustScore(input: ComputeTrustInput): number {
  const halfLife = DEFAULT_HALF_LIFE_DAYS[input.entity_type];
  const ageDecay = halfLife > 0 ? Math.pow(0.5, input.age_days / halfLife) : 1;
  const validationFactor = Math.min(1 + input.validation_count * 0.1, 1.5);
  const raw =
    clamp01(input.confidence) *
    clamp01(input.source_reliability) *
    ageDecay *
    validationFactor;
  return clamp01(raw);
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
