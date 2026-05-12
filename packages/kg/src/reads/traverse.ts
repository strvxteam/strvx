import type { Neo4jClient } from "../client/neo4j.js";
import type { PostgresClient } from "../client/postgres.js";
import { writeAuditEntry } from "../audit/writer.js";
import { assertRole } from "../auth/middleware.js";
import {
  extractProvenance,
  rowToNode,
  stripProvenanceFields,
} from "./get-node.js";
import type {
  AgentContext,
  Edge,
  Node,
  RelationshipType,
} from "../types.js";

export interface TraversalPattern {
  relationshipTypes?: RelationshipType[];
  direction?: "incoming" | "outgoing" | "any";
  maxDepth?: number;
}

export interface TraversalResult {
  nodes: Node[];
  edges: Edge[];
}

export async function traverse(
  deps: { client: Neo4jClient; sql: PostgresClient; ctx: AgentContext },
  startId: string,
  pattern: TraversalPattern,
): Promise<TraversalResult> {
  assertRole(deps.ctx, "reader");
  const dir = pattern.direction ?? "any";
  const depth = Math.max(1, Math.min(4, pattern.maxDepth ?? 2));
  const relTypes = pattern.relationshipTypes ?? [];
  // relationshipTypes is interpolated (Cypher cannot parameterize :REL_TYPE).
  // Validate types are bare identifiers to prevent injection.
  for (const t of relTypes) {
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(t)) {
      throw new Error(`invalid relationship type identifier: ${t}`);
    }
  }
  const relPart = relTypes.length > 0 ? `:${relTypes.join("|")}` : "";
  const start = Date.now();
  let cypher: string;
  if (dir === "outgoing")
    cypher = `MATCH (s {id:$id})-[r${relPart}*1..${depth}]->(n) RETURN r, n, labels(n) AS labels`;
  else if (dir === "incoming")
    cypher = `MATCH (s {id:$id})<-[r${relPart}*1..${depth}]-(n) RETURN r, n, labels(n) AS labels`;
  else
    cypher = `MATCH (s {id:$id})-[r${relPart}*1..${depth}]-(n) RETURN r, n, labels(n) AS labels`;
  try {
    const result = await deps.client.read(async (tx) => {
      const r = await tx.run(cypher, { id: startId });
      const nodes = new Map<string, Node>();
      const edges = new Map<string, Edge>();
      for (const rec of r.records) {
        const n = rec.get("n");
        const node = rowToNode(
          n.properties as Record<string, unknown>,
          [...(rec.get("labels") as string[])],
        );
        nodes.set(node.id, node);
        const relPath = rec.get("r") as Array<{
          properties: Record<string, unknown>;
          type: string;
          start: unknown;
          end: unknown;
        }>;
        for (const rel of relPath) {
          const props = rel.properties;
          const edgeId = props.id as string;
          if (!edges.has(edgeId)) {
            edges.set(edgeId, {
              id: edgeId,
              type: rel.type as RelationshipType,
              from: "",
              to: "",
              properties: stripProvenanceFields(props),
              provenance: extractProvenance(props),
            });
          }
        }
      }
      // Resolve from/to ids in a follow-up query
      if (edges.size > 0) {
        const ids = [...edges.keys()];
        const r2 = await tx.run(
          "MATCH (a)-[r]->(b) WHERE r.id IN $ids RETURN r.id AS id, a.id AS fromId, b.id AS toId",
          { ids },
        );
        for (const rec of r2.records) {
          const edge = edges.get(rec.get("id") as string);
          if (edge) {
            edge.from = rec.get("fromId") as string;
            edge.to = rec.get("toId") as string;
          }
        }
      }
      return { nodes: [...nodes.values()], edges: [...edges.values()] };
    });
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool: "traverse",
      targetNodeId: startId,
      parameters: { startId, pattern },
      resultSummary: { nodeCount: result.nodes.length, edgeCount: result.edges.length },
      latencyMs: Date.now() - start,
      success: true,
    });
    return result;
  } catch (err) {
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool: "traverse",
      targetNodeId: startId,
      parameters: { startId, pattern },
      latencyMs: Date.now() - start,
      success: false,
      errorMessage: (err as Error).message,
    });
    throw err;
  }
}
