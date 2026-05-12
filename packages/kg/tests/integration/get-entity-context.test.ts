import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedNeo4j, StartedPostgres } from "@strvx/kg/testing";
import { startNeo4j, startPostgres } from "@strvx/kg/testing";
import { createNeo4jClient, type Neo4jClient } from "../../src/client/neo4j.js";
import { createPostgresClient, type PostgresClient } from "../../src/client/postgres.js";
import { getEntityContext } from "../../src/reads/get-entity-context.js";
import type { AgentContext } from "../../src/types.js";

const ctx: AgentContext = { actorKind: "agent", actorId: "a1", role: "reader" };

describe("getEntityContext", () => {
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
    await client.write(async (tx) => {
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
        CREATE (e:Engagement {id: 'e1', type: 'Engagement', name: 'Project',
          prov_source_type: 'postgres', prov_source_id: 'e1', prov_source_record_id: '1',
          prov_extraction_method: 'cdc', prov_extracted_at: datetime(),
          prov_last_validated_at: datetime(), prov_validation_count: 1,
          prov_confidence: 1, prov_trust_score: 1, prov_created_by: 'cdc'})
        CREATE (p)-[:WORKS_AT {id: 'r1', prov_source_type: 'postgres', prov_source_id: 'r1',
          prov_source_record_id: '1', prov_extraction_method: 'cdc',
          prov_extracted_at: datetime(), prov_last_validated_at: datetime(),
          prov_validation_count: 1, prov_confidence: 1, prov_trust_score: 1,
          prov_created_by: 'cdc'}]->(o)
        CREATE (o)-[:HAS_ENGAGEMENT {id: 'r2', prov_source_type: 'postgres', prov_source_id: 'r2',
          prov_source_record_id: '1', prov_extraction_method: 'cdc',
          prov_extracted_at: datetime(), prov_last_validated_at: datetime(),
          prov_validation_count: 1, prov_confidence: 1, prov_trust_score: 1,
          prov_created_by: 'cdc'}]->(e)
      `);
    });
  }, 120_000);

  afterAll(async () => {
    await sql.end();
    await client.close();
    await pg.stop();
    await n4j.stop();
  });

  it("returns center node + neighbors within depth=1", async () => {
    const c = await getEntityContext({ client, sql, ctx }, "p1", { depth: 1 });
    expect(c.center?.id).toBe("p1");
    expect(c.nodes.map((n) => n.id).sort()).toEqual(["o1", "p1"].sort());
    expect(c.edges.map((e) => e.id)).toContain("r1");
  });

  it("expands to depth=2", async () => {
    const c = await getEntityContext({ client, sql, ctx }, "p1", { depth: 2 });
    const ids = c.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(["e1", "o1", "p1"]);
    expect(c.edges.map((e) => e.id).sort()).toEqual(["r1", "r2"]);
  });
});
