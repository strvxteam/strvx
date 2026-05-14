import type { Neo4jClient } from "../client/neo4j";
import type { PostgresClient } from "../client/postgres";
import { writeAuditEntry } from "../audit/writer";
import { assertRole } from "../auth/middleware";
import {
  extractProvenance,
  rowToNode,
  stripProvenanceFields,
} from "./get-node";
import type {
  AgentContext,
  Edge,
  EntityType,
  Node,
  RelationshipType,
} from "../types";

export interface EntityContext {
  center: Node | null;
  nodes: Node[];
  edges: Edge[];
}

export interface GetEntityContextOptions {
  depth?: number;
  types?: EntityType[];
  limit?: number;
  minTrust?: number;
}

export async function getEntityContext(
  deps: { client: Neo4jClient; sql: PostgresClient; ctx: AgentContext },
  id: string,
  opts: GetEntityContextOptions = {},
): Promise<EntityContext> {
  assertRole(deps.ctx, "reader");
  const depth = Math.max(1, Math.min(4, opts.depth ?? 2));
  const limit = opts.limit ?? 100;
  const minTrust = opts.minTrust ?? 0.3;
  const start = Date.now();
  try {
    const out = await deps.client.read(async (tx) => {
      // depth is interpolated because Cypher does NOT support parameterized
      // variable-length path bounds. We clamp 1..4 above so it can't be unsafe.
      const r = await tx.run(
        `
        MATCH (center {id: $id})
        OPTIONAL MATCH p = (center)-[*1..${depth}]-(neighbor)
        WHERE all(rel IN relationships(p) WHERE coalesce(rel.prov_trust_score, 0) >= $minTrust)
          AND coalesce(neighbor.prov_trust_score, 0) >= $minTrust
          AND ($types IS NULL OR neighbor.type IN $types)
        WITH center, collect(DISTINCT neighbor) AS neighbors, collect(DISTINCT p) AS paths
        RETURN center, labels(center) AS centerLabels,
               neighbors,
               [n IN neighbors | labels(n)] AS neighborLabels,
               paths
        LIMIT 1
        `,
        { id, minTrust, types: opts.types ?? null },
      );
      if (r.records.length === 0) {
        return { center: null, nodes: [], edges: [] } satisfies EntityContext;
      }
      const rec = r.records[0];
      const centerRaw = rec.get("center");
      if (!centerRaw) {
        return { center: null, nodes: [], edges: [] } satisfies EntityContext;
      }
      const center = rowToNode(
        centerRaw.properties as Record<string, unknown>,
        [...(rec.get("centerLabels") as string[])],
      );
      const neighborRaw = (rec.get("neighbors") ?? []) as Array<{
        properties: Record<string, unknown>;
      }>;
      const neighborLabels = (rec.get("neighborLabels") ?? []) as string[][];
      const nodes: Node[] = [center];
      neighborRaw.forEach((n, i) => {
        if (!n) return;
        nodes.push(rowToNode(n.properties, neighborLabels[i] ?? []));
      });

      const edges = new Map<string, Edge>();
      const paths = (rec.get("paths") ?? []) as Array<{
        segments: Array<{
          start: { properties: Record<string, unknown> };
          relationship: { type: string; properties: Record<string, unknown> };
          end: { properties: Record<string, unknown> };
        }>;
      }>;
      for (const path of paths) {
        if (!path?.segments) continue;
        for (const seg of path.segments) {
          const relProps = seg.relationship.properties;
          const edgeId = relProps.id as string;
          if (!edges.has(edgeId)) {
            edges.set(edgeId, {
              id: edgeId,
              type: seg.relationship.type as RelationshipType,
              from: seg.start.properties.id as string,
              to: seg.end.properties.id as string,
              properties: stripProvenanceFields(relProps),
              provenance: extractProvenance(relProps),
            });
          }
        }
      }
      const limitedNodes = nodes.slice(0, limit);
      const allowed = new Set(limitedNodes.map((n) => n.id));
      const limitedEdges = [...edges.values()].filter(
        (e) => allowed.has(e.from) && allowed.has(e.to),
      );
      return { center, nodes: limitedNodes, edges: limitedEdges };
    });
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool: "getEntityContext",
      targetNodeId: id,
      parameters: { id, opts },
      resultSummary: { nodeCount: out.nodes.length, edgeCount: out.edges.length },
      latencyMs: Date.now() - start,
      success: true,
    });
    return out;
  } catch (err) {
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool: "getEntityContext",
      targetNodeId: id,
      parameters: { id, opts },
      latencyMs: Date.now() - start,
      success: false,
      errorMessage: (err as Error).message,
    });
    throw err;
  }
}
