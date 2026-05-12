import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedNeo4j, StartedPostgres } from "@strvx/kg/testing";
import { startNeo4j, startPostgres } from "@strvx/kg/testing";
import { createNeo4jClient, type Neo4jClient } from "../../src/client/neo4j.js";
import { createPostgresClient, type PostgresClient } from "../../src/client/postgres.js";
import { createMockEmbeddingProvider } from "../../src/embedding/mock.js";
import { findEntities } from "../../src/reads/find-entities.js";
import type { AgentContext } from "../../src/types.js";

const ctx: AgentContext = { actorKind: "agent", actorId: "a1", role: "reader" };

describe("findEntities", () => {
  let n4j: StartedNeo4j;
  let pg: StartedPostgres;
  let client: Neo4jClient;
  let sql: PostgresClient;

  beforeAll(async () => {
    n4j = await startNeo4j();
    pg = await startPostgres();
    await pg.sql`CREATE TABLE kg_audit_log (
      id bigint generated always as identity primary key, occurred_at timestamptz not null default now(),
      actor_kind text not null, actor_id text not null, tool text not null,
      target_node_id text, target_edge_id text,
      parameters jsonb, result_summary jsonb, latency_ms integer,
      success boolean not null, error_message text)`;
    await pg.sql`CREATE TABLE kg_embeddings (
      node_id text primary key, model_name text not null, model_version text not null,
      embedding vector(1536) not null, content_hash text not null,
      created_at timestamptz not null default now())`;
    await pg.sql`CREATE INDEX kg_embeddings_ann_idx ON kg_embeddings USING hnsw (embedding vector_cosine_ops)`;
    client = createNeo4jClient({
      uri: n4j.container.getBoltUri(),
      rw: { user: n4j.container.getUsername(), password: n4j.container.getPassword() },
      ro: { user: n4j.container.getUsername(), password: n4j.container.getPassword() },
    });
    sql = createPostgresClient(pg.url);

    const mock = createMockEmbeddingProvider();
    const seeds = [
      { id: "p1", name: "Ada Lovelace", snippet: "mathematician computer pioneer" },
      { id: "p2", name: "Grace Hopper", snippet: "naval officer compiler designer" },
      { id: "p3", name: "Henrietta Leavitt", snippet: "astronomer cepheid variable stars" },
    ];
    for (const s of seeds) {
      await client.write(async (tx) => {
        await tx.run(`
          CREATE (n:Person {
            id: $id, type: 'Person', name: $name, snippet: $snippet,
            prov_source_type: 'postgres', prov_source_id: $id,
            prov_source_record_id: $id, prov_extraction_method: 'cdc',
            prov_extracted_at: datetime(), prov_last_validated_at: datetime(),
            prov_validation_count: 1, prov_confidence: 1.0, prov_trust_score: 1.0,
            prov_created_by: 'cdc'
          })
        `, s);
      });
      const v = await mock.embed(`${s.name} ${s.snippet}`);
      await sql`INSERT INTO kg_embeddings (node_id, model_name, model_version, embedding, content_hash)
                VALUES (${s.id}, 'mock', '0.0.0', ${`[${v.join(",")}]`}::vector, 'h')`;
    }
  }, 120_000);

  afterAll(async () => {
    await sql.end();
    await client.close();
    await pg.stop();
    await n4j.stop();
  });

  it("structured search by entity type returns matching nodes", async () => {
    const r = await findEntities(
      { client, sql, ctx, embedding: createMockEmbeddingProvider() },
      "Ada",
      { mode: "structured", types: ["Person"], limit: 10 },
    );
    expect(r.length).toBeGreaterThan(0);
    expect(r.some((x) => x.node.properties.name === "Ada Lovelace")).toBe(true);
  });

  it("semantic search returns the most similar node first", async () => {
    const r = await findEntities(
      { client, sql, ctx, embedding: createMockEmbeddingProvider() },
      "Ada Lovelace mathematician computer pioneer",
      { mode: "semantic", limit: 3 },
    );
    expect(r[0].node.properties.name).toBe("Ada Lovelace");
  });

  it("hybrid search ranks by combined score", async () => {
    const r = await findEntities(
      { client, sql, ctx, embedding: createMockEmbeddingProvider() },
      "Grace",
      { mode: "hybrid", limit: 3 },
    );
    expect(r[0].node.properties.name).toBe("Grace Hopper");
  });
});
