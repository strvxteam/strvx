import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedNeo4j, StartedPostgres } from "@strvx/kg/testing";
import { startNeo4j, startPostgres } from "@strvx/kg/testing";
import { createNeo4jClient, type Neo4jClient } from "../../src/client/neo4j.js";
import { createPostgresClient, type PostgresClient } from "../../src/client/postgres.js";
import { upsertFromPostgres } from "../../src/writes/upsert-from-postgres.js";
import type { AgentContext } from "../../src/types.js";
import { getNode } from "../../src/reads/get-node.js";

const ctx: AgentContext = { actorKind: "system", actorId: "test", role: "admin" };

describe("upsertFromPostgres", () => {
  let n4j: StartedNeo4j;
  let pg: StartedPostgres;
  let client: Neo4jClient;
  let sql: PostgresClient;

  beforeAll(async () => {
    n4j = await startNeo4j();
    pg = await startPostgres();
    await pg.sql`CREATE TABLE kg_audit_log (
      id bigint generated always as identity primary key,
      occurred_at timestamptz not null default now(),
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
  }, 180_000);

  afterAll(async () => {
    await sql.end();
    await client.close();
    await pg.stop();
    await n4j.stop();
  });

  it("inserts a company as an Organization node", async () => {
    const res = await upsertFromPostgres(
      { client, sql, ctx },
      {
        kind: "insert",
        table: "companies",
        row: { id: "co-1", name: "Acme Corp", industry: "SaaS", created_at: "2026-01-01" },
        lsn: "0/1A2B3C0",
      },
    );
    expect(res.action).toBe("upserted");
    expect(res.nodeId).toBe("postgres:companies:co-1");
    const node = await getNode({ client, sql, ctx }, "postgres:companies:co-1");
    expect(node?.type).toBe("Organization");
    expect(node?.properties.name).toBe("Acme Corp");
    expect(node?.provenance.source_type).toBe("postgres");
  });

  it("re-running the same insert is idempotent (no duplicate)", async () => {
    await upsertFromPostgres(
      { client, sql, ctx },
      {
        kind: "insert",
        table: "companies",
        row: { id: "co-1", name: "Acme Corp", industry: "SaaS", created_at: "2026-01-01" },
        lsn: "0/1A2B3C0",
      },
    );
    const count = await client.read(async (tx) => {
      const r = await tx.run("MATCH (n {id: 'postgres:companies:co-1'}) RETURN count(n) AS c");
      return r.records[0].get("c") as number;
    });
    expect(count).toBe(1);
  });

  it("inserts a contact with WORKS_AT edge to existing company", async () => {
    const res = await upsertFromPostgres(
      { client, sql, ctx },
      {
        kind: "insert",
        table: "contacts",
        row: {
          id: "ct-1",
          company_id: "co-1",
          name: "Ada Lovelace",
          email: "ada@acme.com",
        },
        lsn: "0/1A2B3D0",
      },
    );
    expect(res.action).toBe("upserted");
    expect(res.edgeIds).toHaveLength(1);
    const edge = await client.read(async (tx) => {
      const r = await tx.run(
        "MATCH (p {id: 'postgres:contacts:ct-1'})-[r:WORKS_AT]->(o {id: 'postgres:companies:co-1'}) RETURN r.id AS id",
      );
      return r.records[0].get("id");
    });
    expect(edge).toBe("postgres:contacts:ct-1:company_id");
  });

  it("inserts a contact whose company doesn't yet exist (creates stub)", async () => {
    await upsertFromPostgres(
      { client, sql, ctx },
      {
        kind: "insert",
        table: "contacts",
        row: { id: "ct-orphan", company_id: "co-future", name: "Orphan" },
        lsn: "0/1A2B3E0",
      },
    );
    const stub = await client.read(async (tx) => {
      const r = await tx.run(
        "MATCH (o {id: 'postgres:companies:co-future'}) RETURN o.is_stub AS isStub, o.type AS type",
      );
      return r.records[0];
    });
    expect(stub.get("isStub")).toBe(true);
    expect(stub.get("type")).toBe("Unknown");
  });

  it("upgrades a stub when the real row arrives", async () => {
    await upsertFromPostgres(
      { client, sql, ctx },
      {
        kind: "insert",
        table: "companies",
        row: { id: "co-future", name: "Future Co" },
        lsn: "0/1A2B3F0",
      },
    );
    const node = await getNode({ client, sql, ctx }, "postgres:companies:co-future");
    expect(node?.type).toBe("Organization");
    expect(node?.properties.is_stub).toBe(false);
    expect(node?.properties.name).toBe("Future Co");
  });

  it("stub→upgrade lifecycle preserves identity and corrects labels", async () => {
    // 1. Insert a contact whose company is unseen — creates co-lifecycle as a stub
    //    via the WORKS_AT edge MERGE.
    await upsertFromPostgres(
      { client, sql, ctx },
      {
        kind: "insert",
        table: "contacts",
        row: { id: "ct-lifecycle", company_id: "co-lifecycle", name: "Grace Hopper" },
        lsn: "0/1A2B3E1",
      },
    );

    // 2. Capture stub state BEFORE upgrade.
    const before = await client.read(async (tx) => {
      const r = await tx.run(
        `MATCH (n {id: 'postgres:companies:co-lifecycle'})
         RETURN elementId(n) AS eid, labels(n) AS labels,
                n.is_stub AS isStub, n.type AS type,
                n.prov_confidence AS conf, n.name AS name`,
      );
      return r.records[0];
    });
    const beforeEid = before.get("eid") as string;
    expect(before.get("labels")).toEqual(["StubNode"]);
    expect(before.get("isStub")).toBe(true);
    expect(before.get("type")).toBe("Unknown");
    expect(before.get("conf")).toBe(0.5);
    expect(before.get("name")).toBeNull();

    // 3. Send the real companies row for co-lifecycle.
    await upsertFromPostgres(
      { client, sql, ctx },
      {
        kind: "insert",
        table: "companies",
        row: { id: "co-lifecycle", name: "Lifecycle Co" },
        lsn: "0/1A2B3E2",
      },
    );

    // 4. Verify AFTER upgrade: same elementId, labels swapped, properties updated.
    const after = await client.read(async (tx) => {
      const r = await tx.run(
        `MATCH (n {id: 'postgres:companies:co-lifecycle'})
         RETURN elementId(n) AS eid, labels(n) AS labels,
                n.is_stub AS isStub, n.type AS type,
                n.prov_confidence AS conf, n.name AS name`,
      );
      return r.records[0];
    });
    expect(after.get("eid")).toBe(beforeEid); // identity preserved (MERGE not CREATE)
    expect(after.get("labels")).toEqual(["Organization"]); // :StubNode removed
    expect(after.get("isStub")).toBe(false);
    expect(after.get("type")).toBe("Organization");
    expect(after.get("name")).toBe("Lifecycle Co");
    expect(after.get("conf")).toBe(1.0); // mapping.confidence ?? 1.0

    // 5. Idempotency: re-running the same upsert must not churn labels.
    await upsertFromPostgres(
      { client, sql, ctx },
      {
        kind: "insert",
        table: "companies",
        row: { id: "co-lifecycle", name: "Lifecycle Co" },
        lsn: "0/1A2B3E3",
      },
    );
    const again = await client.read(async (tx) => {
      const r = await tx.run(
        `MATCH (n {id: 'postgres:companies:co-lifecycle'})
         RETURN elementId(n) AS eid, labels(n) AS labels`,
      );
      return r.records[0];
    });
    expect(again.get("eid")).toBe(beforeEid);
    expect(again.get("labels")).toEqual(["Organization"]);
  });

  it("delete removes the node and its edges (DETACH DELETE)", async () => {
    await upsertFromPostgres(
      { client, sql, ctx },
      {
        kind: "delete",
        table: "contacts",
        row: {},
        oldKeys: { id: "ct-1" },
        lsn: "0/1A2B400",
      },
    );
    const node = await getNode({ client, sql, ctx }, "postgres:contacts:ct-1");
    expect(node).toBeNull();
  });

  it("unmapped table is skipped (noop) with audit entry", async () => {
    const res = await upsertFromPostgres(
      { client, sql, ctx },
      {
        kind: "insert",
        table: "irrelevant_table",
        row: { id: "x" },
        lsn: "0/1A2B500",
      },
    );
    expect(res.action).toBe("noop");
    const audit =
      await sql`SELECT * FROM kg_audit_log WHERE result_summary->>'reason' = 'unmapped table' ORDER BY id DESC LIMIT 1`;
    expect(audit.length).toBe(1);
  });
});
