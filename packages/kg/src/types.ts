// ── Entity & relationship enums ────────────────────────────────────────────

export const ENTITY_TYPES = [
  // People & Organizations
  "Person",
  "Organization",
  "Role",
  // Activity & Engagements
  "Engagement",
  "Interaction",
  "Communication",
  "Task",
  "FinancialEvent",
  "Booking",
  // Knowledge & Artifacts
  "Document",
  "Repository",
  "Commit",
  "PullRequest",
  "Issue",
  "CodeFile",
  "Note",
  "Goal",
  "MonitoredSite",
  // Agent memory
  "Observation",
  "Decision",
  "Plan",
  "Pattern",
  "SchemaProposal",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const RELATIONSHIP_TYPES = [
  "WORKS_AT",
  "REPRESENTS",
  "HAS_ENGAGEMENT",
  "ASSIGNED_TO",
  "INVOLVED_IN",
  "ABOUT",
  "AUTHORED",
  "IN_REPO",
  "OWNED_BY",
  "PAID_BY",
  "PAID_TO",
  "FOLLOWS",
  "REFERENCES",
  "DECIDED_ABOUT",
  "OBSERVED",
  "PLANS_FOR",
  "EXTRACTED_FROM",
  "SUPERSEDES",
  "MERGED_FROM",
  "SAME_AS",
  "CONFLICTS_WITH",
  "SUMMARIZED_BY",
  "DERIVED_FROM",
  // Tier-3 hook edges (reserved; no writers in v1)
  "PREDICTS",
  "CAUSED",
  "COUNTERFACTUAL_OF",
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

// ── Provenance ─────────────────────────────────────────────────────────────

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

// ── Nodes & edges ──────────────────────────────────────────────────────────

export interface Node {
  id: string; // stable graph id: `${source_type}:${source_id}`
  type: EntityType;
  properties: Record<string, unknown>;
  provenance: Provenance;
}

export interface Edge {
  id: string;
  type: RelationshipType;
  from: string;
  to: string;
  properties: Record<string, unknown>;
  provenance: Provenance;
}

export interface ObservationNode extends Node {
  type: "Observation";
  agent_id: string;
  session_id: string;
  rationale: string;
  superseded_by?: string;
}

export interface DecisionNode extends Node {
  type: "Decision";
  agent_id: string;
  session_id: string;
  rationale: string;
  alternatives?: string[];
}

// ── Auth context ───────────────────────────────────────────────────────────

export type Role = "reader" | "writer" | "admin";

export interface AgentContext {
  actorKind: "agent" | "user" | "system";
  actorId: string;
  role: Role;
  scopeEntityTypes?: EntityType[];
  scopeOperations?: string[];
  sessionId?: string;
}

// ── Trust & validation ─────────────────────────────────────────────────────

export interface TrustParams {
  confidence: number;
  source_reliability: number;
  age_decay: number;
  validation_factor: number;
}
