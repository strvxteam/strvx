import { writeAuditEntry } from "../audit/writer";
import { assertWriteScope } from "../auth/middleware";
import type { Neo4jClient } from "../client/neo4j";
import type { PostgresClient } from "../client/postgres";
import { buildProvenance } from "../provenance/compute";
import type { AgentContext, EntityType, Provenance } from "../types";
import { uuidv7 } from "../util/uuidv7";

// ── Public types ────────────────────────────────────────────────────────────

export interface AgentMemoryDeps {
  client: Neo4jClient;
  sql: PostgresClient;
  ctx: AgentContext;
}

export interface RecordObservationInput {
  agentId: string;
  sessionId: string;
  rationale: string;
  /** KG ids of entities this observation is about → `:OBSERVED_FROM` edges. */
  about?: string[];
  /** Agent-authoring confidence, 0..1. Defaults to 0.7. */
  confidence?: number;
  /** Caller-supplied stable id (UUIDv7 generated if omitted). */
  observationId?: string;
}

export interface RecordDecisionInput {
  agentId: string;
  sessionId: string;
  rationale: string;
  /** Human-readable alternatives considered (stored as a string list). */
  alternatives?: string[];
  /** KG ids of observations supporting this decision → `:BASED_ON` edges. */
  basedOn?: string[];
  /** KG ids of entities this decision concerns → `:DECIDES_ABOUT` edges. */
  about?: string[];
  /** Defaults to 0.7. */
  confidence?: number;
  /** Caller-supplied stable id (UUIDv7 generated if omitted). */
  decisionId?: string;
}

export interface RecordPlanInput {
  agentId: string;
  sessionId: string;
  goal: string;
  steps: string[];
  /** Defaults to "active". */
  status?: "draft" | "active" | "completed" | "abandoned";
  /** KG ids of decisions this plan is based on → `:BASED_ON` edges. */
  basedOn?: string[];
  /** KG ids of entities this plan concerns → `:DECIDES_ABOUT` edges. */
  about?: string[];
  /** Defaults to 0.8 — plans are intent, fairly confident. */
  confidence?: number;
  /** Caller-supplied stable id (UUIDv7 generated if omitted). */
  planId?: string;
}

export interface AgentMemoryWriteOutput {
  nodeId: string;
  /** Edge ids that were actually merged (skipped refs are omitted). */
  edgeIds: string[];
}

export type RecordObservationOutput = AgentMemoryWriteOutput;
export type RecordDecisionOutput = AgentMemoryWriteOutput;
export type RecordPlanOutput = AgentMemoryWriteOutput;

// ── Default confidences ─────────────────────────────────────────────────────

const DEFAULT_CONFIDENCE: Record<"Observation" | "Decision" | "Plan", number> = {
  Observation: 0.7,
  Decision: 0.7,
  Plan: 0.8,
};

// ── Public writers ──────────────────────────────────────────────────────────

export async function recordObservation(
  deps: AgentMemoryDeps,
  input: RecordObservationInput,
): Promise<RecordObservationOutput> {
  return runWriter({
    deps,
    entityType: "Observation",
    tool: "recordObservation",
    confidenceOverride: input.confidence,
    callerSuppliedId: input.observationId,
    agentId: input.agentId,
    sessionId: input.sessionId,
    rationaleLen: input.rationale.length,
    auditParams: {
      agentId: input.agentId,
      sessionId: input.sessionId,
      aboutCount: input.about?.length ?? 0,
    },
    nodeProps: () => ({
      agent_id: input.agentId,
      session_id: input.sessionId,
      rationale: input.rationale,
    }),
    refs: [{ kind: "about", relType: "OBSERVED_FROM", ids: input.about ?? [] }],
  });
}

export async function recordDecision(
  deps: AgentMemoryDeps,
  input: RecordDecisionInput,
): Promise<RecordDecisionOutput> {
  return runWriter({
    deps,
    entityType: "Decision",
    tool: "recordDecision",
    confidenceOverride: input.confidence,
    callerSuppliedId: input.decisionId,
    agentId: input.agentId,
    sessionId: input.sessionId,
    rationaleLen: input.rationale.length,
    auditParams: {
      agentId: input.agentId,
      sessionId: input.sessionId,
      basedOnCount: input.basedOn?.length ?? 0,
      aboutCount: input.about?.length ?? 0,
      alternativesCount: input.alternatives?.length ?? 0,
    },
    nodeProps: () => ({
      agent_id: input.agentId,
      session_id: input.sessionId,
      rationale: input.rationale,
      alternatives: input.alternatives ?? [],
    }),
    refs: [
      { kind: "basedOn", relType: "BASED_ON", ids: input.basedOn ?? [] },
      { kind: "about", relType: "DECIDES_ABOUT", ids: input.about ?? [] },
    ],
  });
}

export async function recordPlan(
  deps: AgentMemoryDeps,
  input: RecordPlanInput,
): Promise<RecordPlanOutput> {
  const status = input.status ?? "active";
  return runWriter({
    deps,
    entityType: "Plan",
    tool: "recordPlan",
    confidenceOverride: input.confidence,
    callerSuppliedId: input.planId,
    agentId: input.agentId,
    sessionId: input.sessionId,
    rationaleLen: input.goal.length,
    auditParams: {
      agentId: input.agentId,
      sessionId: input.sessionId,
      basedOnCount: input.basedOn?.length ?? 0,
      aboutCount: input.about?.length ?? 0,
      stepsCount: input.steps.length,
      status,
    },
    nodeProps: () => ({
      agent_id: input.agentId,
      session_id: input.sessionId,
      goal: input.goal,
      steps: input.steps,
      status,
    }),
    refs: [
      { kind: "basedOn", relType: "BASED_ON", ids: input.basedOn ?? [] },
      { kind: "about", relType: "DECIDES_ABOUT", ids: input.about ?? [] },
    ],
  });
}

// ── Shared runner ───────────────────────────────────────────────────────────

interface RefSpec {
  kind: "about" | "basedOn";
  relType: "OBSERVED_FROM" | "BASED_ON" | "DECIDES_ABOUT";
  ids: string[];
}

interface RunWriterArgs {
  deps: AgentMemoryDeps;
  entityType: "Observation" | "Decision" | "Plan";
  tool: "recordObservation" | "recordDecision" | "recordPlan";
  confidenceOverride: number | undefined;
  callerSuppliedId: string | undefined;
  agentId: string;
  sessionId: string;
  rationaleLen: number;
  auditParams: Record<string, unknown>;
  nodeProps: () => Record<string, unknown>;
  refs: RefSpec[];
}

async function runWriter(args: RunWriterArgs): Promise<AgentMemoryWriteOutput> {
  const { deps, entityType, tool, agentId, sessionId } = args;
  const start = Date.now();

  // 1. Permission check — write a failure audit row if it throws.
  try {
    assertWriteScope(deps.ctx, entityType, tool);
  } catch (err) {
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool,
      parameters: args.auditParams,
      latencyMs: Date.now() - start,
      success: false,
      errorMessage: (err as Error).message,
    });
    throw err;
  }

  // 2. Resolve the local id portion of the stable graph id.
  const localId = args.callerSuppliedId ?? uuidv7();
  const nodeId = `agent:${entityType.toLowerCase()}:${localId}`;

  // 3. Build provenance.
  const confidence = args.confidenceOverride ?? DEFAULT_CONFIDENCE[entityType];
  const provenance = buildProvenance({
    source_type: "agent",
    source_id: `${deps.ctx.actorId}:${sessionId}`,
    source_record_id: localId,
    extraction_method: "agent_write",
    confidence,
    created_by: deps.ctx.actorId,
    entity_type: entityType as EntityType,
  });

  try {
    if (!/^[A-Z][A-Za-z0-9_]*$/.test(entityType)) {
      throw new Error(`unsafe entity type identifier: ${entityType}`);
    }

    const mergedEdgeIds: string[] = [];
    const skippedRefs: { relType: string; targetId: string }[] = [];

    await deps.client.unsafeWrite(async (tx) => {
      // 3a. MERGE the node — same upgrade-safe pattern as upsertFromPostgres.
      await tx.run(
        `
        MERGE (n {id: $id})
        SET n :\`${entityType}\`
        REMOVE n:StubNode
        SET n.type = $type,
            n.is_stub = false,
            n += $props,
            n.recorded_at = coalesce(n.recorded_at, datetime()),
            ${provenanceSetClause("n")}
        `,
        {
          id: nodeId,
          type: entityType,
          props: { agent_id: agentId, session_id: sessionId, ...args.nodeProps() },
          ...provenanceParams(provenance),
        },
      );

      // 3b. For each ref kind, resolve which target ids actually exist in the
      //     graph (one round trip per ref kind), then MERGE the edges that survive.
      for (const ref of args.refs) {
        if (ref.ids.length === 0) continue;
        if (!/^[A-Z][A-Z0-9_]*$/.test(ref.relType)) {
          throw new Error(`unsafe relationship type identifier: ${ref.relType}`);
        }
        // Dedupe to avoid wasted MATCH and double-MERGE work.
        const uniqIds = Array.from(new Set(ref.ids));
        const existsRes = await tx.run(
          "MATCH (t) WHERE t.id IN $ids RETURN t.id AS id",
          { ids: uniqIds },
        );
        const existing = new Set(
          existsRes.records.map((r) => r.get("id") as string),
        );
        for (const targetId of uniqIds) {
          if (!existing.has(targetId)) {
            skippedRefs.push({ relType: ref.relType, targetId });
            continue;
          }
          const edgeId = `agent:${entityType.toLowerCase()}:${localId}:${ref.relType.toLowerCase()}:${targetId}`;
          await tx.run(
            `
            MATCH (from {id: $fromId}), (to {id: $toId})
            MERGE (from)-[r:\`${ref.relType}\` {id: $edgeId}]->(to)
            SET ${provenanceSetClause("r")}
            `,
            {
              fromId: nodeId,
              toId: targetId,
              edgeId,
              ...provenanceParams(provenance),
            },
          );
          mergedEdgeIds.push(edgeId);
        }
      }
    });

    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool,
      targetNodeId: nodeId,
      parameters: args.auditParams,
      resultSummary: {
        action: "recorded",
        entityType,
        rationaleLength: args.rationaleLen,
        edgeCount: mergedEdgeIds.length,
        skippedRefs: skippedRefs.map((s) => s.targetId),
      },
      latencyMs: Date.now() - start,
      success: true,
    });

    return { nodeId, edgeIds: mergedEdgeIds };
  } catch (err) {
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool,
      targetNodeId: nodeId,
      parameters: args.auditParams,
      latencyMs: Date.now() - start,
      success: false,
      errorMessage: (err as Error).message,
    });
    throw err;
  }
}

// ── Provenance write helpers ────────────────────────────────────────────────
// Duplicated from upsert-from-postgres.ts intentionally — extracting to a
// shared module is its own decision and would couple two unrelated writers.

function provenanceSetClause(target: "n" | "r"): string {
  return [
    `${target}.prov_source_type = $provSourceType`,
    `${target}.prov_source_id = $provSourceId`,
    `${target}.prov_source_record_id = $provSourceRecordId`,
    `${target}.prov_extraction_method = $provExtractionMethod`,
    `${target}.prov_extracted_at = datetime($provExtractedAt)`,
    `${target}.prov_last_validated_at = datetime($provLastValidatedAt)`,
    `${target}.prov_validation_count = $provValidationCount`,
    `${target}.prov_confidence = $provConfidence`,
    `${target}.prov_trust_score = $provTrustScore`,
    `${target}.prov_created_by = $provCreatedBy`,
  ].join(", ");
}

function provenanceParams(p: Provenance): Record<string, unknown> {
  return {
    provSourceType: p.source_type,
    provSourceId: p.source_id,
    provSourceRecordId: p.source_record_id,
    provExtractionMethod: p.extraction_method,
    provExtractedAt: p.extracted_at.toISOString(),
    provLastValidatedAt: p.last_validated_at.toISOString(),
    provValidationCount: p.validation_count,
    provConfidence: p.confidence,
    provTrustScore: p.trust_score,
    provCreatedBy: p.created_by,
  };
}

