import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedNeo4j, StartedPostgres } from "@strvx/kg/testing";
import { startNeo4j, startPostgres } from "@strvx/kg/testing";
import { createNeo4jClient, type Neo4jClient } from "../../src/client/neo4j.js";
import { createPostgresClient, type PostgresClient } from "../../src/client/postgres.js";
import { traverse } from "../../src/reads/traverse.js";
import type { AgentContext } from "../../src/types.js";

const ctx: AgentContext = { actorKind: "agent", actorId: "a1", role: "reader" };

describe("traverse", () => {
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
    client = createNeo4jClient({
      uri: n4j.container.getBoltUri(),
      rw: { user: n4j.container.getUsername(), password: n4j.container.getPassword() },
      ro: { user: n4j.container.getUsername(), password: n4j.container.getPassword() },
    });
    sql = createPostgresClient(pg.url);
    await client.unsafeWrite(async (tx) => {
      await tx.run(`
        CREATE (p:Person {id: 'p1', type: 'Person', name: 'Ada',
          prov_source_type: 'postgres', prov_source_id: 'p1', prov_source_record_id: '1',
          prov_extraction_method: 'cdc', prov_extracted_at: datetime(),
          prov_last_validated_at: datetime(), prov_validation_count: 1,
          prov_confidence: 1, prov_trust_score: 1, prov_created_by: 'cdc'})
        CREATE (o:Organization {id: 'o1', type: 'Organization', name: 'Acme',
          prov_source_type: 'postgres', prov_source_id: 'o1', prov_source_record_id: '1',
          prov_extraction_method: 'cdc', prov_extracted_at: datetime(),
          prov_last_validated_at: datetime(), prov_validation_count: 1,
          prov_confidence: 1, prov_trust_score: 1, prov_created_by: 'cdc'})
        CREATE (p)-[:WORKS_AT {id: 'r1', prov_source_type: 'postgres', prov_source_id: 'r1',
          prov_source_record_id: '1', prov_extraction_method: 'cdc',
          prov_extracted_at: datetime(), prov_last_validated_at: datetime(),
          prov_validation_count: 1, prov_confidence: 1, prov_trust_score: 1,
          prov_created_by: 'cdc'}]->(o)
      `);
    });
  }, 120_000);

  afterAll(async () => {
    await sql.end();
    await client.close();
    await pg.stop();
    await n4j.stop();
  });

  it("traverses by relationship type, outgoing direction, depth=1", async () => {
    const r = await traverse(
      { client, sql, ctx },
      "p1",
      { relationshipTypes: ["WORKS_AT"], direction: "outgoing", maxDepth: 1 },
    );
    expect(r.nodes.find((n) => n.id === "o1")).toBeDefined();
    const edge = r.edges.find((e) => e.id === "r1");
    expect(edge).toBeDefined();
    expect(edge?.from).toBe("p1");
    expect(edge?.to).toBe("o1");
  });
});
