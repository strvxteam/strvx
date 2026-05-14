import type { ManagedTransaction } from "neo4j-driver";
import type { Neo4jClient } from "../client/neo4j";
import type { PostgresClient } from "../client/postgres";
import { writeAuditEntry } from "../audit/writer";
import { applyMapping, mappingFor, POSTGRES_MAPPINGS } from "../mappings/postgres";
import type { MappedEdge, MappedRow } from "../mappings/types";
import { buildProvenance } from "../provenance/compute";
import type { AgentContext, Provenance } from "../types";

export interface CDCEventLike {
  kind: "insert" | "update" | "delete";
  table: string;
  row: Record<string, unknown>;
  oldKeys?: Record<string, unknown>;
  lsn: string;
  xid?: number;
  timestamp?: string;
}

export interface UpsertDeps {
  client: Neo4jClient;
  sql: PostgresClient;
  ctx: AgentContext;
}

export interface UpsertResult {
  nodeId: string | null; // null on delete-non-existent or noop
  edgeIds: string[];
  action: "upserted" | "deleted" | "noop";
}

/**
 * Apply a single CDC event to the graph. Idempotent:
 *  - insert/update → MERGE node by id, MERGE each FK edge (deduped by edge.id).
 *  - delete → DETACH DELETE the node (drops its edges).
 *
 * Provenance is built per call from the mapping config + the event's source.
 * Audit log gets one entry per call summarizing the action.
 */
export async function upsertFromPostgres(
  deps: UpsertDeps,
  event: CDCEventLike,
): Promise<UpsertResult> {
  const start = Date.now();
  try {
    if (!POSTGRES_MAPPINGS[event.table]) {
      // Not a mapped table; skip silently (publication may include extras).
      await writeAuditEntry(deps.sql, {
        actorKind: deps.ctx.actorKind,
        actorId: deps.ctx.actorId,
        tool: "upsertFromPostgres",
        parameters: { table: event.table, kind: event.kind, lsn: event.lsn },
        resultSummary: { skipped: true, reason: "unmapped table" },
        latencyMs: Date.now() - start,
        success: true,
      });
      return { nodeId: null, edgeIds: [], action: "noop" };
    }
    const mapping = mappingFor(event.table);

    if (event.kind === "delete") {
      const pkValue =
        event.oldKeys?.[mapping.primaryKey] ?? event.row[mapping.primaryKey];
      if (pkValue === undefined || pkValue === null) {
        await writeAuditEntry(deps.sql, {
          actorKind: deps.ctx.actorKind,
          actorId: deps.ctx.actorId,
          tool: "upsertFromPostgres",
          parameters: { table: event.table, kind: event.kind, lsn: event.lsn },
          resultSummary: { skipped: true, reason: "no PK in delete event" },
          latencyMs: Date.now() - start,
          success: true,
        });
        return { nodeId: null, edgeIds: [], action: "noop" };
      }
      const nodeId = `${mapping.sourceType}:${event.table}:${String(pkValue)}`;
      await deps.client.unsafeWrite(async (tx) => {
        await tx.run("MATCH (n {id: $id}) DETACH DELETE n", { id: nodeId });
      });
      await writeAuditEntry(deps.sql, {
        actorKind: deps.ctx.actorKind,
        actorId: deps.ctx.actorId,
        tool: "upsertFromPostgres",
        targetNodeId: nodeId,
        parameters: { table: event.table, kind: event.kind, lsn: event.lsn },
        resultSummary: { action: "deleted" },
        latencyMs: Date.now() - start,
        success: true,
      });
      return { nodeId, edgeIds: [], action: "deleted" };
    }

    // insert or update → MERGE
    const mapped: MappedRow | null = applyMapping(mapping, event.row);
    if (!mapped) {
      await writeAuditEntry(deps.sql, {
        actorKind: deps.ctx.actorKind,
        actorId: deps.ctx.actorId,
        tool: "upsertFromPostgres",
        parameters: { table: event.table, kind: event.kind, lsn: event.lsn },
        resultSummary: { skipped: true, reason: "missing PK in row" },
        latencyMs: Date.now() - start,
        success: true,
      });
      return { nodeId: null, edgeIds: [], action: "noop" };
    }

    const sourceId = `${event.table}:${String(event.row[mapping.primaryKey])}`;
    const provenance = buildProvenance({
      source_type: mapping.sourceType,
      source_id: sourceId,
      source_record_id: String(event.row[mapping.primaryKey]),
      extraction_method: "cdc",
      confidence: mapping.confidence ?? 1.0,
      created_by: "kg-ingestor",
      entity_type: mapped.entityType,
    });

    // Defense-in-depth: even though entityType comes from a closed enum in
    // types.ts, validate before interpolating into Cypher.
    if (!/^[A-Z][A-Za-z0-9_]*$/.test(mapped.entityType)) {
      throw new Error(`unsafe entity type identifier: ${mapped.entityType}`);
    }

    await deps.client.unsafeWrite(async (tx) => {
      // 1. MERGE the node. Always set the entity label and drop :StubNode —
      //    if a prior edge MERGE created this id as a stub, the MERGE here
      //    MATCHes (not CREATEs), so we must apply label changes unconditionally
      //    to upgrade the stub. Neo4j label ops are idempotent (no churn).
      await tx.run(
        `
        MERGE (n {id: $id})
        SET n :\`${mapped.entityType}\`
        REMOVE n:StubNode
        SET n.type = $type,
            n.is_stub = false,
            n += $props,
            ${provenanceSetClause("n")}
        `,
        {
          id: mapped.nodeId,
          type: mapped.entityType,
          props: mapped.properties,
          ...provenanceParams(provenance),
        },
      );

      // 2. For each declared FK edge, ensure both endpoints exist (creating
      //    the peer as a stub if unseen), then MERGE the relationship by id.
      for (const edge of mapped.edges) {
        await mergeEdge(tx, edge, mapping.sourceType, provenance);
      }
    });

    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool: "upsertFromPostgres",
      targetNodeId: mapped.nodeId,
      parameters: { table: event.table, kind: event.kind, lsn: event.lsn },
      resultSummary: { action: "upserted", edgeCount: mapped.edges.length },
      latencyMs: Date.now() - start,
      success: true,
    });
    return {
      nodeId: mapped.nodeId,
      edgeIds: mapped.edges.map((e) => e.edgeId),
      action: "upserted",
    };
  } catch (err) {
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool: "upsertFromPostgres",
      parameters: { table: event.table, kind: event.kind, lsn: event.lsn },
      latencyMs: Date.now() - start,
      success: false,
      errorMessage: (err as Error).message,
    });
    throw err;
  }
}

// ── helpers ─────────────────────────────────────────────────────────────

async function mergeEdge(
  tx: ManagedTransaction,
  edge: MappedEdge,
  sourceType: string,
  provenance: Provenance,
): Promise<void> {
  if (!/^[A-Z_][A-Z0-9_]*$/.test(edge.type)) {
    throw new Error(`unsafe relationship type identifier: ${edge.type}`);
  }

  // Ensure both endpoints exist. ON CREATE marks unseen nodes as stubs;
  // the just-upserted node matches by id and its ON CREATE clause is a no-op.
  for (const id of [edge.from, edge.to]) {
    await tx.run(
      `
      MERGE (n {id: $id})
        ON CREATE SET n :\`StubNode\`,
                      n.type = 'Unknown',
                      n.is_stub = true,
                      n.prov_source_type = $sourceType,
                      n.prov_source_id = $id,
                      n.prov_source_record_id = $id,
                      n.prov_extraction_method = 'system_inference',
                      n.prov_extracted_at = datetime(),
                      n.prov_last_validated_at = datetime(),
                      n.prov_validation_count = 0,
                      n.prov_confidence = 0.5,
                      n.prov_trust_score = 0.5,
                      n.prov_created_by = 'kg-ingestor:stub'
      `,
      { id, sourceType },
    );
  }

  // MERGE the relationship keyed by id. Relationship type is interpolated
  // (Neo4j cannot parameterize :REL_TYPE) — validated by regex above.
  await tx.run(
    `
    MATCH (from {id: $fromId}), (to {id: $toId})
    MERGE (from)-[r:\`${edge.type}\` {id: $edgeId}]->(to)
    SET ${provenanceSetClause("r")}
    `,
    {
      fromId: edge.from,
      toId: edge.to,
      edgeId: edge.edgeId,
      ...provenanceParams(provenance),
    },
  );
}

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
