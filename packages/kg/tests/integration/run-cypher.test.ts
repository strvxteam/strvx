import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedNeo4j, StartedPostgres } from "@strvx/kg/testing";
import { startNeo4j, startPostgres } from "@strvx/kg/testing";
import { createNeo4jClient, type Neo4jClient } from "../../src/client/neo4j.js";
import { createPostgresClient, type PostgresClient } from "../../src/client/postgres.js";
import { runCypher } from "../../src/cypher/run.js";
import { CypherWriteAttemptError } from "../../src/cypher/validate.js";
import type { AgentContext } from "../../src/types.js";

const reader: AgentContext = { actorKind: "agent", actorId: "a1", role: "reader" };

describe("runCypher", () => {
  let n4j: StartedNeo4j;
  let pg: StartedPostgres;
  let client: Neo4jClient;
  let sql: PostgresClient;

  beforeAll(async () => {
    n4j = await startNeo4j();
    pg = await startPostgres();
    await pg.sql`
      CREATE TABLE kg_audit_log (
        id bigint generated always as identity primary key,
        occurred_at timestamptz not null default now(),
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
    // seed a node
    await client.unsafeWrite(async (tx) => {
      await tx.run("CREATE (n:Person {id: 'p1', name: 'Ada'})");
    });
  }, 120_000);

  afterAll(async () => {
    await sql.end();
    await client.close();
    await pg.stop();
    await n4j.stop();
  });

  it("returns rows for a read query", async () => {
    const res = await runCypher(
      { client, sql, ctx: reader },
      "MATCH (n:Person {id: $id}) RETURN n.name AS name",
      { id: "p1" },
    );
    expect(res.records[0].name).toBe("Ada");
  });

  it("rejects writes before hitting Neo4j", async () => {
    await expect(
      runCypher(
        { client, sql, ctx: reader },
        "CREATE (n:Person {id: 'p2'}) RETURN n",
        {},
      ),
    ).rejects.toThrow(CypherWriteAttemptError);
  });

  it("writes an audit entry on success", async () => {
    await runCypher({ client, sql, ctx: reader }, "RETURN 1 AS one", {});
    const rows = await sql`SELECT * FROM kg_audit_log WHERE tool = 'runCypher' AND success = true`;
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("writes an audit entry on rejected write", async () => {
    try {
      await runCypher({ client, sql, ctx: reader }, "CREATE (n) RETURN n", {});
    } catch { /* expected */ }
    const rows = await sql`SELECT * FROM kg_audit_log WHERE tool = 'runCypher' AND success = false`;
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
