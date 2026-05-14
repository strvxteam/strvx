import type { Neo4jClient } from "../client/neo4j";
import type { PostgresClient } from "../client/postgres";
import type { EmbeddingProvider } from "../embedding/provider";
import { writeAuditEntry } from "../audit/writer";
import { assertRole } from "../auth/middleware";
import { rowToNode } from "./get-node";
import type { AgentContext, EntityType, Node } from "../types";

export interface FindEntitiesDeps {
  client: Neo4jClient;
  sql: PostgresClient;
  ctx: AgentContext;
  embedding: EmbeddingProvider;
}

export interface FindEntitiesOptions {
  mode?: "structured" | "semantic" | "hybrid";
  types?: EntityType[];
  limit?: number;
  minTrust?: number;
}

export interface SearchResult {
  node: Node;
  score: number;
}

export async function findEntities(
  deps: FindEntitiesDeps,
  query: string,
  opts: FindEntitiesOptions = {},
): Promise<SearchResult[]> {
  assertRole(deps.ctx, "reader");
  const mode = opts.mode ?? "hybrid";
  const limit = opts.limit ?? 20;
  const minTrust = opts.minTrust ?? 0.3;
  const start = Date.now();
  try {
    const out =
      mode === "structured"
        ? await structured(deps, query, opts.types, limit, minTrust)
        : mode === "semantic"
          ? await semantic(deps, query, opts.types, limit, minTrust)
          : await hybrid(deps, query, opts.types, limit, minTrust);
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool: "findEntities",
      parameters: { query, opts },
      resultSummary: { count: out.length, mode },
      latencyMs: Date.now() - start,
      success: true,
    });
    return out;
  } catch (err) {
    await writeAuditEntry(deps.sql, {
      actorKind: deps.ctx.actorKind,
      actorId: deps.ctx.actorId,
      tool: "findEntities",
      parameters: { query, opts },
      latencyMs: Date.now() - start,
      success: false,
      errorMessage: (err as Error).message,
    });
    throw err;
  }
}

async function structured(
  deps: FindEntitiesDeps,
  query: string,
  types: EntityType[] | undefined,
  limit: number,
  minTrust: number,
): Promise<SearchResult[]> {
  // Use a parameterized type filter via Cypher list match, no string interpolation.
  return deps.client.read(async (tx) => {
    const r = await tx.run(
      `
      MATCH (n)
      WHERE ($types IS NULL OR n.type IN $types)
        AND (toLower(coalesce(n.name, '')) CONTAINS toLower($q)
             OR toLower(coalesce(n.snippet, '')) CONTAINS toLower($q)
             OR toLower(coalesce(n.subject, '')) CONTAINS toLower($q))
        AND coalesce(n.prov_trust_score, 0) >= $minTrust
      RETURN n, labels(n) AS labels
      LIMIT toInteger($limit)
      `,
      { q: query, types: types ?? null, minTrust, limit: Math.floor(limit) },
    );
    return r.records.map((rec) => ({
      node: rowToNode(
        rec.get("n").properties as Record<string, unknown>,
        [...(rec.get("labels") as string[])],
      ),
      score: 1,
    }));
  });
}

async function semantic(
  deps: FindEntitiesDeps,
  query: string,
  types: EntityType[] | undefined,
  limit: number,
  minTrust: number,
): Promise<SearchResult[]> {
  const v = await deps.embedding.embed(query);
  const vecLit = `[${v.join(",")}]`;
  const rows = await deps.sql<Array<{ node_id: string; distance: number }>>`
    SELECT node_id, embedding <=> ${vecLit}::vector AS distance
    FROM kg_embeddings
    ORDER BY embedding <=> ${vecLit}::vector
    LIMIT ${limit * 3}
  `;
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.node_id);
  return deps.client.read(async (tx) => {
    const r = await tx.run(
      `
      MATCH (n)
      WHERE n.id IN $ids
        AND coalesce(n.prov_trust_score, 0) >= $minTrust
        AND ($types IS NULL OR n.type IN $types)
      RETURN n, labels(n) AS labels
      `,
      { ids, minTrust, types: types ?? null },
    );
    const byId = new Map<string, Node>();
    for (const rec of r.records) {
      const n = rec.get("n");
      const node = rowToNode(n.properties as Record<string, unknown>, [...(rec.get("labels") as string[])]);
      byId.set(node.id, node);
    }
    const out: SearchResult[] = [];
    for (const row of rows) {
      const node = byId.get(row.node_id);
      // pgvector `<=>` returns cosine distance ∈ [0, 2]; score = 1 - distance
      // maps that to a value in [-1, 1] consistent with cosine similarity,
      // where 1 = identical direction and ≤0 = orthogonal/opposite.
      if (node) out.push({ node, score: 1 - Number(row.distance) });
      if (out.length >= limit) break;
    }
    return out;
  });
}

async function hybrid(
  deps: FindEntitiesDeps,
  query: string,
  types: EntityType[] | undefined,
  limit: number,
  minTrust: number,
): Promise<SearchResult[]> {
  const [s, m] = await Promise.all([
    structured(deps, query, types, limit, minTrust),
    semantic(deps, query, types, limit, minTrust),
  ]);
  // Reciprocal rank fusion (k=60)
  const k = 60;
  const rrf = new Map<string, { node: Node; score: number }>();
  function fold(results: SearchResult[]) {
    results.forEach((r, i) => {
      const cur = rrf.get(r.node.id);
      const contrib = 1 / (k + i + 1);
      if (cur) cur.score += contrib;
      else rrf.set(r.node.id, { node: r.node, score: contrib });
    });
  }
  fold(s);
  fold(m);
  return [...rrf.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
