export type SourceType =
  | "postgres"
  | "gmail"
  | "calendar"
  | "mercury"
  | "stripe"
  | "slack"
  | "github"
  | "obsidian"
  | "agent"
  | "system";

export type ExtractionMethod =
  | "cdc"
  | "api_fetch"
  | "llm_extraction"
  | "agent_write"
  | "system_inference";

export interface Provenance {
  source_type: SourceType;
  source_id: string;
  source_record_id: string;
  extraction_method: ExtractionMethod;
  extracted_at: Date;
  last_validated_at: Date;
  validation_count: number;
  confidence: number;
  trust_score: number;
  created_by: string;
}

export interface Node {
  id: string;
  type: string;
  properties: Record<string, unknown>;
  provenance: Provenance;
}
