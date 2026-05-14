import { writeAuditEntry } from "../audit/writer";
import { assertWriteScope } from "../auth/middleware";
import type { Neo4jClient } from "../client/neo4j";
import type { PostgresClient } from "../client/postgres";
import { buildProvenance } from "../provenance/compute";
import type { AgentContext, Provenance } from "../types";
import { uuidv7 } from "../util/uuidv7";
import {
  recordDecision,
  type RecordDecisionInput,
  type RecordDecisionOutput,
} from "./agent-memory";

// ── Public types ────────────────────────────────────────────────────────────

export interface LinkDeps {
  client: Neo4jClient;
  sql: PostgresClient;
  ctx: AgentContext;
}

export interface LinkEntitiesInput {
  /** Two graph node ids. Order doesn't matter — implementation canonicalizes. */
  aId: string;
  bId: string;
  /** Free-form rationale, stored on the edge as `reason`. Required, min length 4. */
  reason: string;
  /** 0..1; defaults to 0.8 (agent assertion). */
  confidence?: number;
  /** Caller-supplied stable id; UUIDv7 if absent. */
  linkId?: string;
}

export interface LinkEntitiesResult {
  edgeId: string;
  canonicalFrom: string; // alphabetically-smaller id, used as `from`
  canonicalTo: string; // the other id
  alreadyExisted: boolean; // true if the SAME_AS edge was already present
}

export interface SupersedeDecisionInput {
  /** Existing Decision node id to retract. Must exist and have type 'Decision'. */
  oldDecisionId: string;
  /** Full input for the new Decision (same shape as recordDecision's input). */
  newDecision: Omit<RecordDecisionInput, "decisionId">;
  /** Optional caller-supplied new id; otherwise UUIDv7 via recordDecision. */
  newDecisionId?: string;
}

export interface SupersedeDecisionResult {
  newDecision: RecordDecisionOutput;
  supersedesEdgeId: string;
  alreadyExisted: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Canonicalize two ids into (from, to) with `from` = alphabetically smaller. */
export function canonicalize(
  a: string,
  b: string,
): { from: string; to: string } {
  return a < b ? { from: a, to: b } : { from: b, to: a };
}

// SAME_AS is a graph annotation, not tied to a single entity type. We gate on
// Observation since it is the closest "annotation-style" entry on the entity
// list; assertWriteScope also accepts an `operation` string and we pass the
// tool name so scoped callers can restrict by operation cleanly.
const LINK_ENTITIES_SCOPE_ENTITY_TYPE = "Observation" as const;

// ── linkEntities ────────────────────────────────────────────────────────────

export async function linkEntities(
  deps: LinkDeps,
  input: LinkEntitiesInput,
): Promise<LinkEntitiesResult> {
  const start = Date.now();
  const auditParams: Record<string, unknown> = {
    aId: input.aId,
    bId: input.bId,
    reasonLength: input.reason.length,
    confidence: input.confidence ?? 0.8,
  };

  // 1. Permission check — record failure on throw.
  try {
    assertWriteScope(
      deps.ctx,
      LINK_ENTITIES_SCOPE_ENTITY_TYPE,
      "linkEntities",
    );
  } catch (err) {
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool: "linkEntities",
      parameters: auditParams,
      latencyMs: Date.now() - start,
      success: false,
      errorMessage: (err as Error).message,
    });
    throw err;
  }

  // 2. Input validation.
  try {
    if (input.aId === input.bId) {
      throw new Error("cannot link a node to itself");
    }
    if (input.reason.trim().length < 4) {
      throw new Error("linkEntities: reason must be at least 4 characters");
    }
  } catch (err) {
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool: "linkEntities",
      parameters: auditParams,
      latencyMs: Date.now() - start,
      success: false,
      errorMessage: (err as Error).message,
    });
    throw err;
  }

  const { from, to } = canonicalize(input.aId, input.bId);
  const localId = input.linkId ?? uuidv7();
  const edgeId = `agent:same_as:${localId}`;
  const confidence = input.confidence ?? 0.8;
  const provenance = buildProvenance({
    source_type: "agent",
    source_id: `${deps.ctx.actorId}:${deps.ctx.sessionId ?? "no-session"}`,
    source_record_id: edgeId,
    extraction_method: "agent_write",
    confidence,
    created_by: deps.ctx.actorId,
    entity_type: "Observation",
  });

  try {
    // 3. Verify both endpoints exist, then MERGE the edge — detect whether
    //    it was new by capturing the existing edge id BEFORE the MERGE call.
    const result = await deps.client.unsafeWrite(async (tx) => {
      const exists = await tx.run(
        "MATCH (a {id: $aId}), (b {id: $bId}) RETURN a.id AS aId, b.id AS bId",
        { aId: input.aId, bId: input.bId },
      );
      if (exists.records.length === 0) {
        // At least one is missing — figure out which to give a precise error.
        const probe = await tx.run(
          "MATCH (n) WHERE n.id IN $ids RETURN n.id AS id",
          { ids: [input.aId, input.bId] },
        );
        const found = new Set(probe.records.map((r) => r.get("id") as string));
        const missing = [input.aId, input.bId].find((id) => !found.has(id));
        throw new Error(`linkEntities: node not found: ${missing}`);
      }

      // Capture whether a SAME_AS edge already exists between these two.
      const existingProbe = await tx.run(
        "MATCH (from {id: $from})-[r:SAME_AS]->(to {id: $to}) RETURN r.id AS id LIMIT 1",
        { from, to },
      );
      const alreadyExisted = existingProbe.records.length > 0;

      // MERGE — on create, set the new edge id + provenance; on match, leave
      // existing edge untouched (idempotent).
      await tx.run(
        `
        MATCH (from {id: $from}), (to {id: $to})
        MERGE (from)-[r:SAME_AS]->(to)
        ON CREATE SET r.id = $edgeId,
                      r.reason = $reason,
                      r.confidence = $confidence,
                      r.linked_by = $actorId,
                      r.linked_at = datetime(),
                      ${provenanceSetClause("r")}
        `,
        {
          from,
          to,
          edgeId,
          reason: input.reason,
          confidence,
          actorId: deps.ctx.actorId,
          ...provenanceParams(provenance),
        },
      );

      // If an edge already existed, the canonical edge id is the existing one.
      const finalId = alreadyExisted
        ? (existingProbe.records[0].get("id") as string)
        : edgeId;

      return { alreadyExisted, finalId };
    });

    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool: "linkEntities",
      targetEdgeId: result.finalId,
      parameters: auditParams,
      resultSummary: {
        action: "linked",
        canonicalFrom: from,
        canonicalTo: to,
        alreadyExisted: result.alreadyExisted,
      },
      latencyMs: Date.now() - start,
      success: true,
    });

    return {
      edgeId: result.finalId,
      canonicalFrom: from,
      canonicalTo: to,
      alreadyExisted: result.alreadyExisted,
    };
  } catch (err) {
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool: "linkEntities",
      targetEdgeId: edgeId,
      parameters: auditParams,
      latencyMs: Date.now() - start,
      success: false,
      errorMessage: (err as Error).message,
    });
    throw err;
  }
}

// ── supersedeDecision ───────────────────────────────────────────────────────

export async function supersedeDecision(
  deps: LinkDeps,
  input: SupersedeDecisionInput,
): Promise<SupersedeDecisionResult> {
  const start = Date.now();
  const auditParams: Record<string, unknown> = {
    oldDecisionId: input.oldDecisionId,
    newDecisionId: input.newDecisionId ?? null,
    rationaleLength: input.newDecision.rationale.length,
  };

  // 1. Permission check.
  try {
    assertWriteScope(deps.ctx, "Decision", "supersedeDecision");
  } catch (err) {
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool: "supersedeDecision",
      targetNodeId: input.oldDecisionId,
      parameters: auditParams,
      latencyMs: Date.now() - start,
      success: false,
      errorMessage: (err as Error).message,
    });
    throw err;
  }

  // 2. Verify old node exists and is a Decision.
  try {
    const exists = await deps.client.read(async (tx) => {
      const r = await tx.run(
        "MATCH (d {id: $oldId}) WHERE d.type = 'Decision' RETURN d.id AS id LIMIT 1",
        { oldId: input.oldDecisionId },
      );
      return r.records.length > 0;
    });
    if (!exists) {
      throw new Error(
        `supersedeDecision: decision not found or not a Decision: ${input.oldDecisionId}`,
      );
    }
  } catch (err) {
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool: "supersedeDecision",
      targetNodeId: input.oldDecisionId,
      parameters: auditParams,
      latencyMs: Date.now() - start,
      success: false,
      errorMessage: (err as Error).message,
    });
    throw err;
  }

  // 3. Record the new Decision via the existing writer (idempotent on id).
  let newDecision: RecordDecisionOutput;
  try {
    newDecision = await recordDecision(deps, {
      ...input.newDecision,
      decisionId: input.newDecisionId,
    });
  } catch (err) {
    // recordDecision already wrote its own audit entry; also write one for
    // supersedeDecision so callers see the full picture.
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool: "supersedeDecision",
      targetNodeId: input.oldDecisionId,
      parameters: auditParams,
      latencyMs: Date.now() - start,
      success: false,
      errorMessage: (err as Error).message,
    });
    throw err;
  }

  // Derive the SUPERSEDES edge id deterministically from the new decision id
  // so repeated calls are idempotent at the edge level too.
  const newLocalId = newDecision.nodeId.replace(/^agent:decision:/, "");
  const supersedesEdgeId = `agent:supersedes:${newLocalId}`;
  const provenance = buildProvenance({
    source_type: "agent",
    source_id: `${deps.ctx.actorId}:${input.newDecision.sessionId}`,
    source_record_id: supersedesEdgeId,
    extraction_method: "agent_write",
    confidence: input.newDecision.confidence ?? 0.7,
    created_by: deps.ctx.actorId,
    entity_type: "Decision",
  });

  try {
    const alreadyExisted = await deps.client.unsafeWrite(async (tx) => {
      const probe = await tx.run(
        `MATCH (newD {id: $newId})-[r:SUPERSEDES {id: $edgeId}]->(oldD {id: $oldId})
         RETURN r.id AS id LIMIT 1`,
        {
          newId: newDecision.nodeId,
          oldId: input.oldDecisionId,
          edgeId: supersedesEdgeId,
        },
      );
      const existed = probe.records.length > 0;

      await tx.run(
        `
        MATCH (newD {id: $newId}), (oldD {id: $oldId})
        MERGE (newD)-[r:SUPERSEDES {id: $edgeId}]->(oldD)
        ON CREATE SET r.created_at = datetime(),
                      r.created_by = $actorId,
                      ${provenanceSetClause("r")}
        SET oldD.superseded_by = $newId
        `,
        {
          newId: newDecision.nodeId,
          oldId: input.oldDecisionId,
          edgeId: supersedesEdgeId,
          actorId: deps.ctx.actorId,
          ...provenanceParams(provenance),
        },
      );

      return existed;
    });

    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool: "supersedeDecision",
      targetNodeId: input.oldDecisionId,
      targetEdgeId: supersedesEdgeId,
      parameters: auditParams,
      resultSummary: {
        action: "superseded",
        newDecisionId: newDecision.nodeId,
        alreadyExisted,
      },
      latencyMs: Date.now() - start,
      success: true,
    });

    return { newDecision, supersedesEdgeId, alreadyExisted };
  } catch (err) {
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool: "supersedeDecision",
      targetNodeId: input.oldDecisionId,
      targetEdgeId: supersedesEdgeId,
      parameters: auditParams,
      latencyMs: Date.now() - start,
      success: false,
      errorMessage: (err as Error).message,
    });
    throw err;
  }
}

// ── Provenance write helpers ────────────────────────────────────────────────
// Duplicated from agent-memory.ts intentionally — sharing this with another
// writer is a separate refactor decision.

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
