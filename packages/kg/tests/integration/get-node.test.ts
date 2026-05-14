import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedNeo4j, StartedPostgres } from "@strvx/kg/testing";
import { startNeo4j, startPostgres } from "@strvx/kg/testing";
import { createNeo4jClient, type Neo4jClient } from "../../src/client/neo4j.js";
import { createPostgresClient, type PostgresClient } from "../../src/client/postgres.js";
import { getEdge, getNode } from "../../src/reads/get-node.js";
import { getProvenance } from "../../src/reads/get-provenance.js";
import type { AgentContext } from "../../src/types.js";

const ctx: AgentContext = { actorKind: "agent", actorId: "a1", role: "reader" };

describe("getNode / getEdge / getProvenance", () => {
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
      success boolean not null, error_message text
    )`;
    client = createNeo4jClient({
      uri: n4j.container.getBoltUri(),
      rw: { user: n4j.container.getUsername(), password: n4j.container.getPassword() },
      ro: { user: n4j.container.getUsername(), password: n4j.container.getPassword() },
    });
    sql = createPostgresClient(pg.url);
    await client.unsafeWrite(async (tx) => {
      await tx.run(`
        CREATE (p:Person {
          id: 'postgres:contact:1', type: 'Person', name: 'Ada',
          prov_source_type: 'postgres', prov_source_id: 'pg:contact:1',
          prov_source_record_id: '1', prov_extraction_method: 'cdc',
          prov_extracted_at: datetime(), prov_last_validated_at: datetime(),
          prov_validation_count: 1, prov_confidence: 1.0, prov_trust_score: 1.0,
          prov_created_by: 'cdc'
        })
        CREATE (o:Organization {
          id: 'postgres:company:1', type: 'Organization', name: 'Acme',
          prov_source_type: 'postgres', prov_source_id: 'pg:company:1',
          prov_source_record_id: '1', prov_extraction_method: 'cdc',
          prov_extracted_at: datetime(), prov_last_validated_at: datetime(),
          prov_validation_count: 1, prov_confidence: 1.0, prov_trust_score: 1.0,
          prov_created_by: 'cdc'
        })
        CREATE (p)-[r:WORKS_AT {
          id: 'rel:1', prov_source_type: 'postgres', prov_source_id: 'pg:rel:1',
          prov_source_record_id: '1', prov_extraction_method: 'cdc',
          prov_extracted_at: datetime(), prov_last_validated_at: datetime(),
          prov_validation_count: 1, prov_confidence: 1.0, prov_trust_score: 1.0,
          prov_created_by: 'cdc'
        }]->(o)
      `);
    });
  }, 120_000);

  afterAll(async () => {
    await sql.end();
    await client.close();
    await pg.stop();
    await n4j.stop();
  });

  it("getNode returns a node with parsed provenance", async () => {
    const node = await getNode({ client, sql, ctx }, "postgres:contact:1");
    expect(node?.type).toBe("Person");
    expect(node?.properties.name).toBe("Ada");
    expect(node?.provenance.source_type).toBe("postgres");
    expect(node?.provenance.trust_score).toBe(1);
  });

  it("getNode returns null for missing id", async () => {
    const node = await getNode({ client, sql, ctx }, "postgres:contact:404");
    expect(node).toBeNull();
  });

  it("getEdge returns an edge with provenance", async () => {
    const edge = await getEdge({ client, sql, ctx }, "rel:1");
    expect(edge?.type).toBe("WORKS_AT");
    expect(edge?.from).toBe("postgres:contact:1");
    expect(edge?.to).toBe("postgres:company:1");
  });

  it("getProvenance returns provenance for a node id", async () => {
    const prov = await getProvenance({ client, sql, ctx }, "postgres:contact:1");
    expect(prov?.source_type).toBe("postgres");
  });
});
