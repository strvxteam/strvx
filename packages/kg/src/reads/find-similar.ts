import type { Neo4jClient } from "../client/neo4j.js";
import type { PostgresClient } from "../client/postgres.js";
import type { EmbeddingProvider } from "../embedding/provider.js";
import { writeAuditEntry } from "../audit/writer.js";
import { assertRole } from "../auth/middleware.js";
import { rowToNode } from "./get-node.js";
import type { AgentContext, EntityType, Node } from "../types.js";

export interface FindSimilarDeps {
  client: Neo4jClient;
  sql: PostgresClient;
  ctx: AgentContext;
  embedding: EmbeddingProvider;
}

export interface FindSimilarOptions {
  scope?: EntityType[];
  limit?: number;
  minTrust?: number;
}

export interface SimilarEntity {
  node: Node;
  score: number;
}

export async function findSimilar(
  deps: FindSimilarDeps,
  entityId: string,
  opts: FindSimilarOptions = {},
): Promise<SimilarEntity[]> {
  assertRole(deps.ctx, "reader");
  const limit = opts.limit ?? 10;
  const minTrust = opts.minTrust ?? 0.3;
  const start = Date.now();
  try {
    const row = await deps.sql<Array<{ embedding: string }>>`
      SELECT embedding::text AS embedding
      FROM kg_embeddings
      WHERE node_id = ${entityId}
      LIMIT 1
    `;
    if (row.length === 0) {
      await writeAuditEntry(deps.sql, {
        actorKind: deps.ctx.actorKind, actorId: deps.ctx.actorId,
        tool: "findSimilar", targetNodeId: entityId, parameters: { entityId, opts },
        resultSummary: { count: 0, reason: "no embedding for source" },
        latencyMs: Date.now() - start, success: true,
      });
      return [];
    }
    const vec = row[0].embedding;
    const neighbors = await deps.sql<Array<{ node_id: string; distance: number }>>`
      SELECT node_id, embedding <=> ${vec}::vector AS distance
      FROM kg_embeddings
      WHERE node_id <> ${entityId}
      ORDER BY embedding <=> ${vec}::vector
      LIMIT ${limit * 3}
    `;
    if (neighbors.length === 0) return [];
    const ids = neighbors.map((n) => n.node_id);
    const out = await deps.client.read(async (tx) => {
      const r = await tx.run(
        `
        MATCH (n)
        WHERE n.id IN $ids
          AND coalesce(n.prov_trust_score, 0) >= $minTrust
          AND ($scope IS NULL OR n.type IN $scope)
        RETURN n, labels(n) AS labels
        `,
        { ids, scope: opts.scope ?? null, minTrust },
      );
      const byId = new Map<string, Node>();
      for (const rec of r.records) {
        const n = rec.get("n");
        const node = rowToNode(
          n.properties as Record<string, unknown>,
          [...(rec.get("labels") as string[])],
        );
        byId.set(node.id, node);
      }
      const ranked: SimilarEntity[] = [];
      for (const ne of neighbors) {
        const node = byId.get(ne.node_id);
        if (node) ranked.push({ node, score: 1 - Number(ne.distance) });
        if (ranked.length >= limit) break;
      }
      return ranked;
    });
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind, actorId: deps.ctx.actorId,
      tool: "findSimilar", targetNodeId: entityId, parameters: { entityId, opts },
      resultSummary: { count: out.length },
      latencyMs: Date.now() - start, success: true,
    });
    return out;
  } catch (err) {
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind, actorId: deps.ctx.actorId,
      tool: "findSimilar", targetNodeId: entityId, parameters: { entityId, opts },
      latencyMs: Date.now() - start, success: false,
      errorMessage: (err as Error).message,
    });
    throw err;
  }
}
