import type { Neo4jClient } from "../client/neo4j.js";
import type { PostgresClient } from "../client/postgres.js";
import { writeAuditEntry } from "../audit/writer.js";
import { assertRole } from "../auth/middleware.js";
import type {
  AgentContext,
  Edge,
  EntityType,
  Node,
  Provenance,
  RelationshipType,
} from "../types.js";

export interface ReadDeps {
  client: Neo4jClient;
  sql: PostgresClient;
  ctx: AgentContext;
}

export async function getNode(deps: ReadDeps, id: string): Promise<Node | null> {
  assertRole(deps.ctx, "reader");
  const start = Date.now();
  try {
    const result = await deps.client.read(async (tx) => {
      const r = await tx.run("MATCH (n {id: $id}) RETURN n LIMIT 1", { id });
      if (r.records.length === 0) return null;
      const n = r.records[0].get("n");
      return rowToNode(n.properties as Record<string, unknown>, [...(n.labels as string[])]);
    });
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool: "getNode",
      targetNodeId: id,
      parameters: { id },
      resultSummary: { found: result !== null },
      latencyMs: Date.now() - start,
      success: true,
    });
    return result;
  } catch (err) {
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool: "getNode",
      targetNodeId: id,
      parameters: { id },
      latencyMs: Date.now() - start,
      success: false,
      errorMessage: (err as Error).message,
    });
    throw err;
  }
}

export async function getEdge(deps: ReadDeps, id: string): Promise<Edge | null> {
  assertRole(deps.ctx, "reader");
  const start = Date.now();
  try {
    const result = await deps.client.read(async (tx) => {
      const r = await tx.run(
        "MATCH (a)-[r {id: $id}]->(b) RETURN r, a.id AS fromId, b.id AS toId, type(r) AS relType LIMIT 1",
        { id },
      );
      if (r.records.length === 0) return null;
      const props = r.records[0].get("r").properties as Record<string, unknown>;
      const fromId = r.records[0].get("fromId") as string;
      const toId = r.records[0].get("toId") as string;
      const relType = r.records[0].get("relType") as RelationshipType;
      return {
        id: props.id as string,
        type: relType,
        from: fromId,
        to: toId,
        properties: stripProvenanceFields(props),
        provenance: extractProvenance(props),
      };
    });
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool: "getEdge",
      targetEdgeId: id,
      parameters: { id },
      resultSummary: { found: result !== null },
      latencyMs: Date.now() - start,
      success: true,
    });
    return result;
  } catch (err) {
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool: "getEdge",
      targetEdgeId: id,
      parameters: { id },
      latencyMs: Date.now() - start,
      success: false,
      errorMessage: (err as Error).message,
    });
    throw err;
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

export function extractProvenance(props: Record<string, unknown>): Provenance {
  return {
    source_type: props.prov_source_type as Provenance["source_type"],
    source_id: props.prov_source_id as string,
    source_record_id: props.prov_source_record_id as string,
    extraction_method: props.prov_extraction_method as Provenance["extraction_method"],
    extracted_at: toDate(props.prov_extracted_at),
    last_validated_at: toDate(props.prov_last_validated_at),
    validation_count: Number(props.prov_validation_count ?? 0),
    confidence: Number(props.prov_confidence ?? 0),
    trust_score: Number(props.prov_trust_score ?? 0),
    created_by: (props.prov_created_by as string) ?? "unknown",
  };
}

export function stripProvenanceFields(
  props: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (!k.startsWith("prov_")) out[k] = v;
  }
  return out;
}

export function rowToNode(props: Record<string, unknown>, labels: string[]): Node {
  const type = (props.type ?? labels[0]) as EntityType;
  const cleaned = stripProvenanceFields(props);
  // Don't expose `type` or `id` as a duplicate inside properties — they live on the Node directly.
  delete cleaned.type;
  delete cleaned.id;
  return {
    id: props.id as string,
    type,
    properties: cleaned,
    provenance: extractProvenance(props),
  };
}

function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (typeof v === "string") return new Date(v);
  // Neo4j DateTime — has a .toString() method that returns ISO
  if (typeof v === "object" && v !== null && "toString" in v) {
    return new Date((v as { toString(): string }).toString());
  }
  return new Date(0);
}
